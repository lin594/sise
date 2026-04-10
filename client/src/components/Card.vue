<template>
  <div class="card" :class="[colorClass, `size-${sizeClass}`]">
    <span class="text text-top">{{ label }}</span>
    <span class="text text-bottom">{{ label }}</span>
    <span v-if="isResponseCard" class="star">*</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Card } from "@/types/game";
import { getCardFaceText } from "@/utils/cardText";

const props = defineProps<{
  card: Card;
  size?: "sm" | "md" | "lg" | "xl";
}>();

const label = computed(() => getCardFaceText(props.card));
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
  width: clamp(1.35rem, 2.1vw, 2.1rem);
  height: clamp(3.7rem, 5.4vw, 5.8rem);
  font-size: clamp(0.82rem, 1vw, 1.02rem);
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

.star {
  position: absolute;
  right: 3px;
  top: 2px;
  color: #ffca28;
  font-size: 1em;
  font-weight: 800;
  text-shadow: 0 0 4px rgba(250, 204, 21, 0.85);
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
  background: #c41e1e;
}
</style>
