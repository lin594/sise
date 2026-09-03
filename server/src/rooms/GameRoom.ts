import { Room, Client } from "@colyseus/core";
import { GameState, PlayerState, CardSchema } from "../schema/game-state.schema.js";
import { createDeck, isDiscardRestricted, shuffle } from "../rules/deck.js";
import type { ActionType, Card } from "../rules/types.js";
import { tryExecuteChi } from "./flow/actions/chi.js";
import { tryExecuteKai } from "./flow/actions/kai.js";
import { tryExecutePeng } from "./flow/actions/peng.js";
import { buildChiCandidates, buildKaiCandidates, buildPengCandidates } from "./flow/action-candidates.js";
import { executeResponseWinner } from "./flow/response-winner.js";
import { applyDebugScenario as applyDebugScenarioFlow } from "./flow/debug-scenarios.js";
import {
  areAllDeclarationsReady as areAllDeclarationsReadyUtil,
  buildDefaultDeclarationPayload,
  buildDeclarationSelection,
  buildRoundResultPlayers as buildRoundResultPlayersFlow,
  canReturnLobby,
  canStartNextRound,
  dealInitialHands as dealInitialHandsFlow,
  decideStartGame,
  endRoundFlow,
  chooseBotDisplayName,
  makeUniqueHumanName,
  reclaimSeatStateFlow,
  resetRoundPlayers as resetRoundPlayersFlow,
  resetToLobby,
  runDeclaringTimeoutFlow,
  startDeclaringFlow,
  type RoundResultPlayer,
} from "./flow/match-runtime.js";
import {
  applyCollectivePollState,
  applyEnterDiscardStageState,
  applyPlayingStartAfterDeclaring,
  applyTurnTransitionState,
  buildHuSummaryBySeat,
  canAcceptDiscardRequest,
  createPendingResponse,
  generateToken as generateTokenUtil,
  getCollectiveOrder,
  getNextPlayerId as getNextPlayerIdOrder,
  getPreviousPlayerId as getPreviousPlayerIdOrder,
  normalizeAction as normalizeActionUtil,
  normalizeDiscardCardId,
  normalizeName as normalizeNameUtil,
  normalizeToken as normalizeTokenUtil,
  planLocalPhaseAfterNoResponse,
  pickRandomDealerId as pickRandomDealerIdUtil,
  resolveDealerFromAnchorAndCard,
  shouldEndDrawAfterUpperPass,
  shouldLogStateSnapshot as shouldLogStateSnapshotUtil,
  summarizeAllPlayersCards,
  summarizeCards,
} from "./flow/support.js";
import {
  decideActionDispatch,
  type AvailableActionEntry,
  getAvailableActionsFlow,
  enterOwnerLocalPhaseAfterNoResponseFlow,
  executeEatFlow,
  executeGrabFlow,
  executePassToNextFlow,
  advanceToNextOwnerFlow,
  beginCollectiveFromDiscardFlow,
  discardFromAndCollectiveFlow,
  drawForOwnerFlow,
  enterDiscardStageFlow,
  resolveCollectivePhaseFlow,
  resolveLocalDrawIdleAction,
  planTickBots,
  runBotStep,
  startCollectiveFlow,
  advanceCollectiveFlow,
} from "./flow/playing-flow.js";
import { createRoomStateOps, syncAllPrivateHands as syncAllPrivateHandsFlow, type RoomStateOps } from "./flow/room-state-ops.js";
import { registerRoom, unregisterRoom, type PrivateStateSnapshot } from "./room-registry.js";
import { chooseBotAction, chooseBotDiscard } from "./bot-strategy.js";

interface PendingResponse {
  ownerId: string;
  card: Card;
  collectives: Map<string, { action: ActionType; candidateId?: string }>;
  responsePhaseAfterNoResponse?: "local_upper" | "local_draw";
}

type ActionRequest =
  | ActionType
  | {
      action: ActionType;
      candidateId?: string;
    };

interface DeclareSetupPayload {
  declaredKongs?: number;
  fishCardIds?: string[];
}

interface RoomCreateOptions {
  roomMode?: "practice" | "friends";
  hostKey?: string;
}

interface RoomJoinOptions {
  name?: string;
  playerToken?: string;
  hostKey?: string;
}

type RoundBootstrapSetup =
  | { mode: "picker"; pickerId: string }
  | { mode: "fixed"; dealerId: string };

type HuLogMode = "off" | "all" | "success" | "fail";
type StateLogMode = "off" | "all" | "compact";

const COMPACT_STATE_ACTIONS = new Set<string>([
  "LOBBY",
  "RECONNECT_WAIT",
  "TAKEOVER",
  "DEALER",
  "TURN_START",
  "KONG_DRAW",
  "DISCARD",
  "KAI",
  "PENG",
  "CHI",
  "PASS",
  "NO_DISCARD",
  "NO_RESPONSE",
  "HU",
  "HU_INVALID",
  "DECK_EMPTY",
  "DRAW_GAME",
]);

export const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
export const DEFAULT_DECLARE_TIMEOUT_MS = 45_000;
export const DEFAULT_RECONNECT_GRACE_MS = 5_000;
export const DEFAULT_TIME_EXTENSION_MS = 20_000;

export function isDebugScenarioFeatureEnabled(nodeEnv: unknown, rawFlag: unknown): boolean {
  return String(nodeEnv ?? "").trim().toLowerCase() !== "production" && String(rawFlag ?? "").trim() === "1";
}

export function canUseDebugScenario(enabled: boolean, seatId: string | undefined, hostPlayerId: string): boolean {
  return enabled && Boolean(seatId) && seatId === hostPlayerId;
}

export class FourColorGameRoom extends Room<{ state: GameState }> {
  maxClients = 8;
  autoDispose = false;

  private readonly minPlayersToStart = Math.max(1, Number(process.env.MIN_PLAYERS ?? 1));
  private readonly targetSeats = 4;

  private deck: Card[] = [];
  private playerHands = new Map<string, Card[]>(); // seatId -> cards
  private playerOrder: string[] = []; // seatIds in round order
  private botIds = new Set<string>(); // currently bot-controlled seatIds
  private configuredBotIds = new Set<string>(); // seats intentionally occupied by lobby bots
  private seatBySession = new Map<string, string>(); // sessionId -> seatId
  private seatByToken = new Map<string, string>(); // token -> seatId
  private baseNameBySeat = new Map<string, string>(); // seatId -> human display name
  private pendingNameBySession = new Map<string, string>(); // connected lobby guests that have not claimed a seat
  private pendingTokenBySession = new Map<string, string>(); // preserves a guest's room-scoped token until seat claim
  private readonly seatDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly takeoverTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private roomIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private hostKey = "";
  private hostKeyConsumed = false;
  private pendingResponse: PendingResponse | null = null;
  private publicGeneralPool: Card[] = [];
  private dealerCard: Card | null = null;
  private dealerPickerId: string | null = null;
  private nextRoundSetup: RoundBootstrapSetup | null = null;
  private awaitingDiscardOwnerId: string | null = null;
  private readonly botThinkMinMs = Math.max(
    0,
    Number(process.env.BOT_THINK_MIN_MS ?? process.env.BOT_THINK_MS ?? 1800),
  );
  private readonly botThinkMaxMs = Math.max(
    this.botThinkMinMs,
    Number(process.env.BOT_THINK_MAX_MS ?? this.botThinkMinMs + 1400),
  );
  private readonly operationTimeoutMs = Math.max(
    1000,
    Number(process.env.OP_TIMEOUT_MS ?? DEFAULT_OPERATION_TIMEOUT_MS),
  );
  private readonly collectiveTimeoutMs = Math.max(
    1000,
    Number(process.env.COLLECTIVE_TIMEOUT_MS ?? this.operationTimeoutMs),
  );
  private readonly localTimeoutMs = Math.max(1000, Number(process.env.LOCAL_TIMEOUT_MS ?? this.operationTimeoutMs));
  private readonly localTransitionDelayMs = Math.max(0, Number(process.env.LOCAL_TRANSITION_DELAY_MS ?? 5000));
  private readonly dealerPickIntroMs = Math.max(0, Number(process.env.DEALER_PICK_INTRO_MS ?? 1100));
  private readonly dealerRevealIntroMs = Math.max(0, Number(process.env.DEALER_REVEAL_INTRO_MS ?? 1200));
  private readonly openingDealDelayMs = Math.max(0, Number(process.env.OPENING_DEAL_DELAY_MS ?? 3200));
  private readonly declareTimeoutMs = Math.max(
    1000,
    Number(process.env.DECLARE_TIMEOUT_MS ?? DEFAULT_DECLARE_TIMEOUT_MS),
  );
  private readonly timeExtensionMs = Math.min(
    60_000,
    Math.max(5_000, Number(process.env.TIME_EXTENSION_MS ?? DEFAULT_TIME_EXTENSION_MS)),
  );
  private readonly lobbySeatHoldMs = Math.max(1000, Number(process.env.LOBBY_SEAT_HOLD_MS ?? 60000));
  private readonly waitingRoomIdleMs = Math.max(1000, Number(process.env.WAITING_ROOM_IDLE_MS ?? 60000));
  private readonly activeRoomIdleMs = Math.max(1000, Number(process.env.ACTIVE_ROOM_IDLE_MS ?? 300000));
  private readonly reconnectGraceMs = Math.max(
    0,
    Number(process.env.RECONNECT_GRACE_MS ?? DEFAULT_RECONNECT_GRACE_MS),
  );
  private readonly debugScenariosEnabled = isDebugScenarioFeatureEnabled(
    process.env.NODE_ENV,
    process.env.ENABLE_DEBUG_SCENARIOS,
  );
  private readonly logEnabled = (process.env.ROOM_LOG ?? "1") !== "0";
  private readonly traceEnabled = (process.env.ROOM_TRACE ?? "0") === "1";
  private readonly traceCards = (process.env.ROOM_TRACE_CARDS ?? "0") === "1";
  private readonly roomLogCards = (process.env.ROOM_LOG_CARDS ?? "0") === "1";
  private readonly huLogEnabled = (process.env.HU_LOG ?? "1") !== "0";
  private readonly huLogCards = (process.env.HU_LOG_CARDS ?? "0") !== "0";
  private readonly huLogMode: HuLogMode =
    ((process.env.HU_LOG_MODE ?? "success") as HuLogMode) || "success";
  private readonly stateLogMode: StateLogMode =
    ((process.env.ROOM_STATE_LOG_MODE ?? "compact") as StateLogMode) || "compact";
  private lastTerminalFingerprint = "";
  private readonly huLogDedup = new Set<string>();
  private huChecksTotal = 0;
  private huChecksValid = 0;
  private readonly huChecksBySeat = new Map<string, { total: number; valid: number }>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private declareTimer: ReturnType<typeof setTimeout> | null = null;
  private declareIntroTimer: ReturnType<typeof setTimeout> | null = null;
  private declareIntroStageTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly pendingFishDeclarations = new Map<string, Card[]>();
  private collectiveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly declareTimeExtensionUsedBy = new Set<string>();
  private responseTimeExtensionUsed = false;
  private declareTimerTotalMs = 0;
  private responseTimerTotalMs = 0;
  private declareDecisionWindowId = 0;
  private responseDecisionWindowId = 0;
  private collectiveQueue: string[] = [];
  private collectiveCursor = 0;
  private collectiveResponderId: string | null = null;
  private debugSeq = 0;
  private roundDealerId: string | null = null;
  private lastRoundResult: {
    winnerId: string | null;
    groups: string[];
    players: RoundResultPlayer[];
    remainingDeck: Card[];
  } | null = null;
  private stateOps: RoomStateOps | null = null;

  private get ops(): RoomStateOps {
    if (!this.stateOps) {
      this.stateOps = createRoomStateOps(this.state, this.playerHands, () => this.pendingResponse?.ownerId ?? null);
    }
    return this.stateOps;
  }

  /**
   * 作用：房间创建入口，注册消息路由并初始化状态容器。
   * 关键输入/输出：无入参；输出为事件监听完成的房间实例。
   * 副作用：创建 `GameState`、初始化 `stateOps`、绑定所有消息处理器。
   */
  onCreate(options: RoomCreateOptions = {}): void {
    this.setState(new GameState());
    this.state.roomMode = options.roomMode === "friends" ? "friends" : "practice";
    this.hostKey = String(options.hostKey ?? "").trim();
    this.stateOps = createRoomStateOps(this.state, this.playerHands, () => this.pendingResponse?.ownerId ?? null);
    this.syncRoomMetadata();
    registerRoom(this.roomId, this);

    this.onMessage("start_game", (client) => {
      this.handleStartGame(client);
    });

    this.onMessage("next_round", (client) => {
      this.handleNextRound(client);
    });

    this.onMessage("return_lobby", (client) => {
      this.handleReturnLobby(client);
    });

    this.onMessage("claim_seat", (client, payload: { seatIndex?: number }) => {
      this.handleClaimSeat(client, payload);
    });

    this.onMessage("add_bot", (client, payload: { seatIndex?: number; strength?: number }) => {
      this.handleAddBot(client, payload);
    });

    this.onMessage("fill_bots", (client) => {
      this.handleFillBots(client);
    });

    this.onMessage("update_bot", (client, payload: { seatIndex?: number; strength?: number }) => {
      this.handleUpdateBot(client, payload);
    });

    this.onMessage("remove_seat", (client, payload: { seatIndex?: number }) => {
      this.handleRemoveSeat(client, payload);
    });

    this.onMessage("declare_kongs", (client, value: number) => {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId || this.state.phase !== "declaring") {
        return;
      }
      this.submitDeclaration(seatId, { declaredKongs: value, fishCardIds: [] });
    });

    this.onMessage("declare_setup", (client, payload: DeclareSetupPayload) => {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId || this.state.phase !== "declaring") {
        return;
      }
      this.submitDeclaration(seatId, payload ?? {});
    });

    this.onMessage("request_more_time", (client, payload: { decisionKey?: unknown } | undefined) => {
      this.handleRequestMoreTime(client, payload);
    });

    this.onMessage("action", (client, payload: ActionRequest) => {
      this.handleAction(client, payload);
    });

    this.onMessage("discard_card", (client, payload: { cardId?: string } | string) => {
      this.handleDiscardCard(client, payload);
    });

    this.onMessage("sync_state", (client) => {
      this.syncClientState(client);
    });

    if (this.debugScenariosEnabled) {
      this.onMessage("debug_setup", (client, scenario: string) => {
        const seatId = this.seatBySession.get(client.sessionId);
        const ok = canUseDebugScenario(this.debugScenariosEnabled, seatId, this.state.hostPlayerId)
          ? this.applyDebugScenario(seatId!, scenario)
          : false;
        client.send("debug_applied", {
          scenario,
          ok,
          ts: Date.now(),
          actions: ok && seatId ? this.getAvailableActions(seatId) : [],
        });
      });
    }

    // HTTP room creation and the WebSocket join are separate requests. Keep the
    // room available for the configured grace period, but do not leak a room
    // forever when the browser closes before completing the join.
    this.scheduleRoomIdleIfEmpty();
  }

  /**
   * 作用：玩家加入入口，处理新进房与 token 重连。
   * 关键输入/输出：输入客户端和 join 参数；输出为座位分配或拒绝结果。
   * 副作用：更新 seat 映射、玩家信息、大厅动作面板。
   */
  onJoin(client: Client, options: RoomJoinOptions): void {
    this.clearRoomIdleTimer();
    const inputName = normalizeNameUtil(options?.name);
    const inputToken = normalizeTokenUtil(options?.playerToken);

    if (inputToken && this.seatByToken.has(inputToken)) {
      const seatId = this.seatByToken.get(inputToken)!;
      this.reclaimSeat(client, seatId, inputToken, inputName);
      return;
    }

    if (this.state.phase !== "waiting") {
      client.send("join_error", { message: "游戏已开始，当前仅支持重连玩家进入。" });
      client.leave(4100);
      return;
    }

    const inputHostKey = String(options?.hostKey ?? "").trim();
    const mayClaimHostSeat = Boolean(
      !this.hostKeyConsumed && this.hostKey && inputHostKey && inputHostKey === this.hostKey,
    );
    if (mayClaimHostSeat) {
      this.hostKeyConsumed = true;
      this.pendingNameBySession.set(client.sessionId, inputName);
      this.claimSeatForClient(client, 0, inputToken || generateTokenUtil());
      return;
    }

    // Legacy/practice rooms keep their one-click behavior. Friend-room invitees
    // deliberately remain unseated until they choose one of the four positions.
    if (this.state.roomMode === "practice") {
      const hasReservedHumanSeat = [...this.state.players.values()].some(
        (player) => !player.isConfiguredBot,
      );
      if (hasReservedHumanSeat) {
        client.send("join_error", {
          message: "这是单人练习房，已有玩家在练习。请返回首页重新开始。",
        });
        client.leave(4106, "practice room already has a human seat");
        this.scheduleRoomIdleIfEmpty();
        return;
      }
      const firstEmpty = this.findFirstEmptySeatIndex();
      if (firstEmpty < 0) {
        client.send("join_error", { message: "房间已满。" });
        client.leave(4101);
        return;
      }
      this.pendingNameBySession.set(client.sessionId, inputName);
      this.claimSeatForClient(client, firstEmpty, inputToken || generateTokenUtil());
      return;
    }

    this.pendingNameBySession.set(client.sessionId, inputName || "玩家");
    this.pendingTokenBySession.set(client.sessionId, inputToken || generateTokenUtil());
    client.send("lobby_presence", { roomId: this.roomId, seated: false });
    this.broadcastAvailableActions();
  }

  /**
   * 作用：玩家离开入口，执行托管接管或空房重置。
   * 关键输入/输出：输入离开客户端；输出无返回值。
   * 副作用：更新在线态与 botIds，必要时重置到 fresh lobby。
   */
  onLeave(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    this.pendingNameBySession.delete(client.sessionId);
    this.pendingTokenBySession.delete(client.sessionId);
    if (!seatId) {
      this.scheduleRoomIdleIfEmpty();
      return;
    }
    this.seatBySession.delete(client.sessionId);

    const player = this.state.players.get(seatId);
    if (!player) {
      return;
    }

    player.connected = false;
    const baseName = this.baseNameBySeat.get(seatId) ?? player.name;
    if (this.state.phase === "waiting") {
      player.isBot = false;
      player.name = baseName;
      this.botIds.delete(seatId);
      this.state.lastAction = `OFFLINE ${seatId}`;
      this.scheduleSeatRelease(seatId);
    } else {
      player.isBot = false;
      player.botStrength = 50;
      player.name = baseName;
      this.botIds.delete(seatId);
      this.state.lastAction = `RECONNECT_WAIT ${seatId}`;
      this.scheduleTemporaryTakeover(seatId);
    }

    if (this.state.hostPlayerId === seatId) {
      this.transferHostToLowestOnlineHuman();
    }

    if (this.state.phase === "playing" || this.state.phase === "declaring") {
      this.tickBots();
    } else {
      this.broadcastAvailableActions();
    }
    this.scheduleRoomIdleIfEmpty();
  }

  onDispose(): void {
    unregisterRoom(this.roomId);
    this.clearBotTimer();
    this.clearDeclareTimer();
    this.clearDeclareIntroTimer();
    this.clearCollectiveTimer();
    this.clearRoomIdleTimer();
    for (const timer of this.seatDisconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.seatDisconnectTimers.clear();
    this.clearAllTakeoverTimers();
  }

  // ===== 房间生命周期与消息入口 =====

  /**
   * 作用：处理 start_game 消息并校验开局条件。
   * 关键输入/输出：输入发起客户端；输出无返回值。
   * 副作用：可能补齐机器人并启动新局。
   */
  private handleStartGame(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (seatId && this.state.phase === "waiting") {
      if (!this.state.hostPlayerId || !this.state.players.has(this.state.hostPlayerId)) {
        this.state.hostPlayerId = seatId;
      }
    }
    const decision = decideStartGame(
      seatId,
      this.state.phase,
      this.state.hostPlayerId,
      this.seatByToken.size,
      this.minPlayersToStart,
    );
    if (!decision.ok && decision.reason === "not_waiting") {
      client.send("join_error", { message: "当前不在等待阶段，无法开始。" });
      return;
    }
    if (!decision.ok && decision.reason === "not_host") {
      client.send("join_error", { message: "仅房主可开始游戏。" });
      return;
    }
    if (!decision.ok && decision.reason === "not_enough_players") {
      client.send("join_error", { message: `至少需要 ${this.minPlayersToStart} 名真人玩家。` });
      return;
    }
    if (!decision.ok) {
      return;
    }

    if (this.state.roomMode === "friends") {
      const problem = this.friendRoomStartProblem();
      if (problem) {
        this.sendLobbyError(client, "cannot_start", problem);
        return;
      }
    } else {
      this.ensureBotSeatsForStart();
    }
    this.removeUnseatedClientsForGameStart();
    this.bootstrapRound();
  }

  /**
   * 作用：处理 next_round 消息，仅 ended 阶段房主可触发。
   * 关键输入/输出：输入发起客户端；输出无返回值。
   * 副作用：可能补齐机器人并重启回合。
   */
  private handleNextRound(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!canStartNextRound(seatId, this.state.phase, this.state.hostPlayerId)) {
      return;
    }
    if (this.state.roomMode === "friends") {
      const problem = this.friendRoomStartProblem();
      if (problem) {
        this.sendLobbyError(client, "cannot_start", problem);
        return;
      }
    } else {
      this.ensureBotSeatsForStart();
    }
    this.bootstrapRound();
  }

  /**
   * 作用：处理 return_lobby 消息，回到等待大厅。
   * 关键输入/输出：输入发起客户端；输出无返回值。
   * 副作用：清理局内运行态并刷新大厅视图。
   */
  private handleReturnLobby(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!canReturnLobby(seatId, this.state.phase) || seatId !== this.state.hostPlayerId) {
      this.sendLobbyError(client, "not_host", "仅房主可让全桌返回大厅。");
      return;
    }
    this.backToLobby();
  }

  private seatIdForIndex(seatIndex: number): string {
    return `seat_${seatIndex}`;
  }

  private seatIndexFromId(seatId: string): number {
    const match = /^seat_([0-3])$/.exec(seatId);
    return match ? Number(match[1]) : -1;
  }

  private normalizeSeatIndex(value: unknown): number | null {
    const seatIndex = Number(value);
    return Number.isInteger(seatIndex) && seatIndex >= 0 && seatIndex < this.targetSeats ? seatIndex : null;
  }

  private normalizeBotStrength(value: unknown): number {
    const strength = Number(value);
    return Math.round(Math.max(0, Math.min(100, Number.isFinite(strength) ? strength : 50)));
  }

  private sortPlayerOrder(): void {
    this.playerOrder.sort((a, b) => this.seatIndexFromId(a) - this.seatIndexFromId(b));
  }

  private findFirstEmptySeatIndex(): number {
    for (let seatIndex = 0; seatIndex < this.targetSeats; seatIndex += 1) {
      if (!this.state.players.has(this.seatIdForIndex(seatIndex))) {
        return seatIndex;
      }
    }
    return -1;
  }

  private sendLobbyError(client: Client, code: string, message: string): void {
    client.send("lobby_error", { code, message });
  }

  private isHostClient(client: Client): boolean {
    return this.seatBySession.get(client.sessionId) === this.state.hostPlayerId;
  }

  private handleClaimSeat(client: Client, payload: { seatIndex?: number }): void {
    if (this.state.phase !== "waiting") {
      this.sendLobbyError(client, "not_waiting", "游戏已经开始，无法再选择座位。");
      return;
    }
    const seatIndex = this.normalizeSeatIndex(payload?.seatIndex);
    if (seatIndex === null) {
      this.sendLobbyError(client, "invalid_seat", "座位编号无效。");
      return;
    }
    const currentSeatId = this.seatBySession.get(client.sessionId);
    const token = currentSeatId
      ? this.findTokenBySeatId(currentSeatId)
      : this.pendingTokenBySession.get(client.sessionId) || generateTokenUtil();
    this.claimSeatForClient(client, seatIndex, token);
  }

  private claimSeatForClient(client: Client, seatIndex: number, token: string): boolean {
    const targetSeatId = this.seatIdForIndex(seatIndex);
    const currentSeatId = this.seatBySession.get(client.sessionId);
    const movingHost = Boolean(currentSeatId && currentSeatId === this.state.hostPlayerId);
    if (this.state.players.has(targetSeatId) && currentSeatId !== targetSeatId) {
      this.sendLobbyError(client, "seat_occupied", "该座位刚刚已被占用，请选择其他空位。");
      return false;
    }

    const requestedName = this.pendingNameBySession.get(client.sessionId) || "玩家";
    let player = currentSeatId ? this.state.players.get(currentSeatId) : undefined;
    if (currentSeatId && currentSeatId !== targetSeatId && player) {
      const hand = this.playerHands.get(currentSeatId) ?? [];
      const baseName = this.baseNameBySeat.get(currentSeatId) ?? player.name;
      this.state.players.delete(currentSeatId);
      this.playerHands.delete(currentSeatId);
      this.baseNameBySeat.delete(currentSeatId);
      this.playerOrder = this.playerOrder.filter((id) => id !== currentSeatId);
      player.clientId = targetSeatId;
      player.seatIndex = seatIndex;
      this.state.players.set(targetSeatId, player);
      this.playerHands.set(targetSeatId, hand);
      this.baseNameBySeat.set(targetSeatId, baseName);
      for (const [mappedToken, mappedSeatId] of this.seatByToken.entries()) {
        if (mappedSeatId === currentSeatId) {
          this.seatByToken.set(mappedToken, targetSeatId);
        }
      }
    } else if (!player) {
      const name = makeUniqueHumanName(
        requestedName,
        [...this.state.players.entries()]
          .filter(([seatId]) => seatId !== targetSeatId)
          .map(([, existingPlayer]) => existingPlayer.name),
      );
      player = new PlayerState();
      player.clientId = targetSeatId;
      player.seatIndex = seatIndex;
      player.name = name;
      player.isBot = false;
      player.isConfiguredBot = false;
      player.botStrength = 50;
      player.connected = true;
      this.state.players.set(targetSeatId, player);
      this.playerHands.set(targetSeatId, []);
      this.baseNameBySeat.set(targetSeatId, name);
    }

    player.name = this.baseNameBySeat.get(targetSeatId) || requestedName;
    player.connected = true;
    player.isBot = false;
    player.isConfiguredBot = false;
    this.botIds.delete(targetSeatId);
    this.configuredBotIds.delete(targetSeatId);
    this.seatBySession.set(client.sessionId, targetSeatId);
    this.seatByToken.set(token, targetSeatId);
    if (!this.playerOrder.includes(targetSeatId)) {
      this.playerOrder.push(targetSeatId);
    }
    this.sortPlayerOrder();
    this.pendingNameBySession.delete(client.sessionId);
    this.pendingTokenBySession.delete(client.sessionId);
    this.clearSeatReleaseTimer(targetSeatId);
    if (movingHost || !this.state.hostPlayerId) {
      this.state.hostPlayerId = targetSeatId;
    }
    this.state.lastAction = `LOBBY ${this.playerOrder.length}/${this.targetSeats}`;
    this.sendSessionToken(client, targetSeatId, token, false);
    this.broadcastAvailableActions();
    return true;
  }

  private handleAddBot(client: Client, payload: { seatIndex?: number; strength?: number }): void {
    if (this.state.phase !== "waiting" || !this.isHostClient(client)) {
      this.sendLobbyError(client, "not_host", "仅房主可添加机器人。");
      return;
    }
    const seatIndex = this.normalizeSeatIndex(payload?.seatIndex);
    if (seatIndex === null) {
      this.sendLobbyError(client, "invalid_seat", "座位编号无效。");
      return;
    }
    const seatId = this.seatIdForIndex(seatIndex);
    if (this.state.players.has(seatId)) {
      this.sendLobbyError(client, "seat_occupied", "该座位已被占用。");
      return;
    }
    const bot = new PlayerState();
    bot.clientId = seatId;
    bot.seatIndex = seatIndex;
    bot.name = chooseBotDisplayName([...this.state.players.values()].map((player) => player.name));
    bot.isBot = true;
    bot.isConfiguredBot = true;
    bot.botStrength = this.normalizeBotStrength(payload?.strength);
    bot.connected = false;
    this.state.players.set(seatId, bot);
    this.playerHands.set(seatId, []);
    this.playerOrder.push(seatId);
    this.sortPlayerOrder();
    this.botIds.add(seatId);
    this.configuredBotIds.add(seatId);
    this.state.lastAction = `BOT_ADD ${seatId}`;
    this.broadcastAvailableActions();
  }

  /**
   * 作用：让好友房房主用标准难度机器人一次补齐所有空座。
   * 关键输入/输出：输入发起客户端；成功时创建零到多个配置机器人。
   * 副作用：批量更新玩家、手牌和机器人索引，并只广播一次大厅状态。
   */
  private handleFillBots(client: Client): void {
    if (this.state.phase !== "waiting" || this.state.roomMode !== "friends") {
      this.sendLobbyError(client, "not_friend_waiting", "只有好友房等待阶段可以补齐电脑。");
      return;
    }
    if (!this.isHostClient(client)) {
      this.sendLobbyError(client, "not_host", "仅房主可补齐电脑。");
      return;
    }

    const emptySeatIndexes = Array.from({ length: this.targetSeats }, (_, seatIndex) => seatIndex)
      .filter((seatIndex) => !this.state.players.has(this.seatIdForIndex(seatIndex)));
    if (emptySeatIndexes.length === 0) {
      this.sendLobbyError(client, "room_full", "四个座位已经坐满，无需补齐电脑。");
      return;
    }

    const plannedBots: Array<{ seatId: string; bot: PlayerState }> = [];
    const plannedNames = [...this.state.players.values()].map((player) => player.name);
    for (const seatIndex of emptySeatIndexes) {
      const seatId = this.seatIdForIndex(seatIndex);
      const bot = new PlayerState();
      bot.clientId = seatId;
      bot.seatIndex = seatIndex;
      bot.name = chooseBotDisplayName(plannedNames);
      bot.isBot = true;
      bot.isConfiguredBot = true;
      bot.botStrength = 50;
      bot.connected = false;
      plannedBots.push({ seatId, bot });
      plannedNames.push(bot.name);
    }

    for (const { seatId, bot } of plannedBots) {
      this.state.players.set(seatId, bot);
      this.playerHands.set(seatId, []);
      this.playerOrder.push(seatId);
      this.botIds.add(seatId);
      this.configuredBotIds.add(seatId);
    }

    this.sortPlayerOrder();
    this.state.lastAction = `BOT_FILL ${emptySeatIndexes.length}`;
    this.broadcastAvailableActions();
  }

  private handleUpdateBot(client: Client, payload: { seatIndex?: number; strength?: number }): void {
    if (this.state.phase !== "waiting" || !this.isHostClient(client)) {
      this.sendLobbyError(client, "not_host", "仅房主可调整机器人。");
      return;
    }
    const seatIndex = this.normalizeSeatIndex(payload?.seatIndex);
    const seatId = seatIndex === null ? "" : this.seatIdForIndex(seatIndex);
    const player = seatId ? this.state.players.get(seatId) : undefined;
    if (!player || !player.isConfiguredBot) {
      this.sendLobbyError(client, "not_configured_bot", "该座位不是可配置机器人。");
      return;
    }
    player.botStrength = this.normalizeBotStrength(payload?.strength);
    this.state.lastAction = `BOT_LEVEL ${seatId}`;
    this.broadcastAvailableActions();
  }

  private handleRemoveSeat(client: Client, payload: { seatIndex?: number }): void {
    if (this.state.phase !== "waiting" || !this.isHostClient(client)) {
      this.sendLobbyError(client, "not_host", "仅房主可移除座位成员。");
      return;
    }
    const seatIndex = this.normalizeSeatIndex(payload?.seatIndex);
    const seatId = seatIndex === null ? "" : this.seatIdForIndex(seatIndex);
    if (!seatId || !this.state.players.has(seatId)) {
      this.sendLobbyError(client, "empty_seat", "该座位当前为空。");
      return;
    }
    if (seatId === this.state.hostPlayerId) {
      this.sendLobbyError(client, "cannot_remove_host", "不能移除当前房主。");
      return;
    }
    this.removeSeat(seatId, true);
    this.state.lastAction = `SEAT_REMOVE ${seatId}`;
    this.broadcastAvailableActions();
  }

  private removeSeat(seatId: string, notifyClient: boolean): void {
    this.clearSeatReleaseTimer(seatId);
    this.clearTakeoverTimer(seatId);
    const sessionIds = [...this.seatBySession.entries()]
      .filter(([, mappedSeat]) => mappedSeat === seatId)
      .map(([sessionId]) => sessionId);
    for (const sessionId of sessionIds) {
      this.seatBySession.delete(sessionId);
      const target = this.clients.find((item) => item.sessionId === sessionId);
      if (notifyClient && target) {
        target.send("removed_from_room", { reason: "你已被房主移出房间。" });
        target.leave(4104);
      }
    }
    for (const [token, mappedSeat] of [...this.seatByToken.entries()]) {
      if (mappedSeat === seatId) {
        this.seatByToken.delete(token);
      }
    }
    this.state.players.delete(seatId);
    this.playerHands.delete(seatId);
    this.baseNameBySeat.delete(seatId);
    this.botIds.delete(seatId);
    this.configuredBotIds.delete(seatId);
    this.playerOrder = this.playerOrder.filter((id) => id !== seatId);
  }

  private clearSeatReleaseTimer(seatId: string): void {
    const timer = this.seatDisconnectTimers.get(seatId);
    if (timer) {
      clearTimeout(timer);
      this.seatDisconnectTimers.delete(seatId);
    }
  }

  private scheduleSeatRelease(seatId: string): void {
    this.clearSeatReleaseTimer(seatId);
    const timer = setTimeout(() => {
      this.seatDisconnectTimers.delete(seatId);
      const player = this.state.players.get(seatId);
      if (this.state.phase !== "waiting" || !player || player.connected || player.isConfiguredBot) {
        return;
      }
      this.removeSeat(seatId, false);
      if (this.state.hostPlayerId === seatId) {
        this.transferHostToLowestOnlineHuman();
      }
      this.state.lastAction = `SEAT_EXPIRED ${seatId}`;
      this.broadcastAvailableActions();
    }, this.lobbySeatHoldMs);
    this.seatDisconnectTimers.set(seatId, timer);
  }

  private clearTakeoverTimer(seatId: string): void {
    const timer = this.takeoverTimers.get(seatId);
    if (timer) {
      clearTimeout(timer);
      this.takeoverTimers.delete(seatId);
    }
  }

  private clearAllTakeoverTimers(): void {
    for (const timer of this.takeoverTimers.values()) {
      clearTimeout(timer);
    }
    this.takeoverTimers.clear();
  }

  private scheduleTemporaryTakeover(seatId: string): void {
    this.clearTakeoverTimer(seatId);
    const activate = () => {
      this.takeoverTimers.delete(seatId);
      const player = this.state.players.get(seatId);
      if (!player || player.connected || player.isConfiguredBot) {
        return;
      }
      if (this.state.phase === "waiting") {
        player.isBot = false;
        this.botIds.delete(seatId);
        this.scheduleSeatRelease(seatId);
        this.broadcastAvailableActions();
        return;
      }
      player.isBot = true;
      player.botStrength = 50;
      this.botIds.add(seatId);
      this.state.lastAction = `TAKEOVER ${seatId}`;
      if (this.state.phase === "declaring" && !player.declaredReady) {
        this.submitDefaultDeclaration(seatId, true);
        return;
      }
      if (this.state.phase === "playing" || this.state.phase === "declaring") {
        this.tickBots();
      } else {
        this.broadcastAvailableActions();
      }
    };
    if (this.reconnectGraceMs === 0) {
      activate();
      return;
    }
    this.takeoverTimers.set(seatId, setTimeout(activate, this.reconnectGraceMs));
  }

  private transferHostToLowestOnlineHuman(): void {
    const nextHost = this.playerOrder.find((seatId) => {
      const player = this.state.players.get(seatId);
      return Boolean(player && !player.isConfiguredBot && player.connected);
    });
    this.state.hostPlayerId = nextHost ?? "";
  }

  private friendRoomStartProblem(): string {
    if (this.playerOrder.length !== this.targetSeats) {
      return "四个座位尚未坐满。";
    }
    const hasEmpty = Array.from({ length: this.targetSeats }, (_, index) => this.seatIdForIndex(index)).some(
      (seatId) => !this.state.players.has(seatId),
    );
    if (hasEmpty) {
      return "四个座位尚未坐满。";
    }
    const hasOfflineHuman = this.playerOrder.some((seatId) => {
      const player = this.state.players.get(seatId);
      return Boolean(player && !player.isConfiguredBot && !player.connected);
    });
    return hasOfflineHuman ? "仍有真人玩家离线，请等待其重连或由房主移除。" : "";
  }

  private removeUnseatedClientsForGameStart(): void {
    for (const client of this.clients) {
      if (this.seatBySession.has(client.sessionId)) {
        continue;
      }
      this.pendingNameBySession.delete(client.sessionId);
      this.pendingTokenBySession.delete(client.sessionId);
      client.send("lobby_error", { code: "game_started", message: "牌局已经开始，本局不开放旁观。" });
      client.leave(4105);
    }
  }

  private clearRoomIdleTimer(): void {
    if (this.roomIdleTimer) {
      clearTimeout(this.roomIdleTimer);
      this.roomIdleTimer = null;
    }
  }

  private scheduleRoomIdleIfEmpty(): void {
    if (this.seatBySession.size > 0 || this.pendingNameBySession.size > 0 || this.roomIdleTimer) {
      return;
    }
    const timeoutMs = this.state.phase === "waiting" ? this.waitingRoomIdleMs : this.activeRoomIdleMs;
    this.roomIdleTimer = setTimeout(() => {
      this.roomIdleTimer = null;
      if (this.seatBySession.size === 0 && this.pendingNameBySession.size === 0) {
        void this.disconnect(4000);
      }
    }, timeoutMs);
  }

  /**
   * 作用：重连回收座位，踢掉旧会话并恢复真人控制。
   * 关键输入/输出：输入客户端、seat/token/name；输出无返回值。
   * 副作用：更新在线态、会话映射并触发动作刷新。
   */
  private reclaimSeat(client: Client, seatId: string, token: string, rawName: string): void {
    this.clearSeatReleaseTimer(seatId);
    this.clearTakeoverTimer(seatId);
    for (const [sessionId, mappedSeat] of this.seatBySession.entries()) {
      if (mappedSeat !== seatId || sessionId === client.sessionId) {
        continue;
      }
      this.seatBySession.delete(sessionId);
      const oldClient = this.clients.find((c) => c.sessionId === sessionId);
      oldClient?.send("session_replaced", {
        message: "这个座位已在其他窗口恢复。本页面已停止重连，避免重复抢占座位。",
      });
      oldClient?.leave(4102, "seat replaced by another session");
    }

    const ok = reclaimSeatStateFlow(
      {
        state: this.state,
        baseNameBySeat: this.baseNameBySeat,
        botIds: this.botIds,
        seatBySession: this.seatBySession,
        seatByToken: this.seatByToken,
      },
      client.sessionId,
      seatId,
      token,
      rawName,
    );
    if (!ok) {
      client.send("join_error", { message: "重连失败：座位不存在。" });
      client.leave(4103);
      return;
    }

    const player = this.state.players.get(seatId);
    if (player) {
      player.seatIndex = this.seatIndexFromId(seatId);
      player.isConfiguredBot = false;
      player.botStrength = 50;
    }
    this.pendingNameBySession.delete(client.sessionId);
    if (!this.state.hostPlayerId) {
      this.state.hostPlayerId = seatId;
    }

    this.sendSessionToken(client, seatId, token, true);
    this.syncAllPrivateHands();
    this.broadcastAvailableActions();
    this.tickBots();
  }

  /**
   * 作用：给客户端下发当前会话 token 与座位信息。
   * 关键输入/输出：输入客户端、seat、token、reclaimed；输出无返回值。
   * 副作用：发送 `session_token` 消息。
   */
  private sendSessionToken(client: Client, seatId: string, token: string, reclaimed: boolean): void {
    client.send("session_token", {
      playerToken: token,
      seatId,
      hostPlayerId: this.state.hostPlayerId,
      roomId: this.roomId,
      seatIndex: this.seatIndexFromId(seatId),
      reclaimed,
    });
  }

  private findTokenBySeatId(seatId: string): string {
    for (const [token, mappedSeatId] of this.seatByToken.entries()) {
      if (mappedSeatId === seatId) {
        return token;
      }
    }
    return "";
  }

  /**
   * 作用：确保开局前座位数补齐到目标人数。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：可能新增 BOT 玩家并写入 botIds。
   */
  private ensureBotSeatsForStart(): void {
    for (let seatIndex = 0; seatIndex < this.targetSeats; seatIndex += 1) {
      const seatId = this.seatIdForIndex(seatIndex);
      if (this.state.players.has(seatId)) {
        continue;
      }
      const bot = new PlayerState();
      bot.clientId = seatId;
      bot.seatIndex = seatIndex;
      bot.name = chooseBotDisplayName([...this.state.players.values()].map((player) => player.name));
      bot.isBot = true;
      bot.isConfiguredBot = true;
      bot.botStrength = 50;
      bot.connected = false;
      this.state.players.set(seatId, bot);
      this.playerHands.set(seatId, []);
      this.playerOrder.push(seatId);
      this.botIds.add(seatId);
      this.configuredBotIds.add(seatId);
    }
    this.sortPlayerOrder();
  }

  private resolveBootstrapSetup(): RoundBootstrapSetup {
    if (this.nextRoundSetup?.mode === "fixed" && this.state.players.has(this.nextRoundSetup.dealerId)) {
      return this.nextRoundSetup;
    }
    if (this.nextRoundSetup?.mode === "picker" && this.state.players.has(this.nextRoundSetup.pickerId)) {
      return this.nextRoundSetup;
    }
    return {
      mode: "picker",
      pickerId: pickRandomDealerIdUtil(this.playerOrder),
    };
  }

  private chooseDealerCardFromDealerHand(dealerId: string): Card | null {
    const hand = this.playerHands.get(dealerId) ?? [];
    if (!hand.length) {
      return null;
    }
    const index = Math.floor(Math.random() * hand.length);
    const picked = hand[index];
    return picked ? { ...picked } : null;
  }

  private startDeclareIntroSequence(dealerId: string, pickerId: string | null): void {
    this.clearDeclareIntroTimer();
    const leadMs = pickerId ? this.dealerPickIntroMs + this.dealerRevealIntroMs : this.dealerRevealIntroMs;
    const totalIntroMs = leadMs + this.openingDealDelayMs;
    this.state.responseEndsAt = totalIntroMs > 0 ? Date.now() + totalIntroMs : 0;
    this.state.lastAction = pickerId ? `DEALER_PICK ${pickerId}` : `DEALER_CARD ${dealerId}`;
    this.broadcastAvailableActions();

    if (totalIntroMs <= 0) {
      this.state.lastAction = `DECLARING ${this.declareTimeoutMs}ms`;
      this.startDeclaringPhase();
      return;
    }

    const registerTimer = (delayMs: number, run: () => void) => {
      const timer = setTimeout(() => {
        if (this.state.phase !== "declaring") {
          return;
        }
        run();
      }, delayMs);
      this.declareIntroStageTimers.push(timer);
      return timer;
    };

    if (pickerId) {
      registerTimer(this.dealerPickIntroMs, () => {
        this.state.lastAction = `DEALER_CARD ${dealerId}`;
        this.broadcastAvailableActions();
      });
    }

    registerTimer(leadMs, () => {
      this.state.lastAction = `DEALER ${dealerId}`;
      this.broadcastAvailableActions();
    });

    this.declareIntroTimer = registerTimer(totalIntroMs, () => {
      this.declareIntroTimer = null;
      this.state.responseEndsAt = 0;
      this.startDeclaringPhase();
      this.declareIntroStageTimers = [];
    });
  }

  // ===== 开局与声明阶段 =====

  /**
   * 作用：初始化一局牌（洗牌、发牌、定庄、亮公将）。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：重置局内状态，写入手牌/庄家/声明倒计时并进入声明阶段。
   */
  private bootstrapRound(): void {
    this.clearDeclareTimer();
    this.clearDeclareIntroTimer();
    this.state.phase = "declaring";
    this.deck = shuffle(createDeck());
    this.publicGeneralPool = [];
    this.dealerCard = null;
    this.dealerPickerId = null;
    this.pendingResponse = null;
    this.pendingFishDeclarations.clear();
    this.awaitingDiscardOwnerId = null;
    this.lastRoundResult = null;
    this.huLogDedup.clear();
    this.huChecksTotal = 0;
    this.huChecksValid = 0;
    this.huChecksBySeat.clear();

    resetRoundPlayersFlow(this.state, this.playerOrder);
    const setup = this.resolveBootstrapSetup();
    const pickerId = setup.mode === "picker" ? setup.pickerId : null;

    let dealerId = setup.mode === "fixed" ? setup.dealerId : "";
    let dealerCard: Card | null = null;
    if (setup.mode === "picker") {
      dealerCard = this.deck.shift() ?? null;
      dealerId = dealerCard
        ? resolveDealerFromAnchorAndCard(this.playerOrder, setup.pickerId, dealerCard)
        : setup.pickerId;
    }

    this.roundDealerId = dealerId;
    this.dealerPickerId = pickerId;
    this.state.dealerId = dealerId;
    this.state.dealerPickerId = pickerId ?? "";
    dealInitialHandsFlow(this.playerOrder, this.deck, this.playerHands);

    if (setup.mode === "picker" && dealerCard) {
      const dealerHand = this.playerHands.get(dealerId) ?? [];
      dealerHand.unshift(dealerCard);
      this.playerHands.set(dealerId, dealerHand);
    } else {
      const extraCard = this.deck.shift();
      if (extraCard) {
        const dealerHand = this.playerHands.get(dealerId) ?? [];
        dealerHand.unshift(extraCard);
        this.playerHands.set(dealerId, dealerHand);
      }
      dealerCard = this.chooseDealerCardFromDealerHand(dealerId);
    }
    this.dealerCard = dealerCard;
    this.state.dealerCard = dealerCard
      ? this.ops.toSchemaCard(dealerCard, false, dealerCard.source ?? "upper")
      : new CardSchema();

    this.state.deckCount = this.deck.length;
    this.state.currentPlayerId = dealerId;
    this.state.responsePhase = "collective";
    this.state.declareEndsAt = 0;
    this.syncAllPrivateHands();
    this.startDeclareIntroSequence(dealerId, pickerId);
    this.nextRoundSetup = null;
  }

  /**
   * 作用：启动声明阶段流程（机器人自动声明+超时托底）。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：可能推进到声明完成并进入 playing。
   */
  private startDeclaringPhase(): void {
    this.clearDeclareIntroTimer();
    this.state.responseEndsAt = 0;
    this.declareTimeExtensionUsedBy.clear();
    const practiceUntimed = this.playerOrder.some((seatId) => this.isPracticeDecisionUntimed(seatId));
    this.declareTimerTotalMs = practiceUntimed ? 0 : this.declareTimeoutMs;
    this.declareDecisionWindowId += 1;
    this.state.declareEndsAt = practiceUntimed ? 0 : Date.now() + this.declareTimeoutMs;
    startDeclaringFlow({
      playerOrder: this.playerOrder,
      getPlayer: (seatId) => this.state.players.get(seatId),
      submitDeclaration: (seatId, force) => this.submitDefaultDeclaration(seatId, force),
      syncAllPrivateHands: () => this.syncAllPrivateHands(),
      broadcastAvailableActions: () => this.broadcastAvailableActions(),
      allReady: () => this.areAllDeclarationsReady(),
      finishDeclaringPhase: () => this.finishDeclaringPhase(),
      scheduleDeclareTimeout: () => {
        if (!practiceUntimed) {
          this.scheduleDeclareTimeout();
        }
      },
    });
  }

  /**
   * 作用：安排声明阶段超时处理。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：设置 `declareTimer`，超时后强制提交未声明玩家。
   */
  private scheduleDeclareTimeout(delayMs = this.declareTimeoutMs): void {
    this.clearDeclareTimer();
    this.declareTimer = setTimeout(() => {
      this.declareTimer = null;
      if (this.state.phase !== "declaring") {
        return;
      }
      runDeclaringTimeoutFlow({
        playerOrder: this.playerOrder,
        getPlayer: (seatId) => this.state.players.get(seatId),
        submitDeclaration: (seatId, force) => this.submitDefaultDeclaration(seatId, force),
        allReady: () => this.areAllDeclarationsReady(),
        finishDeclaringPhase: () => this.finishDeclaringPhase(),
      });
    }, Math.max(1, delayMs));
  }

  /**
   * 作用：清理声明阶段计时器。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：清空 `declareTimer`。
   */
  private clearDeclareTimer(): void {
    if (this.declareTimer) {
      clearTimeout(this.declareTimer);
      this.declareTimer = null;
    }
  }

  private clearDeclareIntroTimer(): void {
    if (this.declareIntroStageTimers.length > 0) {
      for (const timer of this.declareIntroStageTimers) {
        clearTimeout(timer);
      }
      this.declareIntroStageTimers = [];
    }
    if (this.declareIntroTimer) {
      clearTimeout(this.declareIntroTimer);
      this.declareIntroTimer = null;
    }
  }

  private canSeatRequestMoreTime(seatId: string): boolean {
    const player = this.state.players.get(seatId);
    if (!player || !player.connected || player.isBot || this.botIds.has(seatId)) {
      return false;
    }
    if (this.isPracticeDecisionUntimed(seatId)) {
      return false;
    }
    const now = Date.now();
    if (this.state.phase === "declaring") {
      return (
        !this.declareTimeExtensionUsedBy.has(seatId) &&
        !player.declaredReady &&
        this.state.declareEndsAt > now
      );
    }
    if (
      this.state.phase !== "playing" ||
      this.responseTimeExtensionUsed ||
      this.state.responseEndsAt <= now ||
      !this.pendingResponse
    ) {
      return false;
    }
    if (this.state.responsePhase === "collective") {
      return (
        this.collectiveResponderId === seatId &&
        !this.pendingResponse.collectives.has(seatId)
      );
    }
    return (
      this.pendingResponse.ownerId === seatId &&
      (this.state.currentPlayerId === seatId || this.awaitingDiscardOwnerId === seatId)
    );
  }

  private buildDecisionTimerSnapshot(seatId: string): {
    untimed: boolean;
    canRequestMoreTime: boolean;
    extensionSeconds: number;
    totalMs: number;
    endsAt: number;
    decisionKey: string;
  } {
    const untimed = this.isPracticeDecisionUntimed(seatId);
    const totalMs = untimed
      ? 0
      : this.state.phase === "declaring"
        ? this.declareTimerTotalMs || this.declareTimeoutMs
        : this.state.phase === "playing"
          ? this.responseTimerTotalMs || this.operationTimeoutMs
          : 0;
    return {
      untimed,
      canRequestMoreTime: this.canSeatRequestMoreTime(seatId),
      extensionSeconds: Math.ceil(this.timeExtensionMs / 1000),
      totalMs,
      endsAt: untimed
        ? 0
        : this.state.phase === "declaring"
          ? this.state.declareEndsAt
          : this.state.phase === "playing"
            ? this.state.responseEndsAt
            : 0,
      decisionKey:
        this.state.phase === "declaring"
          ? `declare:${this.declareDecisionWindowId}`
          : this.state.phase === "playing"
            ? `play:${this.responseDecisionWindowId}`
            : "",
    };
  }

  /**
   * 作用：判断某座位当前是否享有单人练习的真人不限时决策。
   * 关键输入/输出：输入座位 ID；仅在线真人且正轮到其声明、响应或出牌时返回 true。
   * 副作用：无。机器人与断线托管永远保持计时，以免无人牌局停滞。
   */
  private isPracticeDecisionUntimed(seatId: string): boolean {
    if (this.state.roomMode !== "practice") {
      return false;
    }
    const player = this.state.players.get(seatId);
    if (!player || !player.connected || player.isBot || this.botIds.has(seatId)) {
      return false;
    }
    if (this.state.phase === "declaring") {
      return !player.declaredReady;
    }
    if (this.state.phase !== "playing" || !this.pendingResponse) {
      return false;
    }
    if (this.state.responsePhase === "collective") {
      return this.collectiveResponderId === seatId && !this.pendingResponse.collectives.has(seatId);
    }
    return (
      this.pendingResponse.ownerId === seatId &&
      (this.state.currentPlayerId === seatId || this.awaitingDiscardOwnerId === seatId)
    );
  }

  private handleRequestMoreTime(client: Client, payload?: { decisionKey?: unknown }): void {
    const seatId = this.seatBySession.get(client.sessionId);
    const requestedDecisionKey = typeof payload?.decisionKey === "string" ? payload.decisionKey.trim() : "";
    const currentDecisionKey = seatId ? this.buildDecisionTimerSnapshot(seatId).decisionKey : "";
    if (
      !seatId ||
      !requestedDecisionKey ||
      requestedDecisionKey !== currentDecisionKey ||
      !this.canSeatRequestMoreTime(seatId)
    ) {
      if (seatId) {
        this.sendAvailableActionsToClient(client, seatId);
      }
      return;
    }

    const now = Date.now();
    if (this.state.phase === "declaring") {
      const remainingMs = Math.max(1, this.state.declareEndsAt - now);
      this.declareTimeExtensionUsedBy.add(seatId);
      this.declareTimerTotalMs = Math.max(this.declareTimeoutMs, this.declareTimerTotalMs) + this.timeExtensionMs;
      this.state.declareEndsAt = now + remainingMs + this.timeExtensionMs;
      this.scheduleDeclareTimeout(remainingMs + this.timeExtensionMs);
      this.traceStep("declare_time_extended", `seat=${seatId} ms=${this.timeExtensionMs}`);
      this.broadcastAvailableActions();
      return;
    }

    const remainingMs = Math.max(1, this.state.responseEndsAt - now);
    this.responseTimeExtensionUsed = true;
    this.responseTimerTotalMs = Math.max(1, this.responseTimerTotalMs) + this.timeExtensionMs;
    this.scheduleCollectiveTimeout(remainingMs + this.timeExtensionMs, true);
    this.traceStep("response_time_extended", `seat=${seatId} ms=${this.timeExtensionMs}`);
    this.broadcastAvailableActions();
  }

  /**
   * 作用：判断是否所有玩家都完成声明。
   * 关键输入/输出：无入参；输出布尔值。
   * 副作用：无。
   */
  private areAllDeclarationsReady(): boolean {
    return areAllDeclarationsReadyUtil(this.playerOrder, (seatId) => this.state.players.get(seatId));
  }

  /**
   * 作用：声明阶段收尾并进入首轮出牌。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：切换 `phase=playing`，并让庄家先进入弃牌阶段。
   */
  private finishDeclaringPhase(): void {
    this.clearDeclareTimer();
    for (const [seatId, selectedCards] of this.pendingFishDeclarations.entries()) {
      const player = this.state.players.get(seatId);
      if (!player || selectedCards.length === 0) {
        continue;
      }
      const hand = this.playerHands.get(seatId) ?? [];
      const removeIds = new Set(selectedCards.map((card) => card.id));
      this.playerHands.set(seatId, hand.filter((card) => !removeIds.has(card.id)));
      for (const card of selectedCards) {
        player.fishArea.push(this.ops.toSchemaCard(card, true, card.source ?? "upper"));
      }
    }
    this.pendingFishDeclarations.clear();
    const dealerId = this.roundDealerId && this.state.players.has(this.roundDealerId)
      ? this.roundDealerId
      : this.playerOrder[0];
    applyPlayingStartAfterDeclaring(this.state, dealerId, this.getPreviousPlayerId(dealerId));
    this.syncAllPrivateHands();
    this.enterDiscardStage(dealerId, "OPENING_DISCARD");
  }

  /**
   * 作用：提交单个玩家声明数据（杠数/亮鱼）。
   * 关键输入/输出：输入 seat 与 payload；输出无返回值。
   * 副作用：更新玩家声明字段、fishArea 和手牌，必要时触发阶段推进。
   */
  private submitDeclaration(seatId: string, payload: DeclareSetupPayload, force = false): void {
    if (this.state.phase !== "declaring") {
      return;
    }
    const player = this.state.players.get(seatId);
    if (!player || player.declaredReady) {
      return;
    }

    const hand = this.playerHands.get(seatId) ?? [];
    const { declaredKongs, selectedCards, idMatch, fishValid } = buildDeclarationSelection(hand, payload ?? {});

    if (!force && (!idMatch || !fishValid)) {
      const target = this.clients.find((c) => this.seatBySession.get(c.sessionId) === seatId);
      target?.send("declare_rejected", { reason: "亮鱼组合不合法或牌不在手中" });
      return;
    }

    player.declaredKongs = declaredKongs;
    player.declaredReady = true;

    if (idMatch && fishValid && selectedCards.length > 0) {
      this.pendingFishDeclarations.set(seatId, selectedCards.map((card) => ({ ...card })));
    }

    this.syncAllPrivateHands();
    this.broadcastAvailableActions();

    if (this.areAllDeclarationsReady()) {
      this.finishDeclaringPhase();
    }
  }

  private submitDefaultDeclaration(seatId: string, force = true): void {
    const hand = this.playerHands.get(seatId) ?? [];
    this.submitDeclaration(seatId, buildDefaultDeclarationPayload(hand), force);
  }

  // ===== 回合主循环 =====

  /**
   * 作用：开启指定牌主的回合起点（transition -> draw）。
   * 关键输入/输出：输入 owner 与 tag；输出无返回值。
   * 副作用：重置 collective 运行态并进入摸牌处理。
   */
  private startTurn(ownerId: string, tag: string): void {
    if (this.state.phase !== "playing") {
      return;
    }
    this.traceStep("start_turn", `owner=${ownerId} tag=${tag}`);
    this.resetCollectivePolling();
    applyTurnTransitionState(this.state, ownerId);
    this.drawForOwner(ownerId, tag);
  }

  /**
   * 作用：执行牌主摸牌并进入 collective 轮询。
   * 关键输入/输出：输入 owner 与 tag；输出无返回值。
   * 副作用：消费牌堆、重建 pending、更新 responseCard 并启动轮询。
   */
  private drawForOwner(ownerId: string, tag: string): void {
    this.traceStep("draw_for_owner:begin", `owner=${ownerId} tag=${tag}`);
    drawForOwnerFlow(
      {
        phase: this.state.phase,
        deck: this.deck,
        setDeckCount: (count) => {
          this.state.deckCount = count;
        },
        endRound: (lastAction) => this.endRound(lastAction),
        createPendingResponse: ({ ownerId: ownerIdArg, card, source }) => createPendingResponse(ownerIdArg, card, source),
        setPendingResponse: (pending) => {
          this.pendingResponse = pending;
        },
        clearAwaitingDiscardOwner: () => {
          this.awaitingDiscardOwnerId = null;
        },
        setResponseCard: (card, source) => this.ops.setResponseCard(card, source),
        applyCollectivePollState: (ownerIdArg, previousPlayerId, pollOriginPlayerId, lastAction) => {
          applyCollectivePollState(this.state, ownerIdArg, previousPlayerId, pollOriginPlayerId, lastAction);
        },
        getPreviousPlayerId: (ownerIdArg) => this.getPreviousPlayerId(ownerIdArg),
        syncAllPrivateHands: () => this.syncAllPrivateHands(),
        startCollectivePolling: () => this.startCollectivePolling(),
      },
      ownerId,
      tag,
    );
    this.traceStep("draw_for_owner:end", `owner=${ownerId} tag=${tag}`);
  }

  private exposeGeneralCard(ownerId: string, card: Card): void {
    this.publicGeneralPool.push(card);
    this.ops.addWildcardCardToPlayer(ownerId, card, "draw");
    this.state.lastAction = `${ownerId} DRAW_GENERAL`;
  }

  /**
   * 作用：自动从当前玩家打出一张合法牌并发起 collective。
   * 关键输入/输出：输入 owner；输出无返回值。
   * 副作用：清理 awaitingDiscardOwner、写入弃牌并进入 collective。
   */
  private discardFromAndCollective(ownerId: string, cardId?: string): void {
    if (this.state.phase !== "playing" || this.awaitingDiscardOwnerId !== ownerId) {
      return;
    }
    discardFromAndCollectiveFlow(
      {
        pickDiscardCard: (ownerIdArg) =>
          cardId ? this.ops.discardCardById(ownerIdArg, cardId) : this.ops.pickDiscardCard(ownerIdArg),
        pushDiscard: (ownerIdArg, card) => this.ops.pushDiscard(ownerIdArg, card),
        beginCollectiveFromDiscard: (ownerIdArg, discard) => this.beginCollectiveFromDiscard(ownerIdArg, discard),
        clearAwaitingDiscardOwner: () => {
          this.awaitingDiscardOwnerId = null;
        },
        declareNoDiscardWin: (ownerIdArg, tag) => this.declareNoDiscardWin(ownerIdArg, tag),
      },
      ownerId,
    );
  }

  /**
   * 作用：以“玩家刚弃牌”为起点，建立 collective 响应上下文。
   * 关键输入/输出：输入 owner 与弃牌；输出无返回值。
   * 副作用：更新 pending/responseCard/轮询状态并广播动作。
   */
  private beginCollectiveFromDiscard(ownerId: string, discard: Card): void {
    this.traceStep("collective_from_discard", `owner=${ownerId} discard=${this.formatTraceCard(discard)}`);
    beginCollectiveFromDiscardFlow(
      {
        createPendingResponse: ({ ownerId: ownerIdArg, card, source }) => createPendingResponse(ownerIdArg, card, source),
        setPendingResponse: (pending) => {
          this.pendingResponse = pending;
        },
        clearAwaitingDiscardOwner: () => {
          this.awaitingDiscardOwnerId = null;
        },
        setResponseCard: (card, source) => this.ops.setResponseCard(card, source),
        applyCollectivePollState: (ownerIdArg, previousPlayerId, pollOriginPlayerId, lastAction) => {
          applyCollectivePollState(this.state, ownerIdArg, previousPlayerId, pollOriginPlayerId, lastAction);
        },
        syncAllPrivateHands: () => this.syncAllPrivateHands(),
        startCollectivePolling: () => this.startCollectivePolling(),
      },
      ownerId,
      discard,
    );
  }

  // ===== 动作处理与分发 =====

  /**
   * 作用：处理 action 消息并按当前 responsePhase 分发动作。
   * 关键输入/输出：输入客户端动作；输出无返回值。
   * 副作用：可能写入 collective 选择，或触发 chi/zhua/pass_to_next。
   */
  private normalizeActionRequest(payload: ActionRequest): { action: ActionType; candidateId?: string } | null {
    if (typeof payload === "string") {
      const action = normalizeActionUtil(payload);
      return action ? { action } : null;
    }
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const rawAction = typeof (payload as { action?: unknown }).action === "string" ? (payload as { action: string }).action : "";
    if (!rawAction) {
      return null;
    }
    const action = normalizeActionUtil(rawAction);
    if (!action) {
      return null;
    }
    const candidateId = typeof payload.candidateId === "string" ? payload.candidateId.trim() : "";
    return { action, candidateId: candidateId || undefined };
  }

  private isManualCandidateAction(action: ActionType): boolean {
    return action === "kai" || action === "peng" || action === "chi";
  }

  private isCandidateValidForAction(item: AvailableActionEntry | undefined, candidateId?: string): boolean {
    if (!candidateId) {
      return false;
    }
    return Boolean(item?.candidates?.some((candidate) => candidate.id === candidateId));
  }

  private rejectAction(client: Client, reason: string): void {
    client.send("action_rejected", { reason });
    this.traceStep("action_rejected", reason);
  }

  private handleAction(client: Client, payload: ActionRequest): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      return;
    }

    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }

    const pending = this.pendingResponse;
    const parsed = this.normalizeActionRequest(payload);
    if (!parsed) {
      this.rejectAction(client, "invalid_action_payload");
      return;
    }
    const { action, candidateId } = parsed;
    const availableActions = this.getAvailableActions(seatId);
    const enabledActions = availableActions.filter((x) => x.enabled).map((x) => x.action);
    const decision = decideActionDispatch({
      pendingOwnerId: pending.ownerId,
      seatId,
      action,
      enabledActions,
      responsePhase: this.state.responsePhase,
      collectiveResponderId: this.collectiveResponderId,
      awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
    });
    const actionItem = availableActions.find((item) => item.action === action);
    this.traceStep(
      "action_dispatch",
      `seat=${seatId} action=${action} candidate=${candidateId ?? "-"} decision=${decision} enabled=${enabledActions.join(",") || "-"}`,
    );

    const requireCandidate =
      !this.botIds.has(seatId) &&
      this.isManualCandidateAction(action) &&
      (decision === "collective_accept" || decision === "local_chi");
    if (requireCandidate && !this.isCandidateValidForAction(actionItem, candidateId)) {
      this.rejectAction(client, candidateId ? "invalid_candidate" : "candidate_required");
      return;
    }

    if (decision === "collective_accept") {
      this.clearCollectiveTimer();
      pending.collectives.set(seatId, {
        action: action === "pass" ? "pass" : action,
        candidateId: action === "pass" ? undefined : candidateId,
      });
      this.collectiveCursor += 1;
      this.traceStep("collective_accept", `seat=${seatId} action=${action} candidate=${candidateId ?? "-"}`);
      if (this.state.responsePhase === "collective" && this.pendingResponse === pending) {
        this.advanceCollectivePolling();
      }
      return;
    }
    if (decision === "local_chi") {
      this.clearCollectiveTimer();
      this.executeEat(seatId, candidateId);
      return;
    }
    if (decision === "local_pass_upper") {
      this.clearCollectiveTimer();
      this.executeGrab(seatId);
      return;
    }
    if (decision === "local_pass_draw") {
      this.clearCollectiveTimer();
      this.executePassToNext(seatId);
      return;
    }
  }

  /**
   * 作用：处理 discard_card 消息（仅限 local 阶段牌主）。
   * 关键输入/输出：输入客户端与 cardId；输出无返回值。
   * 副作用：从手牌移除目标牌并进入 collective。
   */
  private handleDiscardCard(client: Client, payload: { cardId?: string } | string): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }

    const pending = this.pendingResponse;
    if (
      !canAcceptDiscardRequest({
        hasPending: Boolean(pending),
        phase: this.state.phase,
        pendingOwnerId: pending?.ownerId ?? "",
        seatId,
        awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
        responsePhase: this.state.responsePhase,
      })
    ) {
      return;
    }

    const cardId = normalizeDiscardCardId(payload);
    if (!cardId) {
      return;
    }
    this.traceStep("discard_request", `seat=${seatId} cardId=${cardId}`);

    const discard = this.ops.discardCardById(seatId, cardId);
    if (!discard) {
      this.traceStep("discard_rejected", `seat=${seatId} cardId=${cardId}`);
      return;
    }

    this.clearCollectiveTimer();
    this.traceStep("discard_accept", `seat=${seatId} discard=${this.formatTraceCard(discard)}`);
    this.ops.pushDiscard(seatId, discard);
    this.beginCollectiveFromDiscard(seatId, discard);
  }

  /**
   * 作用：让牌主进入“待手动弃牌”本地阶段。
   * 关键输入/输出：输入 owner 与触发标签；输出无返回值。
   * 副作用：写入 awaitingDiscardOwner 与 local_draw 状态。
   */
  private enterDiscardStage(ownerId: string, tag: string): void {
    this.traceStep("enter_discard_stage", `owner=${ownerId} tag=${tag}`);
    enterDiscardStageFlow(
      {
        playerHand: this.playerHands.get(ownerId) ?? [],
        declareNoDiscardWin: (ownerIdArg, tagArg) => this.declareNoDiscardWin(ownerIdArg, tagArg),
        createPendingResponse: ({ ownerId: ownerIdArg, card, source }) => createPendingResponse(ownerIdArg, card, source),
        setPendingResponse: (pending) => {
          this.pendingResponse = pending;
        },
        setAwaitingDiscardOwner: (ownerIdArg) => {
          this.awaitingDiscardOwnerId = ownerIdArg;
        },
        resetCollectivePolling: () => this.resetCollectivePolling(),
        applyEnterDiscardStageState: (ownerIdArg, tagArg) => applyEnterDiscardStageState(this.state, ownerIdArg, tagArg),
        clearResponseCard: () => {
          this.state.responseCard = new CardSchema();
        },
        syncAllPrivateHands: () => this.syncAllPrivateHands(),
        tickBots: () => this.tickBots(),
      },
      ownerId,
      tag,
    );
  }

  /**
   * 作用：collective 轮询结束后的统一决议入口。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：触发胜者动作，或转入无响应本地阶段。
   */
  private resolveCollectivePhase(): void {
    this.traceStep("resolve_collective:begin");
    resolveCollectivePhaseFlow({
      pending: this.pendingResponse,
      playerOrder: this.playerOrder,
      executeResponseWinner: (winnerId, action) => this.executeResponseWinner(winnerId, action),
      setLastAction: (action) => {
        this.state.lastAction = action;
      },
      enterOwnerLocalPhaseAfterNoResponse: (ownerId) => this.enterOwnerLocalPhaseAfterNoResponse(ownerId),
    });
    this.traceStep("resolve_collective:end");
  }

  private hasCollectiveActionBeyondPass(seatId: string): boolean {
    const acts = this.getAvailableActions(seatId, true);
    return acts.some((item) => Boolean(item.deferred) || (item.enabled && item.action !== "pass"));
  }

  private isEatResponder(ownerId: string, responderId: string): boolean {
    // Rule v1.0: only one adjacent player can eat discarded card.
    return this.getNextPlayerId(ownerId) === responderId;
  }

  /**
   * 作用：执行 collective 决胜动作（胡/开/碰/吃）调度。
   * 关键输入/输出：输入胜者与动作；输出无返回值。
   * 副作用：按动作分发到执行器并推进主循环。
   */
  private executeResponseWinner(winnerId: string, choice: { action: ActionType; candidateId?: string }): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    const sourceOwnerId = String(this.state.pollOriginPlayerId || pending.ownerId || "");
    if (
      pending.card.source === "upper" &&
      (choice.action === "hu" || choice.action === "kai" || choice.action === "peng" || choice.action === "chi")
    ) {
      this.ops.consumePendingDiscard(sourceOwnerId, pending.card);
    }
    this.traceStep(
      "execute_response_winner",
      `winner=${winnerId} action=${choice.action} candidate=${choice.candidateId ?? "-"}`,
    );
    const operationDeps = this.ops.buildOperationExecutorDeps();
    executeResponseWinner(
      {
        getHand: (seatId) => this.playerHands.get(seatId) ?? [],
        explainHuForSeat: (seatId, hand, responseCard) =>
          this.ops.explainHuForSeat(seatId, hand, responseCard, this.getHuWildcardCount()),
        logHuCheck: (stage, seatId, hand, response, valid) => this.logHuCheck(stage, seatId, hand, response, valid),
        executeKaiOperation: (seatId, pendingCard, candidateId) => {
          if (!candidateId || !this.preservesDeclaredKongsAfterAction(seatId, "kai", pendingCard, candidateId)) {
            return false;
          }
          const ok = tryExecuteKai(operationDeps, seatId, pendingCard, candidateId);
          if (ok) {
            this.consumeDeclaredKongForKai(seatId);
          }
          return ok;
        },
        executePengOperation: (seatId, pendingCard, candidateId) => {
          if (!candidateId || !this.preservesDeclaredKongsAfterAction(seatId, "peng", pendingCard, candidateId)) {
            return false;
          }
          return tryExecutePeng(operationDeps, seatId, pendingCard, candidateId);
        },
        executeChiOperation: (seatId, pendingCard, candidateId) => {
          if (!candidateId || !this.preservesDeclaredKongsAfterAction(seatId, "chi", pendingCard, candidateId)) {
            return false;
          }
          return tryExecuteChi(operationDeps, seatId, pendingCard, candidateId).ok;
        },
        isEatResponder: (ownerId, responderId) => this.isEatResponder(ownerId, responderId),
        getNextPlayerId: (playerId) => this.getNextPlayerId(playerId),
        setLastAction: (value) => {
          this.state.lastAction = value;
        },
        startTurn: (ownerId, tag) => this.startTurn(ownerId, tag),
        enterDiscardStage: (ownerId, tag) => this.enterDiscardStage(ownerId, tag),
        enterNoResponsePath: () => this.enterNoResponsePath(),
        endRound: (lastAction, winnerIdArg, groups) => this.endRound(lastAction, winnerIdArg, groups),
      },
      pending,
      winnerId,
      choice,
    );
  }

  /**
   * 作用：collective 无响应时进入本地分支。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：更新 lastAction 并转到牌主 local 阶段。
   */
  private enterNoResponsePath(): void {
    const ownerId = this.pendingResponse?.ownerId;
    if (!ownerId) {
      return;
    }
    this.state.lastAction = "NO_RESPONSE";
    this.traceStep("no_response_path", `owner=${ownerId}`);
    this.scheduleOwnerLocalPhaseAfterNoResponse(ownerId);
  }

  private scheduleOwnerLocalPhaseAfterNoResponse(ownerId: string): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    const plan = planLocalPhaseAfterNoResponse(
      ownerId,
      pending.card.source,
      this.getNextPlayerId(ownerId),
      pending.responsePhaseAfterNoResponse,
    );
    this.state.currentPlayerId = plan.localOwnerId;
    this.state.currentTurnPlayerId = plan.localOwnerId;
    this.state.activeResponderId = "";
    this.state.loopStage = "transition";
    if (this.localTransitionDelayMs <= 0) {
      this.state.responseEndsAt = 0;
      this.enterOwnerLocalPhaseAfterNoResponse(ownerId);
      return;
    }
    this.clearCollectiveTimer();
    this.state.responseEndsAt = Date.now() + this.localTransitionDelayMs;
    this.collectiveTimer = setTimeout(() => {
      this.collectiveTimer = null;
      this.state.responseEndsAt = 0;
      if (this.state.phase !== "playing" || this.state.lastAction !== "NO_RESPONSE") {
        return;
      }
      this.enterOwnerLocalPhaseAfterNoResponse(ownerId);
    }, this.localTransitionDelayMs);
    this.broadcastAvailableActions();
  }

  /**
   * 作用：根据 pending 牌来源进入 local_upper/local_draw。
   * 关键输入/输出：输入 ownerId；输出无返回值。
   * 副作用：可能重绑 pending.owner，并更新 local 阶段状态字段。
   */
  private enterOwnerLocalPhaseAfterNoResponse(ownerId: string): void {
    enterOwnerLocalPhaseAfterNoResponseFlow({
      pending: this.pendingResponse,
      ownerId,
      getNextPlayerId: (playerId) => this.getNextPlayerId(playerId),
      setPendingOwner: (nextOwnerId) => {
        if (this.pendingResponse) {
          this.pendingResponse.ownerId = nextOwnerId;
        }
      },
      setResponsePhase: (phase) => {
        this.state.responsePhase = phase;
      },
      setCurrentPlayer: (nextOwnerId) => {
        this.state.currentPlayerId = nextOwnerId;
      },
      setCurrentTurnPlayer: (nextOwnerId) => {
        this.state.currentTurnPlayerId = nextOwnerId;
      },
      setLoopStageLocal: () => {
        this.state.loopStage = "local_poll";
      },
      clearActiveResponder: () => {
        this.state.activeResponderId = "";
      },
      clearResponseEndsAt: () => {
        this.state.responseEndsAt = 0;
      },
      syncAllPrivateHands: () => this.syncAllPrivateHands(),
      tickBots: () => this.tickBots(),
    });
  }

  /**
   * 作用：执行 local 吃动作并进入后续弃牌。
   * 关键输入/输出：输入 ownerId；输出无返回值。
   * 副作用：更新 lastAction 并进入手动弃牌阶段。
   */
  private executeEat(ownerId: string, candidateId?: string): boolean {
    const operationDeps = this.ops.buildOperationExecutorDeps();
    const ok = executeEatFlow(
      {
        pending: this.pendingResponse,
        executeChiOperation: (ownerIdArg, pendingCard) => {
          if (!candidateId || !this.preservesDeclaredKongsAfterAction(ownerIdArg, "chi", pendingCard, candidateId)) {
            return { ok: false };
          }
          const result = tryExecuteChi(operationDeps, ownerIdArg, pendingCard, candidateId);
          if (result.ok && pendingCard.source === "upper" && this.pendingResponse) {
            const sourceOwnerId = String(this.state.pollOriginPlayerId || this.pendingResponse.ownerId || "");
            this.ops.consumePendingDiscard(sourceOwnerId, pendingCard);
          }
          return result;
        },
        setLastAction: (action) => {
          this.state.lastAction = action;
        },
        enterDiscardStage: (ownerIdArg, tag) => this.enterDiscardStage(ownerIdArg, tag),
      },
      ownerId,
    );
    this.traceStep("execute_eat", `owner=${ownerId} ok=${ok}`);
    return ok;
  }

  /**
   * 作用：把 local_draw 中不能过出的将牌或金条作为单张牌组放入明示区。
   * 关键输入/输出：输入牌主，输出是否完成收牌。
   * 副作用：写入 exposedArea，并进入弃牌阶段。
   */
  private retainPendingSpecial(ownerId: string): boolean {
    const pending = this.pendingResponse;
    if (
      !pending ||
      pending.ownerId !== ownerId ||
      this.state.responsePhase !== "local_draw" ||
      !isDiscardRestricted(pending.card)
    ) {
      return false;
    }
    this.ops.pushExposedGroup(ownerId, [pending.card], true, "chi");
    this.state.lastAction = `${ownerId} FORCE_TAKE`;
    this.enterDiscardStage(ownerId, "FORCE_TAKE");
    this.traceStep("retain_pending_special", `owner=${ownerId} card=${this.formatTraceCard(pending.card)}`);
    return true;
  }

  /**
   * 作用：执行 local_upper 的 pass（抓牌）路径。
   * 关键输入/输出：输入 ownerId；输出无返回值。
   * 副作用：可能流局，或重建 collective 进行新一轮响应。
   */
  private executeGrab(ownerId: string): void {
    this.traceStep("execute_grab", `owner=${ownerId}`);
    executeGrabFlow(
      {
        pending: this.pendingResponse,
        deck: this.deck,
        shouldEndDrawAfterUpperPass,
        endRound: (lastAction) => this.endRound(lastAction),
        setDeckCount: (deckCount) => {
          this.state.deckCount = deckCount;
        },
        setupCollectiveAfterGrab: (ownerIdArg, card) => {
          const previousPlayerId = this.getPreviousPlayerId(ownerIdArg);
          this.pendingResponse = createPendingResponse(previousPlayerId, card, "upper", "local_draw");
          this.state.responsePhase = "collective";
          this.ops.setResponseCard(card, "upper");
          this.state.currentPlayerId = ownerIdArg;
          this.state.currentTurnPlayerId = ownerIdArg;
          this.state.previousPlayerId = previousPlayerId;
          this.state.loopStage = "global_poll";
          this.state.activeResponderId = "";
          this.state.pollOriginPlayerId = previousPlayerId;
          this.state.responseEndsAt = 0;
        },
        setLastAction: (action) => {
          this.state.lastAction = action;
        },
        syncAllPrivateHands: () => this.syncAllPrivateHands(),
        startCollectivePolling: () => this.startCollectivePolling(),
      },
      ownerId,
    );
  }

  /**
   * 作用：执行 local_draw 的 pass_to_next 路径。
   * 关键输入/输出：输入 ownerId；输出无返回值。
   * 副作用：将响应牌入弃牌并推进到下家。
   */
  private executePassToNext(ownerId: string): void {
    this.traceStep("execute_pass_to_next", `owner=${ownerId}`);
    executePassToNextFlow(
      {
        pending: this.pendingResponse,
        pushDiscard: (ownerIdArg, card) => this.ops.pushDiscard(ownerIdArg, card),
        setLastAction: (action) => {
          this.state.lastAction = action;
        },
        advanceToNextOwner: (ownerIdArg, card) => this.advanceToNextOwner(ownerIdArg, card),
      },
      ownerId,
    );
  }

  /**
   * 作用：将当前响应牌交给下家并启动新的 collective。
   * 关键输入/输出：输入当前牌主和待传递牌；输出无返回值。
   * 副作用：重建 pending、切换 current/previous/pollOrigin 并开始轮询。
   */
  private advanceToNextOwner(currentOwnerId: string, cardToNext: Card): void {
    this.traceStep("advance_to_next_owner", `from=${currentOwnerId} card=${this.formatTraceCard(cardToNext)}`);
    advanceToNextOwnerFlow(
      {
        getNextPlayerId: (ownerId) => this.getNextPlayerId(ownerId),
        createPendingResponse: ({ ownerId, card, source }) => createPendingResponse(ownerId, card, source),
        setPendingResponse: (pending) => {
          this.pendingResponse = pending;
        },
        setCurrentPlayer: (ownerId) => {
          this.state.currentPlayerId = ownerId;
        },
        setResponsePhaseCollective: () => {
          this.state.responsePhase = "collective";
        },
        setResponseCard: (card, source) => this.ops.setResponseCard(card, source),
        setCurrentTurnPlayer: (ownerId) => {
          this.state.currentTurnPlayerId = ownerId;
        },
        setPreviousPlayer: (ownerId) => {
          this.state.previousPlayerId = ownerId;
        },
        setLoopStageGlobal: () => {
          this.state.loopStage = "global_poll";
        },
        clearActiveResponder: () => {
          this.state.activeResponderId = "";
        },
        clearResponseEndsAt: () => {
          this.state.responseEndsAt = 0;
        },
        setPollOriginPlayer: (ownerId) => {
          this.state.pollOriginPlayerId = ownerId;
        },
        syncAllPrivateHands: () => this.syncAllPrivateHands(),
        startCollectivePolling: () => this.startCollectivePolling(),
      },
      currentOwnerId,
      cardToNext,
    );
  }

  private buildRoundResultPlayers(winnerId: string | null, groups: string[]): RoundResultPlayer[] {
    return buildRoundResultPlayersFlow(
      this.playerOrder,
      this.state.players,
      this.playerHands,
      (card) => this.ops.toPlainCard(card),
      winnerId,
      groups,
      this.pendingResponse?.card ? { ...this.pendingResponse.card } : null,
    );
  }

  private buildRemainingDeckPreview(): Card[] {
    return this.deck.slice(0, 8).map((card) => ({ ...card }));
  }

  private countHiddenTriplets(cards: Card[]): number {
    const counter = new Map<string, number>();
    for (const card of cards) {
      const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    let total = 0;
    for (const count of counter.values()) {
      total += Math.floor(count / 3);
    }
    return total;
  }

  private removeCardsByIdFromHand(hand: Card[], cardIds: string[]): Card[] {
    if (!cardIds.length) {
      return [...hand];
    }
    const wanted = new Set(cardIds);
    return hand.filter((card) => !wanted.has(card.id));
  }

  private preservesDeclaredKongsAfterAction(
    seatId: string,
    action: "kai" | "peng" | "chi",
    pendingCard: Card,
    candidateId?: string,
  ): boolean {
    const player = this.state.players.get(seatId);
    const declaredKongs = Number(player?.declaredKongs ?? 0);
    if (declaredKongs <= 0) {
      return true;
    }
    const handNoPending = this.ops.getHandWithoutPending(seatId, pendingCard);
    if (action === "kai") {
      const picked = buildKaiCandidates(handNoPending, pendingCard, this.ops.getWildcardPoolCards(seatId)).find(
        (item) => item.candidate.id === candidateId,
      );
      if (!picked) {
        return false;
      }
      const nextHand = this.removeCardsByIdFromHand(handNoPending, picked.plan.handCards.map((card) => card.id));
      return this.countHiddenTriplets(nextHand) >= Math.max(0, declaredKongs - 1);
    }
    if (action === "peng") {
      const picked = buildPengCandidates(handNoPending, pendingCard).find((item) => item.candidate.id === candidateId);
      if (!picked) {
        return false;
      }
      const nextHand = this.removeCardsByIdFromHand(handNoPending, picked.plan.handCards.map((card) => card.id));
      return this.countHiddenTriplets(nextHand) >= declaredKongs;
    }
    const picked = buildChiCandidates(handNoPending, pendingCard, this.ops.getWildcardPoolCards(seatId)).find(
      (item) => item.candidate.id === candidateId,
    );
    if (!picked) {
      return false;
    }
    const nextHand = this.removeCardsByIdFromHand(handNoPending, picked.plan.handCards.map((card) => card.id));
    return this.countHiddenTriplets(nextHand) >= declaredKongs;
  }

  private consumeDeclaredKongForKai(seatId: string): void {
    const player = this.state.players.get(seatId);
    if (!player) {
      return;
    }
    player.declaredKongs = Math.max(0, Number(player.declaredKongs ?? 0) - 1);
  }

  private backToLobby(): void {
    resetToLobby({
      state: this.state,
      playerOrder: this.playerOrder,
      botIds: this.botIds,
      configuredBotIds: this.configuredBotIds,
      playerHands: this.playerHands,
      baseNameBySeat: this.baseNameBySeat,
      seatBySession: this.seatBySession,
      seatByToken: this.seatByToken,
      targetSeats: this.targetSeats,
      resetRuntime: () => {
        this.clearAllTakeoverTimers();
        this.clearBotTimer();
        this.clearDeclareTimer();
        this.clearDeclareIntroTimer();
        this.resetCollectivePolling();
        this.deck = [];
        this.pendingResponse = null;
        this.pendingFishDeclarations.clear();
        this.publicGeneralPool = [];
        this.dealerCard = null;
        this.dealerPickerId = null;
        this.nextRoundSetup = null;
        this.awaitingDiscardOwnerId = null;
        this.lastTerminalFingerprint = "";
        this.huLogDedup.clear();
        this.huChecksTotal = 0;
        this.huChecksValid = 0;
        this.huChecksBySeat.clear();
        this.roundDealerId = null;
      },
      syncAllPrivateHands: () => this.syncAllPrivateHands(),
      broadcastAvailableActions: () => this.broadcastAvailableActions(),
    });
    if (this.state.roomMode === "practice") {
      for (const seatId of [...this.configuredBotIds]) {
        this.removeSeat(seatId, false);
      }
      this.broadcastAvailableActions();
    }
    for (const seatId of this.playerOrder) {
      const player = this.state.players.get(seatId);
      if (player && !player.isConfiguredBot && !player.connected) {
        this.scheduleSeatRelease(seatId);
      }
    }
    if (!this.state.players.get(this.state.hostPlayerId)?.connected) {
      this.transferHostToLowestOnlineHuman();
    }
  }

  private endRound(lastAction: string, winnerId: string | null = null, groups: string[] = []): void {
    if (winnerId) {
      const previewPlayers = this.buildRoundResultPlayers(winnerId, groups);
      const winnerView = previewPlayers.find((player) => player.clientId === winnerId);
      this.prepareNextRoundSetup(winnerId, winnerView?.huType ?? null);
    } else {
      this.prepareNextRoundSetup(null, null);
    }
    endRoundFlow(
      {
        state: this.state,
        resetCollectivePolling: () => this.resetCollectivePolling(),
        clearBotTimer: () => this.clearBotTimer(),
        setPendingResponseNull: () => {
          this.pendingResponse = null;
        },
        setAwaitingDiscardOwnerNull: () => {
          this.awaitingDiscardOwnerId = null;
        },
        broadcast: (event, payload) => {
          if (event === "round_result") {
            this.lastRoundResult = payload as {
              winnerId: string | null;
              groups: string[];
              players: RoundResultPlayer[];
              remainingDeck: Card[];
            };
          }
          this.broadcast(event, payload);
        },
        buildRoundResultPlayers: (winnerIdArg, groupArgs) => this.buildRoundResultPlayers(winnerIdArg, groupArgs),
        buildRemainingDeckPreview: () => this.buildRemainingDeckPreview(),
        broadcastAvailableActions: () => this.broadcastAvailableActions(),
      },
      lastAction,
      winnerId,
      groups,
    );
  }

  private getAvailableActions(seatId: string, probeCollectiveResponder = false): AvailableActionEntry[] {
    const hand = this.playerHands.get(seatId) ?? [];
    const entries = getAvailableActionsFlow({
      phase: this.state.phase,
      seatId,
      pending: this.pendingResponse,
      responsePhase: this.state.responsePhase,
      collectiveResponderId: this.collectiveResponderId,
      probeCollectiveResponder,
      awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
      hand,
      wildcardPool: [],
      explainHuForSeat: (seatIdArg, handArg, responseCard) =>
        this.ops.explainHuForSeat(seatIdArg, handArg, responseCard, this.getHuWildcardCount()),
      logHuCheck: (stage, seatIdArg, handArg, response, valid) => this.logHuCheck(stage, seatIdArg, handArg, response, valid),
      getHandWithoutPending: (seatIdArg, pendingCard) => this.ops.getHandWithoutPending(seatIdArg, pendingCard),
      getNextPlayerId: (seatIdArg) => this.getNextPlayerId(seatIdArg),
    });
    const pendingCard = this.pendingResponse?.card;
    if (!pendingCard) {
      return entries;
    }
    return entries.map((entry) => {
      if (entry.action === "pass") {
        return entry;
      }
      if ((entry.action !== "kai" && entry.action !== "peng" && entry.action !== "chi") || !entry.candidates?.length) {
        return entry;
      }
      const meldAction = entry.action;
      const filtered = entry.candidates.filter((candidate) =>
        this.preservesDeclaredKongsAfterAction(seatId, meldAction, pendingCard, candidate.id),
      );
      return {
        ...entry,
        enabled: entry.deferred ? false : filtered.length > 0,
        candidates: filtered,
        deferred: entry.deferred && filtered.length > 0,
      };
    });
  }

  // ===== 日志与广播 =====

  /**
   * 作用：向每位在线玩家广播其当前可执行动作。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：发送 `available_actions`，并可触发状态快照日志。
   */
  private broadcastAvailableActions(): void {
    this.syncRoomMetadata();
    this.logStateSnapshot("STATE");
    for (const client of this.clients) {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId) {
        client.send("room_snapshot", this.buildRoomSnapshot());
        continue;
      }
      // 每个客户端都需要拿到自己的私有快照，否则一旦 `private_hand`
      // 消息因时序错过，前端就只能看到公共桌面状态而看不到自己的手牌。
      client.send("room_snapshot", this.buildClientRoomSnapshot(seatId));
      this.sendAvailableActionsToClient(client, seatId);
    }
  }

  private sendAvailableActionsToClient(client: Client, seatId: string): void {
    client.send("available_actions", {
      items: this.getAvailableActions(seatId),
      decisionTimer: this.buildDecisionTimerSnapshot(seatId),
    });
  }

  private buildCardSnapshot(card: CardSchema | null | undefined): {
    id: string;
    color: string;
    type: string;
    source?: "upper" | "draw";
    isResponseCard?: boolean;
  } | null {
    if (!card?.id || !card?.color || !card?.type) {
      return null;
    }
    const source = card.source === "draw" || card.source === "upper" ? card.source : undefined;
    return {
      id: card.id,
      color: card.color,
      type: card.type,
      source,
      isResponseCard: Boolean(card.isResponseCard),
    };
  }

  private buildCardListSnapshot(cards: ArrayLike<CardSchema>): Array<{
    id: string;
    color: string;
    type: string;
    source?: "upper" | "draw";
    isResponseCard?: boolean;
  }> {
    const out: Array<{
      id: string;
      color: string;
      type: string;
      source?: "upper" | "draw";
      isResponseCard?: boolean;
    }> = [];
    for (let i = 0; i < cards.length; i += 1) {
      const snapshot = this.buildCardSnapshot(cards[i]);
      if (snapshot) {
        out.push(snapshot);
      }
    }
    return out;
  }

  private buildRoomSnapshot() {
    this.updatePublicHandCounts();
    return {
      roomId: this.roomId,
      roomMode: this.state.roomMode,
      phase: this.state.phase,
      hostPlayerId: this.state.hostPlayerId,
      dealerId: this.state.dealerId,
      dealerPickerId: this.state.dealerPickerId,
      currentPlayerId: this.state.currentPlayerId,
      currentTurnPlayerId: this.state.currentTurnPlayerId,
      previousPlayerId: this.state.previousPlayerId,
      pollOriginPlayerId: this.state.pollOriginPlayerId,
      activeResponderId: this.state.activeResponderId,
      responsePhase: this.state.responsePhase,
      responseEndsAt: this.state.responseEndsAt,
      lastAction: this.state.lastAction,
      deckCount: this.state.deckCount,
      isMoCard: this.state.isMoCard,
      targetCard: this.buildCardSnapshot(this.state.targetCard),
      responseCard: this.buildCardSnapshot(this.state.responseCard),
      dealerCard: this.dealerCard
        ? {
            id: this.dealerCard.id,
            color: this.dealerCard.color,
            type: this.dealerCard.type,
            source: this.dealerCard.source === "draw" ? "draw" : "upper",
          }
        : null,
      publicDiscardPile: this.buildCardListSnapshot(this.state.publicDiscardPile),
      publicGeneralPool: [...this.publicGeneralPool].map((card) => ({
        id: card.id,
        color: card.color,
        type: card.type,
        source: card.source === "draw" ? "draw" : "upper",
      })),
      declareEndsAt: this.state.declareEndsAt,
      players: this.playerOrder
        .map((seatId) => this.state.players.get(seatId))
        .filter((player): player is PlayerState => Boolean(player))
        .map((player) => ({
          clientId: player.clientId,
          seatIndex: player.seatIndex,
          name: player.name,
          handCount: player.handCount,
          declaredKongs: player.declaredKongs,
          declaredReady: player.declaredReady,
          isBot: player.isBot,
          isConfiguredBot: player.isConfiguredBot,
          botStrength: player.botStrength,
          connected: player.connected,
          discardPile: this.buildCardListSnapshot(player.discardPile),
          exposedArea: this.buildCardListSnapshot(player.exposedArea),
          exposedGroupSizes: Array.from(player.exposedGroupSizes),
          exposedGroupKinds: Array.from(player.exposedGroupKinds),
          generalArea: this.buildCardListSnapshot(player.generalArea),
          wildcardPool: this.buildCardListSnapshot(player.wildcardPool),
          fishArea: this.buildCardListSnapshot(player.fishArea),
        })),
      roundResult: this.state.phase === "ended" ? this.lastRoundResult : null,
    };
  }

  private buildClientRoomSnapshot(seatId: string) {
    return {
      ...this.buildRoomSnapshot(),
      privateHand: (this.playerHands.get(seatId) ?? []).map((card) => ({
        ...card,
        isHidden: false,
      })),
      availableActions: this.getAvailableActions(seatId),
      decisionTimer: this.buildDecisionTimerSnapshot(seatId),
      roundResult: this.state.phase === "ended" ? this.lastRoundResult : null,
    };
  }

  getPrivateStateByToken(token: string): PrivateStateSnapshot | null {
    const seatId = this.seatByToken.get(token);
    if (!seatId) {
      return null;
    }
    return {
      seatId,
      roomId: this.roomId,
      privateHand: (this.playerHands.get(seatId) ?? []).map((card) => ({
        ...card,
        isHidden: false,
      })),
      availableActions: this.getAvailableActions(seatId),
      decisionTimer: this.buildDecisionTimerSnapshot(seatId),
      roundResult: this.state.phase === "ended" ? this.lastRoundResult : null,
    };
  }

  private syncRoomMetadata(): void {
    // Flow unit tests exercise room methods without MatchMaker initialization.
    // A real Colyseus room receives its private listing before onCreate().
    if (!("_listing" in this)) {
      return;
    }
    void this.setMetadata({
      phase: this.state.phase,
      roomMode: this.state.roomMode,
      hostPlayerId: this.state.hostPlayerId,
      occupiedSeats: this.playerOrder.length,
    });
  }

  private updatePublicHandCounts(): void {
    for (const [seatId, player] of this.state.players.entries()) {
      player.handCount = this.playerHands.get(seatId)?.length ?? 0;
    }
  }

  private declareNoDiscardWin(ownerId: string, tag: string): void {
    this.traceStep("no_discard_win", `owner=${ownerId} tag=${tag}`);
    this.endRound(`${ownerId} HU`, ownerId, []);
  }

  /**
   * 作用：按配置输出房间阶段快照日志。
   * 关键输入/输出：输入标签；输出无返回值。
   * 副作用：写控制台日志，并在结束阶段输出胡牌统计汇总。
   */
  private logStateSnapshot(tag: string): void {
    if (!this.logEnabled || !this.shouldLogStateSnapshot()) {
      return;
    }
    const fp = `${this.state.phase}|${this.state.responsePhase}|${this.state.currentPlayerId}|${this.state.lastAction}|${this.state.deckCount}`;
    if (fp === this.lastTerminalFingerprint) {
      return;
    }
    this.lastTerminalFingerprint = fp;
    const line =
      `[${new Date().toISOString()}] ` +
      `[room:${this.roomId}] ` +
      `[${tag}] phase=${this.state.phase} response=${this.state.responsePhase} ` +
      `current=${this.state.currentPlayerId || "-"} deck=${this.state.deckCount} action=${this.state.lastAction || "-"}`;
    if (!this.roomLogCards) {
      console.log(line);
      if (this.state.phase === "ended") {
        this.logHuSummary();
      }
      return;
    }
    console.log(`${line} | players=${this.summarizeAllPlayersCards()}`);
    if (this.state.phase === "ended") {
      this.logHuSummary();
    }
  }

  private shouldLogStateSnapshot(): boolean {
    return shouldLogStateSnapshotUtil(this.stateLogMode, this.state.lastAction || "", COMPACT_STATE_ACTIONS);
  }

  private summarizeAllPlayersCards(): string {
    return summarizeAllPlayersCards(this.playerOrder, this.playerHands, this.state.players);
  }

  private getHuWildcardCount(): number {
    // Wildcards are now passed by per-seat wildcardPool in explainHuForSeat.
    return 0;
  }

  private summarizeCards(cards: Card[]): string {
    return summarizeCards(cards);
  }

  private formatTraceCard(card: Card | null | undefined): string {
    if (!card) {
      return "-";
    }
    const src = card.source ?? "upper";
    return `${card.color}:${card.type}#${card.id}@${src}`;
  }

  private traceStep(event: string, extra = ""): void {
    if (!this.traceEnabled) {
      return;
    }
    const pending = this.pendingResponse;
    const base =
      `[${new Date().toISOString()}] [room:${this.roomId}] [TRACE] ${event}` +
      ` phase=${this.state.phase}` +
      ` response=${this.state.responsePhase}` +
      ` current=${this.state.currentPlayerId || "-"}` +
      ` owner=${pending?.ownerId ?? "-"}` +
      ` responder=${this.collectiveResponderId ?? "-"}` +
      ` awaiting=${this.awaitingDiscardOwnerId ?? "-"}` +
      ` cursor=${this.collectiveCursor}/${this.collectiveQueue.length}` +
      ` deck=${this.state.deckCount}` +
      ` last=${this.state.lastAction || "-"}`;
    const cardPart = this.traceCards ? ` card=${this.formatTraceCard(pending?.card)}` : "";
    const extraPart = extra ? ` | ${extra}` : "";
    console.log(`${base}${cardPart}${extraPart}`);
  }

  /**
   * 作用：记录一次胡牌判定探针日志并累计统计。
   * 关键输入/输出：输入判定上下文；输出无返回值。
   * 副作用：更新 `huChecks*` 统计并按配置输出日志。
   */
  private logHuCheck(stage: string, seatId: string, hand: Card[], response: Card, valid: boolean): void {
    this.huChecksTotal += 1;
    if (valid) {
      this.huChecksValid += 1;
    }
    const seatStats = this.huChecksBySeat.get(seatId) ?? { total: 0, valid: 0 };
    seatStats.total += 1;
    if (valid) {
      seatStats.valid += 1;
    }
    this.huChecksBySeat.set(seatId, seatStats);

    if (!this.logEnabled || !this.huLogEnabled || this.huLogMode === "off") {
      return;
    }
    if (this.huLogMode === "success" && !valid) {
      return;
    }
    if (this.huLogMode === "fail" && valid) {
      return;
    }

    const fp = `${stage}|${seatId}|${response.id}|${response.color}:${response.type}|hand=${hand.length}|wild=${this.getHuWildcardCount()}|valid=${valid}|deck=${this.state.deckCount}|action=${this.state.lastAction}`;
    if (this.huLogDedup.has(fp)) {
      return;
    }
    this.huLogDedup.add(fp);
    if (this.huLogDedup.size > 2000) {
      this.huLogDedup.clear();
    }
    const cardsPart = this.huLogCards
      ? `|seatCards=${this.summarizeCards(hand)}|players=${this.summarizeAllPlayersCards()}`
      : "";
    console.log(`[${new Date().toISOString()}] [room:${this.roomId}] [HU_CHECK] ${fp}${cardsPart}`);
  }

  /**
   * 作用：输出当前局胡牌判定统计汇总。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：写控制台日志。
   */
  private logHuSummary(): void {
    if (!this.logEnabled) {
      return;
    }
    const seatPart = this.playerOrder
      .map((seatId) => {
        const s = this.huChecksBySeat.get(seatId) ?? { total: 0, valid: 0 };
        return `${seatId}:${s.valid}/${s.total}`;
      })
      .join(",");
    console.log(
      `[${new Date().toISOString()}] [room:${this.roomId}] [HU_SUMMARY] valid=${this.huChecksValid}/${this.huChecksTotal} bySeat=${seatPart}`,
    );
  }

  private syncAllPrivateHands(): void {
    this.updatePublicHandCounts();
    syncAllPrivateHandsFlow(this.clients, this.seatBySession, this.playerHands);
  }

  private syncClientState(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      client.send("room_snapshot", this.buildRoomSnapshot());
      return;
    }
    const token = this.findTokenBySeatId(seatId);
    if (token) {
      this.sendSessionToken(client, seatId, token, true);
    }
    client.send("room_snapshot", this.buildClientRoomSnapshot(seatId));
    this.sendAvailableActionsToClient(client, seatId);
    const hand = this.playerHands.get(seatId) ?? [];
    if (this.logEnabled) {
      console.log(
        `[sync_state] room=${this.roomId} session=${client.sessionId} seat=${seatId} phase=${this.state.phase} hand=${hand.length} actions=${this.getAvailableActions(seatId).length}`,
      );
    }
    client.send("private_hand", {
      cards: hand.map((card) => ({
        ...card,
        isHidden: false,
      })),
    });
  }

  private getNextPlayerId(playerId: string): string {
    return getNextPlayerIdOrder(this.playerOrder, playerId);
  }

  private getPreviousPlayerId(playerId: string): string {
    return getPreviousPlayerIdOrder(this.playerOrder, playerId);
  }

  private getOppositePlayerId(playerId: string): string {
    const index = this.playerOrder.indexOf(playerId);
    if (index < 0 || this.playerOrder.length === 0) {
      return this.playerOrder[0] ?? "";
    }
    return this.playerOrder[(index + Math.floor(this.playerOrder.length / 2)) % this.playerOrder.length] ?? playerId;
  }

  private prepareNextRoundSetup(winnerId: string | null, huType: "small" | "big" | null): void {
    if (winnerId && huType === "small") {
      this.nextRoundSetup = { mode: "fixed", dealerId: winnerId };
      return;
    }
    if (winnerId && huType === "big") {
      this.nextRoundSetup = { mode: "picker", pickerId: this.getOppositePlayerId(winnerId) };
      return;
    }
    const fallbackDealerId = this.roundDealerId && this.state.players.has(this.roundDealerId)
      ? this.roundDealerId
      : this.playerOrder[0];
    if (fallbackDealerId) {
      this.nextRoundSetup = { mode: "fixed", dealerId: fallbackDealerId };
    }
  }

  // ===== AI 与计时器 =====

  /**
   * 作用：根据当前阶段推进机器人或超时调度。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：可能安排 bot 计时器、collective 超时或广播动作面板。
   */
  private tickBots(): void {
    const pending = this.pendingResponse;
    const plan = planTickBots({
      hasPending: !!pending,
      phase: this.state.phase,
      responsePhase: this.state.responsePhase,
      collectiveResponderId: this.collectiveResponderId,
      pendingOwnerId: pending?.ownerId ?? "",
      hasCollectiveTimer: !!this.collectiveTimer,
      isBot: (seatId) => this.botIds.has(seatId),
    });
    this.traceStep("tick_bots", `plan=${plan} pending=${pending ? "yes" : "no"}`);
    if (plan === "clear_and_broadcast") {
      this.clearBotTimer();
      this.clearCollectiveTimer();
      this.broadcastAvailableActions();
      return;
    }
    if (plan === "start_collective") {
      this.startCollectivePolling();
      return;
    }
    if (plan === "schedule_bot_collective") {
      this.clearCollectiveTimer();
      this.scheduleBotStep();
      this.broadcastAvailableActions();
      return;
    }
    if (plan === "schedule_collective_timeout") {
      this.scheduleCollectiveTimeout();
      this.broadcastAvailableActions();
      return;
    }
    if (plan === "schedule_bot_owner") {
      this.clearCollectiveTimer();
      this.scheduleBotStep();
      this.broadcastAvailableActions();
      return;
    }
    this.broadcastAvailableActions();
  }

  private clearBotTimer(): void {
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  private clearCollectiveTimer(): void {
    if (this.collectiveTimer) {
      clearTimeout(this.collectiveTimer);
      this.collectiveTimer = null;
    }
    this.state.responseEndsAt = 0;
  }

  private resetCollectivePolling(): void {
    this.clearCollectiveTimer();
    this.collectiveQueue = [];
    this.collectiveCursor = 0;
    this.collectiveResponderId = null;
    this.state.activeResponderId = "";
  }

  /**
   * 作用：启动 collective 轮询（构队列并进入 advance）。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：重置轮询游标、设置 activeResponder，并调度下一步。
   */
  private startCollectivePolling(): void {
    this.traceStep("start_collective_polling");
    startCollectiveFlow({
      pending: this.pendingResponse,
      responsePhase: this.state.responsePhase,
      pollOriginPlayerId: this.state.pollOriginPlayerId,
      setLoopStageGlobal: () => {
        this.state.loopStage = "global_poll";
      },
      setPollOriginPlayerId: (id) => {
        this.state.pollOriginPlayerId = id;
      },
      clearBotTimer: () => this.clearBotTimer(),
      clearCollectiveTimer: () => this.clearCollectiveTimer(),
      setQueue: (queue) => {
        this.collectiveQueue = queue;
      },
      getOrder: (pending) => this.getCollectiveOrder(pending as PendingResponse),
      resetCursorAndResponder: () => {
        this.collectiveCursor = 0;
        this.collectiveResponderId = null;
      },
      advance: () => this.advanceCollectivePolling(),
      resetAndBroadcast: () => {
        this.resetCollectivePolling();
        this.broadcastAvailableActions();
      },
    });
  }

  /**
   * 作用：按当前 pending 构造 collective 顺序。
   * 关键输入/输出：输入 pending；输出轮询 seatId 列表。
   * 副作用：无。
   */
  private getCollectiveOrder(pending: PendingResponse): string[] {
    return getCollectiveOrder(this.playerOrder, pending);
  }

  /**
   * 作用：为当前 collective 响应者设置超时自动 pass。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：设置 `collectiveTimer`，超时后写入 pass 并推进游标。
   */
  private scheduleCollectiveTimeout(timeoutOverrideMs?: number, preserveExtensionState = false): void {
    const isCollectivePhase = this.state.responsePhase === "collective";
    const baseTimeoutMs = isCollectivePhase ? this.collectiveTimeoutMs : this.localTimeoutMs;
    const timeoutMs = Math.max(1, timeoutOverrideMs ?? baseTimeoutMs);
    if (this.collectiveTimer) {
      clearTimeout(this.collectiveTimer);
      this.collectiveTimer = null;
    }
    if (!preserveExtensionState) {
      this.responseTimeExtensionUsed = false;
      this.responseTimerTotalMs = baseTimeoutMs;
      this.responseDecisionWindowId += 1;
    }
    const decisionSeatId = isCollectivePhase ? this.collectiveResponderId ?? "" : this.pendingResponse?.ownerId ?? "";
    if (decisionSeatId && this.isPracticeDecisionUntimed(decisionSeatId)) {
      this.responseTimerTotalMs = 0;
      this.state.responseEndsAt = 0;
      this.traceStep(
        "practice_human_untimed",
        `phase=${this.state.responsePhase} seat=${decisionSeatId} awaiting=${this.awaitingDiscardOwnerId ?? "-"}`,
      );
      return;
    }
    this.state.responseEndsAt = Date.now() + timeoutMs;
    this.traceStep(
      "schedule_collective_timeout",
      `phase=${this.state.responsePhase} ms=${timeoutMs} awaiting=${this.awaitingDiscardOwnerId ?? "-"}`,
    );
    this.collectiveTimer = setTimeout(() => {
      this.collectiveTimer = null;
      const pending = this.pendingResponse;
      if (!pending || this.state.phase !== "playing") {
        this.traceStep("collective_timeout_skip");
        return;
      }
      if (this.state.responsePhase === "collective") {
        const responderId = this.collectiveResponderId;
        if (!responderId) {
          this.traceStep("collective_timeout_skip");
          return;
        }
        if (pending.collectives.has(responderId)) {
          this.traceStep("collective_timeout_already_responded", `responder=${responderId}`);
          return;
        }
        pending.collectives.set(responderId, { action: "pass" });
        this.collectiveCursor += 1;
        this.state.lastAction = `${responderId} TIMEOUT_PASS`;
        this.traceStep("collective_timeout_pass", `responder=${responderId}`);
        this.advanceCollectivePolling();
        return;
      }

      const ownerId = pending.ownerId;
      if (this.state.responsePhase === "local_upper") {
        this.traceStep("local_timeout_pass_upper", `owner=${ownerId}`);
        this.executeGrab(ownerId);
        this.state.lastAction = `${ownerId} TIMEOUT_PASS`;
        return;
      }

      if (this.state.responsePhase === "local_draw") {
        const idleAction = resolveLocalDrawIdleAction(this.awaitingDiscardOwnerId === ownerId, pending.card);
        if (idleAction === "discard") {
          this.traceStep("local_timeout_discard", `owner=${ownerId}`);
          this.discardFromAndCollective(ownerId);
          this.state.lastAction = `${ownerId} TIMEOUT_DISCARD`;
          return;
        }
        if (idleAction === "retain_special") {
          this.traceStep("local_timeout_retain_special", `owner=${ownerId}`);
          this.retainPendingSpecial(ownerId);
          return;
        }
        this.traceStep("local_timeout_pass_draw", `owner=${ownerId}`);
        this.executePassToNext(ownerId);
        this.state.lastAction = `${ownerId} TIMEOUT_PASS`;
        return;
      }

      this.traceStep("collective_timeout_skip", `phase=${this.state.responsePhase}`);
    }, timeoutMs);
  }

  /**
   * 作用：推进 collective 轮询到下一响应者或决议完成。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：更新 responder/cursor/currentPlayer，并触发 bot/超时调度。
   */
  private advanceCollectivePolling(): void {
    this.traceStep("advance_collective_polling:begin");
    advanceCollectiveFlow({
      pending: this.pendingResponse,
      hasResponded: (seatId) => this.pendingResponse?.collectives.has(seatId) ?? false,
      responsePhase: this.state.responsePhase,
      clearBotTimer: () => this.clearBotTimer(),
      clearCollectiveTimer: () => this.clearCollectiveTimer(),
      queue: this.collectiveQueue,
      cursor: this.collectiveCursor,
      hasActionBeyondPass: (seatId) => this.hasCollectiveActionBeyondPass(seatId),
      setCollectivePass: (seatId) => {
        this.pendingResponse?.collectives.set(seatId, { action: "pass" });
      },
      setCursor: (cursor) => {
        this.collectiveCursor = cursor;
      },
      setResponder: (responderId) => {
        this.collectiveResponderId = responderId;
      },
      setActiveResponder: (responderId) => {
        this.state.activeResponderId = responderId;
      },
      setCurrentPlayer: (seatId) => {
        this.state.currentPlayerId = seatId;
      },
      setCurrentTurnPlayer: (seatId) => {
        this.state.currentTurnPlayerId = seatId;
      },
      isBot: (seatId) => this.botIds.has(seatId),
      scheduleBotStep: () => this.scheduleBotStep(),
      scheduleCollectiveTimeout: () => this.scheduleCollectiveTimeout(),
      broadcastAvailableActions: () => this.broadcastAvailableActions(),
      clearResponseEndsAt: () => {
        this.state.responseEndsAt = 0;
      },
      resolveCollectivePhase: () => this.resolveCollectivePhase(),
      resetAndBroadcast: () => {
        this.resetCollectivePolling();
        this.broadcastAvailableActions();
      },
    });
    this.traceStep("advance_collective_polling:end");
  }

  /**
   * 作用：安排下一次机器人思考步进。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：设置 `botTimer` 或立即执行 `runBotStepNow`。
   */
  private scheduleBotStep(): void {
    if (this.botThinkMaxMs <= 0) {
      this.traceStep("schedule_bot_step:immediate");
      this.runBotStepNow();
      return;
    }
    if (this.botTimer) {
      this.traceStep("schedule_bot_step:already_scheduled");
      return;
    }
    const delayMs = this.randomBotThinkDelayMs();
    this.traceStep("schedule_bot_step", `delayMs=${delayMs}`);
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.traceStep("bot_step_timer_fire");
      this.runBotStepNow();
    }, delayMs);
  }

  private randomBotThinkDelayMs(): number {
    if (this.botThinkMaxMs <= this.botThinkMinMs) {
      return this.botThinkMinMs;
    }
    return this.botThinkMinMs + Math.floor(Math.random() * (this.botThinkMaxMs - this.botThinkMinMs + 1));
  }

  /**
   * 作用：立即执行一次机器人动作。
   * 关键输入/输出：无入参；输出无返回值。
   * 副作用：可能写入动作选择、推进轮询或触发本地动作。
   */
  private runBotStepNow(): void {
    const pending = this.pendingResponse;
    if (!pending) {
      this.traceStep("run_bot_step_skip:no_pending");
      this.broadcastAvailableActions();
      return;
    }
    this.traceStep("run_bot_step", `owner=${pending.ownerId} responder=${this.collectiveResponderId ?? "-"}`);
    runBotStep({
      phase: this.state.phase,
      responsePhase: this.state.responsePhase,
      pendingOwnerId: pending.ownerId,
      pendingCard: pending.card,
      collectiveResponderId: this.collectiveResponderId,
      isBot: (seatId) => this.botIds.has(seatId),
      awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
      getAvailableActions: (seatId) => this.getAvailableActions(seatId),
      chooseAction: (seatId, actions) =>
        chooseBotAction({
          hand: this.playerHands.get(seatId) ?? [],
          pendingCard: pending.card,
          actions,
          visibleCards: this.buildBotVisibleCards(),
          strength: this.state.players.get(seatId)?.botStrength ?? 50,
        }),
      chooseDiscardCardId: (seatId) =>
        chooseBotDiscard({
          hand: this.playerHands.get(seatId) ?? [],
          visibleCards: this.buildBotVisibleCards(),
          strength: this.state.players.get(seatId)?.botStrength ?? 50,
        })?.id ?? null,
      setCollectiveChoice: (seatId, choice) => {
        this.pendingResponse?.collectives.set(seatId, choice);
        this.collectiveCursor += 1;
      },
      advanceCollectivePolling: () => this.advanceCollectivePolling(),
      broadcastAvailableActions: () => this.broadcastAvailableActions(),
      discardFromAndCollective: (ownerId, cardId) => this.discardFromAndCollective(ownerId, cardId),
      executeEat: (ownerId, candidateId) => this.executeEat(ownerId, candidateId),
      retainPendingSpecial: (ownerId) => this.retainPendingSpecial(ownerId),
      executeGrab: (ownerId) => this.executeGrab(ownerId),
      executePassToNext: (ownerId) => this.executePassToNext(ownerId),
    });
  }

  private buildBotVisibleCards(): Card[] {
    const visibleById = new Map<string, Card>();
    const addVisible = (card: Card) => {
      if (card.id) {
        visibleById.set(card.id, { ...card });
      }
    };
    for (const card of this.publicGeneralPool) {
      addVisible(card);
    }
    for (const card of this.state.publicDiscardPile) {
      addVisible(this.ops.toPlainCard(card));
    }
    for (const player of this.state.players.values()) {
      for (const area of [player.discardPile, player.exposedArea, player.generalArea, player.fishArea]) {
        for (const card of area) {
          addVisible(this.ops.toPlainCard(card));
        }
      }
    }
    return [...visibleById.values()];
  }

  // ===== 调试场景 =====

  /**
   * 作用：应用预置调试场景以复现特定流程分支。
   * 关键输入/输出：输入 seatId 与场景名；输出是否成功。
   * 副作用：覆盖局部状态并触发轮询/机器人推进。
   */
  private applyDebugScenario(seatId: string, scenario: string): boolean {
    // A scenario replaces the live decision window. Cancel callbacks queued by
    // the randomly chosen opening player first, otherwise a bot step can race
    // the injected state and make browser regressions nondeterministic.
    this.clearBotTimer();
    this.clearDeclareTimer();
    this.clearDeclareIntroTimer();
    this.clearCollectiveTimer();
    return applyDebugScenarioFlow(
      {
        state: this.state,
        playerHands: this.playerHands,
        playerOrder: this.playerOrder,
        publicGeneralPool: this.publicGeneralPool,
        nextDebugSeq: () => ++this.debugSeq,
        getNextPlayerId: (playerId) => this.getNextPlayerId(playerId),
        setPendingResponse: (value) => {
          this.pendingResponse = value;
        },
        getPendingResponse: () => this.pendingResponse,
        toSchemaCard: (card, isResponseCard, source) => this.ops.toSchemaCard(card, isResponseCard, source),
        setResponseCard: (card, source) => this.ops.setResponseCard(card, source),
        clearAwaitingDiscardOwner: () => {
          this.awaitingDiscardOwnerId = null;
        },
        updatePublicHandCounts: () => this.updatePublicHandCounts(),
        syncAllPrivateHands: () => this.syncAllPrivateHands(),
        resetCollectivePolling: () => this.resetCollectivePolling(),
        broadcastAvailableActions: () => this.broadcastAvailableActions(),
        startCollectivePolling: () => this.startCollectivePolling(),
        tickBots: () => this.tickBots(),
        endRound: (lastAction, winnerId, groups) => this.endRound(lastAction, winnerId, groups),
      },
      seatId,
      scenario,
    );
  }

}
