<template>
  <div class="board">
    <div class="grid">
      <section
        v-for="player in players"
        :key="player.clientId"
        class="player"
        :class="{ active: isCurrentTurn(player.clientId), me: isMe(player.clientId) }"
      >
        <header class="player-head">
          <div class="head-left">
            <strong>{{ player.name }}</strong>
            <small>声明: {{ player.declaredKongs }} 坎</small>
          </div>
          <div class="tags">
            <span v-if="isMe(player.clientId)" class="tag me">你</span>
            <span v-if="isCurrentTurn(player.clientId)" class="tag turn">当前回合</span>
            <span class="tag status">{{ statusText(player) }}</span>
          </div>
        </header>

        <div class="areas">
          <div class="exposed">
            <h4>明示区</h4>
            <div class="cards">
              <CardComp v-for="card in player.exposedArea" :key="`exp-${card.id}`" :card="card" />
            </div>

            <div v-if="player.generalArea.length" class="fish">
              <h4>将牌区</h4>
              <div class="cards">
                <CardComp v-for="card in player.generalArea" :key="`general-${card.id}`" :card="card" />
              </div>
            </div>

            <div v-if="player.fishArea.length" class="fish">
              <h4>亮鱼区</h4>
              <div class="cards">
                <CardComp v-for="card in player.fishArea" :key="`fish-${card.id}`" :card="card" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="center">
      <h3>当前待响区</h3>
      <p class="turn-line">当前行动者: <strong>{{ currentPlayerName }}</strong><span v-if="isMyTurn">（你）</span></p>
      <DiscardZone title="公共弃牌区" :cards="publicDiscardCards" />
      <div class="response-wrap" v-if="responseCard">
        <CardComp :key="`resp-${responseCard.id}-${responseCard.source || 'upper'}`" :card="responseCard" />
        <small>来源: {{ responseCard.source === "draw" ? "摸牌" : "他人弃牌" }}</small>
      </div>
      <p class="hint">{{ state?.lastAction || "等待中..." }}</p>
    </section>

    <section class="self">
      <h3>我的手牌（私有）</h3>
      <p v-if="canDiscard" class="discard-tip">点击手牌弃一张（将牌不可弃）</p>
      <div class="cards hand">
        <button
          v-for="card in privateHand"
          :key="`me-${card.id}`"
          class="hand-card"
          :disabled="!canDiscardCard(card)"
          @click="onDiscard(card.id)"
        >
          <CardComp :card="card" />
        </button>
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
  mySeatId: string;
  canDiscard?: boolean;
}>();

const emit = defineEmits<{
  discardCard: [cardId: string];
}>();

const latestDiscardFromAction = computed<Card | null>(() => {
  const match = String(props.state?.lastAction ?? "").match(/^(\S+)\s+DISCARD$/);
  if (!match) {
    return null;
  }

  const ownerId = match[1];
  const owner = props.players.find((x) => x.clientId === ownerId);
  const latestDiscard = owner?.discardPile?.[0];
  if (latestDiscard?.id) {
    return { ...latestDiscard, source: "upper" };
  }

  const publicTop = props.state?.publicDiscardPile?.[0];
  if (publicTop?.id) {
    return { ...(publicTop as Card), source: "upper" };
  }

  return null;
});

const responseCard = computed<Card | null>(() => {
  const collective = props.state?.responsePhase === "collective";
  if (collective) {
    const publicTop = props.state?.publicDiscardPile?.[0];
    if (publicTop?.id) {
      return { ...(publicTop as Card), source: "upper" };
    }
    if (latestDiscardFromAction.value?.id) {
      return latestDiscardFromAction.value;
    }
  }

  const card = props.state?.responseCard;
  if (card?.id) {
    return card as Card;
  }

  return latestDiscardFromAction.value;
});

const publicDiscardCards = computed<Card[]>(() => {
  const cards = props.state?.publicDiscardPile;
  if (Array.isArray(cards) && cards.length > 0) {
    return cards as Card[];
  }
  const latest = latestDiscardFromAction.value;
  return latest ? [latest] : [];
});

const currentPlayer = computed(() => {
  const playerId = props.state?.currentPlayerId;
  if (!playerId) {
    return null;
  }
  return props.players.find((x) => x.clientId === playerId) ?? null;
});

const currentPlayerName = computed(() => {
  const playerId = props.state?.currentPlayerId;
  if (!playerId) {
    return "-";
  }
  return currentPlayer.value?.name || playerId;
});

const isMyTurn = computed(
  () =>
    Boolean(props.mySeatId) &&
    props.state?.currentPlayerId === props.mySeatId &&
    !Boolean(currentPlayer.value?.isBot),
);

const canDiscard = computed(() => Boolean(props.canDiscard));

function isCurrentTurn(playerId: string): boolean {
  return props.state?.currentPlayerId === playerId;
}

function isMe(playerId: string): boolean {
  return props.mySeatId === playerId;
}

function statusText(player: PlayerState): string {
  if (player.isBot) {
    return "BOT托管";
  }
  return player.connected ? "在线" : "离线";
}

function canDiscardCard(card: Card): boolean {
  return canDiscard.value && card.type !== "jiang";
}

function onDiscard(cardId: string): void {
  if (!canDiscard.value) {
    return;
  }
  emit("discardCard", cardId);
}
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

.player.active {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
}

.player.me {
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25) inset;
}

.player-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  color: #e2e8f0;
  margin-bottom: 8px;
}

.head-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.tag {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 18px;
  border: 1px solid #334155;
  color: #cbd5e1;
}

.tag.me {
  border-color: #0ea5e9;
  color: #bae6fd;
}

.tag.turn {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  color: #bbf7d0;
}

.tag.status {
  border-color: #334155;
}

.areas {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.exposed {
  background: #111827;
  border-radius: 10px;
  border: 1px solid #334155;
  padding: 8px;
}

.exposed h4,
.fish h4 {
  margin: 0 0 6px;
  color: #cbd5e1;
  font-size: 13px;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.fish {
  margin-top: 8px;
  border-top: 1px dashed #334155;
  padding-top: 8px;
}

.center {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 10px;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.center h3 {
  margin: 0;
}

.turn-line {
  margin: 0;
  color: #93c5fd;
}

.response-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
}

.self {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 10px;
  color: #e2e8f0;
}

.self h3 {
  margin: 0 0 8px;
}

.discard-tip {
  margin: 0 0 8px;
  color: #facc15;
  font-size: 13px;
}

.hand {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hand-card {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}

.hand-card:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
