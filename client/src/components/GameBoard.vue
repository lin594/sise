<template>
  <div class="board">
    <div class="table">
      <section
        v-for="entry in seatEntries"
        :key="entry.position"
        class="seat"
        :class="[entry.position, { active: isCurrentTurn(entry.player.clientId) }]"
      >
        <header class="seat-head">
          <strong>{{ entry.player.name }}</strong>
          <div class="seat-tags">
            <span v-if="isCurrentTurn(entry.player.clientId)" class="tag turn">当前回合</span>
            <span class="tag status">{{ statusText(entry.player) }}</span>
          </div>
        </header>
        <p class="seat-meta">声明暗坎: {{ entry.player.declaredKongs }}</p>

        <div class="seat-zone" v-if="entry.player.exposedArea.length || entry.player.generalArea.length">
          <p>明示区</p>
          <div class="cards">
            <CardComp
              v-for="card in [...entry.player.exposedArea, ...entry.player.generalArea]"
              :key="`exp-${entry.player.clientId}-${card.id}`"
              :card="card"
              size="sm"
            />
          </div>
        </div>

        <div class="seat-zone" v-if="entry.player.fishArea.length">
          <p>亮鱼区</p>
          <div class="cards">
            <CardComp
              v-for="card in entry.player.fishArea"
              :key="`fish-${entry.player.clientId}-${card.id}`"
              :card="card"
              size="sm"
            />
          </div>
        </div>
      </section>

      <section class="center">
        <header class="center-head">
          <h3>中区</h3>
          <p>当前行动者: <strong>{{ currentPlayerName }}</strong><span v-if="isMyTurn">（你）</span></p>
        </header>

        <div class="response-wrap" v-if="responseCard">
          <CardComp :key="`resp-${responseCard.id}-${responseCard.source || 'upper'}`" :card="responseCard" size="lg" />
          <small>待响牌来源: {{ responseCard.source === "draw" ? "摸牌" : "他人弃牌" }}</small>
        </div>

        <p class="hint">{{ state?.lastAction || "等待中..." }}</p>
      </section>
    </div>

    <section class="self-zone" v-if="selfPlayer">
      <header class="self-head">
        <div>
          <h3>{{ selfPlayer.name }}（你）</h3>
          <p>声明暗坎: {{ selfPlayer.declaredKongs }}</p>
        </div>
        <div class="seat-tags">
          <span v-if="isMyTurn" class="tag turn">当前回合</span>
          <span class="tag status">{{ statusText(selfPlayer) }}</span>
        </div>
      </header>

      <div class="self-areas">
        <div class="self-area" v-if="selfPlayer.exposedArea.length || selfPlayer.generalArea.length">
          <p>明示区</p>
          <div class="cards">
            <CardComp
              v-for="card in [...selfPlayer.exposedArea, ...selfPlayer.generalArea]"
              :key="`self-exp-${card.id}`"
              :card="card"
            />
          </div>
        </div>

        <div class="self-area" v-if="selfPlayer.fishArea.length">
          <p>亮鱼区</p>
          <div class="cards">
            <CardComp v-for="card in selfPlayer.fishArea" :key="`self-fish-${card.id}`" :card="card" />
          </div>
        </div>
      </div>

      <p v-if="canDiscard" class="discard-tip">点击手牌弃一张（将牌不可弃）</p>
      <div class="cards hand">
        <button
          v-for="card in privateHand"
          :key="`me-${card.id}`"
          class="hand-card"
          :class="{ playable: canDiscardCard(card), blocked: !canDiscardCard(card) }"
          :disabled="!canDiscardCard(card)"
          @click="onDiscard(card.id)"
        >
          <CardComp :card="card" size="xl" />
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CardComp from "./Card.vue";
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

const orderedPlayers = computed<PlayerState[]>(() => {
  const list = props.players ?? [];
  if (!list.length) {
    return [];
  }
  const idx = list.findIndex((p) => p.clientId === props.mySeatId);
  if (idx < 0) {
    return list;
  }
  return [...list.slice(idx), ...list.slice(0, idx)];
});

const selfPlayer = computed<PlayerState | null>(() => orderedPlayers.value[0] ?? null);
const rightPlayer = computed<PlayerState | null>(() => orderedPlayers.value[1] ?? null);
const topPlayer = computed<PlayerState | null>(() => orderedPlayers.value[2] ?? null);
const leftPlayer = computed<PlayerState | null>(() => orderedPlayers.value[3] ?? null);

const seatEntries = computed<Array<{ position: "top" | "left" | "right"; player: PlayerState }>>(() => {
  const entries: Array<{ position: "top" | "left" | "right"; player: PlayerState | null }> = [
    { position: "top", player: topPlayer.value },
    { position: "left", player: leftPlayer.value },
    { position: "right", player: rightPlayer.value },
  ];
  return entries.filter((x): x is { position: "top" | "left" | "right"; player: PlayerState } => Boolean(x.player));
});

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
  grid-template-rows: 1fr auto;
  gap: 12px;
}

.table {
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 260px;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "top top top"
    "left center right";
  gap: 10px;
}

.seat {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 8px;
  color: #e2e8f0;
}

.seat.top {
  grid-area: top;
}

.seat.left {
  grid-area: left;
}

.seat.right {
  grid-area: right;
}

.seat.active {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
}

.seat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.seat-meta {
  margin: 6px 0;
  color: #93c5fd;
  font-size: 12px;
}

.seat-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 18px;
  border: 1px solid #334155;
  color: #cbd5e1;
}

.tag.turn {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  color: #bbf7d0;
}

.tag.status {
  border-color: #334155;
}

.seat-zone {
  margin-top: 8px;
  border-top: 1px dashed #334155;
  padding-top: 8px;
}

.seat-zone p {
  margin: 0 0 6px;
  font-size: 12px;
  color: #cbd5e1;
}

.center {
  grid-area: center;
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 10px;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.center-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.center-head h3,
.center-head p {
  margin: 0;
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

.empty {
  margin: 0;
  color: #64748b;
}

.self-zone {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 10px;
  color: #e2e8f0;
}

.self-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.self-head h3,
.self-head p {
  margin: 0;
}

.self-areas {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.self-area {
  background: #111827;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px;
}

.self-area p {
  margin: 0 0 6px;
  color: #cbd5e1;
  font-size: 12px;
}

.discard-tip {
  margin: 8px 0;
  color: #facc15;
  font-size: 13px;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hand {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hand-card {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 10px;
  transition: transform 0.2s ease, filter 0.2s ease;
}

.hand-card.playable:hover {
  transform: translateY(-4px);
}

.hand-card.blocked {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.2);
}

@media (max-width: 1200px) {
  .table {
    grid-template-columns: 220px minmax(0, 1fr) 220px;
  }

}

@media (max-width: 900px) {
  .table {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto;
    grid-template-areas:
      "top"
      "left"
      "right"
      "center";
  }

  .self-areas {
    grid-template-columns: 1fr;
  }
}
</style>
