<template>
  <div class="card" :class="[colorClass, `size-${sizeClass}`, { response: isResponseCard }]">
    <span class="text">{{ label }}</span>
    <span v-if="isResponseCard" class="star">★</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Card } from "@/types/game";

const props = defineProps<{
  card: Card;
  size?: "sm" | "md" | "lg" | "xl";
}>();

const labelMap: Record<string, string> = {
  jiang: "将",
  shi: "士",
  xiang: "象",
  ju: "车",
  ma: "马",
  pao: "炮",
  zu: "卒",
  gong: "公",
  hou: "侯",
  bo: "伯",
  zi: "子",
  nan: "男",
};

const colorMap: Record<string, string> = {
  yellow: "黄",
  red: "红",
  green: "绿",
  white: "白",
  gold: "金",
};

const label = computed(() => `${colorMap[props.card.color] ?? "?"}${labelMap[props.card.type] ?? props.card.type}`);
const colorClass = computed(() => `color-${props.card.color}`);
const isResponseCard = computed(() => Boolean(props.card.isResponseCard));
const sizeClass = computed(() => props.size ?? "md");
</script>

<style scoped>
.card {
  position: relative;
  border-radius: 8px;
  border: 1px solid #111;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #111;
  background: #fff;
  transition: transform 0.2s ease;
}

.size-sm {
  width: 44px;
  height: 62px;
  font-size: 14px;
}

.size-md {
  width: 52px;
  height: 72px;
  font-size: 16px;
}

.size-lg {
  width: 72px;
  height: 102px;
  font-size: 19px;
}

.size-xl {
  width: 86px;
  height: 122px;
  font-size: 22px;
}

.card:hover {
  transform: translateY(-2px);
}

.card.response {
  border: 2px solid #ffd54f;
  animation: pulse 1.5s infinite;
}

.star {
  position: absolute;
  right: 4px;
  top: 2px;
  color: #ffca28;
}

.color-yellow {
  background: #ffd700;
}

.color-red {
  background: #e53935;
}

.color-green {
  background: #43a047;
}

.color-white {
  background: #ffffff;
}

.color-gold {
  background: #ffd700;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 213, 79, 0.8);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(255, 213, 79, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 213, 79, 0);
  }
}
</style>
