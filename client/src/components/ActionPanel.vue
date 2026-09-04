<template>
  <div class="panel" :class="{ locked: panelLocked, empty: !showPanel }">
    <template v-if="showPanel">
    <span
      class="sr-only"
      :role="actionFeedback?.status === 'rejected' ? 'alert' : 'status'"
      :aria-live="actionFeedback?.status === 'rejected' ? 'assertive' : 'polite'"
      data-testid="action-guidance"
      :data-urgent="isUrgent ? 'true' : 'false'"
    >
      {{ panelAnnouncement }}
    </span>

    <div v-if="pausedHint" class="compact-status" data-testid="action-paused">
      <span aria-hidden="true">↻</span>
      <strong>{{ pausedHint }}</strong>
    </div>

    <div v-else class="action-row" data-testid="action-row">
      <span
        v-if="timerLabel"
        class="timer-chip"
        :class="{ urgent: isUrgent }"
        data-testid="action-timer"
        :aria-label="timerAccessibleLabel"
      >{{ timerLabel }}</span>

      <button
        v-if="canDiscard"
        type="button"
        class="btn primary-action"
        data-testid="discard-confirm"
        :class="{ enabled: hasDiscardSelection && !discardPending && !submissionLocked }"
        :disabled="!hasDiscardSelection || discardPending || submissionLocked"
        :aria-label="discardPending ? '正在出牌' : '出牌'"
        @click="emit('confirmDiscard')"
      >出</button>

      <button
        v-for="item in canDiscard ? [] : normalized"
        :key="item.key"
        type="button"
        :data-testid="`action-${item.key}`"
        class="btn"
        :class="{ enabled: isActionEnabled(item), 'primary-action': item.action === 'chi' }"
        :disabled="!isActionEnabled(item)"
        :aria-label="actionAccessibleLabel(item)"
        @click="onClick(item)"
      >{{ actionText(item) }}</button>

      <button
        v-if="needsDecision && !isEarlyCollectiveChoice && canRequestMoreTime"
        type="button"
        class="more-time-button"
        data-testid="request-more-time"
        :disabled="moreTimeRequested"
        :aria-label="`需要更多时间，增加${moreTimeSeconds}秒`"
        @click.stop="requestMoreTime"
      >{{ moreTimeRequested ? "…" : `+${moreTimeSeconds}` }}</button>

      <span
        v-if="actionFeedback"
        class="feedback-chip"
        :class="`feedback-${actionFeedback.status}`"
        data-testid="action-feedback"
        :data-status="actionFeedback.status"
      >{{ actionFeedback.message }}</span>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ActionFeedback, ActionRequest, ActionType, AvailableAction } from "@/types/game";

const props = withDefaults(
  defineProps<{
    actions: AvailableAction[];
    canAct?: boolean;
    isCurrentTurn?: boolean;
    responsePhase?: string;
    pausedHint?: string;
    selectedChiCandidateId?: string | null;
    canDiscard?: boolean;
    hasDiscardSelection?: boolean;
    discardPending?: boolean;
    secondsLeft?: number | null;
    untimed?: boolean;
    canRequestMoreTime?: boolean;
    moreTimeSeconds?: number;
    decisionKey?: string;
    actionFeedback?: ActionFeedback | null;
  }>(),
  {
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
  },
);

const emit = defineEmits<{
  submit: [request: ActionRequest];
  confirmDiscard: [];
  requestMoreTime: [];
}>();

type PanelAction = {
  key: string;
  action: ActionType;
  enabled: boolean;
  deferred?: boolean;
  deferredKind?: "pass";
  candidates: AvailableAction["candidates"];
};

const busy = ref(false);
const moreTimeRequested = ref(false);
let moreTimeRetryTimer: number | null = null;

const normalized = computed<PanelAction[]>(() => {
  const map = new Map(props.actions.map((entry) => [entry.action, entry]));
  const pass = map.get("pass");
  const isPendingForMe = props.responsePhase === "collective" && Boolean(pass?.enabled && pass.deferred);
  const ordered: PanelAction[] = (["hu", "kai", "peng", "chi", "pass"] as ActionType[])
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
const actionFeedback = computed<ActionFeedback | null>(() => {
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
const submissionLocked = computed(
  () => Boolean(props.decisionKey) && rawActionFeedback.value?.decisionKey === props.decisionKey &&
    (rawActionFeedback.value.status === "pending" || rawActionFeedback.value.status === "received"),
);
const needsDecision = computed(() => props.canAct || props.canDiscard);
const panelLocked = computed(() => !needsDecision.value);
const showPanel = computed(() => Boolean(props.pausedHint || actionFeedback.value || needsDecision.value));
const isEarlyCollectiveChoice = computed(
  () => props.canAct && props.responsePhase === "collective" && !props.isCurrentTurn,
);
const secondsLeft = computed<number | null>(() =>
  typeof props.secondsLeft === "number" && Number.isFinite(props.secondsLeft)
    ? Math.max(0, Math.ceil(props.secondsLeft))
    : null,
);
const isUrgent = computed(
  () => !props.untimed && !isEarlyCollectiveChoice.value && needsDecision.value &&
    secondsLeft.value !== null && secondsLeft.value <= 5,
);
const timerLabel = computed(() => {
  if (!needsDecision.value || isEarlyCollectiveChoice.value) return "";
  if (props.untimed) return "不限时";
  return secondsLeft.value === null ? "" : `${secondsLeft.value}s`;
});
const timerAccessibleLabel = computed(() =>
  props.untimed ? "练习不限时" : secondsLeft.value === null ? "" : `还剩${secondsLeft.value}秒`,
);
const panelAnnouncement = computed(() => {
  if (actionFeedback.value) return actionFeedback.value.message;
  if (props.pausedHint) return `操作已暂停。${props.pausedHint}`;
  if (isEarlyCollectiveChoice.value) return "现在可以先选，等待轮到你时结算。";
  const timing = props.untimed
    ? "练习不限时。"
    : secondsLeft.value === null || isEarlyCollectiveChoice.value
      ? ""
      : `还剩 ${secondsLeft.value} 秒。`;
  if (props.canDiscard) return `该你操作了。${timing}可先选择手牌，再按出。`;
  if (normalized.value.some((item) => item.action === "chi")) {
    return `该你操作了。${timing}可以直接选择手牌组成吃法，再按吃。`;
  }
  return needsDecision.value ? `该你操作了。${timing}` : "";
});

function clearMoreTimeRetryTimer(): void {
  if (moreTimeRetryTimer !== null) {
    window.clearTimeout(moreTimeRetryTimer);
    moreTimeRetryTimer = null;
  }
}

watch(
  () => `${props.decisionKey}|${props.canRequestMoreTime ? "available" : "used"}`,
  () => {
    if (props.canRequestMoreTime) {
      clearMoreTimeRetryTimer();
      moreTimeRequested.value = false;
    }
  },
);

function requestMoreTime(): void {
  if (!props.canRequestMoreTime || moreTimeRequested.value) return;
  moreTimeRequested.value = true;
  emit("requestMoreTime");
  clearMoreTimeRetryTimer();
  moreTimeRetryTimer = window.setTimeout(() => {
    moreTimeRetryTimer = null;
    if (props.canRequestMoreTime) moreTimeRequested.value = false;
  }, 2500);
}

function isClickable(item: PanelAction): boolean {
  return item.enabled || Boolean(item.deferred);
}

function isActionEnabled(item: PanelAction): boolean {
  if (!props.canAct || busy.value || submissionLocked.value || !isClickable(item)) return false;
  if (item.action !== "chi" || !item.candidates?.length) return true;
  return Boolean(
    props.selectedChiCandidateId && item.candidates.some((candidate) => candidate.id === props.selectedChiCandidateId),
  );
}

function actionText(item: PanelAction): string {
  if (item.deferredKind === "pass" || (item.action === "pass" && props.responsePhase === "local_upper")) {
    return "抓";
  }
  return ({ hu: "胡", kai: "开", peng: "碰", chi: "吃", pass: "过" } as Record<ActionType, string>)[item.action];
}

function actionAccessibleLabel(item: PanelAction): string {
  if (item.action === "chi" && !isActionEnabled(item)) return "吃，请先直接选择组成吃法的手牌";
  return actionText(item);
}

function onClick(item: PanelAction): void {
  if (!isActionEnabled(item)) return;
  busy.value = true;
  if (item.deferredKind === "pass") {
    emit("submit", { action: "pass", deferred: true });
  } else if (item.action === "chi") {
    emit("submit", { action: "chi", candidateId: props.selectedChiCandidateId ?? undefined });
  } else if ((item.action === "kai" || item.action === "peng") && item.candidates?.length) {
    emit("submit", { action: item.action, candidateId: item.candidates[0]!.id });
  } else {
    emit("submit", item.action);
  }
  window.setTimeout(() => {
    busy.value = false;
  }, 220);
}

onBeforeUnmount(clearMoreTimeRetryTimer);
</script>

<style scoped>
.panel {
  min-height: 0;
  padding: clamp(0.28rem, 0.8vh, 0.5rem);
  border-top: 1px solid #1e293b;
  background: #0f172a;
}

.panel.locked {
  background: #0b1220;
}

.panel.empty {
  visibility: hidden;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.action-row,
.compact-status {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.3rem, 0.8vw, 0.55rem);
  overflow: hidden;
}

.compact-status {
  color: #fde68a;
  font-size: clamp(0.78rem, 1.5vh, 0.92rem);
}

.btn,
.more-time-button {
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 44px;
  border: 1px solid #475569;
  border-radius: 0.68rem;
  background: #1e293b;
  color: #f8fafc;
  font-size: clamp(1rem, 2.7vh, 1.25rem);
  font-weight: 900;
}

.btn.enabled {
  border-color: #38bdf8;
  background: #075985;
  cursor: pointer;
}

.btn.primary-action.enabled {
  border-color: #f59e0b;
  background: #b45309;
}

.btn:disabled,
.more-time-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.btn:focus-visible,
.more-time-button:focus-visible {
  outline: 3px solid #bae6fd;
  outline-offset: 2px;
}

.timer-chip,
.feedback-chip {
  flex: 0 1 auto;
  max-width: min(12rem, 35vw);
  min-height: 32px;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #dbeafe;
  background: #172554;
  font-size: clamp(0.72rem, 1.55vh, 0.88rem);
  font-weight: 800;
}

.timer-chip.urgent,
.feedback-rejected {
  color: #fee2e2;
  background: #7f1d1d;
}

.feedback-received {
  color: #dcfce7;
  background: #14532d;
}

.more-time-button {
  min-width: 48px;
  padding-inline: 0.4rem;
  color: #fef3c7;
  border-color: #92400e;
  background: #451a03;
  font-size: clamp(0.75rem, 1.7vh, 0.9rem);
}

@media (max-height: 390px) {
  .panel {
    padding: 0.2rem 0.28rem;
  }

  .action-row,
  .compact-status {
    min-height: 40px;
    gap: 0.28rem;
  }

  .btn,
  .more-time-button {
    min-width: 40px;
    min-height: 40px;
    border-radius: 0.58rem;
  }

  .feedback-chip {
    max-width: 28vw;
  }
}
</style>
