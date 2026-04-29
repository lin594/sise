import { computed, onUnmounted, ref } from "vue";
import { Client, Room } from "colyseus.js";
import type {
  ActionCandidate,
  ActionRequest,
  ActionType,
  AvailableAction,
  Card,
  ParsedActionLog,
  PlayerState,
  RoomStateSnapshot,
  RoundResultPayload,
  SessionTokenPayload,
} from "@/types/game";
import { sortHandCards } from "@/utils/cardSort";
import { BACKEND_HTTP_URL, BACKEND_WS_URL } from "@/config/backend";

const WS_URL = BACKEND_WS_URL;
const HTTP_URL = BACKEND_HTTP_URL;

function generateLocalPlayerToken(): string {
  return `pt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
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
    name: String(raw?.name ?? ""),
    handCount: Number(raw?.handCount ?? 0),
    declaredKongs: Number(raw?.declaredKongs ?? 0),
    declaredReady: Boolean(raw?.declaredReady),
    isBot: Boolean(raw?.isBot),
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
    phase: String(rawState?.phase ?? ""),
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
    })),
    remainingDeck: asCardArray((payload as { remainingDeck?: unknown }).remainingDeck),
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

const SYSTEM_ACTION_KEYS = new Set(["NO_RESPONSE", "TURN_DRAW", "KONG_DRAW"]);

function parseActionDescriptor(action: string): { actorId: string; actionKey: string } {
  const parts = String(action ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { actorId: "", actionKey: "" };
  }
  if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
    return { actorId: parts[0], actionKey: parts[1] ?? "" };
  }
  return { actorId: "", actionKey: parts[0] };
}

function toDisplayAction(actionKey: string): string {
  const label: Record<string, string> = {
    DISCARD: "出牌",
    PENG: "碰",
    CHI: "吃",
    KAI: "开",
    HU: "胡",
    ZHUA: "抓",
    PASS: "过",
    TIMEOUT_PASS: "超时过",
    DRAW_GAME: "流局",
    DEALER: "定庄",
  };
  return label[actionKey] ?? actionKey;
}

export function useRoom(playerName = "Player") {
  const ROOM_KEY = "four_room_id";
  const TOKEN_KEY = "four_player_token";
  const NAME_KEY = "four_player_name";
  const MAX_LOGS = 120;

  const connected = ref(false);
  const room = ref<Room | null>(null);
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
  const debugApplied = ref<{ scenario: string; ok: boolean; ts: number } | null>(null);
  const joinError = ref("");
  const declareError = ref("");
  const actionLogs = ref<ParsedActionLog[]>([]);

  let logSeq = 0;
  let lastFingerprint = "";
  let lastPhase = "";
  let roomStateSyncTimer: number | null = null;
  let missingHandSyncTimer: number | null = null;
  let reconnectTimer: number | null = null;
  let privateStatePollTimer: number | null = null;
  let stateSyncFingerprint = "";
  let privateHandFingerprint = "";
  let availableActionsFingerprint = "";
  let connectInFlight = false;
  let activeConnectionSeq = 0;
  let lastManualSyncAt = 0;
  let reconnectAttempts = 0;
  let suppressReconnect = false;
  let missingPrivateReconnectAttempts = 0;

  function inferSeatId(snapshot: RoomStateSnapshot | null): string {
    if (!snapshot) {
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

  function clearPrivateStatePollTimer() {
    if (privateStatePollTimer !== null) {
      window.clearInterval(privateStatePollTimer);
      privateStatePollTimer = null;
    }
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

  function scheduleReconnect(reason: string) {
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
      return;
    }
    connected.value = false;
    joinError.value = "房间连接中断，正在尝试重连...";
    const delay = Math.min(1200, 200 + reconnectAttempts * 200);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempts += 1;
      void connect({
        nameOverride: name,
        roomId,
        playerToken: token,
      }).then((ok) => {
        if (ok) {
          reconnectAttempts = 0;
          joinError.value = "";
          return;
        }
        if (reconnectAttempts < 3) {
          scheduleReconnect(`${reason}:retry`);
        }
      });
    }, delay);
  }

  function maybeRequestMissingPrivateHand(reason: string) {
    const phase = state.value?.phase;
    if (!room.value || !mySeatId.value || (phase !== "declaring" && phase !== "playing")) {
      missingPrivateReconnectAttempts = 0;
      clearMissingHandSyncTimer();
      return;
    }
    if (privateHand.value.length > 0) {
      missingPrivateReconnectAttempts = 0;
      clearMissingHandSyncTimer();
      return;
    }
    if (!connected.value || !canSendRoomMessage(room.value)) {
      const roomId = activeRoomId.value.trim();
      const token = playerToken.value.trim();
      const name = localPlayerName.value.trim();
      if (!connectInFlight && roomId && token && name) {
        void connect({
          nameOverride: name,
          roomId,
          playerToken: token,
        });
      }
      clearMissingHandSyncTimer();
      return;
    }
    missingPrivateReconnectAttempts += 1;
    if (missingPrivateReconnectAttempts >= 1 && !connectInFlight) {
      const roomId = activeRoomId.value.trim();
      const token = playerToken.value.trim();
      const name = localPlayerName.value.trim();
      if (roomId && token && name) {
        joinError.value = "正在恢复手牌同步...";
        missingPrivateReconnectAttempts = 0;
        void connect({
          nameOverride: name,
          roomId,
          playerToken: token,
        });
        return;
      }
    }
    requestSyncState(reason);
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
    const roomId = activeRoomId.value.trim();
    const token = playerToken.value.trim();
    if (!roomId || !token) {
      return;
    }
    try {
      const url = new URL(`${HTTP_URL}/private-state`);
      url.searchParams.set("roomId", roomId);
      url.searchParams.set("playerToken", token);
      const response = await fetch(url.toString(), { method: "GET" });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        ok?: boolean;
        seatId?: string;
        privateHand?: unknown;
        availableActions?: unknown;
        roundResult?: RoundResultPayload | null;
      };
      if (!payload?.ok) {
        return;
      }
      if (payload.seatId && !mySeatId.value) {
        mySeatId.value = payload.seatId;
      }
      const nextHand = sortHandCards(asCardArray(payload.privateHand));
      const nextActions = normalizeAvailableActions(payload.availableActions);
      privateHand.value = nextHand;
      availableActions.value = nextActions;
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
      if (nextHand.length > 0) {
        missingPrivateReconnectAttempts = 0;
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
      if (!connected.value || !activeRoomId.value || !playerToken.value) {
        return;
      }
      if (phase !== "waiting" && phase !== "declaring" && phase !== "playing" && phase !== "ended") {
        return;
      }
      void fetchPrivateState("poll");
    }, 350);
  }

  function resetClientRoomState(options?: { keepLogs?: boolean; keepJoinError?: boolean }) {
    const keepLogs = Boolean(options?.keepLogs);
    const keepJoinError = Boolean(options?.keepJoinError);
    clearMissingHandSyncTimer();
    clearPrivateStatePollTimer();
    state.value = null;
    privateHand.value = [];
    availableActions.value = [];
    huResult.value = null;
    roundResult.value = null;
    debugApplied.value = null;
    declareError.value = "";
    myId.value = "";
    mySeatId.value = "";
    stateSyncFingerprint = "";
    privateHandFingerprint = "";
    availableActionsFingerprint = "";
    lastFingerprint = "";
    lastPhase = "";
    if (!keepLogs) {
      clearActionLogs();
    }
    if (!keepJoinError) {
      joinError.value = "";
    }
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
      snapshot.phase,
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

  function applySnapshot(next: unknown) {
    // Access Proxy properties directly without calling toJSON() to avoid circular reference
    const rawSnapshot = next as any;
    const normalized = normalizeSnapshot(next);
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
      if (privateHand.value.length > 0) {
        missingPrivateReconnectAttempts = 0;
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
      privateHand.value.length === 0
    ) {
      requestSyncState("missing_private_hand");
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
      pushLog(lastAction);
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

  function updateInviteUrl(roomId: string) {
    if (!roomId) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("roomId", roomId);
    url.searchParams.delete("playerToken");
    url.searchParams.delete("new");
    window.history.replaceState(null, "", url.toString());
  }

  async function fetchSingletonRoomId(): Promise<string> {
    const response = await fetch(`${HTTP_URL}/room-id`, { method: "GET" });
    if (!response.ok) {
      throw new Error("获取房间失败，请稍后重试");
    }
    const payload = (await response.json()) as { ok?: boolean; roomId?: string };
    if (!payload?.roomId) {
      throw new Error("服务端未返回可用房间");
    }
    return payload.roomId;
  }

  function pushLog(text: string) {
    const line = String(text ?? "").trim();
    if (!line) {
      return;
    }
    const { actorId, actionKey } = parseActionDescriptor(line);
    const isSystem = SYSTEM_ACTION_KEYS.has(actionKey);
    if (isSystem) {
      return;
    }
    actionLogs.value = [
      {
        id: ++logSeq,
        at: new Date().toLocaleTimeString(),
        text: line,
        actorId,
        actionKey,
        displayText: toDisplayAction(actionKey),
        isSystem,
      },
      ...actionLogs.value,
    ].slice(0, MAX_LOGS);
  }

  function clearActionLogs() {
    actionLogs.value = [];
    logSeq = 0;
    lastFingerprint = "";
  }

  async function connect(
    options?: string | { nameOverride?: string; roomId?: string; playerToken?: string; forceNew?: boolean },
  ): Promise<boolean> {
    if (connectInFlight) {
      return false;
    }
    connectInFlight = true;
    clearReconnectTimer();
    const connectionSeq = ++activeConnectionSeq;
    const isActiveConnection = () => activeConnectionSeq === connectionSeq;
    const client = new Client(WS_URL);
    try {
      clearRoomStateSyncTimer();
      const previousRoom = room.value;
      room.value = null;
      connected.value = false;
      activeRoomId.value = "";
      resetClientRoomState({ keepJoinError: true });
      if (previousRoom) {
        try {
          suppressReconnect = true;
          await previousRoom.leave();
        } catch {
          // ignore stale leave errors when switching rooms
        } finally {
          suppressReconnect = false;
        }
      }

      const query = new URLSearchParams(window.location.search);
      const resolvedOptions =
        typeof options === "string"
          ? { nameOverride: options }
          : {
              nameOverride: options?.nameOverride,
              roomId: options?.roomId,
              playerToken: options?.playerToken,
              forceNew: Boolean(options?.forceNew),
            };
      const forceNew = resolvedOptions.forceNew || query.get("new") === "1";
      if (forceNew) {
        clearStored(TOKEN_KEY);
        clearStored(NAME_KEY);
        clearStored(ROOM_KEY);
      }

      const queryRoomId = resolvedOptions.roomId?.trim() || query.get("roomId")?.trim() || "";
      const queryToken = resolvedOptions.playerToken?.trim() || query.get("playerToken")?.trim() || "";
      const queryName = query.get("playerName")?.trim() ?? "";
      const cachedRoomId = readStored(ROOM_KEY);
      const cachedToken = readStored(TOKEN_KEY);
      const cachedName = readStored(NAME_KEY);
      const desiredName = String(resolvedOptions.nameOverride ?? "").trim() || queryName || cachedName || playerName;
      localPlayerName.value = desiredName;
      const desiredToken = queryToken || cachedToken || generateLocalPlayerToken();
      playerToken.value = desiredToken;
      writeStored(TOKEN_KEY, desiredToken);
      writeStored(NAME_KEY, desiredName);
      const initialRoomId = queryRoomId || cachedRoomId || (await fetchSingletonRoomId());

      let joined: Room;
      try {
        joined = await client.joinById(initialRoomId, {
          name: desiredName,
          playerToken: desiredToken,
        });
      } catch {
        if (queryRoomId) {
          throw new Error("房间不存在或已关闭，请让房主重新分享邀请链接。");
        }
        clearStored(ROOM_KEY);
        const fallbackRoomId = await fetchSingletonRoomId();
        joined = await client.joinById(fallbackRoomId, {
          name: desiredName,
          playerToken: desiredToken,
        });
      }
      room.value = joined;
      myId.value = joined.sessionId;
      connected.value = true;
      reconnectAttempts = 0;
      activeRoomId.value = joined.roomId || initialRoomId;
      if (joined.roomId) {
        writeStored(ROOM_KEY, joined.roomId);
        updateInviteUrl(joined.roomId);
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
        privateHand.value = sortHandCards(asCardArray(payload));
        privateHandFingerprint = buildCardIdFingerprint(privateHand.value);
        if (privateHand.value.length > 0) {
          missingPrivateReconnectAttempts = 0;
          clearMissingHandSyncTimer();
        }
      });
      joined.onMessage("available_actions", (payload: AvailableAction[] | { items?: AvailableAction[] }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        availableActions.value = normalizeAvailableActions(payload);
        availableActionsFingerprint = buildAvailableActionsFingerprint(availableActions.value);
      });
      joined.onMessage("action_rejected", (payload: { reason?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        const reason = String(payload?.reason ?? "unknown");
        pushLog(`ACTION_REJECTED ${reason}`);
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
        roundResult.value = normalizeRoundResultPayload(payload);
        pushLog(`ROUND_RESULT ${payload.winnerId ?? "-"}`);
      });
      joined.onMessage("debug_applied", (payload: { scenario: string; ok: boolean; ts: number }) => {
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
        writeStored(TOKEN_KEY, payload.playerToken);
        writeStored(NAME_KEY, desiredName);
        if (payload.roomId) {
          if (payload.roomId !== activeRoomId.value) {
            activeRoomId.value = payload.roomId;
            stateSyncFingerprint = "";
            lastFingerprint = "";
          }
          writeStored(ROOM_KEY, payload.roomId);
          updateInviteUrl(payload.roomId);
        }
        pushLog(`SEAT ${payload.seatId}${payload.reclaimed ? " RECLAIM" : " JOIN"}`);
      });
      joined.onMessage("join_error", (payload: { message: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        joinError.value = payload?.message ?? "加入失败";
        pushLog(`ERROR ${joinError.value}`);
      });
      joined.onMessage("declare_rejected", (payload: { reason?: string }) => {
        if (!isCurrentJoinedRoom()) {
          return;
        }
        declareError.value = payload?.reason ?? "声明提交失败";
        pushLog(`DECLARE_REJECTED ${declareError.value}`);
      });
      joined.onLeave(() => {
        if (!isActiveConnection() || room.value !== joined) {
          return;
        }
        clearRoomStateSyncTimer();
        clearMissingHandSyncTimer();
        connected.value = false;
        scheduleReconnect("room_leave");
      });
      joined.onError((_code, message) => {
        if (!isActiveConnection() || room.value !== joined) {
          return;
        }
        clearRoomStateSyncTimer();
        clearMissingHandSyncTimer();
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
      const message = error instanceof Error ? error.message : "加入房间失败";
      joinError.value = message;
      pushLog(`ERROR ${message}`);
      connected.value = false;
      room.value = null;
      activeRoomId.value = "";
      resetClientRoomState({ keepJoinError: true, keepLogs: true });
    } finally {
      if (isActiveConnection()) {
        connectInFlight = false;
      } else if (activeConnectionSeq === connectionSeq) {
        connectInFlight = false;
      } else {
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
      safeRoomSend("action", action);
      return;
    }
    const action = normalizeAction(input.action);
    if (!action) {
      return;
    }
    const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
    if (candidateId) {
      safeRoomSend("action", { action, candidateId });
      return;
    }
    safeRoomSend("action", action);
  }

  function sendDiscardCard(cardId: string) {
    if (!room.value || !cardId) {
      return;
    }
    safeRoomSend("discard_card", { cardId });
  }

  function declareKongs(count: number) {
    safeRoomSend("declare_kongs", count);
  }

  function declareSetup(payload: { declaredKongs: number; fishCardIds: string[] }) {
    declareError.value = "";
    safeRoomSend("declare_setup", payload);
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

  onUnmounted(() => {
    clearRoomStateSyncTimer();
    clearMissingHandSyncTimer();
    clearReconnectTimer();
    clearPrivateStatePollTimer();
    suppressReconnect = true;
    room.value?.leave();
  });

  const players = computed<PlayerState[]>(() => {
    return state.value?.players ?? [];
  });

  return {
    connected,
    myId,
    mySeatId,
    playerToken,
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
    connect,
    clearActionLogs,
    sendAction,
    sendDiscardCard,
    declareKongs,
    declareSetup,
    debugSetup,
    startGame,
    nextRound,
    returnLobby,
  };
}
