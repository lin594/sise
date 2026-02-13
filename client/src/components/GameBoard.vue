<template>
  <div class="board">
    <div class="table">
      <section
        v-for="entry in seatEntries"
        :key="entry.position"
        class="seat"
        :class="[entry.position, { active: isCurrentTurn(entry.player.clientId), 'with-fish': entry.player.fishArea.length > 0 }]"
      >
        <header class="seat-head">
          <strong>{{ entry.player.name }}</strong>
          <div class="seat-tags">
            <span v-if="isCurrentTurn(entry.player.clientId)" class="tag turn">当前回合</span>
            <span class="tag status">{{ statusText(entry.player) }}</span>
          </div>
        </header>

        <p class="seat-meta">声明暗坎: {{ entry.player.declaredKongs }}</p>

        <div class="seat-zone">
          <p>明示区</p>
          <div class="cards" v-if="entry.openCards.length">
            <CardComp
              v-for="card in entry.openCards"
              :key="`exp-${entry.player.clientId}-${card.id}`"
              :card="card"
              size="sm"
            />
          </div>
          <p v-else class="empty">（无）</p>
        </div>

        <div class="seat-zone" v-if="entry.player.fishArea.length">
          <p>亮鱼区</p>
          <div class="cards" v-if="entry.player.fishArea.length">
            <CardComp
              v-for="card in entry.player.fishArea"
              :key="`fish-${entry.player.clientId}-${card.id}`"
              :card="card"
              size="sm"
            />
          </div>
          <p v-else class="empty">（无）</p>
        </div>
      </section>

      <section class="center">
        <header class="center-head">
          <h3>牌桌中区</h3>
          <p>当前行动者: <strong>{{ currentPlayerName }}</strong><span v-if="isMyTurn">（你）</span></p>
        </header>

        <div class="response-wrap" v-if="responseCard">
          <CardComp :key="`resp-${responseCard.id}-${responseCard.source || 'upper'}`" :card="responseCard" size="lg" />
          <small>待响牌来源: {{ responseCard.source === "draw" ? "摸牌" : "他人弃牌" }}</small>
        </div>

        <div class="response-wrap response-empty" v-else>
          <div class="ghost-card">待响牌</div>
          <small>暂无待响牌</small>
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
        <div class="self-area">
          <p>明示区</p>
          <div class="cards" v-if="selfOpenCards.length">
            <CardComp v-for="card in selfOpenCards" :key="`self-exp-${card.id}`" :card="card" />
          </div>
          <p v-else class="empty">（无）</p>
        </div>

        <div class="self-area" v-if="selfPlayer.fishArea.length">
          <p>亮鱼区</p>
          <div class="cards" v-if="selfPlayer.fishArea.length">
            <CardComp v-for="card in selfPlayer.fishArea" :key="`self-fish-${card.id}`" :card="card" />
          </div>
          <p v-else class="empty">（无）</p>
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

const seatEntries = computed<Array<{ position: "top" | "left" | "right"; player: PlayerState; openCards: Card[] }>>(() => {
  const entries: Array<{ position: "top" | "left" | "right"; player: PlayerState | null }> = [
    { position: "top", player: topPlayer.value },
    { position: "left", player: leftPlayer.value },
    { position: "right", player: rightPlayer.value },
  ];

  return entries
    .filter((x): x is { position: "top" | "left" | "right"; player: PlayerState } => Boolean(x.player))
    .map((entry) => ({
      ...entry,
      openCards: [...entry.player.exposedArea, ...entry.player.generalArea],
    }));
});

const selfOpenCards = computed<Card[]>(() => {
  const player = selfPlayer.value;
  if (!player) {
    return [];
  }
  return [...player.exposedArea, ...player.generalArea];
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
  grid-template-rows: minmax(300px, 1fr) auto;
  gap: 10px;
}

.table {
  width: min(100%, calc((100dvh - 210px) * 2.2));
  aspect-ratio: 2.2 / 1;
  height: auto;
  min-height: 280px;
  max-height: 460px;
  margin: 0 auto;
  border-radius: 34px;
  border: 1px solid #1e293b;
  background:
    radial-gradient(120% 90% at 50% 50%, rgba(6, 78, 59, 0.9), rgba(15, 23, 42, 0.96) 70%),
    linear-gradient(160deg, #0b1220 0%, #020617 100%);
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(196px, 25%) minmax(280px, 1fr) minmax(196px, 25%);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    ". top ."
    "left center right";
  column-gap: 16px;
  row-gap: 12px;
  padding: 12px;
}

.seat {
  background: rgba(11, 18, 32, 0.88);
  border: 1px solid #1e293b;
  border-radius: 14px;
  padding: 8px;
  color: #e2e8f0;
  display: grid;
  grid-template-rows: auto auto minmax(86px, 1fr);
  gap: 6px;
  overflow: hidden;
  min-height: 0;
}

.seat.with-fish {
  grid-template-rows: auto auto minmax(62px, 1fr) minmax(62px, 1fr);
}

.seat.top {
  grid-area: top;
  width: min(100%, 760px);
  justify-self: center;
  height: 136px;
}

.seat.left {
  grid-area: left;
  width: 100%;
  height: 100%;
}

.seat.right {
  grid-area: right;
  width: 100%;
  height: 100%;
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
  margin: 0;
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
  margin: 0;
  border-top: 1px dashed #334155;
  padding-top: 6px;
  min-height: 0;
}

.seat-zone p {
  margin: 0 0 6px;
  font-size: 12px;
  color: #cbd5e1;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.seat-zone .cards {
  max-height: 62px;
  overflow: auto;
  padding-right: 2px;
}

.center {
  grid-area: center;
  width: min(100%, 520px);
  justify-self: center;
  min-width: 280px;
  min-height: 0;
  background: rgba(11, 18, 32, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 20px;
  padding: 12px;
  color: #e2e8f0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  text-align: center;
  align-self: stretch;
}

.center-head {
  display: grid;
  gap: 4px;
}

.center-head h3,
.center-head p {
  margin: 0;
}

.response-wrap {
  border: 1px dashed #334155;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 8px;
  min-height: 112px;
}

.response-wrap small {
  color: #bfdbfe;
}

.response-empty {
  color: #64748b;
}

.ghost-card {
  width: 66px;
  height: 92px;
  border-radius: 10px;
  border: 2px dashed #334155;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: #64748b;
}

.hint {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
}

.empty {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.self-zone {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 14px;
  padding: 10px;
  color: #e2e8f0;
  display: grid;
  grid-template-rows: auto auto auto auto;
  gap: 8px;
  min-height: 0;
  max-height: none;
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.self-area {
  background: #111827;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  min-height: 96px;
  overflow: hidden;
}

.self-area p {
  margin: 0 0 6px;
  color: #cbd5e1;
  font-size: 12px;
}

.self-area .cards {
  max-height: 68px;
  overflow: auto;
  padding-right: 2px;
}

.discard-tip {
  margin: 0;
  color: #facc15;
  font-size: 13px;
}

.hand {
  align-content: flex-start;
  overflow: visible;
  padding-right: 4px;
  gap: 10px;
  max-height: none;
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
    width: min(100%, calc((100dvh - 190px) * 2.05));
    max-height: 420px;
    grid-template-columns: minmax(168px, 25%) minmax(240px, 1fr) minmax(168px, 25%);
    padding: 10px;
    column-gap: 10px;
    row-gap: 8px;
  }

  .center {
    width: min(100%, 460px);
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .board {
    grid-template-rows: minmax(220px, 1fr) auto;
    gap: 6px;
  }

  .table {
    width: min(100%, calc((100dvh - 150px) * 2.1));
    min-height: 210px;
    max-height: 340px;
    border-radius: 16px;
    padding: 8px;
    column-gap: 8px;
    row-gap: 6px;
  }

  .seat {
    padding: 5px;
    gap: 4px;
  }

  .seat.top {
    height: 92px;
  }

  .seat.left,
  .seat.right {
    min-width: 140px;
  }

  .center {
    min-height: 0;
    width: min(100%, 340px);
    padding: 8px;
    gap: 6px;
    border-radius: 14px;
  }

  .center-head h3 {
    font-size: 14px;
  }

  .center-head p {
    font-size: 12px;
  }

  .response-wrap {
    padding: 6px;
    min-height: 84px;
  }

  .response-wrap small {
    font-size: 11px;
  }

  .hint {
    font-size: 11px;
  }

  .ghost-card {
    width: 46px;
    height: 66px;
    font-size: 11px;
  }

  .self-zone {
    padding: 8px;
    gap: 6px;
  }

  .self-head h3 {
    font-size: 16px;
  }

  .self-head p {
    font-size: 12px;
  }

  .hand {
    gap: 6px;
  }
}

@media (max-width: 900px) and (orientation: portrait) {
  .board {
    grid-template-rows: auto auto;
  }

  .table {
    position: static;
    height: auto;
    min-height: 0;
    display: grid;
    gap: 10px;
    padding: 10px;
    border-radius: 14px;
  }

  .seat,
  .center {
    position: static;
    width: auto;
    min-width: 0;
    height: auto;
    min-height: 0;
  }

  .center {
    order: 4;
    grid-template-rows: auto auto auto;
  }

  .seat.top {
    order: 1;
  }

  .seat.left {
    order: 2;
  }

  .seat.right {
    order: 3;
  }

  .seat-zone .cards,
  .self-area .cards {
    max-height: 110px;
  }

  .self-zone {
    min-height: 0;
    max-height: none;
  }

  .self-areas {
    grid-template-columns: 1fr;
  }
}
</style>
