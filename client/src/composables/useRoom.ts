import { computed, onUnmounted, ref, shallowRef } from "vue";
import { Client, ErrorCode, MatchMakeError, Room } from "@colyseus/sdk";
import type {
  ActionFeedback,
  ActionCandidate,
  ActionRequest,
  ActionType,
  AvailableAction,
  Card,
  DecisionTimerState,
  ParsedActionLog,
  PlayerState,
  RoomStateSnapshot,
  RoomConnectionState,
  RoundResultPayload,
  SessionTokenPayload,
} from "@/types/game";
import { sortHandCards } from "@/utils/cardSort";
import { getCardAccessibleText } from "@/utils/cardText";
import { actionHistoryText, parseActionDescriptor } from "@/utils/actionHistory";
import { BACKEND_HTTP_URL, BACKEND_WS_URL } from "@/config/backend";
import { apiErrorMessage, retryAfterMilliseconds } from "@/utils/http";
import { isPrivateHandSynchronized } from "@/utils/privateHandReadiness";

const WS_URL = BACKEND_WS_URL;
const HTTP_URL = BACKEND_HTTP_URL;
const PRIVATE_STATE_POLL_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 15000;
const RESTORED_NOTICE_MS = 6000;
const ACTION_RECEIPT_WAIT_MS = 2500;
const ACTION_RECEIVED_VISIBLE_MS = 1600;
const ACTION_REJECTED_VISIBLE_MS = 3600;

const TERMINAL_ROOM_CLOSE_MESSAGES: Readonly<Record<number, string>> = {
  4100: "原座位已经失效，或牌局已不再接受加入。系统已停止自动恢复。",
  4101: "房间已经坐满，无法恢复原座位。系统已停止自动恢复。",
  4102: "这个座位已在其他窗口恢复。本页面已停止重连，避免重复抢占座位。",
  4103: "原座位已经不存在，无法继续恢复。系统已停止自动恢复。",
  4104: "你已被移出房间。系统已停止自动恢复。",
  4105: "牌局已经开始，未入座的访问已结束。系统已停止自动恢复。",
  4106: "这是单人练习房，已有玩家在练习。请返回首页重新开始。",
  4110: "房主已解散本桌，大家已返回模式选择。",
};

function terminalJoinFailureMessage(error: unknown): string | null {
  const code =
    error instanceof MatchMakeError
      ? error.code
      : Number((error as { code?: unknown } | null)?.code);
  if (TERMINAL_ROOM_CLOSE_MESSAGES[code]) {
    return TERMINAL_ROOM_CLOSE_MESSAGES[code];
  }
  if (code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID || code === ErrorCode.MATCHMAKE_EXPIRED) {
    return "原牌局已经结束或被回收。系统已停止自动恢复，请返回首页重新开始。";
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/room[^\n]*(?:not found|expired|disposed)|invalid room/i.test(message)) {
    return "原牌局已经结束或被回收。系统已停止自动恢复，请返回首页重新开始。";
  }
  return null;
}

type ConnectOptions = {
  nameOverride?: string;
  roomId?: string;
  playerToken?: string;
  hostKey?: string;
  forceNew?: boolean;
  reconnecting?: boolean;
  preserveState?: boolean;
  matchmaking?: boolean;
  exposeRoomIdInUrl?: boolean;
};

function generateLocalPlayerToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  const encoded = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pt_${encoded}`;
}

function asCardArray(input: unknown): Card[] {
  const isCard = (x: any): x is Card =>
    x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.color === "string" &&
    typeof x.type === "string" &&
    x.id.length > 0 &&
    x.type.length > 0;

  const collectIterable = (iter: Iterable<unknown>) => Array.from(iter).filter(isCard);

  if (Array.isArray(input)) {
    return (input as unknown[]).filter(isCard);
  }
  if (input && typeof input === "object" && Array.isArray((input as { cards?: unknown[] }).cards)) {
    return ((input as { cards: unknown[] }).cards ?? []).filter(isCard);
  }
  if (input && typeof input === "object" && Array.isArray((input as { items?: unknown[] }).items)) {
    return ((input as { items: unknown[] }).items ?? []).filter(isCard);
  }
  if (input && typeof (input as any).toArray === "function") {
    const out = ((input as any).toArray() as unknown[]).filter(isCard);
    if (out.length > 0) {
      return out;
    }
  }
  if (input && typeof (input as any).length === "number") {
    const raw = input as any;
    const out: Card[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      if (isCard(raw[i])) {
        out.push(raw[i]);
      }
    }
    if (out.length > 0 || raw.length === 0) {
      return out;
    }
  }
  if (input && typeof (input as any).forEach === "function") {
    const out: Card[] = [];
    (input as any).forEach((value: unknown) => {
      if (isCard(value)) {
        out.push(value);
      }
    });
    if (out.length > 0) {
      return out;
    }
  }
  if (input && typeof (input as any)[Symbol.iterator] === "function") {
    const out = collectIterable(input as Iterable<unknown>);
    if (out.length > 0) {
      return out;
    }
  }
  if (input && typeof input === "object" && (input as any).$items) {
    const items = Object.values((input as any).$items as Record<string, unknown>).filter(isCard);
    if (items.length > 0) {
      return items;
    }
  }
  if (input && typeof input === "object") {
    return Object.values(input as Record<string, unknown>).filter(isCard);
  }
  return [];
}

function asCard(input: unknown): Card | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const raw = input as any;
  if (typeof raw.id !== "string" || typeof raw.color !== "string" || typeof raw.type !== "string") {
    return null;
  }
  if (!raw.id || !raw.type) {
    return null;
  }
  const source = raw.source === "draw" || raw.source === "upper" ? raw.source : undefined;
  return {
    id: raw.id,
    color: raw.color,
    type: raw.type,
    source,
    isResponseCard: Boolean(raw.isResponseCard),
  };
}

function asNumberArray(input: unknown): number[] {
  if (Array.isArray(input)) {
    return input.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  }
  if (input && typeof (input as any).toArray === "function") {
    return ((input as any).toArray() as unknown[])
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
  }
  if (input && typeof (input as any).forEach === "function") {
    const out: number[] = [];
    (input as any).forEach((value: unknown) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        out.push(n);
      }
    });
    return out;
  }
  if (input && typeof input === "object") {
    return Object.values(input as Record<string, unknown>)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
  }
  return [];
}

function asStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((x) => String(x ?? "")).filter(Boolean);
  }
  if (input && typeof (input as any).toArray === "function") {
    return ((input as any).toArray() as unknown[]).map((x) => String(x ?? "")).filter(Boolean);
  }
  if (input && typeof (input as any).forEach === "function") {
    const out: string[] = [];
    (input as any).forEach((value: unknown) => {
      const next = String(value ?? "");
      if (next) {
        out.push(next);
      }
    });
    return out;
  }
  if (input && typeof input === "object") {
    return Object.values(input as Record<string, unknown>).map((x) => String(x ?? "")).filter(Boolean);
  }
  return [];
}

function normalizePlayer(raw: any): PlayerState {
  return {
    clientId: String(raw?.clientId ?? ""),
    seatIndex: Number(raw?.seatIndex ?? -1),
    name: String(raw?.name ?? ""),
    handCount: Number(raw?.handCount ?? 0),
    declaredKongs: Number(raw?.declaredKongs ?? 0),
    declaredReady: Boolean(raw?.declaredReady),
    lobbyReady: Boolean(raw?.lobbyReady),
    isBot: Boolean(raw?.isBot),
    isAutoPlay: Boolean(raw?.isAutoPlay),
    isConfiguredBot: Boolean(raw?.isConfiguredBot),
    botStrength: Math.max(0, Math.min(100, Number(raw?.botStrength ?? 50))),
    cumulativeScore: Number(raw?.cumulativeScore ?? 0),
    connected: Boolean(raw?.connected),
    discardPile: asCardArray(raw?.discardPile),
    exposedArea: asCardArray(raw?.exposedArea),
    exposedGroupSizes: asNumberArray(raw?.exposedGroupSizes),
    exposedGroupKinds: asStringArray(raw?.exposedGroupKinds),
    generalArea: asCardArray(raw?.generalArea),
    wildcardPool: asCardArray(raw?.wildcardPool),
    fishArea: asCardArray(raw?.fishArea),
  };
}

function normalizeSnapshot(next: unknown): RoomStateSnapshot {
  // Access Proxy properties directly without calling toJSON() to avoid circular reference
  const rawState = next as any;

  const rawPlayers = rawState?.players;
  const normalizedPlayers: PlayerState[] = [];
  if (Array.isArray(rawPlayers)) {
    normalizedPlayers.push(...rawPlayers.map((value) => normalizePlayer(value)));
  } else if (rawPlayers && typeof rawPlayers.forEach === "function") {
    rawPlayers.forEach((value: unknown) => {
      normalizedPlayers.push(normalizePlayer(value));
    });
  } else if (rawPlayers && typeof rawPlayers === "object") {
    normalizedPlayers.push(
      ...Object.values(rawPlayers as Record<string, unknown>).map((value) => normalizePlayer(value)),
    );
  }

  return {
    roomId: typeof rawState?.roomId === "string" ? rawState.roomId : undefined,
    roomMode: rawState?.roomMode === "friends" || rawState?.roomMode === "match"
      ? rawState.roomMode
      : "practice",
    scoringMode: rawState?.scoringMode === "cumulative" ? "cumulative" : "single",
    completedRounds: Math.max(0, Number(rawState?.completedRounds ?? 0)),
    phase: String(rawState?.phase ?? ""),
    matchStartsAt: Math.max(0, Number(rawState?.matchStartsAt ?? 0)),
    hostPlayerId: String(rawState?.hostPlayerId ?? ""),
    dealerId: String(rawState?.dealerId ?? ""),
    dealerPickerId: String(rawState?.dealerPickerId ?? ""),
    currentPlayerId: String(rawState?.currentPlayerId ?? ""),
    currentTurnPlayerId: String(rawState?.currentTurnPlayerId ?? ""),
    previousPlayerId: String(rawState?.previousPlayerId ?? ""),
    pollOriginPlayerId: String(rawState?.pollOriginPlayerId ?? ""),
    activeResponderId: String(rawState?.activeResponderId ?? ""),
    responsePhase: normalizeResponsePhase(String(rawState?.responsePhase ?? "")),
    responseEndsAt: Number(rawState?.responseEndsAt ?? 0),
    lastAction: String(rawState?.lastAction ?? ""),
    deckCount: Number(rawState?.deckCount ?? 0),
    isMoCard: Boolean(rawState?.isMoCard),
    targetCard: asCard(rawState?.targetCard),
    responseCard: asCard(rawState?.responseCard),
    dealerCard: asCard(rawState?.dealerCard),
    publicDiscardPile: asCardArray(rawState?.publicDiscardPile),
    publicGeneralPool: asCardArray(rawState?.publicGeneralPool),
    declareEndsAt: Number(rawState?.declareEndsAt ?? 0),
    players: normalizedPlayers,
  };
}

function normalizeAction(action: string): ActionType | null {
  if (action === "open") {
    return "kai";
  }
  if (action === "eat") {
    return "chi";
  }
  if (action === "grab" || action === "zhua") {
    return "pass";
  }
  if (action === "hu" || action === "kai" || action === "peng" || action === "chi" || action === "pass") {
    return action;
  }
  return null;
}

function normalizeCandidate(raw: any): ActionCandidate | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const action = normalizeAction(String(raw.action ?? ""));
  if (action !== "kai" && action !== "peng" && action !== "chi") {
    return null;
  }
  const id = String(raw.id ?? "").trim();
  if (!id) {
    return null;
  }
  const sourceRaw = String(raw.source ?? "");
  const source: ActionCandidate["source"] =
    sourceRaw === "hand+pool" ? sourceRaw : "hand";
  const cardIds = Array.isArray(raw.cardIds) ? raw.cardIds.map((x: unknown) => String(x)).filter(Boolean) : [];
  const kind = typeof raw.kind === "string" ? raw.kind : undefined;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : action.toUpperCase();
  return {
    id,
    action,
    kind,
    cardIds,
    source,
    title,
  };
}

function normalizeAvailableActions(input: unknown): AvailableAction[] {
  const rawInput =
    input && typeof input === "object" && Array.isArray((input as { items?: unknown[] }).items)
      ? (input as { items: unknown[] }).items
      : input;
  if (!Array.isArray(rawInput)) {
    return [];
  }
  return rawInput.map((item: unknown) => {
    const rawItem = item as Record<string, unknown>;
    return {
      action: normalizeAction(String(rawItem?.action ?? "")) ?? "pass",
      enabled: Boolean(rawItem?.enabled),
      deferred: Boolean(rawItem?.deferred),
      candidates: Array.isArray(rawItem?.candidates)
        ? rawItem.candidates
            .map((raw) => normalizeCandidate(raw))
            .filter((candidate): candidate is ActionCandidate => Boolean(candidate))
        : undefined,
    };
  });
}

function normalizeRoundResultPayload(payload: RoundResultPayload): RoundResultPayload {
  return {
    ...payload,
    players: (payload.players ?? []).map((p) => ({
      ...p,
      isConfiguredBot: Boolean(p.isConfiguredBot),
      hand: sortHandCards(p.hand ?? []),
      declaredKongs: Number(p.declaredKongs ?? 0),
      huType: p.huType === "big" || p.huType === "small" ? p.huType : null,
      winningGroups: (p.winningGroups ?? []).map((group) => ({
        key: String(group?.key ?? ""),
        cards: sortHandCards(group?.cards ?? []),
      })),
      resolvedHandGroups: (p.resolvedHandGroups ?? []).map((group) => ({
        key: String(group?.key ?? ""),
        cards: sortHandCards(group?.cards ?? []),
      })),
      exposedArea: p.exposedArea ?? [],
      exposedGroupSizes: asNumberArray(p.exposedGroupSizes),
      exposedGroupKinds: asStringArray((p as { exposedGroupKinds?: unknown }).exposedGroupKinds),
      generalArea: sortHandCards(p.generalArea ?? []),
      fishArea: sortHandCards(p.fishArea ?? []),
      discardCount: Number(p.discardCount ?? 0),
      scoreBreakdown: p.scoreBreakdown ?? [],
      totalScore: Number(p.totalScore ?? 0),
      cumulativeScore: Number(p.cumulativeScore ?? 0),
    })),
    remainingDeck: asCardArray((payload as { remainingDeck?: unknown }).remainingDeck),
    scoringMode: payload.scoringMode === "cumulative" ? "cumulative" : "single",
    roundNumber: Math.max(1, Number(payload.roundNumber ?? 1)),
  };
}

function normalizeResponsePhase(input: string): string {
  if (input === "self_eat") {
    return "local_upper";
  }
  if (input === "self_grab") {
    return "local_draw";
  }
  return input;
}

function actionCardLabel(action: string, snapshot?: RoomStateSnapshot): string {
  if (!snapshot) {
    return "";
  }
  const { actionKey } = parseActionDescriptor(action);
  const card = ["DEALER", "DEALER_PICK", "DEALER_CARD"].includes(actionKey)
    ? snapshot.dealerCard
    : [
        "DISCARD",
        "PENG",
        "CHI",
        "KAI",
        "HU",
        "ZHUA",
        "PASS",
        "TIMEOUT_PASS",
        "TIMEOUT_DISCARD",
        "FORCE_TAKE",
        "DRAW_GENERAL",
      ].includes(actionKey)
      ? snapshot.responseCard ?? snapshot.targetCard
      : null;
  return card ? getCardAccessibleText(card) : "";
}

export function useRoom(playerName = "Player") {
  const ROOM_KEY = "four_room_id";
  const LEGACY_TOKEN_KEY = "four_player_token";
  const NAME_KEY = "four_player_name";
  const MAX_LOGS = 120;

  const connected = ref(false);
  const connectionState = ref<RoomConnectionState>(navigator.onLine ? "idle" : "offline");
  const reconnectAttempt = ref(0);
  // SDK room instances carry identity-sensitive listeners and transport state.
  // A normal Vue ref proxies class instances, breaking `room.value === joined`
  // guards and silently discarding current-connection messages.
  const room = shallowRef<Room | null>(null);
  const state = ref<RoomStateSnapshot | null>(null);
  const myId = ref("");
  const mySeatId = ref("");
  const playerToken = ref("");
  const activeRoomId = ref("");
  const localPlayerName = ref(playerName);
  const privateHand = ref<Card[]>([]);
  const availableActions = ref<AvailableAction[]>([]);
  const huResult = ref<{ winnerId: string; groups: string[] } | null>(null);
  const roundResult = ref<RoundResultPayload | null>(null);
  const debugApplied = ref<{
    scenario: string;
    ok: boolean;
    ts: number;
    actions?: AvailableAction[];
  } | null>(null);
  const joinError = ref("");
  const declareError = ref("");
  const actionLogs = ref<ParsedActionLog[]>([]);
  const actionFeedback = ref<ActionFeedback | null>(null);
  const matchClockSync = ref({ deadline: 0, offsetMs: 0 });
  const decisionTimer = ref<DecisionTimerState>({
    untimed: false,
    canRequestMoreTime: false,
    extensionSeconds: 20,
    totalMs: 0,
    endsAt: 0,
    decisionKey: "",
  });

  let logSeq = 0;
  let lastFingerprint = "";
  let lastPhase = "";
  let roomStateSyncTimer: number | null = null;
  let missingHandSyncTimer: number | null = null;
  let reconnectTimer: number | null = null;
  let restoredNoticeTimer: number | null = null;
  let privateStatePollTimer: number | null = null;
  let stateSyncFingerprint = "";
  let privateHandFingerprint = "";
  let availableActionsFingerprint = "";
  let connectInFlight = false;
  let activeConnectionSeq = 0;
  let lastManualSyncAt = 0;
  let privateStateRetryAfterAt = 0;
  let privateStateAuthoritySeq = 0;
  let privateStateRequestSeq = 0;
  let lastAppliedPrivateStateRequestSeq = 0;
  let reconnectAttempts = 0;
  let suppressReconnect = false;
  let actionFeedbackTimer: number | null = null;

  function clearActionFeedbackTimer(): void {
    if (actionFeedbackTimer !== null) {
      window.clearTimeout(actionFeedbackTimer);
      actionFeedbackTimer = null;
    }
  }

  function clearActionFeedback(): void {
    clearActionFeedbackTimer();
    actionFeedback.value = null;
  }

  function showActionFeedback(feedback: ActionFeedback, visibleMs = 0): void {
    clearActionFeedbackTimer();
    actionFeedback.value = feedback;
    if (visibleMs <= 0) {
      return;
    }
    actionFeedbackTimer = window.setTimeout(() => {
      actionFeedbackTimer = null;
      if (
        actionFeedback.value?.status === feedback.status &&
        actionFeedback.value.decisionKey === feedback.decisionKey
      ) {
        actionFeedback.value = feedback.status === "received"
          ? { ...feedback, visible: false }
          : null;
      }
    }, visibleMs);
  }

  function beginActionSubmission(decisionKey: string): void {
    showActionFeedback({
      status: "pending",
      message: "操作已提交，正在确认。",
      decisionKey,
    });
    actionFeedbackTimer = window.setTimeout(() => {
      actionFeedbackTimer = null;
      if (actionFeedback.value?.status !== "pending" || actionFeedback.value.decisionKey !== decisionKey) {
        return;
      }
      if (decisionTimer.value.decisionKey && decisionTimer.value.decisionKey !== decisionKey) {
        showActionFeedback(
          { status: "received", message: "牌局已继续。", decisionKey },
          ACTION_RECEIVED_VISIBLE_MS,
        );
        return;
      }
      showActionFeedback(
        {
          status: "rejected",
          message: "暂未收到服务器确认，请按当前提示重试。",
          decisionKey,
        },
        ACTION_REJECTED_VISIBLE_MS,
      );
    }, ACTION_RECEIPT_WAIT_MS);
  }

  function actionSubmissionLocked(decisionKey: string): boolean {
    return Boolean(
      decisionKey &&
      actionFeedback.value?.decisionKey === decisionKey &&
      (actionFeedback.value.status === "pending" || actionFeedback.value.status === "received"),
    );
  }

  function reportUnsentAction(decisionKey: string): void {
    showActionFeedback(
      {
        status: "rejected",
        message: "网络未连接，这次操作没有发送，请稍候重试。",
        decisionKey,
      },
      ACTION_REJECTED_VISIBLE_MS,
    );
  }

  function inferSeatId(snapshot: RoomStateSnapshot | null): string {
    if (!snapshot) {
      return "";
    }
    // Friend rooms can contain equal display names and unseated guests. Their
    // identity must come from the room-scoped token, never from a name match.
    if (snapshot.roomMode === "friends") {
      return "";
    }
    const connectedHumans = snapshot.players.filter((player) => !player.isBot && player.connected);
    const exactNameMatches = connectedHumans.filter(
      (player) => localPlayerName.value && player.name === localPlayerName.value,
    );
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0]?.clientId ?? "";
    }
    if (connectedHumans.length === 1) {
      return connectedHumans[0]?.clientId ?? "";
    }
    return "";
  }

  function clearRoomStateSyncTimer() {
    if (roomStateSyncTimer !== null) {
      window.clearInterval(roomStateSyncTimer);
      roomStateSyncTimer = null;
    }
  }

  function clearMissingHandSyncTimer() {
    if (missingHandSyncTimer !== null) {
      window.clearInterval(missingHandSyncTimer);
      missingHandSyncTimer = null;
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function clearRestoredNoticeTimer() {
    if (restoredNoticeTimer !== null) {
      window.clearTimeout(restoredNoticeTimer);
      restoredNoticeTimer = null;
    }
  }

  function clearPrivateStatePollTimer() {
    if (privateStatePollTimer !== null) {
      window.clearInterval(privateStatePollTimer);
      privateStatePollTimer = null;
    }
  }

  function stopTerminalRecovery(message: string) {
    suppressReconnect = true;
    clearRoomStateSyncTimer();
    clearMissingHandSyncTimer();
    clearReconnectTimer();
    clearRestoredNoticeTimer();
    clearPrivateStatePollTimer();
    clearActionFeedback();
    connected.value = false;
    room.value = null;
    reconnectAttempt.value = 0;
    reconnectAttempts = 0;
    connectionState.value = "closed";
    joinError.value = message;
  }

  function getRoomSocketReadyState(targetRoom: unknown): number | null {
    const connection = (targetRoom as { connection?: { isOpen?: boolean; transport?: { ws?: { readyState?: number } } } } | null)
      ?.connection;
    if (typeof connection?.transport?.ws?.readyState === "number") {
      return Number(connection.transport.ws.readyState);
    }
    if (typeof connection?.isOpen === "boolean") {
      return connection.isOpen ? 1 : 0;
    }
    return null;
  }

  function canSendRoomMessage(targetRoom: unknown): boolean {
    if (!targetRoom) {
      return false;
    }
    const readyState = getRoomSocketReadyState(targetRoom);
    if (readyState === null) {
      return Boolean(connected.value);
    }
    return readyState === 1;
  }

  function safeRoomSend(type: string, payload?: unknown): boolean {
    if (!room.value || !canSendRoomMessage(room.value)) {
      if (room.value && getRoomSocketReadyState(room.value) === 3) {
        scheduleReconnect(`send:${type}`);
      }
      return false;
    }
    try {
      if (payload === undefined) {
        room.value.send(type);
      } else {
        room.value.send(type, payload);
      }
      return true;
    } catch (error) {
      void error;
      scheduleReconnect(`send_failed:${type}`);
      return false;
    }
  }

  function scheduleReconnect(reason: string, immediate = false) {
    if (suppressReconnect) {
      return;
    }
    if (connectInFlight || reconnectTimer !== null) {
      return;
    }
    const roomId = activeRoomId.value.trim();
    const token = playerToken.value.trim();
    const name = localPlayerName.value.trim();
    if (!roomId || !token || !name) {
      connected.value = false;
      connectionState.value = "failed";
      return;
    }
    connected.value = false;
    clearRestoredNoticeTimer();
    if (!navigator.onLine) {
      connectionState.value = "offline";
      joinError.value = "网络已断开，联网后会自动恢复牌局。";
      return;
    }
    const nextAttempt = reconnectAttempts + 1;
    reconnectAttempt.value = nextAttempt;
    connectionState.value = immediate ? "reconnecting" : "retry_wait";
    joinError.value = `网络不稳定，正在恢复牌局（第 ${nextAttempt} 次）...`;
    const delay = immediate ? 0 : Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** Math.min(reconnectAttempts, 5));
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (suppressReconnect) {
        return;
      }
      if (!navigator.onLine) {
        connectionState.value = "offline";
        joinError.value = "网络已断开，联网后会自动恢复牌局。";
        return;
      }
      reconnectAttempts += 1;
      reconnectAttempt.value = reconnectAttempts;
      connectionState.value = "reconnecting";
      void connect({
        nameOverride: name,
        roomId,
        playerToken: token,
        reconnecting: true,
        preserveState: true,
      }).then((ok) => {
        if (ok) {
          return;
        }
        scheduleReconnect(`${reason}:retry`);
      });
    }, delay);
  }

  function retryConnection() {
    if (suppressReconnect || connectInFlight) {
      return;
    }
    clearReconnectTimer();
    scheduleReconnect("manual_retry", true);
  }

  function handleBrowserOffline() {
    if (suppressReconnect || !activeRoomId.value || !playerToken.value) {
      return;
    }
    connected.value = false;
    clearReconnectTimer();
    clearRestoredNoticeTimer();
    clearActionFeedback();
    connectionState.value = "offline";
    joinError.value = "网络已断开，联网后会自动恢复牌局。";
  }

  function handleBrowserOnline() {
    if (suppressReconnect || connected.value || !activeRoomId.value || !playerToken.value) {
      return;
    }
    retryConnection();
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") {
      return;
    }
    if (!connected.value) {
      handleBrowserOnline();
      return;
    }
    requestSyncState("page_visible");
    void fetchPrivateState("page_visible");
  }

  function privateHandCountMatches(snapshot = state.value): boolean {
    if (!snapshot || !mySeatId.value) {
      return true;
    }
    return isPrivateHandSynchronized(snapshot, mySeatId.value, privateHand.value.length);
  }

  function maybeRequestMissingPrivateHand(reason: string) {
    const phase = state.value?.phase;
    if (!room.value || !mySeatId.value || (phase !== "declaring" && phase !== "playing")) {
      clearMissingHandSyncTimer();
      return;
    }
    if (privateHandCountMatches()) {
      clearMissingHandSyncTimer();
      return;
    }
    if (!connected.value || !canSendRoomMessage(room.value)) {
      clearMissingHandSyncTimer();
      scheduleReconnect(`missing_private_hand:${reason}`);
      return;
    }
    requestSyncState(reason);
    void fetchPrivateState(reason);
  }

  function startMissingHandSyncTimer() {
    clearMissingHandSyncTimer();
    missingHandSyncTimer = window.setInterval(() => {
      maybeRequestMissingPrivateHand("missing_private_hand_retry");
    }, 1000);
  }

  function requestSyncState(reason: string) {
    if (!room.value) {
      return;
    }
    if (!connected.value || !canSendRoomMessage(room.value)) {
      clearMissingHandSyncTimer();
      return;
    }
    const now = Date.now();
    if (now - lastManualSyncAt < 300) {
      return;
    }
    lastManualSyncAt = now;
    if (!safeRoomSend("sync_state")) {
      void reason;
    }
  }

  async function fetchPrivateState(reason: string): Promise<void> {
    if (Date.now() < privateStateRetryAfterAt) {
      return;
    }
    const roomId = activeRoomId.value.trim();
    const token = playerToken.value.trim();
    if (!roomId || !token || !mySeatId.value) {
      return;
    }
    const requestConnectionSeq = activeConnectionSeq;
    const requestAuthoritySeq = privateStateAuthoritySeq;
    const requestSeq = ++privateStateRequestSeq;
    const isCurrentRequest = () =>
      requestConnectionSeq === activeConnectionSeq &&
      activeRoomId.value.trim() === roomId &&
      playerToken.value.trim() === token &&
      requestAuthoritySeq === privateStateAuthoritySeq &&
      requestSeq > lastAppliedPrivateStateRequestSeq;
    try {
      const url = new URL(`${HTTP_URL}/private-state`);
      url.searchParams.set("roomId", roomId);
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!isCurrentRequest()) {
        return;
      }
      if (!response.ok) {
        if (response.status === 429) {
          privateStateRetryAfterAt = Date.now() + retryAfterMilliseconds(response);
        }
        return;
      }
      const payload = (await response.json()) as {
        ok?: boolean;
        seatId?: string;
        privateHand?: unknown;
        availableActions?: unknown;
        decisionTimer?: unknown;
        roundResult?: RoundResultPayload | null;
      };
      if (!isCurrentRequest() || !payload?.ok) {
        return;
      }
      lastAppliedPrivateStateRequestSeq = requestSeq;
      if (payload.seatId) {
        mySeatId.value = payload.seatId;
      }
      const nextHand = sortHandCards(asCardArray(payload.privateHand));
      const nextActions = normalizeAvailableActions(payload.availableActions);
      privateHand.value = nextHand;
      availableActions.value = nextActions;
      applyDecisionTimer(payload.decisionTimer);
      privateHandFingerprint = buildCardIdFingerprint(nextHand);
      availableActionsFingerprint = buildAvailableActionsFingerprint(nextActions);
      if (payload.roundResult && state.value?.phase === "ended") {
        roundResult.value = normalizeRoundResultPayload(payload.roundResult);
        if (roundResult.value.winnerId) {
          huResult.value = {
            winnerId: roundResult.value.winnerId,
            groups: roundResult.value.groups ?? [],
          };
        }
      }
      if (privateHandCountMatches()) {
        clearMissingHandSyncTimer();
        joinError.value = "";
      }
    } catch {
      void reason;
    }
  }

  function startPrivateStatePolling() {
    clearPrivateStatePollTimer();
    privateStatePollTimer = window.setInterval(() => {
      const phase = state.value?.phase;
      if (!connected.value || !activeRoomId.value || !playerToken.value || !mySeatId.value) {
        return;
      }
      if (phase !== "waiting" && phase !== "declaring" && phase !== "playing" && phase !== "ended") {
        return;
      }
      void fetchPrivateState("poll");
    }, PRIVATE_STATE_POLL_MS);
  }

  function resetClientRoomState(options?: { keepLogs?: boolean; keepJoinError?: boolean }) {
    const keepLogs = Boolean(options?.keepLogs);
    const keepJoinError = Boolean(options?.keepJoinError);
    clearMissingHandSyncTimer();
    clearPrivateStatePollTimer();
    clearActionFeedback();
    state.value = null;
    privateHand.value = [];
    availableActions.value = [];
    huResult.value = null;
    roundResult.value = null;
    debugApplied.value = null;
    declareError.value = "";
    decisionTimer.value = {
      untimed: false,
      canRequestMoreTime: false,
      extensionSeconds: 20,
      totalMs: 0,
      endsAt: 0,
      decisionKey: "",
    };
    myId.value = "";
    mySeatId.value = "";
    stateSyncFingerprint = "";
    privateHandFingerprint = "";
    availableActionsFingerprint = "";
    privateStateRetryAfterAt = 0;
    lastFingerprint = "";
    lastPhase = "";
    if (!keepLogs) {
      clearActionLogs();
    }
    if (!keepJoinError) {
      joinError.value = "";
    }
  }

  function returnToModeLobbyFromRoom(reason: string) {
    const departingRoomId = activeRoomId.value.trim();
    suppressReconnect = true;
    activeConnectionSeq += 1;
    connectInFlight = false;
    clearRoomStateSyncTimer();
    clearMissingHandSyncTimer();
    clearReconnectTimer();
    clearRestoredNoticeTimer();
    clearPrivateStatePollTimer();
    connected.value = false;
    connectionState.value = "idle";
    reconnectAttempt.value = 0;
    reconnectAttempts = 0;
    room.value = null;
    if (departingRoomId) {
      clearStored(tokenKey(departingRoomId));
    }
    clearStored(ROOM_KEY);
    clearStored(LEGACY_TOKEN_KEY);
    playerToken.value = "";
    activeRoomId.value = "";
    resetClientRoomState({ keepJoinError: true });
    joinError.value = reason;
    const url = new URL(window.location.href);
    url.searchParams.delete("roomId");
    url.searchParams.delete("playerToken");
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url.toString());
  }

  function buildStateSyncFingerprint(snapshot: RoomStateSnapshot | null): string {
    if (!snapshot) {
      return "";
    }
    const playerMarks = snapshot.players
      .map(
        (player) =>
          [
            player.clientId,
            player.handCount ?? 0,
            player.declaredKongs ?? 0,
            player.connected ? 1 : 0,
            player.declaredReady ? 1 : 0,
            player.lobbyReady ? 1 : 0,
            player.isAutoPlay ? 1 : 0,
            player.cumulativeScore,
            player.discardPile.map((card) => card.id).join(","),
            player.exposedArea.map((card) => card.id).join(","),
            player.exposedGroupKinds.join(","),
            player.generalArea.map((card) => card.id).join(","),
            player.fishArea.map((card) => card.id).join(","),
          ].join(":"),
      )
      .join("|");
    return [
      snapshot.roomId ?? activeRoomId.value,
      snapshot.roomMode,
      snapshot.scoringMode,
      String(snapshot.completedRounds),
      snapshot.phase,
      String(snapshot.matchStartsAt),
      snapshot.responsePhase,
      snapshot.hostPlayerId,
      snapshot.dealerId,
      snapshot.dealerPickerId ?? "",
      snapshot.currentPlayerId,
      snapshot.currentTurnPlayerId,
      snapshot.previousPlayerId,
      snapshot.pollOriginPlayerId,
      snapshot.activeResponderId,
      String(snapshot.responseEndsAt),
      String(snapshot.declareEndsAt),
      snapshot.lastAction,
      String(snapshot.deckCount),
      snapshot.targetCard?.id ?? "",
      snapshot.responseCard?.id ?? "",
      snapshot.dealerCard?.id ?? "",
      snapshot.publicDiscardPile.map((card) => card.id).join("|"),
      (snapshot.publicGeneralPool ?? []).map((card) => card.id).join("|"),
      playerMarks,
    ].join("::");
  }

  function buildCardIdFingerprint(cards: Card[]): string {
    return cards.map((card) => card.id).join("|");
  }

  function buildAvailableActionsFingerprint(actions: AvailableAction[]): string {
    return actions
      .map((action) =>
        [
          action.action,
          action.enabled ? "1" : "0",
          action.deferred ? "1" : "0",
          (action.candidates ?? [])
            .map((candidate) => `${candidate.id}:${candidate.cardIds.join(",")}:${candidate.source}:${candidate.kind ?? ""}`)
            .join("|"),
        ].join(":"),
      )
      .join(";");
  }

  function applyDecisionTimer(input: unknown): void {
    if (!input || typeof input !== "object") {
      return;
    }
    const raw = input as Partial<DecisionTimerState>;
    const nextTimer: DecisionTimerState = {
      untimed: Boolean(raw.untimed),
      canRequestMoreTime: Boolean(raw.canRequestMoreTime),
      extensionSeconds: Math.max(1, Math.ceil(Number(raw.extensionSeconds) || 20)),
      totalMs: Math.max(0, Number(raw.totalMs) || 0),
      endsAt: Math.max(0, Number(raw.endsAt) || 0),
      decisionKey: typeof raw.decisionKey === "string" ? raw.decisionKey.trim() : "",
    };
    decisionTimer.value = nextTimer;
  }

  function applySnapshot(next: unknown) {
    // Access Proxy properties directly without calling toJSON() to avoid circular reference
    const rawSnapshot = next as any;
    if (
      Object.prototype.hasOwnProperty.call(rawSnapshot ?? {}, "privateHand") ||
      Object.prototype.hasOwnProperty.call(rawSnapshot ?? {}, "availableActions") ||
      Object.prototype.hasOwnProperty.call(rawSnapshot ?? {}, "roundResult")
    ) {
      privateStateAuthoritySeq += 1;
    }
    const normalized = normalizeSnapshot(next);
    const snapshotServerNow = Number(rawSnapshot?.serverNow ?? 0);
    if (Number.isFinite(snapshotServerNow) && snapshotServerNow > 0) {
      matchClockSync.value = {
        deadline: normalized.matchStartsAt,
        offsetMs: snapshotServerNow - Date.now(),
      };
    }
    if (normalized.phase !== "playing") {
      clearActionFeedback();
    }
    applyDecisionTimer(rawSnapshot?.decisionTimer);
    const previousSnapshot = state.value;
    if (
      !normalized.dealerCard &&
      normalized.dealerId &&
      previousSnapshot?.dealerCard &&
      previousSnapshot.dealerId === normalized.dealerId &&
      (previousSnapshot.phase === "declaring" || previousSnapshot.phase === "playing") &&
      (normalized.phase === "declaring" || normalized.phase === "playing" || normalized.phase === "ended")
    ) {
      // The explicit room snapshot carries the authoritative dealer card. The
      // SDK Schema view can momentarily expose its pre-round empty child ref;
      // never let that transient value erase a confirmed card mid-round.
      normalized.dealerCard = previousSnapshot.dealerCard;
    }
    const snapshotPrivateHand = sortHandCards(asCardArray(rawSnapshot?.privateHand));
    const snapshotAvailableActions = normalizeAvailableActions(rawSnapshot?.availableActions);

    if (!normalized.roomId && activeRoomId.value) {
      normalized.roomId = activeRoomId.value;
    }
    if (normalized.roomId && normalized.roomId !== activeRoomId.value) {
      activeRoomId.value = normalized.roomId;
      stateSyncFingerprint = "";
      privateHandFingerprint = "";
      availableActionsFingerprint = "";
      lastFingerprint = "";
      lastPhase = "";
      privateHand.value = [];
      availableActions.value = [];
      huResult.value = null;
      roundResult.value = null;
      debugApplied.value = null;
    }
    const nextFingerprint = buildStateSyncFingerprint(normalized);
    const nextPrivateHandFingerprint = buildCardIdFingerprint(snapshotPrivateHand);
    const nextAvailableActionsFingerprint = buildAvailableActionsFingerprint(snapshotAvailableActions);

    if (
      (snapshotPrivateHand.length > 0 || rawSnapshot?.privateHand) &&
      nextPrivateHandFingerprint !== privateHandFingerprint
    ) {
      privateHand.value = snapshotPrivateHand;
      privateHandFingerprint = nextPrivateHandFingerprint;
      if (privateHandCountMatches(normalized)) {
        clearMissingHandSyncTimer();
      }
    }

    if (
      (Array.isArray(rawSnapshot?.availableActions) || rawSnapshot?.availableActions) &&
      nextAvailableActionsFingerprint !== availableActionsFingerprint
    ) {
      availableActions.value = snapshotAvailableActions;
      availableActionsFingerprint = nextAvailableActionsFingerprint;
    }

    if (rawSnapshot?.roundResult && normalized.phase === "ended") {
      roundResult.value = normalizeRoundResultPayload(rawSnapshot.roundResult as RoundResultPayload);
      if (roundResult.value.winnerId) {
        huResult.value = {
          winnerId: roundResult.value.winnerId,
          groups: roundResult.value.groups ?? [],
        };
      }
    }

    if (nextFingerprint === stateSyncFingerprint) {
      return;
    }
    stateSyncFingerprint = nextFingerprint;
    state.value = normalized;
    if (!mySeatId.value) {
      const inferredSeatId = inferSeatId(normalized);
      if (inferredSeatId) {
        mySeatId.value = inferredSeatId;
      }
    }
    if (
      mySeatId.value &&
      (normalized.phase === "declaring" || normalized.phase === "playing") &&
      !privateHandCountMatches(normalized)
    ) {
      requestSyncState("stale_private_hand");
      startMissingHandSyncTimer();
    } else {
      clearMissingHandSyncTimer();
    }

    const currentPhase = String(state.value?.phase ?? "");
    const previousPhase = lastPhase;
    if (
      (previousPhase === "ended" || previousPhase === "waiting") &&
      (currentPhase === "declaring" || currentPhase === "playing")
    ) {
      clearActionLogs();
    }
    if (previousPhase === "ended" && currentPhase !== "ended") {
      huResult.value = null;
      roundResult.value = null;
    }
    if (currentPhase === "waiting" || currentPhase === "declaring" || currentPhase === "playing") {
      joinError.value = "";
    }
    lastPhase = currentPhase;

    const lastAction = String(state.value?.lastAction ?? "").trim();
    const fingerprint = `${lastAction}|${String(state.value?.phase ?? "")}|${String(state.value?.currentPlayerId ?? "")}|${String(state.value?.responseCard?.id ?? "")}|${String(state.value?.deckCount ?? "")}`;
    if (lastAction && fingerprint !== lastFingerprint) {
      pushLog(lastAction, normalized);
      lastFingerprint = fingerprint;
    }

  }

  function startRoomStateSync() {
    clearRoomStateSyncTimer();
    roomStateSyncTimer = window.setInterval(() => {
      if (!connected.value || !room.value?.state || !canSendRoomMessage(room.value)) {
        return;
      }
      applySnapshot(room.value.state);
    }, 250);
  }

  function readStored(key: string): string {
    return (window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? "").trim();
  }

  function writeStored(key: string, value: string) {
    window.localStorage.setItem(key, value);
    window.sessionStorage.setItem(key, value);
  }

  function clearStored(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }

  function tokenKey(roomId: string): string {
    return `four_player_token:${roomId}`;
  }

  function updateInviteUrl(roomId: string) {
    if (!roomId) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("roomId", roomId);
    url.searchParams.delete("playerToken");
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url.toString());
  }

  async function createCompatibilityPracticeRoomId(): Promise<string> {
    const response = await fetch(`${HTTP_URL}/room-id`, { method: "GET" });
    if (!response.ok) {
      throw new Error(await apiErrorMessage(response, "获取房间失败，请稍后重试。"));
    }
    const payload = (await response.json()) as { ok?: boolean; roomId?: string };
    if (!payload?.roomId) {
      throw new Error("服务端未返回可用房间");
    }
    return payload.roomId;
  }

  function pushLog(text: string, snapshot?: RoomStateSnapshot) {
    const line = String(text ?? "").trim();
    if (!line) {
      return;
    }
    const { actorId, actionKey } = parseActionDescriptor(line);
    const displayText = actionHistoryText(actionKey);
    if (!displayText) {
      return;
    }
    actionLogs.value = [
      {
        id: ++logSeq,
        at: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        text: line,
        actorId,
        actionKey,
        displayText,
        isSystem: !actorId,
        cardLabel: actionCardLabel(line, snapshot),
      },
      ...actionLogs.value,
    ].slice(0, MAX_LOGS);
  }

  function clearActionLogs() {
    actionLogs.value = [];
    logSeq = 0;
    lastFingerprint = "";
  }

  async function connect(options?: string | ConnectOptions): Promise<boolean> {
    if (connectInFlight) {
      return false;
    }
    const query = new URLSearchParams(window.location.search);
    const resolvedOptions: ConnectOptions =
      typeof options === "string"
        ? { nameOverride: options }
        : {
            nameOverride: options?.nameOverride,
            roomId: options?.roomId,
            playerToken: options?.playerToken,
            hostKey: options?.hostKey,
            forceNew: Boolean(options?.forceNew),
            reconnecting: Boolean(options?.reconnecting),
            preserveState: Boolean(options?.preserveState),
            matchmaking: Boolean(options?.matchmaking),
            exposeRoomIdInUrl: Boolean(options?.exposeRoomIdInUrl),
          };
    const forceNew = Boolean(resolvedOptions.forceNew || query.get("new") === "1");
    const reconnecting = Boolean(resolvedOptions.reconnecting);
    const preserveState = !forceNew && Boolean(resolvedOptions.preserveState || reconnecting);
    const matchmaking = Boolean(resolvedOptions.matchmaking);
    const exposeRoomIdInUrl = Boolean(
      resolvedOptions.exposeRoomIdInUrl || (!matchmaking && query.get("roomId")?.trim()),
    );

    suppressReconnect = false;
    connectInFlight = true;
    clearReconnectTimer();
    clearRestoredNoticeTimer();
    connectionState.value = reconnecting ? "reconnecting" : "connecting";
    const connectionSeq = ++activeConnectionSeq;
    const isActiveConnection = () => activeConnectionSeq === connectionSeq;
    const client = new Client(WS_URL);
    try {
      clearRoomStateSyncTimer();
      clearMissingHandSyncTimer();
      clearPrivateStatePollTimer();
      const previousRoom = room.value;
      room.value = null;
      connected.value = false;
      if (!preserveState) {
        activeRoomId.value = "";
        resetClientRoomState({ keepJoinError: true });
      }
      if (previousRoom && !preserveState) {
        try {
          suppressReconnect = true;
          await previousRoom.leave();
        } catch {
          // ignore stale leave errors when switching rooms
        } finally {
          suppressReconnect = false;
        }
      }

      if (forceNew) {
        clearStored(LEGACY_TOKEN_KEY);
        clearStored(NAME_KEY);
        clearStored(ROOM_KEY);
      }

      const queryRoomId = resolvedOptions.roomId?.trim() || query.get("roomId")?.trim() || "";
      const queryToken = resolvedOptions.playerToken?.trim() || query.get("playerToken")?.trim() || "";
      const queryName = query.get("playerName")?.trim() ?? "";
      const cachedRoomId = readStored(ROOM_KEY);
      const cachedName = readStored(NAME_KEY);
      const desiredName = String(resolvedOptions.nameOverride ?? "").trim() || queryName || cachedName || playerName;
      localPlayerName.value = desiredName;
      const initialRoomId = matchmaking
        ? ""
        : queryRoomId || cachedRoomId || (await createCompatibilityPracticeRoomId());
      const cachedToken = (initialRoomId && readStored(tokenKey(initialRoomId))) ||
        (cachedRoomId === initialRoomId ? readStored(LEGACY_TOKEN_KEY) : "");
      const desiredToken = queryToken || cachedToken || generateLocalPlayerToken();
      playerToken.value = desiredToken;
      if (preserveState && !activeRoomId.value) {
        activeRoomId.value = initialRoomId;
      }
      if (initialRoomId) {
        writeStored(tokenKey(initialRoomId), desiredToken);
      }
      writeStored(NAME_KEY, desiredName);

      let joined: Room;
      try {
        joined = matchmaking
          ? await client.joinOrCreate("four-color", {
              name: desiredName,
              playerToken: desiredToken,
              roomMode: "match",
              matchOpen: true,
            })
          : await client.joinById(initialRoomId, {
              name: desiredName,
              playerToken: desiredToken,
              hostKey: resolvedOptions.hostKey,
            });
      } catch (error) {
        const closeCode =
          error instanceof MatchMakeError
            ? error.code
            : Number((error as { code?: unknown } | null)?.code);
        if (TERMINAL_ROOM_CLOSE_MESSAGES[closeCode]) {
          throw error;
        }
        if (reconnecting || matchmaking) {
          throw error;
        }
        if (queryRoomId) {
          throw new Error("房间不存在或已关闭，请让房主重新分享邀请链接。");
        }
        clearStored(ROOM_KEY);
        const fallbackRoomId = await createCompatibilityPracticeRoomId();
        joined = await client.joinById(fallbackRoomId, {
          name: desiredName,
          playerToken: desiredToken,
          hostKey: resolvedOptions.hostKey,
        });
      }
      // This app restores stable seats with its room-scoped playerToken. The
      // server intentionally does not use Colyseus allowReconnection(), so the
      // SDK's independent retry loop can only race our authoritative recovery.
      joined.reconnection.enabled = false;
      if (!isActiveConnection()) {
        suppressReconnect = true;
        await joined.leave().catch(() => undefined);
        return false;
      }
      room.value = joined;
      myId.value = joined.sessionId;
      connected.value = true;
      joinError.value = "";
      reconnectAttempts = 0;
      reconnectAttempt.value = 0;
      activeRoomId.value = joined.roomId || initialRoomId;
      if (reconnecting || preserveState) {
        connectionState.value = "restored";
        restoredNoticeTimer = window.setTimeout(() => {
          restoredNoticeTimer = null;
          if (connected.value && room.value === joined) {
            connectionState.value = "connected";
          }
        }, RESTORED_NOTICE_MS);
      } else {
        connectionState.value = "connected";
      }
      if (joined.roomId) {
        writeStored(ROOM_KEY, joined.roomId);
        if (exposeRoomIdInUrl) {
          updateInviteUrl(joined.roomId);
        }
      }

      const isCurrentJoinedRoom = () =>
        isActiveConnection() && room.value === joined && activeRoomId.value === (joined.roomId || initialRoomId);

      joined.onStateChange((next) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        applySnapshot(next);
      });
      startRoomStateSync();
      startPrivateStatePolling();
      joined.onMessage("room_snapshot", (payload: RoomStateSnapshot) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        applySnapshot(payload);
      });
      joined.onMessage("private_hand", (payload: Card[] | { cards?: Card[] }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        privateStateAuthoritySeq += 1;
        privateHand.value = sortHandCards(asCardArray(payload));
        privateHandFingerprint = buildCardIdFingerprint(privateHand.value);
        if (privateHandCountMatches()) {
          clearMissingHandSyncTimer();
        } else {
          requestSyncState("stale_private_hand_message");
          startMissingHandSyncTimer();
        }
      });
      joined.onMessage(
        "available_actions",
        (payload: AvailableAction[] | { items?: AvailableAction[]; decisionTimer?: unknown }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        privateStateAuthoritySeq += 1;
        availableActions.value = normalizeAvailableActions(payload);
        applyDecisionTimer(Array.isArray(payload) ? undefined : payload?.decisionTimer);
        availableActionsFingerprint = buildAvailableActionsFingerprint(availableActions.value);
        },
      );
      joined.onMessage("action_received", (payload: { decisionKey?: string; message?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        const decisionKey = String(payload?.decisionKey ?? "").trim();
        const currentDecisionKey = decisionTimer.value.decisionKey;
        if (decisionKey && currentDecisionKey && decisionKey !== currentDecisionKey) {
          return;
        }
        if (
          actionFeedback.value?.status === "pending" &&
          actionFeedback.value.decisionKey &&
          decisionKey &&
          actionFeedback.value.decisionKey !== decisionKey
        ) {
          return;
        }
        showActionFeedback(
          {
            status: "received",
            message: String(payload?.message ?? "").trim() || "操作已收到，正在继续牌局。",
            decisionKey,
          },
          ACTION_RECEIVED_VISIBLE_MS,
        );
      });
      joined.onMessage("action_rejected", (payload: { reason?: string; decisionKey?: string; message?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        const reason = String(payload?.reason ?? "unknown");
        const decisionKey = String(payload?.decisionKey ?? decisionTimer.value.decisionKey).trim();
        if (decisionKey && decisionTimer.value.decisionKey && decisionKey !== decisionTimer.value.decisionKey) {
          return;
        }
        pushLog(`ACTION_REJECTED ${reason}`);
        showActionFeedback(
          {
            status: "rejected",
            message: String(payload?.message ?? "").trim() || "这次操作没有生效，请按当前提示重新选择。",
            decisionKey,
          },
          ACTION_REJECTED_VISIBLE_MS,
        );
      });
      joined.onMessage("hu_result", (payload: { winnerId: string; groups: string[] }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        huResult.value = payload;
        pushLog(`HU_RESULT ${payload.winnerId}`);
      });
      joined.onMessage("round_result", (payload: RoundResultPayload) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        privateStateAuthoritySeq += 1;
        roundResult.value = normalizeRoundResultPayload(payload);
        pushLog(`ROUND_RESULT ${payload.winnerId ?? "-"}`);
      });
      joined.onMessage("debug_applied", (payload: {
        scenario: string;
        ok: boolean;
        ts: number;
        actions?: AvailableAction[];
      }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        debugApplied.value = payload;
      });
      joined.onMessage("session_token", (payload: SessionTokenPayload) => {
        if (!isActiveConnection() || room.value !== joined) {
          return;
        }
        playerToken.value = payload.playerToken;
        mySeatId.value = payload.seatId;
        writeStored(NAME_KEY, desiredName);
        if (payload.roomId) {
          if (payload.roomId !== activeRoomId.value) {
            activeRoomId.value = payload.roomId;
            stateSyncFingerprint = "";
            lastFingerprint = "";
          }
          writeStored(ROOM_KEY, payload.roomId);
          writeStored(tokenKey(payload.roomId), payload.playerToken);
          if (exposeRoomIdInUrl) {
            updateInviteUrl(payload.roomId);
          }
        }
        pushLog(`SEAT ${payload.seatId}${payload.reclaimed ? " RECLAIM" : " JOIN"}`);
        void fetchPrivateState("seat_confirmed");
      });
      joined.onMessage("lobby_presence", (payload: { roomId?: string; seated?: boolean }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        if (payload?.seated === false) {
          mySeatId.value = "";
          privateHand.value = [];
          availableActions.value = [];
          privateHandFingerprint = "";
          availableActionsFingerprint = "";
        }
      });
      joined.onMessage("session_replaced", (payload: { message?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        stopTerminalRecovery(payload?.message || TERMINAL_ROOM_CLOSE_MESSAGES[4102]);
      });
      joined.onMessage("join_error", (payload: { message: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        joinError.value = payload?.message ?? "加入失败";
        pushLog(`ERROR ${joinError.value}`);
      });
      joined.onMessage("lobby_error", (payload: { code?: string; message?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        joinError.value = payload?.message || "大厅操作失败";
      });
      joined.onMessage("removed_from_room", (payload: { reason?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        const reason = payload?.reason || "你已离开房间";
        returnToModeLobbyFromRoom(reason);
      });
      joined.onMessage("room_dissolved", (payload: { reason?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        returnToModeLobbyFromRoom(payload?.reason || TERMINAL_ROOM_CLOSE_MESSAGES[4110]);
      });
      joined.onMessage("declare_rejected", (payload: { reason?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        declareError.value = payload?.reason ?? "声明提交失败";
        pushLog(`DECLARE_REJECTED ${declareError.value}`);
      });
      joined.onLeave((code) => {
        if (!isActiveConnection() || room.value !== joined) {
          return;
        }
        if (code === 4110) {
          returnToModeLobbyFromRoom(TERMINAL_ROOM_CLOSE_MESSAGES[4110]);
          return;
        }
        const terminalMessage = TERMINAL_ROOM_CLOSE_MESSAGES[code];
        if (terminalMessage) {
          stopTerminalRecovery(terminalMessage);
          return;
        }
        clearRoomStateSyncTimer();
        clearMissingHandSyncTimer();
        clearPrivateStatePollTimer();
        connected.value = false;
        scheduleReconnect("room_leave");
      });
      joined.onError((code, message) => {
        if (!isActiveConnection() || room.value !== joined) {
          return;
        }
        const terminalMessage = TERMINAL_ROOM_CLOSE_MESSAGES[code];
        if (terminalMessage) {
          stopTerminalRecovery(terminalMessage);
          return;
        }
        clearRoomStateSyncTimer();
        clearMissingHandSyncTimer();
        clearPrivateStatePollTimer();
        joinError.value = message || "房间连接异常";
        connected.value = false;
        scheduleReconnect("room_error");
      });
      const rawSocket = (joined as { connection?: { transport?: { ws?: any } } }).connection?.transport?.ws;
      if (rawSocket && typeof rawSocket.addEventListener === "function") {
        rawSocket.addEventListener("close", (event: CloseEvent) => {
          if (!isCurrentJoinedRoom()) {
            return;
          }
          void event;
          connected.value = false;
          scheduleReconnect("socket_close");
        });
      }
      if (joined.state) {
        applySnapshot(joined.state);
      }
      void fetchPrivateState("after_join");
      return true;
    } catch (error) {
      if (!isActiveConnection()) {
        return false;
      }
      const message = error instanceof Error ? error.message : "加入房间失败";
      pushLog(`ERROR ${message}`);
      connected.value = false;
      room.value = null;
      const terminalMessage = terminalJoinFailureMessage(error);
      if (terminalMessage) {
        stopTerminalRecovery(terminalMessage);
      } else if (preserveState) {
        connectionState.value = navigator.onLine ? "retry_wait" : "offline";
        joinError.value = navigator.onLine
          ? `暂时未能恢复牌局，系统会继续重试（第 ${Math.max(1, reconnectAttempt.value)} 次）。`
          : "网络已断开，联网后会自动恢复牌局。";
      } else {
        joinError.value = message;
        connectionState.value = "failed";
        activeRoomId.value = "";
        resetClientRoomState({ keepJoinError: true, keepLogs: true });
      }
    } finally {
      if (isActiveConnection()) {
        connectInFlight = false;
      }
    }
    return false;
  }

  function sendAction(input: ActionRequest) {
    if (!room.value) {
      return;
    }
    if (typeof input === "string") {
      const action = normalizeAction(input);
      if (!action) {
        return;
      }
      const decisionKey = decisionTimer.value.decisionKey;
      if (actionSubmissionLocked(decisionKey)) {
        return;
      }
      if (safeRoomSend("action", decisionKey ? { action, decisionKey } : { action })) {
        beginActionSubmission(decisionKey);
      } else {
        reportUnsentAction(decisionKey);
      }
      return;
    }
    const action = normalizeAction(input.action);
    if (!action) {
      return;
    }
    const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
    const decisionKey = decisionTimer.value.decisionKey;
    if (actionSubmissionLocked(decisionKey)) {
      return;
    }
    if (candidateId) {
      if (safeRoomSend("action", { action, candidateId, ...(decisionKey ? { decisionKey } : {}) })) {
        beginActionSubmission(decisionKey);
      } else {
        reportUnsentAction(decisionKey);
      }
      return;
    }
    if (safeRoomSend("action", { action, ...(decisionKey ? { decisionKey } : {}) })) {
      beginActionSubmission(decisionKey);
    } else {
      reportUnsentAction(decisionKey);
    }
  }

  function sendDiscardCard(cardId: string) {
    if (!room.value || !cardId) {
      return;
    }
    const decisionKey = decisionTimer.value.decisionKey;
    if (actionSubmissionLocked(decisionKey)) {
      return;
    }
    if (safeRoomSend("discard_card", { cardId, ...(decisionKey ? { decisionKey } : {}) })) {
      beginActionSubmission(decisionKey);
    } else {
      reportUnsentAction(decisionKey);
    }
  }

  function declareKongs(count: number) {
    safeRoomSend("declare_kongs", count);
  }

  function declareSetup(payload: { declaredKongs: number; fishCardIds: string[] }) {
    declareError.value = "";
    if (!connected.value || !safeRoomSend("declare_setup", payload)) {
      declareError.value = "网络连接不稳定，声明没有发出；恢复后请重新提交。";
      return false;
    }
    return true;
  }

  function requestMoreTime() {
    const decisionKey = decisionTimer.value.decisionKey;
    if (!decisionTimer.value.canRequestMoreTime || !decisionKey) {
      return;
    }
    safeRoomSend("request_more_time", { decisionKey });
  }

  function debugSetup(scenario: string) {
    safeRoomSend("debug_setup", scenario);
  }

  function startGame() {
    clearActionLogs();
    joinError.value = "";
    safeRoomSend("start_game");
  }

  function nextRound() {
    clearActionLogs();
    safeRoomSend("next_round");
  }

  function returnLobby() {
    clearActionLogs();
    safeRoomSend("return_lobby");
  }

  function dissolveRoom() {
    joinError.value = "";
    safeRoomSend("dissolve_room");
  }

  function setScoringMode(mode: "single" | "cumulative") {
    joinError.value = "";
    safeRoomSend("set_scoring_mode", { mode });
  }

  function setLobbyReady(ready: boolean) {
    joinError.value = "";
    safeRoomSend("set_lobby_ready", { ready });
  }

  function setAutoPlay(enabled: boolean) {
    safeRoomSend("set_auto_play", { enabled });
  }

  async function leaveRoom(): Promise<void> {
    const departingRoom = room.value;
    const departingRoomId = activeRoomId.value.trim();
    suppressReconnect = true;
    activeConnectionSeq += 1;
    connectInFlight = false;
    clearRoomStateSyncTimer();
    clearMissingHandSyncTimer();
    clearReconnectTimer();
    clearRestoredNoticeTimer();
    clearPrivateStatePollTimer();
    room.value = null;
    connected.value = false;
    connectionState.value = "idle";
    reconnectAttempt.value = 0;
    reconnectAttempts = 0;
    clearStored(ROOM_KEY);
    clearStored(LEGACY_TOKEN_KEY);
    if (departingRoomId) {
      clearStored(tokenKey(departingRoomId));
    }
    playerToken.value = "";
    activeRoomId.value = "";
    resetClientRoomState();
    const url = new URL(window.location.href);
    url.searchParams.delete("roomId");
    url.searchParams.delete("playerToken");
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url.toString());
    if (departingRoom) {
      await departingRoom.leave().catch(() => undefined);
    }
  }

  function claimSeat(seatIndex: number) {
    joinError.value = "";
    safeRoomSend("claim_seat", { seatIndex });
  }

  function addBot(seatIndex: number, strength = 50) {
    joinError.value = "";
    safeRoomSend("add_bot", { seatIndex, strength });
  }

  function fillBots() {
    joinError.value = "";
    safeRoomSend("fill_bots");
  }

  function updateBot(seatIndex: number, strength: number) {
    safeRoomSend("update_bot", { seatIndex, strength });
  }

  function removeSeat(seatIndex: number) {
    joinError.value = "";
    safeRoomSend("remove_seat", { seatIndex });
  }

  window.addEventListener("offline", handleBrowserOffline);
  window.addEventListener("online", handleBrowserOnline);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  onUnmounted(() => {
    clearRoomStateSyncTimer();
    clearMissingHandSyncTimer();
    clearReconnectTimer();
    clearRestoredNoticeTimer();
    clearPrivateStatePollTimer();
    clearActionFeedback();
    window.removeEventListener("offline", handleBrowserOffline);
    window.removeEventListener("online", handleBrowserOnline);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    suppressReconnect = true;
    room.value?.leave();
  });

  const players = computed<PlayerState[]>(() => {
    return state.value?.players ?? [];
  });

  return {
    connected,
    connectionState,
    reconnectAttempt,
    myId,
    mySeatId,
    playerToken,
    activeRoomId,
    state,
    players,
    privateHand,
    availableActions,
    huResult,
    roundResult,
    debugApplied,
    joinError,
    declareError,
    actionLogs,
    actionFeedback,
    matchClockSync,
    decisionTimer,
    connect,
    retryConnection,
    clearActionLogs,
    sendAction,
    sendDiscardCard,
    declareKongs,
    declareSetup,
    requestMoreTime,
    debugSetup,
    startGame,
    nextRound,
    returnLobby,
    dissolveRoom,
    setScoringMode,
    setLobbyReady,
    setAutoPlay,
    leaveRoom,
    claimSeat,
    addBot,
    fillBots,
    updateBot,
    removeSeat,
  };
}
