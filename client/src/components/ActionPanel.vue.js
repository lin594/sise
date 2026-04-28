import { computed, ref } from "vue";
const props = withDefaults(defineProps(), {
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    currentPlayerName: "-",
    selectionMode: null,
    selectedCandidateId: null,
});
const emit = defineEmits();
const busy = ref(false);
const defaultOrder = ["hu", "kai", "peng", "chi", "pass"];
const normalized = computed(() => {
    const map = new Map(props.actions.map((x) => [x.action, x]));
    const isCollective = props.responsePhase === "collective";
    const ordered = defaultOrder
        .filter((action) => !(action === "chi" && isCollective))
        .map((action) => {
        const item = map.get(action);
        return {
            action,
            enabled: Boolean(item?.enabled),
            candidates: item?.candidates ?? [],
        };
    });
    if (props.canAct) {
        const enabledOnly = ordered.filter((item) => item.enabled);
        if (enabledOnly.length > 0) {
            return enabledOnly;
        }
    }
    return ordered;
});
const selectionMode = computed(() => props.selectionMode ?? null);
const panelHint = computed(() => {
    if (!props.canAct) {
        return `当前回合: ${props.currentPlayerName}，你暂时不能操作`;
    }
    if (selectionMode.value) {
        return `已选择${text(selectionMode.value)}，请在中间弹窗选择牌组确认`;
    }
    if (props.responsePhase === "collective" && !props.isCurrentTurn) {
        return "他人待响阶段：你可以选择胡/开/碰/过";
    }
    if (props.responsePhase === "local_upper") {
        return "当前待响牌来自上家，可选择吃或抓";
    }
    if (props.responsePhase === "local_draw") {
        return "当前待响牌需要你决定吃或过";
    }
    if (!normalized.value.some((x) => x.enabled)) {
        return "当前阶段没有可执行动作";
    }
    return "请选择一个动作";
});
function isMeldAction(action) {
    return action === "kai" || action === "peng" || action === "chi";
}
function text(action) {
    if (action === "pass" && props.responsePhase === "local_upper") {
        return "抓";
    }
    const map = {
        hu: "胡",
        kai: "开",
        chi: "吃",
        pass: "过",
        peng: "碰",
    };
    return map[action];
}
function onClick(action) {
    if (busy.value) {
        return;
    }
    if (isMeldAction(action)) {
        const item = normalized.value.find((entry) => entry.action === action);
        if ((item?.candidates?.length ?? 0) === 1) {
            busy.value = true;
            const candidateId = item?.candidates?.[0]?.id ?? "";
            emit("selectionChange", { mode: null, selectedCandidateId: candidateId || null });
            emit("submit", { action, candidateId });
            window.setTimeout(() => {
                busy.value = false;
            }, 220);
            return;
        }
        if (selectionMode.value === action) {
            emit("selectionChange", { mode: null, selectedCandidateId: null });
        }
        else {
            emit("selectionChange", { mode: action, selectedCandidateId: null });
        }
        return;
    }
    busy.value = true;
    emit("selectionChange", { mode: null, selectedCandidateId: null });
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
    selectionMode: null,
    selectedCandidateId: null,
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
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
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
        'data-testid': (`action-${item.action}`),
        ...{ class: "btn" },
        ...{ class: ({
                enabled: item.enabled && __VLS_ctx.canAct,
                selected: __VLS_ctx.selectionMode === item.action,
            }) },
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
            selectionMode: selectionMode,
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
