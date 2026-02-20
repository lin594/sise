<template>
  <div class="panel" :class="{ locked: !canAct }">
    <p class="hint">{{ panelHint }}</p>
    <div class="actions">
      <button
        v-for="item in normalized"
        :key="item.action"
        class="btn"
        :class="{ enabled: item.enabled && canAct }"
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
import type { ActionType, AvailableAction } from "@/types/game";

const props = withDefaults(
  defineProps<{
    actions: AvailableAction[];
    canAct?: boolean;
    isCurrentTurn?: boolean;
    responsePhase?: string;
    currentPlayerName?: string;
  }>(),
  {
    canAct: false,
    isCurrentTurn: false,
    responsePhase: "",
    currentPlayerName: "-",
  },
);

const emit = defineEmits<{
  submit: [action: ActionType];
}>();

const busy = ref(false);

const defaultOrder: ActionType[] = ["hu", "kai", "peng", "chi", "pass"];
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

function text(action: ActionType): string {
  const map: Record<ActionType, string> = {
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

function onClick(action: ActionType): void {
  busy.value = true;
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

  .btn {
    min-width: 48px;
    min-height: 48px;
    font-size: clamp(0.95rem, 2.1vh, 1.2rem);
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
