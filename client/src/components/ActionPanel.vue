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

const defaultOrder: ActionType[] = ["hu", "open", "peng", "eat", "grab", "pass"];
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
    open: "开",
    peng: "碰",
    eat: "吃",
    grab: "抓",
    pass: "过",
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
  gap: 10px;
  padding: 12px;
  background: #0f172a;
  border-top: 1px solid #1e293b;
}

.panel.locked {
  background: #0b1220;
}

.hint {
  margin: 0;
  text-align: center;
  color: #93c5fd;
  font-size: 15px;
}

.panel.locked .hint {
  color: #fca5a5;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  min-width: 88px;
  min-height: 62px;
  border: none;
  border-radius: 12px;
  color: #fff;
  background: #475569;
  font-size: 24px;
  font-weight: 700;
  padding: 8px 12px;
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

@media (max-width: 767px) {
  .btn {
    min-width: 78px;
    min-height: 56px;
    font-size: 22px;
  }
}
</style>
