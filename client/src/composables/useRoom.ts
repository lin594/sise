import { computed, onMounted, onUnmounted, ref } from "vue";
import { Client, Room } from "colyseus.js";
import type {
  ActionCandidate,
  ActionRequest,
  ActionType,
  AvailableAction,
  Card,
  PlayerState,
  RoomStateSnapshot,
  RoundResultPayload,
  SessionTokenPayload,
} from "@/types/game";
import { sortHandCards } from "@/utils/cardSort";

const DEFAULT_WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:2567`;
const WS_URL = (import.meta.env.VITE_SERVER_URL as string) || DEFAULT_WS_URL;
const DEFAULT_HTTP_URL = `${window.location.protocol}//${window.location.hostname}:2567`;
const HTTP_URL = (import.meta.env.VITE_SERVER_HTTP_URL as string) || DEFAULT_HTTP_URL;

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

function normalizePlayer(raw: any): PlayerState {
  return {
    clientId: String(raw?.clientId ?? ""),
    name: String(raw?.name ?? ""),
    declaredKongs: Number(raw?.declaredKongs ?? 0),
    declaredReady: Boolean(raw?.declaredReady),
    isBot: Boolean(raw?.isBot),
    connected: Boolean(raw?.connected),
    discardPile: asCardArray(raw?.discardPile),
    exposedArea: asCardArray(raw?.exposedArea),
    exposedGroupSizes: asNumberArray(raw?.exposedGroupSizes),
    generalArea: asCardArray(raw?.generalArea),
    wildcardPool: asCardArray(raw?.wildcardPool),
    fishArea: asCardArray(raw?.fishArea),
  };
}

function normalizeAction(action: ActionType): ActionType {
  if (action === "open") {
    return "kai";
  }
  if (action === "eat") {
    return "chi";
  }
  if (action === "grab") {
    return "pass";
  }
  return action;
}

function normalizeCandidate(raw: any): ActionCandidate | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const action = normalizeAction(String(raw.action ?? "") as ActionType);
  if (action !== "kai" && action !== "peng" && action !== "chi") {
    return null;
  }
  const id = String(raw.id ?? "").trim();
  if (!id) {
    return null;
  }
  const sourceRaw = String(raw.source ?? "");
  const source: ActionCandidate["source"] =
    sourceRaw === "hand+pool" || sourceRaw === "reusable_pair" ? sourceRaw : "hand";
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

function normalizeResponsePhase(input: string): string {
  if (input === "self_eat") {
    return "local_upper";
  }
  if (input === "self_grab") {
    return "local_draw";
  }
  return input;
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
  const privateHand = ref<Card[]>([]);
  const availableActions = ref<AvailableAction[]>([]);
  const huResult = ref<{ winnerId: string; groups: string[] } | null>(null);
  const roundResult = ref<RoundResultPayload | null>(null);
  const debugApplied = ref<{ scenario: string; ok: boolean; ts: number } | null>(null);
  const joinError = ref("");
  const declareError = ref("");
  const actionLogs = ref<Array<{ id: number; at: string; text: string }>>([]);

  let logSeq = 0;
  let lastFingerprint = "";

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
    actionLogs.value = [{ id: ++logSeq, at: new Date().toLocaleTimeString(), text: line }, ...actionLogs.value].slice(
      0,
      MAX_LOGS,
    );
  }

  async function connect() {
    const client = new Client(WS_URL);
    try {
      const query = new URLSearchParams(window.location.search);
      const forceNew = query.get("new") === "1";
      if (forceNew) {
        clearStored(TOKEN_KEY);
        clearStored(NAME_KEY);
        clearStored(ROOM_KEY);
      }

      const queryRoomId = query.get("roomId")?.trim() ?? "";
      const queryToken = query.get("playerToken")?.trim() ?? "";
      const queryName = query.get("playerName")?.trim() ?? "";
      const cachedRoomId = readStored(ROOM_KEY);
      const cachedToken = readStored(TOKEN_KEY);
      const cachedName = readStored(NAME_KEY);
      const desiredName = queryName || cachedName || playerName;
      const desiredToken = queryToken || cachedToken;
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
      if (joined.roomId) {
        writeStored(ROOM_KEY, joined.roomId);
        updateInviteUrl(joined.roomId);
      }

    joined.onStateChange((next) => {
      const normalizedPlayers: PlayerState[] = [];
      const playersMap = (next as any)?.players;
      if (playersMap && typeof playersMap.forEach === "function") {
        playersMap.forEach((value: unknown) => {
          normalizedPlayers.push(normalizePlayer(value));
        });
      } else if (playersMap && typeof playersMap === "object") {
        normalizedPlayers.push(
          ...Object.values(playersMap as Record<string, unknown>).map((value) => normalizePlayer(value)),
        );
      }

      state.value = {
        phase: String((next as any)?.phase ?? ""),
        hostPlayerId: String((next as any)?.hostPlayerId ?? ""),
        dealerId: String((next as any)?.dealerId ?? ""),
        currentPlayerId: String((next as any)?.currentPlayerId ?? ""),
        currentTurnPlayerId: String((next as any)?.currentTurnPlayerId ?? ""),
        previousPlayerId: String((next as any)?.previousPlayerId ?? ""),
        responsePhase: normalizeResponsePhase(String((next as any)?.responsePhase ?? "")),
        lastAction: String((next as any)?.lastAction ?? ""),
        deckCount: Number((next as any)?.deckCount ?? 0),
        isMoCard: Boolean((next as any)?.isMoCard),
        targetCard: asCard((next as any)?.targetCard),
        responseCard: asCard((next as any)?.responseCard),
        publicDiscardPile: asCardArray((next as any)?.publicDiscardPile),
        declareEndsAt: Number((next as any)?.declareEndsAt ?? 0),
        players: normalizedPlayers,
      };

      const lastAction = String(state.value?.lastAction ?? "").trim();
      const fingerprint = `${lastAction}|${String(state.value?.phase ?? "")}|${String(state.value?.currentPlayerId ?? "")}|${String(state.value?.responseCard?.id ?? "")}|${String(state.value?.deckCount ?? "")}`;
      if (lastAction && fingerprint !== lastFingerprint) {
        pushLog(lastAction);
        lastFingerprint = fingerprint;
      }

      if (state.value?.phase !== "ended") {
        huResult.value = null;
        roundResult.value = null;
      }
    });
    joined.onMessage("private_hand", (payload: Card[]) => {
      privateHand.value = sortHandCards(payload ?? []);
    });
    joined.onMessage("available_actions", (payload: AvailableAction[]) => {
      availableActions.value = (payload ?? []).map((item) => ({
        action: normalizeAction(item.action),
        enabled: Boolean(item.enabled),
        candidates: Array.isArray((item as any)?.candidates)
          ? ((item as any).candidates as unknown[])
              .map((raw) => normalizeCandidate(raw))
              .filter((candidate): candidate is ActionCandidate => Boolean(candidate))
          : undefined,
      }));
    });
    joined.onMessage("action_rejected", (payload: { reason?: string }) => {
      const reason = String(payload?.reason ?? "unknown");
      pushLog(`ACTION_REJECTED ${reason}`);
    });
    joined.onMessage("hu_result", (payload: { winnerId: string; groups: string[] }) => {
      huResult.value = payload;
      pushLog(`HU_RESULT ${payload.winnerId}`);
    });
    joined.onMessage("round_result", (payload: RoundResultPayload) => {
      roundResult.value = {
        ...payload,
        players: (payload.players ?? []).map((p) => ({
          ...p,
          hand: sortHandCards(p.hand ?? []),
          exposedArea: p.exposedArea ?? [],
          exposedGroupSizes: asNumberArray(p.exposedGroupSizes),
          generalArea: sortHandCards(p.generalArea ?? []),
          fishArea: sortHandCards(p.fishArea ?? []),
          discardCount: Number(p.discardCount ?? 0),
          scoreBreakdown: p.scoreBreakdown ?? [],
          totalScore: Number(p.totalScore ?? 0),
        })),
      };
      pushLog(`ROUND_RESULT ${payload.winnerId ?? "-"}`);
    });
    joined.onMessage("debug_applied", (payload: { scenario: string; ok: boolean; ts: number }) => {
      debugApplied.value = payload;
    });
      joined.onMessage("session_token", (payload: SessionTokenPayload) => {
        playerToken.value = payload.playerToken;
        mySeatId.value = payload.seatId;
        writeStored(TOKEN_KEY, payload.playerToken);
        writeStored(NAME_KEY, desiredName);
        if (payload.roomId) {
          writeStored(ROOM_KEY, payload.roomId);
          updateInviteUrl(payload.roomId);
        }
        pushLog(`SEAT ${payload.seatId}${payload.reclaimed ? " RECLAIM" : " JOIN"}`);
      });
    joined.onMessage("join_error", (payload: { message: string }) => {
      joinError.value = payload?.message ?? "鍔犲叆澶辫触";
      pushLog(`ERROR ${joinError.value}`);
    });
      joined.onMessage("declare_rejected", (payload: { reason?: string }) => {
        declareError.value = payload?.reason ?? "声明提交失败";
        pushLog(`DECLARE_REJECTED ${declareError.value}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "加入房间失败";
      joinError.value = message;
      pushLog(`ERROR ${message}`);
      connected.value = false;
    }
  }

  function sendAction(input: ActionRequest) {
    if (!room.value) {
      return;
    }
    if (typeof input === "string") {
      room.value.send("action", normalizeAction(input));
      return;
    }
    const action = normalizeAction(input.action);
    const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
    if (candidateId) {
      room.value.send("action", { action, candidateId });
      return;
    }
    room.value.send("action", action);
  }

  function sendDiscardCard(cardId: string) {
    if (!room.value || !cardId) {
      return;
    }
    room.value.send("discard_card", { cardId });
  }

  function declareKongs(count: number) {
    room.value?.send("declare_kongs", count);
  }

  function declareSetup(payload: { declaredKongs: number; fishCardIds: string[] }) {
    declareError.value = "";
    room.value?.send("declare_setup", payload);
  }

  function debugSetup(scenario: string) {
    room.value?.send("debug_setup", scenario);
  }

  function startGame() {
    room.value?.send("start_game");
  }

  function nextRound() {
    room.value?.send("next_round");
  }

  function returnLobby() {
    room.value?.send("return_lobby");
  }

  onMounted(() => {
    void connect();
  });

  onUnmounted(() => {
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


