<template>
  <div class="board">
    <div class="grid">
      <section v-for="player in players" :key="player.clientId" class="player">
        <header class="player-head">
          <strong>{{ player.name }}</strong>
          <small>声明: {{ player.declaredKongs }} 坎</small>
        </header>
        <div class="areas">
          <DiscardZone :title="`${player.name} 弃牌区`" :cards="player.discardPile" />
          <div class="exposed">
            <h4>明示区</h4>
            <div class="cards">
              <CardComp v-for="card in player.exposedArea" :key="`exp-${card.id}`" :card="card" />
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="center">
      <h3>当前待响区</h3>
      <div class="response-wrap" v-if="responseCard">
        <CardComp :card="responseCard" />
        <small>来源：{{ responseCard.source === "draw" ? "抓取" : "上家" }}</small>
      </div>
      <p class="hint">{{ state?.lastAction || "等待中" }}</p>
    </section>

    <section class="self">
      <h3>我的手牌（私有）</h3>
      <div class="cards">
        <CardComp v-for="card in privateHand" :key="`me-${card.id}`" :card="card" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CardComp from "./Card.vue";
import DiscardZone from "./DiscardZone.vue";
import type { Card, PlayerState } from "@/types/game";

const props = defineProps<{
  state: any;
  players: PlayerState[];
  privateHand: Card[];
}>();

const responseCard = computed<Card | null>(() => {
  const card = props.state?.responseCard;
  if (!card?.id) {
    return null;
  }
  return card;
});
</script>

<style scoped>
.board {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr auto auto;
  gap: 10px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.player {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 8px;
}
.player-head {
  display: flex;
  justify-content: space-between;
  color: #e2e8f0;
  margin-bottom: 8px;
}
.areas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.exposed {
  background: #111827;
  border-radius: 10px;
  border: 1px solid #334155;
  padding: 8px;
  color: #e2e8f0;
}
.center,
.self {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 8px;
  color: #e2e8f0;
}
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.response-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hint {
  margin-top: 6px;
  color: #93c5fd;
}
@media (max-width: 767px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
