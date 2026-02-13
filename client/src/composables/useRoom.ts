import { computed, onMounted, onUnmounted, ref } from "vue";
import { Client, Room } from "colyseus.js";
import type {
  ActionType,
  AvailableAction,
  Card,
  PlayerState,
  RoundResultPayload,
  SessionTokenPayload,
} from "@/types/game";

const WS_URL = (import.meta.env.VITE_SERVER_URL as string) || "ws://localhost:2567";

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

function normalizePlayer(raw: any): PlayerState {
  return {
    clientId: String(raw?.clientId ?? ""),
    name: String(raw?.name ?? ""),
    declaredKongs: Number(raw?.declaredKongs ?? 0),
    isBot: Boolean(raw?.isBot),
    connected: Boolean(raw?.connected),
    discardPile: asCardArray(raw?.discardPile),
    exposedArea: asCardArray(raw?.exposedArea),
    fishArea: asCardArray(raw?.fishArea),
  };
}

export function useRoom(playerName = "Player") {
  const TOKEN_KEY = "four_player_token";
  const NAME_KEY = "four_player_name";
  const MAX_LOGS = 120;

  const connected = ref(false);
  const room = ref<Room | null>(null);
  const state = ref<any>(null);
  const myId = ref("");
  const mySeatId = ref("");
  const playerToken = ref("");
  const privateHand = ref<Card[]>([]);
  const availableActions = ref<AvailableAction[]>([]);
  const huResult = ref<{ winnerId: string; groups: string[] } | null>(null);
  const roundResult = ref<RoundResultPayload | null>(null);
  const debugApplied = ref<{ scenario: string; ok: boolean; ts: number } | null>(null);
  const joinError = ref("");
  const actionLogs = ref<Array<{ id: number; at: string; text: string }>>([]);

  let logSeq = 0;
  let lastFingerprint = "";

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
    const query = new URLSearchParams(window.location.search);
    const forceNew = query.get("new") === "1";
    if (forceNew) {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(NAME_KEY);
    }

    const queryToken = query.get("playerToken")?.trim() ?? "";
    const queryName = query.get("playerName")?.trim() ?? "";
    const cachedToken = window.sessionStorage.getItem(TOKEN_KEY) ?? "";
    const cachedName = window.sessionStorage.getItem(NAME_KEY) ?? "";

    const joined = await client.joinOrCreate("four-color", {
      name: queryName || cachedName || playerName,
      playerToken: queryToken || cachedToken,
    });
    room.value = joined;
    myId.value = joined.sessionId;
    connected.value = true;

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
        currentPlayerId: String((next as any)?.currentPlayerId ?? ""),
        responsePhase: String((next as any)?.responsePhase ?? ""),
        lastAction: String((next as any)?.lastAction ?? ""),
        deckCount: Number((next as any)?.deckCount ?? 0),
        responseCard: asCard((next as any)?.responseCard),
        publicDiscardPile: asCardArray((next as any)?.publicDiscardPile),
        players: normalizedPlayers,
      };

      const lastAction = String(state.value?.lastAction ?? "").trim();
      const fingerprint = `${lastAction}|${String(state.value?.phase ?? "")}|${String(state.value?.currentPlayerId ?? "")}|${String(state.value?.responseCard?.id ?? "")}|${String(state.value?.deckCount ?? "")}`;
      if (lastAction && fingerprint !== lastFingerprint) {
        pushLog(lastAction);
        lastFingerprint = fingerprint;
      }
    });
    joined.onMessage("private_hand", (payload: Card[]) => {
      privateHand.value = payload;
    });
    joined.onMessage("available_actions", (payload: AvailableAction[]) => {
      availableActions.value = payload;
    });
    joined.onMessage("hu_result", (payload: { winnerId: string; groups: string[] }) => {
      huResult.value = payload;
      pushLog(`HU_RESULT ${payload.winnerId}`);
    });
    joined.onMessage("round_result", (payload: RoundResultPayload) => {
      roundResult.value = payload;
      pushLog(`ROUND_RESULT ${payload.winnerId ?? "-"}`);
    });
    joined.onMessage("debug_applied", (payload: { scenario: string; ok: boolean; ts: number }) => {
      debugApplied.value = payload;
    });
    joined.onMessage("session_token", (payload: SessionTokenPayload) => {
      playerToken.value = payload.playerToken;
      mySeatId.value = payload.seatId;
      window.sessionStorage.setItem(TOKEN_KEY, payload.playerToken);
      window.sessionStorage.setItem(NAME_KEY, queryName || cachedName || playerName);
      pushLog(`SEAT ${payload.seatId}${payload.reclaimed ? " RECLAIM" : " JOIN"}`);
    });
    joined.onMessage("join_error", (payload: { message: string }) => {
      joinError.value = payload?.message ?? "加入失败";
      pushLog(`ERROR ${joinError.value}`);
    });
  }

  function sendAction(action: ActionType) {
    if (!room.value) {
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

  function debugSetup(scenario: string) {
    room.value?.send("debug_setup", scenario);
  }

  function startGame() {
    room.value?.send("start_game");
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
    actionLogs,
    sendAction,
    sendDiscardCard,
    declareKongs,
    debugSetup,
    startGame,
  };
}
