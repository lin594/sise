<template>
  <div class="action-panel">
    <div class="action-buttons">
      <button 
        class="btn-action btn-discard"
        v-if="isMyTurn && !responsePhase"
        :disabled="selectedCards.length !== 1 || !canDiscard"
        @click="$emit('action', 'discard', { cardId: selectedCards[0] })"
      >
        打出
      </button>

      <button 
        class="btn-action btn-hu"
        :disabled="!canHu"
        @click="$emit('action', 'hu')"
      >
        胡
      </button>

      <button 
        class="btn-action btn-kai"
        :disabled="!canKai"
        @click="$emit('action', 'kai')"
      >
        开
      </button>

      <button 
        class="btn-action btn-peng"
        :disabled="!canPeng"
        @click="$emit('action', 'peng')"
      >
        碰
      </button>

      <button 
        class="btn-action btn-chi"
        v-if="isMyTurn"
        :disabled="!canChi"
        @click="$emit('action', 'chi')"
      >
        吃
      </button>

      <button 
        class="btn-action btn-grab"
        v-if="isMyTurn && responsePhase === 'self_mode1'"
        :disabled="!canGrab"
        @click="$emit('action', 'grab')"
      >
        抓
      </button>

      <button 
        class="btn-action btn-pass"
        v-if="responsePhase"
        @click="$emit('action', 'pass')"
      >
        过
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  currentPlayerId: string;
  myPlayerId: string;
  responsePhase: string;
  selectedCards: string[];
  playerHand: any[];
  responseCard: any;
}

const props = defineProps<Props>();
defineEmits<{
  action: [action: string, data?: any];
}>();

const isMyTurn = computed(() => {
  return props.currentPlayerId === props.myPlayerId;
});

const canDiscard = computed(() => {
  if (props.selectedCards.length !== 1) return false;
  const card = props.playerHand.find(c => c.id === props.selectedCards[0]);
  if (!card) return false;
  // Cannot discard Jiang or Gold Bar
  return card.rank !== '将' && !card.isGoldBar;
});

// Simplified logic - in real implementation, check hand combinations
const canHu = computed(() => {
  return props.responsePhase === 'collective' && props.responseCard;
});

const canKai = computed(() => {
  return props.responsePhase === 'collective' && props.responseCard;
});

const canPeng = computed(() => {
  return props.responsePhase === 'collective' && props.responseCard;
});

const canChi = computed(() => {
  return isMyTurn.value && props.responseCard && 
    (props.responsePhase === 'self_mode1' || props.responsePhase === 'self_mode2');
});

const canGrab = computed(() => {
  return isMyTurn.value && props.responsePhase === 'self_mode1';
});
</script>

<style scoped>
.action-panel {
  padding: 15px 20px;
  background: rgba(0, 0, 0, 0.4);
  border-top: 2px solid rgba(255, 255, 255, 0.1);
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-action {
  min-width: 80px;
  padding: 12px 20px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  color: white;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.btn-action:not(:disabled) {
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.btn-action:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.btn-action:not(:disabled):active {
  transform: translateY(0);
}

.btn-action:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-discard {
  background: #fb8c00;
}

.btn-hu {
  background: #e53935;
  border-color: gold;
}

.btn-hu:not(:disabled) {
  animation: glow 2s ease-in-out infinite;
}

@keyframes glow {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(229, 57, 53, 0.5);
  }
  50% {
    box-shadow: 0 2px 16px rgba(229, 57, 53, 0.8);
  }
}

.btn-kai {
  background: #1e88e5;
}

.btn-peng {
  background: #43a047;
}

.btn-chi {
  background: #9c27b0;
}

.btn-grab {
  background: #00acc1;
}

.btn-pass {
  background: #757575;
}

/* Mobile optimization */
@media (max-width: 768px) {
  .btn-action {
    min-width: 70px;
    padding: 14px 18px;
    font-size: 15px;
  }
}
</style>
