<template>
  <div
    class="card"
    :class="[colorClass, `size-${sizeClass}`, `mode-${modeClass}`, { 'response-card': isResponseCard }]"
    :data-card-mode="modeClass"
    :data-face-id="card.id"
    role="img"
    :aria-label="accessibleLabel"
  >
    <div class="card-face">
      <span class="color-seal" aria-hidden="true">{{ colorSeal }}</span>
      <span class="text text-top">{{ label }}</span>
      <span v-if="modeClass === 'long'" class="text text-bottom">{{ label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Card, RenderedCardMode } from "@/types/game";
import { getCardAccessibleText, getCardFaceText } from "@/utils/cardText";

const props = defineProps<{
  card: Card;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  mode?: RenderedCardMode;
}>();

const label = computed(() => getCardFaceText(props.card));
const colorSeal = computed(() => ({
  yellow: "黄",
  red: "红",
  green: "绿",
  white: "白",
  gold: "金",
}[props.card.color] ?? ""));
const accessibleLabel = computed(() => getCardAccessibleText(props.card));
const colorClass = computed(() => `color-${props.card.color}`);
const isResponseCard = computed(() => Boolean(props.card.isResponseCard));
const sizeClass = computed(() => props.size ?? "md");
const modeClass = computed<RenderedCardMode>(() => props.mode ?? "long");
</script>

<style scoped>
.card-face { display: contents; }

.card {
  container-type: size;
  position: relative;
  border-radius: 10px;
  border: 1px solid #111;
  display: grid;
  grid-template-rows: 1fr 1fr;
  align-items: center;
  justify-items: center;
  font-weight: 700;
  color: #09090b;
  background: #fff;
  padding: 2px 0;
  overflow: hidden;
  box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.15);
}

.mode-large {
  grid-template-rows: auto minmax(0, 1fr);
  padding: 0;
}

.mode-large .text-top {
  grid-row: 2;
  align-self: center;
  padding-top: 0;
  font-size: 1.32em;
  font-weight: 900;
}

/* A fixed internal reading area keeps assistance independent of table geometry.
   Counter-rotate the whole area so its badge stays at the reader's lower right. */
.color-seal { display: none; }
:global(html.show-card-color-assist .card-face) {
  --seal-size: 9px;
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--card-ink-width, 100cqw);
  height: var(--card-ink-height, 100cqh);
  transform: translate(-50%, -50%) rotate(var(--card-text-angle, 0deg));
  display: grid;
  grid-template-rows: minmax(0, 1fr) calc(var(--seal-size) * 1.5);
  gap: 1px;
  padding: 0 2px 2px;
  box-sizing: border-box;
}
:global(html.show-card-color-assist .size-xs .card-face) { --seal-size: 7px; padding: 0 1px 1px; }
:global(html.show-card-color-assist .size-xl .card-face) { --seal-size: 11px; }
:global(html.show-card-color-assist .card-face .text-top) {
  grid-row: 1;
  align-self: center;
  justify-self: center;
  width: max-content;
  padding: 0;
  rotate: 0deg;
  line-height: 1.35;
  font-size: min(1.32em, calc((var(--card-ink-height, 100cqh) - var(--seal-size) * 1.5 - 3px) / 1.35), calc(var(--card-ink-width, 100cqw) - 4px));
}
:global(html.show-card-color-assist .card-face .text-bottom) { display: none; }
:global(html.show-card-color-assist .card-face .color-seal) {
  display: grid;
  grid-row: 2;
  justify-self: end;
  place-items: center;
  width: var(--seal-size);
  height: calc(var(--seal-size) * 1.5);
  border-radius: 2px;
  background: #fffdf7;
  color: #111827;
  font-family: "Noto Serif CJK SC", "Songti SC", "SimSun", serif;
  font-size: var(--seal-size);
  font-weight: 900;
  line-height: 1.5;
  rotate: 0deg;
  pointer-events: none;
}
/* On very short faces, use the free corner beside the name instead of
   shrinking the name to squeeze two lines into the same card. */
@container (max-height: 28px) {
  :global(html.show-card-color-assist .card-face) {
    width: var(--card-ink-width, 100cqw);
    height: var(--card-ink-height, 100cqh);
    grid-template-columns: minmax(0, 1fr) var(--seal-size);
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    padding: 0 1px 1px;
  }
  :global(html.show-card-color-assist .card-face .text-top) {
    grid-column: 1;
    align-self: start;
    padding-top: 1px;
    font-size: min(1em, calc(var(--card-ink-width, 100cqw) - var(--seal-size) - 2px));
  }
  :global(html.show-card-color-assist .card-face .color-seal) {
    grid-column: 2;
    grid-row: 1;
    align-self: end;
  }
}
.mode-long { grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
.mode-long .text-top { grid-row: 1; }
.mode-long .text-bottom { grid-row: 2; }

.size-xs.mode-long {
  width: 1.3rem;
  height: 2.25rem;
  font-size: 0.74rem;
  border-radius: 0.34rem;
}

.size-xs.mode-large {
  width: 1.42rem;
  height: 1.55rem;
  font-size: 0.76rem;
  border-radius: 0.38rem;
}

.size-sm {
  width: clamp(1.45rem, 1.9vw, 2rem);
  height: clamp(3rem, 4.1vw, 4.15rem);
  font-size: clamp(0.76rem, 1vw, 1.06rem);
}

.size-sm.mode-large {
  width: clamp(1.75rem, 2.6vw, 2.15rem);
  height: clamp(1.95rem, 3vw, 2.35rem);
  font-size: clamp(0.84rem, 1.2vw, 1.08rem);
}

.size-md {
  width: clamp(1.65rem, 2.3vw, 2.45rem);
  height: clamp(3.35rem, 4.7vw, 4.85rem);
  font-size: clamp(0.84rem, 1.16vw, 1.22rem);
}

.size-md.mode-large {
  width: clamp(2.05rem, 3.2vw, 2.7rem);
  height: clamp(2.3rem, 3.6vw, 3rem);
  font-size: clamp(1rem, 1.45vw, 1.35rem);
}

.size-lg {
  width: clamp(2rem, 2.85vw, 3rem);
  height: clamp(4rem, 5.7vw, 6rem);
  font-size: clamp(1rem, 1.42vw, 1.5rem);
}

.size-lg.mode-large {
  width: clamp(2.7rem, 4.3vw, 3.6rem);
  height: clamp(3.05rem, 4.9vw, 4.05rem);
  font-size: clamp(1.35rem, 2vw, 1.85rem);
}

.size-xl {
  width: clamp(2.1rem, 3vw, 3.15rem);
  height: clamp(4.25rem, 6vw, 6.35rem);
  font-size: clamp(1.04rem, 1.48vw, 1.56rem);
}

.size-xl.mode-large {
  width: clamp(2.55rem, 3.7vw, 3.15rem);
  height: clamp(3.2rem, 4.5vw, 3.9rem);
  font-size: clamp(1.3rem, 1.85vw, 1.65rem);
}

@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: translateY(-2px);
  }
}

.text, .color-seal {
  rotate: var(--card-text-angle, 0deg);
}

.text {
  display: flex;
  justify-content: center;
  align-items: center;
  width: var(--card-text-width, 100%);
  line-height: 1;
  letter-spacing: 0.03em;
}

.text-top {
  align-self: start;
  padding-top: 3px;
}

.text-bottom {
  align-self: end;
  transform: rotate(var(--card-bottom-text-angle, 180deg));
  padding-bottom: 3px;
}

.response-card {
  border-color: #082f49;
  box-shadow:
    inset 0 0 0 3px #38bdf8,
    0 0 0 2px rgba(254, 243, 199, 0.92),
    0 4px 12px rgba(2, 132, 199, 0.34);
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
  color: #fff7ed;
}
.card.mode-long { border-radius: 50% / 18%; }
.mode-long .text-top { padding-top: 12%; }
.mode-long .text-bottom { padding-bottom: 12%; }
</style>
