import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import CardComp from "@/components/Card.vue";
import GameBoard from "@/components/GameBoard.vue";
import LobbyPage from "@/components/LobbyPage.vue";
import LoginPage from "@/components/LoginPage.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
import { BACKEND_HTTP_URL } from "@/config/backend";
import { getCardLabelText } from "@/utils/cardText";
const HTTP_URL = BACKEND_HTTP_URL;
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
const { connect, connected, mySeatId, state, players, privateHand, availableActions, huResult, roundResult, joinError, declareError, clearActionLogs, sendAction, sendDiscardCard, declareSetup, startGame, nextRound, returnLobby, } = useRoom("玩家");
const ENTRY_NAME_KEY = "sise_entry_name";
const ENTRY_HISTORY_KEY = "sise_entry_name_history";
const entryName = ref(window.localStorage.getItem(ENTRY_NAME_KEY)?.trim() || "");
const nicknameHistory = ref(readNicknameHistory());
const enteringLobby = ref(false);
const enteredFrontLobby = ref(false);
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
        id: "friends_reserved",
        name: "好友同桌",
        description: "预留入口：未来会扩展成 4 名真人通过邀请码或房间模式一起对局。",
        enabled: false,
    },
    {
        id: "ranked_reserved",
        name: "联机匹配",
        description: "预留入口：未来会接账号、匹配和更多大厅信息，但这次先把结构留好。",
        enabled: false,
    },
];
const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const hasLobbySession = computed(() => Boolean(connected.value || state.value || mySeatId.value));
const showEntry = computed(() => !enteredFrontLobby.value && !hasLobbySession.value);
const showSyncingScreen = computed(() => hasLobbySession.value && !state.value);
const showModeLobby = computed(() => {
    if (showSyncingScreen.value) {
        return false;
    }
    // Once game state exists (room joined), never show mode lobby again
    // The mode lobby is only for mode selection BEFORE joining a room
    if (state.value) {
        return false;
    }
    // Before game state, show mode lobby if entered front
    return enteredFrontLobby.value;
});
const canReturnToLobby = computed(() => isDeclaring.value || isPlaying.value || isEnded.value);
const canPressStartGame = computed(() => Boolean(connected.value) && Boolean(state.value) && Boolean(mySeatId.value) && isWaiting.value && isHost.value);
const canStartSelectedMode = computed(() => selectedLobbyMode.value === "practice_bots" && (!hasLobbySession.value || canPressStartGame.value));
const lobbyTitle = computed(() => (isWaiting.value ? "房间准备中" : "游戏模式选择"));
const lobbySubtitle = computed(() => isWaiting.value
    ? "你已经进入房间页，正在同步开局状态。"
    : "先选择一种玩法；当前开放单人练习，其余模式先保留入口。");
const lobbyStartLabel = computed(() => {
    if (selectedLobbyMode.value !== "practice_bots") {
        return "该模式尚未开放";
    }
    if (!hasLobbySession.value) {
        return "进入单人练习";
    }
    if (pendingPracticeAutoStart.value) {
        return "正在自动开始...";
    }
    return isHost.value ? "开始单人练习" : "等待房主开始";
});
const entryPrimaryLabel = computed(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get("roomId") ? "加入大厅" : "进入大厅";
});
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
const canAct = computed(() => !openingDealActive.value && isPlaying.value && availableActions.value.some((x) => x.enabled));
const canDiscard = computed(() => !openingDealActive.value &&
    isPlaying.value &&
    isMyTurn.value &&
    state.value?.responsePhase === "local_draw" &&
    availableActions.value.length === 0);
const selectionMode = ref(null);
const selectedCandidateId = ref(null);
const activeCandidates = computed(() => {
    if (!selectionMode.value) {
        return [];
    }
    const item = availableActions.value.find((action) => action.action === selectionMode.value && action.enabled);
    return item?.candidates ?? [];
});
const candidateTargetCard = computed(() => {
    return (state.value?.responseCard ?? state.value?.targetCard ?? state.value?.publicDiscardPile?.[0] ?? null);
});
const isCompactLandscape = ref(false);
const tableCardMode = ref(window.localStorage.getItem("sise_table_card_mode") ?? "simple");
const globalError = ref("");
const showRules = ref(false);
const updateCompactLandscape = () => {
    isCompactLandscape.value = window.matchMedia("(orientation: landscape) and (max-width: 960px)").matches;
};
const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
const mePlayer = computed(() => players.value.find((x) => x.clientId === mySeatId.value) ?? null);
const isDeclareSubmitted = computed(() => Boolean(mePlayer.value?.declaredReady));
const shouldShowDeclarePanel = computed(() => isDeclaring.value &&
    !declareDealIntroActive.value &&
    Boolean(mySeatId.value) &&
    !Boolean(mePlayer.value?.isBot));
const declareDealIntroActive = computed(() => isDeclaring.value && Number(state.value?.responseEndsAt ?? 0) > nowMs.value);
const declareKongsInput = ref(0);
let declareTick = null;
const selectedFishCardIds = ref(new Set());
const selectedFishOptionIds = ref(new Set());
const selectedFishCards = computed(() => privateHand.value.filter((card) => selectedFishCardIds.value.has(card.id)));
const fishOptions = computed(() => {
    const options = [];
    const grouped = new Map();
    const goldCards = [];
    for (const card of privateHand.value) {
        if (card.color === "gold") {
            goldCards.push(card);
            continue;
        }
        const key = `${card.color}:${card.type}`;
        const list = grouped.get(key) ?? [];
        list.push(card);
        grouped.set(key, list);
    }
    for (const [key, cards] of grouped.entries()) {
        if (cards.length === 4) {
            options.push({
                id: `fish:${key}`,
                title: `${cardLabel(cards[0])}鱼`,
                cards,
            });
        }
    }
    if (goldCards.length >= 4) {
        options.push({
            id: "fish:gold:4",
            title: "金条鱼（4张）",
            cards: goldCards.slice(0, 4),
        });
    }
    if (goldCards.length >= 5) {
        options.push({
            id: "fish:gold:5",
            title: "金条鱼（5张）",
            cards: goldCards.slice(0, 5),
        });
    }
    return options;
});
const suggestedFishCardIds = computed(() => {
    const picked = new Set();
    for (const option of fishOptions.value) {
        option.cards.forEach((card) => picked.add(card.id));
    }
    return picked;
});
const suggestedKongCardIds = computed(() => {
    const byFace = new Map();
    const goldCards = [];
    for (const card of privateHand.value) {
        if (selectedFishCardIds.value.has(card.id)) {
            continue;
        }
        if (card.color === "gold") {
            goldCards.push(card);
            continue;
        }
        const key = `${card.color}:${card.type}`;
        const list = byFace.get(key) ?? [];
        list.push(card);
        byFace.set(key, list);
    }
    const picked = new Set();
    for (const cards of byFace.values()) {
        const count = Math.floor(cards.length / 3) * 3;
        for (const card of cards.slice(0, count)) {
            picked.add(card.id);
        }
    }
    for (const card of goldCards.slice(0, Math.floor(goldCards.length / 3) * 3)) {
        picked.add(card.id);
    }
    return picked;
});
const suggestedDeclaredKongs = computed(() => Math.floor(suggestedKongCardIds.value.size / 3));
const maxDeclaredKongs = computed(() => Math.max(suggestedDeclaredKongs.value, Number(mePlayer.value?.declaredKongs ?? 0), 0));
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
const fishSelectionValid = computed(() => {
    const cards = selectedFishCards.value;
    if (!cards.length) {
        return true;
    }
    let goldCount = 0;
    const nonGoldFaceCounter = new Map();
    for (const card of cards) {
        if (card.color === "gold") {
            goldCount += 1;
            continue;
        }
        const key = `${card.color}:${card.type}`;
        nonGoldFaceCounter.set(key, (nonGoldFaceCounter.get(key) ?? 0) + 1);
    }
    for (const count of nonGoldFaceCounter.values()) {
        if (count !== 4) {
            return false;
        }
    }
    return goldCount === 0 || goldCount === 4 || goldCount === 5;
});
function syncSelectedFishOptionsFromCards() {
    const cardIds = selectedFishCardIds.value;
    const next = new Set();
    for (const option of fishOptions.value) {
        if (option.cards.every((card) => cardIds.has(card.id))) {
            next.add(option.id);
        }
    }
    selectedFishOptionIds.value = next;
}
function toggleFishOption(optionId) {
    if (isDeclareSubmitted.value) {
        return;
    }
    const option = fishOptions.value.find((item) => item.id === optionId);
    if (!option) {
        return;
    }
    const nextCards = new Set(selectedFishCardIds.value);
    const nextOptions = new Set(selectedFishOptionIds.value);
    const selected = nextOptions.has(optionId);
    if (selected) {
        option.cards.forEach((card) => nextCards.delete(card.id));
        nextOptions.delete(optionId);
    }
    else {
        option.cards.forEach((card) => nextCards.add(card.id));
        if (optionId === "fish:gold:4") {
            nextOptions.delete("fish:gold:5");
            fishOptions.value.find((item) => item.id === "fish:gold:5")?.cards.forEach((card) => nextCards.delete(card.id));
            option.cards.forEach((card) => nextCards.add(card.id));
        }
        if (optionId === "fish:gold:5") {
            nextOptions.delete("fish:gold:4");
        }
        nextOptions.add(optionId);
    }
    selectedFishCardIds.value = nextCards;
    selectedFishOptionIds.value = nextOptions;
}
function toggleFishCard(cardId) {
    if (isDeclareSubmitted.value) {
        return;
    }
    const next = new Set(selectedFishCardIds.value);
    if (next.has(cardId)) {
        next.delete(cardId);
    }
    else {
        next.add(cardId);
    }
    selectedFishCardIds.value = next;
    syncSelectedFishOptionsFromCards();
}
function clearSelection() {
    selectionMode.value = null;
    selectedCandidateId.value = null;
}
function onPanelSelectionChange(payload) {
    selectionMode.value = payload.mode;
    selectedCandidateId.value = payload.selectedCandidateId;
}
function onPanelSubmit(request) {
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
        return "手牌+将/金条区";
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
function submitDeclaration() {
    if (!fishSelectionValid.value || isDeclareSubmitted.value) {
        return;
    }
    declareSetup({
        declaredKongs: Math.max(0, Number(declareKongsInput.value) || 0),
        fishCardIds: [...selectedFishCardIds.value],
    });
}
function adjustDeclareKongs(delta) {
    declareKongsInput.value = Math.min(maxDeclaredKongs.value, Math.max(0, declareKongsInput.value + delta));
}
function useSuggestedDeclaredKongs() {
    declareKongsInput.value = suggestedDeclaredKongs.value;
}
watch(shouldShowDeclarePanel, (show) => {
    if (show) {
        selectedFishCardIds.value = new Set();
        selectedFishOptionIds.value = new Set();
        declareKongsInput.value = Math.max(Number(mePlayer.value?.declaredKongs ?? 0), Number(suggestedDeclaredKongs.value ?? 0));
    }
});
watch(() => `${state.value?.phase ?? ""}|${state.value?.responsePhase ?? ""}|${state.value?.currentPlayerId ?? ""}`, () => {
    clearSelection();
});
watch(() => availableActions.value, () => {
    if (!selectionMode.value) {
        return;
    }
    const current = availableActions.value.find((item) => item.action === selectionMode.value && item.enabled);
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
    updateCompactLandscape();
    window.localStorage.setItem("sise_table_card_mode", tableCardMode.value);
    window.addEventListener("resize", updateCompactLandscape);
    window.addEventListener("orientationchange", updateCompactLandscape);
});
onUnmounted(() => {
    if (declareTick !== null) {
        window.clearInterval(declareTick);
        declareTick = null;
    }
    window.removeEventListener("resize", updateCompactLandscape);
    window.removeEventListener("orientationchange", updateCompactLandscape);
});
watch(tableCardMode, (mode) => {
    window.localStorage.setItem("sise_table_card_mode", mode);
});
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
    return groupHandWithHiddenKans(player.hand ?? []);
}
function groupHandWithHiddenKans(cards) {
    const used = new Set();
    const byFace = new Map();
    for (const card of cards) {
        const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
        const list = byFace.get(key) ?? [];
        list.push(card);
        byFace.set(key, list);
    }
    const blocks = [];
    for (const [key, sameFaceCards] of byFace.entries()) {
        const kanCount = Math.floor(sameFaceCards.length / 3);
        for (let index = 0; index < kanCount; index += 1) {
            const chunk = sameFaceCards.slice(index * 3, index * 3 + 3);
            if (chunk.length !== 3) {
                continue;
            }
            chunk.forEach((card) => used.add(card.id));
            blocks.push({
                id: `hidden-kan-${key}-${index}-${chunk.map((card) => card.id).join("-")}`,
                cards: chunk,
                badge: "坎",
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
const dealerName = computed(() => {
    const dealerId = String(state.value?.dealerId ?? "");
    if (!dealerId) {
        return "-";
    }
    return players.value.find((p) => p.clientId === dealerId)?.name || dealerId;
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
}
function randomizeNickname() {
    entryName.value = generateRandomNickname();
}
function startSelectedMode() {
    if (selectedLobbyMode.value !== "practice_bots") {
        globalError.value = "该模式暂未开放，当前只支持单人练习。";
        return;
    }
    globalError.value = "";
    if (!hasLobbySession.value) {
        void startPracticeLobby();
        return;
    }
    requestPracticeAutoStart();
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
        const response = await fetch(`${HTTP_URL}/reset-room`, { method: "POST" });
        if (!response.ok) {
            throw new Error("创建单人练习房间失败");
        }
        const payload = (await response.json());
        if (!payload?.ok || !payload.roomId) {
            throw new Error(payload?.message || "创建单人练习房间失败");
        }
        const ok = await connect({
            nameOverride: nickname,
            roomId: payload.roomId,
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
watch(() => state.value?.phase, (phase) => {
    if (phase && phase !== "waiting") {
        pendingPracticeAutoStart.value = false;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['playing']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-landscape']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-field']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-input']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-card']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-head']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-item']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-col']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-section']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-header']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-timer-card']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-timer-card']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-stepper-value']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-stepper-value']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['fish-option']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-head']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['winner']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-group']} */ ;
/** @type {__VLS_StyleScopedClasses['fish']} */ ;
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
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-cards-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-header']} */ ;
/** @type {__VLS_StyleScopedClasses['fish-option']} */ ;
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
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof OrientationGuard, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(OrientationGuard, new OrientationGuard({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "layout" },
    ...{ class: ({ playing: __VLS_ctx.isPlaying, 'compact-landscape': __VLS_ctx.isCompactLandscape && __VLS_ctx.isPlaying }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "top" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "top-brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "top-slogan" },
});
if (__VLS_ctx.hasLobbySession) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.connected ? "已连接" : "同步中...");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.mySeatId || "-");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.state?.hostPlayerId || "-");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.dealerName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "view-mode-toggle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.hasLobbySession))
                    return;
                __VLS_ctx.tableCardMode = 'simple';
            } },
        ...{ class: "ghost mini" },
        ...{ class: ({ active: __VLS_ctx.tableCardMode === 'simple' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.hasLobbySession))
                    return;
                __VLS_ctx.tableCardMode = 'full';
            } },
        ...{ class: "ghost mini" },
        ...{ class: ({ active: __VLS_ctx.tableCardMode === 'full' }) },
    });
    if (__VLS_ctx.canReturnToLobby) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.returnLobby) },
            ...{ class: "ghost reset-btn" },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.hasLobbySession))
                        return;
                    if (!!(__VLS_ctx.canReturnToLobby))
                        return;
                    __VLS_ctx.showRules = true;
                } },
            ...{ class: "ghost reset-btn" },
        });
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.hasLobbySession))
                    return;
                __VLS_ctx.showRules = true;
            } },
        ...{ class: "ghost reset-btn" },
    });
}
if (__VLS_ctx.globalError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "error global-error" },
    });
    (__VLS_ctx.globalError);
}
if (__VLS_ctx.showEntry) {
    /** @type {[typeof LoginPage, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(LoginPage, new LoginPage({
        ...{ 'onUpdate:nickname': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onOpenRules': {} },
        ...{ 'onRandomize': {} },
        ...{ 'onSelectHistory': {} },
        nickname: (__VLS_ctx.entryName),
        entering: (__VLS_ctx.enteringLobby),
        primaryLabel: (__VLS_ctx.entryPrimaryLabel),
        historyNames: (__VLS_ctx.nicknameHistory),
    }));
    const __VLS_4 = __VLS_3({
        ...{ 'onUpdate:nickname': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onOpenRules': {} },
        ...{ 'onRandomize': {} },
        ...{ 'onSelectHistory': {} },
        nickname: (__VLS_ctx.entryName),
        entering: (__VLS_ctx.enteringLobby),
        primaryLabel: (__VLS_ctx.entryPrimaryLabel),
        historyNames: (__VLS_ctx.nicknameHistory),
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        'onUpdate:nickname': (...[$event]) => {
            if (!(__VLS_ctx.showEntry))
                return;
            __VLS_ctx.entryName = $event;
        }
    };
    const __VLS_10 = {
        onSubmit: (__VLS_ctx.enterLobby)
    };
    const __VLS_11 = {
        onOpenRules: (...[$event]) => {
            if (!(__VLS_ctx.showEntry))
                return;
            __VLS_ctx.showRules = true;
        }
    };
    const __VLS_12 = {
        onRandomize: (__VLS_ctx.randomizeNickname)
    };
    const __VLS_13 = {
        onSelectHistory: (...[$event]) => {
            if (!(__VLS_ctx.showEntry))
                return;
            __VLS_ctx.entryName = $event;
        }
    };
    var __VLS_5;
}
else if (__VLS_ctx.showModeLobby) {
    /** @type {[typeof LobbyPage, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(LobbyPage, new LobbyPage({
        ...{ 'onOpenRules': {} },
        ...{ 'onStart': {} },
        ...{ 'onSelectMode': {} },
        kicker: (__VLS_ctx.isWaiting ? '房间页' : '大厅页'),
        title: (__VLS_ctx.lobbyTitle),
        subtitle: (__VLS_ctx.lobbySubtitle),
        modes: (__VLS_ctx.lobbyModes),
        selectedMode: (__VLS_ctx.selectedLobbyMode),
        canStart: (__VLS_ctx.canStartSelectedMode),
        startLabel: (__VLS_ctx.lobbyStartLabel),
        joinError: (__VLS_ctx.joinError),
        hostPlayerId: (__VLS_ctx.state?.hostPlayerId || ''),
        players: (__VLS_ctx.players),
    }));
    const __VLS_15 = __VLS_14({
        ...{ 'onOpenRules': {} },
        ...{ 'onStart': {} },
        ...{ 'onSelectMode': {} },
        kicker: (__VLS_ctx.isWaiting ? '房间页' : '大厅页'),
        title: (__VLS_ctx.lobbyTitle),
        subtitle: (__VLS_ctx.lobbySubtitle),
        modes: (__VLS_ctx.lobbyModes),
        selectedMode: (__VLS_ctx.selectedLobbyMode),
        canStart: (__VLS_ctx.canStartSelectedMode),
        startLabel: (__VLS_ctx.lobbyStartLabel),
        joinError: (__VLS_ctx.joinError),
        hostPlayerId: (__VLS_ctx.state?.hostPlayerId || ''),
        players: (__VLS_ctx.players),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    let __VLS_17;
    let __VLS_18;
    let __VLS_19;
    const __VLS_20 = {
        onOpenRules: (...[$event]) => {
            if (!!(__VLS_ctx.showEntry))
                return;
            if (!(__VLS_ctx.showModeLobby))
                return;
            __VLS_ctx.showRules = true;
        }
    };
    const __VLS_21 = {
        onStart: (__VLS_ctx.startSelectedMode)
    };
    const __VLS_22 = {
        onSelectMode: (...[$event]) => {
            if (!!(__VLS_ctx.showEntry))
                return;
            if (!(__VLS_ctx.showModeLobby))
                return;
            __VLS_ctx.selectedLobbyMode = $event;
        }
    };
    var __VLS_16;
}
else if (__VLS_ctx.showSyncingScreen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "sync-shell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sync-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "entry-kicker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "entry-desc" },
    });
}
else {
    /** @type {[typeof GameBoard, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(GameBoard, new GameBoard({
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
        embeddedActionPanel: (__VLS_ctx.isCompactLandscape),
        tableCardMode: (__VLS_ctx.tableCardMode),
        selectionMode: (__VLS_ctx.selectionMode),
        selectedCandidateId: (__VLS_ctx.selectedCandidateId),
        activeCandidates: (__VLS_ctx.activeCandidates),
    }));
    const __VLS_24 = __VLS_23({
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
        embeddedActionPanel: (__VLS_ctx.isCompactLandscape),
        tableCardMode: (__VLS_ctx.tableCardMode),
        selectionMode: (__VLS_ctx.selectionMode),
        selectedCandidateId: (__VLS_ctx.selectedCandidateId),
        activeCandidates: (__VLS_ctx.activeCandidates),
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    let __VLS_26;
    let __VLS_27;
    let __VLS_28;
    const __VLS_29 = {
        onDiscardCard: (__VLS_ctx.sendDiscardCard)
    };
    const __VLS_30 = {
        onSubmitAction: (__VLS_ctx.onPanelSubmit)
    };
    const __VLS_31 = {
        onSelectionChange: (__VLS_ctx.onPanelSelectionChange)
    };
    var __VLS_25;
}
if (__VLS_ctx.isPlaying && !__VLS_ctx.isCompactLandscape) {
    /** @type {[typeof ActionPanel, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(ActionPanel, new ActionPanel({
        ...{ 'onSubmit': {} },
        ...{ 'onSelectionChange': {} },
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
        selectionMode: (__VLS_ctx.selectionMode),
        selectedCandidateId: (__VLS_ctx.selectedCandidateId),
    }));
    const __VLS_33 = __VLS_32({
        ...{ 'onSubmit': {} },
        ...{ 'onSelectionChange': {} },
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
        selectionMode: (__VLS_ctx.selectionMode),
        selectedCandidateId: (__VLS_ctx.selectedCandidateId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    let __VLS_35;
    let __VLS_36;
    let __VLS_37;
    const __VLS_38 = {
        onSubmit: (__VLS_ctx.onPanelSubmit)
    };
    const __VLS_39 = {
        onSelectionChange: (__VLS_ctx.onPanelSelectionChange)
    };
    var __VLS_34;
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
    (__VLS_ctx.actionText(__VLS_ctx.selectionMode));
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
                const __VLS_40 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    card: (__VLS_ctx.candidateTargetCard),
                    size: "sm",
                }));
                const __VLS_41 = __VLS_40({
                    card: (__VLS_ctx.candidateTargetCard),
                    size: "sm",
                }, ...__VLS_functionalComponentArgsRest(__VLS_40));
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
                    const __VLS_43 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`cand-${candidate.id}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }));
                    const __VLS_44 = __VLS_43({
                        key: (`cand-${candidate.id}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "declare-desc" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-timer-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.declareSecondsLeft);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.isDeclareSubmitted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "declare-submitted" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-progress" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-progress-fill" },
        ...{ style: ({ width: `${__VLS_ctx.declareProgressPercent}%` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "declare-card-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "zone-title" },
    });
    if (__VLS_ctx.fishOptions.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "fish-option-list" },
        });
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.fishOptions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.shouldShowDeclarePanel))
                            return;
                        if (!(__VLS_ctx.fishOptions.length))
                            return;
                        __VLS_ctx.toggleFishOption(option.id);
                    } },
                key: (option.id),
                ...{ class: "fish-option" },
                ...{ class: ({ selected: __VLS_ctx.selectedFishOptionIds.has(option.id) }) },
                disabled: (__VLS_ctx.isDeclareSubmitted),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "fish-option-title" },
            });
            (option.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "declare-mini-cards" },
            });
            for (const [card] of __VLS_getVForSourceType((option.cards))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_46 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`fish-option-${option.id}-${card.id}`),
                    card: (card),
                    size: "sm",
                }));
                const __VLS_47 = __VLS_46({
                    key: (`fish-option-${option.id}-${card.id}`),
                    card: (card),
                    size: "sm",
                }, ...__VLS_functionalComponentArgsRest(__VLS_46));
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "settlement-empty" },
        });
    }
    if (__VLS_ctx.selectedFishCards.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "declare-tip" },
        });
        (__VLS_ctx.selectedFishCards.length);
    }
    if (!__VLS_ctx.fishSelectionValid) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error" },
        });
    }
    if (__VLS_ctx.declareError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error" },
        });
        (__VLS_ctx.declareError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "declare-card-section declare-summary-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "zone-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-stepper" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.shouldShowDeclarePanel))
                    return;
                __VLS_ctx.adjustDeclareKongs(-1);
            } },
        ...{ class: "ghost mini" },
        disabled: (__VLS_ctx.isDeclareSubmitted || __VLS_ctx.declareKongsInput <= 0),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-stepper-value" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.declareKongsInput);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.shouldShowDeclarePanel))
                    return;
                __VLS_ctx.adjustDeclareKongs(1);
            } },
        ...{ class: "ghost mini" },
        disabled: (__VLS_ctx.isDeclareSubmitted || __VLS_ctx.declareKongsInput >= __VLS_ctx.maxDeclaredKongs),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-chip-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "declare-chip accent" },
    });
    (__VLS_ctx.suggestedDeclaredKongs);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.useSuggestedDeclaredKongs) },
        ...{ class: "ghost mini" },
        disabled: (__VLS_ctx.isDeclareSubmitted),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "declare-tip" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "declare-zone" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "zone-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-chip-row" },
    });
    if (__VLS_ctx.suggestedFishCardIds.size) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "declare-chip" },
        });
    }
    if (__VLS_ctx.suggestedKongCardIds.size) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "declare-chip" },
        });
    }
    if (__VLS_ctx.privateHand.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "declare-cards" },
        });
        for (const [card] of __VLS_getVForSourceType((__VLS_ctx.privateHand))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.shouldShowDeclarePanel))
                            return;
                        if (!(__VLS_ctx.privateHand.length))
                            return;
                        __VLS_ctx.toggleFishCard(card.id);
                    } },
                key: (`declare-hand-${card.id}`),
                ...{ class: "declare-card-btn" },
                ...{ class: ({ selected: __VLS_ctx.selectedFishCardIds.has(card.id), suggested: __VLS_ctx.suggestedKongCardIds.has(card.id), fish: __VLS_ctx.suggestedFishCardIds.has(card.id) }) },
                disabled: (__VLS_ctx.isDeclareSubmitted),
            });
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                card: (card),
                size: "sm",
            }));
            const __VLS_50 = __VLS_49({
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "settlement-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "end-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.submitDeclaration) },
        ...{ class: "primary" },
        disabled: (!__VLS_ctx.fishSelectionValid || __VLS_ctx.isDeclareSubmitted),
    });
    (__VLS_ctx.isDeclareSubmitted ? "已提交" : "确认声明");
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
            const __VLS_52 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`remain-${card.id}`),
                card: (card),
                size: "sm",
            }));
            const __VLS_53 = __VLS_52({
                key: (`remain-${card.id}`),
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_52));
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
                        const __VLS_55 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }));
                        const __VLS_56 = __VLS_55({
                            key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_55));
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
                        const __VLS_58 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }));
                        const __VLS_59 = __VLS_58({
                            key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_58));
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
                    const __VLS_61 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }));
                    const __VLS_62 = __VLS_61({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.nextRound) },
        ...{ class: "primary" },
        disabled: (!__VLS_ctx.isHost || !__VLS_ctx.isEnded),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.returnLobby) },
        ...{ class: "ghost" },
        disabled: (!__VLS_ctx.isEnded),
    });
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
/** @type {__VLS_StyleScopedClasses['top-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['view-mode-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['global-error']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-card']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-kicker']} */ ;
/** @type {__VLS_StyleScopedClasses['entry-desc']} */ ;
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
/** @type {__VLS_StyleScopedClasses['declare-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-header']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-timer-card']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-submitted']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-section']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['fish-option-list']} */ ;
/** @type {__VLS_StyleScopedClasses['fish-option']} */ ;
/** @type {__VLS_StyleScopedClasses['fish-option-title']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-mini-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-section']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-summary-card']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-stepper-value']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['accent']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
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
            ActionPanel: ActionPanel,
            CardComp: CardComp,
            GameBoard: GameBoard,
            LobbyPage: LobbyPage,
            LoginPage: LoginPage,
            OrientationGuard: OrientationGuard,
            connected: connected,
            mySeatId: mySeatId,
            state: state,
            players: players,
            privateHand: privateHand,
            availableActions: availableActions,
            joinError: joinError,
            declareError: declareError,
            sendDiscardCard: sendDiscardCard,
            nextRound: nextRound,
            returnLobby: returnLobby,
            entryName: entryName,
            nicknameHistory: nicknameHistory,
            enteringLobby: enteringLobby,
            selectedLobbyMode: selectedLobbyMode,
            lobbyModes: lobbyModes,
            isWaiting: isWaiting,
            isPlaying: isPlaying,
            isEnded: isEnded,
            isHost: isHost,
            hasLobbySession: hasLobbySession,
            showEntry: showEntry,
            showSyncingScreen: showSyncingScreen,
            showModeLobby: showModeLobby,
            canReturnToLobby: canReturnToLobby,
            canStartSelectedMode: canStartSelectedMode,
            lobbyTitle: lobbyTitle,
            lobbySubtitle: lobbySubtitle,
            lobbyStartLabel: lobbyStartLabel,
            entryPrimaryLabel: entryPrimaryLabel,
            isMyTurn: isMyTurn,
            canAct: canAct,
            canDiscard: canDiscard,
            selectionMode: selectionMode,
            selectedCandidateId: selectedCandidateId,
            activeCandidates: activeCandidates,
            candidateTargetCard: candidateTargetCard,
            isCompactLandscape: isCompactLandscape,
            tableCardMode: tableCardMode,
            globalError: globalError,
            showRules: showRules,
            showEndPanel: showEndPanel,
            isDeclareSubmitted: isDeclareSubmitted,
            shouldShowDeclarePanel: shouldShowDeclarePanel,
            declareKongsInput: declareKongsInput,
            selectedFishCardIds: selectedFishCardIds,
            selectedFishOptionIds: selectedFishOptionIds,
            selectedFishCards: selectedFishCards,
            fishOptions: fishOptions,
            suggestedFishCardIds: suggestedFishCardIds,
            suggestedKongCardIds: suggestedKongCardIds,
            suggestedDeclaredKongs: suggestedDeclaredKongs,
            maxDeclaredKongs: maxDeclaredKongs,
            declareSecondsLeft: declareSecondsLeft,
            declareProgressPercent: declareProgressPercent,
            fishSelectionValid: fishSelectionValid,
            toggleFishOption: toggleFishOption,
            toggleFishCard: toggleFishCard,
            clearSelection: clearSelection,
            onPanelSelectionChange: onPanelSelectionChange,
            onPanelSubmit: onPanelSubmit,
            submitCandidate: submitCandidate,
            actionText: actionText,
            candidateSourceText: candidateSourceText,
            cardLabel: cardLabel,
            candidateGroupCards: candidateGroupCards,
            submitDeclaration: submitDeclaration,
            adjustDeclareKongs: adjustDeclareKongs,
            useSuggestedDeclaredKongs: useSuggestedDeclaredKongs,
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
            winnerSettlementPlayer: winnerSettlementPlayer,
            huCalculationLines: huCalculationLines,
            winnerPerOpponentScore: winnerPerOpponentScore,
            settlementScoreLines: settlementScoreLines,
            endSummary: endSummary,
            turnHint: turnHint,
            currentPlayerName: currentPlayerName,
            dealerName: dealerName,
            roundDealerCard: roundDealerCard,
            enterLobby: enterLobby,
            randomizeNickname: randomizeNickname,
            startSelectedMode: startSelectedMode,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
