import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import CardComp from "@/components/Card.vue";
import GameBoard from "@/components/GameBoard.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
import { getCardLabelText } from "@/utils/cardText";
const DEFAULT_HTTP_URL = `${window.location.protocol}//${window.location.hostname}:2567`;
const HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL || DEFAULT_HTTP_URL;
const { connected, mySeatId, state, players, privateHand, availableActions, huResult, roundResult, joinError, declareError, clearActionLogs, sendAction, sendDiscardCard, declareSetup, startGame, nextRound, returnLobby, } = useRoom("玩家");
const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const canPressStartGame = computed(() => Boolean(connected.value) && Boolean(state.value) && Boolean(mySeatId.value) && isWaiting.value && isHost.value);
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
const resettingLobby = ref(false);
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
const selectedFishCards = computed(() => privateHand.value.filter((card) => selectedFishCardIds.value.has(card.id)));
const suggestedFishCardIds = computed(() => {
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
    const picked = new Set();
    for (const cards of grouped.values()) {
        if (cards.length === 4) {
            cards.forEach((card) => picked.add(card.id));
        }
    }
    if (goldCards.length >= 4) {
        goldCards.forEach((card) => picked.add(card.id));
    }
    return picked;
});
const hasFishRecommendation = computed(() => suggestedFishCardIds.value.size > 0 || selectedFishCardIds.value.size > 0);
const suggestedKongCardIds = computed(() => {
    if (hasFishRecommendation.value) {
        return new Set();
    }
    const byFace = new Map();
    const goldCards = [];
    for (const card of privateHand.value) {
        if (suggestedFishCardIds.value.has(card.id) || selectedFishCardIds.value.has(card.id)) {
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
const suggestedDeclaredKongs = computed(() => (hasFishRecommendation.value ? 0 : Math.floor(suggestedKongCardIds.value.size / 3)));
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
function toggleFish(cardId) {
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
    if (isSameSettlementFace(cards)) {
        if (cards.length >= 4) {
            return "开";
        }
        if (cards.length === 3) {
            return "坎";
        }
        if (cards.length === 1 && (head.type === "jiang" || head.color === "gold")) {
            return "标";
        }
    }
    if (cards.length === 4) {
        return "鱼";
    }
    return undefined;
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
            tone: settlementTone(group.cards),
        });
    });
    splitExposedGroupsWithKinds(player.exposedArea ?? [], player.exposedGroupSizes ?? [], player.exposedGroupKinds ?? []).forEach(({ cards, kind }, index) => {
        blocks.push({
            id: `meld-${index}-${cards.map((card) => card.id).join("-")}`,
            cards,
            badge: settlementBadge(cards, kind),
            tone: settlementTone(cards),
        });
    });
    (player.generalArea ?? []).forEach((card, index) => {
        blocks.push({
            id: `public-${index}-${card.id}`,
            cards: [card],
            badge: settlementBadge([card]),
            tone: settlementTone([card]),
        });
    });
    splitFishGroups(player.fishArea ?? []).forEach((cards, index) => {
        blocks.push({
            id: `fish-${index}-${cards.map((card) => card.id).join("-")}`,
            cards,
            badge: settlementBadge(cards),
            tone: settlementTone(cards),
        });
    });
    return blocks;
}
function settlementHandBlocks(player) {
    return (player.resolvedHandGroups ?? []).map((group, index) => ({
        id: `hand-${index}-${group.cards.map((card) => card.id).join("-")}`,
        cards: group.cards,
        badge: settlementBadge(group.cards),
        tone: settlementTone(group.cards),
    }));
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
async function rebuildLobby() {
    if (resettingLobby.value) {
        return;
    }
    resettingLobby.value = true;
    globalError.value = "";
    clearActionLogs();
    try {
        const response = await fetch(`${HTTP_URL}/reset-room`, { method: "POST" });
        if (!response.ok) {
            throw new Error("重建大厅失败");
        }
        const payload = (await response.json());
        if (!payload?.ok || !payload.roomId) {
            throw new Error(payload?.message || "重建大厅失败");
        }
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("new", "1");
        nextUrl.searchParams.set("roomId", payload.roomId);
        nextUrl.searchParams.delete("playerToken");
        window.location.href = nextUrl.toString();
    }
    catch (error) {
        globalError.value = error instanceof Error ? error.message : "重建大厅失败";
        resettingLobby.value = false;
    }
}
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "meta" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.connected ? "已连接" : "连接中...");
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
            __VLS_ctx.tableCardMode = 'simple';
        } },
    ...{ class: "ghost mini" },
    ...{ class: ({ active: __VLS_ctx.tableCardMode === 'simple' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.tableCardMode = 'full';
        } },
    ...{ class: "ghost mini" },
    ...{ class: ({ active: __VLS_ctx.tableCardMode === 'full' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.rebuildLobby) },
    ...{ class: "ghost reset-btn" },
    disabled: (__VLS_ctx.resettingLobby),
});
(__VLS_ctx.resettingLobby ? "重建中..." : "重建大厅");
if (__VLS_ctx.globalError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "error global-error" },
    });
    (__VLS_ctx.globalError);
}
if (__VLS_ctx.isWaiting) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "lobby" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "lobby-slogan" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "lobby-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.startGame) },
        ...{ class: "primary" },
        disabled: (!__VLS_ctx.canPressStartGame),
    });
    (__VLS_ctx.isHost ? "开始游戏" : "等待房主开始");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isWaiting))
                    return;
                __VLS_ctx.showRules = true;
            } },
        ...{ class: "ghost" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "lobby-rule-tip" },
    });
    if (__VLS_ctx.joinError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error" },
        });
        (__VLS_ctx.joinError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "player-grid" },
    });
    for (const [p] of __VLS_getVForSourceType((__VLS_ctx.players))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (p.clientId),
            ...{ class: "player-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (p.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (p.clientId === __VLS_ctx.state?.hostPlayerId ? "房主" : "玩家");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (p.isBot ? "BOT托管" : p.connected ? "在线" : "离线");
    }
}
else {
    /** @type {[typeof GameBoard, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(GameBoard, new GameBoard({
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
    const __VLS_4 = __VLS_3({
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
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        onDiscardCard: (__VLS_ctx.sendDiscardCard)
    };
    const __VLS_10 = {
        onSubmitAction: (__VLS_ctx.onPanelSubmit)
    };
    const __VLS_11 = {
        onSelectionChange: (__VLS_ctx.onPanelSelectionChange)
    };
    var __VLS_5;
}
if (__VLS_ctx.isPlaying && !__VLS_ctx.isCompactLandscape) {
    /** @type {[typeof ActionPanel, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(ActionPanel, new ActionPanel({
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
    const __VLS_13 = __VLS_12({
        ...{ 'onSubmit': {} },
        ...{ 'onSelectionChange': {} },
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
        selectionMode: (__VLS_ctx.selectionMode),
        selectedCandidateId: (__VLS_ctx.selectedCandidateId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_15;
    let __VLS_16;
    let __VLS_17;
    const __VLS_18 = {
        onSubmit: (__VLS_ctx.onPanelSubmit)
    };
    const __VLS_19 = {
        onSelectionChange: (__VLS_ctx.onPanelSelectionChange)
    };
    var __VLS_14;
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
                const __VLS_20 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    card: (__VLS_ctx.candidateTargetCard),
                    size: "sm",
                }));
                const __VLS_21 = __VLS_20({
                    card: (__VLS_ctx.candidateTargetCard),
                    size: "sm",
                }, ...__VLS_functionalComponentArgsRest(__VLS_20));
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
                    const __VLS_23 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`cand-${candidate.id}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }));
                    const __VLS_24 = __VLS_23({
                        key: (`cand-${candidate.id}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
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
        ...{ class: "declare-card-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "zone-title" },
    });
    if (__VLS_ctx.selectedFishCards.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "declare-mini-cards" },
        });
        for (const [card] of __VLS_getVForSourceType((__VLS_ctx.selectedFishCards))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_26 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`declare-fish-${card.id}`),
                card: (card),
                size: "sm",
            }));
            const __VLS_27 = __VLS_26({
                key: (`declare-fish-${card.id}`),
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_26));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "settlement-empty" },
        });
    }
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
        ...{ class: "declare-zone" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "zone-title" },
    });
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
                        __VLS_ctx.toggleFish(card.id);
                    } },
                key: (`declare-hand-${card.id}`),
                ...{ class: "declare-card-btn" },
                ...{ class: ({ selected: __VLS_ctx.selectedFishCardIds.has(card.id), suggested: __VLS_ctx.suggestedKongCardIds.has(card.id), fish: __VLS_ctx.suggestedFishCardIds.has(card.id) }) },
                disabled: (__VLS_ctx.isDeclareSubmitted),
            });
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                card: (card),
                size: "sm",
            }));
            const __VLS_30 = __VLS_29({
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
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
            const __VLS_32 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`remain-${card.id}`),
                card: (card),
                size: "sm",
            }));
            const __VLS_33 = __VLS_32({
                key: (`remain-${card.id}`),
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_32));
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
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "settlement-group-badge" },
                    });
                    (group.badge);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "settlement-cards compact" },
                    });
                    for (const [card] of __VLS_getVForSourceType((group.cards))) {
                        /** @type {[typeof CardComp, ]} */ ;
                        // @ts-ignore
                        const __VLS_35 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }));
                        const __VLS_36 = __VLS_35({
                            key: (`settle-e-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_35));
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
                        const __VLS_38 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }));
                        const __VLS_39 = __VLS_38({
                            key: (`settle-hg-${p.clientId}-${group.id}-${card.id}`),
                            card: (card),
                            size: "sm",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_38));
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
                    const __VLS_41 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }));
                    const __VLS_42 = __VLS_41({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
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
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['view-mode-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['mini']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['global-error']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-slogan']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-rule-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['player-item']} */ ;
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
/** @type {__VLS_StyleScopedClasses['declare-card-section']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-mini-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip-row']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['end-global-info']} */ ;
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
            startGame: startGame,
            nextRound: nextRound,
            returnLobby: returnLobby,
            isWaiting: isWaiting,
            isPlaying: isPlaying,
            isEnded: isEnded,
            isHost: isHost,
            canPressStartGame: canPressStartGame,
            isMyTurn: isMyTurn,
            canAct: canAct,
            canDiscard: canDiscard,
            selectionMode: selectionMode,
            selectedCandidateId: selectedCandidateId,
            activeCandidates: activeCandidates,
            candidateTargetCard: candidateTargetCard,
            isCompactLandscape: isCompactLandscape,
            tableCardMode: tableCardMode,
            resettingLobby: resettingLobby,
            globalError: globalError,
            showRules: showRules,
            showEndPanel: showEndPanel,
            isDeclareSubmitted: isDeclareSubmitted,
            shouldShowDeclarePanel: shouldShowDeclarePanel,
            declareKongsInput: declareKongsInput,
            selectedFishCardIds: selectedFishCardIds,
            selectedFishCards: selectedFishCards,
            suggestedFishCardIds: suggestedFishCardIds,
            suggestedKongCardIds: suggestedKongCardIds,
            suggestedDeclaredKongs: suggestedDeclaredKongs,
            maxDeclaredKongs: maxDeclaredKongs,
            declareSecondsLeft: declareSecondsLeft,
            declareProgressPercent: declareProgressPercent,
            fishSelectionValid: fishSelectionValid,
            toggleFish: toggleFish,
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
            settlementScoreLines: settlementScoreLines,
            endSummary: endSummary,
            turnHint: turnHint,
            currentPlayerName: currentPlayerName,
            dealerName: dealerName,
            roundDealerCard: roundDealerCard,
            rebuildLobby: rebuildLobby,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
