<template>
  <div class="panel">
    <button
      v-for="item in normalized"
      :key="item.action"
      class="btn"
      :class="{ enabled: item.enabled }"
      :disabled="!item.enabled || busy"
      @click="onClick(item.action)"
    >
      {{ text(item.action) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ActionType, AvailableAction } from "@/types/game";

const props = defineProps<{
  actions: AvailableAction[];
}>();

const emit = defineEmits<{
  submit: [action: ActionType];
}>();

const busy = ref(false);

const defaultOrder: ActionType[] = ["hu", "open", "peng", "eat", "grab", "pass"];
const normalized = computed(() => {
  const map = new Map(props.actions.map((x) => [x.action, x.enabled]));
  return defaultOrder
    .filter((action) => map.has(action))
    .map((action) => ({ action, enabled: Boolean(map.get(action)) }));
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
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 10px;
  background: #0f172a;
  border-top: 1px solid #1e293b;
}
.btn {
  min-width: 56px;
  min-height: 48px;
  border: none;
  border-radius: 10px;
  color: #fff;
  background: #475569;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn.enabled {
  background: #4caf50;
}
.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.btn:not(:disabled):active {
  transform: scale(0.96);
}
</style>
