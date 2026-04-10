import { computed, onMounted, onUnmounted, ref } from "vue";
import { Client } from "colyseus.js";
import { sortHandCards } from "@/utils/cardSort";
const DEFAULT_WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:2567`;
const WS_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_WS_URL;
const DEFAULT_HTTP_URL = `${window.location.protocol}//${window.location.hostname}:2567`;
const HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL || DEFAULT_HTTP_URL;
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
function asNumberArray(input) {
    if (Array.isArray(input)) {
        return input.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
    }
    if (input && typeof input.toArray === "function") {
        return input.toArray()
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x) && x > 0);
    }
    if (input && typeof input.forEach === "function") {
        const out = [];
        input.forEach((value) => {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) {
                out.push(n);
            }
        });
        return out;
    }
    if (input && typeof input === "object") {
        return Object.values(input)
            .map((x) => Number(x))
            .filter((x) => Number.isFinite(x) && x > 0);
    }
    return [];
}
function asStringArray(input) {
    if (Array.isArray(input)) {
        return input.map((x) => String(x ?? "")).filter(Boolean);
    }
    if (input && typeof input.toArray === "function") {
        return input.toArray().map((x) => String(x ?? "")).filter(Boolean);
    }
    if (input && typeof input.forEach === "function") {
        const out = [];
        input.forEach((value) => {
            const next = String(value ?? "");
            if (next) {
                out.push(next);
            }
        });
        return out;
    }
    if (input && typeof input === "object") {
        return Object.values(input).map((x) => String(x ?? "")).filter(Boolean);
    }
    return [];
}
function normalizePlayer(raw) {
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
function normalizeSnapshot(next) {
    const rawState = next && typeof next.toJSON === "function"
        ? next.toJSON()
        : next;
    const rawPlayers = rawState?.players;
    const normalizedPlayers = [];
    if (Array.isArray(rawPlayers)) {
        normalizedPlayers.push(...rawPlayers.map((value) => normalizePlayer(value)));
    }
    else if (rawPlayers && typeof rawPlayers.forEach === "function") {
        rawPlayers.forEach((value) => {
            normalizedPlayers.push(normalizePlayer(value));
        });
    }
    else if (rawPlayers && typeof rawPlayers === "object") {
        normalizedPlayers.push(...Object.values(rawPlayers).map((value) => normalizePlayer(value)));
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
function normalizeAction(action) {
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
function normalizeCandidate(raw) {
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
    const source = sourceRaw === "hand+pool" ? sourceRaw : "hand";
    const cardIds = Array.isArray(raw.cardIds) ? raw.cardIds.map((x) => String(x)).filter(Boolean) : [];
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
function normalizeResponsePhase(input) {
    if (input === "self_eat") {
        return "local_upper";
    }
    if (input === "self_grab") {
        return "local_draw";
    }
    return input;
}
const SYSTEM_ACTION_KEYS = new Set(["NO_RESPONSE", "TURN_DRAW", "KONG_DRAW"]);
function parseActionDescriptor(action) {
    const parts = String(action ?? "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return { actorId: "", actionKey: "" };
    }
    if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
        return { actorId: parts[0], actionKey: parts[1] ?? "" };
    }
    return { actorId: "", actionKey: parts[0] };
}
function toDisplayAction(actionKey) {
    const label = {
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
    const declareError = ref("");
    const actionLogs = ref([]);
    let logSeq = 0;
    let lastFingerprint = "";
    let lastPhase = "";
    let roomStateSyncTimer = null;
    let stateSyncFingerprint = "";
    function clearRoomStateSyncTimer() {
        if (roomStateSyncTimer !== null) {
            window.clearInterval(roomStateSyncTimer);
            roomStateSyncTimer = null;
        }
    }
    function buildStateSyncFingerprint(snapshot) {
        if (!snapshot) {
            return "";
        }
        const playerMarks = snapshot.players
            .map((player) => [
            player.clientId,
            player.handCount ?? 0,
            player.connected ? 1 : 0,
            player.declaredReady ? 1 : 0,
            player.discardPile.map((card) => card.id).join(","),
            player.exposedArea.map((card) => card.id).join(","),
            player.exposedGroupKinds.join(","),
            player.generalArea.map((card) => card.id).join(","),
            player.fishArea.map((card) => card.id).join(","),
        ].join(":"))
            .join("|");
        return [
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
    function applySnapshot(next) {
        const normalized = normalizeSnapshot(next);
        const nextFingerprint = buildStateSyncFingerprint(normalized);
        if (nextFingerprint === stateSyncFingerprint) {
            return;
        }
        stateSyncFingerprint = nextFingerprint;
        state.value = normalized;
        const currentPhase = String(state.value?.phase ?? "");
        if ((lastPhase === "ended" || lastPhase === "waiting") &&
            (currentPhase === "declaring" || currentPhase === "playing")) {
            clearActionLogs();
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
        if (lastPhase === "ended" && state.value?.phase !== "ended") {
            huResult.value = null;
            roundResult.value = null;
        }
    }
    function startRoomStateSync() {
        clearRoomStateSyncTimer();
        roomStateSyncTimer = window.setInterval(() => {
            if (!room.value?.state) {
                return;
            }
            applySnapshot(room.value.state);
        }, 250);
    }
    function readStored(key) {
        return (window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? "").trim();
    }
    function writeStored(key, value) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.setItem(key, value);
    }
    function clearStored(key) {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
    }
    function updateInviteUrl(roomId) {
        if (!roomId) {
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("roomId", roomId);
        url.searchParams.delete("playerToken");
        url.searchParams.delete("new");
        window.history.replaceState(null, "", url.toString());
    }
    async function fetchSingletonRoomId() {
        const response = await fetch(`${HTTP_URL}/room-id`, { method: "GET" });
        if (!response.ok) {
            throw new Error("获取房间失败，请稍后重试");
        }
        const payload = (await response.json());
        if (!payload?.roomId) {
            throw new Error("服务端未返回可用房间");
        }
        return payload.roomId;
    }
    function pushLog(text) {
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
            let joined;
            try {
                joined = await client.joinById(initialRoomId, {
                    name: desiredName,
                    playerToken: desiredToken,
                });
            }
            catch {
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
                applySnapshot(next);
            });
            startRoomStateSync();
            joined.onMessage("room_snapshot", (payload) => {
                applySnapshot(payload);
            });
            joined.onMessage("private_hand", (payload) => {
                privateHand.value = sortHandCards(payload ?? []);
            });
            joined.onMessage("available_actions", (payload) => {
                availableActions.value = (payload ?? []).map((item) => ({
                    action: normalizeAction(item.action) ?? "pass",
                    enabled: Boolean(item.enabled),
                    candidates: Array.isArray(item?.candidates)
                        ? item.candidates
                            .map((raw) => normalizeCandidate(raw))
                            .filter((candidate) => Boolean(candidate))
                        : undefined,
                }));
            });
            joined.onMessage("action_rejected", (payload) => {
                const reason = String(payload?.reason ?? "unknown");
                pushLog(`ACTION_REJECTED ${reason}`);
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
                        exposedGroupKinds: asStringArray(p.exposedGroupKinds),
                        generalArea: sortHandCards(p.generalArea ?? []),
                        fishArea: sortHandCards(p.fishArea ?? []),
                        discardCount: Number(p.discardCount ?? 0),
                        scoreBreakdown: p.scoreBreakdown ?? [],
                        totalScore: Number(p.totalScore ?? 0),
                    })),
                    remainingDeck: asCardArray(payload.remainingDeck),
                };
                pushLog(`ROUND_RESULT ${payload.winnerId ?? "-"}`);
            });
            joined.onMessage("debug_applied", (payload) => {
                debugApplied.value = payload;
            });
            joined.onMessage("session_token", (payload) => {
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
            joined.onMessage("join_error", (payload) => {
                joinError.value = payload?.message ?? "鍔犲叆澶辫触";
                pushLog(`ERROR ${joinError.value}`);
            });
            joined.onMessage("declare_rejected", (payload) => {
                declareError.value = payload?.reason ?? "声明提交失败";
                pushLog(`DECLARE_REJECTED ${declareError.value}`);
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "加入房间失败";
            joinError.value = message;
            pushLog(`ERROR ${message}`);
            connected.value = false;
        }
    }
    function sendAction(input) {
        if (!room.value) {
            return;
        }
        if (typeof input === "string") {
            const action = normalizeAction(input);
            if (!action) {
                return;
            }
            room.value.send("action", action);
            return;
        }
        const action = normalizeAction(input.action);
        if (!action) {
            return;
        }
        const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
        if (candidateId) {
            room.value.send("action", { action, candidateId });
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
    function declareSetup(payload) {
        declareError.value = "";
        room.value?.send("declare_setup", payload);
    }
    function debugSetup(scenario) {
        room.value?.send("debug_setup", scenario);
    }
    function startGame() {
        clearActionLogs();
        joinError.value = "";
        room.value?.send("start_game");
    }
    function nextRound() {
        clearActionLogs();
        room.value?.send("next_round");
    }
    function returnLobby() {
        clearActionLogs();
        room.value?.send("return_lobby");
    }
    onMounted(() => {
        void connect();
    });
    onUnmounted(() => {
        clearRoomStateSyncTimer();
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
        declareError,
        actionLogs,
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
