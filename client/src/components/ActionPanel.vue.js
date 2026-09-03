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
    selectedDiscardCardLabel: "",
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
const rawActionFeedback = computed(() => props.actionFeedback ?? null);
const actionFeedback = computed(() => rawActionFeedback.value?.visible === false ? null : rawActionFeedback.value);
const submissionLocked = computed(() => Boolean(props.decisionKey) &&
    rawActionFeedback.value?.decisionKey === props.decisionKey &&
    (rawActionFeedback.value.status === "pending" || rawActionFeedback.value.status === "received"));
const panelLocked = computed(() => !props.canAct && !props.canDiscard);
const needsDecision = computed(() => props.canAct || props.canDiscard);
const selectedDiscardLabel = computed(() => props.selectedDiscardCardLabel.trim());
const discardButtonText = computed(() => {
    if (!props.hasDiscardSelection) {
        return "先选牌";
    }
    if (!selectedDiscardLabel.value) {
        return props.discardPending ? "出牌中…" : "出牌";
    }
    return props.discardPending
        ? `正在打出${selectedDiscardLabel.value}`
        : `打出${selectedDiscardLabel.value}`;
});
const isEarlyCollectiveChoice = computed(() => props.canAct && props.responsePhase === "collective" && !props.isCurrentTurn);
const waitingHeadline = computed(() => {
    const playerName = props.currentPlayerName.trim();
    const conciseName = playerName.replace(/（(?:机器人|电脑)）$/u, "");
    return conciseName && conciseName !== "-" ? `${conciseName}正在操作` : "等待其他玩家";
});
const waitingAnnouncement = computed(() => {
    const playerName = props.currentPlayerName.trim();
    const headline = playerName && playerName !== "-" ? `${playerName}正在操作` : "等待其他玩家";
    return `${headline}。轮到你时会提醒`;
});
const secondsLeft = computed(() => typeof props.secondsLeft === "number" && Number.isFinite(props.secondsLeft)
    ? Math.max(0, Math.ceil(props.secondsLeft))
    : null);
const isUrgent = computed(() => !props.untimed &&
    !isEarlyCollectiveChoice.value &&
    needsDecision.value &&
    secondsLeft.value !== null &&
    secondsLeft.value <= 5);
const panelHint = computed(() => {
    if (props.pausedHint) {
        return props.pausedHint;
    }
    if (props.canDiscard) {
        if (!props.hasDiscardSelection) {
            return "请先选择一张手牌";
        }
        return selectedDiscardLabel.value
            ? `已选${selectedDiscardLabel.value}，再点按钮确认`
            : "已选好，请点出牌";
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
            return "先选吃法，再等其他玩家响应";
        }
        return (specialChi.candidates?.length ?? 0) > 1
            ? "请选择一种吃法"
            : "这张牌不能过，请点吃";
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
    selectedDiscardCardLabel: "",
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
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['paused']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['feedback']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-copy']} */ ;
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
/** @type {__VLS_StyleScopedClasses['waiting-state']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-copy']} */ ;
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
    role: (__VLS_ctx.actionFeedback?.status === 'rejected' ? 'alert' : 'status'),
    'aria-live': (__VLS_ctx.actionFeedback?.status === 'rejected' ? 'assertive' : 'polite'),
});
(__VLS_ctx.actionFeedback?.message || (__VLS_ctx.pausedHint ? `操作已暂停。${__VLS_ctx.pausedHint}` : __VLS_ctx.needsDecision ? `${__VLS_ctx.isEarlyCollectiveChoice ? "现在可以先选。" : "该你操作了。"}${__VLS_ctx.untimed && !__VLS_ctx.isEarlyCollectiveChoice ? "练习不限时。" : ""}${__VLS_ctx.panelHint}` : ""));
if (__VLS_ctx.actionFeedback || __VLS_ctx.pausedHint || __VLS_ctx.needsDecision) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hint" },
        ...{ class: ([
                { active: __VLS_ctx.needsDecision, urgent: __VLS_ctx.isUrgent, paused: Boolean(__VLS_ctx.pausedHint), feedback: Boolean(__VLS_ctx.actionFeedback) },
                __VLS_ctx.actionFeedback ? `feedback-${__VLS_ctx.actionFeedback.status}` : '',
            ]) },
        'data-urgent': (__VLS_ctx.isUrgent ? 'true' : 'false'),
        'data-testid': "action-guidance",
    });
    if (__VLS_ctx.actionFeedback) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "decision-line action-feedback" },
            'data-testid': "action-feedback",
            'data-status': (__VLS_ctx.actionFeedback.status),
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.actionFeedback.message);
    }
    else if (__VLS_ctx.pausedHint) {
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
        (__VLS_ctx.isEarlyCollectiveChoice ? "现在可以先选" : __VLS_ctx.isUrgent ? "抓紧操作" : "该你操作了");
        if (__VLS_ctx.untimed && !__VLS_ctx.isEarlyCollectiveChoice) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({
                ...{ class: "untimed-label" },
            });
        }
        else if (!__VLS_ctx.isEarlyCollectiveChoice && __VLS_ctx.secondsLeft !== null) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
            (__VLS_ctx.secondsLeft);
        }
    }
    if (!__VLS_ctx.actionFeedback) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "instruction" },
        });
        (__VLS_ctx.panelHint);
    }
    if (!__VLS_ctx.actionFeedback && __VLS_ctx.needsDecision && !__VLS_ctx.isEarlyCollectiveChoice && __VLS_ctx.canRequestMoreTime) {
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
else if (!__VLS_ctx.needsDecision) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "waiting-state" },
        'data-testid': "action-waiting",
        role: "status",
        'aria-live': "polite",
        'aria-label': (__VLS_ctx.waitingAnnouncement),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "waiting-symbol" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "waiting-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.waitingHeadline);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
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
                    if (!!(!__VLS_ctx.needsDecision))
                        return;
                    if (!(__VLS_ctx.canDiscard))
                        return;
                    __VLS_ctx.emit('confirmDiscard');
                } },
            type: "button",
            ...{ class: "btn discard-action" },
            'data-testid': "discard-confirm",
            ...{ class: ({ enabled: __VLS_ctx.hasDiscardSelection && !__VLS_ctx.discardPending && !__VLS_ctx.submissionLocked }) },
            disabled: (!__VLS_ctx.hasDiscardSelection || __VLS_ctx.discardPending || __VLS_ctx.submissionLocked),
            'aria-label': (__VLS_ctx.discardButtonText),
        });
        (__VLS_ctx.discardButtonText);
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.canDiscard ? [] : __VLS_ctx.normalized))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.pausedHint))
                        return;
                    if (!!(!__VLS_ctx.needsDecision))
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
            disabled: (!__VLS_ctx.canAct || !__VLS_ctx.isClickable(item) || __VLS_ctx.busy || __VLS_ctx.submissionLocked),
        });
        (__VLS_ctx.text(item));
    }
}
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['action-feedback']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['decision-line']} */ ;
/** @type {__VLS_StyleScopedClasses['untimed-label']} */ ;
/** @type {__VLS_StyleScopedClasses['instruction']} */ ;
/** @type {__VLS_StyleScopedClasses['more-time-button']} */ ;
/** @type {__VLS_StyleScopedClasses['paused-state']} */ ;
/** @type {__VLS_StyleScopedClasses['paused-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-state']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-symbol']} */ ;
/** @type {__VLS_StyleScopedClasses['waiting-copy']} */ ;
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
            actionFeedback: actionFeedback,
            submissionLocked: submissionLocked,
            panelLocked: panelLocked,
            needsDecision: needsDecision,
            discardButtonText: discardButtonText,
            isEarlyCollectiveChoice: isEarlyCollectiveChoice,
            waitingHeadline: waitingHeadline,
            waitingAnnouncement: waitingAnnouncement,
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
