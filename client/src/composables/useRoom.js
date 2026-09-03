import { computed, onUnmounted, ref, shallowRef } from "vue";
import { Client, ErrorCode, MatchMakeError } from "@colyseus/sdk";
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
const TERMINAL_ROOM_CLOSE_MESSAGES = {
    4100: "原座位已经失效，或牌局已不再接受加入。系统已停止自动恢复。",
    4101: "房间已经坐满，无法恢复原座位。系统已停止自动恢复。",
    4102: "这个座位已在其他窗口恢复。本页面已停止重连，避免重复抢占座位。",
    4103: "原座位已经不存在，无法继续恢复。系统已停止自动恢复。",
    4104: "你已被移出房间。系统已停止自动恢复。",
    4105: "牌局已经开始，未入座的访问已结束。系统已停止自动恢复。",
    4106: "这是单人练习房，已有玩家在练习。请返回首页重新开始。",
    4110: "房主已解散本桌，大家已返回模式选择。",
};
function terminalJoinFailureMessage(error) {
    const code = error instanceof MatchMakeError
        ? error.code
        : Number(error?.code);
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
function generateLocalPlayerToken() {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    const encoded = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `pt_${encoded}`;
}
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
    if (input && typeof input === "object" && Array.isArray(input.cards)) {
        return (input.cards ?? []).filter(isCard);
    }
    if (input && typeof input === "object" && Array.isArray(input.items)) {
        return (input.items ?? []).filter(isCard);
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
        seatIndex: Number(raw?.seatIndex ?? -1),
        name: String(raw?.name ?? ""),
        handCount: Number(raw?.handCount ?? 0),
        declaredKongs: Number(raw?.declaredKongs ?? 0),
        declaredReady: Boolean(raw?.declaredReady),
        isBot: Boolean(raw?.isBot),
        isAutoPlay: Boolean(raw?.isAutoPlay),
        isConfiguredBot: Boolean(raw?.isConfiguredBot),
        botStrength: Math.max(0, Math.min(100, Number(raw?.botStrength ?? 50))),
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
    // Access Proxy properties directly without calling toJSON() to avoid circular reference
    const rawState = next;
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
        roomMode: rawState?.roomMode === "friends" ? "friends" : "practice",
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
function normalizeAvailableActions(input) {
    const rawInput = input && typeof input === "object" && Array.isArray(input.items)
        ? input.items
        : input;
    if (!Array.isArray(rawInput)) {
        return [];
    }
    return rawInput.map((item) => {
        const rawItem = item;
        return {
            action: normalizeAction(String(rawItem?.action ?? "")) ?? "pass",
            enabled: Boolean(rawItem?.enabled),
            deferred: Boolean(rawItem?.deferred),
            candidates: Array.isArray(rawItem?.candidates)
                ? rawItem.candidates
                    .map((raw) => normalizeCandidate(raw))
                    .filter((candidate) => Boolean(candidate))
                : undefined,
        };
    });
}
function normalizeRoundResultPayload(payload) {
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
            exposedGroupKinds: asStringArray(p.exposedGroupKinds),
            generalArea: sortHandCards(p.generalArea ?? []),
            fishArea: sortHandCards(p.fishArea ?? []),
            discardCount: Number(p.discardCount ?? 0),
            scoreBreakdown: p.scoreBreakdown ?? [],
            totalScore: Number(p.totalScore ?? 0),
        })),
        remainingDeck: asCardArray(payload.remainingDeck),
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
function actionCardLabel(action, snapshot) {
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
    const connectionState = ref(navigator.onLine ? "idle" : "offline");
    const reconnectAttempt = ref(0);
    // SDK room instances carry identity-sensitive listeners and transport state.
    // A normal Vue ref proxies class instances, breaking `room.value === joined`
    // guards and silently discarding current-connection messages.
    const room = shallowRef(null);
    const state = ref(null);
    const myId = ref("");
    const mySeatId = ref("");
    const playerToken = ref("");
    const activeRoomId = ref("");
    const localPlayerName = ref(playerName);
    const privateHand = ref([]);
    const availableActions = ref([]);
    const huResult = ref(null);
    const roundResult = ref(null);
    const debugApplied = ref(null);
    const joinError = ref("");
    const declareError = ref("");
    const actionLogs = ref([]);
    const decisionTimer = ref({
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
    let roomStateSyncTimer = null;
    let missingHandSyncTimer = null;
    let reconnectTimer = null;
    let restoredNoticeTimer = null;
    let privateStatePollTimer = null;
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
    function inferSeatId(snapshot) {
        if (!snapshot) {
            return "";
        }
        // Friend rooms can contain equal display names and unseated guests. Their
        // identity must come from the room-scoped token, never from a name match.
        if (snapshot.roomMode === "friends") {
            return "";
        }
        const connectedHumans = snapshot.players.filter((player) => !player.isBot && player.connected);
        const exactNameMatches = connectedHumans.filter((player) => localPlayerName.value && player.name === localPlayerName.value);
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
    function stopTerminalRecovery(message) {
        suppressReconnect = true;
        clearRoomStateSyncTimer();
        clearMissingHandSyncTimer();
        clearReconnectTimer();
        clearRestoredNoticeTimer();
        clearPrivateStatePollTimer();
        connected.value = false;
        room.value = null;
        reconnectAttempt.value = 0;
        reconnectAttempts = 0;
        connectionState.value = "closed";
        joinError.value = message;
    }
    function getRoomSocketReadyState(targetRoom) {
        const connection = targetRoom
            ?.connection;
        if (typeof connection?.transport?.ws?.readyState === "number") {
            return Number(connection.transport.ws.readyState);
        }
        if (typeof connection?.isOpen === "boolean") {
            return connection.isOpen ? 1 : 0;
        }
        return null;
    }
    function canSendRoomMessage(targetRoom) {
        if (!targetRoom) {
            return false;
        }
        const readyState = getRoomSocketReadyState(targetRoom);
        if (readyState === null) {
            return Boolean(connected.value);
        }
        return readyState === 1;
    }
    function safeRoomSend(type, payload) {
        if (!room.value || !canSendRoomMessage(room.value)) {
            if (room.value && getRoomSocketReadyState(room.value) === 3) {
                scheduleReconnect(`send:${type}`);
            }
            return false;
        }
        try {
            if (payload === undefined) {
                room.value.send(type);
            }
            else {
                room.value.send(type, payload);
            }
            return true;
        }
        catch (error) {
            void error;
            scheduleReconnect(`send_failed:${type}`);
            return false;
        }
    }
    function scheduleReconnect(reason, immediate = false) {
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
    function privateHandCountMatches(snapshot = state.value) {
        if (!snapshot || !mySeatId.value) {
            return true;
        }
        return isPrivateHandSynchronized(snapshot, mySeatId.value, privateHand.value.length);
    }
    function maybeRequestMissingPrivateHand(reason) {
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
    function requestSyncState(reason) {
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
    async function fetchPrivateState(reason) {
        if (Date.now() < privateStateRetryAfterAt) {
            return;
        }
        const roomId = activeRoomId.value.trim();
        const token = playerToken.value.trim();
        if (!roomId || !token) {
            return;
        }
        const requestConnectionSeq = activeConnectionSeq;
        const requestAuthoritySeq = privateStateAuthoritySeq;
        const requestSeq = ++privateStateRequestSeq;
        const isCurrentRequest = () => requestConnectionSeq === activeConnectionSeq &&
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
            const payload = (await response.json());
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
        }
        catch {
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
        }, PRIVATE_STATE_POLL_MS);
    }
    function resetClientRoomState(options) {
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
    function returnToModeLobbyFromRoom(reason) {
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
        window.history.replaceState(null, "", url.toString());
    }
    function buildStateSyncFingerprint(snapshot) {
        if (!snapshot) {
            return "";
        }
        const playerMarks = snapshot.players
            .map((player) => [
            player.clientId,
            player.handCount ?? 0,
            player.declaredKongs ?? 0,
            player.connected ? 1 : 0,
            player.declaredReady ? 1 : 0,
            player.isAutoPlay ? 1 : 0,
            player.discardPile.map((card) => card.id).join(","),
            player.exposedArea.map((card) => card.id).join(","),
            player.exposedGroupKinds.join(","),
            player.generalArea.map((card) => card.id).join(","),
            player.fishArea.map((card) => card.id).join(","),
        ].join(":"))
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
    function buildCardIdFingerprint(cards) {
        return cards.map((card) => card.id).join("|");
    }
    function buildAvailableActionsFingerprint(actions) {
        return actions
            .map((action) => [
            action.action,
            action.enabled ? "1" : "0",
            action.deferred ? "1" : "0",
            (action.candidates ?? [])
                .map((candidate) => `${candidate.id}:${candidate.cardIds.join(",")}:${candidate.source}:${candidate.kind ?? ""}`)
                .join("|"),
        ].join(":"))
            .join(";");
    }
    function applyDecisionTimer(input) {
        if (!input || typeof input !== "object") {
            return;
        }
        const raw = input;
        decisionTimer.value = {
            untimed: Boolean(raw.untimed),
            canRequestMoreTime: Boolean(raw.canRequestMoreTime),
            extensionSeconds: Math.max(1, Math.ceil(Number(raw.extensionSeconds) || 20)),
            totalMs: Math.max(0, Number(raw.totalMs) || 0),
            endsAt: Math.max(0, Number(raw.endsAt) || 0),
            decisionKey: typeof raw.decisionKey === "string" ? raw.decisionKey.trim() : "",
        };
    }
    function applySnapshot(next) {
        // Access Proxy properties directly without calling toJSON() to avoid circular reference
        const rawSnapshot = next;
        if (Object.prototype.hasOwnProperty.call(rawSnapshot ?? {}, "privateHand") ||
            Object.prototype.hasOwnProperty.call(rawSnapshot ?? {}, "availableActions") ||
            Object.prototype.hasOwnProperty.call(rawSnapshot ?? {}, "roundResult")) {
            privateStateAuthoritySeq += 1;
        }
        const normalized = normalizeSnapshot(next);
        applyDecisionTimer(rawSnapshot?.decisionTimer);
        const previousSnapshot = state.value;
        if (!normalized.dealerCard &&
            normalized.dealerId &&
            previousSnapshot?.dealerCard &&
            previousSnapshot.dealerId === normalized.dealerId &&
            (previousSnapshot.phase === "declaring" || previousSnapshot.phase === "playing") &&
            (normalized.phase === "declaring" || normalized.phase === "playing" || normalized.phase === "ended")) {
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
        if ((snapshotPrivateHand.length > 0 || rawSnapshot?.privateHand) &&
            nextPrivateHandFingerprint !== privateHandFingerprint) {
            privateHand.value = snapshotPrivateHand;
            privateHandFingerprint = nextPrivateHandFingerprint;
            if (privateHandCountMatches(normalized)) {
                clearMissingHandSyncTimer();
            }
        }
        if ((Array.isArray(rawSnapshot?.availableActions) || rawSnapshot?.availableActions) &&
            nextAvailableActionsFingerprint !== availableActionsFingerprint) {
            availableActions.value = snapshotAvailableActions;
            availableActionsFingerprint = nextAvailableActionsFingerprint;
        }
        if (rawSnapshot?.roundResult && normalized.phase === "ended") {
            roundResult.value = normalizeRoundResultPayload(rawSnapshot.roundResult);
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
        if (mySeatId.value &&
            (normalized.phase === "declaring" || normalized.phase === "playing") &&
            !privateHandCountMatches(normalized)) {
            requestSyncState("stale_private_hand");
            startMissingHandSyncTimer();
        }
        else {
            clearMissingHandSyncTimer();
        }
        const currentPhase = String(state.value?.phase ?? "");
        const previousPhase = lastPhase;
        if ((previousPhase === "ended" || previousPhase === "waiting") &&
            (currentPhase === "declaring" || currentPhase === "playing")) {
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
    function tokenKey(roomId) {
        return `four_player_token:${roomId}`;
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
    async function createCompatibilityPracticeRoomId() {
        const response = await fetch(`${HTTP_URL}/room-id`, { method: "GET" });
        if (!response.ok) {
            throw new Error(await apiErrorMessage(response, "获取房间失败，请稍后重试。"));
        }
        const payload = (await response.json());
        if (!payload?.roomId) {
            throw new Error("服务端未返回可用房间");
        }
        return payload.roomId;
    }
    function pushLog(text, snapshot) {
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
    async function connect(options) {
        if (connectInFlight) {
            return false;
        }
        const query = new URLSearchParams(window.location.search);
        const resolvedOptions = typeof options === "string"
            ? { nameOverride: options }
            : {
                nameOverride: options?.nameOverride,
                roomId: options?.roomId,
                playerToken: options?.playerToken,
                hostKey: options?.hostKey,
                forceNew: Boolean(options?.forceNew),
                reconnecting: Boolean(options?.reconnecting),
                preserveState: Boolean(options?.preserveState),
            };
        const forceNew = Boolean(resolvedOptions.forceNew || query.get("new") === "1");
        const reconnecting = Boolean(resolvedOptions.reconnecting);
        const preserveState = !forceNew && Boolean(resolvedOptions.preserveState || reconnecting);
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
                }
                catch {
                    // ignore stale leave errors when switching rooms
                }
                finally {
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
            const initialRoomId = queryRoomId || cachedRoomId || (await createCompatibilityPracticeRoomId());
            const cachedToken = readStored(tokenKey(initialRoomId)) ||
                (cachedRoomId === initialRoomId ? readStored(LEGACY_TOKEN_KEY) : "");
            const desiredToken = queryToken || cachedToken || generateLocalPlayerToken();
            playerToken.value = desiredToken;
            if (preserveState && !activeRoomId.value) {
                activeRoomId.value = initialRoomId;
            }
            writeStored(tokenKey(initialRoomId), desiredToken);
            writeStored(NAME_KEY, desiredName);
            let joined;
            try {
                joined = await client.joinById(initialRoomId, {
                    name: desiredName,
                    playerToken: desiredToken,
                    hostKey: resolvedOptions.hostKey,
                });
            }
            catch (error) {
                const closeCode = error instanceof MatchMakeError
                    ? error.code
                    : Number(error?.code);
                if (TERMINAL_ROOM_CLOSE_MESSAGES[closeCode]) {
                    throw error;
                }
                if (reconnecting) {
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
            }
            else {
                connectionState.value = "connected";
            }
            if (joined.roomId) {
                writeStored(ROOM_KEY, joined.roomId);
                updateInviteUrl(joined.roomId);
            }
            const isCurrentJoinedRoom = () => isActiveConnection() && room.value === joined && activeRoomId.value === (joined.roomId || initialRoomId);
            joined.onStateChange((next) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                applySnapshot(next);
            });
            startRoomStateSync();
            startPrivateStatePolling();
            joined.onMessage("room_snapshot", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                applySnapshot(payload);
            });
            joined.onMessage("private_hand", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                privateStateAuthoritySeq += 1;
                privateHand.value = sortHandCards(asCardArray(payload));
                privateHandFingerprint = buildCardIdFingerprint(privateHand.value);
                if (privateHandCountMatches()) {
                    clearMissingHandSyncTimer();
                }
                else {
                    requestSyncState("stale_private_hand_message");
                    startMissingHandSyncTimer();
                }
            });
            joined.onMessage("available_actions", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                privateStateAuthoritySeq += 1;
                availableActions.value = normalizeAvailableActions(payload);
                applyDecisionTimer(Array.isArray(payload) ? undefined : payload?.decisionTimer);
                availableActionsFingerprint = buildAvailableActionsFingerprint(availableActions.value);
            });
            joined.onMessage("action_rejected", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                const reason = String(payload?.reason ?? "unknown");
                pushLog(`ACTION_REJECTED ${reason}`);
            });
            joined.onMessage("hu_result", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                huResult.value = payload;
                pushLog(`HU_RESULT ${payload.winnerId}`);
            });
            joined.onMessage("round_result", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                privateStateAuthoritySeq += 1;
                roundResult.value = normalizeRoundResultPayload(payload);
                pushLog(`ROUND_RESULT ${payload.winnerId ?? "-"}`);
            });
            joined.onMessage("debug_applied", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                debugApplied.value = payload;
            });
            joined.onMessage("session_token", (payload) => {
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
                    updateInviteUrl(payload.roomId);
                }
                pushLog(`SEAT ${payload.seatId}${payload.reclaimed ? " RECLAIM" : " JOIN"}`);
            });
            joined.onMessage("session_replaced", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                stopTerminalRecovery(payload?.message || TERMINAL_ROOM_CLOSE_MESSAGES[4102]);
            });
            joined.onMessage("join_error", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                joinError.value = payload?.message ?? "加入失败";
                pushLog(`ERROR ${joinError.value}`);
            });
            joined.onMessage("lobby_error", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                joinError.value = payload?.message || "大厅操作失败";
            });
            joined.onMessage("removed_from_room", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                const reason = payload?.reason || "你已离开房间";
                returnToModeLobbyFromRoom(reason);
            });
            joined.onMessage("room_dissolved", (payload) => {
                if (!isCurrentJoinedRoom()) {
                    return;
                }
                returnToModeLobbyFromRoom(payload?.reason || TERMINAL_ROOM_CLOSE_MESSAGES[4110]);
            });
            joined.onMessage("declare_rejected", (payload) => {
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
            const rawSocket = joined.connection?.transport?.ws;
            if (rawSocket && typeof rawSocket.addEventListener === "function") {
                rawSocket.addEventListener("close", (event) => {
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
        }
        catch (error) {
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
            }
            else if (preserveState) {
                connectionState.value = navigator.onLine ? "retry_wait" : "offline";
                joinError.value = navigator.onLine
                    ? `暂时未能恢复牌局，系统会继续重试（第 ${Math.max(1, reconnectAttempt.value)} 次）。`
                    : "网络已断开，联网后会自动恢复牌局。";
            }
            else {
                joinError.value = message;
                connectionState.value = "failed";
                activeRoomId.value = "";
                resetClientRoomState({ keepJoinError: true, keepLogs: true });
            }
        }
        finally {
            if (isActiveConnection()) {
                connectInFlight = false;
            }
        }
        return false;
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
    function sendDiscardCard(cardId) {
        if (!room.value || !cardId) {
            return;
        }
        safeRoomSend("discard_card", { cardId });
    }
    function declareKongs(count) {
        safeRoomSend("declare_kongs", count);
    }
    function declareSetup(payload) {
        declareError.value = "";
        safeRoomSend("declare_setup", payload);
    }
    function requestMoreTime() {
        const decisionKey = decisionTimer.value.decisionKey;
        if (!decisionTimer.value.canRequestMoreTime || !decisionKey) {
            return;
        }
        safeRoomSend("request_more_time", { decisionKey });
    }
    function debugSetup(scenario) {
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
    function setAutoPlay(enabled) {
        safeRoomSend("set_auto_play", { enabled });
    }
    async function leaveRoom() {
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
        window.history.replaceState(null, "", url.toString());
        if (departingRoom) {
            await departingRoom.leave().catch(() => undefined);
        }
    }
    function claimSeat(seatIndex) {
        joinError.value = "";
        safeRoomSend("claim_seat", { seatIndex });
    }
    function addBot(seatIndex, strength = 50) {
        joinError.value = "";
        safeRoomSend("add_bot", { seatIndex, strength });
    }
    function fillBots() {
        joinError.value = "";
        safeRoomSend("fill_bots");
    }
    function updateBot(seatIndex, strength) {
        safeRoomSend("update_bot", { seatIndex, strength });
    }
    function removeSeat(seatIndex) {
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
        window.removeEventListener("offline", handleBrowserOffline);
        window.removeEventListener("online", handleBrowserOnline);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        suppressReconnect = true;
        room.value?.leave();
    });
    const players = computed(() => {
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
        setAutoPlay,
        leaveRoom,
        claimSeat,
        addBot,
        fillBots,
        updateBot,
        removeSeat,
    };
}
