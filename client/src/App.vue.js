import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CardComp from "@/components/Card.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import DeclarationPanel from "@/components/DeclarationPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import GameTools from "@/components/GameTools.vue";
import LobbyPage from "@/components/LobbyPage.vue";
import LoginPage from "@/components/LoginPage.vue";
import { useResponsiveViewport } from "@/composables/useResponsiveViewport";
import { useRoom } from "@/composables/useRoom";
import { BACKEND_HTTP_URL } from "@/config/backend";
import { apiErrorMessage } from "@/utils/http";
import { getCardLabelText } from "@/utils/cardText";
const HTTP_URL = BACKEND_HTTP_URL;
const DISPLAY_PREFERENCES_KEY = "sise_game_display_preferences_v2";
const LEGACY_TABLE_CARD_MODE_KEY = "sise_table_card_mode";
function normalizeCardDisplayMode(value) {
    return value === "large" || value === "adaptive" || value === "long" ? value : null;
}
function readDisplayPreferences() {
    try {
        const stored = window.localStorage.getItem(DISPLAY_PREFERENCES_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                ownCards: normalizeCardDisplayMode(parsed.ownCards) ?? "adaptive",
                tableCards: normalizeCardDisplayMode(parsed.tableCards) ?? "adaptive",
                seatDirection: parsed.seatDirection === "clockwise" ? "clockwise" : "counterclockwise",
            };
        }
    }
    catch {
        // Invalid local preferences fall back to the compatible defaults below.
    }
    const legacyMode = window.localStorage.getItem(LEGACY_TABLE_CARD_MODE_KEY);
    return {
        ownCards: "adaptive",
        tableCards: legacyMode === "simple" ? "large" : legacyMode === "full" ? "long" : "adaptive",
        seatDirection: "counterclockwise",
    };
}
function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? "玩家";
}
function generateRandomNickname() {
    const prefix = ["青", "白", "赤", "黄", "东", "南", "西", "北", "云", "风", "星", "月"];
    const suffix = ["雀客", "牌友", "棋童", "将军", "行者", "小侠", "掌柜", "阿福", "阿宁", "子衿"];
    return `${randomFrom(prefix)}${randomFrom(suffix)}`;
}
function readNicknameHistory() {
    try {
        const raw = window.localStorage.getItem("sise_entry_name_history") ?? "[]";
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
    }
    catch {
        return [];
    }
}
function writeNicknameHistory(names) {
    window.localStorage.setItem("sise_entry_name_history", JSON.stringify(names.slice(0, 8)));
}
const { connect, connected, connectionState, reconnectAttempt, retryConnection, mySeatId, activeRoomId, state, players, privateHand, availableActions, huResult, roundResult, joinError, declareError, clearActionLogs, sendAction, sendDiscardCard, declareSetup, startGame, nextRound, returnLobby, leaveRoom, claimSeat, addBot, updateBot, removeSeat, } = useRoom("玩家");
const ENTRY_NAME_KEY = "sise_entry_name";
const ENTRY_HISTORY_KEY = "sise_entry_name_history";
const entryName = ref(window.localStorage.getItem(ENTRY_NAME_KEY)?.trim() || "");
const nicknameHistory = ref(readNicknameHistory());
const enteringLobby = ref(false);
const enteredFrontLobby = ref(false);
const restoringStoredSession = ref(false);
const pendingPracticeAutoStart = ref(false);
const selectedLobbyMode = ref("practice_bots");
const lobbyModes = [
    {
        id: "practice_bots",
        name: "单人练习",
        description: "当前模式：你进入大厅后，由系统自动补 3 个机器人，适合单机练习和规则体验。",
        enabled: true,
    },
    {
        id: "friends",
        name: "好友同桌",
        description: "创建私密好友房，通过链接邀请玩家自由选座，也可按座位添加不同强度的机器人。",
        enabled: true,
    },
    {
        id: "ranked_reserved",
        name: "联机匹配",
        description: "预留入口：未来会接账号、匹配和更多大厅信息，但这次先把结构留好。",
        enabled: false,
    },
];
function readBrowserStorage(key) {
    return (window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? "").trim();
}
function readStoredRoomSession() {
    const query = new URLSearchParams(window.location.search);
    if (query.get("new") === "1") {
        return null;
    }
    const queryRoomId = query.get("roomId")?.trim() || "";
    const cachedRoomId = readBrowserStorage("four_room_id");
    const roomId = queryRoomId || cachedRoomId;
    if (!roomId) {
        return null;
    }
    const playerToken = readBrowserStorage(`four_player_token:${roomId}`) ||
        (roomId === cachedRoomId ? readBrowserStorage("four_player_token") : "");
    const name = entryName.value.trim() || readBrowserStorage("four_player_name");
    if (!playerToken || !name) {
        return null;
    }
    return { roomId, playerToken, name };
}
async function resumeStoredRoomSession() {
    if (enteredFrontLobby.value || connected.value) {
        return;
    }
    const storedSession = readStoredRoomSession();
    if (!storedSession) {
        return;
    }
    entryName.value = storedSession.name;
    enteredFrontLobby.value = true;
    enteringLobby.value = true;
    restoringStoredSession.value = true;
    globalError.value = "";
    try {
        const ok = await connect({
            nameOverride: storedSession.name,
            roomId: storedSession.roomId,
            playerToken: storedSession.playerToken,
            reconnecting: true,
            preserveState: true,
        });
        if (!ok) {
            retryConnection();
        }
    }
    finally {
        enteringLobby.value = false;
        restoringStoredSession.value = false;
    }
}
async function abandonSessionResume() {
    restoringStoredSession.value = false;
    enteringLobby.value = false;
    globalError.value = "";
    await leaveRoom();
    enteredFrontLobby.value = false;
}
const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const hasLobbySession = computed(() => Boolean(connected.value || state.value || mySeatId.value));
const isConnectingWithoutState = computed(() => !state.value &&
    enteredFrontLobby.value &&
    (restoringStoredSession.value ||
        connectionState.value === "connecting" ||
        connectionState.value === "reconnecting" ||
        connectionState.value === "retry_wait" ||
        connectionState.value === "offline"));
const showEntry = computed(() => !enteredFrontLobby.value && !hasLobbySession.value);
const showSyncingScreen = computed(() => !state.value && (hasLobbySession.value || isConnectingWithoutState.value));
const showModeLobby = computed(() => {
    if (showSyncingScreen.value) {
        return false;
    }
    return isWaiting.value || (enteredFrontLobby.value && !state.value);
});
const showGameTools = computed(() => isDeclaring.value || isPlaying.value || isEnded.value);
const canPressStartGame = computed(() => Boolean(connected.value) &&
    Boolean(state.value) &&
    Boolean(mySeatId.value) &&
    isWaiting.value &&
    isHost.value &&
    (state.value?.roomMode !== "friends" ||
        (players.value.length === 4 && players.value.every((player) => player.isConfiguredBot || player.connected))));
const canStartSelectedMode = computed(() => (!hasLobbySession.value && (selectedLobbyMode.value === "practice_bots" || selectedLobbyMode.value === "friends")) ||
    canPressStartGame.value);
const lobbyTitle = computed(() => (isWaiting.value ? "房间准备中" : "游戏模式选择"));
const lobbySubtitle = computed(() => {
    if (!isWaiting.value) {
        return "选择一键单人练习，或创建一个可以邀请朋友和配置机器人的好友房。";
    }
    if (state.value?.roomMode !== "friends") {
        return "正在补齐机器人并准备开始单人练习。";
    }
    if (!mySeatId.value) {
        return "请选择一个写着“等待入座”的空座位；入座后等待房主开始。";
    }
    if (isHost.value) {
        return "把邀请链接发给朋友；四个座位都准备好后即可开始。";
    }
    return "你已入座；等待房主开始，也可以换到其他空座位。";
});
const lobbyStartLabel = computed(() => {
    if (!hasLobbySession.value && selectedLobbyMode.value === "ranked_reserved") {
        return "该模式尚未开放";
    }
    if (!hasLobbySession.value) {
        return selectedLobbyMode.value === "friends" ? "创建好友房" : "进入单人练习";
    }
    if (pendingPracticeAutoStart.value) {
        return "正在自动开始...";
    }
    if (state.value?.roomMode === "friends" && !mySeatId.value) {
        return "请先选择座位";
    }
    return isHost.value ? (state.value?.roomMode === "friends" ? "开始好友对局" : "开始单人练习") : "等待房主开始";
});
const lobbyStartHint = computed(() => {
    if (!hasLobbySession.value || !isWaiting.value)
        return "";
    if (!mySeatId.value)
        return "请先选择一个空座位";
    if (!isHost.value)
        return "座位配置完成后由房主开始";
    if (state.value?.roomMode !== "friends")
        return "";
    if (players.value.length < 4)
        return `还差 ${4 - players.value.length} 个座位`;
    if (players.value.some((player) => !player.isConfiguredBot && !player.connected))
        return "仍有真人玩家离线";
    return "四席已就绪";
});
const hasFriendInvite = computed(() => Boolean(new URLSearchParams(window.location.search).get("roomId")?.trim()));
const entryPrimaryLabel = computed(() => (hasFriendInvite.value ? "加入好友房" : "进入大厅"));
const nowMs = ref(Date.now());
const displayTurnPlayerId = computed(() => {
    if (state.value?.responsePhase === "collective") {
        return (state.value?.currentTurnPlayerId ||
            state.value?.currentPlayerId ||
            state.value?.pollOriginPlayerId ||
            "");
    }
    return state.value?.currentTurnPlayerId || state.value?.currentPlayerId || "";
});
const isMyTurn = computed(() => {
    if (state.value?.responsePhase === "collective") {
        return false;
    }
    if (!mySeatId.value || displayTurnPlayerId.value !== mySeatId.value) {
        return false;
    }
    const me = players.value.find((x) => x.clientId === mySeatId.value);
    return !Boolean(me?.isBot);
});
const openingDealActive = computed(() => isPlaying.value &&
    /^DEALER\s+\S+/.test(String(state.value?.lastAction ?? "")) &&
    Number(state.value?.responseEndsAt ?? 0) > nowMs.value);
const openingDealSecondsLeft = computed(() => {
    if (!openingDealActive.value) {
        return 0;
    }
    return Math.max(0, Math.ceil((Number(state.value?.responseEndsAt ?? 0) - nowMs.value) / 1000));
});
const canAct = computed(() => connected.value &&
    !openingDealActive.value &&
    isPlaying.value &&
    availableActions.value.some((x) => x.enabled || x.deferred));
const canDiscard = computed(() => connected.value &&
    !openingDealActive.value &&
    isPlaying.value &&
    isMyTurn.value &&
    state.value?.responsePhase === "local_draw" &&
    availableActions.value.length === 0);
const selectionMode = ref(null);
const selectedCandidateId = ref(null);
const pendingDeferredChiCandidateId = ref(null);
const pendingDeferredGrab = ref(false);
const activeCandidates = computed(() => {
    if (!selectionMode.value) {
        return [];
    }
    const item = availableActions.value.find((action) => action.action === selectionMode.value && (action.enabled || action.deferred));
    return item?.candidates ?? [];
});
const candidateTargetCard = computed(() => {
    return (state.value?.responseCard ?? state.value?.targetCard ?? state.value?.publicDiscardPile?.[0] ?? null);
});
const isPendingSpecialCard = computed(() => {
    const card = candidateTargetCard.value;
    return Boolean(card && (card.color === "gold" || card.type === "jiang"));
});
const candidatePromptText = computed(() => {
    if (selectionMode.value === "chi" && isPendingSpecialCard.value) {
        return state.value?.responsePhase === "collective"
            ? "请选择将士象组合，或单独收下；系统会先等待其他玩家响应"
            : "请选择将士象组合，或单独收下这张将/金条";
    }
    if (state.value?.responsePhase === "collective" && selectionMode.value === "chi") {
        return "请先选吃的牌组；系统会先过待响，待无人胡/开/碰后自动吃";
    }
    return selectionMode.value ? `请点击一个牌组确认${actionText(selectionMode.value)}` : "请点击一个牌组确认";
});
const { effectiveHeight, effectiveWidth, isCompactViewport, isRotatedPhonePortrait, isUltraCompactViewport, } = useResponsiveViewport();
const displayPreferences = ref(readDisplayPreferences());
function resolveCardDisplayMode(mode) {
    if (mode !== "adaptive") {
        return mode;
    }
    return isCompactViewport.value ? "large" : "long";
}
const resolvedOwnCardMode = computed(() => resolveCardDisplayMode(displayPreferences.value.ownCards));
const resolvedTableCardMode = computed(() => resolveCardDisplayMode(displayPreferences.value.tableCards));
const globalError = ref("");
const globalNotice = ref("");
let globalNoticeTimer = null;
const showRules = ref(false);
const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
const mePlayer = computed(() => players.value.find((x) => x.clientId === mySeatId.value) ?? null);
const isDeclareSubmitted = computed(() => Boolean(mePlayer.value?.declaredReady));
const shouldShowDeclarePanel = computed(() => isDeclaring.value &&
    !declareDealIntroActive.value &&
    Boolean(mySeatId.value) &&
    !Boolean(mePlayer.value?.isBot));
const settingsDecisionActive = computed(() => canAct.value || canDiscard.value);
const declareDealIntroActive = computed(() => isDeclaring.value && Number(state.value?.responseEndsAt ?? 0) > nowMs.value);
let declareTick = null;
const declareSecondsLeft = computed(() => {
    if (declareDealIntroActive.value) {
        return 0;
    }
    const endsAt = Number(state.value?.declareEndsAt ?? 0);
    if (!endsAt) {
        return 0;
    }
    return Math.max(0, Math.ceil((endsAt - nowMs.value) / 1000));
});
const declareTotalMs = computed(() => {
    const action = String(state.value?.lastAction ?? "");
    const match = action.match(/DECLARING\s+(\d+)ms/);
    if (match) {
        return Math.max(1000, Number(match[1]) || 30000);
    }
    return 30000;
});
const declareProgressPercent = computed(() => {
    const endsAt = Number(state.value?.declareEndsAt ?? 0);
    if (!endsAt) {
        return 0;
    }
    const remain = Math.max(0, endsAt - nowMs.value);
    const percent = (remain / declareTotalMs.value) * 100;
    return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
});
function clearSelection() {
    selectionMode.value = null;
    selectedCandidateId.value = null;
}
async function handleLeaveRoom() {
    globalError.value = "";
    pendingPracticeAutoStart.value = false;
    clearSelection();
    await leaveRoom();
}
function onPanelSelectionChange(payload) {
    selectionMode.value = payload.mode;
    selectedCandidateId.value = payload.selectedCandidateId;
}
function actionFromRequest(request) {
    return typeof request === "string" ? request : request.action;
}
function candidateIdFromRequest(request) {
    return typeof request === "string" ? "" : String(request.candidateId ?? "").trim();
}
function onPanelSubmit(request) {
    const action = actionFromRequest(request);
    const isDeferred = typeof request !== "string" && Boolean(request.deferred);
    if (state.value?.responsePhase === "collective" && action === "pass" && isDeferred) {
        pendingDeferredGrab.value = true;
        sendAction("pass");
        clearSelection();
        return;
    }
    if (state.value?.responsePhase === "collective" && action === "chi") {
        const candidateId = candidateIdFromRequest(request);
        if (candidateId) {
            pendingDeferredChiCandidateId.value = candidateId;
            sendAction("pass");
        }
        clearSelection();
        return;
    }
    pendingDeferredChiCandidateId.value = null;
    pendingDeferredGrab.value = false;
    sendAction(request);
    clearSelection();
}
function submitCandidate(candidateId) {
    if (!selectionMode.value) {
        return;
    }
    selectedCandidateId.value = candidateId;
    onPanelSubmit({ action: selectionMode.value, candidateId });
}
function actionText(action) {
    if (action === "kai") {
        return "开";
    }
    if (action === "peng") {
        return "碰";
    }
    return "吃";
}
function candidateSourceText(source) {
    if (source === "hand+pool") {
        return "手牌与已有明示牌";
    }
    return "手牌";
}
function cardLabel(card) {
    return getCardLabelText(card);
}
function parseCardIdToCard(cardId) {
    const match = String(cardId ?? "").trim().match(/^([a-z]+)_([a-z]+)_\d+$/i);
    if (!match) {
        return null;
    }
    return {
        id: cardId,
        color: match[1].toLowerCase(),
        type: match[2].toLowerCase(),
    };
}
function candidateGroupCards(candidate) {
    return candidate.cardIds.map((id) => parseCardIdToCard(id)).filter((card) => Boolean(card));
}
function submitDeferredChiIfReady() {
    const candidateId = pendingDeferredChiCandidateId.value;
    if (!candidateId) {
        return;
    }
    const phase = String(state.value?.responsePhase ?? "");
    if (phase === "collective") {
        return;
    }
    const isLocalChiPhase = (phase === "local_upper" || phase === "local_draw") && String(state.value?.currentPlayerId ?? "") === mySeatId.value;
    if (!isLocalChiPhase) {
        pendingDeferredChiCandidateId.value = null;
        return;
    }
    const chiEntry = availableActions.value.find((item) => item.action === "chi" && item.enabled);
    if (!chiEntry) {
        return;
    }
    if (!chiEntry.candidates?.some((candidate) => candidate.id === candidateId)) {
        pendingDeferredChiCandidateId.value = null;
        return;
    }
    pendingDeferredChiCandidateId.value = null;
    sendAction({ action: "chi", candidateId });
}
function submitDeferredGrabIfReady() {
    if (!pendingDeferredGrab.value) {
        return;
    }
    const isLocalUpper = String(state.value?.responsePhase ?? "") === "local_upper" && String(state.value?.currentPlayerId ?? "") === mySeatId.value;
    if (String(state.value?.responsePhase ?? "") === "collective") {
        return;
    }
    if (!isLocalUpper) {
        pendingDeferredGrab.value = false;
        return;
    }
    const passEntry = availableActions.value.find((item) => item.action === "pass" && item.enabled);
    if (!passEntry) {
        return;
    }
    pendingDeferredGrab.value = false;
    sendAction("pass");
}
function submitDeclaration(payload) {
    if (isDeclareSubmitted.value) {
        return;
    }
    declareSetup(payload);
}
watch(() => `${state.value?.phase ?? ""}|${state.value?.responsePhase ?? ""}|${state.value?.currentPlayerId ?? ""}`, () => {
    clearSelection();
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
});
watch(() => availableActions.value, () => {
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
    if (!selectionMode.value) {
        return;
    }
    const current = availableActions.value.find((item) => item.action === selectionMode.value && (item.enabled || item.deferred));
    if (!current) {
        clearSelection();
        return;
    }
    if (selectedCandidateId.value &&
        !Boolean(current.candidates?.some((candidate) => candidate.id === selectedCandidateId.value))) {
        selectedCandidateId.value = null;
    }
}, { deep: true });
onMounted(() => {
    if (!entryName.value) {
        entryName.value = nicknameHistory.value[0] || generateRandomNickname();
    }
    declareTick = window.setInterval(() => {
        nowMs.value = Date.now();
    }, 500);
    window.localStorage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(displayPreferences.value));
    void resumeStoredRoomSession();
});
onUnmounted(() => {
    if (declareTick !== null) {
        window.clearInterval(declareTick);
        declareTick = null;
    }
    if (globalNoticeTimer !== null) {
        window.clearTimeout(globalNoticeTimer);
        globalNoticeTimer = null;
    }
});
watch(globalError, (message) => {
    if (message) {
        clearGlobalNotice();
    }
});
watch(displayPreferences, (preferences) => {
    window.localStorage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences));
}, { deep: true });
function maybeAutoStartPractice() {
    if (!pendingPracticeAutoStart.value || !canPressStartGame.value) {
        return;
    }
    // 单人练习应该在房间准备就绪后立刻发 start_game，
    // 不能只依赖“ready 从 false 变 true”的 watcher，
    // 否则当 ready 先成立、pending 后置为 true 时会永远卡住。
    startGame();
    pendingPracticeAutoStart.value = false;
}
watch(() => [canPressStartGame.value, pendingPracticeAutoStart.value], () => {
    maybeAutoStartPractice();
}, { immediate: true });
// 一旦房间离开 waiting 阶段（即已成功开局），清除自动开局标记以阻止后续重试。
watch(() => state.value?.phase, (phase) => {
    if (phase && phase !== "waiting" && pendingPracticeAutoStart.value) {
        pendingPracticeAutoStart.value = false;
    }
});
// 更直接的兜底：一旦收到手牌，说明游戏已实际开始，立即清除 pending。
watch(() => privateHand.value.length, (length) => {
    if (length > 0 && pendingPracticeAutoStart.value) {
        pendingPracticeAutoStart.value = false;
    }
});
const endPanelTitle = computed(() => {
    if (derivedWinnerId.value) {
        return "胡牌结算";
    }
    return "流局结算";
});
const derivedWinnerId = computed(() => {
    const explicit = huResult.value?.winnerId ?? roundResult.value?.winnerId;
    if (explicit) {
        return explicit;
    }
    const match = String(state.value?.lastAction ?? "").match(/^(\S+)\s+HU$/);
    return match?.[1] ?? "";
});
const winnerName = computed(() => {
    const winnerId = derivedWinnerId.value;
    if (!winnerId) {
        return "-";
    }
    const player = players.value.find((x) => x.clientId === winnerId);
    return player?.name || winnerId;
});
const settlementPlayers = computed(() => roundResult.value?.players ?? []);
const remainingDeckPreview = computed(() => roundResult.value?.remainingDeck ?? []);
function splitCardGroups(cards, sizes) {
    const groups = [];
    let offset = 0;
    for (const size of sizes) {
        if (!Number.isFinite(size) || size <= 0) {
            continue;
        }
        const chunk = cards.slice(offset, offset + size);
        offset += size;
        if (chunk.length === size) {
            groups.push(chunk);
        }
    }
    if (!groups.length && cards.length) {
        groups.push([...cards]);
    }
    return groups;
}
function splitExposedGroupsWithKinds(cards, sizes, kinds) {
    const groups = splitCardGroups(cards, sizes);
    return groups.map((group, index) => ({
        cards: group,
        kind: kinds[index] ?? "",
    }));
}
function splitFishGroups(cards) {
    if (!cards.length) {
        return [];
    }
    if (cards.every((card) => card.color === "gold")) {
        return [[...cards]];
    }
    const grouped = new Map();
    for (const card of cards) {
        const key = `${card.color}:${card.type}`;
        const list = grouped.get(key) ?? [];
        list.push(card);
        grouped.set(key, list);
    }
    return [...grouped.values()];
}
function isSameSettlementFace(cards) {
    if (!cards.length) {
        return false;
    }
    const head = cards[0];
    return cards.every((card) => card.color === head.color && card.type === head.type);
}
function settlementBadge(cards, kind = "") {
    if (!cards.length) {
        return undefined;
    }
    const head = cards[0];
    if (kind === "peng") {
        return "碰";
    }
    if (kind === "kai") {
        return "开";
    }
    if (head.color === "gold" && cards.length >= 3) {
        return cards.length >= 4 ? "开" : "坎";
    }
    if (cards.length === 2 && isSameSettlementFace(cards)) {
        return "对";
    }
    if (isSameSettlementFace(cards)) {
        if (cards.length >= 4) {
            return "开";
        }
        if (cards.length === 3) {
            return "坎";
        }
        return undefined;
    }
    if (cards.length === 4) {
        return "鱼";
    }
    return undefined;
}
function settlementGroupLabel(cards, kind = "") {
    if (!cards.length) {
        return undefined;
    }
    const head = cards[0];
    if (head.color === "gold") {
        if (cards.length >= 4 || kind === "kai") {
            return "金条开";
        }
        if (cards.length === 3) {
            return "金条坎";
        }
        if (cards.length === 1) {
            return "金条单张";
        }
    }
    if (kind === "peng") {
        return `${cardLabel(head)}碰`;
    }
    if (kind === "kai") {
        return `${cardLabel(head)}开`;
    }
    if (isSameSettlementFace(cards)) {
        if (cards.length >= 4) {
            return `${cardLabel(head)}开`;
        }
        if (cards.length === 3) {
            return `${cardLabel(head)}坎`;
        }
        if (cards.length === 2) {
            return `${cardLabel(head)}对子`;
        }
        if (cards.length === 1 && head.type === "jiang") {
            return `${cardLabel(head)}单张`;
        }
    }
    const sameColor = cards.every((card) => card.color === head.color);
    const types = new Set(cards.map((card) => card.type));
    const colorPrefix = cardLabel(head).slice(0, 1);
    if (sameColor && cards.length === 3 && types.has("ju") && types.has("ma") && types.has("pao")) {
        return `${colorPrefix}车马炮架`;
    }
    if (sameColor && cards.length === 3 && types.has("jiang") && types.has("shi") && types.has("xiang")) {
        const faces = ["jiang", "shi", "xiang"]
            .map((type) => getCardLabelText({ color: head.color, type }).slice(1))
            .join("");
        return `${colorPrefix}${faces}架`;
    }
    if (cards.length === 4) {
        return `${cardLabel(head)}鱼`;
    }
    return settlementBadge(cards, kind);
}
function settlementTone(cards) {
    const head = cards[0];
    if (!head) {
        return "meld";
    }
    if (head.color === "gold" || (isSameSettlementFace(cards) && cards.length >= 3)) {
        return "strong";
    }
    if (cards.length === 1 && (head.type === "jiang" || head.color === "gold")) {
        return "public";
    }
    if (cards.length === 4) {
        return "fish";
    }
    return "meld";
}
function settlementGroupBlocks(player) {
    const blocks = [];
    (player.winningGroups ?? []).forEach((group, index) => {
        blocks.push({
            id: `winning-${index}-${group.cards.map((card) => card.id).join("-")}`,
            cards: group.cards,
            badge: settlementBadge(group.cards),
            label: settlementGroupLabel(group.cards),
            tone: settlementTone(group.cards),
        });
    });
    splitExposedGroupsWithKinds(player.exposedArea ?? [], player.exposedGroupSizes ?? [], player.exposedGroupKinds ?? []).forEach(({ cards, kind }, index) => {
        blocks.push({
            id: `meld-${index}-${cards.map((card) => card.id).join("-")}`,
            cards,
            badge: settlementBadge(cards, kind),
            label: settlementGroupLabel(cards, kind),
            tone: settlementTone(cards),
        });
    });
    (player.generalArea ?? []).forEach((card, index) => {
        blocks.push({
            id: `public-${index}-${card.id}`,
            cards: [card],
            badge: settlementBadge([card]),
            label: settlementGroupLabel([card]),
            tone: settlementTone([card]),
        });
    });
    splitFishGroups(player.fishArea ?? []).forEach((cards, index) => {
        blocks.push({
            id: `fish-${index}-${cards.map((card) => card.id).join("-")}`,
            cards,
            badge: settlementBadge(cards),
            label: settlementGroupLabel(cards),
            tone: settlementTone(cards),
        });
    });
    return blocks;
}
function settlementHandBlocks(player) {
    if (isSettlementWinner(player)) {
        return (player.resolvedHandGroups ?? []).map((group, index) => ({
            id: `hand-${index}-${group.cards.map((card) => card.id).join("-")}`,
            cards: group.cards,
            badge: settlementBadge(group.cards),
            label: settlementGroupLabel(group.cards),
            tone: settlementTone(group.cards),
        }));
    }
    return groupHandWithHiddenKans(player.hand ?? [], Number(player.declaredKongs ?? 0));
}
function groupHandWithHiddenKans(cards, declaredKongs) {
    const used = new Set();
    const byFace = new Map();
    for (const card of cards) {
        const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
        const list = byFace.get(key) ?? [];
        list.push(card);
        byFace.set(key, list);
    }
    const blocks = [];
    let remainingDeclaredKongs = Math.max(0, Math.floor(Number(declaredKongs) || 0));
    for (const [key, sameFaceCards] of byFace.entries()) {
        const kanCount = Math.floor(sameFaceCards.length / 3);
        for (let index = 0; index < kanCount; index += 1) {
            const chunk = sameFaceCards.slice(index * 3, index * 3 + 3);
            if (chunk.length !== 3) {
                continue;
            }
            chunk.forEach((card) => used.add(card.id));
            const isDeclaredKan = remainingDeclaredKongs > 0;
            if (isDeclaredKan) {
                remainingDeclaredKongs -= 1;
            }
            blocks.push({
                id: `${isDeclaredKan ? "hidden-kan" : "peng"}-${key}-${index}-${chunk.map((card) => card.id).join("-")}`,
                cards: chunk,
                badge: isDeclaredKan ? "坎" : "碰",
                label: settlementGroupLabel(chunk),
                tone: settlementTone(chunk),
            });
        }
    }
    const looseCards = cards.filter((card) => !used.has(card.id));
    if (looseCards.length) {
        blocks.push({
            id: `loose-${looseCards.map((card) => card.id).join("-")}`,
            cards: looseCards,
            tone: "meld",
        });
    }
    return blocks;
}
function signedScore(value) {
    if (value > 0) {
        return `+${value}`;
    }
    return `${value}`;
}
function scoreToneClass(value) {
    if (value > 0) {
        return "positive";
    }
    if (value < 0) {
        return "negative";
    }
    return "neutral";
}
function isSettlementWinner(player) {
    return Boolean(roundResult.value?.winnerId) && roundResult.value?.winnerId === player.clientId;
}
function settlementHandCardMode(playerId) {
    return playerId === mySeatId.value ? resolvedOwnCardMode.value : resolvedTableCardMode.value;
}
function huFormulaLineOrder(key) {
    if (key === "HuBase") {
        return 0;
    }
    if (String(key).startsWith("HuBigMultiplier")) {
        return 2;
    }
    return 1;
}
const winnerSettlementPlayer = computed(() => {
    const winnerId = roundResult.value?.winnerId;
    if (!winnerId) {
        return null;
    }
    return settlementPlayers.value.find((player) => player.clientId === winnerId) ?? null;
});
const huCalculationLines = computed(() => (winnerSettlementPlayer.value?.scoreBreakdown ?? [])
    .filter((line) => /^Hu(Base|Win|BigMultiplier)/.test(String(line.key ?? "")))
    .map((line) => ({
    ...line,
    label: String(line.key ?? "").startsWith("HuBigMultiplier") ? "大胡整体 ×2" : line.label,
}))
    .sort((a, b) => huFormulaLineOrder(a.key) - huFormulaLineOrder(b.key)));
const winnerPerOpponentScore = computed(() => {
    const winner = winnerSettlementPlayer.value;
    if (!winner) {
        return 0;
    }
    const payerCount = Math.max(1, settlementPlayers.value.filter((player) => player.clientId !== winner.clientId).length);
    return Math.round(winner.totalScore / payerCount);
});
function settlementScoreLines(player) {
    const winnerId = roundResult.value?.winnerId;
    if (!winnerId) {
        return (player.scoreBreakdown ?? []).map((line) => ({
            key: line.key,
            label: line.label,
            total: line.total,
        }));
    }
    const winner = settlementPlayers.value.find((item) => item.clientId === winnerId);
    const payers = settlementPlayers.value.filter((item) => item.clientId !== winnerId);
    const payerCount = payers.length || 1;
    const winnerPerOpponent = winner ? Math.round(winner.totalScore / payerCount) : 0;
    if (winnerId !== player.clientId) {
        const nonHuLines = (player.scoreBreakdown ?? [])
            .filter((line) => !/^Hu(Base|Lose|Win|BigMultiplier)/.test(String(line.key ?? "")))
            .map((line) => ({
            key: line.key,
            label: line.label,
            total: line.total,
        }));
        const huLine = winner && winnerPerOpponent
            ? [
                {
                    key: `hu-pay-${winner.clientId}-${player.clientId}`,
                    label: `${winner.name} 收胡牌分`,
                    total: -winnerPerOpponent,
                },
            ]
            : [];
        return [...huLine, ...nonHuLines];
    }
    return payers.map((payer) => ({
        key: `hu-pay-${payer.clientId}`,
        label: `${payer.name} 付胡牌分`,
        total: winnerPerOpponent,
    }));
}
const endSummary = computed(() => {
    const action = String(state.value?.lastAction ?? "");
    if (action === "DECK_EMPTY" || action === "DRAW_GAME") {
        return "牌堆耗尽，流局。";
    }
    const noDiscardMatch = action.match(/^(\S+)\s+NO_DISCARD$/);
    if (noDiscardMatch) {
        const seatId = noDiscardMatch[1];
        const player = players.value.find((x) => x.clientId === seatId);
        return `${player?.name || seatId} 无可弃牌，流局。`;
    }
    return "对局结束。";
});
const turnHint = computed(() => {
    if (openingDealActive.value) {
        return `发牌中，${openingDealSecondsLeft.value}s 后开局`;
    }
    if (canDiscard.value) {
        return "请点击手牌弃一张";
    }
    if (state.value?.responsePhase === "local_upper" && canAct.value) {
        return isMyTurn.value ? "可选择吃或抓" : "等待对方操作";
    }
    if (state.value?.responsePhase === "local_draw" && canAct.value) {
        if (isMyTurn.value && isPendingSpecialCard.value) {
            return "请选择吃牌组合，或收下将/金条";
        }
        return isMyTurn.value ? "可选择吃或过" : "等待对方操作";
    }
    if (state.value?.responsePhase === "collective") {
        if (canAct.value) {
            return "全局待响阶段：你可以选择胡/开/碰/过";
        }
        return "等待三家响应";
    }
    return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});
const currentPlayerName = computed(() => {
    const playerId = displayTurnPlayerId.value;
    if (!playerId) {
        return "-";
    }
    const player = players.value.find((x) => x.clientId === playerId);
    return player?.name || playerId;
});
const roundDealerCard = computed(() => {
    const card = state.value?.dealerCard ?? null;
    return card?.id ? card : null;
});
async function enterLobby() {
    const nickname = entryName.value.trim() || generateRandomNickname();
    entryName.value = nickname;
    globalError.value = "";
    window.localStorage.setItem(ENTRY_NAME_KEY, nickname);
    const mergedHistory = [nickname, ...nicknameHistory.value.filter((item) => item !== nickname)].slice(0, 8);
    nicknameHistory.value = mergedHistory;
    writeNicknameHistory(mergedHistory);
    enteredFrontLobby.value = true;
    const invitedRoomId = new URLSearchParams(window.location.search).get("roomId")?.trim() || "";
    if (!invitedRoomId) {
        return;
    }
    enteringLobby.value = true;
    try {
        const ok = await connect({ nameOverride: nickname, roomId: invitedRoomId });
        if (!ok) {
            throw new Error(joinError.value || "加入好友房失败");
        }
    }
    catch (error) {
        globalError.value = error instanceof Error ? error.message : "加入好友房失败";
    }
    finally {
        enteringLobby.value = false;
    }
}
function randomizeNickname() {
    entryName.value = generateRandomNickname();
}
function startSelectedMode() {
    if (!hasLobbySession.value && selectedLobbyMode.value === "ranked_reserved") {
        globalError.value = "该模式暂未开放，当前只支持单人练习。";
        return;
    }
    globalError.value = "";
    if (!hasLobbySession.value) {
        if (selectedLobbyMode.value === "friends") {
            void startFriendLobby();
        }
        else {
            void startPracticeLobby();
        }
        return;
    }
    if (state.value?.roomMode === "friends") {
        startGame();
    }
    else {
        requestPracticeAutoStart();
    }
}
function requestPracticeAutoStart() {
    pendingPracticeAutoStart.value = true;
    maybeAutoStartPractice();
}
async function startPracticeLobby() {
    if (enteringLobby.value) {
        return;
    }
    const nickname = entryName.value.trim() || generateRandomNickname();
    entryName.value = nickname;
    enteringLobby.value = true;
    try {
        const response = await fetch(`${HTTP_URL}/rooms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "practice" }),
        });
        if (!response.ok) {
            throw new Error(await apiErrorMessage(response, "创建单人练习房间失败，请稍后重试。"));
        }
        const payload = (await response.json());
        if (!payload?.ok || !payload.roomId) {
            throw new Error(payload?.message || "创建单人练习房间失败");
        }
        const ok = await connect({
            nameOverride: nickname,
            roomId: payload.roomId,
            hostKey: payload.hostKey,
            forceNew: true,
        });
        if (!ok) {
            throw new Error(joinError.value || "进入大厅失败");
        }
        requestPracticeAutoStart();
    }
    catch (error) {
        globalError.value = error instanceof Error ? error.message : "进入大厅失败";
    }
    finally {
        enteringLobby.value = false;
    }
}
async function startFriendLobby() {
    if (enteringLobby.value) {
        return;
    }
    const nickname = entryName.value.trim() || generateRandomNickname();
    enteringLobby.value = true;
    try {
        const response = await fetch(`${HTTP_URL}/rooms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "friends" }),
        });
        if (!response.ok) {
            throw new Error(await apiErrorMessage(response, "创建好友房失败，请稍后重试。"));
        }
        const payload = (await response.json());
        if (!payload.ok || !payload.roomId || !payload.hostKey) {
            throw new Error(payload.message || "创建好友房失败");
        }
        const ok = await connect({
            nameOverride: nickname,
            roomId: payload.roomId,
            hostKey: payload.hostKey,
            forceNew: true,
        });
        if (!ok) {
            throw new Error(joinError.value || "进入好友房失败");
        }
    }
    catch (error) {
        globalError.value = error instanceof Error ? error.message : "创建好友房失败";
    }
    finally {
        enteringLobby.value = false;
    }
}
async function copyInviteLink() {
    if (!activeRoomId.value) {
        return;
    }
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("roomId", activeRoomId.value);
    try {
        await navigator.clipboard.writeText(url.toString());
        globalError.value = "";
        showGlobalNotice("邀请链接已复制，可以发给朋友了");
    }
    catch {
        window.prompt("请复制邀请链接", url.toString());
    }
}
function clearGlobalNotice() {
    if (globalNoticeTimer !== null) {
        window.clearTimeout(globalNoticeTimer);
        globalNoticeTimer = null;
    }
    globalNotice.value = "";
}
function showGlobalNotice(message) {
    clearGlobalNotice();
    globalNotice.value = message;
    globalNoticeTimer = window.setTimeout(() => {
        globalNotice.value = "";
        globalNoticeTimer = null;
    }, 3_000);
}
watch(() => state.value?.phase, (phase) => {
    if (phase && phase !== "waiting") {
        pendingPracticeAutoStart.value = false;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['playing']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['game-tools-active']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['game-tools-active']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['game-tools-active']} */ ;
/** @type {__VLS_StyleScopedClasses['resume-cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-field']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-input']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-card']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-head']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-item']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-col']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['winner']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['score-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['score-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['score-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['score-breakdown']} */ ;
/** @type {__VLS_StyleScopedClasses['score-breakdown']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-cards-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['playing']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-landscape']} */ ;
/** @type {__VLS_StyleScopedClasses['playing']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['game-control-header']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "layout" },
    ...{ class: ({
            playing: __VLS_ctx.isPlaying,
            'compact-viewport': __VLS_ctx.isCompactViewport,
            'ultra-compact-viewport': __VLS_ctx.isUltraCompactViewport,
            'compact-landscape': __VLS_ctx.isCompactViewport && __VLS_ctx.isPlaying,
            'rotated-phone-portrait': __VLS_ctx.isRotatedPhonePortrait,
            'game-tools-active': __VLS_ctx.showGameTools,
        }) },
    'data-effective-viewport': (`${__VLS_ctx.effectiveWidth}x${__VLS_ctx.effectiveHeight}`),
    'data-rotated-phone-portrait': (__VLS_ctx.isRotatedPhonePortrait ? 'true' : 'false'),
    'data-connection-state': (__VLS_ctx.connectionState),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "top" },
    ...{ class: ({ 'game-control-header': __VLS_ctx.showGameTools }) },
    'data-testid': (__VLS_ctx.showGameTools ? 'game-control-header' : undefined),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "top-brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand-lockup" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-suits" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
if (!__VLS_ctx.showGameTools) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "top-slogan" },
    });
}
if (__VLS_ctx.hasLobbySession || __VLS_ctx.isConnectingWithoutState) {
    /** @type {[typeof ConnectionStatus, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(ConnectionStatus, new ConnectionStatus({
        ...{ 'onRetry': {} },
        state: (__VLS_ctx.connectionState),
        attempt: (__VLS_ctx.reconnectAttempt),
        showConnected: (!__VLS_ctx.showGameTools),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onRetry': {} },
        state: (__VLS_ctx.connectionState),
        attempt: (__VLS_ctx.reconnectAttempt),
        showConnected: (!__VLS_ctx.showGameTools),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onRetry: (__VLS_ctx.retryConnection)
    };
    var __VLS_2;
}
if (__VLS_ctx.showGameTools) {
    /** @type {[typeof GameTools, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(GameTools, new GameTools({
        ...{ 'onOpenRules': {} },
        ...{ 'onExit': {} },
        modelValue: (__VLS_ctx.displayPreferences),
        decisionActive: (__VLS_ctx.settingsDecisionActive),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onOpenRules': {} },
        ...{ 'onExit': {} },
        modelValue: (__VLS_ctx.displayPreferences),
        decisionActive: (__VLS_ctx.settingsDecisionActive),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        onOpenRules: (...[$event]) => {
            if (!(__VLS_ctx.showGameTools))
                return;
            __VLS_ctx.showRules = true;
        }
    };
    const __VLS_14 = {
        onExit: (__VLS_ctx.handleLeaveRoom)
    };
    var __VLS_9;
}
if (!__VLS_ctx.hasLobbySession && !__VLS_ctx.isConnectingWithoutState) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.hasLobbySession && !__VLS_ctx.isConnectingWithoutState))
                    return;
                __VLS_ctx.showRules = true;
            } },
        ...{ class: "ghost reset-btn" },
    });
}
if (__VLS_ctx.globalError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "error global-error" },
        role: "alert",
    });
    (__VLS_ctx.globalError);
}
else if (__VLS_ctx.globalNotice) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "global-notice" },
        role: "status",
        'aria-live': "polite",
        'data-testid': "global-notice",
    });
    (__VLS_ctx.globalNotice);
}
if (__VLS_ctx.showEntry) {
    /** @type {[typeof LoginPage, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(LoginPage, new LoginPage({
        ...{ 'onUpdate:nickname': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onOpenRules': {} },
        ...{ 'onRandomize': {} },
        ...{ 'onSelectHistory': {} },
        nickname: (__VLS_ctx.entryName),
        entering: (__VLS_ctx.enteringLobby),
        primaryLabel: (__VLS_ctx.entryPrimaryLabel),
        friendInvite: (__VLS_ctx.hasFriendInvite),
        historyNames: (__VLS_ctx.nicknameHistory),
    }));
    const __VLS_16 = __VLS_15({
        ...{ 'onUpdate:nickname': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onOpenRules': {} },
        ...{ 'onRandomize': {} },
        ...{ 'onSelectHistory': {} },
        nickname: (__VLS_ctx.entryName),
        entering: (__VLS_ctx.enteringLobby),
        primaryLabel: (__VLS_ctx.entryPrimaryLabel),
        friendInvite: (__VLS_ctx.hasFriendInvite),
        historyNames: (__VLS_ctx.nicknameHistory),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    let __VLS_18;
    let __VLS_19;
    let __VLS_20;
    const __VLS_21 = {
        'onUpdate:nickname': (...[$event]) => {
            if (!(__VLS_ctx.showEntry))
                return;
            __VLS_ctx.entryName = $event;
        }
    };
    const __VLS_22 = {
        onSubmit: (__VLS_ctx.enterLobby)
    };
    const __VLS_23 = {
        onOpenRules: (...[$event]) => {
            if (!(__VLS_ctx.showEntry))
                return;
            __VLS_ctx.showRules = true;
        }
    };
    const __VLS_24 = {
        onRandomize: (__VLS_ctx.randomizeNickname)
    };
    const __VLS_25 = {
        onSelectHistory: (...[$event]) => {
            if (!(__VLS_ctx.showEntry))
                return;
            __VLS_ctx.entryName = $event;
        }
    };
    var __VLS_17;
}
else if (__VLS_ctx.showModeLobby) {
    /** @type {[typeof LobbyPage, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(LobbyPage, new LobbyPage({
        ...{ 'onOpenRules': {} },
        ...{ 'onStart': {} },
        ...{ 'onSelectMode': {} },
        ...{ 'onCopyInvite': {} },
        ...{ 'onClaimSeat': {} },
        ...{ 'onAddBot': {} },
        ...{ 'onUpdateBot': {} },
        ...{ 'onRemoveSeat': {} },
        kicker: (__VLS_ctx.isWaiting ? '房间页' : '大厅页'),
        title: (__VLS_ctx.lobbyTitle),
        subtitle: (__VLS_ctx.lobbySubtitle),
        modes: (__VLS_ctx.state ? [] : __VLS_ctx.lobbyModes),
        selectedMode: (__VLS_ctx.selectedLobbyMode),
        canStart: (__VLS_ctx.canStartSelectedMode),
        startLabel: (__VLS_ctx.lobbyStartLabel),
        startHint: (__VLS_ctx.lobbyStartHint),
        joinError: (__VLS_ctx.joinError),
        hostPlayerId: (__VLS_ctx.state?.hostPlayerId || ''),
        mySeatId: (__VLS_ctx.mySeatId),
        isHost: (__VLS_ctx.isHost),
        roomId: (__VLS_ctx.activeRoomId),
        roomMode: (__VLS_ctx.state?.roomMode || ''),
        players: (__VLS_ctx.players),
    }));
    const __VLS_27 = __VLS_26({
        ...{ 'onOpenRules': {} },
        ...{ 'onStart': {} },
        ...{ 'onSelectMode': {} },
        ...{ 'onCopyInvite': {} },
        ...{ 'onClaimSeat': {} },
        ...{ 'onAddBot': {} },
        ...{ 'onUpdateBot': {} },
        ...{ 'onRemoveSeat': {} },
        kicker: (__VLS_ctx.isWaiting ? '房间页' : '大厅页'),
        title: (__VLS_ctx.lobbyTitle),
        subtitle: (__VLS_ctx.lobbySubtitle),
        modes: (__VLS_ctx.state ? [] : __VLS_ctx.lobbyModes),
        selectedMode: (__VLS_ctx.selectedLobbyMode),
        canStart: (__VLS_ctx.canStartSelectedMode),
        startLabel: (__VLS_ctx.lobbyStartLabel),
        startHint: (__VLS_ctx.lobbyStartHint),
        joinError: (__VLS_ctx.joinError),
        hostPlayerId: (__VLS_ctx.state?.hostPlayerId || ''),
        mySeatId: (__VLS_ctx.mySeatId),
        isHost: (__VLS_ctx.isHost),
        roomId: (__VLS_ctx.activeRoomId),
        roomMode: (__VLS_ctx.state?.roomMode || ''),
        players: (__VLS_ctx.players),
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    let __VLS_29;
    let __VLS_30;
    let __VLS_31;
    const __VLS_32 = {
        onOpenRules: (...[$event]) => {
            if (!!(__VLS_ctx.showEntry))
                return;
            if (!(__VLS_ctx.showModeLobby))
                return;
            __VLS_ctx.showRules = true;
        }
    };
    const __VLS_33 = {
        onStart: (__VLS_ctx.startSelectedMode)
    };
    const __VLS_34 = {
        onSelectMode: (...[$event]) => {
            if (!!(__VLS_ctx.showEntry))
                return;
            if (!(__VLS_ctx.showModeLobby))
                return;
            __VLS_ctx.selectedLobbyMode = $event;
        }
    };
    const __VLS_35 = {
        onCopyInvite: (__VLS_ctx.copyInviteLink)
    };
    const __VLS_36 = {
        onClaimSeat: (__VLS_ctx.claimSeat)
    };
    const __VLS_37 = {
        onAddBot: (...[$event]) => {
            if (!!(__VLS_ctx.showEntry))
                return;
            if (!(__VLS_ctx.showModeLobby))
                return;
            __VLS_ctx.addBot($event, 50);
        }
    };
    const __VLS_38 = {
        onUpdateBot: (__VLS_ctx.updateBot)
    };
    const __VLS_39 = {
        onRemoveSeat: (__VLS_ctx.removeSeat)
    };
    var __VLS_28;
}
else if (__VLS_ctx.showSyncingScreen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "sync-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sync-card" },
        'data-testid': "resume-session-screen",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sync-message" },
        role: "status",
        'aria-live': "polite",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "entry-kicker" },
    });
    (__VLS_ctx.connectionState === 'offline' ? '等待网络' : '恢复牌局');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    (__VLS_ctx.connectionState === 'offline' ? '联网后会自动继续' : '正在回到原来的牌桌');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "entry-desc" },
    });
    (__VLS_ctx.connectionState === 'offline'
        ? '你的座位和身份凭证仍保存在这台设备上，无需重新输入昵称。'
        : '正在使用这台设备保存的房间身份恢复座位和手牌，请稍候。');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.abandonSessionResume) },
        ...{ class: "resume-cancel" },
        type: "button",
        'data-testid': "cancel-session-resume",
    });
}
else {
    /** @type {[typeof GameBoard, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(GameBoard, new GameBoard({
        ...{ 'onDiscardCard': {} },
        ...{ 'onSubmitAction': {} },
        ...{ 'onSelectionChange': {} },
        state: (__VLS_ctx.state),
        players: (__VLS_ctx.players),
        privateHand: (__VLS_ctx.privateHand),
        mySeatId: (__VLS_ctx.mySeatId),
        canDiscard: (__VLS_ctx.canDiscard),
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
        turnHint: (__VLS_ctx.turnHint),
        ultraCompact: (__VLS_ctx.isUltraCompactViewport),
        ownCardMode: (__VLS_ctx.resolvedOwnCardMode),
        tableCardMode: (__VLS_ctx.resolvedTableCardMode),
        seatDirection: (__VLS_ctx.displayPreferences.seatDirection),
        selectionMode: (__VLS_ctx.selectionMode),
        selectedCandidateId: (__VLS_ctx.selectedCandidateId),
        activeCandidates: (__VLS_ctx.activeCandidates),
    }));
    const __VLS_41 = __VLS_40({
        ...{ 'onDiscardCard': {} },
        ...{ 'onSubmitAction': {} },
        ...{ 'onSelectionChange': {} },
        state: (__VLS_ctx.state),
        players: (__VLS_ctx.players),
        privateHand: (__VLS_ctx.privateHand),
        mySeatId: (__VLS_ctx.mySeatId),
        canDiscard: (__VLS_ctx.canDiscard),
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
        turnHint: (__VLS_ctx.turnHint),
        ultraCompact: (__VLS_ctx.isUltraCompactViewport),
        ownCardMode: (__VLS_ctx.resolvedOwnCardMode),
        tableCardMode: (__VLS_ctx.resolvedTableCardMode),
        seatDirection: (__VLS_ctx.displayPreferences.seatDirection),
        selectionMode: (__VLS_ctx.selectionMode),
        selectedCandidateId: (__VLS_ctx.selectedCandidateId),
        activeCandidates: (__VLS_ctx.activeCandidates),
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    let __VLS_43;
    let __VLS_44;
    let __VLS_45;
    const __VLS_46 = {
        onDiscardCard: (__VLS_ctx.sendDiscardCard)
    };
    const __VLS_47 = {
        onSubmitAction: (__VLS_ctx.onPanelSubmit)
    };
    const __VLS_48 = {
        onSelectionChange: (__VLS_ctx.onPanelSelectionChange)
    };
    var __VLS_42;
}
if (__VLS_ctx.isPlaying && __VLS_ctx.selectionMode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "candidate-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "candidate-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "candidate-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    (__VLS_ctx.actionText(__VLS_ctx.selectionMode));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearSelection) },
        ...{ class: "ghost" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "candidate-desc" },
    });
    (__VLS_ctx.candidatePromptText);
    if (__VLS_ctx.activeCandidates.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "candidate-list" },
        });
        for (const [candidate, index] of __VLS_getVForSourceType((__VLS_ctx.activeCandidates))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isPlaying && __VLS_ctx.selectionMode))
                            return;
                        if (!(__VLS_ctx.activeCandidates.length))
                            return;
                        __VLS_ctx.submitCandidate(candidate.id);
                    } },
                key: (candidate.id),
                ...{ class: "candidate-item" },
                ...{ class: ({ selected: __VLS_ctx.selectedCandidateId === candidate.id }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "candidate-title" },
            });
            (index + 1);
            (candidate.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "candidate-cards-preview" },
            });
            if (__VLS_ctx.candidateTargetCard) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "preview-col target" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_49 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    card: (__VLS_ctx.candidateTargetCard),
                    size: "sm",
                    mode: (__VLS_ctx.resolvedTableCardMode),
                }));
                const __VLS_50 = __VLS_49({
                    card: (__VLS_ctx.candidateTargetCard),
                    size: "sm",
                    mode: (__VLS_ctx.resolvedTableCardMode),
                }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "preview-col group" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            if (__VLS_ctx.candidateGroupCards(candidate).length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "preview-cards" },
                });
                for (const [card] of __VLS_getVForSourceType((__VLS_ctx.candidateGroupCards(candidate)))) {
                    /** @type {[typeof CardComp, ]} */ ;
                    // @ts-ignore
                    const __VLS_52 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`cand-${candidate.id}-${card.id}`),
                        card: (card),
                        size: "sm",
                        mode: (__VLS_ctx.resolvedOwnCardMode),
                    }));
                    const __VLS_53 = __VLS_52({
                        key: (`cand-${candidate.id}-${card.id}`),
                        card: (card),
                        size: "sm",
                        mode: (__VLS_ctx.resolvedOwnCardMode),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
                }
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                    ...{ class: "candidate-raw" },
                });
                (candidate.cardIds.join("、") || "无需手牌");
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (__VLS_ctx.candidateSourceText(candidate.source));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "candidate-empty" },
        });
    }
}
if (__VLS_ctx.shouldShowDeclarePanel) {
    /** @type {[typeof DeclarationPanel, ]} */ ;
    // @ts-ignore
    const __VLS_55 = __VLS_asFunctionalComponent(DeclarationPanel, new DeclarationPanel({
        ...{ 'onSubmit': {} },
        hand: (__VLS_ctx.privateHand),
        submitted: (__VLS_ctx.isDeclareSubmitted),
        secondsLeft: (__VLS_ctx.declareSecondsLeft),
        progressPercent: (__VLS_ctx.declareProgressPercent),
        serverError: (__VLS_ctx.declareError),
        compact: (__VLS_ctx.isCompactViewport),
        ultraCompact: (__VLS_ctx.isUltraCompactViewport),
        cardMode: (__VLS_ctx.resolvedOwnCardMode),
    }));
    const __VLS_56 = __VLS_55({
        ...{ 'onSubmit': {} },
        hand: (__VLS_ctx.privateHand),
        submitted: (__VLS_ctx.isDeclareSubmitted),
        secondsLeft: (__VLS_ctx.declareSecondsLeft),
        progressPercent: (__VLS_ctx.declareProgressPercent),
        serverError: (__VLS_ctx.declareError),
        compact: (__VLS_ctx.isCompactViewport),
        ultraCompact: (__VLS_ctx.isUltraCompactViewport),
        cardMode: (__VLS_ctx.resolvedOwnCardMode),
    }, ...__VLS_functionalComponentArgsRest(__VLS_55));
    let __VLS_58;
    let __VLS_59;
    let __VLS_60;
    const __VLS_61 = {
        onSubmit: (__VLS_ctx.submitDeclaration)
    };
    var __VLS_57;
}
if (__VLS_ctx.showEndPanel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hu-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hu-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    (__VLS_ctx.endPanelTitle);
    if (__VLS_ctx.derivedWinnerId) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.winnerName);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.endSummary);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.state?.lastAction || "-");
    }
    if (__VLS_ctx.roundDealerCard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "end-global-info" },
        });
        (__VLS_ctx.cardLabel(__VLS_ctx.roundDealerCard));
    }
    if (__VLS_ctx.winnerSettlementPlayer && __VLS_ctx.huCalculationLines.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "settlement scoring-explain" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "score-formula" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.winnerSettlementPlayer.name);
        (__VLS_ctx.winnerSettlementPlayer.huType === "big" ? "大胡" : "小胡");
        (__VLS_ctx.signedScore(__VLS_ctx.winnerPerOpponentScore));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
        for (const [line] of __VLS_getVForSourceType((__VLS_ctx.huCalculationLines))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (`hu-calc-${line.key}`),
            });
            (line.label);
            (__VLS_ctx.signedScore(line.unit));
        }
    }
    if (__VLS_ctx.remainingDeckPreview.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "settlement remaining-deck" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        (__VLS_ctx.remainingDeckPreview.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "settlement-cards" },
        });
        for (const [card] of __VLS_getVForSourceType((__VLS_ctx.remainingDeckPreview))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_62 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`remain-${card.id}`),
                card: (card),
                size: "sm",
                mode: (__VLS_ctx.resolvedTableCardMode),
            }));
            const __VLS_63 = __VLS_62({
                key: (`remain-${card.id}`),
                card: (card),
                size: "sm",
                mode: (__VLS_ctx.resolvedTableCardMode),
            }, ...__VLS_functionalComponentArgsRest(__VLS_62));
        }
    }
    if (__VLS_ctx.settlementPlayers.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "settlement" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "settlement-list" },
        });
        for (const [p] of __VLS_getVForSourceType((__VLS_ctx.settlementPlayers))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`settle-${p.clientId}`),
                ...{ class: "settlement-item" },
                ...{ class: ({ winner: __VLS_ctx.isSettlementWinner(p) }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "settlement-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "settlement-name" },
            });
            (p.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "settlement-meta" },
            });
            (p.hand.length);
            (__VLS_ctx.settlementGroupBlocks(p).length);
            (p.discardCount);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "score-total" },
                ...{ class: (__VLS_ctx.scoreToneClass(p.totalScore)) },
            });
            (__VLS_ctx.signedScore(p.totalScore));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "settlement-zone" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "zone-title" },
            });
            if (__VLS_ctx.settlementGroupBlocks(p).length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "settlement-group-list" },
                });
                for (const [group] of __VLS_getVForSourceType((__VLS_ctx.settlementGroupBlocks(p)))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (`settle-group-${p.clientId}-${group.id}`),
                        ...{ class: "settlement-group" },
                        ...{ class: (group.tone) },
                    });
                    if (group.badge) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "settlement-group-badge" },
                        });
                        (group.badge);
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "settlement-cards compact" },
                    });
                    for (const [card] of __VLS_getVForSourceType((group.cards))) {
                        /** @type {[typeof CardComp, ]} */ ;
                        // @ts-ignore
                        const __VLS_65 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                            mode: (__VLS_ctx.resolvedTableCardMode),
                        }));
                        const __VLS_66 = __VLS_65({
                            key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                            mode: (__VLS_ctx.resolvedTableCardMode),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
                    }
                }
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "settlement-empty" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "settlement-zone" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "zone-title" },
            });
            if (__VLS_ctx.settlementHandBlocks(p).length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "settlement-group-list" },
                });
                for (const [group] of __VLS_getVForSourceType((__VLS_ctx.settlementHandBlocks(p)))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (`settle-hand-${p.clientId}-${group.id}`),
                        ...{ class: "settlement-group" },
                        ...{ class: (group.tone) },
                    });
                    if (group.badge) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "settlement-group-badge" },
                        });
                        (group.badge);
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "settlement-cards compact" },
                    });
                    for (const [card] of __VLS_getVForSourceType((group.cards))) {
                        /** @type {[typeof CardComp, ]} */ ;
                        // @ts-ignore
                        const __VLS_68 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                            mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                        }));
                        const __VLS_69 = __VLS_68({
                            key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                            mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_68));
                    }
                }
            }
            else if (p.hand.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "settlement-cards" },
                });
                for (const [card] of __VLS_getVForSourceType((p.hand))) {
                    /** @type {[typeof CardComp, ]} */ ;
                    // @ts-ignore
                    const __VLS_71 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                        mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                    }));
                    const __VLS_72 = __VLS_71({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                        mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_71));
                }
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "settlement-empty" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "score-breakdown" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "zone-title" },
            });
            if (!__VLS_ctx.settlementScoreLines(p).length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "settlement-empty" },
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
                for (const [line] of __VLS_getVForSourceType((__VLS_ctx.settlementScoreLines(p)))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                        key: (`score-${p.clientId}-${line.key}`),
                    });
                    (line.label);
                    (__VLS_ctx.signedScore(line.total));
                }
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "end-actions" },
    });
    if (__VLS_ctx.isHost) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.nextRound) },
            ...{ class: "primary" },
            disabled: (!__VLS_ctx.isEnded),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.returnLobby) },
            ...{ class: "ghost" },
            disabled: (!__VLS_ctx.isEnded),
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "host-actions-hint" },
        });
    }
}
if (__VLS_ctx.showRules) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showRules))
                    return;
                __VLS_ctx.showRules = false;
            } },
        ...{ class: "rules-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rules-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rules-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "rules-kicker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "rules-slogan" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showRules))
                    return;
                __VLS_ctx.showRules = false;
            } },
        ...{ class: "ghost" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "rules-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rules-chip-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rules-chip" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rules-chip" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rules-chip" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rules-chip" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "rules-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "rules-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "rules-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "rules-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "rules-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "rules-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "rules-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "rules-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "rules-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
}
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-lockup']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['top-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['global-error']} */ ;
/** @type {__VLS_StyleScopedClasses['global-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-message']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['resume-cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-head']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-list']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-item']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-title']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-cards-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-col']} */ ;
/** @type {__VLS_StyleScopedClasses['target']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-col']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-raw']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['end-global-info']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['scoring-explain']} */ ;
/** @type {__VLS_StyleScopedClasses['score-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['remaining-deck']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-name']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group-list']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group-list']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['score-breakdown']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['host-actions-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-chip-list']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CardComp: CardComp,
            ConnectionStatus: ConnectionStatus,
            DeclarationPanel: DeclarationPanel,
            GameBoard: GameBoard,
            GameTools: GameTools,
            LobbyPage: LobbyPage,
            LoginPage: LoginPage,
            connectionState: connectionState,
            reconnectAttempt: reconnectAttempt,
            retryConnection: retryConnection,
            mySeatId: mySeatId,
            activeRoomId: activeRoomId,
            state: state,
            players: players,
            privateHand: privateHand,
            availableActions: availableActions,
            joinError: joinError,
            declareError: declareError,
            sendDiscardCard: sendDiscardCard,
            nextRound: nextRound,
            returnLobby: returnLobby,
            claimSeat: claimSeat,
            addBot: addBot,
            updateBot: updateBot,
            removeSeat: removeSeat,
            entryName: entryName,
            nicknameHistory: nicknameHistory,
            enteringLobby: enteringLobby,
            selectedLobbyMode: selectedLobbyMode,
            lobbyModes: lobbyModes,
            abandonSessionResume: abandonSessionResume,
            isWaiting: isWaiting,
            isPlaying: isPlaying,
            isEnded: isEnded,
            isHost: isHost,
            hasLobbySession: hasLobbySession,
            isConnectingWithoutState: isConnectingWithoutState,
            showEntry: showEntry,
            showSyncingScreen: showSyncingScreen,
            showModeLobby: showModeLobby,
            showGameTools: showGameTools,
            canStartSelectedMode: canStartSelectedMode,
            lobbyTitle: lobbyTitle,
            lobbySubtitle: lobbySubtitle,
            lobbyStartLabel: lobbyStartLabel,
            lobbyStartHint: lobbyStartHint,
            hasFriendInvite: hasFriendInvite,
            entryPrimaryLabel: entryPrimaryLabel,
            isMyTurn: isMyTurn,
            canAct: canAct,
            canDiscard: canDiscard,
            selectionMode: selectionMode,
            selectedCandidateId: selectedCandidateId,
            activeCandidates: activeCandidates,
            candidateTargetCard: candidateTargetCard,
            candidatePromptText: candidatePromptText,
            effectiveHeight: effectiveHeight,
            effectiveWidth: effectiveWidth,
            isCompactViewport: isCompactViewport,
            isRotatedPhonePortrait: isRotatedPhonePortrait,
            isUltraCompactViewport: isUltraCompactViewport,
            displayPreferences: displayPreferences,
            resolvedOwnCardMode: resolvedOwnCardMode,
            resolvedTableCardMode: resolvedTableCardMode,
            globalError: globalError,
            globalNotice: globalNotice,
            showRules: showRules,
            showEndPanel: showEndPanel,
            isDeclareSubmitted: isDeclareSubmitted,
            shouldShowDeclarePanel: shouldShowDeclarePanel,
            settingsDecisionActive: settingsDecisionActive,
            declareSecondsLeft: declareSecondsLeft,
            declareProgressPercent: declareProgressPercent,
            clearSelection: clearSelection,
            handleLeaveRoom: handleLeaveRoom,
            onPanelSelectionChange: onPanelSelectionChange,
            onPanelSubmit: onPanelSubmit,
            submitCandidate: submitCandidate,
            actionText: actionText,
            candidateSourceText: candidateSourceText,
            cardLabel: cardLabel,
            candidateGroupCards: candidateGroupCards,
            submitDeclaration: submitDeclaration,
            endPanelTitle: endPanelTitle,
            derivedWinnerId: derivedWinnerId,
            winnerName: winnerName,
            settlementPlayers: settlementPlayers,
            remainingDeckPreview: remainingDeckPreview,
            settlementGroupBlocks: settlementGroupBlocks,
            settlementHandBlocks: settlementHandBlocks,
            signedScore: signedScore,
            scoreToneClass: scoreToneClass,
            isSettlementWinner: isSettlementWinner,
            settlementHandCardMode: settlementHandCardMode,
            winnerSettlementPlayer: winnerSettlementPlayer,
            huCalculationLines: huCalculationLines,
            winnerPerOpponentScore: winnerPerOpponentScore,
            settlementScoreLines: settlementScoreLines,
            endSummary: endSummary,
            turnHint: turnHint,
            currentPlayerName: currentPlayerName,
            roundDealerCard: roundDealerCard,
            enterLobby: enterLobby,
            randomizeNickname: randomizeNickname,
            startSelectedMode: startSelectedMode,
            copyInviteLink: copyInviteLink,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
