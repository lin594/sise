<template>
  <OrientationGuard />
  <main class="layout" :class="{ playing: isPlaying, 'compact-landscape': isCompactLandscape && isPlaying }">
    <header class="top">
      <h1>四色牌 v4.0</h1>
      <div class="meta">
        <span>{{ connected ? "已连接" : "连接中..." }}</span>
        <span>座位ID: {{ mySeatId || "-" }}</span>
        <span>房主: {{ state?.hostPlayerId || "-" }}</span>
        <span>庄家: {{ dealerName }}</span>
      </div>
    </header>

    <section v-if="isWaiting" class="lobby">
      <h2>等待大厅</h2>
      <p>房主手动开始。人数不足 4 人时，开始后自动补机器人。</p>
      <div class="lobby-actions">
        <button class="primary" :disabled="!isHost" @click="startGame">
          {{ isHost ? "开始游戏" : "等待房主开始" }}
        </button>
      </div>
      <p v-if="joinError" class="error">{{ joinError }}</p>

      <div class="player-grid">
        <div v-for="p in players" :key="p.clientId" class="player-item">
          <strong>{{ p.name }}</strong>
          <small>{{ p.clientId === state?.hostPlayerId ? "房主" : "玩家" }}</small>
          <small>{{ p.isBot ? "BOT托管" : p.connected ? "在线" : "离线" }}</small>
        </div>
      </div>
    </section>

    <template v-else>
      <section v-if="isPlaying" class="turn-banner" :class="{ mine: isMyTurn }">
        <strong>当前回合: {{ currentPlayerName }}</strong>
        <span>{{ turnHint }}</span>
      </section>
      <GameBoard
        :state="state"
        :players="players"
        :private-hand="privateHand"
        :my-seat-id="mySeatId"
        :can-discard="canDiscard"
        :actions="availableActions"
        :can-act="canAct"
        :is-current-turn="isMyTurn"
        :response-phase="state?.responsePhase || ''"
        :current-player-name="currentPlayerName"
        :turn-hint="turnHint"
        :embedded-action-panel="isCompactLandscape"
        @discard-card="sendDiscardCard"
        @submit-action="sendAction"
      />
    </template>

    <ActionPanel
      v-if="isPlaying && !isCompactLandscape"
      :actions="availableActions"
      :can-act="canAct"
      :is-current-turn="isMyTurn"
      :response-phase="state?.responsePhase || ''"
      :current-player-name="currentPlayerName"
      @submit="sendAction"
    />

    <div v-if="shouldShowDeclarePanel" class="declare-mask">
      <div class="declare-panel">
        <h2>请声明暗坎数量并选择亮鱼</h2>
        <p class="declare-desc">
          声明超时将自动按 0 提交。亮鱼可不选。剩余 {{ declareSecondsLeft }} 秒
        </p>
        <p v-if="isDeclareSubmitted" class="declare-submitted">你已提交声明，等待其他玩家...</p>
        <div class="declare-progress">
          <div class="declare-progress-fill" :style="{ width: `${declareProgressPercent}%` }"></div>
        </div>

        <label class="declare-input">
          暗坎数量
          <input v-model.number="declareKongsInput" type="number" min="0" step="1" :disabled="isDeclareSubmitted" />
        </label>

        <section class="declare-zone">
          <p class="zone-title">选择亮鱼（点击手牌切换）</p>
          <div class="declare-cards" v-if="privateHand.length">
            <button
              v-for="card in privateHand"
              :key="`declare-hand-${card.id}`"
              class="declare-card-btn"
              :class="{ selected: selectedFishCardIds.has(card.id) }"
              :disabled="isDeclareSubmitted"
              @click="toggleFish(card.id)"
            >
              <CardComp :card="card" />
            </button>
          </div>
          <p v-else class="settlement-empty">（无可选手牌）</p>
        </section>

        <section class="declare-zone">
          <p class="zone-title">已选亮鱼</p>
          <div class="declare-cards" v-if="selectedFishCards.length">
            <CardComp v-for="card in selectedFishCards" :key="`declare-fish-${card.id}`" :card="card" />
          </div>
          <p v-else class="settlement-empty">（未选择）</p>
          <p v-if="!fishSelectionValid" class="error">亮鱼组合不合法：普通鱼需4张同牌；金条鱼需4或5张金条。</p>
          <p v-if="declareError" class="error">{{ declareError }}</p>
        </section>

        <div class="end-actions">
          <button class="primary" :disabled="!fishSelectionValid || isDeclareSubmitted" @click="submitDeclaration">
            {{ isDeclareSubmitted ? "已提交" : "确认声明" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showEndPanel" class="hu-mask">
      <div class="hu-panel">
        <h2>{{ endPanelTitle }}</h2>
        <template v-if="huResult">
          <p>赢家: {{ winnerName }}</p>
          <p>牌型: {{ huResult.groups.join(" / ") || "-" }}</p>
        </template>
        <template v-else>
          <p>{{ endSummary }}</p>
          <p>最后动作: {{ state?.lastAction || "-" }}</p>
        </template>

        <section v-if="settlementPlayers.length" class="settlement">
          <h3>手牌展示</h3>
          <div class="settlement-list">
            <div v-for="p in settlementPlayers" :key="`settle-${p.clientId}`" class="settlement-item">
              <p class="settlement-name">{{ p.name }}</p>
              <p class="settlement-meta">
                明示区: {{ p.exposedArea.length + p.generalArea.length }} 张 / 亮鱼区: {{ p.fishArea.length }} 张 / 弃牌: {{ p.discardCount }} 张
              </p>
              <div class="settlement-cards" v-if="p.hand.length">
                <CardComp v-for="card in p.hand" :key="`settle-${p.clientId}-${card.id}`" :card="card" />
              </div>
              <p v-else class="settlement-empty">（无手牌）</p>

              <div class="settlement-zone">
                <p class="zone-title">明示区</p>
                <div class="settlement-cards" v-if="p.exposedArea.length + p.generalArea.length">
                  <CardComp v-for="card in [...p.exposedArea, ...p.generalArea]" :key="`settle-e-${p.clientId}-${card.id}`" :card="card" />
                </div>
                <p v-else class="settlement-empty">（无）</p>
              </div>

              <div class="settlement-zone">
                <p class="zone-title">亮鱼区</p>
                <div class="settlement-cards" v-if="p.fishArea.length">
                  <CardComp v-for="card in p.fishArea" :key="`settle-fish-${p.clientId}-${card.id}`" :card="card" />
                </div>
                <p v-else class="settlement-empty">（无）</p>
              </div>

              <div class="score-breakdown">
                <p class="zone-title">分数明细</p>
                <p v-if="!p.scoreBreakdown.length" class="settlement-empty">（无）</p>
                <ul v-else>
                  <li v-for="line in p.scoreBreakdown" :key="`score-${p.clientId}-${line.key}`">
                    {{ line.label }} x{{ line.count }}（{{ line.unit }}分）= {{ line.total }}分
                  </li>
                </ul>
                <p class="score-total">总分: {{ p.totalScore }}</p>
              </div>
            </div>
          </div>
        </section>

        <div class="end-actions">
          <button class="primary" :disabled="!isHost || !isEnded" @click="nextRound">
            下一局（房主）
          </button>
          <button class="ghost" :disabled="!isEnded" @click="returnLobby">返回大厅</button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import CardComp from "@/components/Card.vue";
import GameBoard from "@/components/GameBoard.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
import type { RoundResultPlayer } from "@/types/game";

const {
  connected,
  mySeatId,
  state,
  players,
  privateHand,
  availableActions,
  huResult,
  roundResult,
  joinError,
  declareError,
  sendAction,
  sendDiscardCard,
  declareSetup,
  startGame,
  nextRound,
  returnLobby,
} = useRoom("玩家");

const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const isMyTurn = computed(() => {
  if (!mySeatId.value || state.value?.currentPlayerId !== mySeatId.value) {
    return false;
  }
  const me = players.value.find((x) => x.clientId === mySeatId.value);
  return !Boolean(me?.isBot);
});

const canAct = computed(() => isPlaying.value && availableActions.value.some((x) => x.enabled));
const canDiscard = computed(
  () => isPlaying.value && isMyTurn.value && state.value?.responsePhase === "self_grab" && !canAct.value,
);
const isCompactLandscape = ref(false);
const updateCompactLandscape = () => {
  isCompactLandscape.value = window.matchMedia("(orientation: landscape) and (max-width: 960px)").matches;
};

const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
const mePlayer = computed(() => players.value.find((x) => x.clientId === mySeatId.value) ?? null);
const isDeclareSubmitted = computed(() => Boolean(mePlayer.value?.declaredReady));
const shouldShowDeclarePanel = computed(
  () => isDeclaring.value && Boolean(mySeatId.value) && !Boolean(mePlayer.value?.isBot),
);

const declareKongsInput = ref(0);
const nowMs = ref(Date.now());
let declareTick: number | null = null;
const selectedFishCardIds = ref<Set<string>>(new Set());
const selectedFishCards = computed(() => privateHand.value.filter((card) => selectedFishCardIds.value.has(card.id)));
const declareSecondsLeft = computed(() => {
  const endsAt = Number(state.value?.declareEndsAt ?? 0);
  if (!endsAt) {
    return 0;
  }
  return Math.max(0, Math.ceil((endsAt - nowMs.value) / 1000));
});
const declareTotalMs = computed(() => {
  const action = String(state.value?.lastAction ?? "");
  const match = action.match(/DECLARING\s+(\d+)ms/);
  if (match) {
    return Math.max(1000, Number(match[1]) || 30000);
  }
  return 30000;
});
const declareProgressPercent = computed(() => {
  const endsAt = Number(state.value?.declareEndsAt ?? 0);
  if (!endsAt) {
    return 0;
  }
  const remain = Math.max(0, endsAt - nowMs.value);
  const percent = (remain / declareTotalMs.value) * 100;
  return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
});
const fishSelectionValid = computed(() => {
  const cards = selectedFishCards.value;
  if (!cards.length) {
    return true;
  }
  let goldCount = 0;
  const nonGoldFaceCounter = new Map<string, number>();
  for (const card of cards) {
    if (card.color === "gold") {
      goldCount += 1;
      continue;
    }
    const key = `${card.color}:${card.type}`;
    nonGoldFaceCounter.set(key, (nonGoldFaceCounter.get(key) ?? 0) + 1);
  }
  for (const count of nonGoldFaceCounter.values()) {
    if (count !== 4) {
      return false;
    }
  }
  return goldCount === 0 || goldCount === 4 || goldCount === 5;
});

function toggleFish(cardId: string) {
  if (isDeclareSubmitted.value) {
    return;
  }
  const next = new Set(selectedFishCardIds.value);
  if (next.has(cardId)) {
    next.delete(cardId);
  } else {
    next.add(cardId);
  }
  selectedFishCardIds.value = next;
}

function submitDeclaration() {
  if (!fishSelectionValid.value || isDeclareSubmitted.value) {
    return;
  }
  declareSetup({
    declaredKongs: Math.max(0, Number(declareKongsInput.value) || 0),
    fishCardIds: [...selectedFishCardIds.value],
  });
}

watch(shouldShowDeclarePanel, (show) => {
  if (show) {
    selectedFishCardIds.value = new Set();
    declareKongsInput.value = Number(mePlayer.value?.declaredKongs ?? 0);
  }
});

onMounted(() => {
  declareTick = window.setInterval(() => {
    nowMs.value = Date.now();
  }, 500);
  updateCompactLandscape();
  window.addEventListener("resize", updateCompactLandscape);
  window.addEventListener("orientationchange", updateCompactLandscape);
});

onUnmounted(() => {
  if (declareTick !== null) {
    window.clearInterval(declareTick);
    declareTick = null;
  }
  window.removeEventListener("resize", updateCompactLandscape);
  window.removeEventListener("orientationchange", updateCompactLandscape);
});
const endPanelTitle = computed(() => (huResult.value ? "胡牌结算" : "本局结束"));
const winnerName = computed(() => {
  const winnerId = huResult.value?.winnerId ?? roundResult.value?.winnerId;
  if (!winnerId) {
    return "-";
  }
  const player = players.value.find((x) => x.clientId === winnerId);
  return player?.name || winnerId;
});

const settlementPlayers = computed<RoundResultPlayer[]>(() => roundResult.value?.players ?? []);

const endSummary = computed(() => {
  const action = String(state.value?.lastAction ?? "");
  if (action === "DECK_EMPTY") {
    return "牌堆耗尽，流局。";
  }
  const noDiscardMatch = action.match(/^(\S+)\s+NO_DISCARD$/);
  if (noDiscardMatch) {
    const seatId = noDiscardMatch[1];
    const player = players.value.find((x) => x.clientId === seatId);
    return `${player?.name || seatId} 无可弃牌，流局。`;
  }
  return "对局结束。";
});

const turnHint = computed(() => {
  if (canDiscard.value) {
    return "请点击手牌弃一张";
  }
  if (state.value?.responsePhase === "collective") {
    if (!isMyTurn.value && canAct.value) {
      return "他人待响阶段：你可以选择胡/开/碰/吃/过";
    }
    if (isMyTurn.value) {
      return "等待他人响应";
    }
  }
  return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});

const currentPlayerName = computed(() => {
  const playerId = state.value?.currentPlayerId;
  if (!playerId) {
    return "-";
  }
  const player = players.value.find((x) => x.clientId === playerId);
  return player?.name || playerId;
});

const dealerName = computed(() => {
  const dealerId = String(state.value?.dealerId ?? "");
  if (!dealerId) {
    return "-";
  }
  return players.value.find((p) => p.clientId === dealerId)?.name || dealerId;
});

</script>

<style scoped>
.layout {
  width: 100vw;
  height: 100dvh;
  max-width: none;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: clamp(0.35rem, 1vh, 0.55rem);
  padding: clamp(0.25rem, 0.8vh, 0.5rem);
  background: radial-gradient(circle at 20% 20%, #0f172a 0%, #020617 60%);
  overflow: hidden;
}

.layout.playing {
  grid-template-rows: minmax(2.2rem, 8vh) minmax(2.1rem, 7vh) minmax(0, 1fr) minmax(3.4rem, 16vh);
}

.layout.compact-landscape.playing {
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  padding: max(0.2rem, env(safe-area-inset-top)) max(0.2rem, env(safe-area-inset-right))
    max(0.2rem, env(safe-area-inset-bottom)) max(0.2rem, env(safe-area-inset-left));
}

.layout.compact-landscape .top,
.layout.compact-landscape .turn-banner {
  display: none;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 0.65rem;
  padding: clamp(0.2rem, 0.8vh, 0.45rem) clamp(0.45rem, 1.2vw, 0.75rem);
  color: #e2e8f0;
  min-height: 0;
}

.top h1 {
  margin: 0;
  font-size: clamp(0.95rem, 2.2vh, 1.25rem);
  line-height: 1;
}

.meta {
  display: flex;
  gap: clamp(0.35rem, 1vw, 0.65rem);
  color: #93c5fd;
  font-size: clamp(0.6rem, 1.4vh, 0.78rem);
  align-items: center;
}

.meta span {
  white-space: nowrap;
}

.lobby {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 12px;
  color: #e2e8f0;
}

.lobby-actions {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}

.primary,
.ghost {
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
}

.primary {
  background: #2563eb;
  color: #fff;
}

.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ghost {
  background: #1f2937;
  color: #e2e8f0;
  border: 1px solid #334155;
}

.player-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.player-item {
  background: #111827;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.turn-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: clamp(0.25rem, 0.8vh, 0.45rem) clamp(0.45rem, 1.2vw, 0.75rem);
  border: 1px solid #334155;
  border-radius: 10px;
  background: #111827;
  color: #bfdbfe;
  font-size: clamp(0.66rem, 1.5vh, 0.84rem);
  min-height: 0;
}

.turn-banner.mine {
  border-color: #22c55e;
  background: #052e16;
  color: #bbf7d0;
}

.error {
  color: #fca5a5;
}

.hu-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 80;
}

.declare-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.65);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 90;
}

.declare-panel {
  background: #f8fafc;
  color: #0f172a;
  padding: 18px 22px;
  border-radius: 12px;
  min-width: 320px;
  max-width: min(92vw, 980px);
  max-height: 88vh;
  overflow: auto;
}

.declare-desc {
  margin-top: 0;
  color: #475569;
}

.declare-submitted {
  margin: 0 0 10px;
  color: #16a34a;
  font-weight: 600;
}

.declare-progress {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
  margin-bottom: 10px;
}

.declare-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #84cc16);
  transition: width 0.3s ease;
}

.declare-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 12px;
}

.declare-input input {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}

.declare-zone {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #cbd5e1;
}

.declare-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.declare-card-btn {
  border: 1px solid transparent;
  background: transparent;
  padding: 0;
  border-radius: 6px;
  cursor: pointer;
}

.declare-card-btn.selected {
  border-color: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2);
}

.hu-panel {
  background: #f8fafc;
  color: #0f172a;
  padding: 18px 22px;
  border-radius: 12px;
  min-width: 300px;
  max-width: min(92vw, 1100px);
  max-height: 86vh;
  overflow: auto;
}

.settlement {
  margin-top: 12px;
  border-top: 1px dashed #cbd5e1;
  padding-top: 10px;
}

.settlement h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.settlement-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settlement-item {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
}

.settlement-name {
  margin: 0 0 6px;
  font-weight: 600;
}

.settlement-meta {
  margin: 0 0 8px;
  font-size: 12px;
  color: #334155;
}

.settlement-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settlement-empty {
  margin: 0;
  color: #64748b;
}

.settlement-zone {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

.zone-title {
  margin: 0 0 6px;
  font-size: 12px;
  color: #334155;
  font-weight: 600;
}

.score-breakdown {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

.score-breakdown ul {
  margin: 0;
  padding-left: 18px;
}

.score-breakdown li {
  font-size: 12px;
  color: #0f172a;
}

.score-total {
  margin: 6px 0 0;
  font-weight: 700;
}

.end-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

@media (max-width: 767px) {
  .player-grid {
    grid-template-columns: 1fr;
  }

  .meta {
    flex-direction: column;
    gap: 4px;
    text-align: right;
  }

  .turn-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .settlement-list {
    grid-template-columns: 1fr;
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .layout {
    gap: 0.3rem;
    padding: 0.25rem;
  }

  .top {
    padding: 0.2rem 0.4rem;
  }

  .top h1 {
    font-size: clamp(0.86rem, 2vh, 1.05rem);
  }

  .meta {
    gap: 0.35rem;
    font-size: clamp(0.55rem, 1.25vh, 0.68rem);
  }

  .turn-banner {
    padding: 0.2rem 0.45rem;
    font-size: clamp(0.6rem, 1.3vh, 0.74rem);
  }
}

@media (orientation: landscape) and (max-width: 960px) {
  .layout {
    gap: 0.7vh;
    padding: 0.7vh;
  }

  .layout.playing {
    grid-template-rows: 8vh 8vh minmax(0, 1fr) 16vh;
  }

  .top {
    border-radius: 1.2vh;
    padding: 0.45vh 1.2vw;
  }

  .top h1 {
    font-size: clamp(0.85rem, 2.2vh, 1.05rem);
  }

  .meta {
    font-size: clamp(0.54rem, 1.3vh, 0.66rem);
    gap: 1vw;
    flex-wrap: nowrap;
    justify-content: flex-end;
    overflow: hidden;
  }

  .turn-banner {
    border-radius: 1.2vh;
    padding: 0.45vh 1.2vw;
    font-size: clamp(0.58rem, 1.35vh, 0.74rem);
  }

  .layout.compact-landscape.playing {
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    padding: max(0.15rem, env(safe-area-inset-top)) max(0.15rem, env(safe-area-inset-right))
      max(0.15rem, env(safe-area-inset-bottom)) max(0.15rem, env(safe-area-inset-left));
  }
}
</style>
