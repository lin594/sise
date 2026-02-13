<template>
  <div class="card" :class="[colorClass, `size-${sizeClass}`, { response: isResponseCard }]">
    <span class="text text-top">{{ label }}</span>
    <span class="text text-bottom">{{ label }}</span>
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

const label = computed(() => `${labelMap[props.card.type] ?? props.card.type}`);
const colorClass = computed(() => `color-${props.card.color}`);
const isResponseCard = computed(() => Boolean(props.card.isResponseCard));
const sizeClass = computed(() => props.size ?? "md");
</script>

<style scoped>
.card {
  position: relative;
  border-radius: 10px;
  border: 1px solid #111;
  display: grid;
  grid-template-rows: 1fr 1fr;
  align-items: center;
  justify-items: center;
  font-weight: 700;
  color: #111;
  background: #fff;
  transition: transform 0.2s ease;
  padding: 2px 0;
  overflow: hidden;
  box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.15);
}

.size-sm {
  width: clamp(1rem, 1.4vw, 1.45rem);
  height: clamp(2.7rem, 3.4vw, 3.6rem);
  font-size: clamp(0.6rem, 0.72vw, 0.78rem);
}

.size-md {
  width: clamp(1.15rem, 1.65vw, 1.78rem);
  height: clamp(3rem, 4vw, 4.1rem);
  font-size: clamp(0.66rem, 0.8vw, 0.88rem);
}

.size-lg {
  width: clamp(1.3rem, 2vw, 2rem);
  height: clamp(3.5rem, 5vw, 5.2rem);
  font-size: clamp(0.78rem, 1vw, 1rem);
}

.size-xl {
  width: clamp(1.5rem, 2.3vw, 2.35rem);
  height: clamp(4rem, 6vw, 6.2rem);
  font-size: clamp(0.88rem, 1.08vw, 1.12rem);
}

.card:hover {
  transform: translateY(-2px);
}

.text {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  line-height: 1;
  letter-spacing: 0.03em;
}

.text-top {
  align-self: start;
  padding-top: 3px;
}

.text-bottom {
  align-self: end;
  transform: rotate(180deg);
  padding-bottom: 3px;
}

.card.response {
  border: 2px solid #ffd54f;
  animation: pulse 1.5s infinite;
}

.star {
  position: absolute;
  right: 2px;
  top: 1px;
  color: #ffca28;
  font-size: 0.62em;
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
