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
    const pass = map.get("pass");
    const isPendingForMe = isCollective && Boolean(pass?.enabled && pass.deferred);
    const ordered = defaultOrder
        .map((action) => {
        const item = map.get(action);
        return {
            key: action,
            action,
            enabled: Boolean(item?.enabled),
            deferred: Boolean(item?.deferred),
            candidates: item?.candidates ?? [],
        };
    })
        .filter((item) => !(item.action === "chi" && isCollective && !item.deferred))
        .filter((item) => !(item.action === "pass" && isPendingForMe));
    if (isPendingForMe) {
        ordered.push({
            key: "deferred-pass",
            action: "pass",
            enabled: false,
            deferred: true,
            deferredKind: "pass",
            candidates: [],
        });
    }
    if (props.canAct) {
        const enabledOnly = ordered.filter((item) => isClickable(item));
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
        return `已选择${actionText(selectionMode.value)}，请在中间弹窗选择牌组确认`;
    }
    if (props.responsePhase === "collective" && !props.isCurrentTurn) {
        if (normalized.value.some((item) => item.key === "deferred-pass")) {
            return "这张待响牌给你：可胡/开/碰，或先选吃/抓";
        }
        if (normalized.value.some((item) => item.action === "chi" && item.deferred)) {
            return "他人待响阶段：可先选吃，系统会先过待响，稍后自动吃";
        }
        return "他人待响阶段：你可以选择胡/开/碰/过";
    }
    if (props.responsePhase === "local_upper") {
        return "当前待响牌来自上家，可选择吃或抓";
    }
    if (props.responsePhase === "local_draw") {
        return "当前待响牌需要你决定吃或过";
    }
    if (!normalized.value.some((x) => isClickable(x))) {
        return "当前阶段没有可执行动作";
    }
    return "请选择一个动作";
});
function isMeldAction(action) {
    return action === "kai" || action === "peng" || action === "chi";
}
function isClickable(item) {
    return item.enabled || Boolean(item.deferred);
}
function actionText(action) {
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
function text(item) {
    if (item.deferredKind === "pass") {
        return "抓";
    }
    return actionText(item.action);
}
function onClick(item) {
    if (busy.value) {
        return;
    }
    const action = item.action;
    if (item.deferredKind === "pass") {
        busy.value = true;
        emit("selectionChange", { mode: null, selectedCandidateId: null });
        emit("submit", { action: "pass", deferred: true });
        window.setTimeout(() => {
            busy.value = false;
        }, 220);
        return;
    }
    if (isMeldAction(action)) {
        const entry = normalized.value.find((candidateEntry) => candidateEntry.key === item.key);
        if ((entry?.candidates?.length ?? 0) === 1) {
            busy.value = true;
            const candidateId = entry?.candidates?.[0]?.id ?? "";
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
                __VLS_ctx.onClick(item);
            } },
        key: (item.key),
        'data-testid': (`action-${item.key}`),
        ...{ class: "btn" },
        ...{ class: ({
                enabled: __VLS_ctx.isClickable(item) && __VLS_ctx.canAct,
                selected: __VLS_ctx.selectionMode === item.action,
            }) },
        disabled: (!__VLS_ctx.canAct || !__VLS_ctx.isClickable(item) || __VLS_ctx.busy),
    });
    (__VLS_ctx.text(item));
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
            isClickable: isClickable,
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
