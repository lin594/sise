import LoginPage from "./components/LoginPage.vue";
import ContextHint from "./components/ContextHint.vue";
import { useContextHints } from "./composables/useContextHints";
import TutorialGuide from "./components/TutorialGuide.vue";
import { openProductSession, beginProductMode, readyProductMode, failProductMode, trackProductEvent, productVisitId } from "@/utils/productAnalytics";
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import CardComp from "@/components/Card.vue";
import PlayerStatusIcon from "@/components/PlayerStatusIcon.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import RulesGuide from "@/components/RulesGuide.vue";
import DeclarationPanel from "@/components/DeclarationPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import GameTools from "@/components/GameTools.vue";
import InviteLinkFallbackDialog from "@/components/InviteLinkFallbackDialog.vue";
import LobbyPage from "@/components/LobbyPage.vue";
import NicknameDialog from "@/components/NicknameDialog.vue";
import PwaInstallDialog from "@/components/PwaInstallDialog.vue";
import { usePwaInstall } from "@/composables/usePwaInstall";
import { sessionAudioMuted } from "@/composables/sessionAudio";
import { useResponsiveViewport } from "@/composables/useResponsiveViewport";
import { useRoom } from "@/composables/useRoom";
import { useGuestProfile } from "@/composables/useGuestProfile";
import { isScreenWakeLockSupported, useScreenWakeLock } from "@/composables/useScreenWakeLock";
import { useTurnAlert } from "@/composables/useTurnAlert";
import { BACKEND_HTTP_URL } from "@/config/backend";
import { visibleDecisionEndsAt } from "@/utils/decisionClock";
import { apiErrorMessage } from "@/utils/http";
import { isPrivateHandSynchronized } from "@/utils/privateHandReadiness";
import { normalizeSkin, normalizeTableLayout, resolveTableLayout } from "@/utils/appearance";
import { hasPersistentBrowserStorage, readStoredValue, writeStoredValue } from "@/utils/safeStorage";
import { getCardLabelText } from "@/utils/cardText";
import { getDisplayedTurnPlayerId, getRoundKey } from "@/utils/gameFlowPresentation";
const FriendInviteQrDialog = defineAsyncComponent(() => import("@/components/FriendInviteQrDialog.vue"));
const HTTP_URL = BACKEND_HTTP_URL;
const DISPLAY_PREFERENCES_KEY = "sise_game_display_preferences_v2";
const LEGACY_TABLE_CARD_MODE_KEY = "sise_table_card_mode";
const browserStoragePersistent = hasPersistentBrowserStorage();
const { canOfferInstall: canOfferPwaInstall, requestInstall: installPwa } = usePwaInstall();
const pwaInstallGuide = ref(null);
let pwaInstallReturnFocus = null;
async function requestPwaInstall() {
    if (!canOfferPwaInstall.value)
        return;
    pwaInstallReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
        const result = await installPwa();
        if (result.kind === "guide") {
            pwaInstallGuide.value = result.guide;
            return;
        }
        if (result.kind === "accepted") {
            globalError.value = "";
            showGlobalNotice("四色牌已安装，可以从桌面直接打开");
        }
    }
    catch {
        globalError.value = "暂时无法打开安装提示，请从浏览器菜单选择“安装应用”或“添加到主屏幕”。";
    }
}
function closePwaInstallGuide(restoreFocus = true) {
    if (!pwaInstallGuide.value)
        return;
    pwaInstallGuide.value = null;
    decisionControlFocusPending = false;
    if (!restoreFocus) {
        pwaInstallReturnFocus = null;
        return;
    }
    void nextTick(() => {
        window.requestAnimationFrame(() => {
            const returnTarget = pwaInstallReturnFocus?.isConnected
                && !pwaInstallReturnFocus.closest("[data-testid='settings-panel']")
                ? pwaInstallReturnFocus
                : document.querySelector("[data-testid='game-settings']")
                    ?? document.querySelector("[data-testid='pwa-install-entry']");
            returnTarget?.focus({ preventScroll: true });
            pwaInstallReturnFocus = null;
        });
    });
}
function normalizeCardDisplayMode(value) {
    return value === "large" || value === "adaptive" || value === "long" ? value : null;
}
function normalizeTurnAlertMode(value) {
    return value === "sound" || value === "off" || value === "sound-vibration" ? value : "sound-vibration";
}
function readDisplayPreferences() {
    try {
        const stored = readStoredValue(DISPLAY_PREFERENCES_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                skin: normalizeSkin(parsed.skin),
                tableLayout: normalizeTableLayout(parsed.tableLayout),
                handLayout: parsed.handLayout === "paged" ? "paged" : "single",
                ownCards: normalizeCardDisplayMode(parsed.ownCards) ?? "adaptive",
                tableCards: normalizeCardDisplayMode(parsed.tableCards) ?? "adaptive",
                seatDirection: parsed.seatDirection === "clockwise" ? "clockwise" : "counterclockwise",
                turnAlert: normalizeTurnAlertMode(parsed.turnAlert),
                spokenTurnGuidance: parsed.spokenTurnGuidance === true,
                showCardColorAssist: parsed.showCardColorAssist === true,
                reduceMotion: parsed.reduceMotion === true,
                keepScreenAwake: parsed.keepScreenAwake !== false,
            };
        }
    }
    catch {
        // Invalid local preferences fall back to the compatible defaults below.
    }
    const legacyMode = readStoredValue(LEGACY_TABLE_CARD_MODE_KEY);
    return {
        skin: normalizeSkin(null),
        tableLayout: normalizeTableLayout(null),
        handLayout: "single",
        ownCards: "adaptive",
        tableCards: legacyMode === "simple" ? "large" : legacyMode === "full" ? "long" : "adaptive",
        seatDirection: "counterclockwise",
        turnAlert: "sound-vibration",
        spokenTurnGuidance: false,
        showCardColorAssist: false,
        reduceMotion: false,
        keepScreenAwake: true,
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
        const raw = readStoredValue("sise_entry_name_history") || "[]";
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
    writeStoredValue("sise_entry_name_history", JSON.stringify(names.slice(0, 8)));
}
const { profile: guestProfile, refresh: refreshGuestProfile, refreshAfterSettlement: refreshGuestProfileAfterSettlement, updateNickname: updateGuestProfileNickname, } = useGuestProfile();
void refreshGuestProfile();
const { connect, connected, connectionState, reconnectAttempt, retryConnection, mySeatId, activeRoomId, state, players, privateHand, acceptedStateRevision, listeningHints, quickPhrase, quickPhraseMuted, availableActions, huResult, roundResult, debugApplied, joinError, declareError, actionLogs, actionFeedback, matchClockSync, decisionTimer, clearActionLogs, debugSetup, tutorial, sendTutorialCommand, sendAction, sendDiscardCard, declareFish, declareKongs, startGame, nextRound, returnLobby, dissolveRoom, setScoringMode, setLobbyReady, setAutoPlay, debugApplyRoomSnapshot, leaveRoom, claimSeat, addBot, fillBots, updateBot, removeSeat, sendQuickPhrase, setQuickPhraseMuted, } = useRoom("玩家");
const guestProfileSummary = computed(() => {
    if (!browserStoragePersistent)
        return "";
    const current = guestProfile.value;
    if (!current)
        return "";
    return current.roundsPlayed > 0
        ? `已玩 ${current.roundsPlayed} 局 · 胡 ${current.huWins} 局`
        : "还没有完成牌局";
});
const localTestPrivateHandReadyOverride = ref(null);
const localTestListeningHintsOverride = ref(null);
const boardListeningHints = computed(() => {
    const override = localTestListeningHintsOverride.value;
    if (!override || override.decisionKey !== decisionTimer.value.decisionKey)
        return listeningHints.value;
    // Local layout fixtures must not invent authoritative revisions or race
    // real private-state recovery. Their lifetime is one real decision only.
    return { ...override, stateRevision: acceptedStateRevision.value };
});
watch(() => decisionTimer.value.decisionKey, () => { localTestListeningHintsOverride.value = null; });
function installLocalTestBridge() {
    const query = new URLSearchParams(window.location.search);
    const localHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
    if (!localHost || query.get("e2eDebug") !== "1") {
        return;
    }
    window.__siseLocalTest = {
        setupScenario: (scenario) => debugSetup(scenario),
        getLastResult: () => debugApplied.value,
        submitAction: (request) => sendAction(request),
        applyRoomSnapshot: (patch, source) => debugApplyRoomSnapshot(patch, source),
        getRoomState: () => state.value,
        getRoundResult: () => roundResult.value,
        getDecisionTimer: () => decisionTimer.value,
        getDeferredChiDebug: () => ({ intent: pendingDeferredChiIntent.value, actions: availableActions.value, handReady: privateHandSynchronized.value, feedback: actionFeedback.value, stateRevision: acceptedStateRevision.value }),
        setPrivateHandReadyOverride: (ready) => {
            localTestPrivateHandReadyOverride.value = ready;
        },
        setListeningHintsOverride: (hints) => {
            localTestListeningHintsOverride.value = hints;
        },
    };
}
function removeLocalTestBridge() {
    localTestPrivateHandReadyOverride.value = null;
    delete window.__siseLocalTest;
}
const ENTRY_NAME_KEY = "sise_entry_name";
const ENTRY_HISTORY_KEY = "sise_entry_name_history";
const storedEntryNameAtBoot = readStoredValue(ENTRY_NAME_KEY).trim();
const nicknameHistoryAtBoot = readNicknameHistory();
const entryName = ref(storedEntryNameAtBoot);
const nicknameHistory = ref(nicknameHistoryAtBoot);
const entryInviteRoomId = ref(new URLSearchParams(window.location.search).get("roomId")?.trim() || "");
const enteringLobby = ref(false);
const enteredFrontLobby = ref(false);
const restoringStoredSession = ref(false);
const joiningFriendInvite = ref(false);
const startingRoomMode = ref(null);
const pendingPracticeAutoStart = ref(false);
const roundStartPending = ref(false);
let roundStartReceiptTimer = null;
const seatClaimPending = ref(null);
let seatClaimReceiptTimer = null;
const lobbyReadyPending = ref(null);
let lobbyReadyReceiptTimer = null;
const selectedLobbyMode = ref("practice_bots");
watch(state, (nextState) => {
    if (nextState && startingRoomMode.value !== null) {
        startingRoomMode.value = null;
    }
});
const lobbyModes = [
    {
        id: "practice_bots",
        name: "单人练习",
        description: "系统补 3 位电脑，马上开一局。适合第一次玩和熟悉规则。",
        badge: "推荐新手",
        enabled: true,
    },
    {
        id: "quick_match",
        name: "快速配桌",
        description: "先等真人牌友；人数不足时电脑自动补位，不会一直空等。",
        badge: "一键开桌",
        enabled: true,
    },
    {
        id: "friends",
        name: "好友同桌",
        description: "创建房间，把链接发给朋友；空位也可以添加电脑。",
        badge: "邀请朋友",
        enabled: true,
    },
];
function readBrowserStorage(key) {
    return readStoredValue(key).trim();
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
async function bootstrapRoomEntry() {
    const storedSession = readStoredRoomSession();
    if (storedSession) {
        await resumeStoredRoomSession();
        return;
    }
    entryName.value = entryName.value.trim() || nicknameHistory.value[0] || generateRandomNickname();
    if (entryInviteRoomId.value && !storedEntryNameAtBoot && nicknameHistoryAtBoot.length === 0)
        return;
    await enterLobby();
}
async function returnToModeSelectionFromRoom() {
    const departingRoomId = entryInviteRoomId.value || activeRoomId.value;
    restoringStoredSession.value = false;
    joiningFriendInvite.value = false;
    startingRoomMode.value = null;
    entryInviteRoomId.value = "";
    enteringLobby.value = false;
    globalError.value = "";
    await leaveRoom(departingRoomId);
    enteredFrontLobby.value = true;
    await nextTick();
    document.querySelector("[data-testid='mode-practice_bots']")?.focus();
}
const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const mePlayer = computed(() => players.value.find((player) => player.clientId === mySeatId.value) ?? null);
const hasLobbySession = computed(() => Boolean(connected.value || state.value || mySeatId.value));
const isConnectingWithoutState = computed(() => !state.value &&
    enteredFrontLobby.value &&
    (restoringStoredSession.value ||
        connectionState.value === "connecting" ||
        connectionState.value === "reconnecting" ||
        connectionState.value === "retry_wait" ||
        connectionState.value === "offline" ||
        connectionState.value === "closed"));
const showEntry = computed(() => !enteredFrontLobby.value && !hasLobbySession.value);
const showSyncingScreen = computed(() => !state.value && (hasLobbySession.value || isConnectingWithoutState.value));
const syncCanRetry = computed(() => connectionState.value === "retry_wait" || connectionState.value === "failed");
const syncScreenCopy = computed(() => {
    if (connectionState.value === "closed" && entryInviteRoomId.value) {
        const practiceRoomRejected = joinError.value.includes("单人练习房");
        return {
            kicker: practiceRoomRejected ? "链接不可用" : "邀请已失效",
            title: practiceRoomRejected ? "这个练习房不能加入" : "这个好友房已经关闭",
            description: joinError.value || "房间已经结束或被回收，请返回玩法选择重新开始。",
            cancelLabel: "返回玩法选择",
        };
    }
    if (joiningFriendInvite.value) {
        return {
            kicker: "加入好友房",
            title: "正在进入朋友的牌桌",
            description: "正在连接房间，请稍候。请不要重复点击。",
            cancelLabel: "取消加入，返回玩法选择",
        };
    }
    if (entryInviteRoomId.value) {
        if (connectionState.value === "offline") {
            return {
                kicker: "等待网络",
                title: "联网后继续加入好友房",
                description: "邀请和昵称仍然保留；网络恢复后系统会自动继续。",
                cancelLabel: "放弃加入，返回玩法选择",
            };
        }
        return {
            kicker: "暂时未连上",
            title: "正在重新连接好友房",
            description: joinError.value || "系统会继续重试，你也可以立即重试或返回玩法选择。",
            cancelLabel: "放弃加入，返回玩法选择",
        };
    }
    if (startingRoomMode.value === "quick_match") {
        return {
            kicker: "快速配桌",
            title: "正在寻找牌友",
            description: "正在连接配桌服务，请稍候。",
            cancelLabel: "取消，返回玩法选择",
        };
    }
    if (startingRoomMode.value === "practice") {
        return {
            kicker: "单人练习",
            title: "正在准备练习牌桌",
            description: "正在连接牌桌，请稍候。",
            cancelLabel: "取消，返回玩法选择",
        };
    }
    if (startingRoomMode.value === "friends") {
        return {
            kicker: "好友同桌",
            title: "正在创建好友房",
            description: "正在连接牌桌，请稍候。",
            cancelLabel: "取消，返回玩法选择",
        };
    }
    if (connectionState.value === "closed") {
        return {
            kicker: "原牌局已关闭",
            title: "无法回到原来的牌桌",
            description: joinError.value || "原牌局已经结束，系统不会继续重试。",
            cancelLabel: "清除旧牌局并返回玩法选择",
        };
    }
    if (connectionState.value === "offline") {
        return {
            kicker: "等待网络",
            title: "联网后会自动继续",
            description: "你的座位和身份凭证仍保存在这台设备上，无需重新输入昵称。",
            cancelLabel: "放弃恢复，返回玩法选择",
        };
    }
    return {
        kicker: "恢复牌局",
        title: "正在回到原来的牌桌",
        description: "正在使用这台设备保存的房间身份恢复座位和手牌，请稍候。",
        cancelLabel: "放弃恢复，返回玩法选择",
    };
});
const syncCancelDialogCopy = computed(() => {
    if (startingRoomMode.value !== null) {
        return {
            title: "取消正在开始的玩法？",
            description: "牌桌仍在连接中。确认取消后会返回玩法选择。",
            keepLabel: "继续等待",
            confirmLabel: "取消并返回玩法选择",
        };
    }
    if (joiningFriendInvite.value) {
        return {
            title: "取消加入好友房？",
            description: "房间仍在连接中。确认取消后会停止本次加入并返回玩法选择。",
            keepLabel: "继续加入",
            confirmLabel: "取消并返回玩法选择",
        };
    }
    return {
        title: "放弃恢复原牌局？",
        description: "系统正在为你找回原来的座位和手牌。确认放弃后会清除这台设备保存的房间身份并返回玩法选择。",
        keepLabel: "继续恢复",
        confirmLabel: "放弃并返回玩法选择",
    };
});
const showModeLobby = computed(() => {
    if (showSyncingScreen.value) {
        return false;
    }
    return isWaiting.value || (enteredFrontLobby.value && !state.value);
});
const showGameTools = computed(() => isDeclaring.value || isPlaying.value || isEnded.value);
const roomNavigationProtected = computed(() => hasLobbySession.value || isConnectingWithoutState.value);
const canPressStartGame = computed(() => Boolean(connected.value) &&
    Boolean(state.value) &&
    Boolean(mySeatId.value) &&
    isWaiting.value &&
    isHost.value &&
    (state.value?.roomMode === "match"
        ? players.value.every((player) => player.isConfiguredBot || player.connected)
        : state.value?.roomMode !== "friends" ||
            (players.value.length === 4 &&
                players.value.every((player) => player.isConfiguredBot ||
                    (player.connected &&
                        (player.clientId === state.value?.hostPlayerId || player.lobbyReady))))));
const canStartSelectedMode = computed(() => !enteringLobby.value &&
    !roundStartPending.value &&
    ((!hasLobbySession.value &&
        (selectedLobbyMode.value === "practice_bots" ||
            selectedLobbyMode.value === "quick_match" ||
            selectedLobbyMode.value === "friends")) ||
        canPressStartGame.value));
const remainingFriendSeats = computed(() => Math.max(0, 4 - players.value.length));
const hasOfflineFriend = computed(() => players.value.some((player) => !player.isConfiguredBot && !player.connected));
const unreadyFriendCount = computed(() => players.value.filter((player) => !player.isConfiguredBot &&
    player.clientId !== state.value?.hostPlayerId &&
    !player.lobbyReady).length);
const lobbyTitle = computed(() => {
    if (!isWaiting.value) {
        return "游戏模式选择";
    }
    if (state.value?.roomMode === "match") {
        return "正在快速配桌";
    }
    if (state.value?.roomMode !== "friends") {
        return "房间准备中";
    }
    if (!mySeatId.value) {
        return "请先选择座位";
    }
    if (hasOfflineFriend.value) {
        return "等待牌友重新上线";
    }
    if (remainingFriendSeats.value > 0) {
        return isHost.value ? `还差 ${remainingFriendSeats.value} 位即可开局` : "等待房主安排座位";
    }
    if (unreadyFriendCount.value > 0) {
        if (isHost.value) {
            return `还有 ${unreadyFriendCount.value} 位牌友未准备`;
        }
        return mePlayer.value?.lobbyReady
            ? `等待 ${unreadyFriendCount.value} 位牌友准备`
            : "请确认准备";
    }
    return isHost.value ? "四席已就绪" : "等待房主开始";
});
const lobbySubtitle = computed(() => {
    if (!isWaiting.value) {
        return "选择一种玩法。第一次玩，建议选单人练习。";
    }
    if (state.value?.roomMode === "match") {
        const humanCount = players.value.filter((player) => !player.isConfiguredBot).length;
        if (hasOfflineFriend.value) {
            return "有牌友正在恢复连接，座位会为对方暂时保留。";
        }
        return matchSecondsLeft.value > 0
            ? `已找到 ${humanCount} 位真人，${matchSecondsLeft.value} 秒后电脑补位自动开始。`
            : "正在准备开局，请稍候。";
    }
    if (state.value?.roomMode !== "friends") {
        return "正在补齐机器人并准备开始单人练习。";
    }
    if (!mySeatId.value) {
        return "请选择一个写着“等待入座”的空座位；入座后等待房主开始。";
    }
    if (isHost.value) {
        if (hasOfflineFriend.value) {
            return "有真人暂时离线；请等对方重新上线，或移出该座位后再安排电脑。";
        }
        if (remainingFriendSeats.value > 0) {
            return `把邀请链接发给朋友，或点击“补齐 ${remainingFriendSeats.value} 位电脑”后开始。`;
        }
        if (unreadyFriendCount.value > 0) {
            return `请等 ${unreadyFriendCount.value} 位真人牌友点击“我准备好了”。`;
        }
        return "四个座位都准备好了，请确认后开始好友对局。";
    }
    if (!mePlayer.value?.lobbyReady) {
        return "确认座位和设置后，请点击“我准备好了”。";
    }
    return "你已准备；等待房主开始，如需调整可取消准备。";
});
const lobbyStartLabel = computed(() => {
    if (!hasLobbySession.value) {
        if (enteringLobby.value) {
            if (selectedLobbyMode.value === "friends")
                return "正在创建好友房…";
            return selectedLobbyMode.value === "quick_match" ? "正在寻找牌友…" : "正在创建练习房…";
        }
        if (selectedLobbyMode.value === "friends")
            return "创建好友房";
        return selectedLobbyMode.value === "quick_match" ? "开始快速配桌" : "开始单人练习";
    }
    if (roundStartPending.value) {
        if (state.value?.roomMode === "match")
            return "正在补齐并开局…";
        return state.value?.roomMode === "friends" ? "正在开始好友对局…" : "正在开始练习…";
    }
    if (pendingPracticeAutoStart.value) {
        return "正在自动开始...";
    }
    if (state.value?.roomMode === "friends" && !mySeatId.value) {
        return "请先选择座位";
    }
    if (state.value?.roomMode === "match") {
        return "电脑补位，立即开始";
    }
    return isHost.value ? (state.value?.roomMode === "friends" ? "开始好友对局" : "开始单人练习") : "等待房主开始";
});
const lobbyStartHint = computed(() => {
    if (!hasLobbySession.value)
        return enteringLobby.value ? "请稍候，不用重复点击" : "";
    if (roundStartPending.value)
        return "开局请求已发送，请稍候";
    if (lobbyReadyPending.value !== null)
        return "准备状态已发送，请稍候";
    if (!isWaiting.value)
        return "";
    if (!mySeatId.value)
        return "请先选择一个空座位";
    if (state.value?.roomMode === "match") {
        if (hasOfflineFriend.value) {
            return "有牌友正在恢复连接，暂不能开始";
        }
        if (isHost.value)
            return "不想等待时，可立即补齐电脑";
        return matchSecondsLeft.value > 0
            ? `约 ${matchSecondsLeft.value} 秒后自动开始`
            : "正在准备自动开始";
    }
    if (!isHost.value)
        return mePlayer.value?.lobbyReady ? "已准备，等待房主开始" : "请先确认准备";
    if (state.value?.roomMode !== "friends")
        return "";
    if (players.value.length < 4)
        return `还差 ${4 - players.value.length} 个座位，可一键补电脑`;
    if (players.value.some((player) => !player.isConfiguredBot && !player.connected))
        return "仍有真人玩家离线";
    if (unreadyFriendCount.value > 0)
        return `还有 ${unreadyFriendCount.value} 位牌友未准备`;
    return "四席已就绪，请点开始好友对局";
});
const hasFriendInvite = computed(() => Boolean(entryInviteRoomId.value));
const nowMs = ref(Date.now());
const matchSecondsLeft = computed(() => {
    const startsAt = Number(state.value?.matchStartsAt ?? 0);
    if (startsAt <= 0 || matchClockSync.value.deadline !== startsAt) {
        return 0;
    }
    const estimatedServerNow = nowMs.value + matchClockSync.value.offsetMs;
    return Math.max(0, Math.ceil((startsAt - estimatedServerNow) / 1000));
});
watch(() => state.value?.matchStartsAt, () => {
    // Keep the first rendered second aligned with the server deadline instead of
    // reusing a timer sample that may already be almost half a second old.
    nowMs.value = Date.now();
}, { flush: "sync" });
watch(() => [matchClockSync.value.deadline, matchClockSync.value.offsetMs], () => {
    // A full snapshot can enrich the clock after its same-revision Schema
    // patch has already updated the room state. Refresh the local sample too,
    // otherwise the old sample plus the new offset can briefly add a second.
    nowMs.value = Date.now();
}, { flush: "sync" });
const displayTurnPlayerId = computed(() => {
    return getDisplayedTurnPlayerId({
        responsePhase: state.value?.responsePhase,
        pendingReceiverId: state.value?.pendingReceiverId,
        currentTurnPlayerId: state.value?.currentTurnPlayerId,
        currentPlayerId: state.value?.currentPlayerId,
        playerIds: players.value.map((player) => player.clientId),
    });
});
const isMyTurn = computed(() => {
    if (!mySeatId.value || displayTurnPlayerId.value !== mySeatId.value) {
        return false;
    }
    const me = players.value.find((x) => x.clientId === mySeatId.value);
    return !Boolean(me?.isBot || me?.isAutoPlay);
});
const openingDealActive = computed(() => isPlaying.value &&
    /^DEALER\s+\S+/.test(String(state.value?.lastAction ?? "")) &&
    Number(state.value?.responseEndsAt ?? 0) > nowMs.value);
const tablePresentationActive = computed(() => Number(state.value?.presentationUntil ?? 0) > nowMs.value + Number(state.value?.presentationClockOffsetMs ?? 0));
const currentActionSubmissionLocked = computed(() => Boolean(decisionTimer.value.decisionKey &&
    actionFeedback.value?.decisionKey === decisionTimer.value.decisionKey &&
    (actionFeedback.value.status === "pending" || actionFeedback.value.status === "received")));
const hasAvailableAction = computed(() => availableActions.value.some((action) => action.enabled || action.deferred));
const actionWindowActive = computed(() => connected.value &&
    !mePlayer.value?.isAutoPlay &&
    !openingDealActive.value &&
    !tablePresentationActive.value &&
    isPlaying.value &&
    hasAvailableAction.value &&
    !currentActionSubmissionLocked.value);
const discardWindowActive = computed(() => connected.value &&
    !mePlayer.value?.isAutoPlay &&
    !openingDealActive.value &&
    !tablePresentationActive.value &&
    isPlaying.value &&
    isMyTurn.value &&
    state.value?.responsePhase === "local_draw" &&
    !hasAvailableAction.value &&
    !currentActionSubmissionLocked.value);
const decisionAttention = computed(() => {
    if (actionWindowActive.value)
        return "action";
    if (discardWindowActive.value)
        return "discard";
    return "none";
});
const pendingActionDecision = computed(() => decisionAttention.value === "action");
const pendingDiscardDecision = computed(() => decisionAttention.value === "discard");
const privateHandSynchronized = computed(() => {
    if (localTestPrivateHandReadyOverride.value !== null) {
        return localTestPrivateHandReadyOverride.value;
    }
    return isPrivateHandSynchronized(state.value, mySeatId.value, privateHand.value.length);
});
const canAct = computed(() => pendingActionDecision.value && privateHandSynchronized.value);
const canDiscard = computed(() => pendingDiscardDecision.value && privateHandSynchronized.value);
const hintConcepts = computed(() => {
    if (tutorial.value || !connected.value || !privateHandSynchronized.value || openingDealActive.value || tablePresentationActive.value)
        return [];
    if (isDeclaring.value && !mePlayer.value?.declaredReady)
        return [mePlayer.value?.declarationStep === "fish" ? "fish" : "kan"];
    if (!isPlaying.value)
        return [];
    const concepts = [];
    for (const action of ["hu", "kai", "peng", "chi"]) {
        if (availableActions.value.some(item => item.action === action && item.enabled && !item.deferred))
            concepts.push(action);
    }
    if (availableActions.value.some(item => item.action === "pass" && item.enabled && !item.deferred))
        concepts.push(state.value?.responsePhase === "local_upper" ? "grab" : "pass");
    if (canDiscard.value && (mePlayer.value?.declaredKongs ?? 0) > 0)
        concepts.push("kan");
    if (canDiscard.value && (mePlayer.value?.generalArea?.length ?? 0) > 0)
        concepts.push("general");
    return concepts;
});
const { enabled: contextHintsEnabled, current: currentHint, text: contextHintText, dismiss: dismissContextHint, setEnabled: setContextHintsEnabled, reset: resetContextHints } = useContextHints(hintConcepts, computed(() => decisionTimer.value.decisionKey));
const interactionPausedMessage = computed(() => {
    if (connected.value) {
        if (pendingDeferredChiIntent.value)
            return "已选择吃，等待其他玩家响应";
        if (mePlayer.value?.isAutoPlay && (isDeclaring.value || isPlaying.value)) {
            return "机器人正在替你操作，可在顶部取消托管";
        }
        if (isPlaying.value &&
            (pendingActionDecision.value || pendingDiscardDecision.value) &&
            !privateHandSynchronized.value) {
            return "正在同步手牌，请稍候";
        }
        return "";
    }
    if (!isPlaying.value && !isDeclaring.value) {
        return "";
    }
    if (connectionState.value === "offline") {
        return "网络已断开，联网后自动恢复";
    }
    if (connectionState.value === "failed") {
        return "连接失败，请点上方立即重试";
    }
    if (connectionState.value === "closed") {
        return joinError.value || "原牌局已经关闭，请退出后重新开始";
    }
    if (connectionState.value === "retry_wait") {
        return "暂时未连上，系统会继续重试";
    }
    return "网络不稳定，正在恢复牌局，请稍候";
});
const pendingDeferredChiIntent = ref(null);
const pendingDeferredGrab = ref(false);
const candidateTargetCard = computed(() => {
    return (state.value?.responseCard ?? state.value?.targetCard ?? state.value?.publicDiscardPile?.[0] ?? null);
});
const isPendingSpecialCard = computed(() => {
    const card = candidateTargetCard.value;
    return Boolean(card && (card.color === "gold" || card.type === "jiang"));
});
const viewportGeometryBusy = ref(false);
const { effectiveHeight, effectiveWidth, isCompactViewport, isLegacyCompactViewport, isRotatedPhonePortrait, isUltraCompactViewport, viewportHeight, viewportWidth, viewportLeft, viewportTop, } = useResponsiveViewport(viewportGeometryBusy);
const displayPreferences = ref(readDisplayPreferences());
const resolvedTableLayout = ref(resolveTableLayout(displayPreferences.value.tableLayout, effectiveWidth.value, effectiveHeight.value));
watch(() => [displayPreferences.value.tableLayout, effectiveWidth.value, effectiveHeight.value], ([layout, width, height], _, onCleanup) => {
    const timer = setTimeout(() => { resolvedTableLayout.value = resolveTableLayout(layout, width, height); }, 180);
    onCleanup(() => clearTimeout(timer));
});
const layoutRecommendationDismissed = ref(readStoredValue("sise_compact_recommendation_dismissed_v1") === "1");
const showSmallScreenRecommendation = computed(() => resolveTableLayout("adaptive", effectiveWidth.value, effectiveHeight.value) === "compact" && displayPreferences.value.tableLayout === "classic"
    && !layoutRecommendationDismissed.value && (showEntry.value || showModeLobby.value)
    && !isConnectingWithoutState.value && !isEnded.value);
function dismissLayoutRecommendation() {
    layoutRecommendationDismissed.value = true;
    writeStoredValue("sise_compact_recommendation_dismissed_v1", "1");
}
function acceptCompactLayout() {
    displayPreferences.value.tableLayout = "compact";
    dismissLayoutRecommendation();
}
watch(() => displayPreferences.value.skin, skin => { document.documentElement.dataset.skin = skin; }, { immediate: true });
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
const gameToolsRef = ref(null);
const lobbyPageRef = ref(null);
const inviteCopyFallbackUrl = ref("");
const inviteQrUrl = ref("");
const inviteQrRoomId = ref("");
const canShareInvite = true;
const inviteActionPending = ref(null);
let globalNoticeTimer = null;
let inviteCopyReturnFocus = null;
let inviteQrReturnFocus = null;
const declarationMarks = ref({ fish: [], kong: [] });
const showRules = ref(false);
const rulesPanelRef = ref(null);
const rulesCloseButtonRef = ref(null);
const settlementPanelRef = ref(null);
const confirmingNextRound = ref(false);
const nextRoundTriggerRef = ref(null);
const nextRoundDialogRef = ref(null);
const nextRoundCancelRef = ref(null);
const confirmingReturnLobby = ref(false);
const returnLobbyTriggerRef = ref(null);
const returnLobbyDialogRef = ref(null);
const returnLobbyCancelRef = ref(null);
const settlementTransitionPending = ref(null);
let settlementTransitionReceiptTimer = null;
const quickRematchPending = ref(false);
const confirmingResumeAbandon = ref(false);
const syncExitButtonRef = ref(null);
const resumeAbandonDialogRef = ref(null);
const resumeAbandonCancelRef = ref(null);
const ROOM_HISTORY_GUARD_KEY = "__siseRoomGuard";
let roomNavigationGuardMounted = false;
let roomNavigationGuardArmed = false;
let roomNavigationGuardReleasing = false;
let roomNavigationReleaseTimer = null;
let rulesReturnFocus = null;
const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
watch(showEndPanel, (visible) => {
    if (visible) {
        void nextTick(() => settlementPanelRef.value?.focus());
        return;
    }
    clearSettlementTransitionPending();
    confirmingNextRound.value = false;
    confirmingReturnLobby.value = false;
}, { immediate: true });
const isDeclareSubmitted = computed(() => Boolean(mePlayer.value?.declaredReady));
const shouldShowDeclarePanel = computed(() => isDeclaring.value &&
    !declareDealIntroActive.value &&
    Boolean(mySeatId.value) &&
    !Boolean(mePlayer.value?.isBot || mePlayer.value?.isAutoPlay));
const settingsDecisionActive = computed(() => decisionAttention.value === "action" || decisionAttention.value === "discard"
    || (shouldShowDeclarePanel.value && !isDeclareSubmitted.value && mePlayer.value?.declarationStep !== "done"));
const settingsDecisionSecondsLeft = computed(() => {
    if (!settingsDecisionActive.value || decisionTimer.value.untimed) {
        return 0;
    }
    const endsAt = visibleDecisionEndsAt(state.value?.responsePhase ?? "", Number(decisionTimer.value.endsAt || state.value?.responseEndsAt || 0), decisionTimer.value.totalMs);
    return endsAt > 0 ? Math.max(0, Math.ceil((endsAt - nowMs.value) / 1000)) : 0;
});
const settingsDecisionTimeText = computed(() => decisionTimer.value.untimed
    ? "练习局不限时，查看规则期间牌局仍会继续"
    : state.value?.responsePhase === "collective" && settingsDecisionSecondsLeft.value === 0
        ? "公共倒计时已结束，仍可响应，请尽快操作"
        : `还剩 ${settingsDecisionSecondsLeft.value} 秒，查看规则期间计时继续`);
function openRules(trigger) {
    const explicitTarget = trigger instanceof HTMLElement
        ? trigger
        : trigger?.currentTarget instanceof HTMLElement
            ? trigger.currentTarget
            : null;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rulesReturnFocus = explicitTarget ?? (activeElement && activeElement !== document.body && activeElement !== document.documentElement
        ? activeElement
        : null);
    showRules.value = true;
    void nextTick(() => rulesCloseButtonRef.value?.focus());
}
function returnToDecision() {
    decisionControlFocusPending = true;
    void nextTick(() => {
        const focusAfterPopoverLeaves = (attempt = 0) => {
            if (!decisionControlFocusPending || focusReadyGameControl(true)) {
                return;
            }
            // 设置和规则使用离场过渡，节点短时间内仍具有 aria-modal。持续到节点真正卸载，
            // 再把焦点还给已选牌或首个合法动作，避免不同设备合成帧速度造成偶发失焦。
            if (settingsDecisionActive.value && attempt < 6) {
                window.setTimeout(() => focusAfterPopoverLeaves(attempt + 1), 100);
            }
        };
        focusAfterPopoverLeaves();
    });
}
function returnToDecisionFromRules() {
    closeRules(false);
    returnToDecision();
}
function closeRules(restoreFocus = true) {
    const returnTarget = rulesReturnFocus;
    const returnToGameSettings = Boolean(returnTarget?.closest("[data-testid='settings-panel']"));
    rulesReturnFocus = null;
    showRules.value = false;
    if (!restoreFocus) {
        return;
    }
    void nextTick(() => {
        const resolveTarget = () => returnTarget?.isConnected && !returnToGameSettings
            ? returnTarget
            : document.querySelector("[data-testid='lobby-rules']:not(:disabled), [data-testid='game-settings']:not(:disabled), [data-testid='confirm-declaration']:not(:disabled), [data-testid='open-rules']:not(:disabled), [data-testid='login-submit'], .reset-btn");
        const restore = () => resolveTarget()?.focus({ preventScroll: true });
        restore();
        window.requestAnimationFrame(restore);
        // 规则和设置同一帧关闭时，浏览器可能把焦点暂时退回 document。
        window.setTimeout(() => {
            if (!(document.activeElement instanceof HTMLElement) || document.activeElement === document.body) {
                restore();
            }
        }, 220);
    });
}
function trapRulesFocus(event) {
    const panel = rulesPanelRef.value;
    if (!panel) {
        return;
    }
    const focusable = Array.from(panel.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")).filter((element) => !element.hasAttribute("hidden"));
    if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}
const hasOtherHumanAtSettlement = computed(() => players.value.some((player) => player.clientId !== mySeatId.value && !player.isConfiguredBot));
function clearSettlementTransitionPending() {
    settlementTransitionPending.value = null;
    if (settlementTransitionReceiptTimer !== null) {
        window.clearTimeout(settlementTransitionReceiptTimer);
        settlementTransitionReceiptTimer = null;
    }
}
function submitSettlementTransition(transition) {
    if (settlementTransitionPending.value !== null ||
        !settlementReady.value ||
        !isHost.value ||
        state.value?.phase !== "ended") {
        return false;
    }
    globalError.value = "";
    const sent = transition === "next_round" ? nextRound() : returnLobby();
    if (!sent) {
        globalError.value = state.value?.roomMode === "practice"
            ? "网络未连接，下一局请求没有发送，请稍候重试。"
            : "网络未连接，整桌操作没有发送，请稍候重试。";
        return false;
    }
    if (transition === "next_round")
        trackProductEvent("play_again", { id: `${activeRoomId.value}_${state.value?.completedRounds}`, mode: state.value?.roomMode });
    settlementTransitionPending.value = transition;
    const requestedRoomId = activeRoomId.value;
    settlementTransitionReceiptTimer = window.setTimeout(() => {
        settlementTransitionReceiptTimer = null;
        if (settlementTransitionPending.value !== transition ||
            state.value?.phase !== "ended" ||
            activeRoomId.value !== requestedRoomId) {
            return;
        }
        settlementTransitionPending.value = null;
        globalError.value = state.value?.roomMode === "practice"
            ? "暂未确认下一局，请再点一次。"
            : "暂未确认整桌操作，请再点一次。";
    }, 8_000);
    return true;
}
async function requestNextRound() {
    if (!settlementReady.value || !isHost.value || settlementTransitionPending.value !== null) {
        return;
    }
    if (state.value?.roomMode !== "friends" || !hasOtherHumanAtSettlement.value) {
        submitSettlementTransition("next_round");
        return;
    }
    confirmingNextRound.value = true;
    await nextTick();
    nextRoundCancelRef.value?.focus();
}
async function rematchQuickTable() {
    if (!settlementReady.value || state.value?.roomMode !== "match" || quickRematchPending.value) {
        return;
    }
    trackProductEvent("play_again", { id: `${activeRoomId.value}_${state.value?.completedRounds}`, mode: "match" });
    beginProductMode("match");
    quickRematchPending.value = true;
    globalError.value = "";
    const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
    try {
        await leaveRoom();
        const ok = await connect({
            nameOverride: nickname,
            forceNew: true,
            matchmaking: true,
        });
        if (!ok) {
            throw new Error(joinError.value || "暂时无法重新配桌，请稍后再试。");
        }
    }
    catch (error) {
        globalError.value = error instanceof Error ? error.message : "暂时无法重新配桌，请稍后再试。";
    }
    finally {
        quickRematchPending.value = false;
    }
}
async function returnPracticeToModeSelection() {
    if (!settlementReady.value ||
        state.value?.roomMode !== "practice" ||
        state.value?.phase !== "ended" ||
        settlementTransitionPending.value !== null) {
        return;
    }
    await handleLeaveRoom();
    enteredFrontLobby.value = true;
}
function cancelNextRound() {
    if (!confirmingNextRound.value) {
        return;
    }
    confirmingNextRound.value = false;
    void nextTick(() => nextRoundTriggerRef.value?.focus());
}
function confirmNextRound() {
    confirmingNextRound.value = false;
    submitSettlementTransition("next_round");
}
function trapNextRoundFocus(event) {
    const panel = nextRoundDialogRef.value;
    if (!panel) {
        return;
    }
    const focusable = Array.from(panel.querySelectorAll("button:not([disabled])"));
    if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault();
        first.focus();
    }
}
async function requestReturnLobby() {
    if (!settlementReady.value || !isHost.value || settlementTransitionPending.value !== null) {
        return;
    }
    confirmingReturnLobby.value = true;
    await nextTick();
    returnLobbyCancelRef.value?.focus();
}
function cancelReturnLobby() {
    if (!confirmingReturnLobby.value) {
        return;
    }
    confirmingReturnLobby.value = false;
    void nextTick(() => returnLobbyTriggerRef.value?.focus());
}
function confirmReturnLobby() {
    confirmingReturnLobby.value = false;
    submitSettlementTransition("return_lobby");
}
function trapReturnLobbyFocus(event) {
    const panel = returnLobbyDialogRef.value;
    if (!panel) {
        return;
    }
    const focusable = Array.from(panel.querySelectorAll("button:not([disabled])"));
    if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault();
        first.focus();
    }
}
async function requestResumeAbandon() {
    confirmingResumeAbandon.value = true;
    await nextTick();
    resumeAbandonCancelRef.value?.focus();
}
function cancelResumeAbandon() {
    if (!confirmingResumeAbandon.value) {
        return;
    }
    confirmingResumeAbandon.value = false;
    void nextTick(() => document.querySelector("[data-testid='cancel-session-resume']")?.focus());
}
async function confirmResumeAbandon() {
    confirmingResumeAbandon.value = false;
    await returnToModeSelectionFromRoom();
}
function trapResumeAbandonFocus(event) {
    const panel = resumeAbandonDialogRef.value;
    if (!panel) {
        return;
    }
    const focusable = Array.from(panel.querySelectorAll("button:not([disabled])"));
    if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault();
        first.focus();
    }
}
function historyStateWithoutRoomGuard() {
    const current = window.history.state;
    if (!current || typeof current !== "object" || Array.isArray(current)) {
        return current;
    }
    const clean = { ...current };
    delete clean[ROOM_HISTORY_GUARD_KEY];
    return Object.keys(clean).length ? clean : null;
}
function isCurrentRoomHistoryGuard() {
    const current = window.history.state;
    return Boolean(current &&
        typeof current === "object" &&
        !Array.isArray(current) &&
        current[ROOM_HISTORY_GUARD_KEY] === true);
}
function cleanRoomUrl(preserveInviteRoomId = false) {
    const url = new URL(window.location.href);
    if (!preserveInviteRoomId) {
        url.searchParams.delete("roomId");
    }
    url.searchParams.delete("playerToken");
    url.searchParams.delete("new");
    return url.toString();
}
function sanitizeCurrentHistoryEntry() {
    const preserveInviteRoomId = showEntry.value && hasFriendInvite.value && !hasLobbySession.value;
    window.history.replaceState(historyStateWithoutRoomGuard(), "", cleanRoomUrl(preserveInviteRoomId));
}
function armRoomNavigationGuard() {
    if (!roomNavigationGuardMounted || !roomNavigationProtected.value) {
        return;
    }
    if (isCurrentRoomHistoryGuard()) {
        roomNavigationGuardArmed = true;
        return;
    }
    const current = window.history.state;
    const base = current && typeof current === "object" && !Array.isArray(current)
        ? current
        : {};
    window.history.pushState({ ...base, [ROOM_HISTORY_GUARD_KEY]: true }, "", window.location.href);
    roomNavigationGuardArmed = true;
}
function finishRoomNavigationGuardRelease() {
    roomNavigationGuardReleasing = false;
    if (roomNavigationReleaseTimer !== null) {
        window.clearTimeout(roomNavigationReleaseTimer);
        roomNavigationReleaseTimer = null;
    }
    sanitizeCurrentHistoryEntry();
}
function releaseRoomNavigationGuard() {
    const shouldStepBack = roomNavigationGuardArmed && isCurrentRoomHistoryGuard();
    roomNavigationGuardArmed = false;
    confirmingResumeAbandon.value = false;
    if (!shouldStepBack) {
        sanitizeCurrentHistoryEntry();
        return;
    }
    sanitizeCurrentHistoryEntry();
    roomNavigationGuardReleasing = true;
    window.history.back();
    if (roomNavigationReleaseTimer !== null) {
        window.clearTimeout(roomNavigationReleaseTimer);
    }
    roomNavigationReleaseTimer = window.setTimeout(finishRoomNavigationGuardRelease, 500);
}
function closeTopmostRoomLayerForBack() {
    if (confirmingResumeAbandon.value) {
        cancelResumeAbandon();
        return true;
    }
    if (pwaInstallGuide.value) {
        closePwaInstallGuide();
        return true;
    }
    if (inviteQrUrl.value) {
        closeInviteQr();
        return true;
    }
    if (inviteCopyFallbackUrl.value) {
        closeInviteCopyFallback();
        return true;
    }
    if (showRules.value) {
        closeRules();
        return true;
    }
    if (confirmingNextRound.value) {
        cancelNextRound();
        return true;
    }
    if (confirmingReturnLobby.value) {
        cancelReturnLobby();
        return true;
    }
    if (nicknameDialogOpen.value) {
        void closeNicknameDialog();
        return true;
    }
    if (gameToolsRef.value?.handleNavigationBack()) {
        return true;
    }
    if (lobbyPageRef.value?.handleNavigationBack()) {
        return true;
    }
    return false;
}
async function requestRoomExitFromBrowserBack() {
    await nextTick();
    if (closeTopmostRoomLayerForBack()) {
        return;
    }
    if (showGameTools.value && gameToolsRef.value) {
        await gameToolsRef.value.requestExit();
        return;
    }
    if (showModeLobby.value && lobbyPageRef.value) {
        await lobbyPageRef.value.requestLeaveRoom();
        return;
    }
    if (showSyncingScreen.value || roomNavigationProtected.value) {
        if (connectionState.value === "closed") {
            await returnToModeSelectionFromRoom();
            return;
        }
        await requestResumeAbandon();
    }
}
function handleRoomNavigationPopState() {
    if (roomNavigationGuardReleasing) {
        finishRoomNavigationGuardRelease();
        return;
    }
    if (!roomNavigationGuardMounted || !roomNavigationProtected.value) {
        roomNavigationGuardArmed = false;
        return;
    }
    const current = window.history.state;
    const base = current && typeof current === "object" && !Array.isArray(current)
        ? current
        : {};
    window.history.pushState({ ...base, [ROOM_HISTORY_GUARD_KEY]: true }, "", window.location.href);
    roomNavigationGuardArmed = true;
    void requestRoomExitFromBrowserBack();
}
let decisionControlFocusPending = false;
function focusReadyGameControl(force = false) {
    if (!decisionControlFocusPending)
        return true;
    // A new server decision must not steal focus from an intentional tools entry.
    if (!force && document.activeElement?.closest("[data-testid='game-settings'], [data-testid='pwa-install-entry']")) {
        decisionControlFocusPending = false;
        return true;
    }
    if (document.querySelector("[aria-modal='true']")) {
        return false;
    }
    // querySelector 对逗号选择器按 DOM 顺序返回；操作区重排到手牌之前后，必须显式
    // 保留“已选牌 > 合法动作 > 其他可选牌”的焦点优先级。
    const control = (isDeclaring.value ? document.querySelector("[data-testid='confirm-declaration']:not(:disabled)") : null)
        ?? document.querySelector(".hand-card.discard-selected:not(:disabled)")
        ?? document.querySelector(".action-dock .btn:not(:disabled)")
        ?? document.querySelector(".hand-card.playable:not(:disabled)");
    if (!control) {
        return false;
    }
    control.focus({ preventScroll: true });
    decisionControlFocusPending = false;
    return true;
}
watch(settingsDecisionActive, (active) => {
    if (!active) {
        decisionControlFocusPending = false;
        return;
    }
    decisionControlFocusPending = true;
    // A decision can arrive before the private hand or action buttons finish
    // their adjacent state patch. Keep the focus request pending until a real
    // control exists instead of leaving keyboard users on removed settings.
    void nextTick(focusReadyGameControl);
});
watch(() => [
    privateHandSynchronized.value,
    canDiscard.value,
    availableActions.value
        .filter((action) => action.enabled || action.deferred)
        .map((action) => action.action)
        .join("|"),
], () => {
    if (decisionControlFocusPending && settingsDecisionActive.value) {
        void nextTick(focusReadyGameControl);
    }
});
const decisionAlertKey = computed(() => {
    const authoritativeDecisionKey = decisionTimer.value.decisionKey.trim();
    if (!settingsDecisionActive.value || !authoritativeDecisionKey) {
        return "";
    }
    return [
        activeRoomId.value,
        state.value?.responsePhase ?? "",
        authoritativeDecisionKey,
        canDiscard.value ? "discard" : "action",
    ].join("|");
});
const turnAlertMode = computed(() => displayPreferences.value.turnAlert);
const spokenTurnGuidanceSupported = typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
const screenWakeLockSupported = isScreenWakeLockSupported();
const spokenTurnGuidance = computed(() => !sessionAudioMuted.value && displayPreferences.value.spokenTurnGuidance);
const spokenDecisionMessage = computed(() => {
    if (!settingsDecisionActive.value) {
        return "";
    }
    if (canDiscard.value) {
        return "轮到你出牌。先选一张手牌，再点出牌。";
    }
    const order = ["hu", "kai", "peng", "chi", "pass"];
    const labels = order.flatMap((action) => {
        const available = availableActions.value.some((item) => item.action === action && (item.enabled || item.deferred));
        if (!available) {
            return [];
        }
        const matchingAction = availableActions.value.find((item) => item.action === action && (item.enabled || item.deferred));
        if (action === "pass" && (matchingAction?.deferred || state.value?.responsePhase === "local_upper")) {
            return ["抓"];
        }
        return [{ hu: "胡", kai: "开", peng: "碰", chi: "吃", pass: "过" }[action]];
    });
    const canPass = availableActions.value.some((item) => item.action === "pass" && (item.enabled || item.deferred));
    if (isPendingSpecialCard.value && !canPass) {
        return "轮到你了。这张特殊牌不能过，请选择吃法。";
    }
    if (!labels.length) {
        return "轮到你了，请选择下一步。";
    }
    const choices = labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join("、")}或${labels.at(-1)}`;
    return `轮到你了。可选择${choices}。`;
});
useTurnAlert({
    active: settingsDecisionActive,
    decisionKey: decisionAlertKey,
    mode: turnAlertMode,
    spokenEnabled: spokenTurnGuidance,
    spokenMessage: spokenDecisionMessage,
});
const wakeLockActive = computed(() => connected.value && (isDeclaring.value || isPlaying.value));
const keepScreenAwake = computed(() => displayPreferences.value.keepScreenAwake);
useScreenWakeLock(wakeLockActive, keepScreenAwake);
const declareDealIntroActive = computed(
// The server advances lastAction to DECLARING when the intro ends. Do not
// compare clocks: an inaccurate phone clock could expose the declaration
// dialog over the ceremony.
() => isDeclaring.value &&
    /^DEALER(?:_PICK|_CARD)?\s+\S+/.test(String(state.value?.lastAction ?? "")));
let declareTick = null;
const declareSecondsLeft = computed(() => {
    if (declareDealIntroActive.value) {
        return 0;
    }
    const endsAt = declareDecisionEndsAt.value;
    if (!endsAt) {
        return 0;
    }
    const configuredSeconds = Math.ceil(declareTotalMs.value / 1000);
    return Math.max(0, Math.min(configuredSeconds, Math.ceil((endsAt - nowMs.value) / 1000)));
});
const declareDecisionEndsAt = computed(() => {
    if (decisionTimer.value.decisionKey.startsWith("declare:") && decisionTimer.value.endsAt > 0) {
        return decisionTimer.value.endsAt;
    }
    return Number(state.value?.declareEndsAt ?? 0);
});
const declareTotalMs = computed(() => {
    if (decisionTimer.value.totalMs > 0) {
        return decisionTimer.value.totalMs;
    }
    const action = String(state.value?.lastAction ?? "");
    const match = action.match(/DECLARING\s+(\d+)ms/);
    if (match) {
        return Math.max(1000, Number(match[1]) || 45000);
    }
    return 45000;
});
const declareProgressPercent = computed(() => {
    const endsAt = declareDecisionEndsAt.value;
    if (!endsAt) {
        return 0;
    }
    const remain = Math.max(0, endsAt - nowMs.value);
    const percent = (remain / declareTotalMs.value) * 100;
    return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
});
function clearSeatClaimPending() {
    seatClaimPending.value = null;
    if (seatClaimReceiptTimer !== null) {
        window.clearTimeout(seatClaimReceiptTimer);
        seatClaimReceiptTimer = null;
    }
}
function requestSeatClaim(seatIndex) {
    if (seatClaimPending.value !== null ||
        state.value?.phase !== "waiting" ||
        state.value?.roomMode !== "friends") {
        return false;
    }
    globalError.value = "";
    if (!claimSeat(seatIndex)) {
        globalError.value = "网络未连接，座位选择没有发送，请稍候重试。";
        return false;
    }
    seatClaimPending.value = seatIndex;
    const requestedRoomId = activeRoomId.value;
    const previousSeatId = mySeatId.value;
    seatClaimReceiptTimer = window.setTimeout(() => {
        seatClaimReceiptTimer = null;
        if (seatClaimPending.value !== seatIndex ||
            state.value?.phase !== "waiting" ||
            activeRoomId.value !== requestedRoomId ||
            mySeatId.value !== previousSeatId) {
            return;
        }
        seatClaimPending.value = null;
        globalError.value = "暂未确认座位，请重新选择。";
    }, 8_000);
    return true;
}
function clearLobbyReadyPending() {
    lobbyReadyPending.value = null;
    if (lobbyReadyReceiptTimer !== null) {
        window.clearTimeout(lobbyReadyReceiptTimer);
        lobbyReadyReceiptTimer = null;
    }
}
function requestLobbyReady(ready) {
    if (lobbyReadyPending.value !== null ||
        state.value?.phase !== "waiting" ||
        state.value?.roomMode !== "friends" ||
        !mySeatId.value ||
        isHost.value ||
        Boolean(mePlayer.value?.lobbyReady) === ready) {
        return false;
    }
    globalError.value = "";
    if (!setLobbyReady(ready)) {
        globalError.value = "网络未连接，准备状态没有发送，请稍候重试。";
        return false;
    }
    lobbyReadyPending.value = ready;
    const requestedRoomId = activeRoomId.value;
    const requestedSeatId = mySeatId.value;
    lobbyReadyReceiptTimer = window.setTimeout(() => {
        lobbyReadyReceiptTimer = null;
        if (lobbyReadyPending.value !== ready ||
            state.value?.phase !== "waiting" ||
            activeRoomId.value !== requestedRoomId ||
            mySeatId.value !== requestedSeatId ||
            Boolean(mePlayer.value && Boolean(mePlayer.value.lobbyReady) === ready)) {
            return;
        }
        lobbyReadyPending.value = null;
        globalError.value = "暂未确认准备状态，请再点一次。";
    }, 8_000);
    return true;
}
async function handleLeaveRoom() {
    trackProductEvent("room_exit", { mode: tutorial.value ? "tutorial" : state.value?.roomMode });
    globalError.value = "";
    pendingPracticeAutoStart.value = false;
    clearRoundStartPending();
    clearSeatClaimPending();
    clearLobbyReadyPending();
    clearSettlementTransitionPending();
    await leaveRoom();
    entryInviteRoomId.value = "";
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
        return;
    }
    if (state.value?.responsePhase === "collective" && action === "chi" && state.value?.responseCard?.source === "upper") {
        if (pendingDeferredChiIntent.value)
            return;
        const candidateId = candidateIdFromRequest(request);
        const targetCardId = String(candidateTargetCard.value?.id ?? "");
        if (!candidateId || !targetCardId)
            return;
        pendingDeferredChiIntent.value = {
            roundKey: getRoundKey(state.value?.roomId, state.value?.completedRounds, state.value?.phase),
            targetCardId,
            candidateId,
            collectiveDecisionKey: decisionTimer.value.decisionKey,
        };
        if (sendAction("pass") !== "sent")
            pendingDeferredChiIntent.value = null;
        return;
    }
    pendingDeferredChiIntent.value = null;
    pendingDeferredGrab.value = false;
    sendAction(request);
}
function cardLabel(card) {
    return getCardLabelText(card);
}
function submitDeferredChiIfReady() {
    const intent = pendingDeferredChiIntent.value;
    if (!intent) {
        return;
    }
    const currentRoundKey = getRoundKey(state.value?.roomId, state.value?.completedRounds, state.value?.phase);
    const targetCardId = String(candidateTargetCard.value?.id ?? "");
    if (currentRoundKey !== intent.roundKey || (targetCardId && targetCardId !== intent.targetCardId)) {
        pendingDeferredChiIntent.value = null;
        return;
    }
    const phase = String(state.value?.responsePhase ?? "");
    if (phase === "collective") {
        return;
    }
    const isLocalChiPhase = phase === "local_upper" && String(state.value?.currentPlayerId ?? "") === mySeatId.value;
    if (!isLocalChiPhase) {
        pendingDeferredChiIntent.value = null;
        return;
    }
    if (!connected.value || !privateHandSynchronized.value || !targetCardId)
        return;
    const decisionKey = decisionTimer.value.decisionKey;
    if (!decisionKey || decisionKey === intent.collectiveDecisionKey)
        return;
    const chiEntry = availableActions.value.find((item) => item.action === "chi");
    if (!chiEntry?.enabled) {
        // The local_upper room snapshot is broadcast immediately before its private
        // action list. Keep waiting while the previous collective list still
        // contains the same deferred Chi entry; otherwise that message boundary
        // can erase a valid intent before the new decision becomes submit-ready.
        if (!chiEntry && availableActions.value.length > 0)
            pendingDeferredChiIntent.value = null;
        return;
    }
    if (!chiEntry.candidates?.some((candidate) => candidate.id === intent.candidateId)) {
        pendingDeferredChiIntent.value = null;
        return;
    }
    const result = sendAction({ action: "chi", candidateId: intent.candidateId });
    if (result === "sent" || result === "invalid") {
        pendingDeferredChiIntent.value = null;
    }
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
function submitFishDeclaration(fishCardIds) {
    if (isDeclareSubmitted.value || mePlayer.value?.declarationStep !== "fish")
        return;
    declareFish(fishCardIds);
}
function submitKongDeclaration(count) {
    if (isDeclareSubmitted.value || mePlayer.value?.declarationStep !== "kong")
        return;
    declareKongs(count);
}
watch(() => `${state.value?.phase ?? ""}|${state.value?.responsePhase ?? ""}|${state.value?.currentPlayerId ?? ""}`, () => {
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
});
watch(() => availableActions.value, () => {
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
}, { deep: true });
watch(() => [decisionTimer.value.decisionKey, privateHandSynchronized.value, acceptedStateRevision.value], () => submitDeferredChiIfReady());
watch(() => `${connectionState.value}|${actionFeedback.value?.decisionKey ?? ""}|${actionFeedback.value?.status ?? ""}`, () => submitDeferredChiIfReady());
watch(() => Boolean(mePlayer.value?.isBot || mePlayer.value?.isAutoPlay), (automatic) => {
    if (automatic)
        pendingDeferredChiIntent.value = null;
});
watch(() => [
    roomNavigationProtected.value,
    activeRoomId.value,
    state.value?.phase ?? "",
    connectionState.value,
], ([protectedNow]) => {
    if (!roomNavigationGuardMounted) {
        return;
    }
    if (protectedNow) {
        armRoomNavigationGuard();
    }
    else {
        releaseRoomNavigationGuard();
    }
}, { flush: "post" });
onMounted(() => {
    openProductSession(Boolean(new URLSearchParams(window.location.search).get("roomId")));
    roomNavigationGuardMounted = true;
    window.addEventListener("popstate", handleRoomNavigationPopState);
    armRoomNavigationGuard();
    installLocalTestBridge();
    declareTick = window.setInterval(() => {
        nowMs.value = Date.now();
    }, 500);
    writeStoredValue(DISPLAY_PREFERENCES_KEY, JSON.stringify(displayPreferences.value));
    document.documentElement.classList.toggle("show-card-color-assist", displayPreferences.value.showCardColorAssist);
    void bootstrapRoomEntry();
});
onUnmounted(() => {
    document.documentElement.classList.remove("show-card-color-assist");
    roomNavigationGuardMounted = false;
    window.removeEventListener("popstate", handleRoomNavigationPopState);
    if (roomNavigationReleaseTimer !== null) {
        window.clearTimeout(roomNavigationReleaseTimer);
        roomNavigationReleaseTimer = null;
    }
    removeLocalTestBridge();
    if (declareTick !== null) {
        window.clearInterval(declareTick);
        declareTick = null;
    }
    if (globalNoticeTimer !== null) {
        window.clearTimeout(globalNoticeTimer);
        globalNoticeTimer = null;
    }
    clearRoundStartPending();
    clearSeatClaimPending();
    clearLobbyReadyPending();
    clearSettlementTransitionPending();
});
watch(globalError, (message) => {
    if (message) {
        clearGlobalNotice();
    }
});
watch(joinError, (message) => {
    if (message) {
        if (roundStartPending.value) {
            clearRoundStartPending();
        }
        if (settlementTransitionPending.value !== null) {
            clearSettlementTransitionPending();
        }
        if (seatClaimPending.value !== null) {
            clearSeatClaimPending();
        }
        if (lobbyReadyPending.value !== null) {
            clearLobbyReadyPending();
        }
    }
});
let productRecoveryId = "";
let productRecoveryRevision = -1;
watch(showModeLobby, visible => { if (visible)
    trackProductEvent("lobby_view", { id: productVisitId() }); }, { immediate: true });
watch(() => connected.value && privateHandSynchronized.value && (canAct.value || canDiscard.value || (state.value?.phase === "declaring" && !openingDealActive.value && !tablePresentationActive.value && !mePlayer.value?.declaredReady)), ready => { if (ready)
    readyProductMode(); });
watch(connectionState, (nextState) => {
    if (["offline", "reconnecting", "retry_wait"].includes(nextState) && !productRecoveryId) {
        productRecoveryRevision = acceptedStateRevision.value;
        productRecoveryId = `${productVisitId()}_${Date.now()}`;
        trackProductEvent("reconnect_started", { id: productRecoveryId, mode: state.value?.roomMode });
    }
    if (productRecoveryId && (nextState === "closed" || nextState === "failed")) {
        trackProductEvent("reconnect_failed", { id: productRecoveryId, mode: state.value?.roomMode });
        productRecoveryId = "";
    }
    if (nextState !== "closed") {
        return;
    }
    void nextTick(() => {
        const terminalAction = syncExitButtonRef.value
            ?? document.querySelector("[data-testid='terminal-return-to-modes']");
        terminalAction?.focus({ preventScroll: true });
    });
});
watch(() => [connectionState.value, acceptedStateRevision.value, privateHandSynchronized.value, mySeatId.value], () => {
    if (productRecoveryId && connected.value && mySeatId.value && privateHandSynchronized.value && acceptedStateRevision.value > productRecoveryRevision) {
        trackProductEvent("reconnect_success", { id: productRecoveryId, mode: state.value?.roomMode });
        productRecoveryId = "";
    }
});
watch(connected, (isConnected) => {
    if (!isConnected) {
        pendingDeferredChiIntent.value = null;
        pendingDeferredGrab.value = false;
        if (roundStartPending.value) {
            clearRoundStartPending();
        }
        if (settlementTransitionPending.value !== null) {
            clearSettlementTransitionPending();
        }
        if (seatClaimPending.value !== null) {
            clearSeatClaimPending();
        }
        if (lobbyReadyPending.value !== null) {
            clearLobbyReadyPending();
        }
    }
});
watch(mySeatId, (seatId, previousSeatId) => {
    if (seatId !== previousSeatId) {
        if (seatClaimPending.value !== null) {
            clearSeatClaimPending();
        }
        if (lobbyReadyPending.value !== null) {
            clearLobbyReadyPending();
        }
    }
});
watch(() => mePlayer.value?.lobbyReady, (ready) => {
    if (mePlayer.value && lobbyReadyPending.value !== null && Boolean(ready) === lobbyReadyPending.value) {
        clearLobbyReadyPending();
    }
});
watch(displayPreferences, (preferences) => {
    writeStoredValue(DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences));
    document.documentElement.classList.toggle("show-card-color-assist", preferences.showCardColorAssist);
}, { deep: true });
function clearRoundStartPending() {
    roundStartPending.value = false;
    if (roundStartReceiptTimer !== null) {
        window.clearTimeout(roundStartReceiptTimer);
        roundStartReceiptTimer = null;
    }
}
function requestRoundStart() {
    if (roundStartPending.value) {
        return false;
    }
    globalError.value = "";
    if (!startGame()) {
        globalError.value = "网络未连接，暂时无法开始，请稍候重试。";
        return false;
    }
    roundStartPending.value = true;
    const requestedRoomId = activeRoomId.value;
    roundStartReceiptTimer = window.setTimeout(() => {
        roundStartReceiptTimer = null;
        if (!roundStartPending.value ||
            state.value?.phase !== "waiting" ||
            activeRoomId.value !== requestedRoomId) {
            return;
        }
        roundStartPending.value = false;
        globalError.value = "暂未确认开局，请再点一次。";
    }, 8_000);
    return true;
}
function maybeAutoStartPractice() {
    if (!pendingPracticeAutoStart.value || !canPressStartGame.value) {
        return;
    }
    // 单人练习应该在房间准备就绪后立刻发 start_game，
    // 不能只依赖“ready 从 false 变 true”的 watcher，
    // 否则当 ready 先成立、pending 后置为 true 时会永远卡住。
    if (requestRoundStart()) {
        pendingPracticeAutoStart.value = false;
    }
}
watch(() => [canPressStartGame.value, pendingPracticeAutoStart.value], () => {
    maybeAutoStartPractice();
}, { immediate: true });
// 一旦房间离开 waiting 阶段（即已成功开局），清除自动开局标记以阻止后续重试。
watch(() => state.value?.phase, (phase) => {
    if (phase && phase !== "waiting") {
        clearRoundStartPending();
    }
    if (phase && phase !== "waiting" && pendingPracticeAutoStart.value) {
        pendingPracticeAutoStart.value = false;
    }
    if (phase && phase !== "ended") {
        clearSettlementTransitionPending();
    }
    if (phase && phase !== "waiting") {
        clearSeatClaimPending();
        clearLobbyReadyPending();
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
function participantDisplayName(player) {
    return player.isConfiguredBot ? `${player.name}（机器人）` : player.name;
}
const winnerName = computed(() => {
    const winnerId = derivedWinnerId.value;
    if (!winnerId) {
        return "-";
    }
    const player = players.value.find((x) => x.clientId === winnerId);
    return player ? participantDisplayName(player) : winnerId;
});
const roundOutcomeText = computed(() => {
    if (!derivedWinnerId.value) {
        return "本局流局";
    }
    return derivedWinnerId.value === mySeatId.value ? "你胡牌了" : `${winnerName.value} 胡牌`;
});
const settlementPlayers = computed(() => roundResult.value?.players ?? []);
const settlementReady = computed(() => isEnded.value && Boolean(roundResult.value) && settlementPlayers.value.length === 4);
const isCumulativeSettlement = computed(() => roundResult.value?.scoringMode === "cumulative");
const settlementRoundNumber = computed(() => Math.max(1, Number(roundResult.value?.roundNumber ?? 1)));
const mySettlementPlayer = computed(() => settlementPlayers.value.find((player) => player.clientId === mySeatId.value) ?? null);
const orderedSettlementPlayers = computed(() => {
    const winnerId = derivedWinnerId.value;
    return settlementPlayers.value
        .map((player, index) => ({ player, index }))
        .sort((a, b) => {
        const rank = (player) => {
            if (player.clientId === mySeatId.value)
                return 0;
            if (winnerId && player.clientId === winnerId)
                return 1;
            return 2;
        };
        return rank(a.player) - rank(b.player) || a.index - b.index;
    })
        .map(({ player }) => player);
});
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
    if (kind === "peng" || kind === "Peng") {
        return "碰";
    }
    if (kind === "kai" || ["Quad", "JiangQuad", "GoldQuad"].includes(kind)) {
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
    if (kind === "peng" || kind === "Peng") {
        return `${cardLabel(head)}碰`;
    }
    if (kind === "kai" || ["Quad", "JiangQuad", "GoldQuad"].includes(kind)) {
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
            badge: settlementBadge(group.cards, group.key),
            label: settlementGroupLabel(group.cards, group.key),
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
            badge: settlementBadge(group.cards, group.key),
            label: settlementGroupLabel(group.cards, group.key),
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
                    label: `${participantDisplayName(winner)} 收胡牌分`,
                    total: -winnerPerOpponent,
                },
            ]
            : [];
        return [...huLine, ...nonHuLines];
    }
    return payers.map((payer) => ({
        key: `hu-pay-${payer.clientId}`,
        label: `${participantDisplayName(payer)} 付胡牌分`,
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
        return `${player ? participantDisplayName(player) : seatId} 无可弃牌，流局。`;
    }
    return "对局结束。";
});
const roundDealerCard = computed(() => {
    const card = state.value?.dealerCard ?? null;
    return card?.id ? card : null;
});
async function enterLobby() {
    if (enteringLobby.value || enteredFrontLobby.value) {
        return;
    }
    const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
    entryName.value = nickname;
    globalError.value = "";
    writeStoredValue(ENTRY_NAME_KEY, nickname);
    const mergedHistory = [nickname, ...nicknameHistory.value.filter((item) => item !== nickname)].slice(0, 8);
    nicknameHistory.value = mergedHistory;
    writeNicknameHistory(mergedHistory);
    void updateGuestProfileNickname(nickname);
    enteredFrontLobby.value = true;
    const invitedRoomId = entryInviteRoomId.value;
    if (!invitedRoomId) {
        await nextTick();
        document.querySelector("[data-testid='mode-practice_bots']")?.focus();
        return;
    }
    joiningFriendInvite.value = true;
    enteringLobby.value = true;
    try {
        const ok = await connect({
            nameOverride: nickname,
            roomId: invitedRoomId,
            exposeRoomIdInUrl: true,
            preserveState: true,
        });
        if (!joiningFriendInvite.value || entryInviteRoomId.value !== invitedRoomId) {
            return;
        }
        if (!ok) {
            if (connectionState.value === "closed") {
                return;
            }
            if (connectionState.value === "retry_wait" || connectionState.value === "offline") {
                retryConnection();
                return;
            }
            throw new Error(joinError.value || "加入好友房失败");
        }
    }
    catch (error) {
        trackProductEvent("join_failed", { mode: "friends", outcome: "failed" });
        if (!joiningFriendInvite.value || entryInviteRoomId.value !== invitedRoomId) {
            return;
        }
        globalError.value = error instanceof Error ? error.message : "加入好友房失败";
        enteredFrontLobby.value = false;
    }
    finally {
        joiningFriendInvite.value = false;
        enteringLobby.value = false;
    }
}
const nicknameDialogOpen = ref(false);
const nicknameDraftRandom = ref("");
let nicknameReturnFocus = null;
async function openNicknameDialog() {
    if (hasLobbySession.value || enteringLobby.value)
        return;
    nicknameReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nicknameDialogOpen.value = true;
}
async function closeNicknameDialog() {
    nicknameDialogOpen.value = false;
    await nextTick();
    nicknameReturnFocus?.focus();
}
function saveNickname(value) {
    const nickname = value.trim().slice(0, 16);
    if (!nickname)
        return;
    entryName.value = nickname;
    writeStoredValue(ENTRY_NAME_KEY, nickname);
    nicknameHistory.value = [nickname, ...nicknameHistory.value.filter(name => name !== nickname)].slice(0, 8);
    writeNicknameHistory(nicknameHistory.value);
    void updateGuestProfileNickname(nickname);
    void closeNicknameDialog();
}
function startLobbyMode(mode) {
    if (enteringLobby.value || hasLobbySession.value)
        return;
    selectedLobbyMode.value = mode;
    startSelectedMode();
}
function startSelectedMode() {
    globalError.value = "";
    if (!hasLobbySession.value) {
        if (selectedLobbyMode.value === "friends") {
            void startFriendLobby();
        }
        else if (selectedLobbyMode.value === "quick_match") {
            void startQuickMatchLobby();
        }
        else {
            void startPracticeLobby();
        }
        return;
    }
    if (state.value?.roomMode === "friends" || state.value?.roomMode === "match") {
        requestRoundStart();
    }
    else {
        requestPracticeAutoStart();
    }
}
async function startQuickMatchLobby() {
    if (enteringLobby.value) {
        return;
    }
    const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
    entryName.value = nickname;
    startingRoomMode.value = "quick_match";
    enteringLobby.value = true;
    beginProductMode("match");
    try {
        const ok = await connect({
            nameOverride: nickname,
            forceNew: true,
            matchmaking: true,
        });
        if (!ok) {
            throw new Error(joinError.value || "暂时无法快速配桌，请稍后重试。");
        }
    }
    catch (error) {
        failProductMode();
        globalError.value = error instanceof Error ? error.message : "暂时无法快速配桌，请稍后重试。";
    }
    finally {
        enteringLobby.value = false;
        if (!connected.value) {
            startingRoomMode.value = null;
        }
    }
}
function requestPracticeAutoStart() {
    pendingPracticeAutoStart.value = true;
    maybeAutoStartPractice();
}
async function finishTutorial(invite) {
    if (enteringLobby.value)
        return;
    await leaveRoom();
    if (invite)
        await startFriendLobby();
    else
        await startPracticeLobby();
}
async function startPracticeLobby(tutorial = false) {
    if (enteringLobby.value) {
        return;
    }
    const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
    entryName.value = nickname;
    startingRoomMode.value = "practice";
    enteringLobby.value = true;
    beginProductMode(tutorial ? "tutorial" : "practice");
    try {
        const response = await fetch(`${HTTP_URL}/rooms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "practice", tutorial }),
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
        failProductMode();
        globalError.value = error instanceof Error ? error.message : "进入大厅失败";
    }
    finally {
        enteringLobby.value = false;
        if (!connected.value) {
            startingRoomMode.value = null;
        }
    }
}
async function startFriendLobby() {
    if (enteringLobby.value) {
        return;
    }
    const nickname = entryName.value.trim().slice(0, 16) || generateRandomNickname();
    startingRoomMode.value = "friends";
    enteringLobby.value = true;
    beginProductMode("friends");
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
            exposeRoomIdInUrl: true,
        });
        if (!ok) {
            throw new Error(joinError.value || "进入好友房失败");
        }
    }
    catch (error) {
        failProductMode();
        globalError.value = error instanceof Error ? error.message : "创建好友房失败";
    }
    finally {
        enteringLobby.value = false;
        if (!connected.value) {
            startingRoomMode.value = null;
        }
    }
}
function buildInviteUrl() {
    if (!activeRoomId.value) {
        return "";
    }
    return new URL(`/invite/${encodeURIComponent(activeRoomId.value)}`, window.location.origin).toString();
}
function buildPublicShareUrl() {
    return new URL("/share", window.location.origin).toString();
}
async function copyInviteLink() {
    await performInviteAction("copy");
}
async function shareInviteLink() {
    await performInviteAction("share");
}
async function shareGame() {
    await performInviteAction("share", "game");
}
async function performInviteAction(action, target = "invite") {
    if ((target === "invite" && !activeRoomId.value) || inviteActionPending.value) {
        return;
    }
    inviteCopyReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inviteActionPending.value = action;
    const inviteUrl = target === "invite" ? buildInviteUrl() : buildPublicShareUrl();
    const title = "邀请你一起传承四色牌文化";
    const shareText = target === "invite"
        ? `好友房 ${activeRoomId.value} · 不用注册，打开选座；不满四人可电脑补位`
        : "象棋魂 · 麻将韵 · 纸牌趣——四色牌，一局见真章！";
    let restoreFocus = true;
    try {
        if (action === "share" && navigator.share) {
            try {
                await navigator.share({
                    title,
                    text: shareText,
                    url: inviteUrl,
                });
                globalError.value = "";
                showGlobalNotice(target === "invite" ? "邀请已分享，等待牌友加入" : "四色牌已分享到系统分享菜单");
                return;
            }
            catch (error) {
                if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
                    return;
                }
            }
        }
        inviteActionPending.value = "copy";
        let copied = false;
        if (window.isSecureContext && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(inviteUrl);
                copied = true;
            }
            catch {
                copied = false;
            }
        }
        if (!copied) {
            const textarea = document.createElement("textarea");
            textarea.value = inviteUrl;
            textarea.readOnly = true;
            textarea.style.position = "fixed";
            textarea.style.inset = "0 auto auto -9999px";
            textarea.style.fontSize = "16px";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, inviteUrl.length);
            try {
                copied = document.execCommand("copy");
            }
            catch {
                copied = false;
            }
            finally {
                textarea.remove();
            }
        }
        if (copied) {
            globalError.value = "";
            const embeddedSocial = /MicroMessenger|MQQBrowser|QQ\//i.test(navigator.userAgent);
            showGlobalNotice(embeddedSocial
                ? "链接已复制，也可以点右上角分享到微信或 QQ"
                : target === "invite" ? "邀请链接已复制，可以发给朋友了" : "四色牌链接已复制，可以发给朋友了");
        }
        else {
            globalError.value = "";
            inviteCopyFallbackUrl.value = inviteUrl;
            restoreFocus = false;
        }
    }
    finally {
        inviteActionPending.value = null;
        if (restoreFocus) {
            const returnTarget = inviteCopyReturnFocus;
            inviteCopyReturnFocus = null;
            await nextTick();
            returnTarget?.isConnected && returnTarget.focus();
        }
    }
}
function showInviteQr() {
    const inviteUrl = buildInviteUrl();
    if (!inviteUrl || !activeRoomId.value) {
        return;
    }
    inviteQrReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inviteQrRoomId.value = activeRoomId.value;
    inviteQrUrl.value = inviteUrl;
}
function closeInviteQr(restoreFocus = true) {
    if (!inviteQrUrl.value) {
        return;
    }
    const returnTarget = inviteQrReturnFocus;
    inviteQrUrl.value = "";
    inviteQrRoomId.value = "";
    inviteQrReturnFocus = null;
    if (restoreFocus) {
        void nextTick(() => returnTarget?.isConnected && returnTarget.focus());
    }
}
function closeInviteCopyFallback(restoreFocus = true) {
    if (!inviteCopyFallbackUrl.value) {
        return;
    }
    const returnTarget = inviteCopyReturnFocus;
    inviteCopyFallbackUrl.value = "";
    inviteCopyReturnFocus = null;
    if (restoreFocus) {
        void nextTick(() => returnTarget?.isConnected && returnTarget.focus());
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
    if (phase !== "waiting") {
        closeInviteCopyFallback(false);
        closeInviteQr(false);
    }
});
watch(activeRoomId, (roomId, previousRoomId) => {
    if (roomId !== previousRoomId) {
        clearRoundStartPending();
        clearSeatClaimPending();
        clearLobbyReadyPending();
        clearSettlementTransitionPending();
        closeInviteQr(false);
        closePwaInstallGuide(false);
    }
    if (previousRoomId && !roomId) {
        entryInviteRoomId.value = "";
    }
});
let lastGuestProfileRoundKey = "";
watch(() => `${activeRoomId.value}:${roundResult.value?.roundNumber ?? 0}`, (roundKey) => {
    if (!roundResult.value || roundKey === lastGuestProfileRoundKey)
        return;
    lastGuestProfileRoundKey = roundKey;
    refreshGuestProfileAfterSettlement();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['install-app-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['table-active']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['game-control-header']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-game-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-game-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['front-lobby-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['game-tools-active']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['game-tools-active']} */ ;
/** @type {__VLS_StyleScopedClasses['resume-cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['resume-retry']} */ ;
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
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-decision-reminder']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-fixed-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-scroll-region']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['winner']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-result']} */ ;
/** @type {__VLS_StyleScopedClasses['score-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-total']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-total']} */ ;
/** @type {__VLS_StyleScopedClasses['positive']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-total']} */ ;
/** @type {__VLS_StyleScopedClasses['negative']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-total']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-toggle-open']} */ ;
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
/** @type {__VLS_StyleScopedClasses['positive']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['negative']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['playing']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['table-active']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['install-app-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['install-label-short']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-landscape']} */ ;
/** @type {__VLS_StyleScopedClasses['table-active']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['game-control-header']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-mask']} */ ;
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
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-fixed-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-fixed-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-number']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-scroll-region']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['end-global-info']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-player-section']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-name']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['winner']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['score-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['score-breakdown']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-toggle-label']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['score-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-total']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
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
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['top-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['game-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['game-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-button']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ultra-compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-list']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['reduce-motion']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['reduce-motion']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['reduce-motion']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['reduce-motion']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['fx-card']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-flight']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-decision-reminder']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-decision-reminder']} */ ;
/** @type {__VLS_StyleScopedClasses['small-screen-recommendation']} */ ;
/** @type {__VLS_StyleScopedClasses['small-screen-recommendation']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "layout" },
    ...{ class: ({
            playing: __VLS_ctx.isPlaying,
            'table-active': __VLS_ctx.showGameTools,
            'compact-viewport': __VLS_ctx.isCompactViewport,
            'ultra-compact-viewport': __VLS_ctx.isUltraCompactViewport,
            'legacy-compact-viewport': __VLS_ctx.isLegacyCompactViewport,
            'compact-landscape': __VLS_ctx.isCompactViewport && __VLS_ctx.showGameTools,
            'effective-short-landscape': __VLS_ctx.effectiveWidth > __VLS_ctx.effectiveHeight && __VLS_ctx.effectiveHeight <= 600,
            'rotated-phone-portrait': __VLS_ctx.isRotatedPhonePortrait,
            'game-tools-active': __VLS_ctx.showGameTools,
            'reduce-motion': __VLS_ctx.displayPreferences.reduceMotion,
            'show-card-color-assist': __VLS_ctx.displayPreferences.showCardColorAssist,
        }) },
    'data-table-layout': (__VLS_ctx.displayPreferences.tableLayout),
    'data-effective-viewport': (`${__VLS_ctx.effectiveWidth}x${__VLS_ctx.effectiveHeight}`),
    'data-rotated-phone-portrait': (__VLS_ctx.isRotatedPhonePortrait ? 'true' : 'false'),
    'data-reduce-motion': (__VLS_ctx.displayPreferences.reduceMotion ? 'true' : 'false'),
    'data-card-color-assist': (__VLS_ctx.displayPreferences.showCardColorAssist ? 'true' : 'false'),
    'data-decision-attention': (__VLS_ctx.decisionAttention),
    'data-connection-state': (__VLS_ctx.connectionState),
    ...{ style: ({
            '--viewport-left': `${__VLS_ctx.viewportLeft}px`,
            '--viewport-top': `${__VLS_ctx.viewportTop}px`,
            '--physical-viewport-width': `${__VLS_ctx.viewportWidth}px`,
            '--physical-viewport-height': `${__VLS_ctx.viewportHeight}px`,
            '--effective-vw': `${__VLS_ctx.effectiveWidth / 100}px`,
            '--effective-vh': `${__VLS_ctx.effectiveHeight / 100}px`,
        }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "top" },
    ...{ class: ({
            'game-control-header': __VLS_ctx.showGameTools,
            'connection-alert': __VLS_ctx.showGameTools && __VLS_ctx.connectionState !== 'connected' && __VLS_ctx.connectionState !== 'restored',
        }) },
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
if (__VLS_ctx.showGameTools) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "compact-game-slogan" },
    });
}
if (!__VLS_ctx.showGameTools) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "top-slogan" },
    });
}
if ((__VLS_ctx.hasLobbySession || __VLS_ctx.isConnectingWithoutState) && !__VLS_ctx.showSyncingScreen) {
    /** @type {[typeof ConnectionStatus, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(ConnectionStatus, new ConnectionStatus({
        ...{ 'onRetry': {} },
        ...{ 'onLeave': {} },
        state: (__VLS_ctx.connectionState),
        attempt: (__VLS_ctx.reconnectAttempt),
        message: (__VLS_ctx.joinError),
        showConnected: (!__VLS_ctx.showGameTools),
        showLeave: (__VLS_ctx.connectionState === 'closed'),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onRetry': {} },
        ...{ 'onLeave': {} },
        state: (__VLS_ctx.connectionState),
        attempt: (__VLS_ctx.reconnectAttempt),
        message: (__VLS_ctx.joinError),
        showConnected: (!__VLS_ctx.showGameTools),
        showLeave: (__VLS_ctx.connectionState === 'closed'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onRetry: (__VLS_ctx.retryConnection)
    };
    const __VLS_7 = {
        onLeave: (__VLS_ctx.returnToModeSelectionFromRoom)
    };
    var __VLS_2;
}
if (!__VLS_ctx.showGameTools && __VLS_ctx.canOfferPwaInstall) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.requestPwaInstall) },
        ...{ class: "ghost reset-btn install-app-entry" },
        type: "button",
        'data-testid': "pwa-install-entry",
        'aria-label': "安装四色牌到桌面，以独立窗口打开",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 3v11m0 0 4-4m-4 4-4-4M5 16v4h14v-4",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "install-label-full" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "install-label-short" },
    });
}
/** @type {[typeof GameTools, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(GameTools, new GameTools({
    ...{ 'onSetContextHints': {} },
    ...{ 'onResetContextHints': {} },
    ...{ 'onToggleSessionMute': {} },
    ...{ 'onOpenRules': {} },
    ...{ 'onInstallApp': {} },
    ...{ 'onReturnToDecision': {} },
    ...{ 'onSetAutoPlay': {} },
    ...{ 'onQuickPhrase': {} },
    ...{ 'onSetQuickPhraseMuted': {} },
    ...{ 'onExit': {} },
    ref: "gameToolsRef",
    inRoom: (__VLS_ctx.showGameTools),
    tutorial: (Boolean(__VLS_ctx.tutorial)),
    contextHintsEnabled: (__VLS_ctx.contextHintsEnabled),
    resolvedTableLayout: (__VLS_ctx.resolvedTableLayout),
    playingContext: (__VLS_ctx.state?.phase === 'playing' || __VLS_ctx.state?.phase === 'declaring'),
    modelValue: (__VLS_ctx.displayPreferences),
    decisionActive: (__VLS_ctx.settingsDecisionActive),
    decisionUntimed: (__VLS_ctx.decisionTimer.untimed),
    decisionSecondsLeft: (__VLS_ctx.settingsDecisionSecondsLeft),
    actionLogs: (__VLS_ctx.actionLogs),
    players: (__VLS_ctx.players),
    mySeatId: (__VLS_ctx.mySeatId),
    autoPlay: (Boolean(__VLS_ctx.mePlayer?.isAutoPlay)),
    autoPlayPending: (__VLS_ctx.isEnded && !Boolean(__VLS_ctx.mePlayer?.isAutoPlay)),
    spokenTurnGuidanceSupported: (__VLS_ctx.spokenTurnGuidanceSupported),
    screenWakeLockSupported: (__VLS_ctx.screenWakeLockSupported),
    installAppAvailable: (__VLS_ctx.canOfferPwaInstall),
    quickPhraseMuted: (__VLS_ctx.quickPhraseMuted),
    sessionMuted: (__VLS_ctx.sessionAudioMuted),
    declaring: (__VLS_ctx.isDeclaring),
    quickPhraseBusy: (Boolean(__VLS_ctx.quickPhrase)),
}));
const __VLS_9 = __VLS_8({
    ...{ 'onSetContextHints': {} },
    ...{ 'onResetContextHints': {} },
    ...{ 'onToggleSessionMute': {} },
    ...{ 'onOpenRules': {} },
    ...{ 'onInstallApp': {} },
    ...{ 'onReturnToDecision': {} },
    ...{ 'onSetAutoPlay': {} },
    ...{ 'onQuickPhrase': {} },
    ...{ 'onSetQuickPhraseMuted': {} },
    ...{ 'onExit': {} },
    ref: "gameToolsRef",
    inRoom: (__VLS_ctx.showGameTools),
    tutorial: (Boolean(__VLS_ctx.tutorial)),
    contextHintsEnabled: (__VLS_ctx.contextHintsEnabled),
    resolvedTableLayout: (__VLS_ctx.resolvedTableLayout),
    playingContext: (__VLS_ctx.state?.phase === 'playing' || __VLS_ctx.state?.phase === 'declaring'),
    modelValue: (__VLS_ctx.displayPreferences),
    decisionActive: (__VLS_ctx.settingsDecisionActive),
    decisionUntimed: (__VLS_ctx.decisionTimer.untimed),
    decisionSecondsLeft: (__VLS_ctx.settingsDecisionSecondsLeft),
    actionLogs: (__VLS_ctx.actionLogs),
    players: (__VLS_ctx.players),
    mySeatId: (__VLS_ctx.mySeatId),
    autoPlay: (Boolean(__VLS_ctx.mePlayer?.isAutoPlay)),
    autoPlayPending: (__VLS_ctx.isEnded && !Boolean(__VLS_ctx.mePlayer?.isAutoPlay)),
    spokenTurnGuidanceSupported: (__VLS_ctx.spokenTurnGuidanceSupported),
    screenWakeLockSupported: (__VLS_ctx.screenWakeLockSupported),
    installAppAvailable: (__VLS_ctx.canOfferPwaInstall),
    quickPhraseMuted: (__VLS_ctx.quickPhraseMuted),
    sessionMuted: (__VLS_ctx.sessionAudioMuted),
    declaring: (__VLS_ctx.isDeclaring),
    quickPhraseBusy: (Boolean(__VLS_ctx.quickPhrase)),
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
let __VLS_11;
let __VLS_12;
let __VLS_13;
const __VLS_14 = {
    onSetContextHints: (__VLS_ctx.setContextHintsEnabled)
};
const __VLS_15 = {
    onResetContextHints: (__VLS_ctx.resetContextHints)
};
const __VLS_16 = {
    onToggleSessionMute: (...[$event]) => {
        __VLS_ctx.sessionAudioMuted = !__VLS_ctx.sessionAudioMuted;
    }
};
const __VLS_17 = {
    onOpenRules: (__VLS_ctx.openRules)
};
const __VLS_18 = {
    onInstallApp: (__VLS_ctx.requestPwaInstall)
};
const __VLS_19 = {
    onReturnToDecision: (__VLS_ctx.returnToDecision)
};
const __VLS_20 = {
    onSetAutoPlay: (__VLS_ctx.setAutoPlay)
};
const __VLS_21 = {
    onQuickPhrase: (__VLS_ctx.sendQuickPhrase)
};
const __VLS_22 = {
    onSetQuickPhraseMuted: (__VLS_ctx.setQuickPhraseMuted)
};
const __VLS_23 = {
    onExit: (__VLS_ctx.handleLeaveRoom)
};
/** @type {typeof __VLS_ctx.gameToolsRef} */ ;
var __VLS_24 = {};
var __VLS_10;
if (!__VLS_ctx.hasLobbySession && !__VLS_ctx.isConnectingWithoutState) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "meta" },
        ...{ class: ({ 'front-lobby-meta': __VLS_ctx.showModeLobby }) },
    });
    if (__VLS_ctx.showModeLobby) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.openNicknameDialog) },
            ...{ class: "ghost reset-btn change-name" },
            type: "button",
            'data-testid': "change-entry-name",
            disabled: (__VLS_ctx.enteringLobby),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.entryName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openRules) },
        ...{ class: "ghost reset-btn" },
        type: "button",
        'data-testid': "open-rules",
    });
}
if (__VLS_ctx.globalError && !__VLS_ctx.showSyncingScreen) {
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
if (__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId) {
    /** @type {[typeof LoginPage, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(LoginPage, new LoginPage({
        ...{ 'onUpdate:nickname': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onSelectHistory': {} },
        ...{ 'onRandomize': {} },
        nickname: (__VLS_ctx.entryName),
        entering: (__VLS_ctx.enteringLobby),
        primaryLabel: "加入好友房",
        friendInvite: (true),
        historyNames: (__VLS_ctx.nicknameHistory),
        storagePersistent: (__VLS_ctx.browserStoragePersistent),
    }));
    const __VLS_27 = __VLS_26({
        ...{ 'onUpdate:nickname': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onSelectHistory': {} },
        ...{ 'onRandomize': {} },
        nickname: (__VLS_ctx.entryName),
        entering: (__VLS_ctx.enteringLobby),
        primaryLabel: "加入好友房",
        friendInvite: (true),
        historyNames: (__VLS_ctx.nicknameHistory),
        storagePersistent: (__VLS_ctx.browserStoragePersistent),
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    let __VLS_29;
    let __VLS_30;
    let __VLS_31;
    const __VLS_32 = {
        'onUpdate:nickname': (...[$event]) => {
            if (!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                return;
            __VLS_ctx.entryName = $event;
        }
    };
    const __VLS_33 = {
        onSubmit: (__VLS_ctx.enterLobby)
    };
    const __VLS_34 = {
        onSelectHistory: (...[$event]) => {
            if (!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                return;
            __VLS_ctx.entryName = $event;
        }
    };
    const __VLS_35 = {
        onRandomize: (...[$event]) => {
            if (!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                return;
            __VLS_ctx.entryName = __VLS_ctx.generateRandomNickname();
        }
    };
    var __VLS_28;
}
else if (__VLS_ctx.showEntry) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "sync-shell" },
        role: "status",
    });
}
else if (__VLS_ctx.showModeLobby) {
    /** @type {[typeof LobbyPage, typeof LobbyPage, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(LobbyPage, new LobbyPage({
        ...{ 'onStart': {} },
        ...{ 'onSelectMode': {} },
        ...{ 'onCopyInvite': {} },
        ...{ 'onShareInvite': {} },
        ...{ 'onShowInviteQr': {} },
        ...{ 'onShareGame': {} },
        ...{ 'onClaimSeat': {} },
        ...{ 'onAddBot': {} },
        ...{ 'onFillBots': {} },
        ...{ 'onUpdateBot': {} },
        ...{ 'onRemoveSeat': {} },
        ...{ 'onLeaveRoom': {} },
        ...{ 'onDissolveRoom': {} },
        ...{ 'onSetScoringMode': {} },
        ...{ 'onOpenRules': {} },
        ...{ 'onSetLobbyReady': {} },
        ref: "lobbyPageRef",
        kicker: (__VLS_ctx.isWaiting ? '房间页' : '大厅页'),
        title: (__VLS_ctx.lobbyTitle),
        subtitle: (__VLS_ctx.lobbySubtitle),
        modes: (__VLS_ctx.state ? [] : __VLS_ctx.lobbyModes),
        selectedMode: (__VLS_ctx.selectedLobbyMode),
        canStart: (__VLS_ctx.canStartSelectedMode),
        startLabel: (__VLS_ctx.lobbyStartLabel),
        startHint: (__VLS_ctx.lobbyStartHint),
        startPending: ((__VLS_ctx.enteringLobby && !__VLS_ctx.hasLobbySession) || __VLS_ctx.roundStartPending),
        joinError: (__VLS_ctx.joinError),
        hostPlayerId: (__VLS_ctx.state?.hostPlayerId || ''),
        mySeatId: (__VLS_ctx.mySeatId),
        isHost: (__VLS_ctx.isHost),
        roomId: (__VLS_ctx.activeRoomId),
        roomMode: (__VLS_ctx.state?.roomMode || ''),
        matchSecondsLeft: (__VLS_ctx.matchSecondsLeft),
        scoringMode: (__VLS_ctx.state?.scoringMode || 'single'),
        completedRounds: (__VLS_ctx.state?.completedRounds || 0),
        guestProfileSummary: (__VLS_ctx.guestProfileSummary),
        guestProfileName: (__VLS_ctx.guestProfile?.nickname || __VLS_ctx.entryName),
        guestProfileRounds: (__VLS_ctx.guestProfile?.roundsPlayed || 0),
        guestProfileWins: (__VLS_ctx.guestProfile?.huWins || 0),
        guestProfileScore: (__VLS_ctx.guestProfile?.totalScore || 0),
        players: (__VLS_ctx.players),
        canShareInvite: (__VLS_ctx.canShareInvite),
        invitePending: (__VLS_ctx.inviteActionPending),
        seatClaimPending: (__VLS_ctx.seatClaimPending),
        readyPending: (__VLS_ctx.lobbyReadyPending),
    }));
    const __VLS_37 = __VLS_36({
        ...{ 'onStart': {} },
        ...{ 'onSelectMode': {} },
        ...{ 'onCopyInvite': {} },
        ...{ 'onShareInvite': {} },
        ...{ 'onShowInviteQr': {} },
        ...{ 'onShareGame': {} },
        ...{ 'onClaimSeat': {} },
        ...{ 'onAddBot': {} },
        ...{ 'onFillBots': {} },
        ...{ 'onUpdateBot': {} },
        ...{ 'onRemoveSeat': {} },
        ...{ 'onLeaveRoom': {} },
        ...{ 'onDissolveRoom': {} },
        ...{ 'onSetScoringMode': {} },
        ...{ 'onOpenRules': {} },
        ...{ 'onSetLobbyReady': {} },
        ref: "lobbyPageRef",
        kicker: (__VLS_ctx.isWaiting ? '房间页' : '大厅页'),
        title: (__VLS_ctx.lobbyTitle),
        subtitle: (__VLS_ctx.lobbySubtitle),
        modes: (__VLS_ctx.state ? [] : __VLS_ctx.lobbyModes),
        selectedMode: (__VLS_ctx.selectedLobbyMode),
        canStart: (__VLS_ctx.canStartSelectedMode),
        startLabel: (__VLS_ctx.lobbyStartLabel),
        startHint: (__VLS_ctx.lobbyStartHint),
        startPending: ((__VLS_ctx.enteringLobby && !__VLS_ctx.hasLobbySession) || __VLS_ctx.roundStartPending),
        joinError: (__VLS_ctx.joinError),
        hostPlayerId: (__VLS_ctx.state?.hostPlayerId || ''),
        mySeatId: (__VLS_ctx.mySeatId),
        isHost: (__VLS_ctx.isHost),
        roomId: (__VLS_ctx.activeRoomId),
        roomMode: (__VLS_ctx.state?.roomMode || ''),
        matchSecondsLeft: (__VLS_ctx.matchSecondsLeft),
        scoringMode: (__VLS_ctx.state?.scoringMode || 'single'),
        completedRounds: (__VLS_ctx.state?.completedRounds || 0),
        guestProfileSummary: (__VLS_ctx.guestProfileSummary),
        guestProfileName: (__VLS_ctx.guestProfile?.nickname || __VLS_ctx.entryName),
        guestProfileRounds: (__VLS_ctx.guestProfile?.roundsPlayed || 0),
        guestProfileWins: (__VLS_ctx.guestProfile?.huWins || 0),
        guestProfileScore: (__VLS_ctx.guestProfile?.totalScore || 0),
        players: (__VLS_ctx.players),
        canShareInvite: (__VLS_ctx.canShareInvite),
        invitePending: (__VLS_ctx.inviteActionPending),
        seatClaimPending: (__VLS_ctx.seatClaimPending),
        readyPending: (__VLS_ctx.lobbyReadyPending),
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    let __VLS_39;
    let __VLS_40;
    let __VLS_41;
    const __VLS_42 = {
        onStart: (__VLS_ctx.startSelectedMode)
    };
    const __VLS_43 = {
        onSelectMode: (__VLS_ctx.startLobbyMode)
    };
    const __VLS_44 = {
        onCopyInvite: (__VLS_ctx.copyInviteLink)
    };
    const __VLS_45 = {
        onShareInvite: (__VLS_ctx.shareInviteLink)
    };
    const __VLS_46 = {
        onShowInviteQr: (__VLS_ctx.showInviteQr)
    };
    const __VLS_47 = {
        onShareGame: (__VLS_ctx.shareGame)
    };
    const __VLS_48 = {
        onClaimSeat: (__VLS_ctx.requestSeatClaim)
    };
    const __VLS_49 = {
        onAddBot: (...[$event]) => {
            if (!!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                return;
            if (!!(__VLS_ctx.showEntry))
                return;
            if (!(__VLS_ctx.showModeLobby))
                return;
            __VLS_ctx.addBot($event, 50);
        }
    };
    const __VLS_50 = {
        onFillBots: (__VLS_ctx.fillBots)
    };
    const __VLS_51 = {
        onUpdateBot: (__VLS_ctx.updateBot)
    };
    const __VLS_52 = {
        onRemoveSeat: (__VLS_ctx.removeSeat)
    };
    const __VLS_53 = {
        onLeaveRoom: (__VLS_ctx.handleLeaveRoom)
    };
    const __VLS_54 = {
        onDissolveRoom: (__VLS_ctx.dissolveRoom)
    };
    const __VLS_55 = {
        onSetScoringMode: (__VLS_ctx.setScoringMode)
    };
    const __VLS_56 = {
        onOpenRules: (__VLS_ctx.openRules)
    };
    const __VLS_57 = {
        onSetLobbyReady: (__VLS_ctx.requestLobbyReady)
    };
    /** @type {typeof __VLS_ctx.lobbyPageRef} */ ;
    var __VLS_58 = {};
    __VLS_38.slots.default;
    {
        const { recommendation: __VLS_thisSlot } = __VLS_38.slots;
        if (__VLS_ctx.showModeLobby && !__VLS_ctx.state) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                            return;
                        if (!!(__VLS_ctx.showEntry))
                            return;
                        if (!(__VLS_ctx.showModeLobby))
                            return;
                        if (!(__VLS_ctx.showModeLobby && !__VLS_ctx.state))
                            return;
                        __VLS_ctx.startPracticeLobby(true);
                    } },
                ...{ class: "ghost tutorial-entry" },
                'data-testid': "tutorial-entry",
                disabled: (__VLS_ctx.enteringLobby),
            });
        }
        if (__VLS_ctx.showSmallScreenRecommendation) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
                ...{ class: "small-screen-recommendation" },
                'data-testid': "small-screen-recommendation",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.acceptCompactLayout) },
                type: "button",
                'data-testid': "recommend-compact",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.dismissLayoutRecommendation) },
                type: "button",
                'data-testid': "dismiss-compact-recommendation",
            });
        }
    }
    var __VLS_38;
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
    (__VLS_ctx.syncScreenCopy.kicker);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    (__VLS_ctx.syncScreenCopy.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "entry-desc" },
    });
    (__VLS_ctx.syncScreenCopy.description);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sync-actions" },
    });
    if (__VLS_ctx.syncCanRetry) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.retryConnection) },
            ...{ class: "resume-retry" },
            type: "button",
            'data-testid': "retry-session-entry",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.returnToModeSelectionFromRoom) },
        ref: "syncExitButtonRef",
        ...{ class: "resume-cancel" },
        type: "button",
        'data-testid': "cancel-session-resume",
    });
    /** @type {typeof __VLS_ctx.syncExitButtonRef} */ ;
    (__VLS_ctx.syncScreenCopy.cancelLabel);
}
else {
    /** @type {[typeof GameBoard, typeof GameBoard, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(GameBoard, new GameBoard({
        ...{ 'onGeometryBusy': {} },
        ...{ 'onDiscardCard': {} },
        ...{ 'onSubmitAction': {} },
        guidanceActive: (Boolean(__VLS_ctx.tutorial || __VLS_ctx.currentHint)),
        ...{ class: ({ 'small-table-viewport': __VLS_ctx.effectiveWidth <= 740 && __VLS_ctx.effectiveHeight <= 400 }) },
        state: (__VLS_ctx.state),
        players: (__VLS_ctx.players),
        privateHand: (__VLS_ctx.privateHand),
        tableLayout: (__VLS_ctx.resolvedTableLayout),
        handLayout: (__VLS_ctx.displayPreferences.handLayout),
        listeningHints: (__VLS_ctx.boardListeningHints),
        acceptedStateRevision: (__VLS_ctx.acceptedStateRevision),
        declarationMarks: (__VLS_ctx.declarationMarks),
        mySeatId: (__VLS_ctx.mySeatId),
        canDiscard: (__VLS_ctx.canDiscard),
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        interactionPausedMessage: (__VLS_ctx.interactionPausedMessage),
        deferredChiPending: (Boolean(__VLS_ctx.pendingDeferredChiIntent)),
        decisionUntimed: (__VLS_ctx.decisionTimer.untimed),
        decisionTimerTotalMs: (__VLS_ctx.decisionTimer.totalMs),
        decisionTimerEndsAt: (__VLS_ctx.decisionTimer.endsAt),
        decisionKey: (__VLS_ctx.decisionTimer.decisionKey),
        legalDiscardCardIds: (__VLS_ctx.decisionTimer.legalDiscardCardIds),
        actionFeedback: (__VLS_ctx.actionFeedback),
        ultraCompact: (__VLS_ctx.isUltraCompactViewport),
        ownCardMode: (__VLS_ctx.resolvedOwnCardMode),
        tableCardMode: (__VLS_ctx.resolvedTableCardMode),
        seatDirection: (__VLS_ctx.displayPreferences.seatDirection),
        reduceMotion: (__VLS_ctx.displayPreferences.reduceMotion),
        showCardColorAssist: (__VLS_ctx.displayPreferences.showCardColorAssist),
        viewportTransformed: (__VLS_ctx.isRotatedPhonePortrait),
        viewportTransformKey: (`${__VLS_ctx.viewportWidth}x${__VLS_ctx.viewportHeight}:${__VLS_ctx.viewportLeft},${__VLS_ctx.viewportTop}:${__VLS_ctx.isRotatedPhonePortrait ? 'rotated' : 'native'}`),
        quickPhrase: (__VLS_ctx.quickPhrase),
    }));
    const __VLS_61 = __VLS_60({
        ...{ 'onGeometryBusy': {} },
        ...{ 'onDiscardCard': {} },
        ...{ 'onSubmitAction': {} },
        guidanceActive: (Boolean(__VLS_ctx.tutorial || __VLS_ctx.currentHint)),
        ...{ class: ({ 'small-table-viewport': __VLS_ctx.effectiveWidth <= 740 && __VLS_ctx.effectiveHeight <= 400 }) },
        state: (__VLS_ctx.state),
        players: (__VLS_ctx.players),
        privateHand: (__VLS_ctx.privateHand),
        tableLayout: (__VLS_ctx.resolvedTableLayout),
        handLayout: (__VLS_ctx.displayPreferences.handLayout),
        listeningHints: (__VLS_ctx.boardListeningHints),
        acceptedStateRevision: (__VLS_ctx.acceptedStateRevision),
        declarationMarks: (__VLS_ctx.declarationMarks),
        mySeatId: (__VLS_ctx.mySeatId),
        canDiscard: (__VLS_ctx.canDiscard),
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        interactionPausedMessage: (__VLS_ctx.interactionPausedMessage),
        deferredChiPending: (Boolean(__VLS_ctx.pendingDeferredChiIntent)),
        decisionUntimed: (__VLS_ctx.decisionTimer.untimed),
        decisionTimerTotalMs: (__VLS_ctx.decisionTimer.totalMs),
        decisionTimerEndsAt: (__VLS_ctx.decisionTimer.endsAt),
        decisionKey: (__VLS_ctx.decisionTimer.decisionKey),
        legalDiscardCardIds: (__VLS_ctx.decisionTimer.legalDiscardCardIds),
        actionFeedback: (__VLS_ctx.actionFeedback),
        ultraCompact: (__VLS_ctx.isUltraCompactViewport),
        ownCardMode: (__VLS_ctx.resolvedOwnCardMode),
        tableCardMode: (__VLS_ctx.resolvedTableCardMode),
        seatDirection: (__VLS_ctx.displayPreferences.seatDirection),
        reduceMotion: (__VLS_ctx.displayPreferences.reduceMotion),
        showCardColorAssist: (__VLS_ctx.displayPreferences.showCardColorAssist),
        viewportTransformed: (__VLS_ctx.isRotatedPhonePortrait),
        viewportTransformKey: (`${__VLS_ctx.viewportWidth}x${__VLS_ctx.viewportHeight}:${__VLS_ctx.viewportLeft},${__VLS_ctx.viewportTop}:${__VLS_ctx.isRotatedPhonePortrait ? 'rotated' : 'native'}`),
        quickPhrase: (__VLS_ctx.quickPhrase),
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    let __VLS_63;
    let __VLS_64;
    let __VLS_65;
    const __VLS_66 = {
        onGeometryBusy: (...[$event]) => {
            if (!!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                return;
            if (!!(__VLS_ctx.showEntry))
                return;
            if (!!(__VLS_ctx.showModeLobby))
                return;
            if (!!(__VLS_ctx.showSyncingScreen))
                return;
            __VLS_ctx.viewportGeometryBusy = $event;
        }
    };
    const __VLS_67 = {
        onDiscardCard: (__VLS_ctx.sendDiscardCard)
    };
    const __VLS_68 = {
        onSubmitAction: (__VLS_ctx.onPanelSubmit)
    };
    __VLS_62.slots.default;
    {
        const { guidance: __VLS_thisSlot } = __VLS_62.slots;
        if (__VLS_ctx.currentHint && !__VLS_ctx.tutorial) {
            /** @type {[typeof ContextHint, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(ContextHint, new ContextHint({
                ...{ 'onDismiss': {} },
                ...{ 'onDisable': {} },
                concept: (__VLS_ctx.currentHint),
                text: (__VLS_ctx.contextHintText),
            }));
            const __VLS_70 = __VLS_69({
                ...{ 'onDismiss': {} },
                ...{ 'onDisable': {} },
                concept: (__VLS_ctx.currentHint),
                text: (__VLS_ctx.contextHintText),
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
            let __VLS_72;
            let __VLS_73;
            let __VLS_74;
            const __VLS_75 = {
                onDismiss: (__VLS_ctx.dismissContextHint)
            };
            const __VLS_76 = {
                onDisable: (...[$event]) => {
                    if (!!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                        return;
                    if (!!(__VLS_ctx.showEntry))
                        return;
                    if (!!(__VLS_ctx.showModeLobby))
                        return;
                    if (!!(__VLS_ctx.showSyncingScreen))
                        return;
                    if (!(__VLS_ctx.currentHint && !__VLS_ctx.tutorial))
                        return;
                    __VLS_ctx.setContextHintsEnabled(false);
                }
            };
            var __VLS_71;
        }
        if (__VLS_ctx.tutorial) {
            /** @type {[typeof TutorialGuide, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(TutorialGuide, new TutorialGuide({
                ...{ 'onNext': {} },
                ...{ 'onRestart': {} },
                step: (__VLS_ctx.tutorial.step),
                actions: (__VLS_ctx.availableActions),
            }));
            const __VLS_78 = __VLS_77({
                ...{ 'onNext': {} },
                ...{ 'onRestart': {} },
                step: (__VLS_ctx.tutorial.step),
                actions: (__VLS_ctx.availableActions),
            }, ...__VLS_functionalComponentArgsRest(__VLS_77));
            let __VLS_80;
            let __VLS_81;
            let __VLS_82;
            const __VLS_83 = {
                onNext: (...[$event]) => {
                    if (!!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                        return;
                    if (!!(__VLS_ctx.showEntry))
                        return;
                    if (!!(__VLS_ctx.showModeLobby))
                        return;
                    if (!!(__VLS_ctx.showSyncingScreen))
                        return;
                    if (!(__VLS_ctx.tutorial))
                        return;
                    __VLS_ctx.sendTutorialCommand('next');
                }
            };
            const __VLS_84 = {
                onRestart: (...[$event]) => {
                    if (!!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                        return;
                    if (!!(__VLS_ctx.showEntry))
                        return;
                    if (!!(__VLS_ctx.showModeLobby))
                        return;
                    if (!!(__VLS_ctx.showSyncingScreen))
                        return;
                    if (!(__VLS_ctx.tutorial))
                        return;
                    __VLS_ctx.sendTutorialCommand('restart');
                }
            };
            var __VLS_79;
        }
    }
    {
        const { declaration: __VLS_thisSlot } = __VLS_62.slots;
        if (__VLS_ctx.shouldShowDeclarePanel) {
            /** @type {[typeof DeclarationPanel, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(DeclarationPanel, new DeclarationPanel({
                ...{ 'onMarks': {} },
                ...{ 'onSubmitFish': {} },
                ...{ 'onSubmitKongs': {} },
                embedded: true,
                hand: (__VLS_ctx.privateHand),
                step: (__VLS_ctx.mePlayer?.declarationStep || 'fish'),
                submitted: (__VLS_ctx.isDeclareSubmitted),
                handReady: (__VLS_ctx.privateHandSynchronized),
                secondsLeft: (__VLS_ctx.declareSecondsLeft),
                progressPercent: (__VLS_ctx.declareProgressPercent),
                serverError: (__VLS_ctx.declareError),
                connectionReady: (__VLS_ctx.connected),
                compact: (__VLS_ctx.isCompactViewport),
                ultraCompact: (__VLS_ctx.isUltraCompactViewport),
                cardMode: (__VLS_ctx.resolvedOwnCardMode),
                untimed: (__VLS_ctx.decisionTimer.untimed),
                decisionKey: (__VLS_ctx.decisionTimer.decisionKey),
            }));
            const __VLS_86 = __VLS_85({
                ...{ 'onMarks': {} },
                ...{ 'onSubmitFish': {} },
                ...{ 'onSubmitKongs': {} },
                embedded: true,
                hand: (__VLS_ctx.privateHand),
                step: (__VLS_ctx.mePlayer?.declarationStep || 'fish'),
                submitted: (__VLS_ctx.isDeclareSubmitted),
                handReady: (__VLS_ctx.privateHandSynchronized),
                secondsLeft: (__VLS_ctx.declareSecondsLeft),
                progressPercent: (__VLS_ctx.declareProgressPercent),
                serverError: (__VLS_ctx.declareError),
                connectionReady: (__VLS_ctx.connected),
                compact: (__VLS_ctx.isCompactViewport),
                ultraCompact: (__VLS_ctx.isUltraCompactViewport),
                cardMode: (__VLS_ctx.resolvedOwnCardMode),
                untimed: (__VLS_ctx.decisionTimer.untimed),
                decisionKey: (__VLS_ctx.decisionTimer.decisionKey),
            }, ...__VLS_functionalComponentArgsRest(__VLS_85));
            let __VLS_88;
            let __VLS_89;
            let __VLS_90;
            const __VLS_91 = {
                onMarks: (...[$event]) => {
                    if (!!(__VLS_ctx.showEntry && __VLS_ctx.entryInviteRoomId))
                        return;
                    if (!!(__VLS_ctx.showEntry))
                        return;
                    if (!!(__VLS_ctx.showModeLobby))
                        return;
                    if (!!(__VLS_ctx.showSyncingScreen))
                        return;
                    if (!(__VLS_ctx.shouldShowDeclarePanel))
                        return;
                    __VLS_ctx.declarationMarks = $event;
                }
            };
            const __VLS_92 = {
                onSubmitFish: (__VLS_ctx.submitFishDeclaration)
            };
            const __VLS_93 = {
                onSubmitKongs: (__VLS_ctx.submitKongDeclaration)
            };
            var __VLS_87;
        }
    }
    var __VLS_62;
}
if (__VLS_ctx.inviteCopyFallbackUrl) {
    /** @type {[typeof InviteLinkFallbackDialog, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(InviteLinkFallbackDialog, new InviteLinkFallbackDialog({
        ...{ 'onClose': {} },
        url: (__VLS_ctx.inviteCopyFallbackUrl),
    }));
    const __VLS_95 = __VLS_94({
        ...{ 'onClose': {} },
        url: (__VLS_ctx.inviteCopyFallbackUrl),
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
    let __VLS_97;
    let __VLS_98;
    let __VLS_99;
    const __VLS_100 = {
        onClose: (__VLS_ctx.closeInviteCopyFallback)
    };
    var __VLS_96;
}
if (__VLS_ctx.inviteQrUrl) {
    const __VLS_101 = {}.FriendInviteQrDialog;
    /** @type {[typeof __VLS_components.FriendInviteQrDialog, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
        ...{ 'onClose': {} },
        url: (__VLS_ctx.inviteQrUrl),
        roomId: (__VLS_ctx.inviteQrRoomId),
    }));
    const __VLS_103 = __VLS_102({
        ...{ 'onClose': {} },
        url: (__VLS_ctx.inviteQrUrl),
        roomId: (__VLS_ctx.inviteQrRoomId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    let __VLS_105;
    let __VLS_106;
    let __VLS_107;
    const __VLS_108 = {
        onClose: (__VLS_ctx.closeInviteQr)
    };
    var __VLS_104;
}
if (__VLS_ctx.pwaInstallGuide) {
    /** @type {[typeof PwaInstallDialog, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(PwaInstallDialog, new PwaInstallDialog({
        ...{ 'onClose': {} },
        guide: (__VLS_ctx.pwaInstallGuide),
    }));
    const __VLS_110 = __VLS_109({
        ...{ 'onClose': {} },
        guide: (__VLS_ctx.pwaInstallGuide),
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    let __VLS_112;
    let __VLS_113;
    let __VLS_114;
    const __VLS_115 = {
        onClose: (__VLS_ctx.closePwaInstallGuide)
    };
    var __VLS_111;
}
if (__VLS_ctx.showEndPanel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hu-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ref: "settlementPanelRef",
        ...{ class: "hu-panel" },
        'data-testid': "settlement-panel",
        role: "dialog",
        'aria-labelledby': "settlement-panel-title",
        'aria-busy': (!__VLS_ctx.settlementReady),
        tabindex: "-1",
    });
    /** @type {typeof __VLS_ctx.settlementPanelRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settlement-fixed-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "settlement-panel-title",
    });
    (__VLS_ctx.endPanelTitle);
    if (!__VLS_ctx.settlementReady) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "settlement-loading" },
            'data-testid': "settlement-loading",
            role: "status",
            'aria-live': "polite",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "round-overview" },
            'data-testid': "round-overview",
            role: "status",
            'aria-live': "polite",
        });
        if (__VLS_ctx.isCumulativeSettlement) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "round-number" },
            });
            (__VLS_ctx.settlementRoundNumber);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.roundOutcomeText);
        if (__VLS_ctx.mySettlementPlayer) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({
                ...{ class: (__VLS_ctx.scoreToneClass(__VLS_ctx.mySettlementPlayer.totalScore)) },
            });
            (__VLS_ctx.signedScore(__VLS_ctx.mySettlementPlayer.totalScore));
        }
        if (__VLS_ctx.isCumulativeSettlement && __VLS_ctx.mySettlementPlayer) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "cumulative-overview" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({
                ...{ class: (__VLS_ctx.scoreToneClass(__VLS_ctx.mySettlementPlayer.cumulativeScore)) },
            });
            (__VLS_ctx.signedScore(__VLS_ctx.mySettlementPlayer.cumulativeScore));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "settlement-overview-help" },
        });
    }
    if (__VLS_ctx.settlementReady) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "settlement-scroll-region" },
            'data-testid': "settlement-scroll-region",
            role: "region",
            'aria-label': "各家结算与计分明细",
            tabindex: "0",
        });
        if (!__VLS_ctx.derivedWinnerId) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.endSummary);
        }
        if (__VLS_ctx.roundDealerCard) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "end-global-info" },
            });
            (__VLS_ctx.cardLabel(__VLS_ctx.roundDealerCard));
        }
        if (__VLS_ctx.settlementPlayers.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "settlement settlement-player-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "settlement-list" },
            });
            for (const [p] of __VLS_getVForSourceType((__VLS_ctx.orderedSettlementPlayers))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.details, __VLS_intrinsicElements.details)({
                    key: (`settle-${p.clientId}`),
                    ...{ class: "settlement-item" },
                    ...{ class: ({ winner: __VLS_ctx.isSettlementWinner(p) }) },
                    open: (!__VLS_ctx.isCompactViewport),
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.summary, __VLS_intrinsicElements.summary)({
                    ...{ class: "settlement-head" },
                    'data-testid': "settlement-player-summary",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "settlement-person" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
                    ...{ class: "settlement-name" },
                });
                (p.name);
                if (p.isConfiguredBot) {
                    /** @type {[typeof PlayerStatusIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_116 = __VLS_asFunctionalComponent(PlayerStatusIcon, new PlayerStatusIcon({
                        isConfiguredBot: (true),
                    }));
                    const __VLS_117 = __VLS_116({
                        isConfiguredBot: (true),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
                }
                if (p.clientId === __VLS_ctx.mySeatId) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                }
                if (__VLS_ctx.isSettlementWinner(p)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                    ...{ class: "settlement-meta" },
                });
                (p.hand.length);
                (p.discardCount);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "settlement-result" },
                });
                if (__VLS_ctx.isCumulativeSettlement) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                        ...{ class: "score-caption" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
                    ...{ class: "score-total" },
                    ...{ class: (__VLS_ctx.scoreToneClass(p.totalScore)) },
                });
                (__VLS_ctx.signedScore(p.totalScore));
                if (__VLS_ctx.isCumulativeSettlement) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                        ...{ class: "cumulative-total" },
                        ...{ class: (__VLS_ctx.scoreToneClass(p.cumulativeScore)) },
                    });
                    (__VLS_ctx.signedScore(p.cumulativeScore));
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                    ...{ class: "settlement-toggle-label" },
                    'aria-hidden': "true",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "settlement-toggle-closed" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "settlement-toggle-open" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "settlement-item-body" },
                });
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
                            const __VLS_119 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                                key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                                card: (card),
                                size: "sm",
                                mode: (__VLS_ctx.resolvedTableCardMode),
                            }));
                            const __VLS_120 = __VLS_119({
                                key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                                card: (card),
                                size: "sm",
                                mode: (__VLS_ctx.resolvedTableCardMode),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_119));
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
                            const __VLS_122 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                                key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                                card: (card),
                                size: "sm",
                                mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                            }));
                            const __VLS_123 = __VLS_122({
                                key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                                card: (card),
                                size: "sm",
                                mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_122));
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
                        const __VLS_125 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`settle-${p.clientId}-${card.id}`),
                            card: (card),
                            size: "sm",
                            mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                        }));
                        const __VLS_126 = __VLS_125({
                            key: (`settle-${p.clientId}-${card.id}`),
                            card: (card),
                            size: "sm",
                            mode: (__VLS_ctx.settlementHandCardMode(p.clientId)),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
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
        if (__VLS_ctx.winnerSettlementPlayer && __VLS_ctx.huCalculationLines.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "settlement scoring-explain" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "score-formula" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.participantDisplayName(__VLS_ctx.winnerSettlementPlayer));
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
                const __VLS_128 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`remain-${card.id}`),
                    card: (card),
                    size: "sm",
                    mode: (__VLS_ctx.resolvedTableCardMode),
                }));
                const __VLS_129 = __VLS_128({
                    key: (`remain-${card.id}`),
                    card: (card),
                    size: "sm",
                    mode: (__VLS_ctx.resolvedTableCardMode),
                }, ...__VLS_functionalComponentArgsRest(__VLS_128));
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "end-actions" },
    });
    if (__VLS_ctx.tutorial) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.showEndPanel))
                        return;
                    if (!(__VLS_ctx.tutorial))
                        return;
                    __VLS_ctx.finishTutorial(false);
                } },
            ...{ class: "primary" },
            'data-testid': "tutorial-practice",
            disabled: (__VLS_ctx.enteringLobby),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.showEndPanel))
                        return;
                    if (!(__VLS_ctx.tutorial))
                        return;
                    __VLS_ctx.finishTutorial(true);
                } },
            ...{ class: "ghost" },
            'data-testid': "tutorial-invite",
            disabled: (__VLS_ctx.enteringLobby),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    else if (__VLS_ctx.state?.roomMode === 'match') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.rematchQuickTable) },
            ...{ class: "primary" },
            type: "button",
            'data-testid': "quick-rematch",
            disabled: (!__VLS_ctx.settlementReady || __VLS_ctx.quickRematchPending),
        });
        (__VLS_ctx.quickRematchPending ? "正在重新配桌…" : "再来一局（重新配桌）");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "host-actions-hint" },
        });
    }
    else if (__VLS_ctx.state?.roomMode === 'practice') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.requestNextRound) },
            ref: "nextRoundTriggerRef",
            ...{ class: "primary" },
            type: "button",
            'data-testid': "next-round-trigger",
            disabled: (!__VLS_ctx.settlementReady || __VLS_ctx.settlementTransitionPending !== null),
        });
        /** @type {typeof __VLS_ctx.nextRoundTriggerRef} */ ;
        (!__VLS_ctx.settlementReady
            ? "正在结算…"
            : __VLS_ctx.settlementTransitionPending === "next_round"
                ? "正在开始下一局…"
                : "再练一局");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.returnPracticeToModeSelection) },
            ...{ class: "ghost" },
            type: "button",
            'data-testid': "practice-return-to-modes",
            disabled: (!__VLS_ctx.settlementReady || __VLS_ctx.settlementTransitionPending !== null),
        });
        if (__VLS_ctx.settlementTransitionPending === 'next_round') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "host-actions-hint" },
                'data-testid': "settlement-transition-status",
                role: "status",
                'aria-live': "polite",
            });
        }
    }
    else if (__VLS_ctx.isHost) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.requestNextRound) },
            ref: "nextRoundTriggerRef",
            ...{ class: "primary" },
            type: "button",
            'data-testid': "next-round-trigger",
            disabled: (!__VLS_ctx.settlementReady || __VLS_ctx.settlementTransitionPending !== null),
        });
        /** @type {typeof __VLS_ctx.nextRoundTriggerRef} */ ;
        (!__VLS_ctx.settlementReady
            ? "正在结算…"
            : __VLS_ctx.settlementTransitionPending === "next_round"
                ? "正在开始下一局…"
                : "下一局（房主）");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.requestReturnLobby) },
            ref: "returnLobbyTriggerRef",
            ...{ class: "ghost" },
            type: "button",
            'data-testid': "return-lobby-trigger",
            disabled: (!__VLS_ctx.settlementReady || __VLS_ctx.settlementTransitionPending !== null),
        });
        /** @type {typeof __VLS_ctx.returnLobbyTriggerRef} */ ;
        (__VLS_ctx.settlementTransitionPending === "return_lobby" ? "正在返回房间大厅…" : "全桌返回大厅（房主）");
        if (__VLS_ctx.settlementTransitionPending) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "host-actions-hint" },
                'data-testid': "settlement-transition-status",
                role: "status",
                'aria-live': "polite",
            });
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "host-actions-hint" },
        });
    }
}
if (__VLS_ctx.confirmingNextRound) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.cancelNextRound) },
        ...{ class: "table-return-mask" },
        'data-testid': "next-round-mask",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ onKeydown: (__VLS_ctx.cancelNextRound) },
        ...{ onKeydown: (__VLS_ctx.trapNextRoundFocus) },
        ref: "nextRoundDialogRef",
        ...{ class: "table-return-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "next-round-title",
        'aria-describedby': "next-round-description",
        tabindex: "-1",
    });
    /** @type {typeof __VLS_ctx.nextRoundDialogRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-return-symbol next-round" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "next-round-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        id: "next-round-description",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-return-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.cancelNextRound) },
        ref: "nextRoundCancelRef",
        type: "button",
        'data-testid': "cancel-next-round",
    });
    /** @type {typeof __VLS_ctx.nextRoundCancelRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.confirmNextRound) },
        ...{ class: "primary" },
        type: "button",
        'data-testid': "confirm-next-round",
    });
}
if (__VLS_ctx.confirmingReturnLobby) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.cancelReturnLobby) },
        ...{ class: "table-return-mask" },
        'data-testid': "table-return-mask",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ onKeydown: (__VLS_ctx.cancelReturnLobby) },
        ...{ onKeydown: (__VLS_ctx.trapReturnLobbyFocus) },
        ref: "returnLobbyDialogRef",
        ...{ class: "table-return-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "table-return-title",
        'aria-describedby': "table-return-description",
        tabindex: "-1",
    });
    /** @type {typeof __VLS_ctx.returnLobbyDialogRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-return-symbol" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "table-return-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        id: "table-return-description",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-return-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.cancelReturnLobby) },
        ref: "returnLobbyCancelRef",
        type: "button",
        'data-testid': "cancel-table-return",
    });
    /** @type {typeof __VLS_ctx.returnLobbyCancelRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.confirmReturnLobby) },
        ...{ class: "danger" },
        type: "button",
        'data-testid': "confirm-table-return",
    });
}
if (__VLS_ctx.confirmingResumeAbandon) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.cancelResumeAbandon) },
        ...{ class: "table-return-mask" },
        'data-testid': "resume-abandon-mask",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ onKeydown: (__VLS_ctx.cancelResumeAbandon) },
        ...{ onKeydown: (__VLS_ctx.trapResumeAbandonFocus) },
        ref: "resumeAbandonDialogRef",
        ...{ class: "table-return-dialog" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "resume-abandon-title",
        'aria-describedby': "resume-abandon-description",
        tabindex: "-1",
    });
    /** @type {typeof __VLS_ctx.resumeAbandonDialogRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-return-symbol" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "resume-abandon-title",
    });
    (__VLS_ctx.syncCancelDialogCopy.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        id: "resume-abandon-description",
    });
    (__VLS_ctx.syncCancelDialogCopy.description);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-return-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.cancelResumeAbandon) },
        ref: "resumeAbandonCancelRef",
        type: "button",
        'data-testid': "cancel-resume-abandon",
    });
    /** @type {typeof __VLS_ctx.resumeAbandonCancelRef} */ ;
    (__VLS_ctx.syncCancelDialogCopy.keepLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.confirmResumeAbandon) },
        ...{ class: "danger" },
        type: "button",
        'data-testid': "confirm-resume-abandon",
    });
    (__VLS_ctx.syncCancelDialogCopy.confirmLabel);
}
if (__VLS_ctx.nicknameDialogOpen) {
    /** @type {[typeof NicknameDialog, ]} */ ;
    // @ts-ignore
    const __VLS_131 = __VLS_asFunctionalComponent(NicknameDialog, new NicknameDialog({
        ...{ 'onSave': {} },
        ...{ 'onClose': {} },
        ...{ 'onRandomize': {} },
        nickname: (__VLS_ctx.entryName),
        history: (__VLS_ctx.nicknameHistory),
        randomName: (__VLS_ctx.nicknameDraftRandom),
    }));
    const __VLS_132 = __VLS_131({
        ...{ 'onSave': {} },
        ...{ 'onClose': {} },
        ...{ 'onRandomize': {} },
        nickname: (__VLS_ctx.entryName),
        history: (__VLS_ctx.nicknameHistory),
        randomName: (__VLS_ctx.nicknameDraftRandom),
    }, ...__VLS_functionalComponentArgsRest(__VLS_131));
    let __VLS_134;
    let __VLS_135;
    let __VLS_136;
    const __VLS_137 = {
        onSave: (__VLS_ctx.saveNickname)
    };
    const __VLS_138 = {
        onClose: (__VLS_ctx.closeNicknameDialog)
    };
    const __VLS_139 = {
        onRandomize: (...[$event]) => {
            if (!(__VLS_ctx.nicknameDialogOpen))
                return;
            __VLS_ctx.nicknameDraftRandom = __VLS_ctx.generateRandomNickname();
        }
    };
    var __VLS_133;
}
if (__VLS_ctx.showRules) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showRules))
                    return;
                __VLS_ctx.closeRules();
            } },
        ...{ class: "rules-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onKeydown: (...[$event]) => {
                if (!(__VLS_ctx.showRules))
                    return;
                __VLS_ctx.closeRules();
            } },
        ...{ onKeydown: (__VLS_ctx.trapRulesFocus) },
        ref: "rulesPanelRef",
        ...{ class: "rules-panel" },
        'data-testid': "rules-panel",
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "rules-panel-title",
        tabindex: "-1",
    });
    /** @type {typeof __VLS_ctx.rulesPanelRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rules-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "rules-kicker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "rules-panel-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "rules-slogan" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showRules))
                    return;
                __VLS_ctx.closeRules();
            } },
        ref: "rulesCloseButtonRef",
        ...{ class: "ghost" },
        'data-testid': "close-rules",
    });
    /** @type {typeof __VLS_ctx.rulesCloseButtonRef} */ ;
    if (__VLS_ctx.settingsDecisionActive) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rules-decision-reminder" },
            'data-testid': "rules-decision-reminder",
            role: "status",
            'aria-live': "polite",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.settingsDecisionTimeText);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.returnToDecisionFromRules) },
            type: "button",
            'data-testid': "rules-return-to-decision",
        });
        (__VLS_ctx.isDeclaring ? "返回声明" : "返回出牌");
    }
    /** @type {[typeof RulesGuide, ]} */ ;
    // @ts-ignore
    const __VLS_140 = __VLS_asFunctionalComponent(RulesGuide, new RulesGuide({
        ...{ class: "rules-content" },
        phase: (__VLS_ctx.state?.phase),
    }));
    const __VLS_141 = __VLS_140({
        ...{ class: "rules-content" },
        phase: (__VLS_ctx.state?.phase),
    }, ...__VLS_functionalComponentArgsRest(__VLS_140));
}
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-lockup']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-suits']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-game-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['top-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['install-app-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['install-label-full']} */ ;
/** @type {__VLS_StyleScopedClasses['install-label-short']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['change-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['global-error']} */ ;
/** @type {__VLS_StyleScopedClasses['global-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['tutorial-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['small-screen-recommendation']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-message']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['resume-retry']} */ ;
/** @type {__VLS_StyleScopedClasses['resume-cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-fixed-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['round-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['round-number']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-overview-help']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-scroll-region']} */ ;
/** @type {__VLS_StyleScopedClasses['end-global-info']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-player-section']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-person']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-name']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-result']} */ ;
/** @type {__VLS_StyleScopedClasses['score-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['cumulative-total']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-toggle-label']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-toggle-closed']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-toggle-open']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item-body']} */ ;
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
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['scoring-explain']} */ ;
/** @type {__VLS_StyleScopedClasses['score-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['remaining-deck']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['host-actions-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['host-actions-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['host-actions-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['host-actions-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['next-round']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['table-return-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-decision-reminder']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-content']} */ ;
// @ts-ignore
var __VLS_25 = __VLS_24, __VLS_59 = __VLS_58;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            LoginPage: LoginPage,
            ContextHint: ContextHint,
            TutorialGuide: TutorialGuide,
            CardComp: CardComp,
            PlayerStatusIcon: PlayerStatusIcon,
            ConnectionStatus: ConnectionStatus,
            RulesGuide: RulesGuide,
            DeclarationPanel: DeclarationPanel,
            GameBoard: GameBoard,
            GameTools: GameTools,
            InviteLinkFallbackDialog: InviteLinkFallbackDialog,
            LobbyPage: LobbyPage,
            NicknameDialog: NicknameDialog,
            PwaInstallDialog: PwaInstallDialog,
            sessionAudioMuted: sessionAudioMuted,
            FriendInviteQrDialog: FriendInviteQrDialog,
            browserStoragePersistent: browserStoragePersistent,
            canOfferPwaInstall: canOfferPwaInstall,
            pwaInstallGuide: pwaInstallGuide,
            requestPwaInstall: requestPwaInstall,
            closePwaInstallGuide: closePwaInstallGuide,
            generateRandomNickname: generateRandomNickname,
            guestProfile: guestProfile,
            connected: connected,
            connectionState: connectionState,
            reconnectAttempt: reconnectAttempt,
            retryConnection: retryConnection,
            mySeatId: mySeatId,
            activeRoomId: activeRoomId,
            state: state,
            players: players,
            privateHand: privateHand,
            acceptedStateRevision: acceptedStateRevision,
            quickPhrase: quickPhrase,
            quickPhraseMuted: quickPhraseMuted,
            availableActions: availableActions,
            joinError: joinError,
            declareError: declareError,
            actionLogs: actionLogs,
            actionFeedback: actionFeedback,
            decisionTimer: decisionTimer,
            tutorial: tutorial,
            sendTutorialCommand: sendTutorialCommand,
            sendDiscardCard: sendDiscardCard,
            dissolveRoom: dissolveRoom,
            setScoringMode: setScoringMode,
            setAutoPlay: setAutoPlay,
            addBot: addBot,
            fillBots: fillBots,
            updateBot: updateBot,
            removeSeat: removeSeat,
            sendQuickPhrase: sendQuickPhrase,
            setQuickPhraseMuted: setQuickPhraseMuted,
            guestProfileSummary: guestProfileSummary,
            boardListeningHints: boardListeningHints,
            entryName: entryName,
            nicknameHistory: nicknameHistory,
            entryInviteRoomId: entryInviteRoomId,
            enteringLobby: enteringLobby,
            roundStartPending: roundStartPending,
            seatClaimPending: seatClaimPending,
            lobbyReadyPending: lobbyReadyPending,
            selectedLobbyMode: selectedLobbyMode,
            lobbyModes: lobbyModes,
            returnToModeSelectionFromRoom: returnToModeSelectionFromRoom,
            isWaiting: isWaiting,
            isDeclaring: isDeclaring,
            isPlaying: isPlaying,
            isEnded: isEnded,
            isHost: isHost,
            mePlayer: mePlayer,
            hasLobbySession: hasLobbySession,
            isConnectingWithoutState: isConnectingWithoutState,
            showEntry: showEntry,
            showSyncingScreen: showSyncingScreen,
            syncCanRetry: syncCanRetry,
            syncScreenCopy: syncScreenCopy,
            syncCancelDialogCopy: syncCancelDialogCopy,
            showModeLobby: showModeLobby,
            showGameTools: showGameTools,
            canStartSelectedMode: canStartSelectedMode,
            lobbyTitle: lobbyTitle,
            lobbySubtitle: lobbySubtitle,
            lobbyStartLabel: lobbyStartLabel,
            lobbyStartHint: lobbyStartHint,
            matchSecondsLeft: matchSecondsLeft,
            isMyTurn: isMyTurn,
            decisionAttention: decisionAttention,
            privateHandSynchronized: privateHandSynchronized,
            canAct: canAct,
            canDiscard: canDiscard,
            contextHintsEnabled: contextHintsEnabled,
            currentHint: currentHint,
            contextHintText: contextHintText,
            dismissContextHint: dismissContextHint,
            setContextHintsEnabled: setContextHintsEnabled,
            resetContextHints: resetContextHints,
            interactionPausedMessage: interactionPausedMessage,
            pendingDeferredChiIntent: pendingDeferredChiIntent,
            viewportGeometryBusy: viewportGeometryBusy,
            effectiveHeight: effectiveHeight,
            effectiveWidth: effectiveWidth,
            isCompactViewport: isCompactViewport,
            isLegacyCompactViewport: isLegacyCompactViewport,
            isRotatedPhonePortrait: isRotatedPhonePortrait,
            isUltraCompactViewport: isUltraCompactViewport,
            viewportHeight: viewportHeight,
            viewportWidth: viewportWidth,
            viewportLeft: viewportLeft,
            viewportTop: viewportTop,
            displayPreferences: displayPreferences,
            resolvedTableLayout: resolvedTableLayout,
            showSmallScreenRecommendation: showSmallScreenRecommendation,
            dismissLayoutRecommendation: dismissLayoutRecommendation,
            acceptCompactLayout: acceptCompactLayout,
            resolvedOwnCardMode: resolvedOwnCardMode,
            resolvedTableCardMode: resolvedTableCardMode,
            globalError: globalError,
            globalNotice: globalNotice,
            gameToolsRef: gameToolsRef,
            lobbyPageRef: lobbyPageRef,
            inviteCopyFallbackUrl: inviteCopyFallbackUrl,
            inviteQrUrl: inviteQrUrl,
            inviteQrRoomId: inviteQrRoomId,
            canShareInvite: canShareInvite,
            inviteActionPending: inviteActionPending,
            declarationMarks: declarationMarks,
            showRules: showRules,
            rulesPanelRef: rulesPanelRef,
            rulesCloseButtonRef: rulesCloseButtonRef,
            settlementPanelRef: settlementPanelRef,
            confirmingNextRound: confirmingNextRound,
            nextRoundTriggerRef: nextRoundTriggerRef,
            nextRoundDialogRef: nextRoundDialogRef,
            nextRoundCancelRef: nextRoundCancelRef,
            confirmingReturnLobby: confirmingReturnLobby,
            returnLobbyTriggerRef: returnLobbyTriggerRef,
            returnLobbyDialogRef: returnLobbyDialogRef,
            returnLobbyCancelRef: returnLobbyCancelRef,
            settlementTransitionPending: settlementTransitionPending,
            quickRematchPending: quickRematchPending,
            confirmingResumeAbandon: confirmingResumeAbandon,
            syncExitButtonRef: syncExitButtonRef,
            resumeAbandonDialogRef: resumeAbandonDialogRef,
            resumeAbandonCancelRef: resumeAbandonCancelRef,
            showEndPanel: showEndPanel,
            isDeclareSubmitted: isDeclareSubmitted,
            shouldShowDeclarePanel: shouldShowDeclarePanel,
            settingsDecisionActive: settingsDecisionActive,
            settingsDecisionSecondsLeft: settingsDecisionSecondsLeft,
            settingsDecisionTimeText: settingsDecisionTimeText,
            openRules: openRules,
            returnToDecision: returnToDecision,
            returnToDecisionFromRules: returnToDecisionFromRules,
            closeRules: closeRules,
            trapRulesFocus: trapRulesFocus,
            requestNextRound: requestNextRound,
            rematchQuickTable: rematchQuickTable,
            returnPracticeToModeSelection: returnPracticeToModeSelection,
            cancelNextRound: cancelNextRound,
            confirmNextRound: confirmNextRound,
            trapNextRoundFocus: trapNextRoundFocus,
            requestReturnLobby: requestReturnLobby,
            cancelReturnLobby: cancelReturnLobby,
            confirmReturnLobby: confirmReturnLobby,
            trapReturnLobbyFocus: trapReturnLobbyFocus,
            cancelResumeAbandon: cancelResumeAbandon,
            confirmResumeAbandon: confirmResumeAbandon,
            trapResumeAbandonFocus: trapResumeAbandonFocus,
            spokenTurnGuidanceSupported: spokenTurnGuidanceSupported,
            screenWakeLockSupported: screenWakeLockSupported,
            declareSecondsLeft: declareSecondsLeft,
            declareProgressPercent: declareProgressPercent,
            requestSeatClaim: requestSeatClaim,
            requestLobbyReady: requestLobbyReady,
            handleLeaveRoom: handleLeaveRoom,
            onPanelSubmit: onPanelSubmit,
            cardLabel: cardLabel,
            submitFishDeclaration: submitFishDeclaration,
            submitKongDeclaration: submitKongDeclaration,
            endPanelTitle: endPanelTitle,
            derivedWinnerId: derivedWinnerId,
            participantDisplayName: participantDisplayName,
            roundOutcomeText: roundOutcomeText,
            settlementPlayers: settlementPlayers,
            settlementReady: settlementReady,
            isCumulativeSettlement: isCumulativeSettlement,
            settlementRoundNumber: settlementRoundNumber,
            mySettlementPlayer: mySettlementPlayer,
            orderedSettlementPlayers: orderedSettlementPlayers,
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
            roundDealerCard: roundDealerCard,
            enterLobby: enterLobby,
            nicknameDialogOpen: nicknameDialogOpen,
            nicknameDraftRandom: nicknameDraftRandom,
            openNicknameDialog: openNicknameDialog,
            closeNicknameDialog: closeNicknameDialog,
            saveNickname: saveNickname,
            startLobbyMode: startLobbyMode,
            startSelectedMode: startSelectedMode,
            finishTutorial: finishTutorial,
            startPracticeLobby: startPracticeLobby,
            copyInviteLink: copyInviteLink,
            shareInviteLink: shareInviteLink,
            shareGame: shareGame,
            showInviteQr: showInviteQr,
            closeInviteQr: closeInviteQr,
            closeInviteCopyFallback: closeInviteCopyFallback,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
