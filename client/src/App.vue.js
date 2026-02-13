import { computed, ref } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import CardComp from "@/components/Card.vue";
import DebugPanel from "@/components/DebugPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
const { connected, mySeatId, state, players, privateHand, availableActions, huResult, roundResult, debugApplied, joinError, actionLogs, sendAction, sendDiscardCard, debugSetup, startGame, } = useRoom("玩家");
const isWaiting = computed(() => state.value?.phase === "waiting");
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
const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
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
const debugResult = ref(null);
const debugMarkers = {
    hu_ready_mode2: "DEBUG: hu_ready_mode2",
    mode2_pass: "DEBUG: mode2_pass",
    collective_no_actions: "DEBUG: collective_no_actions",
    hu_fail_case: "DEBUG: hu_fail_case",
    discard_public: "DEBUG: discard_public",
};
function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function enabled(action, actions) {
    return actions.some((x) => x.action === action && x.enabled);
}
function exists(action, actions) {
    return actions.some((x) => x.action === action);
}
function evaluate(scenario) {
    const actions = availableActions.value;
    const errors = [];
    if (scenario === "hu_ready_mode2") {
        if (state.value?.responsePhase !== "self_grab")
            errors.push("responsePhase 应为 self_grab");
        if (!enabled("hu", actions))
            errors.push("胡按钮应可点击（预置可胡）");
        if (!exists("pass", actions))
            errors.push("模式2应包含过按钮");
    }
    if (scenario === "mode2_pass") {
        if (state.value?.responsePhase !== "self_grab")
            errors.push("responsePhase 应为 self_grab");
        if (!exists("pass", actions))
            errors.push("模式2应包含过按钮");
        if (!enabled("pass", actions))
            errors.push("过按钮应可点击");
        if (exists("grab", actions))
            errors.push("模式2不应出现抓按钮");
    }
    if (scenario === "collective_no_actions") {
        if (state.value?.responsePhase !== "collective")
            errors.push("responsePhase 应为 collective");
        if (state.value?.currentPlayerId === mySeatId.value)
            errors.push("当前玩家不应是自己");
        if (!exists("pass", actions))
            errors.push("他人待响阶段应包含过按钮");
        if (!enabled("pass", actions))
            errors.push("他人待响阶段，过按钮应可点");
        if (enabled("hu", actions) || enabled("open", actions) || enabled("peng", actions)) {
            errors.push("当前样例中，胡/开/碰应灰显");
        }
    }
    if (scenario === "hu_fail_case") {
        if (state.value?.responsePhase !== "collective")
            errors.push("responsePhase 应为 collective");
        if (!exists("hu", actions))
            errors.push("应存在胡按钮");
        if (enabled("hu", actions))
            errors.push("胡按钮应灰显（胡牌失败样例）");
    }
    if (scenario === "discard_public") {
        if (players.value.length < 4)
            errors.push("玩家展示数量应至少4（含机器人）");
        const myPlayer = players.value.find((p) => p.clientId === mySeatId.value);
        if (!myPlayer || (myPlayer.discardPile?.length ?? 0) < 2) {
            errors.push(`自己弃牌区应至少2张牌（当前=${myPlayer?.discardPile?.length ?? 0}）`);
        }
        const everyoneHasDiscard = players.value.every((p) => (p.discardPile?.length ?? 0) >= 1);
        if (!everyoneHasDiscard) {
            const counts = players.value.map((p) => `${p.clientId}:${p.discardPile?.length ?? 0}`).join(", ");
            errors.push(`所有玩家弃牌区应可见且至少1张（当前=${counts}）`);
        }
    }
    return errors;
}
async function runDebugScenario(scenario) {
    debugResult.value = { scenario, ok: false, summary: "断言中...", errors: [] };
    debugSetup(scenario);
    let ackSeen = false;
    for (let i = 0; i < 20; i += 1) {
        await wait(120);
        const ack = debugApplied.value;
        if (!ack || ack.scenario !== scenario)
            continue;
        ackSeen = true;
        if (!ack.ok) {
            debugResult.value = { scenario, ok: false, summary: "服务端未应用场景", errors: ["debug_setup 返回 ok=false"] };
            return;
        }
        const marker = debugMarkers[scenario];
        for (let j = 0; j < 20; j += 1) {
            await wait(80);
            if (!String(state.value?.lastAction ?? "").startsWith(marker))
                continue;
            const errors = evaluate(scenario);
            debugResult.value = {
                scenario,
                ok: errors.length === 0,
                summary: errors.length === 0 ? "场景断言通过" : "场景断言失败，请看失败项",
                errors,
            };
            return;
        }
        break;
    }
    debugResult.value = {
        scenario,
        ok: false,
        summary: ackSeen ? "收到场景回执，但未等到状态同步" : "未等到场景状态刷新，请重试一次",
        errors: [ackSeen ? `lastAction 未进入 ${debugMarkers[scenario]}` : "状态未进入目标 DEBUG 场景"],
    };
}
async function copyInviteLink() {
    try {
        await navigator.clipboard.writeText(window.location.href);
    }
    catch {
        // Ignore clipboard errors.
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['log-list']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof OrientationGuard, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(OrientationGuard, new OrientationGuard({}));
const __VLS_1 = __VLS_0({}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "layout" },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.copyInviteLink) },
        ...{ class: "ghost" },
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
        state: (__VLS_ctx.state),
        players: (__VLS_ctx.players),
        privateHand: (__VLS_ctx.privateHand),
        mySeatId: (__VLS_ctx.mySeatId),
        canDiscard: (__VLS_ctx.canDiscard),
    }));
    const __VLS_4 = __VLS_3({
        ...{ 'onDiscardCard': {} },
        state: (__VLS_ctx.state),
        players: (__VLS_ctx.players),
        privateHand: (__VLS_ctx.privateHand),
        mySeatId: (__VLS_ctx.mySeatId),
        canDiscard: (__VLS_ctx.canDiscard),
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        onDiscardCard: (__VLS_ctx.sendDiscardCard)
    };
    var __VLS_5;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "logs" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "log-list" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.actionLogs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        key: (item.id),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "log-time" },
    });
    (item.at);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (item.text);
}
/** @type {[typeof DebugPanel, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(DebugPanel, new DebugPanel({
    ...{ 'onRun': {} },
    hint: "测试场景：点击后会自动做 PASS/FAIL 断言。",
    result: (__VLS_ctx.debugResult),
}));
const __VLS_11 = __VLS_10({
    ...{ 'onRun': {} },
    hint: "测试场景：点击后会自动做 PASS/FAIL 断言。",
    result: (__VLS_ctx.debugResult),
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
let __VLS_13;
let __VLS_14;
let __VLS_15;
const __VLS_16 = {
    onRun: (__VLS_ctx.runDebugScenario)
};
var __VLS_12;
if (__VLS_ctx.isPlaying) {
    /** @type {[typeof ActionPanel, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(ActionPanel, new ActionPanel({
        ...{ 'onSubmit': {} },
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onSubmit': {} },
        actions: (__VLS_ctx.availableActions),
        canAct: (__VLS_ctx.canAct),
        isCurrentTurn: (__VLS_ctx.isMyTurn),
        responsePhase: (__VLS_ctx.state?.responsePhase || ''),
        currentPlayerName: (__VLS_ctx.currentPlayerName),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onSubmit: (__VLS_ctx.sendAction)
    };
    var __VLS_19;
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
        }
    }
}
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['ghost']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['player-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['player-item']} */ ;
/** @type {__VLS_StyleScopedClasses['turn-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['logs']} */ ;
/** @type {__VLS_StyleScopedClasses['log-list']} */ ;
/** @type {__VLS_StyleScopedClasses['log-time']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-list']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-item']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-name']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['settlement-empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ActionPanel: ActionPanel,
            CardComp: CardComp,
            DebugPanel: DebugPanel,
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
            actionLogs: actionLogs,
            sendAction: sendAction,
            sendDiscardCard: sendDiscardCard,
            startGame: startGame,
            isWaiting: isWaiting,
            isPlaying: isPlaying,
            isHost: isHost,
            isMyTurn: isMyTurn,
            canAct: canAct,
            canDiscard: canDiscard,
            showEndPanel: showEndPanel,
            endPanelTitle: endPanelTitle,
            winnerName: winnerName,
            settlementPlayers: settlementPlayers,
            endSummary: endSummary,
            turnHint: turnHint,
            currentPlayerName: currentPlayerName,
            debugResult: debugResult,
            runDebugScenario: runDebugScenario,
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
