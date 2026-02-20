import { computed, ref } from "vue";
const props = withDefaults(defineProps(), {
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    currentPlayerName: "-",
});
const emit = defineEmits();
const busy = ref(false);
const defaultOrder = ["hu", "kai", "peng", "chi", "pass"];
const normalized = computed(() => {
    const map = new Map(props.actions.map((x) => [x.action, x.enabled]));
    return defaultOrder.map((action) => ({ action, enabled: Boolean(map.get(action)) }));
});
const panelHint = computed(() => {
    if (!props.canAct) {
        return `当前回合: ${props.currentPlayerName}，你暂时不能操作`;
    }
    if (props.responsePhase === "collective" && !props.isCurrentTurn) {
        return "他人待响阶段：你可以选择胡/开/碰/吃/过";
    }
    if (!normalized.value.some((x) => x.enabled)) {
        return "当前阶段没有可执行动作";
    }
    return "请选择一个动作";
});
function text(action) {
    const map = {
        hu: "胡",
        kai: "开",
        chi: "吃",
        pass: "过",
        open: "开",
        peng: "碰",
        eat: "吃",
        grab: "抓",
    };
    return map[action];
}
function onClick(action) {
    busy.value = true;
    emit("submit", action);
    window.setTimeout(() => {
        busy.value = false;
    }, 220);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    currentPlayerName: "-",
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['locked']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel" },
    ...{ class: ({ locked: !__VLS_ctx.canAct }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hint" },
});
(__VLS_ctx.panelHint);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "actions" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.normalized))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.onClick(item.action);
            } },
        key: (item.action),
        ...{ class: "btn" },
        ...{ class: ({ enabled: item.enabled && __VLS_ctx.canAct }) },
        disabled: (!__VLS_ctx.canAct || !item.enabled || __VLS_ctx.busy),
    });
    (__VLS_ctx.text(item.action));
}
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            busy: busy,
            normalized: normalized,
            panelHint: panelHint,
            text: text,
            onClick: onClick,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
