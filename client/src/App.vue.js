import { ref } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import DebugPanel from "@/components/DebugPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
const { connected, myId, state, players, privateHand, availableActions, huResult, debugApplied, sendAction, debugSetup } = useRoom("玩家");
const debugResult = ref(null);
const debugMarkers = {
    eat_mode1: "DEBUG: eat_mode1",
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
    if (scenario === "eat_mode1") {
        if (state.value?.responsePhase !== "self_eat")
            errors.push("responsePhase 应为 self_eat");
        if (!enabled("eat", actions))
            errors.push("吃按钮应可点击");
        if (!enabled("grab", actions))
            errors.push("抓按钮应可点击");
        if (enabled("hu", actions) || enabled("open", actions) || enabled("peng", actions))
            errors.push("胡/开/碰应灰显");
        if (exists("pass", actions))
            errors.push("模式1不应出现过按钮");
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
        if (state.value?.currentPlayerId === myId.value)
            errors.push("当前玩家不应是自己");
        if (!enabled("pass", actions))
            errors.push("过按钮应可点击");
        if (enabled("hu", actions) || enabled("open", actions) || enabled("peng", actions))
            errors.push("胡/开/碰应灰显");
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
            errors.push("玩家展示数量应至少为4（含机器人）");
        const myPlayer = players.value.find((p) => p.clientId === myId.value);
        if (!myPlayer || (myPlayer.discardPile?.length ?? 0) < 2) {
            const meCount = myPlayer?.discardPile?.length ?? 0;
            errors.push(`自己弃牌区应至少2张牌（当前=${meCount}）`);
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
        if (!ack || ack.scenario !== scenario) {
            continue;
        }
        ackSeen = true;
        if (!ack.ok) {
            debugResult.value = {
                scenario,
                ok: false,
                summary: "服务端未应用场景",
                errors: ["debug_setup 返回 ok=false"],
            };
            return;
        }
        // Wait state patch sync after ack.
        const marker = debugMarkers[scenario];
        for (let j = 0; j < 20; j += 1) {
            await wait(80);
            if (!String(state.value?.lastAction ?? "").startsWith(marker)) {
                continue;
            }
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
        summary: ackSeen ? "收到场景回执，但未等到状态补丁" : "未等到场景状态刷新，请重试一次",
        errors: [ackSeen ? `lastAction 未进入 ${debugMarkers[scenario]}` : "状态未进入目标 DEBUG 场景"],
    };
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
(__VLS_ctx.myId || "-");
/** @type {[typeof GameBoard, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(GameBoard, new GameBoard({
    state: (__VLS_ctx.state),
    players: (__VLS_ctx.players),
    privateHand: (__VLS_ctx.privateHand),
}));
const __VLS_4 = __VLS_3({
    state: (__VLS_ctx.state),
    players: (__VLS_ctx.players),
    privateHand: (__VLS_ctx.privateHand),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
/** @type {[typeof DebugPanel, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(DebugPanel, new DebugPanel({
    ...{ 'onRun': {} },
    hint: "点击场景后会自动断言当前状态是否符合 SRS，并给出 PASS/FAIL。",
    result: (__VLS_ctx.debugResult),
}));
const __VLS_7 = __VLS_6({
    ...{ 'onRun': {} },
    hint: "点击场景后会自动断言当前状态是否符合 SRS，并给出 PASS/FAIL。",
    result: (__VLS_ctx.debugResult),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
let __VLS_9;
let __VLS_10;
let __VLS_11;
const __VLS_12 = {
    onRun: (__VLS_ctx.runDebugScenario)
};
var __VLS_8;
/** @type {[typeof ActionPanel, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(ActionPanel, new ActionPanel({
    ...{ 'onSubmit': {} },
    actions: (__VLS_ctx.availableActions),
}));
const __VLS_14 = __VLS_13({
    ...{ 'onSubmit': {} },
    actions: (__VLS_ctx.availableActions),
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onSubmit: (__VLS_ctx.sendAction)
};
var __VLS_15;
if (__VLS_ctx.huResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hu-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hu-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.huResult.winnerId);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.huResult.groups.join(" / ") || "-");
}
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
/** @type {__VLS_StyleScopedClasses['top']} */ ;
/** @type {__VLS_StyleScopedClasses['meta']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['hu-panel']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ActionPanel: ActionPanel,
            DebugPanel: DebugPanel,
            GameBoard: GameBoard,
            OrientationGuard: OrientationGuard,
            connected: connected,
            myId: myId,
            state: state,
            players: players,
            privateHand: privateHand,
            availableActions: availableActions,
            huResult: huResult,
            sendAction: sendAction,
            debugResult: debugResult,
            runDebugScenario: runDebugScenario,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
