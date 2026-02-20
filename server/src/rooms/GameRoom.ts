import { Room, Client } from "colyseus";
import { GameState, PlayerState, CardSchema } from "../schema/game-state.schema.js";
import { createDeck, shuffle } from "../rules/deck.js";
import type { ActionType, Card } from "../rules/types.js";
import { tryExecuteChi } from "./flow/actions/chi.js";
import { tryExecuteKai } from "./flow/actions/kai.js";
import { tryExecutePeng } from "./flow/actions/peng.js";
import { executeResponseWinner } from "./flow/response-winner.js";
import { applyDebugScenario as applyDebugScenarioFlow } from "./flow/debug-scenarios.js";
import {
  areAllDeclarationsReady as areAllDeclarationsReadyUtil,
  buildDeclarationSelection,
  buildRoundResultPlayers as buildRoundResultPlayersFlow,
  canReturnLobby,
  canStartNextRound,
  createHumanSeatFlow,
  dealInitialHands as dealInitialHandsFlow,
  decideStartGame,
  endRoundFlow,
  ensureBotSeatsForStart as ensureBotSeatsForStartFlow,
  reclaimSeatStateFlow,
  resetRoundPlayers as resetRoundPlayersFlow,
  resetToFreshLobbyFlow,
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
  pickRandomDealerId as pickRandomDealerIdUtil,
  shouldEndDrawAfterUpperPass,
  shouldLogStateSnapshot as shouldLogStateSnapshotUtil,
  summarizeAllPlayersCards,
  summarizeCards,
} from "./flow/support.js";
import {
  decideActionDispatch,
  getAvailableActionsFlow,
  enterOwnerLocalPhaseAfterNoResponseFlow,
  executeEatFlow,
  executeGrabFlow,
  executePassToNextFlow,
  finalizeWithDiscardFlow,
  advanceToNextOwnerFlow,
  beginCollectiveFromDiscardFlow,
  discardFromAndCollectiveFlow,
  drawForOwnerFlow,
  enterDiscardStageFlow,
  resolveCollectivePhaseFlow,
  planTickBots,
  runBotStep,
  startCollectiveFlow,
  advanceCollectiveFlow,
} from "./flow/playing-flow.js";
import { createRoomStateOps, syncAllPrivateHands as syncAllPrivateHandsFlow, type RoomStateOps } from "./flow/room-state-ops.js";

interface PendingResponse {
  ownerId: string;
  card: Card;
  collectives: Map<string, ActionType>;
}

interface DeclareSetupPayload {
  declaredKongs?: number;
  fishCardIds?: string[];
}

type HuLogMode = "off" | "all" | "success" | "fail";
type StateLogMode = "off" | "all" | "compact";

const COMPACT_STATE_ACTIONS = new Set<string>([
  "LOBBY",
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

export class FourColorGameRoom extends Room<GameState> {
  maxClients = 4;

  private readonly minPlayersToStart = Math.max(1, Number(process.env.MIN_PLAYERS ?? 1));
  private readonly targetSeats = 4;

  private deck: Card[] = [];
  private playerHands = new Map<string, Card[]>(); // seatId -> cards
  private playerOrder: string[] = []; // seatIds in round order
  private botIds = new Set<string>(); // currently bot-controlled seatIds
  private seatBySession = new Map<string, string>(); // sessionId -> seatId
  private seatByToken = new Map<string, string>(); // token -> seatId
  private baseNameBySeat = new Map<string, string>(); // seatId -> human display name
  private pendingResponse: PendingResponse | null = null;
  private publicGeneralPool: Card[] = [];
  private awaitingDiscardOwnerId: string | null = null;
  private readonly botThinkMinMs = Math.max(
    0,
    Number(process.env.BOT_THINK_MIN_MS ?? process.env.BOT_THINK_MS ?? 1200),
  );
  private readonly botThinkMaxMs = Math.max(
    this.botThinkMinMs,
    Number(process.env.BOT_THINK_MAX_MS ?? this.botThinkMinMs + 1000),
  );
  private readonly collectiveTimeoutMs = Math.max(1000, Number(process.env.COLLECTIVE_TIMEOUT_MS ?? 8000));
  private readonly declareTimeoutMs = Math.max(1000, Number(process.env.DECLARE_TIMEOUT_MS ?? 30000));
  private readonly logEnabled = (process.env.ROOM_LOG ?? "1") !== "0";
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
  private collectiveTimer: ReturnType<typeof setTimeout> | null = null;
  private collectiveQueue: string[] = [];
  private collectiveCursor = 0;
  private collectiveResponderId: string | null = null;
  private debugSeq = 0;
  private roundDealerId: string | null = null;
  private stateOps: RoomStateOps | null = null;

  private get ops(): RoomStateOps {
    if (!this.stateOps) {
      this.stateOps = createRoomStateOps(this.state, this.playerHands, () => this.pendingResponse?.ownerId ?? null);
    }
    return this.stateOps;
  }

  onCreate(): void {
    this.setState(new GameState());
    this.stateOps = createRoomStateOps(this.state, this.playerHands, () => this.pendingResponse?.ownerId ?? null);

    this.onMessage("start_game", (client) => {
      this.handleStartGame(client);
    });

    this.onMessage("next_round", (client) => {
      this.handleNextRound(client);
    });

    this.onMessage("return_lobby", (client) => {
      this.handleReturnLobby(client);
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

    this.onMessage("action", (client, action: ActionType) => {
      this.handleAction(client, action);
    });

    this.onMessage("discard_card", (client, payload: { cardId?: string } | string) => {
      this.handleDiscardCard(client, payload);
    });

    this.onMessage("debug_setup", (client, scenario: string) => {
      const seatId = this.seatBySession.get(client.sessionId);
      const ok = seatId ? this.applyDebugScenario(seatId, scenario) : false;
      client.send("debug_applied", { scenario, ok, ts: Date.now() });
    });
  }

  onJoin(client: Client, options: { name?: string; playerToken?: string }): void {
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

    if (this.seatByToken.size >= this.targetSeats) {
      client.send("join_error", { message: "房间已满（最多4名真人玩家）。" });
      client.leave(4101);
      return;
    }

    const token = inputToken || generateTokenUtil();
    const seatId = this.createHumanSeat(client, token, inputName);
    this.sendSessionToken(client, seatId, token, false);
    this.state.lastAction = `LOBBY ${this.seatByToken.size}/${this.targetSeats}`;
    this.broadcastAvailableActions();
  }

  onLeave(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }
    this.seatBySession.delete(client.sessionId);

    // Single-room mode: when no human session remains, reset room to fresh lobby.
    if (this.seatBySession.size === 0) {
      this.resetToFreshLobby();
      return;
    }

    const player = this.state.players.get(seatId);
    if (!player) {
      return;
    }

    // Disconnect => immediate bot takeover; seat is always reclaimable by token.
    player.connected = false;
    player.isBot = true;
    const baseName = this.baseNameBySeat.get(seatId) ?? player.name;
    player.name = `${baseName} [BOT]`;
    this.botIds.add(seatId);
    this.state.lastAction = `TAKEOVER ${seatId}`;

    if (this.state.phase === "declaring" && !player.declaredReady) {
      this.submitDeclaration(seatId, { declaredKongs: 0, fishCardIds: [] }, true);
    }

    if (this.state.phase === "playing" || this.state.phase === "declaring") {
      this.tickBots();
    } else {
      this.broadcastAvailableActions();
    }
  }

  onDispose(): void {
    this.clearBotTimer();
    this.clearDeclareTimer();
    this.clearCollectiveTimer();
  }

  private resetToFreshLobby(): void {
    resetToFreshLobbyFlow({
      state: this.state,
      targetSeats: this.targetSeats,
      clearBotTimer: () => this.clearBotTimer(),
      clearDeclareTimer: () => this.clearDeclareTimer(),
      resetCollectivePolling: () => this.resetCollectivePolling(),
      setDeck: (deck) => {
        this.deck = deck;
      },
      setPendingResponseNull: () => {
        this.pendingResponse = null;
      },
      setPublicGeneralPool: (cards) => {
        this.publicGeneralPool = cards;
      },
      setAwaitingDiscardOwnerNull: () => {
        this.awaitingDiscardOwnerId = null;
      },
      setRoundDealerNull: () => {
        this.roundDealerId = null;
      },
      clearPlayerHands: () => this.playerHands.clear(),
      setPlayerOrder: (order) => {
        this.playerOrder = order;
      },
      clearBotIds: () => this.botIds.clear(),
      clearSeatBySession: () => this.seatBySession.clear(),
      clearSeatByToken: () => this.seatByToken.clear(),
      clearBaseNameBySeat: () => this.baseNameBySeat.clear(),
      broadcastAvailableActions: () => this.broadcastAvailableActions(),
    });
  }

  private handleStartGame(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
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

    this.ensureBotSeatsForStart();
    this.bootstrapRound();
  }

  private handleNextRound(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!canStartNextRound(seatId, this.state.phase, this.state.hostPlayerId)) {
      return;
    }
    this.ensureBotSeatsForStart();
    this.bootstrapRound();
  }

  private handleReturnLobby(client: Client): void {
    const seatId = this.seatBySession.get(client.sessionId);
    if (!canReturnLobby(seatId, this.state.phase)) {
      return;
    }
    this.backToLobby();
  }

  private createHumanSeat(client: Client, token: string, rawName: string): string {
    return createHumanSeatFlow(
      {
        state: this.state,
        seatByTokenSize: this.seatByToken.size,
        playerOrder: this.playerOrder,
        playerHands: this.playerHands,
        baseNameBySeat: this.baseNameBySeat,
        seatByToken: this.seatByToken,
        seatBySession: this.seatBySession,
        botIds: this.botIds,
      },
      client.sessionId,
      token,
      rawName,
    );
  }

  private reclaimSeat(client: Client, seatId: string, token: string, rawName: string): void {
    for (const [sessionId, mappedSeat] of this.seatBySession.entries()) {
      if (mappedSeat !== seatId || sessionId === client.sessionId) {
        continue;
      }
      this.seatBySession.delete(sessionId);
      const oldClient = this.clients.find((c) => c.sessionId === sessionId);
      oldClient?.leave(4102);
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

    this.sendSessionToken(client, seatId, token, true);
    this.syncAllPrivateHands();
    this.broadcastAvailableActions();
    this.tickBots();
  }

  private sendSessionToken(client: Client, seatId: string, token: string, reclaimed: boolean): void {
    client.send("session_token", {
      playerToken: token,
      seatId,
      hostPlayerId: this.state.hostPlayerId,
      roomId: this.roomId,
      reclaimed,
    });
  }

  private ensureBotSeatsForStart(): void {
    ensureBotSeatsForStartFlow(this.state, this.playerOrder, this.playerHands, this.botIds, this.targetSeats);
  }

  private bootstrapRound(): void {
    this.clearDeclareTimer();
    this.state.phase = "declaring";
    this.deck = shuffle(createDeck());
    this.publicGeneralPool = [];
    this.pendingResponse = null;
    this.awaitingDiscardOwnerId = null;
    this.huLogDedup.clear();
    this.huChecksTotal = 0;
    this.huChecksValid = 0;
    this.huChecksBySeat.clear();

    resetRoundPlayersFlow(this.state, this.playerOrder);

    const dealerId = pickRandomDealerIdUtil(this.playerOrder);
    this.roundDealerId = dealerId;
    this.state.dealerId = dealerId;
    dealInitialHandsFlow(this.playerOrder, dealerId, this.deck, this.playerHands);

    // Rule v1.0: dealer flips one shared public general card from deck top.
    const publicGeneral = this.deck.shift();
    if (publicGeneral) {
      this.publicGeneralPool.push(publicGeneral);
      this.ops.addWildcardCardToPlayer(dealerId, publicGeneral, "upper");
    }

    this.state.deckCount = this.deck.length;
    this.state.currentPlayerId = dealerId;
    this.state.responsePhase = "collective";
    this.state.declareEndsAt = Date.now() + this.declareTimeoutMs;
    this.state.lastAction = `DECLARING ${this.declareTimeoutMs}ms`;
    this.syncAllPrivateHands();
    this.startDeclaringPhase();
  }

  private startDeclaringPhase(): void {
    startDeclaringFlow({
      playerOrder: this.playerOrder,
      getPlayer: (seatId) => this.state.players.get(seatId),
      submitDeclaration: (seatId, force) => this.submitDeclaration(seatId, { declaredKongs: 0, fishCardIds: [] }, force),
      syncAllPrivateHands: () => this.syncAllPrivateHands(),
      broadcastAvailableActions: () => this.broadcastAvailableActions(),
      allReady: () => this.areAllDeclarationsReady(),
      finishDeclaringPhase: () => this.finishDeclaringPhase(),
      scheduleDeclareTimeout: () => this.scheduleDeclareTimeout(),
    });
  }

  private scheduleDeclareTimeout(): void {
    this.clearDeclareTimer();
    this.declareTimer = setTimeout(() => {
      this.declareTimer = null;
      if (this.state.phase !== "declaring") {
        return;
      }
      runDeclaringTimeoutFlow({
        playerOrder: this.playerOrder,
        getPlayer: (seatId) => this.state.players.get(seatId),
        submitDeclaration: (seatId, force) => this.submitDeclaration(seatId, { declaredKongs: 0, fishCardIds: [] }, force),
        allReady: () => this.areAllDeclarationsReady(),
        finishDeclaringPhase: () => this.finishDeclaringPhase(),
      });
    }, this.declareTimeoutMs);
  }

  private clearDeclareTimer(): void {
    if (this.declareTimer) {
      clearTimeout(this.declareTimer);
      this.declareTimer = null;
    }
  }

  private areAllDeclarationsReady(): boolean {
    return areAllDeclarationsReadyUtil(this.playerOrder, (seatId) => this.state.players.get(seatId));
  }

  private finishDeclaringPhase(): void {
    this.clearDeclareTimer();
    const dealerId = this.roundDealerId && this.state.players.has(this.roundDealerId)
      ? this.roundDealerId
      : this.playerOrder[0];
    applyPlayingStartAfterDeclaring(this.state, dealerId, this.getPreviousPlayerId(dealerId));
    this.syncAllPrivateHands();
    // Round opening: dealer must discard one legal card from own hand first.
    this.enterDiscardStage(dealerId, "OPENING_DISCARD");
  }

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
      const removeIds = new Set(selectedCards.map((card) => card.id));
      const nextHand = hand.filter((card) => !removeIds.has(card.id));
      this.playerHands.set(seatId, nextHand);
      for (const card of selectedCards) {
        player.fishArea.push(this.ops.toSchemaCard(card, true, card.source ?? "upper"));
      }
    }

    this.syncAllPrivateHands();
    this.broadcastAvailableActions();

    if (this.areAllDeclarationsReady()) {
      this.finishDeclaringPhase();
    }
  }

  private startTurn(ownerId: string, tag: string): void {
    if (this.state.phase !== "playing") {
      return;
    }
    this.resetCollectivePolling();
    applyTurnTransitionState(this.state, ownerId);
    this.drawForOwner(ownerId, tag);
  }

  private drawForOwner(ownerId: string, tag: string): void {
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
  }

  private exposeGeneralCard(ownerId: string, card: Card): void {
    this.publicGeneralPool.push(card);
    this.ops.addWildcardCardToPlayer(ownerId, card, "draw");
    this.state.lastAction = `${ownerId} DRAW_GENERAL`;
  }

  private discardFromAndCollective(ownerId: string): void {
    discardFromAndCollectiveFlow(
      {
        pickDiscardCard: (ownerIdArg) => this.ops.pickDiscardCard(ownerIdArg),
        pushDiscard: (ownerIdArg, card) => this.ops.pushDiscard(ownerIdArg, card),
        beginCollectiveFromDiscard: (ownerIdArg, discard) => this.beginCollectiveFromDiscard(ownerIdArg, discard),
        clearAwaitingDiscardOwner: () => {
          this.awaitingDiscardOwnerId = null;
        },
        endRound: (lastAction) => this.endRound(lastAction),
      },
      ownerId,
    );
  }

  private beginCollectiveFromDiscard(ownerId: string, discard: Card): void {
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

  private handleAction(client: Client, action: ActionType): void {
    if (!this.pendingResponse || this.state.phase !== "playing") {
      return;
    }

    const seatId = this.seatBySession.get(client.sessionId);
    if (!seatId) {
      return;
    }

    const pending = this.pendingResponse;
    action = normalizeActionUtil(action);
    const enabledActions = this.getAvailableActions(seatId).filter((x) => x.enabled).map((x) => x.action);
    const decision = decideActionDispatch({
      pendingOwnerId: pending.ownerId,
      seatId,
      action,
      enabledActions,
      responsePhase: this.state.responsePhase,
      collectiveResponderId: this.collectiveResponderId,
      awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
    });

    if (decision === "collective_accept") {
      this.clearCollectiveTimer();
      pending.collectives.set(seatId, action === "pass" ? "pass" : action);
      this.collectiveCursor += 1;
      if (this.state.responsePhase === "collective" && this.pendingResponse === pending) {
        this.advanceCollectivePolling();
      }
      return;
    }
    if (decision === "local_chi") {
      this.executeEat(seatId);
      return;
    }
    if (decision === "local_pass_upper") {
      this.executeGrab(seatId);
      return;
    }
    if (decision === "local_pass_draw") {
      this.executePassToNext(seatId);
      return;
    }
  }

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

    const discard = this.ops.discardCardById(seatId, cardId);
    if (!discard) {
      return;
    }

    this.ops.pushDiscard(seatId, discard);
    this.beginCollectiveFromDiscard(seatId, discard);
  }

  private enterDiscardStage(ownerId: string, tag: string): void {
    enterDiscardStageFlow(
      {
        playerHand: this.playerHands.get(ownerId) ?? [],
        endRound: (lastAction) => this.endRound(lastAction),
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

  private resolveCollectivePhase(): void {
    resolveCollectivePhaseFlow({
      pending: this.pendingResponse,
      playerOrder: this.playerOrder,
      executeResponseWinner: (winnerId, action) => this.executeResponseWinner(winnerId, action),
      setLastAction: (action) => {
        this.state.lastAction = action;
      },
      enterOwnerLocalPhaseAfterNoResponse: (ownerId) => this.enterOwnerLocalPhaseAfterNoResponse(ownerId),
    });
  }

  private hasCollectiveActionBeyondPass(seatId: string): boolean {
    const acts = this.getAvailableActions(seatId);
    return acts.some((item) => item.enabled && item.action !== "pass");
  }

  private isEatResponder(ownerId: string, responderId: string): boolean {
    // Rule v1.0: only one adjacent player can eat discarded card.
    return this.getPreviousPlayerId(ownerId) === responderId;
  }

  private executeResponseWinner(winnerId: string, action: ActionType): void {
    const pending = this.pendingResponse;
    if (!pending) {
      return;
    }
    const operationDeps = this.ops.buildOperationExecutorDeps();
    executeResponseWinner(
      {
        getHand: (seatId) => this.playerHands.get(seatId) ?? [],
        explainHuForSeat: (seatId, hand, responseCard) =>
          this.ops.explainHuForSeat(seatId, hand, responseCard, this.getHuWildcardCount()),
        logHuCheck: (stage, seatId, hand, response, valid) => this.logHuCheck(stage, seatId, hand, response, valid),
        executeKaiOperation: (seatId, pendingCard) => tryExecuteKai(operationDeps, seatId, pendingCard),
        executePengOperation: (seatId, pendingCard) => tryExecutePeng(operationDeps, seatId, pendingCard),
        executeChiOperation: (seatId, pendingCard) => tryExecuteChi(operationDeps, seatId, pendingCard),
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
      action,
    );
  }

  private enterNoResponsePath(): void {
    const ownerId = this.pendingResponse?.ownerId;
    if (!ownerId) {
      return;
    }
    this.state.lastAction = "NO_RESPONSE";
    this.enterOwnerLocalPhaseAfterNoResponse(ownerId);
  }

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
      addWildcardCardToPlayer: (nextOwnerId, card, source) => this.ops.addWildcardCardToPlayer(nextOwnerId, card, source),
      setLastAction: (action) => {
        this.state.lastAction = action;
      },
      enterDiscardStage: (nextOwnerId, tag) => this.enterDiscardStage(nextOwnerId, tag),
      syncAllPrivateHands: () => this.syncAllPrivateHands(),
      tickBots: () => this.tickBots(),
    });
  }

  private executeEat(ownerId: string): void {
    const operationDeps = this.ops.buildOperationExecutorDeps();
    executeEatFlow(
      {
        pending: this.pendingResponse,
        executeChiOperation: (ownerIdArg, pendingCard) => tryExecuteChi(operationDeps, ownerIdArg, pendingCard),
        setLastAction: (action) => {
          this.state.lastAction = action;
        },
        finalizeWithDiscardFrom: (ownerIdArg) => this.finalizeWithDiscardFrom(ownerIdArg),
      },
      ownerId,
    );
  }

  private executeGrab(ownerId: string): void {
    executeGrabFlow(
      {
        pending: this.pendingResponse,
        deck: this.deck,
        pushDiscard: (ownerIdArg, card) => this.ops.pushDiscard(ownerIdArg, card),
        shouldEndDrawAfterUpperPass,
        endRound: (lastAction) => this.endRound(lastAction),
        setDeckCount: (deckCount) => {
          this.state.deckCount = deckCount;
        },
        addCardToHand: (ownerIdArg, card) => {
          const hand = this.playerHands.get(ownerIdArg) ?? [];
          hand.push(card);
          this.playerHands.set(ownerIdArg, hand);
        },
        setupCollectiveAfterGrab: (ownerIdArg, card) => {
          this.pendingResponse = createPendingResponse(ownerIdArg, card, "draw");
          this.state.responsePhase = "collective";
          this.ops.setResponseCard(card, "draw");
          this.state.currentTurnPlayerId = ownerIdArg;
          this.state.previousPlayerId = ownerIdArg;
          this.state.loopStage = "global_poll";
          this.state.activeResponderId = "";
          this.state.pollOriginPlayerId = ownerIdArg;
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

  private executePassToNext(ownerId: string): void {
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

  private finalizeWithDiscardFrom(playerId: string): void {
    finalizeWithDiscardFlow(
      {
        pickDiscardCard: (playerIdArg) => this.ops.pickDiscardCard(playerIdArg),
        pushDiscard: (playerIdArg, card) => this.ops.pushDiscard(playerIdArg, card),
        advanceToNextOwner: (playerIdArg, card) => this.advanceToNextOwner(playerIdArg, card),
        endRound: (lastAction) => this.endRound(lastAction),
      },
      playerId,
    );
  }

  private advanceToNextOwner(currentOwnerId: string, cardToNext: Card): void {
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
    );
  }

  private backToLobby(): void {
    resetToLobby({
      state: this.state,
      playerOrder: this.playerOrder,
      botIds: this.botIds,
      playerHands: this.playerHands,
      baseNameBySeat: this.baseNameBySeat,
      seatBySession: this.seatBySession,
      seatByToken: this.seatByToken,
      targetSeats: this.targetSeats,
      resetRuntime: () => {
        this.clearBotTimer();
        this.clearDeclareTimer();
        this.resetCollectivePolling();
        this.deck = [];
        this.pendingResponse = null;
        this.publicGeneralPool = [];
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
  }

  private endRound(lastAction: string, winnerId: string | null = null, groups: string[] = []): void {
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
        broadcast: (event, payload) => this.broadcast(event, payload),
        buildRoundResultPlayers: (winnerIdArg, groupArgs) => this.buildRoundResultPlayers(winnerIdArg, groupArgs),
        broadcastAvailableActions: () => this.broadcastAvailableActions(),
      },
      lastAction,
      winnerId,
      groups,
    );
  }

  private getAvailableActions(seatId: string): Array<{ action: ActionType; enabled: boolean }> {
    const hand = this.playerHands.get(seatId) ?? [];
    const wildcardPool = this.ops.getWildcardPoolCards(seatId);
    return getAvailableActionsFlow({
      phase: this.state.phase,
      seatId,
      pending: this.pendingResponse,
      responsePhase: this.state.responsePhase,
      collectiveResponderId: this.collectiveResponderId,
      awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
      hand,
      wildcardPool,
      explainHuForSeat: (seatIdArg, handArg, responseCard) =>
        this.ops.explainHuForSeat(seatIdArg, handArg, responseCard, this.getHuWildcardCount()),
      logHuCheck: (stage, seatIdArg, handArg, response, valid) => this.logHuCheck(stage, seatIdArg, handArg, response, valid),
      getHandWithoutPending: (seatIdArg, pendingCard) => this.ops.getHandWithoutPending(seatIdArg, pendingCard),
    });
  }

  private broadcastAvailableActions(): void {
    this.logStateSnapshot("STATE");
    for (const client of this.clients) {
      const seatId = this.seatBySession.get(client.sessionId);
      if (!seatId) {
        continue;
      }
      client.send("available_actions", this.getAvailableActions(seatId));
    }
  }

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
    syncAllPrivateHandsFlow(this.clients, this.seatBySession, this.playerHands);
  }

  private getNextPlayerId(playerId: string): string {
    return getNextPlayerIdOrder(this.playerOrder, playerId);
  }

  private getPreviousPlayerId(playerId: string): string {
    return getPreviousPlayerIdOrder(this.playerOrder, playerId);
  }

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
    if (plan === "clear_and_broadcast") {
      this.clearBotTimer();
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

  private startCollectivePolling(): void {
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

  private getCollectiveOrder(pending: PendingResponse): string[] {
    return getCollectiveOrder(this.playerOrder, pending);
  }

  private scheduleCollectiveTimeout(): void {
    this.clearCollectiveTimer();
    this.state.responseEndsAt = Date.now() + this.collectiveTimeoutMs;
    this.collectiveTimer = setTimeout(() => {
      const pending = this.pendingResponse;
      const responderId = this.collectiveResponderId;
      this.collectiveTimer = null;
      if (!pending || this.state.responsePhase !== "collective" || !responderId) {
        return;
      }
      if (pending.collectives.has(responderId)) {
        return;
      }
      pending.collectives.set(responderId, "pass");
      this.collectiveCursor += 1;
      this.state.lastAction = `${responderId} TIMEOUT_PASS`;
      this.advanceCollectivePolling();
    }, this.collectiveTimeoutMs);
  }

  private advanceCollectivePolling(): void {
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
        this.pendingResponse?.collectives.set(seatId, "pass");
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
  }

  private scheduleBotStep(): void {
    if (this.botThinkMaxMs <= 0) {
      this.runBotStepNow();
      return;
    }
    if (this.botTimer) {
      return;
    }
    const delayMs = this.randomBotThinkDelayMs();
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.runBotStepNow();
    }, delayMs);
  }

  private randomBotThinkDelayMs(): number {
    if (this.botThinkMaxMs <= this.botThinkMinMs) {
      return this.botThinkMinMs;
    }
    return this.botThinkMinMs + Math.floor(Math.random() * (this.botThinkMaxMs - this.botThinkMinMs + 1));
  }

  private runBotStepNow(): void {
    const pending = this.pendingResponse;
    if (!pending) {
      this.broadcastAvailableActions();
      return;
    }
    runBotStep({
      phase: this.state.phase,
      responsePhase: this.state.responsePhase,
      pendingOwnerId: pending.ownerId,
      pendingCard: pending.card,
      collectiveResponderId: this.collectiveResponderId,
      isBot: (seatId) => this.botIds.has(seatId),
      awaitingDiscardOwnerId: this.awaitingDiscardOwnerId,
      getAvailableActions: (seatId) => this.getAvailableActions(seatId),
      setCollectiveChoice: (seatId, action) => {
        this.pendingResponse?.collectives.set(seatId, action);
        this.collectiveCursor += 1;
      },
      advanceCollectivePolling: () => this.advanceCollectivePolling(),
      broadcastAvailableActions: () => this.broadcastAvailableActions(),
      discardFromAndCollective: (ownerId) => this.discardFromAndCollective(ownerId),
      getHand: (seatId) => this.playerHands.get(seatId) ?? [],
      getWildcardPoolCards: (seatId) => this.ops.getWildcardPoolCards(seatId),
      executeEat: (ownerId) => this.executeEat(ownerId),
      executeGrab: (ownerId) => this.executeGrab(ownerId),
      executePassToNext: (ownerId) => this.executePassToNext(ownerId),
    });
  }

  private applyDebugScenario(seatId: string, scenario: string): boolean {
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
        syncAllPrivateHands: () => this.syncAllPrivateHands(),
        resetCollectivePolling: () => this.resetCollectivePolling(),
        broadcastAvailableActions: () => this.broadcastAvailableActions(),
        startCollectivePolling: () => this.startCollectivePolling(),
        tickBots: () => this.tickBots(),
      },
      seatId,
      scenario,
    );
  }

}

