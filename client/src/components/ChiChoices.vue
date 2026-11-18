<template>
  <div class="chi-choices" :class="{ 'large-choices': seniorMode }" role="group" aria-label="可选吃法" data-testid="chi-choices">
    <button v-for="choice in choices" :key="choice.key" type="button" class="chi-choice"
      :aria-label="choiceLabel(choice)" :aria-pressed="choice.selected" :title="choiceLabel(choice)"
      :data-kind="choice.candidate.kind" @click="emit('choose', choice.candidate)">
      <strong>{{ choice.name }}</strong>
      <span class="chi-faces" aria-hidden="true">
        <CardFace preview :card="target" class="chi-target" size="xs" :mode="mode" />
        <span v-if="choice.cards.length">+</span>
        <CardFace v-for="card in choice.cards" preview :key="card.id" :card="card" size="xs" :mode="mode" />
      </span>
    </button>
    <button v-if="canClear" type="button" class="clear-choice" data-testid="clear-chi-draft"
      @click="emit('clear')">清除选择</button>
  </div>
</template>

<script setup lang="ts">
import CardFace from "./Card.vue";
import type { Card, RenderedCardMode, ActionCandidate } from "@/types/game";
import { getCardAccessibleText } from "@/utils/cardText";
import type { ChiChoice } from "@/utils/chiChoices";

const props = defineProps<{ choices: ChiChoice[]; target: Card; mode: RenderedCardMode; canClear: boolean; seniorMode?: boolean }>();
const emit = defineEmits<{ choose: [candidate: ActionCandidate]; clear: [] }>();

function choiceLabel(choice: ChiChoice): string {
  const hand = choice.cards.map(card => getCardAccessibleText(card)).join("、");
  return `${choice.name}，来牌${getCardAccessibleText(props.target)}${hand ? `，手牌${hand}` : ""}`;
}
</script>

<style scoped>
.chi-choices {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  gap: 4px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  align-items: center;
  scrollbar-width: none;
}
.chi-choices::-webkit-scrollbar { display: none; }
.chi-choice {
  flex: none;
  display: grid;
  place-items: center;
  gap: 1px;
  min-width: 44px;
  min-height: 44px;
  padding: 1px 4px;
  border: 1px solid var(--ui-border, #667572);
  border-radius: 5px;
  color: var(--ui-text, #fff);
  background: var(--ui-panel, #182c2a);
  cursor: pointer;
}
.clear-choice {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  padding: 2px 5px;
  border: 1px solid var(--ui-border, #667572);
  border-radius: 4px;
  color: var(--ui-text, #fff);
  background: var(--ui-panel, #182c2a);
  font-size: 12px;
  cursor: pointer;
}
.chi-choice[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--ui-gold-text, #d19d41); }
.chi-choice strong { font-size: 11px; line-height: 12px; }
.chi-faces { display: flex; align-items: center; gap: 2px; font-size: 11px; }
.chi-faces .card { width: 17px; height: 22px; pointer-events: none; font-size: 10px; }
.chi-target { outline: 1px solid var(--ui-gold-text, #d19d41); }
.large-choices { gap: 5px; }
.large-choices button { min-width: 48px; min-height: 48px; }
.large-choices .chi-choice strong { font-size: 17px; line-height: 1.08; }
.large-choices .chi-faces { gap: 2px; }
.large-choices .chi-faces .card { width: 23px; height: 24px; font-size: 15px; }
.large-choices .clear-choice { font-size: 16px; }
</style>
