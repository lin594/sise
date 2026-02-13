import { computed, onMounted, onUnmounted, ref } from "vue";
import { Client } from "colyseus.js";
import { sortHandCards } from "@/utils/cardSort";
const WS_URL = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
function asCardArray(input) {
    const isCard = (x) => x &&
        typeof x === "object" &&
        typeof x.id === "string" &&
        typeof x.color === "string" &&
        typeof x.type === "string" &&
        x.id.length > 0 &&
        x.type.length > 0;
    const collectIterable = (iter) => Array.from(iter).filter(isCard);
    if (Array.isArray(input)) {
        return input.filter(isCard);
    }
    if (input && typeof input.toArray === "function") {
        const out = input.toArray().filter(isCard);
        if (out.length > 0) {
            return out;
        }
    }
    if (input && typeof input.length === "number") {
        const raw = input;
        const out = [];
        for (let i = 0; i < raw.length; i += 1) {
            if (isCard(raw[i])) {
                out.push(raw[i]);
            }
        }
        if (out.length > 0 || raw.length === 0) {
            return out;
        }
    }
    if (input && typeof input.forEach === "function") {
        const out = [];
        input.forEach((value) => {
            if (isCard(value)) {
                out.push(value);
            }
        });
        if (out.length > 0) {
            return out;
        }
    }
    if (input && typeof input[Symbol.iterator] === "function") {
        const out = collectIterable(input);
        if (out.length > 0) {
            return out;
        }
    }
    if (input && typeof input === "object" && input.$items) {
        const items = Object.values(input.$items).filter(isCard);
        if (items.length > 0) {
            return items;
        }
    }
    if (input && typeof input === "object") {
        return Object.values(input).filter(isCard);
    }
    return [];
}
function asCard(input) {
    if (!input || typeof input !== "object") {
        return null;
    }
    const raw = input;
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
function normalizePlayer(raw) {
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
    const room = ref(null);
    const state = ref(null);
    const myId = ref("");
    const mySeatId = ref("");
    const playerToken = ref("");
    const privateHand = ref([]);
    const availableActions = ref([]);
    const huResult = ref(null);
    const roundResult = ref(null);
    const debugApplied = ref(null);
    const joinError = ref("");
    const actionLogs = ref([]);
    let logSeq = 0;
    let lastFingerprint = "";
    function pushLog(text) {
        const line = String(text ?? "").trim();
        if (!line) {
            return;
        }
        actionLogs.value = [{ id: ++logSeq, at: new Date().toLocaleTimeString(), text: line }, ...actionLogs.value].slice(0, MAX_LOGS);
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
            const normalizedPlayers = [];
            const playersMap = next?.players;
            if (playersMap && typeof playersMap.forEach === "function") {
                playersMap.forEach((value) => {
                    normalizedPlayers.push(normalizePlayer(value));
                });
            }
            else if (playersMap && typeof playersMap === "object") {
                normalizedPlayers.push(...Object.values(playersMap).map((value) => normalizePlayer(value)));
            }
            state.value = {
                phase: String(next?.phase ?? ""),
                hostPlayerId: String(next?.hostPlayerId ?? ""),
                currentPlayerId: String(next?.currentPlayerId ?? ""),
                responsePhase: String(next?.responsePhase ?? ""),
                lastAction: String(next?.lastAction ?? ""),
                deckCount: Number(next?.deckCount ?? 0),
                responseCard: asCard(next?.responseCard),
                publicDiscardPile: asCardArray(next?.publicDiscardPile),
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
        joined.onMessage("private_hand", (payload) => {
            privateHand.value = sortHandCards(payload ?? []);
        });
        joined.onMessage("available_actions", (payload) => {
            availableActions.value = payload;
        });
        joined.onMessage("hu_result", (payload) => {
            huResult.value = payload;
            pushLog(`HU_RESULT ${payload.winnerId}`);
        });
        joined.onMessage("round_result", (payload) => {
            roundResult.value = {
                ...payload,
                players: (payload.players ?? []).map((p) => ({
                    ...p,
                    hand: sortHandCards(p.hand ?? []),
                    exposedArea: sortHandCards(p.exposedArea ?? []),
                    fishArea: sortHandCards(p.fishArea ?? []),
                    discardCount: Number(p.discardCount ?? 0),
                    scoreBreakdown: p.scoreBreakdown ?? [],
                    totalScore: Number(p.totalScore ?? 0),
                })),
            };
            pushLog(`ROUND_RESULT ${payload.winnerId ?? "-"}`);
        });
        joined.onMessage("debug_applied", (payload) => {
            debugApplied.value = payload;
        });
        joined.onMessage("session_token", (payload) => {
            playerToken.value = payload.playerToken;
            mySeatId.value = payload.seatId;
            window.sessionStorage.setItem(TOKEN_KEY, payload.playerToken);
            window.sessionStorage.setItem(NAME_KEY, queryName || cachedName || playerName);
            pushLog(`SEAT ${payload.seatId}${payload.reclaimed ? " RECLAIM" : " JOIN"}`);
        });
        joined.onMessage("join_error", (payload) => {
            joinError.value = payload?.message ?? "加入失败";
            pushLog(`ERROR ${joinError.value}`);
        });
    }
    function sendAction(action) {
        if (!room.value) {
            return;
        }
        room.value.send("action", action);
    }
    function sendDiscardCard(cardId) {
        if (!room.value || !cardId) {
            return;
        }
        room.value.send("discard_card", { cardId });
    }
    function declareKongs(count) {
        room.value?.send("declare_kongs", count);
    }
    function debugSetup(scenario) {
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
    const players = computed(() => {
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
        nextRound,
        returnLobby,
    };
}
