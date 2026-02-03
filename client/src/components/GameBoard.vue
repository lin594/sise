<template>
  <div class="game-board">
    <!-- Header Info Bar -->
    <div class="game-header">
      <div class="header-left">
        <span>阶段: {{ phaseText }}</span>
        <span class="ml-2">牌堆: {{ gameState?.deckCount || 0 }}张</span>
      </div>
      <div class="header-center">
        <span>{{ gameState?.lastAction || '等待开始' }}</span>
      </div>
      <div class="header-right">
        <button class="btn-icon" @click="$emit('leave')">🚪</button>
      </div>
    </div>

    <!-- Game Area -->
    <div class="game-area">
      <!-- Top Player (Opponent 3) -->
      <PlayerArea 
        v-if="players[2]"
        :player="players[2]"
        position="top"
        :is-current="isCurrentPlayer(players[2])"
      />

      <!-- Left Player (Opponent 1) -->
      <PlayerArea 
        v-if="players[1]"
        :player="players[1]"
        position="left"
        :is-current="isCurrentPlayer(players[1])"
      />

      <!-- Center Info -->
      <div class="center-info">
        <div v-if="gameState?.dealerRevealedCards.length" class="revealed-card-area">
          <p>庄家亮出的牌</p>
          <Card 
            v-for="card in gameState.dealerRevealedCards" 
            :key="card.id"
            :card="card"
          />
        </div>
        <div class="timer-display" v-if="gameState?.responseTimer > 0">
          <span>响应倒计时: {{ gameState.responseTimer }}s</span>
        </div>
      </div>

      <!-- Right Player (Opponent 2) -->
      <PlayerArea 
        v-if="players[3]"
        :player="players[3]"
        position="right"
        :is-current="isCurrentPlayer(players[3])"
      />

      <!-- Bottom Player (Self) -->
      <PlayerArea 
        v-if="players[0]"
        :player="players[0]"
        :hand="playerHand"
        position="bottom"
        :is-current="isCurrentPlayer(players[0])"
        :selected-cards="selectedCards"
        @select-card="handleSelectCard"
      />
    </div>

    <!-- Action Panel -->
    <ActionPanel 
      v-if="players[0] && gameState"
      :current-player-id="gameState.currentPlayerId"
      :my-player-id="players[0].clientId"
      :response-phase="gameState.responsePhase"
      :selected-cards="selectedCards"
      :player-hand="playerHand"
      :response-card="getCurrentResponseCard()"
      @action="handleAction"
      @show-chi-options="showChiModal = true"
    />

    <!-- Declare Panel -->
    <div v-if="showDeclarePanel" class="modal-overlay">
      <div class="modal-content modal-declare">
        <h2>🎴 您的手牌</h2>
        <div class="declare-hand-display">
          <Card 
            v-for="card in playerHand" 
            :key="card.id"
            :card="card"
            :size="'medium'"
          />
        </div>
        
        <div class="declare-section">
          <h3>1. 声明暗坎数量</h3>
          <p>请声明您计划保留的暗坎数量（承诺保留，不可拆散）</p>
          <input 
            v-model.number="declareKongCount" 
            type="number" 
            min="0" 
            max="10"
            class="declare-input"
          />
          <button class="btn-primary" @click="confirmDeclare" style="width: 100%; margin-top: 10px;">
            确认声明 {{ declareKongCount }} 个暗坎
          </button>
        </div>
        
        <div class="fish-section" v-if="declareKongCount >= 0">
          <h3>2. 亮鱼（可选）</h3>
          <p style="font-size: 13px; opacity: 0.9;">
            如果有4张同色同字的牌或4/5张金条，可以选择亮出获得额外分数
          </p>
          <div class="fish-selection">
            <Card 
              v-for="card in playerHand" 
              :key="'fish-' + card.id"
              :card="card"
              :selected="fishSelectedCards.includes(card.id)"
              clickable
              @click="toggleFishCard(card.id)"
            />
          </div>
          <div class="fish-actions">
            <button 
              class="btn-secondary" 
              @click="revealFish" 
              :disabled="fishSelectedCards.length < 4 || fishSelectedCards.length > 5"
            >
              亮鱼 (已选{{ fishSelectedCards.length}}张)
            </button>
            <button 
              class="btn-tertiary" 
              @click="skipFish"
            >
              跳过亮鱼，直接开始游戏
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Debug Info (remove after testing) -->
    <div v-if="gameState && gameState.phase === 'declaring'" style="position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; font-size: 12px; z-index: 10000;">
      <div>Phase: {{ gameState?.phase }}</div>
      <div>showDeclarePanel: {{ showDeclarePanel }}</div>
      <div>playerHand: {{ playerHand.length }} cards</div>
      <div>players.length: {{ players.length }}</div>
      <div>players[0]: {{ players[0] ? 'exists' : 'null' }}</div>
      <div>hasDeclared: {{ players[0]?.hasDeclared }}</div>
    </div>

    <!-- Chi Modal -->
    <div v-if="showChiModal" class="modal-overlay">
      <div class="modal-content">
        <h3>选择吃牌组合</h3>
        <p>请选择要吃的牌组：</p>
        <div class="chi-options">
          <button 
            v-for="option in chiOptions" 
            :key="option.name"
            class="btn-chi-option"
            @click="selectChiOption(option)"
          >
            <div class="chi-name">{{ option.name }}</div>
            <div class="chi-score">得分: {{ option.score }}</div>
          </button>
        </div>
        <button class="btn-secondary mt-2" @click="showChiModal = false" style="width: 100%;">
          取消
        </button>
      </div>
    </div>

    <!-- Game End Modal -->
    <div v-if="gameEndData" class="modal-overlay">
      <div class="modal-content modal-large">
        <h2>🎉 游戏结束</h2>
        <div v-if="gameEndData.winnerId" class="winner-announce">
          <p class="winner-text">
            {{ getPlayerName(gameEndData.winnerId) }} 胡牌！
          </p>
        </div>
        <table class="settlement-table">
          <thead>
            <tr>
              <th>玩家</th>
              <th>得分变化</th>
              <th>当前总分</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[playerId, score] in gameEndData.playerScores" :key="playerId">
              <td>{{ getPlayerName(playerId) }}</td>
              <td :class="score >= 0 ? 'score-positive' : 'score-negative'">
                {{ score >= 0 ? '+' : '' }}{{ score }}
              </td>
              <td>{{ getPlayerScore(playerId) }}</td>
            </tr>
          </tbody>
        </table>
        <button class="btn-primary mt-2" @click="handleExitGame" style="width: 100%;">
          退出游戏
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Room } from 'colyseus.js';
import PlayerArea from './PlayerArea.vue';
import ActionPanel from './ActionPanel.vue';
import Card from './Card.vue';

interface Props {
  room: Room | null;
  playerName: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  leave: [];
}>();

const gameState = ref<any>(null);
const playerHand = ref<any[]>([]);
const selectedCards = ref<string[]>([]);
const declareKongCount = ref(0);
const showDeclarePanel = ref(false);
const showChiModal = ref(false);
const chiOptions = ref<any[]>([]);
const gameEndData = ref<any>(null);
const fishSelectedCards = ref<string[]>([]);

// Function to check if we should show declare panel
function checkAndShowDeclarePanel() {
  console.log('checkAndShowDeclarePanel called');
  console.log('- gameState:', !!gameState.value);
  console.log('- phase:', gameState.value?.phase);
  console.log('- players count:', players.value.length);
  console.log('- players[0]:', !!players.value[0]);
  console.log('- hasDeclared:', players.value[0]?.hasDeclared);
  console.log('- playerHand length:', playerHand.value.length);
  console.log('- showDeclarePanel current:', showDeclarePanel.value);
  
  // Check all conditions:
  // 1. Phase is declaring
  // 2. We have a player (current user)
  // 3. Player hasn't declared yet
  // 4. We have received our hand cards
  if (gameState.value && 
      gameState.value.phase === 'declaring' && 
      players.value.length > 0 &&
      players.value[0] && 
      !players.value[0].hasDeclared &&
      playerHand.value.length > 0) {
    console.log('✅ Showing declare panel - all conditions met');
    showDeclarePanel.value = true;
  } else {
    console.log('❌ Not showing panel - conditions not met');
  }
}

// Watch for room prop and set up listeners immediately
watch(() => props.room, (room) => {
  if (!room) return;
  
  console.log('Setting up room listeners...');
  
  // Listen to state changes
  room.onStateChange((state) => {
    gameState.value = state;
    console.log('State updated:', state);
    
    // Try to show declare panel when in declaring phase
    checkAndShowDeclarePanel();
  });

  // Listen to private hand updates
  room.onMessage('private_hand', (hand) => {
    playerHand.value = hand;
    console.log('Hand updated:', hand.length, 'cards');
    
    // Try to show declare panel after receiving hand
    checkAndShowDeclarePanel();
  });

  // Listen to game end
  room.onMessage('game_end', (data) => {
    console.log('Game ended:', data);
    gameEndData.value = data;
  });

  // Listen to errors
  room.onMessage('error', (message) => {
    alert(message.message || '操作失败');
  });
}, { immediate: true });

const players = computed(() => {
  if (!gameState.value || !gameState.value.players) {
    return [];
  }
  
  // Get players as array, with current player first
  const playersArray = Array.from(gameState.value.players.values());
  const myIndex = playersArray.findIndex(p => !p.isAI);
  
  if (myIndex === -1) return playersArray;
  
  // Rotate so current player is at index 0
  const rotated = [
    playersArray[myIndex],
    playersArray[(myIndex + 1) % 4],
    playersArray[(myIndex + 2) % 4],
    playersArray[(myIndex + 3) % 4]
  ].filter(p => p); // Remove undefined
  
  return rotated;
});

const phaseText = computed(() => {
  const phase = gameState.value?.phase;
  const phaseMap: { [key: string]: string } = {
    'waiting': '等待中',
    'declaring': '声明暗坎',
    'playing': '游戏中',
    'ended': '已结束'
  };
  return phaseMap[phase] || phase;
});

function isCurrentPlayer(player: any): boolean {
  return player && gameState.value && player.clientId === gameState.value.currentPlayerId;
}

function getCurrentResponseCard() {
  if (!players.value[0] || !players.value[0].responseArea) {
    return null;
  }
  return players.value[0].responseArea[0] || null;
}

function handleSelectCard(cardId: string) {
  const index = selectedCards.value.indexOf(cardId);
  if (index > -1) {
    selectedCards.value.splice(index, 1);
  } else {
    selectedCards.value.push(cardId);
  }
}

function handleAction(action: string, data?: any) {
  console.log('Action:', action, data);
  props.room?.send('action', { action, data });
  selectedCards.value = [];
}

function selectChiOption(option: any) {
  // Send chi action with selected cards
  props.room?.send('action', {
    action: 'chi',
    data: {
      groupType: option.name,
      cardIds: option.cardIds
    }
  });
  showChiModal.value = false;
  chiOptions.value = [];
}

function getPlayerName(playerId: string): string {
  const player = gameState.value?.players?.get(playerId);
  return player?.name || '未知玩家';
}

function getPlayerScore(playerId: string): number {
  const player = gameState.value?.players?.get(playerId);
  return player?.score || 0;
}

function handleExitGame() {
  emit('leave');
}

function confirmDeclare() {
  props.room?.send('declare_kong', { count: declareKongCount.value });
  // Don't close panel yet, allow fish revealing
}

function toggleFishCard(cardId: string) {
  const index = fishSelectedCards.value.indexOf(cardId);
  if (index > -1) {
    fishSelectedCards.value.splice(index, 1);
  } else {
    fishSelectedCards.value.push(cardId);
  }
}

function revealFish() {
  if (fishSelectedCards.value.length < 4 || fishSelectedCards.value.length > 5) {
    return;
  }
  
  props.room?.send('reveal_fish', { cardIds: fishSelectedCards.value });
  fishSelectedCards.value = [];
  showDeclarePanel.value = false;
}

function skipFish() {
  // Just close the panel, game will start after timeout
  showDeclarePanel.value = false;
}


</script>

<style scoped>
.game-board {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.3);
  color: white;
  font-size: 14px;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-center {
  flex: 1;
  text-align: center;
  font-weight: 600;
}

.ml-2 {
  margin-left: 10px;
}

.btn-icon {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-area {
  flex: 1;
  position: relative;
  display: grid;
  grid-template-areas:
    ". top ."
    "left center right"
    ". bottom .";
  grid-template-columns: 1fr 2fr 1fr;
  grid-template-rows: 1fr 2fr 2fr;
  padding: 10px;
  gap: 10px;
}

.center-info {
  grid-area: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  color: white;
  text-align: center;
}

.revealed-card-area {
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
}

.revealed-card-area p {
  margin-bottom: 10px;
  font-size: 14px;
}

.timer-display {
  background: rgba(255, 152, 0, 0.8);
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 16px;
}

/* Chi Modal Styles */
.chi-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 20px 0;
}

.btn-chi-option {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 15px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-chi-option:hover {
  border-color: gold;
  transform: translateY(-2px);
}

.chi-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 5px;
}

.chi-score {
  font-size: 14px;
  opacity: 0.9;
}

/* Game End Modal Styles */
.modal-large {
  max-width: 600px;
}

.winner-announce {
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  padding: 20px;
  border-radius: 8px;
  margin: 20px 0;
  text-align: center;
}

.winner-text {
  font-size: 24px;
  font-weight: 700;
  color: #333;
  margin: 0;
}

.settlement-table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}

.settlement-table th,
.settlement-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.settlement-table th {
  background: rgba(30, 136, 229, 0.1);
  font-weight: 600;
}

.score-positive {
  color: #43a047;
  font-weight: 600;
}

.score-negative {
  color: #e53935;
  font-weight: 600;
}

.mt-2 {
  margin-top: 20px;
}

/* Declare Panel Styles */
.modal-declare {
  max-width: 900px;
  max-height: 90vh;
  overflow-y: auto;
}

.declare-hand-display {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  margin-bottom: 30px;
  justify-content: center;
  min-height: 120px;
}

.declare-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.declare-section h3 {
  color: #333;
  margin-bottom: 10px;
  font-size: 20px;
}

.declare-section p {
  color: #666;
  margin-bottom: 15px;
  font-size: 14px;
}

.declare-input {
  width: 100%;
  padding: 15px;
  font-size: 24px;
  text-align: center;
  border-radius: 8px;
  border: 2px solid #1E88E5;
  font-weight: 600;
}

/* Fish Selection Styles */
.fish-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 8px;
}

.fish-section h3 {
  color: #333;
  margin-bottom: 10px;
  font-size: 20px;
}

.fish-selection {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 15px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  min-height: 100px;
  max-height: 250px;
  overflow-y: auto;
  margin: 15px 0;
  justify-content: center;
}

.fish-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.fish-actions button {
  flex: 1;
}

.btn-tertiary {
  background: #757575;
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-tertiary:hover {
  background: #616161;
  transform: translateY(-2px);
}
</style>
