<template>
  <div class="game-container">
    <!-- Orientation Guard -->
    <OrientationGuard />

    <!-- Loading Screen -->
    <div v-if="screen === 'loading'" class="screen">
      <div class="screen-content">
        <h1>🎴 四色牌游戏</h1>
        <p class="slogan">"象棋魂·麻将韵·纸牌趣——四色牌，一局见真章！"</p>
        <button class="btn-primary" @click="goToRoom">开始游戏</button>
      </div>
    </div>

    <!-- Room Setup Screen -->
    <div v-else-if="screen === 'room'" class="screen">
      <div class="screen-content">
        <h2 style="margin-bottom: 30px;">房间设置</h2>
        <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
          <p style="margin-bottom: 20px;">玩家设置</p>
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px;">你的名字:</label>
            <input 
              v-model="playerName" 
              type="text" 
              placeholder="输入你的名字"
              style="padding: 10px; border-radius: 6px; border: none; width: 200px; font-size: 16px;"
            />
          </div>
          <p style="margin-top: 30px; margin-bottom: 10px;">其他玩家将由AI控制</p>
        </div>
        <button class="btn-primary mt-2" @click="startGame">开始游戏</button>
        <button class="btn-secondary mt-2" @click="screen = 'loading'">返回</button>
      </div>
    </div>

    <!-- Game Screen -->
    <GameBoard 
      v-else-if="screen === 'game'" 
      :room="room"
      :player-name="playerName"
      :initial-hand="initialHand"
      @leave="handleLeave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import * as Colyseus from 'colyseus.js';
import OrientationGuard from './components/OrientationGuard.vue';
import GameBoard from './components/GameBoard.vue';

const screen = ref<'loading' | 'room' | 'game'>('loading');
const playerName = ref('玩家1');
const room = ref<Colyseus.Room | null>(null);
const initialHand = ref<any[]>([]);
const client = new Colyseus.Client('ws://localhost:2567');

function goToRoom() {
  screen.value = 'room';
}

async function startGame() {
  try {
    // Join or create a game room
    const gameRoom = await client.joinOrCreate('game_room', {
      name: playerName.value,
      isAI: false
    });

    // CRITICAL: Register message handler immediately before any messages are sent
    gameRoom.onMessage('private_hand', (hand) => {
      console.log('[App.vue] Received private_hand:', hand.length, 'cards');
      initialHand.value = hand;
    });

    // Create AI players if needed
    const playersNeeded = 4 - 1; // 1 human + 3 AI
    for (let i = 0; i < playersNeeded; i++) {
      await client.joinOrCreate('game_room', {
        name: `AI ${i + 1}`,
        isAI: true,
        aiDifficulty: 'normal'
      });
    }

    room.value = gameRoom;
    screen.value = 'game';

    console.log('Joined room:', gameRoom.sessionId);
  } catch (e) {
    console.error('Failed to join room:', e);
    alert('连接服务器失败，请确保服务器正在运行');
  }
}

function handleLeave() {
  if (room.value) {
    room.value.leave();
    room.value = null;
  }
  screen.value = 'loading';
}
</script>
