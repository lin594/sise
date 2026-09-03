import { computed, onBeforeUnmount, ref, watch } from "vue";
const props = withDefaults(defineProps(), {
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    currentPlayerName: "-",
    pausedHint: "",
    selectionMode: null,
    selectedCandidateId: null,
    canDiscard: false,
    hasDiscardSelection: false,
    discardPending: false,
    secondsLeft: null,
    untimed: false,
    canRequestMoreTime: false,
    moreTimeSeconds: 20,
    decisionKey: "",
});
const emit = defineEmits();
const busy = ref(false);
const moreTimeRequested = ref(false);
let moreTimeRetryTimer = null;
function clearMoreTimeRetryTimer() {
    if (moreTimeRetryTimer !== null) {
        window.clearTimeout(moreTimeRetryTimer);
        moreTimeRetryTimer = null;
    }
}
watch(() => `${props.decisionKey}|${props.canRequestMoreTime ? "available" : "used"}`, () => {
    const available = props.canRequestMoreTime;
    if (available) {
        clearMoreTimeRetryTimer();
        moreTimeRequested.value = false;
    }
});
function requestMoreTime() {
    if (!props.canRequestMoreTime || moreTimeRequested.value) {
        return;
    }
    moreTimeRequested.value = true;
    emit("requestMoreTime");
    clearMoreTimeRetryTimer();
    moreTimeRetryTimer = window.setTimeout(() => {
        moreTimeRetryTimer = null;
        if (props.canRequestMoreTime) {
            moreTimeRequested.value = false;
        }
    }, 2500);
}
onBeforeUnmount(clearMoreTimeRetryTimer);
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
const panelLocked = computed(() => !props.canAct && !props.canDiscard);
const needsDecision = computed(() => props.canAct || props.canDiscard);
const secondsLeft = computed(() => typeof props.secondsLeft === "number" && Number.isFinite(props.secondsLeft)
    ? Math.max(0, Math.ceil(props.secondsLeft))
    : null);
const isUrgent = computed(() => !props.untimed && needsDecision.value && secondsLeft.value !== null && secondsLeft.value <= 5);
const panelHint = computed(() => {
    if (props.pausedHint) {
        return props.pausedHint;
    }
    if (props.canDiscard) {
        return props.hasDiscardSelection ? "已选好，请点出牌" : "请先选择一张手牌";
    }
    if (!props.canAct) {
        return `${props.currentPlayerName}操作中`;
    }
    if (selectionMode.value) {
        return `已选择${actionText(selectionMode.value)}，请在中间选牌组`;
    }
    const specialChi = normalized.value.find((item) => item.action === "chi" && item.candidates?.some((candidate) => candidate.kind === "single"));
    if (specialChi) {
        if (props.responsePhase === "collective") {
            return (specialChi.candidates?.length ?? 0) > 1
                ? "先选吃法，再等其他玩家响应"
                : "先选收下，再等其他玩家响应";
        }
        return (specialChi.candidates?.length ?? 0) > 1
            ? "请选择吃法，或单独收下"
            : "将和金条不能过，请收下";
    }
    if (props.responsePhase === "collective" && !props.isCurrentTurn) {
        if (normalized.value.some((item) => item.key === "deferred-pass")) {
            return "可胡、开、碰，或先选吃/抓";
        }
        if (normalized.value.some((item) => item.action === "chi" && item.deferred)) {
            return "可先选吃法，其他人响应后生效";
        }
        return "可选择胡、开、碰或过";
    }
    if (props.responsePhase === "local_upper") {
        return "可吃上家牌，或抓一张";
    }
    if (props.responsePhase === "local_draw") {
        return "可吃这张牌，或过给下家";
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
    if (item.action === "chi" &&
        item.candidates?.length === 1 &&
        item.candidates[0]?.kind === "single") {
        return "收下";
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
    pausedHint: "",
    selectionMode: null,
    selectedCandidateId: null,
    canDiscard: false,
    hasDiscardSelection: false,
    discardPending: false,
    secondsLeft: null,
    untimed: false,
    canRequestMoreTime: false,
    moreTimeSeconds: 20,
    decisionKey: "",
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['paused']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['urgent']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['urgent']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['locked']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
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
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['urgent']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel" },
    ...{ class: ({ locked: __VLS_ctx.panelLocked }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "sr-only" },
    role: "status",
    'aria-live': "polite",
});
(__VLS_ctx.pausedHint ? `操作已暂停。${__VLS_ctx.pausedHint}` : __VLS_ctx.needsDecision ? `该你操作了。${__VLS_ctx.untimed ? "练习不限时。" : ""}${__VLS_ctx.panelHint}` : "");
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hint" },
    ...{ class: ({ active: __VLS_ctx.needsDecision, urgent: __VLS_ctx.isUrgent, paused: Boolean(__VLS_ctx.pausedHint) }) },
    'data-urgent': (__VLS_ctx.isUrgent ? 'true' : 'false'),
    'data-testid': "action-guidance",
});
if (__VLS_ctx.pausedHint) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "decision-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
}
else if (__VLS_ctx.needsDecision) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "decision-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.isUrgent ? "抓紧操作" : "该你操作了");
    if (__VLS_ctx.untimed) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({
            ...{ class: "untimed-label" },
        });
    }
    else if (__VLS_ctx.secondsLeft !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (__VLS_ctx.secondsLeft);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "instruction" },
});
(__VLS_ctx.panelHint);
if (__VLS_ctx.needsDecision && __VLS_ctx.canRequestMoreTime) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.requestMoreTime) },
        type: "button",
        ...{ class: "more-time-button" },
        'data-testid': "request-more-time",
        disabled: (__VLS_ctx.moreTimeRequested),
        'aria-label': (`需要更多时间，增加${__VLS_ctx.moreTimeSeconds}秒`),
    });
    (__VLS_ctx.moreTimeRequested ? "正在加时…" : `需要更多时间 +${__VLS_ctx.moreTimeSeconds}秒`);
}
if (__VLS_ctx.pausedHint) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "paused-state" },
        'data-testid': "action-paused",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "paused-symbol" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.pausedHint.includes("立即重试") ? "请点上方重试" : "无需操作，请稍候");
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "actions" },
        ...{ class: ({ 'discard-mode': __VLS_ctx.canDiscard }) },
    });
    if (__VLS_ctx.canDiscard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.pausedHint))
                        return;
                    if (!(__VLS_ctx.canDiscard))
                        return;
                    __VLS_ctx.emit('confirmDiscard');
                } },
            type: "button",
            ...{ class: "btn discard-action" },
            'data-testid': "discard-confirm",
            ...{ class: ({ enabled: __VLS_ctx.hasDiscardSelection && !__VLS_ctx.discardPending }) },
            disabled: (!__VLS_ctx.hasDiscardSelection || __VLS_ctx.discardPending),
        });
        (__VLS_ctx.hasDiscardSelection ? (__VLS_ctx.discardPending ? "出牌中…" : "出牌") : "先选牌");
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.canDiscard ? [] : __VLS_ctx.normalized))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.pausedHint))
                        return;
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
}
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['untimed-label']} */ ;
/** @type {__VLS_StyleScopedClasses['instruction']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['paused-state']} */ ;
/** @type {__VLS_StyleScopedClasses['paused-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['discard-action']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            busy: busy,
            moreTimeRequested: moreTimeRequested,
            requestMoreTime: requestMoreTime,
            normalized: normalized,
            selectionMode: selectionMode,
            panelLocked: panelLocked,
            needsDecision: needsDecision,
            secondsLeft: secondsLeft,
            isUrgent: isUrgent,
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
