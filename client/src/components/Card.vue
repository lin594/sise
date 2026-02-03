<template>
  <div 
    :class="[
      'card', 
      `card-${card.color}`,
      { 
        'response-card': response,
        'selected': selected,
        'clickable': clickable,
        'small': small
      }
    ]"
    @click="handleClick"
  >
    {{ card.rank }}
    <span v-if="card.isGoldBar || card.rank === '将'" class="card-lock-icon">🔒</span>
  </div>
</template>

<script setup lang="ts">
interface Props {
  card: {
    id: string;
    rank: string;
    color: string;
    isGoldBar?: boolean;
    isResponseCard?: boolean;
  };
  response?: boolean;
  selected?: boolean;
  clickable?: boolean;
  small?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  click: [];
}>();

function handleClick() {
  if (props.clickable) {
    emit('click');
  }
}
</script>

<style scoped>
.card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 56px;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: bold;
  font-size: 16px;
  color: #000;
  border: 2px solid rgba(0, 0, 0, 0.2);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
  user-select: none;
}

.card.small {
  min-width: 30px;
  min-height: 42px;
  font-size: 12px;
  padding: 2px 4px;
}

.card.clickable {
  cursor: pointer;
}

.card.clickable:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.card.selected {
  transform: translateY(-8px);
  border-color: #1e88e5;
  box-shadow: 0 6px 12px rgba(30, 136, 229, 0.3);
}

.card.response-card {
  border-color: gold;
  box-shadow: 0 0 12px gold;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 12px gold;
  }
  50% {
    box-shadow: 0 0 24px gold;
  }
}

.card-yellow {
  background: #ffd700;
}

.card-red {
  background: #e53935;
  color: white;
}

.card-green {
  background: #43a047;
  color: white;
}

.card-white {
  background: #ffffff;
}

.card-gold {
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
}

.card-lock-icon {
  font-size: 10px;
  margin-left: 2px;
  opacity: 0.6;
}
</style>
