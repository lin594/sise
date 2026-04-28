<template>
  <div class="panel" :class="{ locked: !canAct }">
    <p class="hint">{{ panelHint }}</p>
    <div class="actions">
      <button
        v-for="item in normalized"
        :key="item.action"
        :data-testid="`action-${item.action}`"
        class="btn"
        :class="{
          enabled: item.enabled && canAct,
          selected: selectionMode === item.action,
        }"
        :disabled="!canAct || !item.enabled || busy"
        @click="onClick(item.action)"
      >
        {{ text(item.action) }}
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
  }>(),
  {
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    currentPlayerName: "-",
    selectionMode: null,
    selectedCandidateId: null,
  },
);

const emit = defineEmits<{
  submit: [request: ActionRequest];
  selectionChange: [payload: { mode: SelectionMode; selectedCandidateId: string | null }];
}>();

const busy = ref(false);

const defaultOrder: ActionType[] = ["hu", "kai", "peng", "chi", "pass"];
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

const selectionMode = computed<SelectionMode>(() => props.selectionMode ?? null);

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

function isMeldAction(action: ActionType): action is Exclude<SelectionMode, null> {
  return action === "kai" || action === "peng" || action === "chi";
}

function text(action: ActionType): string {
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

function onClick(action: ActionType): void {
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

.hint {
  margin: 0;
  text-align: center;
  color: #93c5fd;
  font-size: clamp(0.66rem, 1.5vh, 0.9rem);
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

.btn {
  min-width: max(48px, clamp(3rem, 5vw, 5.2rem));
  min-height: max(48px, clamp(3rem, 6.2vh, 3.9rem));
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

@media (orientation: landscape) and (max-height: 520px) {
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

@media (orientation: landscape) and (max-width: 960px) {
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

@media (orientation: landscape) and (max-width: 960px) {
  .panel {
    gap: 0.5vh;
    padding: 0.55vh 1.2vw;
  }

  .hint {
    font-size: clamp(0.56rem, 1.35vh, 0.72rem);
    line-height: 1.15;
  }

  .actions {
    gap: 0.75vh;
    flex-wrap: nowrap;
    align-items: center;
  }

  .btn {
    min-width: 48px;
    min-height: 48px;
    border-radius: 1.2vh;
    font-size: clamp(0.95rem, 2.4vh, 1.18rem);
    padding: 0 0.35rem;
  }
}
</style>
