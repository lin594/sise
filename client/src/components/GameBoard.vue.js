import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "./ActionPanel.vue";
import CardComp from "./Card.vue";
const props = defineProps();
const emit = defineEmits();
const isCompactLandscape = ref(false);
const nowMs = ref(Date.now());
const orderedPlayers = computed(() => {
    const list = props.players ?? [];
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
const rightPlayer = computed(() => orderedPlayers.value[1] ?? null);
const topPlayer = computed(() => orderedPlayers.value[2] ?? null);
const leftPlayer = computed(() => orderedPlayers.value[3] ?? null);
const expandedOpenGroups = ref({});
const discardingCardId = ref(null);
const lastLocalDiscardAt = ref(0);
const flights = ref([]);
const showDealAnimation = ref(false);
const actionEffect = ref(null);
const dealerReveal = ref(null);
const dealerFlight = ref(null);
const flashActorId = ref("");
const tableRef = ref(null);
const responseLandingRef = ref(null);
const deckAnchorRef = ref(null);
const selfHandRef = ref(null);
const selfZoneRef = ref(null);
const selfOpenRef = ref(null);
const selfOpenCompactRef = ref(null);
const seatRefMap = new Map();
let actionEffectSeq = 0;
let dealerRevealSeq = 0;
let dealerFlightSeq = 0;
let flightSeq = 0;
let dealRunSeq = 0;
let dealTimer = null;
let dealInterval = null;
let actionTimer = null;
let dealerTimer = null;
let dealerIntroTimer = null;
let dealAnimatingUntil = 0;
let flashTimer = null;
let countdownTimer = null;
const OP_COUNTDOWN_MS = 20000;
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
const seatEntries = computed(() => {
    const entries = [
        { position: "top", player: topPlayer.value },
        { position: "left", player: leftPlayer.value },
        { position: "right", player: rightPlayer.value },
    ];
    return entries
        .filter((x) => Boolean(x.player))
        .map((entry) => ({
        ...entry,
        openGroups: buildOpenGroups(entry.player, `seat-${entry.player.clientId}`),
    }));
});
const selfOpenGroups = computed(() => {
    const player = selfPlayer.value;
    if (!player) {
        return [];
    }
    return buildOpenGroups(player, `self-${player.clientId}`);
});
const latestDiscardFromAction = computed(() => {
    const match = String(props.state?.lastAction ?? "").match(/^(\S+)\s+DISCARD$/);
    if (!match) {
        return null;
    }
    const ownerId = match[1];
    const owner = props.players.find((x) => x.clientId === ownerId);
    const latestDiscard = owner?.discardPile?.[0];
    if (latestDiscard?.id) {
        return { ...latestDiscard, source: "upper" };
    }
    const publicTop = props.state?.publicDiscardPile?.[0];
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
        const publicTop = props.state?.publicDiscardPile?.[0];
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
const currentPlayer = computed(() => {
    const playerId = props.state?.currentTurnPlayerId || props.state?.currentPlayerId;
    if (!playerId) {
        return null;
    }
    return props.players.find((x) => x.clientId === playerId) ?? null;
});
const currentPlayerName = computed(() => {
    const playerId = props.state?.currentTurnPlayerId || props.state?.currentPlayerId;
    if (!playerId) {
        return "-";
    }
    return currentPlayer.value?.name || playerId;
});
const isMyTurn = computed(() => Boolean(props.mySeatId) &&
    (props.state?.currentTurnPlayerId || props.state?.currentPlayerId) === props.mySeatId &&
    !Boolean(currentPlayer.value?.isBot));
const canDiscard = computed(() => Boolean(props.canDiscard));
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
const centerEventText = computed(() => {
    const action = String(props.state?.lastAction ?? "").trim();
    if (!action) {
        return "";
    }
    const { actor, keyword } = parseActionDescriptor(action);
    if (isSystemAction(keyword)) {
        return "";
    }
    const actionMap = {
        DISCARD: "出牌",
        PENG: "碰",
        OPEN: "开",
        KAI: "开",
        EAT: "吃",
        CHI: "吃",
        HU: "胡",
        GRAB: "抓",
        PASS: "过",
        TIMEOUT_PASS: "超时过",
    };
    const label = actionMap[keyword];
    if (!label) {
        return "";
    }
    const actorName = props.players.find((player) => player.clientId === actor)?.name || actor || "系统";
    const target = responseCard.value ?? latestDiscardFromAction.value;
    const targetLabel = target ? cardLabel(target) : "-";
    return `${actorName} ${label}（target: ${targetLabel}）`;
});
const seatCountdownSeconds = computed(() => {
    const endsAt = Number(props.state?.responseEndsAt ?? 0);
    if (!endsAt || endsAt <= nowMs.value) {
        return null;
    }
    return Math.max(0, Math.ceil((endsAt - nowMs.value) / 1000));
});
const seatCountdownPercent = computed(() => {
    const endsAt = Number(props.state?.responseEndsAt ?? 0);
    if (!endsAt || endsAt <= nowMs.value) {
        return 0;
    }
    const remain = endsAt - nowMs.value;
    const raw = (remain / OP_COUNTDOWN_MS) * 100;
    return Math.max(0, Math.min(100, Number(raw.toFixed(1))));
});
const compactCenterHint = computed(() => {
    if (canDiscard.value) {
        return "请选择弃牌";
    }
    if (String(props.state?.responsePhase ?? "") === "collective") {
        return isMyTurn.value ? "等待他人响应" : "待响应阶段";
    }
    return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});
const mergedActionLogs = computed(() => {
    const logs = props.parsedActionLogs ?? [];
    return logs.slice(0, 12).map((log) => ({
        ...log,
        actorLabel: props.players.find((player) => player.clientId === log.actorId)?.name || log.actorId || "系统",
    }));
});
const centerPointerDirection = computed(() => {
    const currentId = String(props.state?.currentTurnPlayerId || props.state?.currentPlayerId || "");
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
const dealerName = computed(() => {
    const dealerId = String(props.state?.dealerId ?? "");
    if (!dealerId) {
        return "-";
    }
    return props.players.find((p) => p.clientId === dealerId)?.name || dealerId;
});
function isCurrentTurn(playerId) {
    return (props.state?.currentTurnPlayerId || props.state?.currentPlayerId) === playerId;
}
function statusText(player) {
    if (player.isBot) {
        return "BOT托管";
    }
    return player.connected ? "在线" : "离线";
}
function isDealer(playerId) {
    return Boolean(playerId) && String(props.state?.dealerId ?? "") === playerId;
}
function isSystemAction(actionKey) {
    return actionKey === "NO_RESPONSE" || actionKey === "TURN_DRAW" || actionKey === "KONG_DRAW";
}
function canDiscardCard(card) {
    return canDiscard.value && card.type !== "jiang" && card.color !== "gold";
}
function onDiscard(cardId, event) {
    if (!canDiscard.value || discardingCardId.value) {
        return;
    }
    const picked = props.privateHand.find((card) => card.id === cardId);
    if (picked && event?.currentTarget instanceof HTMLElement) {
        triggerDiscardAnimationFromElement(event.currentTarget, picked);
        lastLocalDiscardAt.value = Date.now();
    }
    discardingCardId.value = cardId;
    window.setTimeout(() => {
        emit("discardCard", cardId);
    }, 220);
    window.setTimeout(() => {
        if (discardingCardId.value === cardId) {
            discardingCardId.value = null;
        }
    }, 460);
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
    const colorMap = {
        red: "红",
        yellow: "黄",
        green: "绿",
        white: "白",
        gold: "金",
    };
    const typeMap = {
        jiang: "将",
        shi: "士",
        xiang: "相",
        ju: "车",
        ma: "马",
        pao: "炮",
        zu: "卒",
        gong: "条",
        hou: "侯",
        bo: "伯",
        zi: "子",
        nan: "男",
    };
    return `${colorMap[card.color] ?? card.color}${typeMap[card.type] ?? card.type}`;
}
function previewGroupCards(cards) {
    return cards.slice(0, previewGroupSize(cards));
}
function previewGroupSize(cards) {
    return Math.min(4, cards.length);
}
function fanCardStyle(index, total) {
    const center = (total - 1) / 2;
    const offset = index - center;
    return {
        zIndex: String(index + 1),
        marginLeft: index === 0 ? "0" : "-0.68rem",
        transform: `rotate(${offset * 8}deg) translateY(${Math.abs(offset) * 1.4}px)`,
    };
}
function isOpenGroupExpanded(playerId, groupId) {
    return expandedOpenGroups.value[playerId] === groupId;
}
function toggleOpenGroup(playerId, groupId) {
    const current = expandedOpenGroups.value[playerId];
    expandedOpenGroups.value = {
        ...expandedOpenGroups.value,
        [playerId]: current === groupId ? null : groupId,
    };
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
    const seat = seatEntries.value.find((entry) => entry.player.clientId === playerId);
    return seat?.position ?? "self";
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
    const count = keyword === "OPEN" || keyword === "KAI" ? 4 : 3;
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
        if (index >= plan.length) {
            clearDealAnimationRuntime();
            dealTimer = setTimeout(() => {
                if (runId === dealRunSeq) {
                    showDealAnimation.value = false;
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
function triggerActionEffect(label) {
    if (actionTimer) {
        clearTimeout(actionTimer);
        actionTimer = null;
    }
    actionEffect.value = { id: ++actionEffectSeq, label };
    actionTimer = setTimeout(() => {
        actionEffect.value = null;
        actionTimer = null;
    }, 760);
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
function triggerDealerReveal(name, dealerId) {
    if (!name || name === "-") {
        return;
    }
    if (dealerTimer) {
        clearTimeout(dealerTimer);
        dealerTimer = null;
    }
    dealerReveal.value = { id: ++dealerRevealSeq, name };
    dealerTimer = setTimeout(() => {
        dealerReveal.value = null;
        dealerTimer = null;
    }, 1400);
    if (dealerId) {
        triggerDealerFlight(dealerId);
    }
}
function queueDealerIntro(name, dealerId) {
    clearDealerIntroTimer();
    const delay = Math.max(0, dealAnimatingUntil - Date.now());
    dealerIntroTimer = setTimeout(() => {
        dealerIntroTimer = null;
        triggerDealerReveal(name, dealerId);
    }, delay);
}
function updateCompactLandscape() {
    const compact = window.matchMedia("(orientation: landscape) and (max-width: 960px)").matches;
    if (compact !== isCompactLandscape.value) {
        isCompactLandscape.value = compact;
    }
}
onMounted(() => {
    updateCompactLandscape();
    window.addEventListener("resize", updateCompactLandscape);
    window.addEventListener("orientationchange", updateCompactLandscape);
    countdownTimer = setInterval(() => {
        nowMs.value = Date.now();
    }, 500);
});
onUnmounted(() => {
    clearDealAnimationRuntime();
    clearDealerIntroTimer();
    if (actionTimer) {
        clearTimeout(actionTimer);
        actionTimer = null;
    }
    if (dealerTimer) {
        clearTimeout(dealerTimer);
        dealerTimer = null;
    }
    if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
    }
    flashActorId.value = "";
    dealerFlight.value = null;
    window.removeEventListener("resize", updateCompactLandscape);
    window.removeEventListener("orientationchange", updateCompactLandscape);
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
});
watch(() => props.state?.phase, (phase, prev) => {
    if (prev === "declaring" && phase === "playing") {
        triggerDealAnimation();
        queueDealerIntro(dealerName.value, String(props.state?.dealerId ?? ""));
    }
});
watch(() => props.state?.lastAction, (action) => {
    const dealerMatch = String(action ?? "").match(/^DEALER\s+(\S+)/);
    if (dealerMatch) {
        const dealerId = dealerMatch[1];
        const name = props.players.find((p) => p.clientId === dealerId)?.name || dealerId;
        queueDealerIntro(name, dealerId);
        return;
    }
    const { actor, keyword } = parseActionDescriptor(String(action ?? ""));
    if (actor) {
        triggerActorFlash(actor);
    }
    const labelMap = {
        PENG: "碰",
        EAT: "吃",
        CHI: "吃",
        OPEN: "开",
        KAI: "开",
        HU: "胡",
        KONG_DRAW: "补牌",
        GRAB: "抓",
    };
    const label = labelMap[keyword];
    if (label) {
        triggerActionEffect(label);
    }
    if (keyword === "DISCARD" && actor) {
        if (!(actor === props.mySeatId && Date.now() - lastLocalDiscardAt.value < 650)) {
            triggerDiscardAnimationFromSeat(actor);
        }
        return;
    }
    if ((keyword === "PENG" || keyword === "EAT" || keyword === "OPEN" || keyword === "KAI" || keyword === "CHI") && actor) {
        triggerMeldAnimation(actor, keyword);
    }
});
watch(() => props.privateHand.map((x) => x.id).join("|"), () => {
    if (discardingCardId.value && !props.privateHand.some((card) => card.id === discardingCardId.value)) {
        discardingCardId.value = null;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-timer-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['center-text']} */ ;
/** @type {__VLS_StyleScopedClasses['center-text']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['table-action-log']} */ ;
/** @type {__VLS_StyleScopedClasses['table-action-log']} */ ;
/** @type {__VLS_StyleScopedClasses['table-action-log']} */ ;
/** @type {__VLS_StyleScopedClasses['center-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['actor-flash']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-main']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['fx-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-timer-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['table-action-log']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['self-open-left']} */ ;
/** @type {__VLS_StyleScopedClasses['self-open-left']} */ ;
/** @type {__VLS_StyleScopedClasses['self-open-left']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-open-left']} */ ;
/** @type {__VLS_StyleScopedClasses['grouped-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['grouped-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-count']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center-text']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['self-areas']} */ ;
/** @type {__VLS_StyleScopedClasses['self-main']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['grouped-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['size-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['table-action-log']} */ ;
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['left']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['self-areas']} */ ;
/** @type {__VLS_StyleScopedClasses['self-main']} */ ;
/** @type {__VLS_StyleScopedClasses['table-action-log']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "board" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table" },
    ref: "tableRef",
});
/** @type {typeof __VLS_ctx.tableRef} */ ;
if (__VLS_ctx.isCompactLandscape && __VLS_ctx.selfPlayer && (__VLS_ctx.selfOpenGroups.length || __VLS_ctx.selfPlayer.fishArea.length)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "self-open-left" },
        ref: "selfOpenCompactRef",
    });
    /** @type {typeof __VLS_ctx.selfOpenCompactRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "grouped-cards" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.selfOpenGroups))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.isCompactLandscape && __VLS_ctx.selfPlayer && (__VLS_ctx.selfOpenGroups.length || __VLS_ctx.selfPlayer.fishArea.length)))
                        return;
                    __VLS_ctx.toggleOpenGroup(__VLS_ctx.selfPlayer.clientId, group.id);
                } },
            key: (`self-open-left-${group.id}`),
            ...{ class: "group-chip" },
            ...{ class: ({ expanded: __VLS_ctx.isOpenGroupExpanded(__VLS_ctx.selfPlayer.clientId, group.id), stacked: !__VLS_ctx.isOpenGroupExpanded(__VLS_ctx.selfPlayer.clientId, group.id) }) },
        });
        if (__VLS_ctx.isOpenGroupExpanded(__VLS_ctx.selfPlayer.clientId, group.id)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "expanded-preview cards" },
            });
            for (const [card] of __VLS_getVForSourceType((group.cards))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_0 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`self-open-left-card-${card.id}`),
                    card: (card),
                    size: "sm",
                }));
                const __VLS_1 = __VLS_0({
                    key: (`self-open-left-card-${card.id}`),
                    card: (card),
                    size: "sm",
                }, ...__VLS_functionalComponentArgsRest(__VLS_0));
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stacked-preview" },
            });
            for (const [card, idx] of __VLS_getVForSourceType((__VLS_ctx.previewGroupCards(group.cards)))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_3 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`self-open-left-stack-${card.id}`),
                    card: (card),
                    size: "sm",
                    ...{ class: "stack-item" },
                    ...{ style: (__VLS_ctx.fanCardStyle(idx, __VLS_ctx.previewGroupSize(group.cards))) },
                }));
                const __VLS_4 = __VLS_3({
                    key: (`self-open-left-stack-${card.id}`),
                    card: (card),
                    size: "sm",
                    ...{ class: "stack-item" },
                    ...{ style: (__VLS_ctx.fanCardStyle(idx, __VLS_ctx.previewGroupSize(group.cards))) },
                }, ...__VLS_functionalComponentArgsRest(__VLS_3));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "stack-count" },
            });
            (group.cards.length);
        }
    }
    for (const [card] of __VLS_getVForSourceType((__VLS_ctx.selfPlayer.fishArea))) {
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            key: (`self-fish-left-${card.id}`),
            card: (card),
            size: "sm",
        }));
        const __VLS_7 = __VLS_6({
            key: (`self-fish-left-${card.id}`),
            card: (card),
            size: "sm",
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    }
}
for (const [entry] of __VLS_getVForSourceType((__VLS_ctx.seatEntries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        key: (entry.position),
        ref: ((el) => __VLS_ctx.setSeatRef(entry.player.clientId, el)),
        ...{ class: "seat" },
        ...{ class: ([
                entry.position,
                {
                    active: __VLS_ctx.isCurrentTurn(entry.player.clientId),
                    'with-fish': entry.player.fishArea.length > 0,
                    dealer: __VLS_ctx.isDealer(entry.player.clientId),
                    'actor-flash': __VLS_ctx.flashActorId === entry.player.clientId,
                },
            ]) },
    });
    if (__VLS_ctx.isCurrentTurn(entry.player.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-arrow" },
            'aria-hidden': "true",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "seat-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (entry.player.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isDealer(entry.player.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag dealer" },
        });
    }
    if (__VLS_ctx.isCurrentTurn(entry.player.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag turn" },
        });
    }
    if (__VLS_ctx.isCurrentTurn(entry.player.clientId) && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "turn-countdown" },
        });
        (__VLS_ctx.seatCountdownSeconds);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tag status" },
    });
    (__VLS_ctx.statusText(entry.player));
    if (__VLS_ctx.isCurrentTurn(entry.player.clientId) && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-timer-bar" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: ({ width: `${__VLS_ctx.seatCountdownPercent}%` }) },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "seat-meta" },
    });
    (entry.player.declaredKongs);
    if (entry.openGroups.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "seat-zone" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "grouped-cards" },
        });
        for (const [group] of __VLS_getVForSourceType((entry.openGroups))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(entry.openGroups.length))
                            return;
                        __VLS_ctx.toggleOpenGroup(entry.player.clientId, group.id);
                    } },
                key: (`exp-${entry.player.clientId}-${group.id}`),
                ...{ class: "group-chip" },
                ...{ class: ({ expanded: __VLS_ctx.isOpenGroupExpanded(entry.player.clientId, group.id), stacked: !__VLS_ctx.isOpenGroupExpanded(entry.player.clientId, group.id) }) },
            });
            if (__VLS_ctx.isOpenGroupExpanded(entry.player.clientId, group.id)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "expanded-preview cards" },
                });
                for (const [card] of __VLS_getVForSourceType((group.cards))) {
                    /** @type {[typeof CardComp, ]} */ ;
                    // @ts-ignore
                    const __VLS_9 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`exp-card-${entry.player.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }));
                    const __VLS_10 = __VLS_9({
                        key: (`exp-card-${entry.player.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
                }
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "stacked-preview" },
                });
                for (const [card, idx] of __VLS_getVForSourceType((__VLS_ctx.previewGroupCards(group.cards)))) {
                    /** @type {[typeof CardComp, ]} */ ;
                    // @ts-ignore
                    const __VLS_12 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`exp-stack-${entry.player.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                        ...{ class: "stack-item" },
                        ...{ style: (__VLS_ctx.fanCardStyle(idx, __VLS_ctx.previewGroupSize(group.cards))) },
                    }));
                    const __VLS_13 = __VLS_12({
                        key: (`exp-stack-${entry.player.clientId}-${card.id}`),
                        card: (card),
                        size: "sm",
                        ...{ class: "stack-item" },
                        ...{ style: (__VLS_ctx.fanCardStyle(idx, __VLS_ctx.previewGroupSize(group.cards))) },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "stack-count" },
                });
                (group.cards.length);
            }
        }
    }
    if (entry.player.fishArea.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "seat-zone" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cards" },
        });
        for (const [card] of __VLS_getVForSourceType((entry.player.fishArea))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_15 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`fish-${entry.player.clientId}-${card.id}`),
                card: (card),
                size: "sm",
            }));
            const __VLS_16 = __VLS_15({
                key: (`fish-${entry.player.clientId}-${card.id}`),
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_15));
        }
    }
    if (entry.player.discardPile.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "seat-zone" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (entry.player.discardPile.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cards" },
        });
        for (const [card] of __VLS_getVForSourceType((entry.player.discardPile.slice(0, 8)))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_18 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`dp-${entry.player.clientId}-${card.id}`),
                card: (card),
                size: "sm",
            }));
            const __VLS_19 = __VLS_18({
                key: (`dp-${entry.player.clientId}-${card.id}`),
                card: (card),
                size: "sm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        }
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "center" },
    ...{ class: ({ 'my-turn': __VLS_ctx.isMyTurn }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "center-text" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.currentPlayerName);
if (__VLS_ctx.isMyTurn) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "center-turn-hint" },
});
(__VLS_ctx.compactCenterHint);
if (__VLS_ctx.centerEventText) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "center-event" },
    });
    (__VLS_ctx.centerEventText);
}
if (__VLS_ctx.responseCard) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "response-wrap" },
        ref: "responseLandingRef",
    });
    /** @type {typeof __VLS_ctx.responseLandingRef} */ ;
    const __VLS_21 = {}.Transition;
    /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
        name: "resp-move",
        mode: "out-in",
    }));
    const __VLS_23 = __VLS_22({
        name: "resp-move",
        mode: "out-in",
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    /** @type {[typeof CardComp, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(CardComp, new CardComp({
        key: (`resp-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
        size: "lg",
    }));
    const __VLS_26 = __VLS_25({
        key: (`resp-${__VLS_ctx.responseCard.id}-${__VLS_ctx.responseCard.source || 'upper'}`),
        card: (__VLS_ctx.responseCard),
        size: "lg",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    var __VLS_24;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
}
if (__VLS_ctx.mergedActionLogs.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "table-action-log" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
    for (const [log] of __VLS_getVForSourceType((__VLS_ctx.mergedActionLogs))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (`merged-log-${log.id}`),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.time, __VLS_intrinsicElements.time)({});
        (log.at);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (log.actorLabel);
        (log.displayText);
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "deck-anchor" },
    ref: "deckAnchorRef",
});
/** @type {typeof __VLS_ctx.deckAnchorRef} */ ;
const __VLS_28 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    name: "deal-fade",
}));
const __VLS_30 = __VLS_29({
    name: "deal-fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
if (__VLS_ctx.showDealAnimation) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "deal-overlay" },
    });
}
var __VLS_31;
const __VLS_32 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    name: "dealer-reveal",
}));
const __VLS_34 = __VLS_33({
    name: "dealer-reveal",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
if (__VLS_ctx.dealerReveal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`dealer-${__VLS_ctx.dealerReveal.id}`),
        ...{ class: "dealer-reveal" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dealer-reveal-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.dealerReveal.name);
}
var __VLS_35;
const __VLS_36 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    name: "dealer-flight",
}));
const __VLS_38 = __VLS_37({
    name: "dealer-flight",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
if (__VLS_ctx.dealerFlight) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`dealer-flight-${__VLS_ctx.dealerFlight.id}`),
        ...{ class: "dealer-flight" },
        ...{ style: (__VLS_ctx.dealerFlightStyle(__VLS_ctx.dealerFlight)) },
    });
}
var __VLS_39;
const __VLS_40 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    name: "action-pop",
}));
const __VLS_42 = __VLS_41({
    name: "action-pop",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
if (__VLS_ctx.actionEffect) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`act-${__VLS_ctx.actionEffect.id}`),
        ...{ class: "action-effect" },
    });
    (__VLS_ctx.actionEffect.label);
}
var __VLS_43;
if (__VLS_ctx.selfPlayer) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "self-zone" },
        ...{ class: ({ active: __VLS_ctx.isMyTurn, dealer: __VLS_ctx.isDealer(__VLS_ctx.selfPlayer.clientId), 'actor-flash': __VLS_ctx.flashActorId === __VLS_ctx.selfPlayer.clientId }) },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    (__VLS_ctx.selfPlayer.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.selfPlayer.declaredKongs);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "seat-tags" },
    });
    if (__VLS_ctx.isDealer(__VLS_ctx.selfPlayer.clientId)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag dealer" },
        });
    }
    if (__VLS_ctx.isMyTurn && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "turn-countdown" },
        });
        (__VLS_ctx.seatCountdownSeconds);
    }
    if (!__VLS_ctx.isCompactLandscape) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tag status" },
        });
        (__VLS_ctx.statusText(__VLS_ctx.selfPlayer));
    }
    if (__VLS_ctx.isMyTurn && __VLS_ctx.seatCountdownSeconds !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "turn-timer-bar self-turn-timer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: ({ width: `${__VLS_ctx.seatCountdownPercent}%` }) },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "self-main" },
        ...{ class: ({ 'no-open': __VLS_ctx.isCompactLandscape || !(__VLS_ctx.selfOpenGroups.length || __VLS_ctx.selfPlayer.fishArea.length || __VLS_ctx.selfPlayer.discardPile.length) }) },
    });
    if (!__VLS_ctx.isCompactLandscape && (__VLS_ctx.selfOpenGroups.length || __VLS_ctx.selfPlayer.fishArea.length || __VLS_ctx.selfPlayer.discardPile.length)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "self-areas" },
            ref: "selfOpenRef",
        });
        /** @type {typeof __VLS_ctx.selfOpenRef} */ ;
        if (__VLS_ctx.selfOpenGroups.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "self-area" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "grouped-cards" },
            });
            for (const [group] of __VLS_getVForSourceType((__VLS_ctx.selfOpenGroups))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.selfPlayer))
                                return;
                            if (!(!__VLS_ctx.isCompactLandscape && (__VLS_ctx.selfOpenGroups.length || __VLS_ctx.selfPlayer.fishArea.length || __VLS_ctx.selfPlayer.discardPile.length)))
                                return;
                            if (!(__VLS_ctx.selfOpenGroups.length))
                                return;
                            __VLS_ctx.toggleOpenGroup(__VLS_ctx.selfPlayer.clientId, group.id);
                        } },
                    key: (`self-exp-${group.id}`),
                    ...{ class: "group-chip" },
                    ...{ class: ({ expanded: __VLS_ctx.isOpenGroupExpanded(__VLS_ctx.selfPlayer.clientId, group.id), stacked: !__VLS_ctx.isOpenGroupExpanded(__VLS_ctx.selfPlayer.clientId, group.id) }) },
                });
                if (__VLS_ctx.isOpenGroupExpanded(__VLS_ctx.selfPlayer.clientId, group.id)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "expanded-preview cards" },
                    });
                    for (const [card] of __VLS_getVForSourceType((group.cards))) {
                        /** @type {[typeof CardComp, ]} */ ;
                        // @ts-ignore
                        const __VLS_44 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`self-exp-card-${card.id}`),
                            card: (card),
                            size: "sm",
                        }));
                        const __VLS_45 = __VLS_44({
                            key: (`self-exp-card-${card.id}`),
                            card: (card),
                            size: "sm",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_44));
                    }
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "stacked-preview" },
                    });
                    for (const [card, idx] of __VLS_getVForSourceType((__VLS_ctx.previewGroupCards(group.cards)))) {
                        /** @type {[typeof CardComp, ]} */ ;
                        // @ts-ignore
                        const __VLS_47 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                            key: (`self-exp-stack-${card.id}`),
                            card: (card),
                            size: "sm",
                            ...{ class: "stack-item" },
                            ...{ style: (__VLS_ctx.fanCardStyle(idx, __VLS_ctx.previewGroupSize(group.cards))) },
                        }));
                        const __VLS_48 = __VLS_47({
                            key: (`self-exp-stack-${card.id}`),
                            card: (card),
                            size: "sm",
                            ...{ class: "stack-item" },
                            ...{ style: (__VLS_ctx.fanCardStyle(idx, __VLS_ctx.previewGroupSize(group.cards))) },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_47));
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "stack-count" },
                    });
                    (group.cards.length);
                }
            }
        }
        if (__VLS_ctx.selfPlayer.fishArea.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "self-area" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cards" },
            });
            for (const [card] of __VLS_getVForSourceType((__VLS_ctx.selfPlayer.fishArea))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_50 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`self-fish-${card.id}`),
                    card: (card),
                    size: "sm",
                }));
                const __VLS_51 = __VLS_50({
                    key: (`self-fish-${card.id}`),
                    card: (card),
                    size: "sm",
                }, ...__VLS_functionalComponentArgsRest(__VLS_50));
            }
        }
        if (__VLS_ctx.selfPlayer.discardPile.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "self-area" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.selfPlayer.discardPile.length);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cards" },
            });
            for (const [card] of __VLS_getVForSourceType((__VLS_ctx.selfPlayer.discardPile.slice(0, 12)))) {
                /** @type {[typeof CardComp, ]} */ ;
                // @ts-ignore
                const __VLS_53 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                    key: (`self-dp-${card.id}`),
                    card: (card),
                    size: "sm",
                }));
                const __VLS_54 = __VLS_53({
                    key: (`self-dp-${card.id}`),
                    card: (card),
                    size: "sm",
                }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            }
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "self-hand-panel" },
    });
    if (__VLS_ctx.canDiscard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "discard-tip" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cards hand" },
        ref: "selfHandRef",
    });
    /** @type {typeof __VLS_ctx.selfHandRef} */ ;
    for (const [card] of __VLS_getVForSourceType((__VLS_ctx.privateHand))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selfPlayer))
                        return;
                    __VLS_ctx.onDiscard(card.id, $event);
                } },
            key: (`me-${card.id}`),
            ...{ class: "hand-card" },
            ...{ class: ({
                    playable: __VLS_ctx.canDiscardCard(card),
                    blocked: !__VLS_ctx.canDiscardCard(card),
                    'gold-blocked': card.color === 'gold',
                    'candidate-active': __VLS_ctx.isCandidateCard(card.id),
                    'candidate-selected': __VLS_ctx.isSelectedCandidateCard(card.id),
                }) },
            disabled: (!__VLS_ctx.canDiscardCard(card) || Boolean(__VLS_ctx.discardingCardId)),
        });
        if (__VLS_ctx.candidateBadgeText(card.id)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "candidate-badge" },
            });
            (__VLS_ctx.candidateBadgeText(card.id));
        }
        /** @type {[typeof CardComp, ]} */ ;
        // @ts-ignore
        const __VLS_56 = __VLS_asFunctionalComponent(CardComp, new CardComp({
            card: (card),
            size: "xl",
        }));
        const __VLS_57 = __VLS_56({
            card: (card),
            size: "xl",
        }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    }
    if (props.embeddedActionPanel && props.state?.phase === 'playing') {
        /** @type {[typeof ActionPanel, ]} */ ;
        // @ts-ignore
        const __VLS_59 = __VLS_asFunctionalComponent(ActionPanel, new ActionPanel({
            ...{ 'onSubmit': {} },
            ...{ 'onSelectionChange': {} },
            ...{ class: "embedded-actions" },
            actions: (props.actions ?? []),
            canAct: (Boolean(props.canAct)),
            isCurrentTurn: (Boolean(props.isCurrentTurn)),
            responsePhase: (props.responsePhase ?? ''),
            currentPlayerName: (props.currentPlayerName ?? '-'),
            selectionMode: (props.selectionMode ?? null),
            selectedCandidateId: (props.selectedCandidateId ?? null),
        }));
        const __VLS_60 = __VLS_59({
            ...{ 'onSubmit': {} },
            ...{ 'onSelectionChange': {} },
            ...{ class: "embedded-actions" },
            actions: (props.actions ?? []),
            canAct: (Boolean(props.canAct)),
            isCurrentTurn: (Boolean(props.isCurrentTurn)),
            responsePhase: (props.responsePhase ?? ''),
            currentPlayerName: (props.currentPlayerName ?? '-'),
            selectionMode: (props.selectionMode ?? null),
            selectedCandidateId: (props.selectedCandidateId ?? null),
        }, ...__VLS_functionalComponentArgsRest(__VLS_59));
        let __VLS_62;
        let __VLS_63;
        let __VLS_64;
        const __VLS_65 = {
            onSubmit: (__VLS_ctx.onSubmitAction)
        };
        const __VLS_66 = {
            onSelectionChange: (__VLS_ctx.onSelectionChange)
        };
        var __VLS_61;
    }
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
            size: "md",
        }));
        const __VLS_68 = __VLS_67({
            card: (flight.card),
            size: "md",
        }, ...__VLS_functionalComponentArgsRest(__VLS_67));
    }
}
/** @type {__VLS_StyleScopedClasses['board']} */ ;
/** @type {__VLS_StyleScopedClasses['table']} */ ;
/** @type {__VLS_StyleScopedClasses['self-open-left']} */ ;
/** @type {__VLS_StyleScopedClasses['grouped-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['expanded-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['stacked-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-count']} */ ;
/** @type {__VLS_StyleScopedClasses['seat']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['turn']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-countdown']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-timer-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['grouped-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['expanded-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['stacked-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-count']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['center-text']} */ ;
/** @type {__VLS_StyleScopedClasses['center-turn-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['center-event']} */ ;
/** @type {__VLS_StyleScopedClasses['response-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['table-action-log']} */ ;
/** @type {__VLS_StyleScopedClasses['center-pointer']} */ ;
/** @type {__VLS_StyleScopedClasses['center-pointer-head']} */ ;
/** @type {__VLS_StyleScopedClasses['deck-anchor']} */ ;
/** @type {__VLS_StyleScopedClasses['deal-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-reveal-label']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer-flight']} */ ;
/** @type {__VLS_StyleScopedClasses['action-effect']} */ ;
/** @type {__VLS_StyleScopedClasses['self-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['self-turn-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['self-head']} */ ;
/** @type {__VLS_StyleScopedClasses['seat-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['dealer']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-countdown']} */ ;
/** @type {__VLS_StyleScopedClasses['tag']} */ ;
/** @type {__VLS_StyleScopedClasses['status']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-timer-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['self-turn-timer']} */ ;
/** @type {__VLS_StyleScopedClasses['self-main']} */ ;
/** @type {__VLS_StyleScopedClasses['self-areas']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['grouped-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['group-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['expanded-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['stacked-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stack-count']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-area']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['self-hand-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['cards']} */ ;
/** @type {__VLS_StyleScopedClasses['hand']} */ ;
/** @type {__VLS_StyleScopedClasses['hand-card']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['embedded-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['fx-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['fx-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-back']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ActionPanel: ActionPanel,
            CardComp: CardComp,
            isCompactLandscape: isCompactLandscape,
            selfPlayer: selfPlayer,
            discardingCardId: discardingCardId,
            flights: flights,
            showDealAnimation: showDealAnimation,
            actionEffect: actionEffect,
            dealerReveal: dealerReveal,
            dealerFlight: dealerFlight,
            flashActorId: flashActorId,
            tableRef: tableRef,
            responseLandingRef: responseLandingRef,
            deckAnchorRef: deckAnchorRef,
            selfHandRef: selfHandRef,
            selfZoneRef: selfZoneRef,
            selfOpenRef: selfOpenRef,
            selfOpenCompactRef: selfOpenCompactRef,
            seatEntries: seatEntries,
            selfOpenGroups: selfOpenGroups,
            responseCard: responseCard,
            currentPlayerName: currentPlayerName,
            isMyTurn: isMyTurn,
            canDiscard: canDiscard,
            centerEventText: centerEventText,
            seatCountdownSeconds: seatCountdownSeconds,
            seatCountdownPercent: seatCountdownPercent,
            compactCenterHint: compactCenterHint,
            mergedActionLogs: mergedActionLogs,
            centerPointerDirection: centerPointerDirection,
            isCurrentTurn: isCurrentTurn,
            statusText: statusText,
            isDealer: isDealer,
            canDiscardCard: canDiscardCard,
            onDiscard: onDiscard,
            onSubmitAction: onSubmitAction,
            onSelectionChange: onSelectionChange,
            isCandidateCard: isCandidateCard,
            isSelectedCandidateCard: isSelectedCandidateCard,
            candidateBadgeText: candidateBadgeText,
            previewGroupCards: previewGroupCards,
            previewGroupSize: previewGroupSize,
            fanCardStyle: fanCardStyle,
            isOpenGroupExpanded: isOpenGroupExpanded,
            toggleOpenGroup: toggleOpenGroup,
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
