<template>
  <div class="panel" :class="{ locked: panelLocked }">
    <span
      class="sr-only"
      :role="actionFeedback?.status === 'rejected' ? 'alert' : 'status'"
      :aria-live="actionFeedback?.status === 'rejected' ? 'assertive' : 'polite'"
    >
      {{ actionFeedback?.message || (pausedHint ? `操作已暂停。${pausedHint}` : needsDecision ? `${isEarlyCollectiveChoice ? "现在可以先选。" : "该你操作了。"}${untimed && !isEarlyCollectiveChoice ? "练习不限时。" : ""}${panelHint}` : "") }}
    </span>
    <div
      v-if="actionFeedback || pausedHint || needsDecision"
      class="hint"
      :class="[
        { active: needsDecision, urgent: isUrgent, paused: Boolean(pausedHint), feedback: Boolean(actionFeedback) },
        actionFeedback ? `feedback-${actionFeedback.status}` : '',
      ]"
      :data-urgent="isUrgent ? 'true' : 'false'"
      data-testid="action-guidance"
    >
      <span
        v-if="actionFeedback"
        class="decision-line action-feedback"
        data-testid="action-feedback"
        :data-status="actionFeedback.status"
        aria-hidden="true"
      >
        <strong>{{ actionFeedback.message }}</strong>
      </span>
      <span v-else-if="pausedHint" class="decision-line">
        <strong>操作已暂停</strong>
      </span>
      <span v-else-if="needsDecision" class="decision-line">
        <strong>{{ isEarlyCollectiveChoice ? "现在可以先选" : isUrgent ? "抓紧操作" : "该你操作了" }}</strong>
        <b v-if="untimed && !isEarlyCollectiveChoice" class="untimed-label">练习不限时</b>
        <b v-else-if="!isEarlyCollectiveChoice && secondsLeft !== null">还剩 {{ secondsLeft }} 秒</b>
      </span>
      <span v-if="!actionFeedback" class="instruction">{{ panelHint }}</span>
      <button
        v-if="!actionFeedback && needsDecision && !isEarlyCollectiveChoice && canRequestMoreTime"
        type="button"
        class="more-time-button"
        data-testid="request-more-time"
        :disabled="moreTimeRequested"
        :aria-label="`需要更多时间，增加${moreTimeSeconds}秒`"
        @click.stop="requestMoreTime"
      >
        {{ moreTimeRequested ? "正在加时…" : `需要更多时间 +${moreTimeSeconds}秒` }}
      </button>
    </div>
    <div v-if="pausedHint" class="paused-state" data-testid="action-paused">
      <span class="paused-symbol" aria-hidden="true">↻</span>
      <strong>{{ pausedHint.includes("立即重试") ? "请点上方重试" : "无需操作，请稍候" }}</strong>
    </div>
    <div
      v-else-if="!needsDecision && !actionFeedback"
      class="waiting-state"
      data-testid="action-waiting"
      role="status"
      aria-live="polite"
      :aria-label="waitingAnnouncement"
    >
      <span class="waiting-symbol" aria-hidden="true">···</span>
      <span class="waiting-copy">
        <strong>{{ waitingHeadline }}</strong>
        <small>轮到你时会提醒</small>
      </span>
    </div>
    <div v-else-if="needsDecision" class="actions" :class="{ 'discard-mode': canDiscard }">
      <button
        v-if="canDiscard"
        type="button"
        class="btn discard-action"
        data-testid="discard-confirm"
        :class="{ enabled: hasDiscardSelection && !discardPending && !submissionLocked }"
        :disabled="!hasDiscardSelection || discardPending || submissionLocked"
        :aria-label="discardButtonText"
        @click="emit('confirmDiscard')"
      >
        {{ discardButtonText }}
      </button>
      <button
        v-for="item in canDiscard ? [] : normalized"
        :key="item.key"
        :data-testid="`action-${item.key}`"
        class="btn"
        :class="{
          enabled: isClickable(item) && canAct,
          selected: selectionMode === item.action,
        }"
        :disabled="!canAct || !isClickable(item) || busy || submissionLocked"
        @click="onClick(item)"
      >
        {{ text(item) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ActionFeedback, ActionRequest, ActionType, AvailableAction } from "@/types/game";

type SelectionMode = "kai" | "peng" | "chi" | null;

const props = withDefaults(
  defineProps<{
    actions: AvailableAction[];
    canAct?: boolean;
    isCurrentTurn?: boolean;
    responsePhase?: string;
    currentPlayerName?: string;
    pausedHint?: string;
    selectionMode?: SelectionMode;
    selectedCandidateId?: string | null;
    canDiscard?: boolean;
    hasDiscardSelection?: boolean;
    selectedDiscardCardLabel?: string;
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
  },
);

const emit = defineEmits<{
  submit: [request: ActionRequest];
  confirmDiscard: [];
  requestMoreTime: [];
  selectionChange: [payload: { mode: SelectionMode; selectedCandidateId: string | null }];
}>();

const busy = ref(false);
const moreTimeRequested = ref(false);
let moreTimeRetryTimer: number | null = null;

function clearMoreTimeRetryTimer(): void {
  if (moreTimeRetryTimer !== null) {
    window.clearTimeout(moreTimeRetryTimer);
    moreTimeRetryTimer = null;
  }
}

watch(
  () => `${props.decisionKey}|${props.canRequestMoreTime ? "available" : "used"}`,
  () => {
    const available = props.canRequestMoreTime;
    if (available) {
      clearMoreTimeRetryTimer();
      moreTimeRequested.value = false;
    }
  },
);

function requestMoreTime(): void {
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

const defaultOrder: ActionType[] = ["hu", "kai", "peng", "chi", "pass"];
type PanelAction = {
  key: string;
  action: ActionType;
  enabled: boolean;
  deferred?: boolean;
  deferredKind?: "pass";
  candidates: AvailableAction["candidates"];
};
const normalized = computed(() => {
  const map = new Map(props.actions.map((x) => [x.action, x]));
  const isCollective = props.responsePhase === "collective";
  const pass = map.get("pass");
  const isPendingForMe = isCollective && Boolean(pass?.enabled && pass.deferred);
  const ordered: PanelAction[] = defaultOrder
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

const selectionMode = computed<SelectionMode>(() => props.selectionMode ?? null);
const rawActionFeedback = computed(() => props.actionFeedback ?? null);
const actionFeedback = computed<ActionFeedback | null>(() => {
  const feedback = rawActionFeedback.value;
  if (!feedback || feedback.visible !== false) {
    return feedback;
  }
  if (feedback.status === "received" && feedback.decisionKey === props.decisionKey) {
    return { ...feedback, message: "操作已收到，等待牌局继续。", visible: true };
  }
  return null;
});
const submissionLocked = computed(
  () =>
    Boolean(props.decisionKey) &&
    rawActionFeedback.value?.decisionKey === props.decisionKey &&
    (rawActionFeedback.value.status === "pending" || rawActionFeedback.value.status === "received"),
);
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
const isEarlyCollectiveChoice = computed(
  () => props.canAct && props.responsePhase === "collective" && !props.isCurrentTurn,
);
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
const secondsLeft = computed<number | null>(() =>
  typeof props.secondsLeft === "number" && Number.isFinite(props.secondsLeft)
    ? Math.max(0, Math.ceil(props.secondsLeft))
    : null,
);
const isUrgent = computed(
  () =>
    !props.untimed &&
    !isEarlyCollectiveChoice.value &&
    needsDecision.value &&
    secondsLeft.value !== null &&
    secondsLeft.value <= 5,
);

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
  const specialChi = normalized.value.find(
    (item) => item.action === "chi" && item.candidates?.some((candidate) => candidate.kind === "single"),
  );
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

function isMeldAction(action: ActionType): action is Exclude<SelectionMode, null> {
  return action === "kai" || action === "peng" || action === "chi";
}

function isClickable(item: { enabled: boolean; deferred?: boolean }): boolean {
  return item.enabled || Boolean(item.deferred);
}

function actionText(action: ActionType): string {
  if (action === "pass" && props.responsePhase === "local_upper") {
    return "抓";
  }
  const map: Record<ActionType, string> = {
    hu: "胡",
    kai: "开",
    chi: "吃",
    pass: "过",
    peng: "碰",
  };
  return map[action];
}

function text(item: PanelAction): string {
  if (item.deferredKind === "pass") {
    return "抓";
  }
  return actionText(item.action);
}

function onClick(item: PanelAction): void {
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
    } else {
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
</script>

<style scoped>
.panel {
  display: grid;
  gap: clamp(0.3rem, 0.8vh, 0.55rem);
  padding: clamp(0.35rem, 1vh, 0.6rem);
  background: #0f172a;
  border-top: 1px solid #1e293b;
  min-height: 0;
}

.panel.locked {
  background: #0b1220;
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

.hint {
  margin: 0;
  min-width: 0;
  min-height: 1.35rem;
  padding: 0.12rem 0.3rem;
  border: 1px solid transparent;
  border-radius: 0.55rem;
  text-align: center;
  color: #93c5fd;
  font-size: clamp(0.66rem, 1.5vh, 0.9rem);
  line-height: 1.15;
  display: grid;
  gap: 0.12rem;
  align-content: center;
}

.hint.active {
  border-color: rgba(250, 204, 21, 0.58);
  background: rgba(113, 63, 18, 0.32);
  color: #fef3c7;
}

.hint.paused {
  border-color: rgba(251, 113, 133, 0.72);
  background: rgba(127, 29, 29, 0.42);
  color: #ffe4e6;
}

.hint.paused .decision-line strong {
  color: #fecdd3;
}

.hint.feedback {
  border-color: rgba(125, 211, 252, 0.75);
  background: rgba(7, 89, 133, 0.48);
  color: #e0f2fe;
}

.hint.feedback-received {
  border-color: rgba(134, 239, 172, 0.78);
  background: rgba(20, 83, 45, 0.58);
}

.hint.feedback-rejected {
  border-color: rgba(253, 164, 175, 0.9);
  background: rgba(127, 29, 29, 0.68);
}

.hint.feedback .action-feedback strong {
  color: #f8fafc;
  white-space: normal;
}

.paused-state {
  min-height: clamp(2.55rem, 6.2vh, 3.9rem);
  padding: 0.3rem 0.45rem;
  border: 1px solid rgba(251, 113, 133, 0.58);
  border-radius: clamp(0.45rem, 0.9vh, 0.8rem);
  background: rgba(69, 10, 10, 0.48);
  color: #fff1f2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  text-align: center;
  font-size: clamp(0.8rem, 1.8vh, 0.98rem);
}

.paused-symbol {
  flex: 0 0 auto;
  font-size: 1.15em;
}

.waiting-state {
  min-height: clamp(3.4rem, 9vh, 5rem);
  padding: 0.45rem 0.55rem;
  border: 1px solid #334155;
  border-radius: clamp(0.45rem, 0.9vh, 0.8rem);
  background: #111c2e;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  text-align: left;
}

.waiting-symbol {
  flex: 0 0 auto;
  color: #7dd3fc;
  font-size: clamp(1.05rem, 2.5vh, 1.35rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1;
}

.waiting-copy {
  min-width: 0;
  display: grid;
  gap: 0.18rem;
}

.waiting-copy strong {
  color: #f8fafc;
  font-size: clamp(0.94rem, 2.15vh, 1.12rem);
  line-height: 1.16;
}

.waiting-copy small {
  color: #bae6fd;
  font-size: clamp(0.76rem, 1.65vh, 0.9rem);
  line-height: 1.2;
}

.decision-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.decision-line strong {
  color: #fde047;
  font-size: clamp(0.82rem, 1.9vh, 1.05rem);
}

.decision-line b {
  color: #f8fafc;
  font-variant-numeric: tabular-nums;
  font-size: 0.92em;
}

.decision-line .untimed-label {
  color: #bbf7d0;
}

.hint.urgent {
  border-color: rgba(251, 113, 133, 0.9);
  background: rgba(127, 29, 29, 0.7);
  animation: urgent-pulse 0.9s ease-in-out infinite alternate;
}

.hint.urgent .decision-line strong,
.hint.urgent .decision-line b {
  color: #fff1f2;
}

.more-time-button {
  justify-self: center;
  min-height: 42px;
  padding: 0.28rem 0.7rem;
  border: 1px solid rgba(125, 211, 252, 0.72);
  border-radius: 999px;
  background: #075985;
  color: #f0f9ff;
  font-size: clamp(0.72rem, 1.55vh, 0.86rem);
  font-weight: 800;
  cursor: pointer;
}

.more-time-button:focus-visible {
  outline: 3px solid #fde047;
  outline-offset: 2px;
}

.more-time-button:disabled {
  opacity: 0.68;
  cursor: wait;
}

@keyframes urgent-pulse {
  from { box-shadow: 0 0 0 rgba(251, 113, 133, 0); }
  to { box-shadow: 0 0 0.7rem rgba(251, 113, 133, 0.28); }
}

.panel.locked .hint {
  color: #fca5a5;
}

.actions {
  display: flex;
  gap: clamp(0.3rem, 0.8vh, 0.55rem);
  flex-wrap: wrap;
  justify-content: center;
}

.actions.discard-mode {
  width: 100%;
}

.discard-action {
  width: min(100%, 10rem);
  white-space: nowrap;
}

.btn {
  min-width: clamp(2.7rem, 5vw, 5.2rem);
  min-height: clamp(2.55rem, 6.2vh, 3.9rem);
  border: none;
  border-radius: clamp(0.45rem, 0.9vh, 0.8rem);
  color: #fff;
  background: #475569;
  font-size: clamp(1rem, 2.6vh, 1.45rem);
  font-weight: 700;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn.enabled {
  background: #16a34a;
}

.btn.selected {
  outline: 2px solid #fde68a;
  background: #ca8a04;
}

.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn:not(:disabled):active {
  transform: scale(0.96);
}

@media (max-height: 520px) {
  .panel {
    padding: 0.25rem 0.45rem;
  }

  .actions {
    gap: 0.35rem;
  }

  .btn {
    min-width: 42px;
    min-height: 42px;
    font-size: clamp(0.84rem, 1.85vh, 1.08rem);
    padding: 0.1rem 0.28rem;
  }
}

@media (max-width: 960px), (max-height: 500px) {
  .actions {
    gap: 0.28rem;
  }

  .btn {
    min-width: 42px;
    min-height: 42px;
    font-size: clamp(0.82rem, 1.78vh, 1rem);
    padding: 0.08rem 0.22rem;
    border-radius: 0.7rem;
  }
}

@media (max-width: 960px), (max-height: 500px) {
  .panel {
    gap: 0.5vh;
    padding: 0.35vh;
  }

  .hint {
    min-height: 0;
    padding: 0.08rem 0.2rem;
    font-size: clamp(0.75rem, 3.2vh, 0.84rem);
    line-height: 1.2;
  }

  .more-time-button {
    min-height: 40px;
    padding: 0.12rem 0.45rem;
    font-size: 0.72rem;
  }

  .waiting-state {
    min-height: clamp(52px, 15vh, 64px);
    padding: 0.3rem 0.4rem;
    gap: 0.38rem;
  }

  .waiting-copy strong {
    font-size: clamp(0.94rem, 4.1vh, 1.08rem);
  }

  .waiting-copy small {
    font-size: clamp(0.75rem, 3.2vh, 0.84rem);
  }

  .decision-line {
    gap: 0.04rem 0.28rem;
    flex-wrap: wrap;
    white-space: normal;
  }

  .decision-line strong {
    font-size: clamp(0.82rem, 3.55vh, 0.92rem);
  }

  .decision-line b {
    font-size: 0.75rem;
  }

  .actions {
    gap: 0.45vh;
    flex-wrap: nowrap;
    align-items: center;
  }

  .btn {
    min-width: clamp(40px, 7vw, 48px);
    min-height: clamp(40px, 11.5vh, 46px);
    border-radius: 1.2vh;
    font-size: clamp(1rem, 4.2vh, 1.18rem);
    padding: 0 0.35rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hint.urgent {
    animation: none;
  }
}
</style>
