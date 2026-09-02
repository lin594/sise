<template>
  <div class="panel" :class="{ locked: panelLocked }">
    <span class="sr-only" role="status" aria-live="polite">
      {{ needsDecision ? `该你操作了。${panelHint}` : "" }}
    </span>
    <div
      class="hint"
      :class="{ active: needsDecision, urgent: isUrgent }"
      :data-urgent="isUrgent ? 'true' : 'false'"
      data-testid="action-guidance"
    >
      <span v-if="needsDecision" class="decision-line">
        <strong>{{ isUrgent ? "抓紧操作" : "该你操作了" }}</strong>
        <b v-if="secondsLeft !== null">还剩 {{ secondsLeft }} 秒</b>
      </span>
      <span class="instruction">{{ panelHint }}</span>
    </div>
    <div class="actions" :class="{ 'discard-mode': canDiscard }">
      <button
        v-if="canDiscard"
        type="button"
        class="btn discard-action"
        data-testid="discard-confirm"
        :class="{ enabled: hasDiscardSelection && !discardPending }"
        :disabled="!hasDiscardSelection || discardPending"
        @click="emit('confirmDiscard')"
      >
        {{ hasDiscardSelection ? (discardPending ? "出牌中…" : "出牌") : "先选牌" }}
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
        :disabled="!canAct || !isClickable(item) || busy"
        @click="onClick(item)"
      >
        {{ text(item) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ActionRequest, ActionType, AvailableAction } from "@/types/game";

type SelectionMode = "kai" | "peng" | "chi" | null;

const props = withDefaults(
  defineProps<{
    actions: AvailableAction[];
    canAct?: boolean;
    isCurrentTurn?: boolean;
    responsePhase?: string;
    currentPlayerName?: string;
    selectionMode?: SelectionMode;
    selectedCandidateId?: string | null;
    canDiscard?: boolean;
    hasDiscardSelection?: boolean;
    discardPending?: boolean;
    secondsLeft?: number | null;
  }>(),
  {
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    currentPlayerName: "-",
    selectionMode: null,
    selectedCandidateId: null,
    canDiscard: false,
    hasDiscardSelection: false,
    discardPending: false,
    secondsLeft: null,
  },
);

const emit = defineEmits<{
  submit: [request: ActionRequest];
  confirmDiscard: [];
  selectionChange: [payload: { mode: SelectionMode; selectedCandidateId: string | null }];
}>();

const busy = ref(false);

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
const panelLocked = computed(() => !props.canAct && !props.canDiscard);
const needsDecision = computed(() => props.canAct || props.canDiscard);
const secondsLeft = computed<number | null>(() =>
  typeof props.secondsLeft === "number" && Number.isFinite(props.secondsLeft)
    ? Math.max(0, Math.ceil(props.secondsLeft))
    : null,
);
const isUrgent = computed(() => needsDecision.value && secondsLeft.value !== null && secondsLeft.value <= 5);

const panelHint = computed(() => {
  if (props.canDiscard) {
    return props.hasDiscardSelection ? "已选好，请点出牌" : "请先选择一张手牌";
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
  if (
    item.action === "chi" &&
    item.candidates?.length === 1 &&
    item.candidates[0]?.kind === "single"
  ) {
    return "收下";
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

.hint.urgent {
  border-color: rgba(251, 113, 133, 0.9);
  background: rgba(127, 29, 29, 0.7);
  animation: urgent-pulse 0.9s ease-in-out infinite alternate;
}

.hint.urgent .decision-line strong,
.hint.urgent .decision-line b {
  color: #fff1f2;
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
