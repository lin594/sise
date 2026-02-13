import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import CardComp from "@/components/Card.vue";
import GameBoard from "@/components/GameBoard.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
const { connected, mySeatId, state, players, privateHand, availableActions, huResult, roundResult, joinError, declareError, sendAction, sendDiscardCard, declareSetup, startGame, nextRound, returnLobby, } = useRoom("玩家");
const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const isMyTurn = computed(() => {
    if (!mySeatId.value || state.value?.currentPlayerId !== mySeatId.value) {
        return false;
    }
    const me = players.value.find((x) => x.clientId === mySeatId.value);
    return !Boolean(me?.isBot);
});
const canAct = computed(() => isPlaying.value && availableActions.value.some((x) => x.enabled));
const canDiscard = computed(() => isPlaying.value && isMyTurn.value && state.value?.responsePhase === "self_grab" && !canAct.value);
const isCompactLandscape = ref(false);
const resettingLobby = ref(false);
const globalError = ref("");
const updateCompactLandscape = () => {
    isCompactLandscape.value = window.matchMedia("(orientation: landscape) and (max-width: 960px)").matches;
};
const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
const mePlayer = computed(() => players.value.find((x) => x.clientId === mySeatId.value) ?? null);
const isDeclareSubmitted = computed(() => Boolean(mePlayer.value?.declaredReady));
const shouldShowDeclarePanel = computed(() => isDeclaring.value && Boolean(mySeatId.value) && !Boolean(mePlayer.value?.isBot));
const declareKongsInput = ref(0);
const nowMs = ref(Date.now());
let declareTick = null;
const selectedFishCardIds = ref(new Set());
const selectedFishCards = computed(() => privateHand.value.filter((card) => selectedFishCardIds.value.has(card.id)));
const declareSecondsLeft = computed(() => {
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
function submitDeclaration() {
    if (!fishSelectionValid.value || isDeclareSubmitted.value) {
        return;
    }
    declareSetup({
        declaredKongs: Math.max(0, Number(declareKongsInput.value) || 0),
        fishCardIds: [...selectedFishCardIds.value],
    });
}
watch(shouldShowDeclarePanel, (show) => {
    if (show) {
        selectedFishCardIds.value = new Set();
        declareKongsInput.value = Number(mePlayer.value?.declaredKongs ?? 0);
    }
});
onMounted(() => {
    declareTick = window.setInterval(() => {
        nowMs.value = Date.now();
    }, 500);
    updateCompactLandscape();
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
const endPanelTitle = computed(() => (huResult.value ? "胡牌结算" : "本局结束"));
const winnerName = computed(() => {
    const winnerId = huResult.value?.winnerId ?? roundResult.value?.winnerId;
    if (!winnerId) {
        return "-";
    }
    const player = players.value.find((x) => x.clientId === winnerId);
    return player?.name || winnerId;
});
const settlementPlayers = computed(() => roundResult.value?.players ?? []);
const endSummary = computed(() => {
    const action = String(state.value?.lastAction ?? "");
    if (action === "DECK_EMPTY") {
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
    if (canDiscard.value) {
        return "请点击手牌弃一张";
    }
    if (state.value?.responsePhase === "collective") {
        if (!isMyTurn.value && canAct.value) {
            return "他人待响阶段：你可以选择胡/开/碰/吃/过";
        }
        if (isMyTurn.value) {
            return "等待他人响应";
        }
    }
    return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});
const currentPlayerName = computed(() => {
    const playerId = state.value?.currentPlayerId;
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
async function rebuildLobby() {
    if (resettingLobby.value) {
        return;
    }
    resettingLobby.value = true;
    globalError.value = "";
    try {
        const response = await fetch("/colyseus/reset-room", { method: "POST" });
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
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['playing']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-landscape']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-landscape']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-input']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['score-breakdown']} */ ;
/** @type {__VLS_StyleScopedClasses['score-breakdown']} */ ;
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['playing']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "lobby-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.startGame) },
        ...{ class: "primary" },
        disabled: (!__VLS_ctx.isHost),
    });
    (__VLS_ctx.isHost ? "开始游戏" : "等待房主开始");
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
    if (__VLS_ctx.isPlaying) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "turn-banner" },
            ...{ class: ({ mine: __VLS_ctx.isMyTurn }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.currentPlayerName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.turnHint);
    }
    /** @type {[typeof GameBoard, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(GameBoard, new GameBoard({
        ...{ 'onDiscardCard': {} },
        ...{ 'onSubmitAction': {} },
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
    }));
    const __VLS_4 = __VLS_3({
        ...{ 'onDiscardCard': {} },
        ...{ 'onSubmitAction': {} },
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
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        onDiscardCard: (__VLS_ctx.sendDiscardCard)
    };
    const __VLS_10 = {
        onSubmitAction: (__VLS_ctx.sendAction)
    };
    var __VLS_5;
}
if (__VLS_ctx.isPlaying && !__VLS_ctx.isCompactLandscape) {
    /** @type {[typeof ActionPanel, ]} */ ;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent(ActionPanel, new ActionPanel({
        ...{ 'onSubmit': {} },
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
    }));
    const __VLS_12 = __VLS_11({
        ...{ 'onSubmit': {} },
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    let __VLS_14;
    let __VLS_15;
    let __VLS_16;
    const __VLS_17 = {
        onSubmit: (__VLS_ctx.sendAction)
    };
    var __VLS_13;
}
if (__VLS_ctx.shouldShowDeclarePanel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "declare-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "declare-desc" },
    });
    (__VLS_ctx.declareSecondsLeft);
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "declare-input" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        min: "0",
        step: "1",
        disabled: (__VLS_ctx.isDeclareSubmitted),
    });
    (__VLS_ctx.declareKongsInput);
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
                ...{ class: ({ selected: __VLS_ctx.selectedFishCardIds.has(card.id) }) },
                disabled: (__VLS_ctx.isDeclareSubmitted),
            });
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_18 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                card: (card),
            }));
            const __VLS_19 = __VLS_18({
                card: (card),
            }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "settlement-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "declare-zone" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "zone-title" },
    });
    if (__VLS_ctx.selectedFishCards.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "declare-cards" },
        });
        for (const [card] of __VLS_getVForSourceType((__VLS_ctx.selectedFishCards))) {
            /** @type {[typeof CardComp, ]} */ ;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                key: (`declare-fish-${card.id}`),
                card: (card),
            }));
            const __VLS_22 = __VLS_21({
                key: (`declare-fish-${card.id}`),
                card: (card),
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "settlement-empty" },
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
    if (__VLS_ctx.huResult) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.winnerName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.huResult.groups.join(" / ") || "-");
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.endSummary);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.state?.lastAction || "-");
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
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "settlement-name" },
            });
            (p.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "settlement-meta" },
            });
            (p.exposedArea.length + p.generalArea.length);
            (p.fishArea.length);
            (p.discardCount);
            if (p.hand.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "settlement-cards" },
                });
                for (const [card] of __VLS_getVForSourceType((p.hand))) {
                    /** @type {[typeof CardComp, ]} */ ;
                    // @ts-ignore
                    const __VLS_24 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                    }));
                    const __VLS_25 = __VLS_24({
                        key: (`settle-${p.clientId}-${card.id}`),
                        card: (card),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
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
            if (p.exposedArea.length + p.generalArea.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "settlement-cards" },
                });
                for (const [card] of __VLS_getVForSourceType(([...p.exposedArea, ...p.generalArea]))) {
                    /** @type {[typeof CardComp, ]} */ ;
                    // @ts-ignore
                    const __VLS_27 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`settle-e-${p.clientId}-${card.id}`),
                        card: (card),
                    }));
                    const __VLS_28 = __VLS_27({
                        key: (`settle-e-${p.clientId}-${card.id}`),
                        card: (card),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
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
            if (p.fishArea.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "settlement-cards" },
                });
                for (const [card] of __VLS_getVForSourceType((p.fishArea))) {
                    /** @type {[typeof CardComp, ]} */ ;
                    // @ts-ignore
                    const __VLS_30 = __VLS_asFunctionalComponent(CardComp, new CardComp({
                        key: (`settle-fish-${p.clientId}-${card.id}`),
                        card: (card),
                    }));
                    const __VLS_31 = __VLS_30({
                        key: (`settle-fish-${p.clientId}-${card.id}`),
                        card: (card),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
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
            if (!p.scoreBreakdown.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "settlement-empty" },
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
                for (const [line] of __VLS_getVForSourceType((p.scoreBreakdown))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                        key: (`score-${p.clientId}-${line.key}`),
                    });
                    (line.label);
                    (line.count);
                    (line.unit);
                    (line.total);
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "score-total" },
            });
            (p.totalScore);
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
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['reset-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['global-error']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['player-item']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-submitted']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-progress']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-progress-fill']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-input']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['declare-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-name']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['score-breakdown']} */ ;
/** @type {__VLS_StyleScopedClasses['zone-title']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['score-total']} */ ;
/** @type {__VLS_StyleScopedClasses['end-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
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
            huResult: huResult,
            joinError: joinError,
            declareError: declareError,
            sendAction: sendAction,
            sendDiscardCard: sendDiscardCard,
            startGame: startGame,
            nextRound: nextRound,
            returnLobby: returnLobby,
            isWaiting: isWaiting,
            isPlaying: isPlaying,
            isEnded: isEnded,
            isHost: isHost,
            isMyTurn: isMyTurn,
            canAct: canAct,
            canDiscard: canDiscard,
            isCompactLandscape: isCompactLandscape,
            resettingLobby: resettingLobby,
            globalError: globalError,
            showEndPanel: showEndPanel,
            isDeclareSubmitted: isDeclareSubmitted,
            shouldShowDeclarePanel: shouldShowDeclarePanel,
            declareKongsInput: declareKongsInput,
            selectedFishCardIds: selectedFishCardIds,
            selectedFishCards: selectedFishCards,
            declareSecondsLeft: declareSecondsLeft,
            declareProgressPercent: declareProgressPercent,
            fishSelectionValid: fishSelectionValid,
            toggleFish: toggleFish,
            submitDeclaration: submitDeclaration,
            endPanelTitle: endPanelTitle,
            winnerName: winnerName,
            settlementPlayers: settlementPlayers,
            endSummary: endSummary,
            turnHint: turnHint,
            currentPlayerName: currentPlayerName,
            dealerName: dealerName,
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
