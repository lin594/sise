import { computed, onBeforeUnmount, ref, watch } from "vue";
const props = withDefaults(defineProps(), {
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    pausedHint: "",
    selectedChiCandidateId: null,
    canDiscard: false,
    hasDiscardSelection: false,
    discardPending: false,
    secondsLeft: null,
    untimed: false,
    canRequestMoreTime: false,
    moreTimeSeconds: 20,
    decisionKey: "",
    actionFeedback: null,
});
const emit = defineEmits();
const busy = ref(false);
const moreTimeRequested = ref(false);
let moreTimeRetryTimer = null;
const normalized = computed(() => {
    const map = new Map(props.actions.map((entry) => [entry.action, entry]));
    const pass = map.get("pass");
    const isPendingForMe = props.responsePhase === "collective" && Boolean(pass?.enabled && pass.deferred);
    const ordered = ["hu", "kai", "peng", "chi", "pass"]
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
        .filter((item) => item.enabled || item.deferred)
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
    return ordered;
});
const rawActionFeedback = computed(() => props.actionFeedback ?? null);
const actionFeedback = computed(() => {
    const feedback = rawActionFeedback.value;
    if (feedback?.decisionKey && props.decisionKey && feedback.decisionKey !== props.decisionKey) {
        return null;
    }
    if (!feedback || feedback.visible !== false) {
        return feedback;
    }
    return feedback.status === "received" && feedback.decisionKey === props.decisionKey && needsDecision.value
        ? { ...feedback, message: "已收到", visible: true }
        : null;
});
const submissionLocked = computed(() => Boolean(props.decisionKey) && rawActionFeedback.value?.decisionKey === props.decisionKey &&
    (rawActionFeedback.value.status === "pending" || rawActionFeedback.value.status === "received"));
const needsDecision = computed(() => props.canAct || props.canDiscard);
const panelLocked = computed(() => !needsDecision.value);
const showPanel = computed(() => Boolean(props.pausedHint || actionFeedback.value || needsDecision.value));
const isEarlyCollectiveChoice = computed(() => props.canAct && props.responsePhase === "collective" && !props.isCurrentTurn);
const secondsLeft = computed(() => typeof props.secondsLeft === "number" && Number.isFinite(props.secondsLeft)
    ? Math.max(0, Math.ceil(props.secondsLeft))
    : null);
const isUrgent = computed(() => !props.untimed && !isEarlyCollectiveChoice.value && needsDecision.value &&
    secondsLeft.value !== null && secondsLeft.value <= 5);
const timerLabel = computed(() => {
    if (!needsDecision.value || isEarlyCollectiveChoice.value)
        return "";
    if (props.untimed)
        return "不限时";
    return secondsLeft.value === null ? "" : `${secondsLeft.value}s`;
});
const timerAccessibleLabel = computed(() => props.untimed ? "练习不限时" : secondsLeft.value === null ? "" : `还剩${secondsLeft.value}秒`);
const panelAnnouncement = computed(() => {
    if (actionFeedback.value)
        return actionFeedback.value.message;
    if (props.pausedHint)
        return `操作已暂停。${props.pausedHint}`;
    if (isEarlyCollectiveChoice.value)
        return "现在可以先选，等待轮到你时结算。";
    const timing = props.untimed
        ? "练习不限时。"
        : secondsLeft.value === null || isEarlyCollectiveChoice.value
            ? ""
            : `还剩 ${secondsLeft.value} 秒。`;
    if (props.canDiscard)
        return `该你操作了。${timing}可先选择手牌，再按出。`;
    if (normalized.value.some((item) => item.action === "chi")) {
        return `该你操作了。${timing}可以直接选择手牌组成吃法，再按吃。`;
    }
    return needsDecision.value ? `该你操作了。${timing}` : "";
});
function clearMoreTimeRetryTimer() {
    if (moreTimeRetryTimer !== null) {
        window.clearTimeout(moreTimeRetryTimer);
        moreTimeRetryTimer = null;
    }
}
watch(() => `${props.decisionKey}|${props.canRequestMoreTime ? "available" : "used"}`, () => {
    if (props.canRequestMoreTime) {
        clearMoreTimeRetryTimer();
        moreTimeRequested.value = false;
    }
});
function requestMoreTime() {
    if (!props.canRequestMoreTime || moreTimeRequested.value)
        return;
    moreTimeRequested.value = true;
    emit("requestMoreTime");
    clearMoreTimeRetryTimer();
    moreTimeRetryTimer = window.setTimeout(() => {
        moreTimeRetryTimer = null;
        if (props.canRequestMoreTime)
            moreTimeRequested.value = false;
    }, 2500);
}
function isClickable(item) {
    return item.enabled || Boolean(item.deferred);
}
function isActionEnabled(item) {
    if (!props.canAct || busy.value || submissionLocked.value || !isClickable(item))
        return false;
    if (item.action !== "chi" || !item.candidates?.length)
        return true;
    return Boolean(props.selectedChiCandidateId && item.candidates.some((candidate) => candidate.id === props.selectedChiCandidateId));
}
function actionText(item) {
    if (item.deferredKind === "pass" || (item.action === "pass" && props.responsePhase === "local_upper")) {
        return "抓";
    }
    return { hu: "胡", kai: "开", peng: "碰", chi: "吃", pass: "过" }[item.action];
}
function actionAccessibleLabel(item) {
    if (item.action === "chi" && !isActionEnabled(item))
        return "吃，请先直接选择组成吃法的手牌";
    return actionText(item);
}
function onClick(item) {
    if (!isActionEnabled(item))
        return;
    busy.value = true;
    if (item.deferredKind === "pass") {
        emit("submit", { action: "pass", deferred: true });
    }
    else if (item.action === "chi") {
        emit("submit", { action: "chi", candidateId: props.selectedChiCandidateId ?? undefined });
    }
    else if ((item.action === "kai" || item.action === "peng") && item.candidates?.length) {
        emit("submit", { action: item.action, candidateId: item.candidates[0].id });
    }
    else {
        emit("submit", item.action);
    }
    window.setTimeout(() => {
        busy.value = false;
    }, 220);
}
onBeforeUnmount(clearMoreTimeRetryTimer);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    pausedHint: "",
    selectedChiCandidateId: null,
    canDiscard: false,
    hasDiscardSelection: false,
    discardPending: false,
    secondsLeft: null,
    untimed: false,
    canRequestMoreTime: false,
    moreTimeSeconds: 20,
    decisionKey: "",
    actionFeedback: null,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-status']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['timer-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-status']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['feedback-chip']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel" },
    ...{ class: ({ locked: __VLS_ctx.panelLocked, empty: !__VLS_ctx.showPanel }) },
});
if (__VLS_ctx.showPanel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sr-only" },
        role: (__VLS_ctx.actionFeedback?.status === 'rejected' ? 'alert' : 'status'),
        'aria-live': (__VLS_ctx.actionFeedback?.status === 'rejected' ? 'assertive' : 'polite'),
        'data-testid': "action-guidance",
        'data-urgent': (__VLS_ctx.isUrgent ? 'true' : 'false'),
    });
    (__VLS_ctx.panelAnnouncement);
    if (__VLS_ctx.pausedHint) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "compact-status" },
            'data-testid': "action-paused",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.pausedHint);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-row" },
            'data-testid': "action-row",
        });
        if (__VLS_ctx.timerLabel && !__VLS_ctx.canRequestMoreTime) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "timer-chip" },
                ...{ class: ({ urgent: __VLS_ctx.isUrgent }) },
                'data-testid': "action-timer",
                'aria-label': (__VLS_ctx.timerAccessibleLabel),
            });
            (__VLS_ctx.timerLabel);
        }
        if (__VLS_ctx.canDiscard) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.showPanel))
                            return;
                        if (!!(__VLS_ctx.pausedHint))
                            return;
                        if (!(__VLS_ctx.canDiscard))
                            return;
                        __VLS_ctx.emit('confirmDiscard');
                    } },
                type: "button",
                ...{ class: "btn primary-action" },
                'data-testid': "discard-confirm",
                ...{ class: ({ enabled: __VLS_ctx.hasDiscardSelection && !__VLS_ctx.discardPending && !__VLS_ctx.submissionLocked }) },
                disabled: (!__VLS_ctx.hasDiscardSelection || __VLS_ctx.discardPending || __VLS_ctx.submissionLocked),
                'aria-label': (__VLS_ctx.discardPending ? '正在出牌' : '出牌'),
            });
        }
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.canDiscard ? [] : __VLS_ctx.normalized))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.showPanel))
                            return;
                        if (!!(__VLS_ctx.pausedHint))
                            return;
                        __VLS_ctx.onClick(item);
                    } },
                key: (item.key),
                type: "button",
                'data-testid': (`action-${item.key}`),
                ...{ class: "btn" },
                ...{ class: ({ enabled: __VLS_ctx.isActionEnabled(item), 'primary-action': item.action === 'chi' }) },
                disabled: (!__VLS_ctx.isActionEnabled(item)),
                'aria-label': (__VLS_ctx.actionAccessibleLabel(item)),
            });
            (__VLS_ctx.actionText(item));
        }
        if (__VLS_ctx.needsDecision && !__VLS_ctx.isEarlyCollectiveChoice && __VLS_ctx.canRequestMoreTime) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.requestMoreTime) },
                type: "button",
                ...{ class: "more-time-button" },
                'data-testid': "request-more-time",
                disabled: (__VLS_ctx.moreTimeRequested),
                'aria-label': (`需要更多时间，增加${__VLS_ctx.moreTimeSeconds}秒`),
            });
            (__VLS_ctx.moreTimeRequested ? "…" : `+${__VLS_ctx.moreTimeSeconds}`);
        }
        if (__VLS_ctx.actionFeedback) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "feedback-chip" },
                ...{ class: (`feedback-${__VLS_ctx.actionFeedback.status}`) },
                'data-testid': "action-feedback",
                'data-status': (__VLS_ctx.actionFeedback.status),
            });
            (__VLS_ctx.actionFeedback.message);
        }
    }
}
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-status']} */ ;
/** @type {__VLS_StyleScopedClasses['action-row']} */ ;
/** @type {__VLS_StyleScopedClasses['timer-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-action']} */ ;
/** @type {__VLS_StyleScopedClasses['btn']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['feedback-chip']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            moreTimeRequested: moreTimeRequested,
            normalized: normalized,
            actionFeedback: actionFeedback,
            submissionLocked: submissionLocked,
            needsDecision: needsDecision,
            panelLocked: panelLocked,
            showPanel: showPanel,
            isEarlyCollectiveChoice: isEarlyCollectiveChoice,
            isUrgent: isUrgent,
            timerLabel: timerLabel,
            timerAccessibleLabel: timerAccessibleLabel,
            panelAnnouncement: panelAnnouncement,
            requestMoreTime: requestMoreTime,
            isActionEnabled: isActionEnabled,
            actionText: actionText,
            actionAccessibleLabel: actionAccessibleLabel,
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
