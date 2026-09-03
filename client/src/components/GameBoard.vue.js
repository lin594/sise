import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "./ActionPanel.vue";
import CardComp from "./Card.vue";
import { getCardAccessibleText, getCardLabelText } from "@/utils/cardText";
const props = defineProps();
const emit = defineEmits();
const nowMs = ref(Date.now());
function isOpeningDealIntroState() {
    return (props.state?.phase === "declaring" &&
        /^DEALER(?:_PICK|_CARD)?\s+\S+/.test(String(props.state?.lastAction ?? "")));
}
function shouldConcealOpeningHand() {
    return props.state?.phase === "waiting" || isOpeningDealIntroState();
}
const orderedPlayers = computed(() => {
    // 房间中的 Map 插入顺序会随加入、换座和机器人补位而变化，不能代表
    // A→B→C→D 的权威座次。先按服务端 seatIndex 排序，再围绕本人旋转。
    const list = [...(props.players ?? [])].sort((left, right) => {
        const leftSeat = Number.isInteger(left.seatIndex) && left.seatIndex >= 0
            ? left.seatIndex
            : Number.MAX_SAFE_INTEGER;
        const rightSeat = Number.isInteger(right.seatIndex) && right.seatIndex >= 0
            ? right.seatIndex
            : Number.MAX_SAFE_INTEGER;
        return leftSeat - rightSeat || left.clientId.localeCompare(right.clientId);
    });
    if (!list.length) {
        return [];
    }
    const idx = list.findIndex((p) => p.clientId === props.mySeatId);
    if (idx < 0) {
        return list;
    }
    return [...list.slice(idx), ...list.slice(0, idx)];
});
const selfPlayer = computed(() => orderedPlayers.value[0] ?? null);
const topPlayer = computed(() => orderedPlayers.value[2] ?? null);
const rightPlayer = computed(() => props.seatDirection === "clockwise" ? orderedPlayers.value[3] ?? null : orderedPlayers.value[1] ?? null);
const leftPlayer = computed(() => props.seatDirection === "clockwise" ? orderedPlayers.value[1] ?? null : orderedPlayers.value[3] ?? null);
const discardingCardId = ref(null);
const selectedDiscardCardId = ref(null);
const locallyAnimatedDiscardCardId = ref(null);
const flights = ref([]);
const showDealAnimation = ref(false);
const visibleHandCount = ref(shouldConcealOpeningHand() ? 0 : props.privateHand.length);
const dealerReveal = ref(null);
const dealerFlight = ref(null);
const flashActorId = ref("");
const drawHiddenCardId = ref("");
const tableRef = ref(null);
const boardRef = ref(null);
const responseLandingRef = ref(null);
const deckAnchorRef = ref(null);
const selfHandRef = ref(null);
const handHasOverflow = ref(false);
const handCanScrollBackward = ref(false);
const handCanScrollForward = ref(false);
let handResizeObserver = null;
const selfZoneRef = ref(null);
const selfOpenRef = ref(null);
const selfOpenCompactRef = ref(null);
const seatRefMap = new Map();
let dealerRevealSeq = 0;
let dealerFlightSeq = 0;
let flightSeq = 0;
let dealRunSeq = 0;
let dealTimer = null;
let dealInterval = null;
let dealerTimer = null;
let dealerIntroTimer = null;
let dealAnimatingUntil = 0;
let flashTimer = null;
let drawHideTimer = null;
let countdownTimer = null;
let discardPendingTimer = null;
let localDiscardAckTimer = null;
const OP_COUNTDOWN_MS = 30000;
function splitExposedGroups(cards, sizes, prefix) {
    const normalizeResponseFlag = (chunk) => {
        const firstResponseIndex = chunk.findIndex((card) => Boolean(card.isResponseCard));
        if (firstResponseIndex < 0) {
            return chunk.map((card) => ({ ...card }));
        }
        return chunk.map((card, idx) => ({
            ...card,
            isResponseCard: idx === firstResponseIndex,
        }));
    };
    const cleanSizes = sizes.filter((size) => Number.isFinite(size) && size > 0);
    const total = cleanSizes.reduce((sum, size) => sum + size, 0);
    if (!cleanSizes.length || total !== cards.length) {
        return cards.map((card, idx) => ({ id: `${prefix}-fallback-${idx}`, cards: [{ ...card }] }));
    }
    const groups = [];
    let offset = 0;
    for (let idx = 0; idx < cleanSizes.length; idx += 1) {
        const size = cleanSizes[idx];
        const chunk = normalizeResponseFlag(cards.slice(offset, offset + size));
        offset += size;
        if (chunk.length > 0) {
            groups.push({ id: `${prefix}-${idx}`, cards: chunk });
        }
    }
    return groups;
}
function buildOpenGroups(player, prefix) {
    const exposed = splitExposedGroups(player.exposedArea ?? [], player.exposedGroupSizes ?? [], `${prefix}-exp`);
    const generals = (player.generalArea ?? []).map((card, idx) => ({ id: `${prefix}-gen-${idx}`, cards: [{ ...card }] }));
    return [...exposed, ...generals];
}
function splitFishGroups(cards, prefix) {
    const groups = [];
    const buckets = new Map();
    const order = [];
    for (const card of cards) {
        const key = `${card.color}:${card.type}`;
        if (!buckets.has(key)) {
            buckets.set(key, []);
            order.push(key);
        }
        buckets.get(key).push({ ...card });
    }
    order.forEach((key, index) => {
        const cardsInGroup = buckets.get(key) ?? [];
        if (cardsInGroup.length) {
            groups.push({ id: `${prefix}-fish-${index}`, cards: cardsInGroup });
        }
    });
    return groups;
}
function buildPlayerGroupBlocks(player, prefix) {
    const fish = splitFishGroups(player.fishArea ?? [], prefix).map((group) => ({
        ...group,
        badge: "鱼",
        tone: "fish",
    }));
    const exposed = splitExposedGroups(player.exposedArea ?? [], player.exposedGroupSizes ?? [], `${prefix}-exp`).map((group) => ({
        ...group,
        tone: "meld",
    }));
    return [...fish, ...exposed];
}
const selfGroupBlocks = computed(() => {
    const player = selfPlayer.value;
    if (!player) {
        return [];
    }
    return buildPlayerGroupBlocks(player, `self-${player.clientId}`);
});
const topGroupBlocks = computed(() => {
    const player = topPlayer.value;
    if (!player) {
        return [];
    }
    return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});
const leftGroupBlocks = computed(() => {
    const player = leftPlayer.value;
    if (!player) {
        return [];
    }
    return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});
const rightGroupBlocks = computed(() => {
    const player = rightPlayer.value;
    if (!player) {
        return [];
    }
    return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});
const latestDiscardFromAction = computed(() => {
    const match = String(props.state?.lastAction ?? "").match(/^(\S+)\s+DISCARD$/);
    if (!match) {
        return null;
    }
    const ownerId = match[1];
    const owner = props.players.find((x) => x.clientId === ownerId);
    const ownerDiscardCount = owner?.discardPile?.length ?? 0;
    const latestDiscard = ownerDiscardCount > 0 ? owner?.discardPile?.[ownerDiscardCount - 1] : undefined;
    if (latestDiscard?.id) {
        return { ...latestDiscard, source: "upper" };
    }
    const publicTop = props.state?.publicDiscardPile?.[props.state?.publicDiscardPile?.length - 1];
    if (publicTop?.id) {
        return { ...publicTop, source: "upper" };
    }
    return null;
});
const responseCard = computed(() => {
    const directResponse = props.state?.responseCard;
    if (directResponse?.id) {
        return directResponse;
    }
    const directTarget = props.state?.targetCard;
    if (props.state?.responsePhase === "collective" && directTarget?.id) {
        return directTarget;
    }
    const collective = props.state?.responsePhase === "collective";
    if (collective) {
        const publicCount = props.state?.publicDiscardPile?.length ?? 0;
        const publicTop = publicCount > 0 ? props.state?.publicDiscardPile?.[publicCount - 1] : undefined;
        if (publicTop?.id) {
            return { ...publicTop, source: "upper" };
        }
        if (latestDiscardFromAction.value?.id) {
            return latestDiscardFromAction.value;
        }
    }
    const card = props.state?.responseCard;
    if (card?.id) {
        return card;
    }
    return collective ? latestDiscardFromAction.value : null;
});
function getPreviousPlayer(playerId) {
    const list = props.players ?? [];
    const idx = list.findIndex((player) => player.clientId === playerId);
    if (idx < 0 || list.length === 0) {
        return null;
    }
    return list[(idx - 1 + list.length) % list.length] ?? null;
}
function getNextPlayer(playerId) {
    const list = props.players ?? [];
    const idx = list.findIndex((player) => player.clientId === playerId);
    if (idx < 0 || list.length === 0) {
        return null;
    }
    return list[(idx + 1) % list.length] ?? null;
}
function flowOwner(playerId) {
    return getPreviousPlayer(playerId);
}
function flowTitle(playerId) {
    const receiver = props.players.find((player) => player.clientId === playerId);
    const sender = flowOwner(playerId);
    if (!receiver?.name || !sender?.name) {
        return "流水";
    }
    return `${sender.name} → ${receiver.name}`;
}
function flowAccessibleTitle(playerId) {
    const receiver = props.players.find((player) => player.clientId === playerId);
    const sender = flowOwner(playerId);
    if (!receiver?.name || !sender?.name) {
        return "流水牌";
    }
    return `流水：${sender.name} 打给 ${receiver.name}`;
}
const activeFlowSourcePlayerId = computed(() => {
    const pending = responseCard.value;
    if (!pending || pending.source !== "upper") {
        return "";
    }
    return String(props.state?.pollOriginPlayerId || props.state?.previousPlayerId || "");
});
const activeFlowTargetPlayerId = computed(() => {
    const sourcePlayerId = activeFlowSourcePlayerId.value;
    if (!sourcePlayerId) {
        return "";
    }
    return getNextPlayer(sourcePlayerId)?.clientId ?? "";
});
function shouldAppendPendingToFlow(playerId) {
    const pending = responseCard.value;
    if (!pending || pending.source !== "upper") {
        return false;
    }
    if (activeFlowTargetPlayerId.value !== playerId) {
        return false;
    }
    const owner = props.players.find((player) => player.clientId === activeFlowSourcePlayerId.value);
    return !owner?.discardPile?.some((card) => card.id === pending.id);
}
function flowCards(playerId) {
    const owner = flowOwner(playerId);
    const cards = owner?.discardPile ? [...owner.discardPile] : [];
    if (shouldAppendPendingToFlow(playerId) && responseCard.value) {
        cards.push(responseCard.value);
    }
    return cards;
}
function flowCardCount(playerId) {
    return flowCards(playerId).length;
}
function visibleFlowCards(playerId) {
    const cards = flowCards(playerId);
    const limit = props.ultraCompact ? 8 : 14;
    return cards.slice(Math.max(0, cards.length - limit));
}
function isActiveDiscardCard(playerId, card, index) {
    const cards = visibleFlowCards(playerId);
    if (index !== cards.length - 1) {
        return false;
    }
    const pending = responseCard.value;
    if (!pending || pending.source !== "upper") {
        return false;
    }
    if (pending.id !== card.id) {
        return false;
    }
    if (shouldAppendPendingToFlow(playerId)) {
        return activeFlowTargetPlayerId.value === playerId;
    }
    const owner = flowOwner(playerId);
    const latestCount = owner?.discardPile?.length ?? 0;
    const latest = latestCount > 0 ? owner?.discardPile?.[latestCount - 1] : undefined;
    return Boolean(latest?.id === card.id);
}
const displayTurnPlayerId = computed(() => {
    if (props.state?.responsePhase === "collective") {
        return (props.state?.currentTurnPlayerId ||
            props.state?.currentPlayerId ||
            props.state?.pollOriginPlayerId ||
            "");
    }
    return props.state?.currentTurnPlayerId || props.state?.currentPlayerId || "";
});
const currentPlayer = computed(() => {
    const playerId = displayTurnPlayerId.value;
    if (!playerId) {
        return null;
    }
    return props.players.find((x) => x.clientId === playerId) ?? null;
});
const currentPlayerName = computed(() => {
    const playerId = displayTurnPlayerId.value;
    if (!playerId) {
        return "-";
    }
    return currentPlayer.value?.name || playerId;
});
const isMyTurn = computed(() => String(props.state?.responsePhase ?? "") !== "collective" &&
    Boolean(props.mySeatId) &&
    displayTurnPlayerId.value === props.mySeatId &&
    !Boolean(currentPlayer.value?.isBot || currentPlayer.value?.isAutoPlay));
const openingDealIntroActive = computed(() => isOpeningDealIntroState());
const handPresentationBusy = computed(() => openingDealIntroActive.value || showDealAnimation.value);
const canAct = computed(() => Boolean(props.canAct) && !handPresentationBusy.value);
const canDiscard = computed(() => Boolean(props.canDiscard) && !handPresentationBusy.value);
const effectiveInteractionPausedMessage = computed(() => {
    if (props.interactionPausedMessage) {
        return props.interactionPausedMessage;
    }
    if (handPresentationBusy.value && (props.canAct || props.canDiscard)) {
        return "正在整理手牌，请稍候";
    }
    return "";
});
const canConfirmDiscard = computed(() => {
    const selectedId = selectedDiscardCardId.value;
    if (!selectedId || !canDiscard.value) {
        return false;
    }
    const card = props.privateHand.find((item) => item.id === selectedId);
    return Boolean(card && canDiscardCard(card));
});
const selectedDiscardCardLabel = computed(() => {
    const selectedId = selectedDiscardCardId.value;
    if (!selectedId) {
        return "";
    }
    const card = props.privateHand.find((item) => item.id === selectedId);
    return card ? getCardAccessibleText(card) : "";
});
const displayPrivateHand = computed(() => {
    if (props.state?.phase === "waiting") {
        return [];
    }
    const shouldLimit = showDealAnimation.value || openingDealIntroActive.value;
    const limit = shouldLimit ? Math.max(0, visibleHandCount.value || 0) : props.privateHand.length;
    return props.privateHand.slice(0, limit);
});
const isResponseCardDrawHidden = computed(() => Boolean(drawHiddenCardId.value) && responseCard.value?.id === drawHiddenCardId.value);
const activeCandidates = computed(() => props.activeCandidates ?? []);
const selectedCandidate = computed(() => {
    const id = props.selectedCandidateId ?? "";
    if (!id) {
        return null;
    }
    return activeCandidates.value.find((candidate) => candidate.id === id) ?? null;
});
const candidateIndexesByCardId = computed(() => {
    const map = new Map();
    activeCandidates.value.forEach((candidate, index) => {
        candidate.cardIds.forEach((cardId) => {
            const list = map.get(cardId) ?? [];
            list.push(index + 1);
            map.set(cardId, list);
        });
    });
    return map;
});
const ACTION_LABELS = {
    DISCARD: "出牌",
    PENG: "碰",
    KAI: "开",
    CHI: "吃",
    HU: "胡",
    ZHUA: "抓",
    PASS: "过",
    TIMEOUT_PASS: "超时过",
    FORCE_TAKE: "吃",
};
const latestSeatAction = computed(() => {
    const action = String(props.state?.lastAction ?? "").trim();
    if (!action) {
        return null;
    }
    const { actor, keyword } = parseActionDescriptor(action);
    if (!actor) {
        return null;
    }
    const label = ACTION_LABELS[keyword];
    if (!label) {
        return null;
    }
    return { actorId: actor, label };
});
const seatCountdownSeconds = computed(() => {
    if (/^DEALER\s+\S+/.test(String(props.state?.lastAction ?? "")) &&
        Number(props.state?.responseEndsAt ?? 0) > nowMs.value) {
        return null;
    }
    const endsAt = playDecisionEndsAt.value;
    if (!endsAt || endsAt <= nowMs.value) {
        return null;
    }
    const totalMs = Math.max(OP_COUNTDOWN_MS, Number(props.decisionTimerTotalMs ?? 0));
    return Math.max(0, Math.min(Math.ceil(totalMs / 1000), Math.ceil((endsAt - nowMs.value) / 1000)));
});
const seatCountdownPercent = computed(() => {
    if (/^DEALER\s+\S+/.test(String(props.state?.lastAction ?? "")) &&
        Number(props.state?.responseEndsAt ?? 0) > nowMs.value) {
        return 0;
    }
    const endsAt = playDecisionEndsAt.value;
    if (!endsAt || endsAt <= nowMs.value) {
        return 0;
    }
    const remain = endsAt - nowMs.value;
    const totalMs = Math.max(OP_COUNTDOWN_MS, Number(props.decisionTimerTotalMs ?? 0));
    const raw = (remain / totalMs) * 100;
    return Math.max(0, Math.min(100, Number(raw.toFixed(1))));
});
const playDecisionEndsAt = computed(() => {
    if (props.decisionKey?.startsWith("play:") && Number(props.decisionTimerEndsAt ?? 0) > 0) {
        return Number(props.decisionTimerEndsAt);
    }
    return Number(props.state?.responseEndsAt ?? 0);
});
const compactCenterHint = computed(() => {
    if (effectiveInteractionPausedMessage.value) {
        return effectiveInteractionPausedMessage.value;
    }
    if (props.turnHint) {
        return props.turnHint;
    }
    if (canDiscard.value) {
        return "选择手牌后确认出牌";
    }
    if (String(props.state?.responsePhase ?? "") === "collective") {
        return canAct.value ? "全局待响：可胡/开/碰/过" : "等待三家响应";
    }
    if (String(props.state?.responsePhase ?? "") === "local_upper" && canAct.value) {
        return "可吃或抓";
    }
    if (String(props.state?.responsePhase ?? "") === "local_draw" && canAct.value) {
        return "可吃或过";
    }
    return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});
const centerPointerDirection = computed(() => {
    if (String(props.state?.responsePhase ?? "") === "collective") {
        return null;
    }
    const currentId = String(displayTurnPlayerId.value || "");
    if (!currentId) {
        return null;
    }
    const position = resolvePlayerPosition(currentId);
    if (position === "top") {
        return "up";
    }
    if (position === "left") {
        return "left";
    }
    if (position === "right") {
        return "right";
    }
    return "down";
});
const dealerInfoCard = computed(() => {
    const card = props.state?.dealerCard;
    return card?.id ? card : null;
});
const dealerSeatMarkerReady = computed(() => !/^DEALER_(?:PICK|CARD)\b/.test(String(props.state?.lastAction ?? "")));
// Colyseus may notify lastAction before the dealerCard fields from the same
// patch have reached Vue. Keep the visible face bound to the authoritative
// state so a reveal can never freeze the previous round's card.
const dealerCeremonyCard = computed(() => {
    const reveal = dealerReveal.value;
    if (!reveal || reveal.stage !== "revealed") {
        return null;
    }
    return dealerInfoCard.value ?? reveal.card;
});
const dealerRevealAccessibleText = computed(() => {
    const reveal = dealerReveal.value;
    const card = dealerCeremonyCard.value;
    if (!reveal || reveal.stage === "picking" || !card) {
        return "正在翻定庄牌";
    }
    return `定庄牌为${getCardAccessibleText(card)}，${reveal.dealerName || "庄家"}坐庄`;
});
function showDealerSeatMarker(playerId) {
    return dealerSeatMarkerReady.value && isDealer(playerId) && Boolean(dealerInfoCard.value);
}
function isCollectiveResponder(playerId) {
    void playerId;
    return false;
}
function seatActionText(playerId) {
    return latestSeatAction.value?.actorId === playerId ? latestSeatAction.value.label : "";
}
function hasSeatAction(playerId) {
    return seatActionText(playerId).length > 0;
}
function isCurrentTurn(playerId) {
    if (String(props.state?.responsePhase ?? "") === "collective") {
        return false;
    }
    return displayTurnPlayerId.value === playerId;
}
function statusText(player) {
    if (player.isConfiguredBot) {
        return "机器人";
    }
    if (player.isAutoPlay) {
        return props.ultraCompact ? "托管中" : "机器人代打";
    }
    if (player.isBot) {
        return props.ultraCompact ? "托管中" : "暂由机器人";
    }
    return player.connected ? "真人在线" : "真人离线";
}
function seatMetaText(groupCount, declaredKongs) {
    const parts = [];
    if (groupCount > 0) {
        parts.push(`牌组 ${groupCount} 组`);
    }
    if (declaredKongs > 0) {
        parts.push(`暗坎 ${declaredKongs}`);
    }
    return parts.join(" · ");
}
function playerAccessibleSummary(player, groupCount) {
    const parts = [
        player.clientId === props.mySeatId ? `${player.name}，你的位置` : player.name,
        `剩余手牌 ${playerHandCount(player)} 张`,
        `公开牌组 ${groupCount} 组`,
        `暗坎 ${Number(player.declaredKongs ?? 0)} 组`,
        statusText(player),
    ];
    if (isDealer(player.clientId)) {
        parts.push("庄家");
    }
    if (isCurrentTurn(player.clientId)) {
        parts.push("当前回合");
    }
    return parts.join("，");
}
function isTemporaryBotControl(player) {
    return player.isAutoPlay || (player.isBot && !player.isConfiguredBot);
}
function playerHandCount(player) {
    if (player.clientId === props.mySeatId) {
        return props.privateHand.length;
    }
    return Number(player.handCount ?? 0);
}
function isDealer(playerId) {
    return Boolean(playerId) && String(props.state?.dealerId ?? "") === playerId;
}
function isSystemAction(actionKey) {
    return actionKey === "NO_RESPONSE" || actionKey === "TURN_DRAW" || actionKey === "KONG_DRAW";
}
function canDiscardCard(card) {
    return canDiscard.value && !isDiscardProtectedCard(card);
}
function isDiscardProtectedCard(card) {
    return card.type === "jiang" || card.color === "gold";
}
function selectDiscardCard(cardId) {
    if (discardingCardId.value) {
        return;
    }
    const picked = props.privateHand.find((card) => card.id === cardId);
    if (!picked || !canDiscardCard(picked)) {
        return;
    }
    selectedDiscardCardId.value = cardId;
}
function updateHandScrollState() {
    const hand = selfHandRef.value;
    if (!hand) {
        handHasOverflow.value = false;
        handCanScrollBackward.value = false;
        handCanScrollForward.value = false;
        return;
    }
    const maxScrollLeft = Math.max(0, hand.scrollWidth - hand.clientWidth);
    handHasOverflow.value = maxScrollLeft > 2;
    handCanScrollBackward.value = hand.scrollLeft > 2;
    handCanScrollForward.value = hand.scrollLeft < maxScrollLeft - 2;
}
function scrollHand(direction) {
    const hand = selfHandRef.value;
    if (!hand) {
        return;
    }
    const distance = Math.max(120, Math.round(hand.clientWidth * 0.72));
    hand.scrollBy({
        left: direction === "forward" ? distance : -distance,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    window.setTimeout(updateHandScrollState, 320);
}
function observeHandScroller(hand) {
    handResizeObserver?.disconnect();
    handResizeObserver = null;
    if (!hand) {
        updateHandScrollState();
        return;
    }
    if (typeof ResizeObserver !== "undefined") {
        handResizeObserver = new ResizeObserver(updateHandScrollState);
        handResizeObserver.observe(hand);
    }
    void nextTick(updateHandScrollState);
}
function confirmDiscard() {
    const cardId = selectedDiscardCardId.value;
    if (!cardId || !canConfirmDiscard.value || discardingCardId.value) {
        return;
    }
    const picked = props.privateHand.find((card) => card.id === cardId);
    if (!picked) {
        selectedDiscardCardId.value = null;
        return;
    }
    const cardElement = Array.from(selfHandRef.value?.querySelectorAll("[data-card-id]") ?? [])
        .find((element) => element.dataset.cardId === cardId);
    if (localDiscardAckTimer) {
        clearTimeout(localDiscardAckTimer);
        localDiscardAckTimer = null;
    }
    if (cardElement) {
        triggerDiscardAnimationFromElement(cardElement, picked);
        locallyAnimatedDiscardCardId.value = cardId;
        localDiscardAckTimer = setTimeout(() => {
            if (locallyAnimatedDiscardCardId.value === cardId) {
                locallyAnimatedDiscardCardId.value = null;
            }
            localDiscardAckTimer = null;
        }, 10_000);
    }
    else {
        locallyAnimatedDiscardCardId.value = null;
    }
    discardingCardId.value = cardId;
    emit("discardCard", cardId);
    if (discardPendingTimer) {
        clearTimeout(discardPendingTimer);
    }
    discardPendingTimer = setTimeout(() => {
        if (discardingCardId.value === cardId) {
            discardingCardId.value = null;
        }
        discardPendingTimer = null;
    }, 2500);
}
function onSubmitAction(request) {
    emit("submitAction", request);
}
function onSelectionChange(payload) {
    emit("selectionChange", payload);
}
function isCandidateCard(cardId) {
    return candidateIndexesByCardId.value.has(cardId);
}
function isSelectedCandidateCard(cardId) {
    return Boolean(selectedCandidate.value?.cardIds.includes(cardId));
}
function candidateBadgeText(cardId) {
    const indexes = candidateIndexesByCardId.value.get(cardId) ?? [];
    return indexes.length > 0 ? indexes.join("/") : "";
}
function cardLabel(card) {
    return getCardLabelText(card);
}
function handCardAccessibleLabel(card) {
    const state = selectedDiscardCardId.value === card.id
        ? "已选中"
        : canDiscardCard(card)
            ? "可选择"
            : canDiscard.value && isDiscardProtectedCard(card)
                ? "规则保护，不能打出"
                : "当前无需选牌";
    return `${getCardAccessibleText(card)}，${state}`;
}
function parseActionDescriptor(action) {
    const parts = String(action ?? "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return { actor: "", keyword: "" };
    }
    if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
        return {
            actor: parts[0],
            keyword: parts[1] ?? "",
        };
    }
    return {
        actor: "",
        keyword: parts[0],
    };
}
function setSeatRef(playerId, el) {
    if (!playerId) {
        return;
    }
    if (el) {
        seatRefMap.set(playerId, el);
    }
    else {
        seatRefMap.delete(playerId);
    }
}
function resolvePlayerPosition(playerId) {
    if (selfPlayer.value?.clientId === playerId) {
        return "self";
    }
    if (topPlayer.value?.clientId === playerId) {
        return "top";
    }
    if (leftPlayer.value?.clientId === playerId) {
        return "left";
    }
    if (rightPlayer.value?.clientId === playerId) {
        return "right";
    }
    return "self";
}
function pointFromElement(el) {
    if (!el) {
        return null;
    }
    const rect = el.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}
function openAreaTargetForSelf() {
    return pointFromElement(selfOpenCompactRef.value) ?? pointFromElement(selfOpenRef.value) ?? pointFromElement(selfZoneRef.value);
}
function targetForPlayer(playerId) {
    if (!playerId) {
        return null;
    }
    if (selfPlayer.value?.clientId === playerId) {
        return pointFromElement(selfHandRef.value) ?? pointFromElement(selfZoneRef.value);
    }
    return pointFromElement(seatRefMap.get(playerId) ?? null);
}
function responseLandingPoint() {
    return pointFromElement(responseLandingRef.value) ?? pointFromElement(tableRef.value);
}
function dealStartPoint() {
    return pointFromElement(deckAnchorRef.value) ?? responseLandingPoint();
}
function groupOffsets(count) {
    if (count <= 1) {
        return [{ x: 0, y: 0 }];
    }
    if (count === 3) {
        return [
            { x: -20, y: 6 },
            { x: 0, y: -10 },
            { x: 20, y: 6 },
        ];
    }
    return [
        { x: -28, y: 8 },
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 28, y: 8 },
    ];
}
function spawnFlight(flight) {
    const id = ++flightSeq;
    flights.value.push({ id, ...flight });
    const ttl = Math.max(120, flight.duration + flight.delay + 120);
    window.setTimeout(() => {
        flights.value = flights.value.filter((item) => item.id !== id);
    }, ttl);
}
function flightStyle(flight) {
    return {
        "--sx": `${flight.sx}px`,
        "--sy": `${flight.sy}px`,
        "--ex": `${flight.ex}px`,
        "--ey": `${flight.ey}px`,
        "--dur": `${flight.duration}ms`,
        "--delay": `${flight.delay}ms`,
        width: `${flight.width}px`,
        height: `${flight.height}px`,
    };
}
function dealerFlightStyle(flight) {
    return {
        "--sx": `${flight.sx}px`,
        "--sy": `${flight.sy}px`,
        "--ex": `${flight.ex}px`,
        "--ey": `${flight.ey}px`,
    };
}
function triggerDealerFlight(dealerId) {
    const start = pointFromElement(tableRef.value);
    const end = targetForPlayer(dealerId);
    if (!start || !end) {
        return;
    }
    const id = ++dealerFlightSeq;
    dealerFlight.value = {
        id,
        sx: start.x - 26,
        sy: start.y - 18,
        ex: end.x - 26,
        ey: end.y - 18,
    };
    window.setTimeout(() => {
        if (dealerFlight.value?.id === id) {
            dealerFlight.value = null;
        }
    }, 980);
}
function triggerDiscardAnimationFromElement(sourceEl, card) {
    const source = pointFromElement(sourceEl);
    const target = responseLandingPoint();
    if (!source || !target) {
        return;
    }
    spawnFlight({
        mode: "discard",
        card,
        sx: source.x - 12,
        sy: source.y - 34,
        ex: target.x - 14,
        ey: target.y - 38,
        width: 28,
        height: 76,
        duration: 260,
        delay: 0,
    });
}
function triggerDiscardAnimationFromSeat(actorId) {
    const source = targetForPlayer(actorId);
    const target = responseLandingPoint();
    const card = responseCard.value ?? latestDiscardFromAction.value ?? undefined;
    if (!source || !target || !card) {
        return;
    }
    spawnFlight({
        mode: "discard",
        card,
        sx: source.x - 12,
        sy: source.y - 34,
        ex: target.x - 14,
        ey: target.y - 38,
        width: 28,
        height: 76,
        duration: 300,
        delay: 0,
    });
}
function triggerMeldAnimation(actorId, keyword) {
    const source = responseLandingPoint();
    const target = selfPlayer.value?.clientId === actorId
        ? openAreaTargetForSelf()
        : pointFromElement(seatRefMap.get(actorId) ?? null);
    if (!source || !target) {
        return;
    }
    const baseCard = responseCard.value ?? latestDiscardFromAction.value ?? undefined;
    if (!baseCard) {
        return;
    }
    const count = keyword === "KAI" ? 4 : 3;
    const offsets = groupOffsets(count);
    offsets.forEach((offset, index) => {
        spawnFlight({
            mode: "meld",
            card: { ...baseCard, id: `${baseCard.id}-meld-${index}-${Date.now()}` },
            sx: source.x - 11 + index * 3,
            sy: source.y - 32 + index * 2,
            ex: target.x - 13 + offset.x,
            ey: target.y - 36 + offset.y,
            width: 26,
            height: 72,
            duration: 330,
            delay: index * 70,
        });
    });
}
function triggerDrawAnimation(actorId) {
    const source = dealStartPoint();
    const target = responseLandingPoint();
    const card = responseCard.value ?? undefined;
    if (!source || !target || !card) {
        return;
    }
    if (drawHideTimer) {
        clearTimeout(drawHideTimer);
        drawHideTimer = null;
    }
    drawHiddenCardId.value = card.id;
    spawnFlight({
        mode: "discard",
        card,
        sx: source.x - 12,
        sy: source.y - 34,
        ex: target.x - 14,
        ey: target.y - 38,
        width: 28,
        height: 76,
        duration: 340,
        delay: 0,
    });
    drawHideTimer = setTimeout(() => {
        if (drawHiddenCardId.value === card.id) {
            drawHiddenCardId.value = "";
        }
        drawHideTimer = null;
    }, 330);
    triggerActorFlash(actorId);
}
function buildDealPlan() {
    const players = orderedPlayers.value.map((p) => p.clientId);
    if (players.length !== 4) {
        return [];
    }
    const dealerId = String(props.state?.dealerId ?? "");
    if (!dealerId || !players.includes(dealerId)) {
        return [];
    }
    const dealerIdx = players.indexOf(dealerId);
    const ring = Array.from({ length: players.length }, (_, idx) => players[(dealerIdx + idx) % players.length]);
    const rest = new Map(players.map((id) => [id, id === dealerId ? 21 : 20]));
    const plan = [];
    let safe = 0;
    while (safe < 120) {
        safe += 1;
        let progressed = false;
        for (const id of ring) {
            const left = rest.get(id) ?? 0;
            if (left <= 0) {
                continue;
            }
            plan.push(id);
            rest.set(id, left - 1);
            progressed = true;
        }
        if (!progressed) {
            break;
        }
    }
    return plan;
}
function clearDealAnimationRuntime() {
    if (dealTimer) {
        clearTimeout(dealTimer);
        dealTimer = null;
    }
    if (dealInterval) {
        clearInterval(dealInterval);
        dealInterval = null;
    }
    visibleHandCount.value = props.privateHand.length;
}
function triggerDealAnimation() {
    clearDealAnimationRuntime();
    const plan = buildDealPlan();
    const start = dealStartPoint();
    if (!plan.length || !start) {
        showDealAnimation.value = false;
        dealAnimatingUntil = Date.now();
        return 0;
    }
    const runId = ++dealRunSeq;
    showDealAnimation.value = true;
    visibleHandCount.value = 0;
    let index = 0;
    const finishMs = plan.length * 32 + 320;
    dealAnimatingUntil = Date.now() + finishMs;
    const dispatch = () => {
        if (runId !== dealRunSeq) {
            return;
        }
        const targetSeat = plan[index];
        const end = targetForPlayer(targetSeat);
        if (end) {
            spawnFlight({
                mode: "deal",
                sx: start.x - 10,
                sy: start.y - 28,
                ex: end.x - 10,
                ey: end.y - 28,
                width: 20,
                height: 56,
                duration: 230,
                delay: 0,
            });
        }
        index += 1;
        const fullHand = props.privateHand.length;
        if (fullHand > 0) {
            const reveal = Math.min(fullHand, Math.ceil((index / plan.length) * fullHand));
            visibleHandCount.value = Math.max(visibleHandCount.value, reveal);
        }
        if (index >= plan.length) {
            clearDealAnimationRuntime();
            dealTimer = setTimeout(() => {
                if (runId === dealRunSeq) {
                    showDealAnimation.value = false;
                    visibleHandCount.value = props.privateHand.length;
                }
            }, 320);
        }
    };
    dispatch();
    dealInterval = setInterval(dispatch, 32);
    return finishMs;
}
function clearDealerIntroTimer() {
    if (dealerIntroTimer) {
        clearTimeout(dealerIntroTimer);
        dealerIntroTimer = null;
    }
}
function triggerActorFlash(actorId) {
    if (!actorId) {
        return;
    }
    if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
    }
    flashActorId.value = actorId;
    flashTimer = setTimeout(() => {
        flashActorId.value = "";
        flashTimer = null;
    }, 780);
}
function clearDealerReveal() {
    if (dealerTimer) {
        clearTimeout(dealerTimer);
        dealerTimer = null;
    }
    dealerReveal.value = null;
}
function triggerDealerReveal(stage, label, card, dealerId = "") {
    if (dealerTimer) {
        clearTimeout(dealerTimer);
        dealerTimer = null;
    }
    const continuingReveal = stage === "revealed" && dealerReveal.value?.stage === "picking";
    const id = continuingReveal ? dealerReveal.value.id : ++dealerRevealSeq;
    const dealerName = dealerId
        ? props.players.find((player) => player.clientId === dealerId)?.name || "庄家"
        : "";
    dealerReveal.value = {
        id,
        stage,
        label,
        card: card ?? null,
        dealerId,
        dealerName,
    };
    dealerTimer = setTimeout(() => {
        dealerReveal.value = null;
        dealerTimer = null;
    }, 2400);
}
onMounted(() => {
    countdownTimer = setInterval(() => {
        nowMs.value = Date.now();
    }, 500);
});
onUnmounted(() => {
    handResizeObserver?.disconnect();
    handResizeObserver = null;
    clearDealAnimationRuntime();
    clearDealerIntroTimer();
    if (dealerTimer) {
        clearTimeout(dealerTimer);
        dealerTimer = null;
    }
    if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
    }
    if (drawHideTimer) {
        clearTimeout(drawHideTimer);
        drawHideTimer = null;
    }
    if (discardPendingTimer) {
        clearTimeout(discardPendingTimer);
        discardPendingTimer = null;
    }
    if (localDiscardAckTimer) {
        clearTimeout(localDiscardAckTimer);
        localDiscardAckTimer = null;
    }
    flashActorId.value = "";
    drawHiddenCardId.value = "";
    dealerFlight.value = null;
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
});
// GameBoard is mounted when the waiting lobby changes into the dealer intro.
// Present that initial DEALER_PICK/DEALER_CARD event immediately; the old
// mount hook incorrectly started a complete deal here and DEALER started a
// second one a moment later.
watch(() => props.state?.lastAction, (action) => {
    const dealerPickMatch = String(action ?? "").match(/^DEALER_PICK\s+(\S+)/);
    if (dealerPickMatch) {
        triggerDealerReveal("picking", "正在翻定庄牌");
        return;
    }
    const dealerCardMatch = String(action ?? "").match(/^DEALER_CARD\s+(\S+)/);
    if (dealerCardMatch) {
        const dealerId = dealerCardMatch[1];
        triggerDealerReveal("revealed", "定庄牌揭晓", dealerInfoCard.value, dealerId);
        return;
    }
    const dealerMatch = String(action ?? "").match(/^DEALER\s+(\S+)/);
    if (dealerMatch && props.state?.phase === "declaring") {
        clearDealerReveal();
        triggerDealerFlight(dealerMatch[1]);
        triggerDealAnimation();
        return;
    }
    const { actor, keyword } = parseActionDescriptor(String(action ?? ""));
    if (actor) {
        triggerActorFlash(actor);
    }
    if (keyword === "DISCARD" && actor) {
        const isLocalAcknowledgement = actor === props.mySeatId && Boolean(locallyAnimatedDiscardCardId.value);
        if (isLocalAcknowledgement) {
            locallyAnimatedDiscardCardId.value = null;
            if (localDiscardAckTimer) {
                clearTimeout(localDiscardAckTimer);
                localDiscardAckTimer = null;
            }
        }
        else {
            triggerDiscardAnimationFromSeat(actor);
        }
        return;
    }
    if ((keyword === "PENG" || keyword === "KAI" || keyword === "CHI") && actor) {
        triggerMeldAnimation(actor, keyword);
        return;
    }
    if ((keyword === "ZHUA" || keyword === "TURN_DRAW" || keyword === "KONG_DRAW") && actor) {
        triggerDrawAnimation(actor);
    }
}, { immediate: true });
watch(() => props.privateHand.map((x) => x.id).join("|"), () => {
    if (!showDealAnimation.value && !openingDealIntroActive.value && props.state?.phase !== "waiting") {
        visibleHandCount.value = props.privateHand.length;
    }
    if (discardingCardId.value && !props.privateHand.some((card) => card.id === discardingCardId.value)) {
        discardingCardId.value = null;
        if (discardPendingTimer) {
            clearTimeout(discardPendingTimer);
            discardPendingTimer = null;
        }
    }
    if (selectedDiscardCardId.value && !props.privateHand.some((card) => card.id === selectedDiscardCardId.value)) {
        selectedDiscardCardId.value = null;
    }
    void nextTick(updateHandScrollState);
});
watch(selfHandRef, observeHandScroller, { immediate: true });
watch(canDiscard, (enabled) => {
    if (!enabled) {
        selectedDiscardCardId.value = null;
    }
});
watch(() => canAct.value || canDiscard.value, (ready, wasReady) => {
    if (!ready || wasReady) {
        return;
    }
    void nextTick(() => {
        if (document.querySelector("[aria-modal='true']")) {
            return;
        }
        const board = boardRef.value;
        const target = canDiscard.value
            ? board?.querySelector(".hand-card.playable")
            : board?.querySelector(".action-dock .btn:not(:disabled)");
        target?.focus();
    });
}, { immediate: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['actor-flash']} */ ;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-groups-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-groups-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-groups-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-card-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-timer-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block-list']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['pending-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-number']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-number']} */ ;
/** @type {__VLS_StyleScopedClasses['center-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['actor-flash']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-main']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-scroll-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-scroll-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-scroll-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['can-scroll-forward']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['can-scroll-backward']} */ ;
/** @type {__VLS_StyleScopedClasses['can-scroll-forward']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['playable']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['fx-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-back']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-back']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-back']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-back']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-back']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center-board']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-timer-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['corner-card']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block-list']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block']} */ ;
/** @type {__VLS_StyleScopedClasses['group-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-groups-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['player-top']} */ ;
/** @type {__VLS_StyleScopedClasses['player-left']} */ ;
/** @type {__VLS_StyleScopedClasses['player-right']} */ ;
/** @type {__VLS_StyleScopedClasses['player-left']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['player-right']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['player-left']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['player-right']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['player-left']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['player-right']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-groups-card']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center-board']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-name']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-groups-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-scroll-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-scroll-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-long']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-large']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['temporary-control']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-number']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-card-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['card']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-back']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-flight']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-flight']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "boardRef",
    ...{ class: "board" },
    'data-testid': "game-board",
    'data-response-phase': (props.responsePhase ?? ''),
});
/** @type {typeof __VLS_ctx.boardRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table" },
    ref: "tableRef",
});
/** @type {typeof __VLS_ctx.tableRef} */ ;
if (__VLS_ctx.leftPlayer && __VLS_ctx.flowCardCount(__VLS_ctx.leftPlayer.clientId)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "flow-card flow-top-left" },
        'aria-label': (__VLS_ctx.flowAccessibleTitle(__VLS_ctx.leftPlayer.clientId)),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        'aria-hidden': "true",
    });
    (__VLS_ctx.flowTitle(__VLS_ctx.leftPlayer.clientId));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "discard-strip" },
    });
    for (const [card, index] of __VLS_getVForSourceType((__VLS_ctx.visibleFlowCards(__VLS_ctx.leftPlayer.clientId)))) {
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            key: (`flow-top-left-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.leftPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }));
        const __VLS_1 = __VLS_0({
            key: (`flow-top-left-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.leftPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    }
}
if (__VLS_ctx.topPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ref: ((el) => __VLS_ctx.topPlayer && __VLS_ctx.setSeatRef(__VLS_ctx.topPlayer.clientId, el)),
        ...{ class: "player-card player-top" },
        'data-testid': "player-top",
        'data-player-id': (__VLS_ctx.topPlayer.clientId),
        role: "group",
        'aria-label': (__VLS_ctx.playerAccessibleSummary(__VLS_ctx.topPlayer, __VLS_ctx.topGroupBlocks.length)),
        ...{ class: ({
                active: __VLS_ctx.isCurrentTurn(__VLS_ctx.topPlayer.clientId),
                dealer: __VLS_ctx.showDealerSeatMarker(__VLS_ctx.topPlayer.clientId),
                'actor-flash': __VLS_ctx.flashActorId === __VLS_ctx.topPlayer.clientId,
            }) },
    });
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.topPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-arrow" },
            'aria-hidden': "true",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "seat-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-identity" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.topPlayer.name);
    if (__VLS_ctx.topPlayer.isConfiguredBot) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "bot-seat-badge" },
            'data-testid': "bot-identity",
            'aria-label': "机器人",
            title: "机器人",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hand-count-badge" },
        'data-testid': "opponent-hand-count",
        'data-player-id': (__VLS_ctx.topPlayer.clientId),
    });
    (__VLS_ctx.playerHandCount(__VLS_ctx.topPlayer));
    if (__VLS_ctx.showDealerSeatMarker(__VLS_ctx.topPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-seat-lockup" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-badge" },
            'data-testid': "dealer-badge",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-card-mark" },
            'data-testid': "dealer-card",
        });
        if (__VLS_ctx.dealerInfoCard) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }));
            const __VLS_4 = __VLS_3({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.topPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.topPlayer.clientId) && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "turn-countdown" },
        });
        (__VLS_ctx.seatCountdownSeconds);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
        ...{ class: ({ 'temporary-control': __VLS_ctx.isTemporaryBotControl(__VLS_ctx.topPlayer) }) },
    });
    (__VLS_ctx.statusText(__VLS_ctx.topPlayer));
    if (__VLS_ctx.seatMetaText(__VLS_ctx.topGroupBlocks.length, __VLS_ctx.topPlayer.declaredKongs)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "seat-meta" },
        });
        (__VLS_ctx.seatMetaText(__VLS_ctx.topGroupBlocks.length, __VLS_ctx.topPlayer.declaredKongs));
    }
    if (__VLS_ctx.topGroupBlocks.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "group-block-list compact" },
        });
        for (const [group] of __VLS_getVForSourceType((__VLS_ctx.topGroupBlocks))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`top-group-${group.id}`),
                ...{ class: "group-block" },
                ...{ class: (group.tone) },
            });
            if (group.badge) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "group-badge" },
                });
                (group.badge);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mini-card-strip" },
                ...{ class: ({ 'mode-long': props.tableCardMode === 'long' }) },
            });
            for (const [card] of __VLS_getVForSourceType((group.cards))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_6 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`top-group-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }));
                const __VLS_7 = __VLS_6({
                    key: (`top-group-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_6));
            }
        }
    }
}
if (__VLS_ctx.topPlayer && __VLS_ctx.flowCardCount(__VLS_ctx.topPlayer.clientId)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "flow-card flow-top-right" },
        'aria-label': (__VLS_ctx.flowAccessibleTitle(__VLS_ctx.topPlayer.clientId)),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        'aria-hidden': "true",
    });
    (__VLS_ctx.flowTitle(__VLS_ctx.topPlayer.clientId));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "discard-strip" },
    });
    for (const [card, index] of __VLS_getVForSourceType((__VLS_ctx.visibleFlowCards(__VLS_ctx.topPlayer.clientId)))) {
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            key: (`flow-top-right-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.topPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }));
        const __VLS_10 = __VLS_9({
            key: (`flow-top-right-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.topPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
}
if (__VLS_ctx.leftPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ref: ((el) => __VLS_ctx.leftPlayer && __VLS_ctx.setSeatRef(__VLS_ctx.leftPlayer.clientId, el)),
        ...{ class: "player-card player-left" },
        'data-testid': "player-left",
        'data-player-id': (__VLS_ctx.leftPlayer.clientId),
        role: "group",
        'aria-label': (__VLS_ctx.playerAccessibleSummary(__VLS_ctx.leftPlayer, __VLS_ctx.leftGroupBlocks.length)),
        ...{ class: ({
                active: __VLS_ctx.isCurrentTurn(__VLS_ctx.leftPlayer.clientId),
                dealer: __VLS_ctx.showDealerSeatMarker(__VLS_ctx.leftPlayer.clientId),
                'actor-flash': __VLS_ctx.flashActorId === __VLS_ctx.leftPlayer.clientId,
            }) },
    });
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.leftPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-arrow turn-arrow-side" },
            'aria-hidden': "true",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "seat-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-identity" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.leftPlayer.name);
    if (__VLS_ctx.leftPlayer.isConfiguredBot) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "bot-seat-badge" },
            'data-testid': "bot-identity",
            'aria-label': "机器人",
            title: "机器人",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hand-count-badge" },
        'data-testid': "opponent-hand-count",
        'data-player-id': (__VLS_ctx.leftPlayer.clientId),
    });
    (__VLS_ctx.playerHandCount(__VLS_ctx.leftPlayer));
    if (__VLS_ctx.showDealerSeatMarker(__VLS_ctx.leftPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-seat-lockup" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-badge" },
            'data-testid': "dealer-badge",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-card-mark" },
            'data-testid': "dealer-card",
        });
        if (__VLS_ctx.dealerInfoCard) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_12 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }));
            const __VLS_13 = __VLS_12({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.leftPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.leftPlayer.clientId) && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "turn-countdown" },
        });
        (__VLS_ctx.seatCountdownSeconds);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
        ...{ class: ({ 'temporary-control': __VLS_ctx.isTemporaryBotControl(__VLS_ctx.leftPlayer) }) },
    });
    (__VLS_ctx.statusText(__VLS_ctx.leftPlayer));
    if (__VLS_ctx.seatMetaText(__VLS_ctx.leftGroupBlocks.length, __VLS_ctx.leftPlayer.declaredKongs)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "seat-meta" },
        });
        (__VLS_ctx.seatMetaText(__VLS_ctx.leftGroupBlocks.length, __VLS_ctx.leftPlayer.declaredKongs));
    }
    if (__VLS_ctx.leftGroupBlocks.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "group-block-list compact" },
        });
        for (const [group] of __VLS_getVForSourceType((__VLS_ctx.leftGroupBlocks))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`left-group-${group.id}`),
                ...{ class: "group-block" },
                ...{ class: (group.tone) },
            });
            if (group.badge) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "group-badge" },
                });
                (group.badge);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mini-card-strip" },
                ...{ class: ({ 'mode-long': props.tableCardMode === 'long' }) },
            });
            for (const [card] of __VLS_getVForSourceType((group.cards))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_15 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`left-group-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }));
                const __VLS_16 = __VLS_15({
                    key: (`left-group-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_15));
            }
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "center" },
    ...{ class: ({ 'my-turn': __VLS_ctx.isMyTurn }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "center-board" },
});
if (__VLS_ctx.topPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "center-seat center-seat-top" },
        ...{ class: ({ active: __VLS_ctx.displayTurnPlayerId === __VLS_ctx.topPlayer.clientId, responding: __VLS_ctx.isCollectiveResponder(__VLS_ctx.topPlayer.clientId), action: __VLS_ctx.hasSeatAction(__VLS_ctx.topPlayer.clientId) }) },
    });
    if (__VLS_ctx.seatActionText(__VLS_ctx.topPlayer.clientId) || __VLS_ctx.isCollectiveResponder(__VLS_ctx.topPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "center-seat-action" },
        });
        (__VLS_ctx.seatActionText(__VLS_ctx.topPlayer.clientId) || "待响");
    }
}
if (__VLS_ctx.leftPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "center-seat center-seat-left" },
        ...{ class: ({ active: __VLS_ctx.displayTurnPlayerId === __VLS_ctx.leftPlayer.clientId, responding: __VLS_ctx.isCollectiveResponder(__VLS_ctx.leftPlayer.clientId), action: __VLS_ctx.hasSeatAction(__VLS_ctx.leftPlayer.clientId) }) },
    });
    if (__VLS_ctx.seatActionText(__VLS_ctx.leftPlayer.clientId) || __VLS_ctx.isCollectiveResponder(__VLS_ctx.leftPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "center-seat-action" },
        });
        (__VLS_ctx.seatActionText(__VLS_ctx.leftPlayer.clientId) || "待响");
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "center-stage" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "center-card-pair" },
    'data-testid': "center-card-pair",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "deck-slot" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "deck-stack" },
    ref: "deckAnchorRef",
    'data-testid': "deck-stack",
    'data-card-back': "red-four-color",
    role: "img",
    'aria-label': (`牌堆剩余 ${props.state?.deckCount ?? 0} 张`),
    title: (`牌堆剩余 ${props.state?.deckCount ?? 0} 张`),
});
/** @type {typeof __VLS_ctx.deckAnchorRef} */ ;
for (const [layer] of __VLS_getVForSourceType((8))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (layer),
        ...{ class: "deck-layer" },
        'aria-hidden': "true",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "deck-number" },
    'data-testid': "deck-count",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(props.state?.deckCount ?? 0);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "response-slot" },
});
if (__VLS_ctx.responseCard) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pending-inline response-focus" },
        ...{ class: ({ 'draw-pending-hidden': __VLS_ctx.isResponseCardDrawHidden }) },
        ref: "responseLandingRef",
        'data-testid': "pending-card",
    });
    /** @type {typeof __VLS_ctx.responseLandingRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "response-caption" },
    });
    const __VLS_18 = {}.Transition;
    /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
        name: "resp-move",
        mode: "out-in",
    }));
    const __VLS_20 = __VLS_19({
        name: "resp-move",
        mode: "out-in",
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    __VLS_21.slots.default;
    /** @type {[typeof CardComp, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(CardComp, new CardComp({
        key: (`resp-${props.tableCardMode}-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
        mode: (props.tableCardMode),
        size: "lg",
        ...{ class: "response-card-face" },
    }));
    const __VLS_23 = __VLS_22({
        key: (`resp-${props.tableCardMode}-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
        mode: (props.tableCardMode),
        size: "lg",
        ...{ class: "response-card-face" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    var __VLS_21;
}
if (__VLS_ctx.rightPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "center-seat center-seat-right" },
        ...{ class: ({ active: __VLS_ctx.displayTurnPlayerId === __VLS_ctx.rightPlayer.clientId, responding: __VLS_ctx.isCollectiveResponder(__VLS_ctx.rightPlayer.clientId), action: __VLS_ctx.hasSeatAction(__VLS_ctx.rightPlayer.clientId) }) },
    });
    if (__VLS_ctx.seatActionText(__VLS_ctx.rightPlayer.clientId) || __VLS_ctx.isCollectiveResponder(__VLS_ctx.rightPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "center-seat-action" },
        });
        (__VLS_ctx.seatActionText(__VLS_ctx.rightPlayer.clientId) || "待响");
    }
}
if (__VLS_ctx.selfPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "center-seat center-seat-bottom" },
        ...{ class: ({ active: __VLS_ctx.displayTurnPlayerId === __VLS_ctx.selfPlayer.clientId, responding: __VLS_ctx.isCollectiveResponder(__VLS_ctx.selfPlayer.clientId), action: __VLS_ctx.hasSeatAction(__VLS_ctx.selfPlayer.clientId) }) },
    });
    if (__VLS_ctx.seatActionText(__VLS_ctx.selfPlayer.clientId) || __VLS_ctx.isCollectiveResponder(__VLS_ctx.selfPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "center-seat-action" },
        });
        (__VLS_ctx.seatActionText(__VLS_ctx.selfPlayer.clientId) || "待响");
    }
}
if (__VLS_ctx.centerPointerDirection) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "center-pointer" },
        ...{ class: (`pointer-${__VLS_ctx.centerPointerDirection}`) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: "center-pointer-head" },
    });
}
if (__VLS_ctx.rightPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ref: ((el) => __VLS_ctx.rightPlayer && __VLS_ctx.setSeatRef(__VLS_ctx.rightPlayer.clientId, el)),
        ...{ class: "player-card player-right" },
        'data-testid': "player-right",
        'data-player-id': (__VLS_ctx.rightPlayer.clientId),
        role: "group",
        'aria-label': (__VLS_ctx.playerAccessibleSummary(__VLS_ctx.rightPlayer, __VLS_ctx.rightGroupBlocks.length)),
        ...{ class: ({
                active: __VLS_ctx.isCurrentTurn(__VLS_ctx.rightPlayer.clientId),
                dealer: __VLS_ctx.showDealerSeatMarker(__VLS_ctx.rightPlayer.clientId),
                'actor-flash': __VLS_ctx.flashActorId === __VLS_ctx.rightPlayer.clientId,
            }) },
    });
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.rightPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-arrow turn-arrow-side" },
            'aria-hidden': "true",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "seat-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-identity" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.rightPlayer.name);
    if (__VLS_ctx.rightPlayer.isConfiguredBot) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "bot-seat-badge" },
            'data-testid': "bot-identity",
            'aria-label': "机器人",
            title: "机器人",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "hand-count-badge" },
        'data-testid': "opponent-hand-count",
        'data-player-id': (__VLS_ctx.rightPlayer.clientId),
    });
    (__VLS_ctx.playerHandCount(__VLS_ctx.rightPlayer));
    if (__VLS_ctx.showDealerSeatMarker(__VLS_ctx.rightPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-seat-lockup" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-badge" },
            'data-testid': "dealer-badge",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-card-mark" },
            'data-testid': "dealer-card",
        });
        if (__VLS_ctx.dealerInfoCard) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_25 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }));
            const __VLS_26 = __VLS_25({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.rightPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    if (__VLS_ctx.isCurrentTurn(__VLS_ctx.rightPlayer.clientId) && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "turn-countdown" },
        });
        (__VLS_ctx.seatCountdownSeconds);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
        ...{ class: ({ 'temporary-control': __VLS_ctx.isTemporaryBotControl(__VLS_ctx.rightPlayer) }) },
    });
    (__VLS_ctx.statusText(__VLS_ctx.rightPlayer));
    if (__VLS_ctx.seatMetaText(__VLS_ctx.rightGroupBlocks.length, __VLS_ctx.rightPlayer.declaredKongs)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "seat-meta" },
        });
        (__VLS_ctx.seatMetaText(__VLS_ctx.rightGroupBlocks.length, __VLS_ctx.rightPlayer.declaredKongs));
    }
    if (__VLS_ctx.rightGroupBlocks.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "group-block-list compact" },
        });
        for (const [group] of __VLS_getVForSourceType((__VLS_ctx.rightGroupBlocks))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`right-group-${group.id}`),
                ...{ class: "group-block" },
                ...{ class: (group.tone) },
            });
            if (group.badge) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "group-badge" },
                });
                (group.badge);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mini-card-strip" },
                ...{ class: ({ 'mode-long': props.tableCardMode === 'long' }) },
            });
            for (const [card] of __VLS_getVForSourceType((group.cards))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_28 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`right-group-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }));
                const __VLS_29 = __VLS_28({
                    key: (`right-group-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_28));
            }
        }
    }
}
if (__VLS_ctx.selfPlayer && __VLS_ctx.flowCardCount(__VLS_ctx.selfPlayer.clientId)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "flow-card flow-bottom-left" },
        'aria-label': (__VLS_ctx.flowAccessibleTitle(__VLS_ctx.selfPlayer.clientId)),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        'aria-hidden': "true",
    });
    (__VLS_ctx.flowTitle(__VLS_ctx.selfPlayer.clientId));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "discard-strip" },
    });
    for (const [card, index] of __VLS_getVForSourceType((__VLS_ctx.visibleFlowCards(__VLS_ctx.selfPlayer.clientId)))) {
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_31 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            key: (`flow-bottom-left-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.selfPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }));
        const __VLS_32 = __VLS_31({
            key: (`flow-bottom-left-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.selfPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    }
}
if (__VLS_ctx.selfPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "self-groups-card" },
        ...{ class: ({ empty: !__VLS_ctx.selfGroupBlocks.length }) },
        ref: "selfOpenRef",
    });
    /** @type {typeof __VLS_ctx.selfOpenRef} */ ;
    if (__VLS_ctx.selfGroupBlocks.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.selfGroupBlocks.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "group-block-list" },
        });
        for (const [group] of __VLS_getVForSourceType((__VLS_ctx.selfGroupBlocks))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`self-exp-${group.id}`),
                ...{ class: "group-block" },
                ...{ class: (group.tone) },
            });
            if (group.badge) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "group-badge" },
                });
                (group.badge);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mini-card-strip" },
                ...{ class: ({ 'mode-long': props.tableCardMode === 'long' }) },
            });
            for (const [card] of __VLS_getVForSourceType((group.cards))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_34 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`self-exp-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }));
                const __VLS_35 = __VLS_34({
                    key: (`self-exp-card-${card.id}`),
                    card: (card),
                    mode: (props.tableCardMode),
                    size: "xs",
                    ...{ class: "mini-card" },
                    title: (__VLS_ctx.cardLabel(card)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_34));
            }
        }
    }
}
if (__VLS_ctx.rightPlayer && __VLS_ctx.flowCardCount(__VLS_ctx.rightPlayer.clientId)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "flow-card flow-bottom-right" },
        'aria-label': (__VLS_ctx.flowAccessibleTitle(__VLS_ctx.rightPlayer.clientId)),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        'aria-hidden': "true",
    });
    (__VLS_ctx.flowTitle(__VLS_ctx.rightPlayer.clientId));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "discard-strip" },
    });
    for (const [card, index] of __VLS_getVForSourceType((__VLS_ctx.visibleFlowCards(__VLS_ctx.rightPlayer.clientId)))) {
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            key: (`flow-bottom-right-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.rightPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }));
        const __VLS_38 = __VLS_37({
            key: (`flow-bottom-right-${card.id}`),
            card: (card),
            mode: (props.tableCardMode),
            size: "xs",
            ...{ class: "discard-token" },
            ...{ class: ({ active: __VLS_ctx.isActiveDiscardCard(__VLS_ctx.rightPlayer.clientId, card, index) }) },
            title: (__VLS_ctx.cardLabel(card)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    }
}
const __VLS_40 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    name: "deal-fade",
}));
const __VLS_42 = __VLS_41({
    name: "deal-fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
if (__VLS_ctx.showDealAnimation) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "deal-overlay" },
    });
}
var __VLS_43;
if (__VLS_ctx.dealerReveal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`dealer-${__VLS_ctx.dealerReveal.id}`),
        ...{ class: "dealer-reveal" },
        ...{ class: (`stage-${__VLS_ctx.dealerReveal.stage}`) },
        'data-testid': "dealer-ceremony",
        role: "status",
        'aria-live': "polite",
        'aria-label': (__VLS_ctx.dealerRevealAccessibleText),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "dealer-reveal-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dealer-reveal-label" },
    });
    (__VLS_ctx.dealerReveal.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "dealer-reveal-tile" },
    });
    if (__VLS_ctx.dealerReveal.stage === 'picking') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dealer-reveal-back" },
            'data-testid': "dealer-reveal-back",
            'data-card-back': "red-four-color",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else if (__VLS_ctx.dealerCeremonyCard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dealer-reveal-card" },
            'data-testid': "dealer-reveal-card",
        });
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            card: (__VLS_ctx.dealerCeremonyCard),
            mode: (props.tableCardMode),
            size: "xl",
        }));
        const __VLS_45 = __VLS_44({
            card: (__VLS_ctx.dealerCeremonyCard),
            mode: (props.tableCardMode),
            size: "xl",
        }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    }
    if (__VLS_ctx.dealerCeremonyCard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
            ...{ class: "dealer-reveal-card-name" },
        });
        (__VLS_ctx.getCardAccessibleText(__VLS_ctx.dealerCeremonyCard));
    }
    if (__VLS_ctx.dealerReveal.dealerName) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
            ...{ class: "dealer-reveal-result" },
        });
        (__VLS_ctx.dealerReveal.dealerName);
    }
}
const __VLS_47 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    name: "dealer-flight",
}));
const __VLS_49 = __VLS_48({
    name: "dealer-flight",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
__VLS_50.slots.default;
if (__VLS_ctx.dealerFlight) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`dealer-flight-${__VLS_ctx.dealerFlight.id}`),
        ...{ class: "dealer-flight" },
        ...{ style: (__VLS_ctx.dealerFlightStyle(__VLS_ctx.dealerFlight)) },
    });
}
var __VLS_50;
if (__VLS_ctx.selfPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "self-info-card" },
        'data-testid': "player-self",
        'data-player-id': (__VLS_ctx.selfPlayer.clientId),
        role: "group",
        'aria-label': (__VLS_ctx.playerAccessibleSummary(__VLS_ctx.selfPlayer, __VLS_ctx.selfGroupBlocks.length)),
        ...{ class: ({ active: __VLS_ctx.isMyTurn, dealer: __VLS_ctx.showDealerSeatMarker(__VLS_ctx.selfPlayer.clientId), 'actor-flash': __VLS_ctx.flashActorId === __VLS_ctx.selfPlayer.clientId }) },
        ref: "selfZoneRef",
    });
    /** @type {typeof __VLS_ctx.selfZoneRef} */ ;
    if (__VLS_ctx.isMyTurn) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-arrow self-turn-arrow" },
            'aria-hidden': "true",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "self-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-identity" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    (__VLS_ctx.selfPlayer.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "self-seat-badge" },
        'aria-hidden': "true",
    });
    if (__VLS_ctx.selfPlayer.isConfiguredBot) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "bot-seat-badge" },
            'data-testid': "bot-identity",
            'aria-label': "机器人",
            title: "机器人",
        });
    }
    if (__VLS_ctx.showDealerSeatMarker(__VLS_ctx.selfPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-seat-lockup" },
            'data-testid': "self-dealer-lockup",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-badge" },
            'data-testid': "dealer-badge",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "dealer-card-mark" },
            'data-testid': "dealer-card",
        });
        if (__VLS_ctx.dealerInfoCard) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_51 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }));
            const __VLS_52 = __VLS_51({
                card: (__VLS_ctx.dealerInfoCard),
                mode: (props.tableCardMode),
                size: "xs",
            }, ...__VLS_functionalComponentArgsRest(__VLS_51));
        }
    }
    if (__VLS_ctx.seatMetaText(__VLS_ctx.selfGroupBlocks.length, __VLS_ctx.selfPlayer.declaredKongs)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            'data-testid': "self-seat-meta",
        });
        (__VLS_ctx.seatMetaText(__VLS_ctx.selfGroupBlocks.length, __VLS_ctx.selfPlayer.declaredKongs));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isMyTurn) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    if (__VLS_ctx.isMyTurn && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "turn-countdown" },
        });
        (__VLS_ctx.seatCountdownSeconds);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
        ...{ class: ({ 'temporary-control': __VLS_ctx.isTemporaryBotControl(__VLS_ctx.selfPlayer) }) },
    });
    (__VLS_ctx.statusText(__VLS_ctx.selfPlayer));
    if (__VLS_ctx.isMyTurn && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-timer-bar self-turn-timer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: ({ width: `${__VLS_ctx.seatCountdownPercent}%` }) },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "self-info-hint" },
    });
    (__VLS_ctx.compactCenterHint);
}
if (__VLS_ctx.selfPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "self-hand-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "self-hand-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hand-toolbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "discard-tip" },
    });
    (__VLS_ctx.displayPrivateHand.length);
    if (__VLS_ctx.showDealAnimation) {
        (props.privateHand.length);
    }
    if (__VLS_ctx.canDiscard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    if (__VLS_ctx.handHasOverflow) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "hand-scroll-tools" },
            'data-testid': "hand-scroll-tools",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selfPlayer))
                        return;
                    if (!(__VLS_ctx.handHasOverflow))
                        return;
                    __VLS_ctx.scrollHand('backward');
                } },
            type: "button",
            'data-testid': "hand-scroll-prev",
            'aria-label': "向左翻看手牌",
            disabled: (!__VLS_ctx.handCanScrollBackward),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selfPlayer))
                        return;
                    if (!(__VLS_ctx.handHasOverflow))
                        return;
                    __VLS_ctx.scrollHand('forward');
                } },
            type: "button",
            'data-testid': "hand-scroll-next",
            'aria-label': "向右翻看更多手牌",
            disabled: (!__VLS_ctx.handCanScrollForward),
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onScroll: (__VLS_ctx.updateHandScrollState) },
        ...{ class: "cards hand" },
        ...{ class: ({
                'can-scroll-backward': __VLS_ctx.handCanScrollBackward,
                'can-scroll-forward': __VLS_ctx.handCanScrollForward,
            }) },
        ref: "selfHandRef",
    });
    /** @type {typeof __VLS_ctx.selfHandRef} */ ;
    for (const [card] of __VLS_getVForSourceType((__VLS_ctx.displayPrivateHand))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selfPlayer))
                        return;
                    __VLS_ctx.selectDiscardCard(card.id);
                } },
            ...{ onDblclick: (...[$event]) => {
                    if (!(__VLS_ctx.selfPlayer))
                        return;
                    __VLS_ctx.selectDiscardCard(card.id);
                } },
            key: (`me-${card.id}`),
            'data-testid': (`hand-card-${card.id}`),
            'data-card-id': (card.id),
            ...{ class: "hand-card" },
            ...{ class: ({
                    'mode-large': props.ownCardMode === 'large',
                    'mode-long': props.ownCardMode === 'long',
                    playable: __VLS_ctx.canDiscardCard(card),
                    blocked: __VLS_ctx.canDiscard && __VLS_ctx.isDiscardProtectedCard(card),
                    'gold-blocked': __VLS_ctx.canDiscard && card.color === 'gold',
                    'discard-selected': __VLS_ctx.selectedDiscardCardId === card.id,
                    'candidate-active': __VLS_ctx.isCandidateCard(card.id),
                    'candidate-selected': __VLS_ctx.isSelectedCandidateCard(card.id),
                }) },
            'aria-pressed': (__VLS_ctx.selectedDiscardCardId === card.id),
            'aria-label': (__VLS_ctx.handCardAccessibleLabel(card)),
            disabled: (!__VLS_ctx.canDiscardCard(card) || Boolean(__VLS_ctx.discardingCardId)),
        });
        if (__VLS_ctx.candidateBadgeText(card.id)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "candidate-badge" },
            });
            (__VLS_ctx.candidateBadgeText(card.id));
        }
        if (__VLS_ctx.selectedDiscardCardId === card.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "discard-selection-badge" },
                'aria-hidden': "true",
            });
        }
        else if (__VLS_ctx.canDiscard && __VLS_ctx.isDiscardProtectedCard(card)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "discard-protected-badge" },
                'aria-hidden': "true",
            });
        }
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            card: (card),
            mode: (props.ownCardMode),
            size: "xl",
        }));
        const __VLS_55 = __VLS_54({
            card: (card),
            mode: (props.ownCardMode),
            size: "xl",
        }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    }
}
if (props.state?.phase === 'playing') {
    /** @type {[typeof ActionPanel, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(ActionPanel, new ActionPanel({
        ...{ 'onConfirmDiscard': {} },
        ...{ 'onRequestMoreTime': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onSelectionChange': {} },
        ...{ class: "embedded-actions action-dock" },
        actions: (props.actions ?? []),
        canAct: (__VLS_ctx.canAct),
        canDiscard: (__VLS_ctx.canDiscard),
        hasDiscardSelection: (Boolean(__VLS_ctx.selectedDiscardCardId)),
        selectedDiscardCardLabel: (__VLS_ctx.selectedDiscardCardLabel),
        discardPending: (Boolean(__VLS_ctx.discardingCardId)),
        isCurrentTurn: (Boolean(props.isCurrentTurn)),
        responsePhase: (props.responsePhase ?? ''),
        currentPlayerName: (props.currentPlayerName ?? '-'),
        pausedHint: (__VLS_ctx.effectiveInteractionPausedMessage),
        secondsLeft: (__VLS_ctx.seatCountdownSeconds),
        untimed: (Boolean(props.decisionUntimed)),
        canRequestMoreTime: (Boolean(props.canRequestMoreTime)),
        moreTimeSeconds: (props.moreTimeSeconds ?? 20),
        decisionKey: (props.decisionKey ?? ''),
        selectionMode: (props.selectionMode ?? null),
        selectedCandidateId: (props.selectedCandidateId ?? null),
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onConfirmDiscard': {} },
        ...{ 'onRequestMoreTime': {} },
        ...{ 'onSubmit': {} },
        ...{ 'onSelectionChange': {} },
        ...{ class: "embedded-actions action-dock" },
        actions: (props.actions ?? []),
        canAct: (__VLS_ctx.canAct),
        canDiscard: (__VLS_ctx.canDiscard),
        hasDiscardSelection: (Boolean(__VLS_ctx.selectedDiscardCardId)),
        selectedDiscardCardLabel: (__VLS_ctx.selectedDiscardCardLabel),
        discardPending: (Boolean(__VLS_ctx.discardingCardId)),
        isCurrentTurn: (Boolean(props.isCurrentTurn)),
        responsePhase: (props.responsePhase ?? ''),
        currentPlayerName: (props.currentPlayerName ?? '-'),
        pausedHint: (__VLS_ctx.effectiveInteractionPausedMessage),
        secondsLeft: (__VLS_ctx.seatCountdownSeconds),
        untimed: (Boolean(props.decisionUntimed)),
        canRequestMoreTime: (Boolean(props.canRequestMoreTime)),
        moreTimeSeconds: (props.moreTimeSeconds ?? 20),
        decisionKey: (props.decisionKey ?? ''),
        selectionMode: (props.selectionMode ?? null),
        selectedCandidateId: (props.selectedCandidateId ?? null),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onConfirmDiscard: (__VLS_ctx.confirmDiscard)
    };
    const __VLS_64 = {
        onRequestMoreTime: (...[$event]) => {
            if (!(props.state?.phase === 'playing'))
                return;
            __VLS_ctx.emit('requestMoreTime');
        }
    };
    const __VLS_65 = {
        onSubmit: (__VLS_ctx.onSubmitAction)
    };
    const __VLS_66 = {
        onSelectionChange: (__VLS_ctx.onSelectionChange)
    };
    var __VLS_59;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "fx-layer" },
});
for (const [flight] of __VLS_getVForSourceType((__VLS_ctx.flights))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`fx-${flight.id}`),
        ...{ class: "fx-card" },
        ...{ class: (flight.mode) },
        ...{ style: (__VLS_ctx.flightStyle(flight)) },
    });
    if (flight.mode === 'deal') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-back" },
        });
    }
    else if (flight.card) {
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_67 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            card: (flight.card),
            mode: (props.tableCardMode),
            size: "md",
        }));
        const __VLS_68 = __VLS_67({
            card: (flight.card),
            mode: (props.tableCardMode),
            size: "md",
        }, ...__VLS_functionalComponentArgsRest(__VLS_67));
    }
}
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-top-left']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['player-top']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['bot-seat-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-count-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-seat-lockup']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-card-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-countdown']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block-list']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block']} */ ;
/** @type {__VLS_StyleScopedClasses['group-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-top-right']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['player-left']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow-side']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['bot-seat-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-count-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-seat-lockup']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-card-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-countdown']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block-list']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block']} */ ;
/** @type {__VLS_StyleScopedClasses['group-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center-board']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-top']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-left']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['center-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['center-card-pair']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-slot']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-number']} */ ;
/** @type {__VLS_StyleScopedClasses['response-slot']} */ ;
/** @type {__VLS_StyleScopedClasses['pending-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['response-focus']} */ ;
/** @type {__VLS_StyleScopedClasses['response-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['response-card-face']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-right']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-bottom']} */ ;
/** @type {__VLS_StyleScopedClasses['center-seat-action']} */ ;
/** @type {__VLS_StyleScopedClasses['center-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['center-pointer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['player-right']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow-side']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['bot-seat-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-count-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-seat-lockup']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-card-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-countdown']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block-list']} */ ;
/** @type {__VLS_StyleScopedClasses['compact']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block']} */ ;
/** @type {__VLS_StyleScopedClasses['group-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-bottom-left']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['self-groups-card']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block-list']} */ ;
/** @type {__VLS_StyleScopedClasses['group-block']} */ ;
/** @type {__VLS_StyleScopedClasses['group-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-bottom-right']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-token']} */ ;
/** @type {__VLS_StyleScopedClasses['deal-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-label']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-back']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-card-name']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-result']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-flight']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['self-turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-identity']} */ ;
/** @type {__VLS_StyleScopedClasses['self-seat-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['bot-seat-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-seat-lockup']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-card-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-countdown']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-timer-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['self-turn-timer']} */ ;
/** @type {__VLS_StyleScopedClasses['self-info-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-scroll-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-selection-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-protected-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['action-dock']} */ ;
/** @type {__VLS_StyleScopedClasses['fx-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['fx-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-back']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ActionPanel: ActionPanel,
            CardComp: CardComp,
            getCardAccessibleText: getCardAccessibleText,
            emit: emit,
            selfPlayer: selfPlayer,
            topPlayer: topPlayer,
            rightPlayer: rightPlayer,
            leftPlayer: leftPlayer,
            discardingCardId: discardingCardId,
            selectedDiscardCardId: selectedDiscardCardId,
            flights: flights,
            showDealAnimation: showDealAnimation,
            dealerReveal: dealerReveal,
            dealerFlight: dealerFlight,
            flashActorId: flashActorId,
            tableRef: tableRef,
            boardRef: boardRef,
            responseLandingRef: responseLandingRef,
            deckAnchorRef: deckAnchorRef,
            selfHandRef: selfHandRef,
            handHasOverflow: handHasOverflow,
            handCanScrollBackward: handCanScrollBackward,
            handCanScrollForward: handCanScrollForward,
            selfZoneRef: selfZoneRef,
            selfOpenRef: selfOpenRef,
            selfGroupBlocks: selfGroupBlocks,
            topGroupBlocks: topGroupBlocks,
            leftGroupBlocks: leftGroupBlocks,
            rightGroupBlocks: rightGroupBlocks,
            responseCard: responseCard,
            flowTitle: flowTitle,
            flowAccessibleTitle: flowAccessibleTitle,
            flowCardCount: flowCardCount,
            visibleFlowCards: visibleFlowCards,
            isActiveDiscardCard: isActiveDiscardCard,
            displayTurnPlayerId: displayTurnPlayerId,
            isMyTurn: isMyTurn,
            canAct: canAct,
            canDiscard: canDiscard,
            effectiveInteractionPausedMessage: effectiveInteractionPausedMessage,
            selectedDiscardCardLabel: selectedDiscardCardLabel,
            displayPrivateHand: displayPrivateHand,
            isResponseCardDrawHidden: isResponseCardDrawHidden,
            seatCountdownSeconds: seatCountdownSeconds,
            seatCountdownPercent: seatCountdownPercent,
            compactCenterHint: compactCenterHint,
            centerPointerDirection: centerPointerDirection,
            dealerInfoCard: dealerInfoCard,
            dealerCeremonyCard: dealerCeremonyCard,
            dealerRevealAccessibleText: dealerRevealAccessibleText,
            showDealerSeatMarker: showDealerSeatMarker,
            isCollectiveResponder: isCollectiveResponder,
            seatActionText: seatActionText,
            hasSeatAction: hasSeatAction,
            isCurrentTurn: isCurrentTurn,
            statusText: statusText,
            seatMetaText: seatMetaText,
            playerAccessibleSummary: playerAccessibleSummary,
            isTemporaryBotControl: isTemporaryBotControl,
            playerHandCount: playerHandCount,
            canDiscardCard: canDiscardCard,
            isDiscardProtectedCard: isDiscardProtectedCard,
            selectDiscardCard: selectDiscardCard,
            updateHandScrollState: updateHandScrollState,
            scrollHand: scrollHand,
            confirmDiscard: confirmDiscard,
            onSubmitAction: onSubmitAction,
            onSelectionChange: onSelectionChange,
            isCandidateCard: isCandidateCard,
            isSelectedCandidateCard: isSelectedCandidateCard,
            candidateBadgeText: candidateBadgeText,
            cardLabel: cardLabel,
            handCardAccessibleLabel: handCardAccessibleLabel,
            setSeatRef: setSeatRef,
            flightStyle: flightStyle,
            dealerFlightStyle: dealerFlightStyle,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
