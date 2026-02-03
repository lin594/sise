<template>
  <div :class="['player-area', `player-${position}`, { 'current-player': isCurrent }]">
    <!-- Player Info -->
    <div class="player-info">
      <span class="player-name">{{ player.name }}</span>
      <span class="player-score">{{ player.score }}分</span>
      <span v-if="player.declaredKongs > 0" class="player-kongs">
        声明{{ player.declaredKongs }}坎
      </span>
      <span v-if="position !== 'bottom'" class="player-hand-count">
        手牌: {{ player.handCount }}
      </span>
    </div>

    <!-- Response Area -->
    <div v-if="player.responseArea && player.responseArea.length" class="response-area">
      <p class="area-label">待响区</p>
      <Card 
        v-for="card in player.responseArea" 
        :key="card.id"
        :card="card"
        response
      />
    </div>

    <!-- Exposed Area (combinations) -->
    <div v-if="player.exposedArea && player.exposedArea.length" class="exposed-area">
      <p class="area-label">明示区</p>
      <div class="exposed-cards">
        <Card 
          v-for="card in player.exposedArea" 
          :key="card.id"
          :card="card"
          :response="card.isResponseCard"
        />
      </div>
    </div>

    <!-- Discard Area -->
    <div v-if="player.discardPile && player.discardPile.length" class="discard-area">
      <p class="area-label">弃牌区 ({{ player.discardPile.length }})</p>
      <div class="discard-cards">
        <Card 
          v-for="card in player.discardPile" 
          :key="card.id"
          :card="card"
          small
        />
      </div>
    </div>

    <!-- Hand (only for bottom player) -->
    <div v-if="position === 'bottom' && hand" class="hand-area">
      <p class="area-label">手牌</p>
      <div class="hand-cards">
        <Card 
          v-for="card in hand" 
          :key="card.id"
          :card="card"
          :selected="selectedCards?.includes(card.id)"
          clickable
          @click="$emit('selectCard', card.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Card from './Card.vue';

interface Props {
  player: any;
  position: 'top' | 'bottom' | 'left' | 'right';
  isCurrent?: boolean;
  hand?: any[];
  selectedCards?: string[];
}

defineProps<Props>();
defineEmits<{
  selectCard: [cardId: string];
}>();
</script>

<style scoped>
.player-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 2px solid transparent;
  transition: border-color 0.3s;
}

.player-area.current-player {
  border-color: #1e88e5;
  background: rgba(30, 136, 229, 0.1);
}

.player-top {
  grid-area: top;
}

.player-bottom {
  grid-area: bottom;
}

.player-left {
  grid-area: left;
}

.player-right {
  grid-area: right;
}

.player-info {
  display: flex;
  gap: 10px;
  align-items: center;
  color: white;
  font-size: 13px;
  flex-wrap: wrap;
}

.player-name {
  font-weight: 600;
  font-size: 14px;
}

.player-score {
  color: #ffd700;
}

.player-kongs {
  color: #fb8c00;
}

.area-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.response-area,
.exposed-area,
.discard-area {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px;
  border-radius: 6px;
}

.exposed-cards,
.discard-cards,
.hand-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.hand-area {
  background: rgba(255, 255, 255, 0.1);
  padding: 12px;
  border-radius: 8px;
}

.hand-cards {
  min-height: 60px;
}
</style>
