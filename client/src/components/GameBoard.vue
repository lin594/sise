<template>
  <div class="board" data-testid="game-board">
    <div class="table" ref="tableRef">
      <section v-if="leftPlayer" class="flow-card flow-top-left">
        <p>{{ flowTitle(leftPlayer.clientId) }}</p>
        <div v-if="flowCardCount(leftPlayer.clientId)" class="discard-strip">
          <span
            v-for="(card, index) in visibleFlowCards(leftPlayer.clientId)"
            :key="`flow-top-left-${card.id}`"
            class="discard-token"
            :class="[cardColorClass(card), { active: isActiveDiscardCard(leftPlayer.clientId, card, index) }]"
            :title="cardLabel(card)"
          >
            {{ cardGlyph(card) }}
          </span>
        </div>
        <div v-else class="discard-empty">暂无流水</div>
      </section>

      <section
        v-if="topPlayer"
        :ref="(el) => topPlayer && setSeatRef(topPlayer.clientId, el as HTMLElement | null)"
        class="player-card player-top"
        :class="{
          active: isCurrentTurn(topPlayer.clientId),
          dealer: isDealer(topPlayer.clientId),
          'actor-flash': flashActorId === topPlayer.clientId,
        }"
      >
        <div v-if="isCurrentTurn(topPlayer.clientId)" class="turn-arrow" aria-hidden="true">▲</div>
        <header class="seat-head">
          <strong>{{ topPlayer.name }}</strong>
          <div class="seat-tags">
            <span v-if="isCurrentTurn(topPlayer.clientId)" class="tag turn">当前回合</span>
            <span
              v-if="isCurrentTurn(topPlayer.clientId) && seatCountdownSeconds !== null"
              class="turn-countdown"
            >
              剩余 {{ seatCountdownSeconds }}s
            </span>
            <span class="tag status">{{ statusText(topPlayer) }}</span>
          </div>
        </header>
        <p class="seat-meta">手牌 {{ playerHandCount(topPlayer) }} 张 · 牌组 {{ topGroupBlocks.length }} 组 · 暗坎 {{ topPlayer.declaredKongs }}</p>
        <div v-if="topGroupBlocks.length" class="group-block-list compact">
          <div
            v-for="group in topGroupBlocks"
            :key="`top-group-${group.id}`"
            class="group-block"
            :class="group.tone"
          >
            <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
            <div class="mini-card-strip">
              <span
                v-for="card in group.cards"
                :key="`top-group-card-${card.id}`"
                class="mini-card"
                :class="cardColorClass(card)"
                :title="cardLabel(card)"
              >
                {{ cardGlyph(card) }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="topPlayer" class="flow-card flow-top-right">
        <p>{{ flowTitle(topPlayer.clientId) }}</p>
        <div v-if="flowCardCount(topPlayer.clientId)" class="discard-strip">
          <span
            v-for="(card, index) in visibleFlowCards(topPlayer.clientId)"
            :key="`flow-top-right-${card.id}`"
            class="discard-token"
            :class="[cardColorClass(card), { active: isActiveDiscardCard(topPlayer.clientId, card, index) }]"
            :title="cardLabel(card)"
          >
            {{ cardGlyph(card) }}
          </span>
        </div>
        <div v-else class="discard-empty">暂无流水</div>
      </section>

      <section
        v-if="leftPlayer"
        :ref="(el) => leftPlayer && setSeatRef(leftPlayer.clientId, el as HTMLElement | null)"
        class="player-card player-left"
        :class="{
          active: isCurrentTurn(leftPlayer.clientId),
          dealer: isDealer(leftPlayer.clientId),
          'actor-flash': flashActorId === leftPlayer.clientId,
        }"
      >
        <div v-if="isCurrentTurn(leftPlayer.clientId)" class="turn-arrow turn-arrow-side" aria-hidden="true">▲</div>
        <header class="seat-head">
          <strong>{{ leftPlayer.name }}</strong>
          <div class="seat-tags">
            <span v-if="isCurrentTurn(leftPlayer.clientId)" class="tag turn">当前回合</span>
            <span
              v-if="isCurrentTurn(leftPlayer.clientId) && seatCountdownSeconds !== null"
              class="turn-countdown"
            >
              剩余 {{ seatCountdownSeconds }}s
            </span>
            <span class="tag status">{{ statusText(leftPlayer) }}</span>
          </div>
        </header>
        <p class="seat-meta">手牌 {{ playerHandCount(leftPlayer) }} 张 · 牌组 {{ leftGroupBlocks.length }} 组 · 暗坎 {{ leftPlayer.declaredKongs }}</p>
        <div v-if="leftGroupBlocks.length" class="group-block-list compact">
          <div
            v-for="group in leftGroupBlocks"
            :key="`left-group-${group.id}`"
            class="group-block"
            :class="group.tone"
          >
            <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
            <div class="mini-card-strip">
              <span
                v-for="card in group.cards"
                :key="`left-group-card-${card.id}`"
                class="mini-card"
                :class="cardColorClass(card)"
                :title="cardLabel(card)"
              >
                {{ cardGlyph(card) }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="center" :class="{ 'my-turn': isMyTurn }">
        <div class="center-board">
          <div
            v-if="topPlayer"
            class="center-seat center-seat-top"
            :class="{ active: displayTurnPlayerId === topPlayer.clientId, responding: isCollectiveResponder(topPlayer.clientId), action: hasSeatAction(topPlayer.clientId) }"
          >
            <div v-if="seatActionText(topPlayer.clientId) || isCollectiveResponder(topPlayer.clientId)" class="center-seat-action">{{ seatActionText(topPlayer.clientId) || "待响" }}</div>
          </div>
          <div
            v-if="leftPlayer"
            class="center-seat center-seat-left"
            :class="{ active: displayTurnPlayerId === leftPlayer.clientId, responding: isCollectiveResponder(leftPlayer.clientId), action: hasSeatAction(leftPlayer.clientId) }"
          >
            <div v-if="seatActionText(leftPlayer.clientId) || isCollectiveResponder(leftPlayer.clientId)" class="center-seat-action">{{ seatActionText(leftPlayer.clientId) || "待响" }}</div>
          </div>
          <div class="center-core">
            <div class="center-core-cell dealer-cell">
              <span class="center-core-label">庄家 {{ dealerName }}</span>
              <small v-if="dealerPickerName" class="center-core-subtle">抽牌者 {{ dealerPickerName }}</small>
              <div v-if="dealerInfoCard" class="center-core-card">
                <CardComp
                  v-if="props.tableCardMode === 'full'"
                  :card="dealerInfoCard"
                  size="md"
                />
                <div v-else class="corner-card" :class="cardColorClass(dealerInfoCard)">{{ cardGlyph(dealerInfoCard) }}</div>
              </div>
            </div>
            <div class="center-core-cell deck-cell">
              <span class="center-core-label">牌堆</span>
              <div class="deck-stack" :title="`牌堆剩余 ${props.state?.deckCount ?? 0} 张`">
                <span class="deck-stack-card"></span>
                <span class="deck-stack-card"></span>
                <span class="deck-stack-card"></span>
                <strong class="deck-stack-count">{{ props.state?.deckCount ?? 0 }}</strong>
              </div>
            </div>
            <div class="center-core-cell response-cell">
              <span class="center-core-label">待响牌</span>
              <div
                v-if="responseCard"
                class="pending-inline"
                :class="{ 'draw-pending-hidden': isResponseCardDrawHidden }"
                ref="responseLandingRef"
              >
                <Transition name="resp-move" mode="out-in">
                  <CardComp
                    v-if="props.tableCardMode === 'full'"
                    :key="`resp-full-${responseCard.id}-${responseCard.source || 'upper'}`"
                    :card="responseCard"
                    size="lg"
                  />
                  <div
                    v-else
                    :key="`resp-simple-${responseCard.id}-${responseCard.source || 'upper'}`"
                    class="corner-card response-card-simple"
                    :class="cardColorClass(responseCard)"
                  >
                    {{ cardGlyph(responseCard) }}
                  </div>
                </Transition>
              </div>
              <div v-else class="pending-placeholder">暂无待响牌</div>
            </div>
          </div>
          <div
            v-if="rightPlayer"
            class="center-seat center-seat-right"
            :class="{ active: displayTurnPlayerId === rightPlayer.clientId, responding: isCollectiveResponder(rightPlayer.clientId), action: hasSeatAction(rightPlayer.clientId) }"
          >
            <div v-if="seatActionText(rightPlayer.clientId) || isCollectiveResponder(rightPlayer.clientId)" class="center-seat-action">{{ seatActionText(rightPlayer.clientId) || "待响" }}</div>
          </div>
          <div
            v-if="selfPlayer"
            class="center-seat center-seat-bottom"
            :class="{ active: displayTurnPlayerId === selfPlayer.clientId, responding: isCollectiveResponder(selfPlayer.clientId), action: hasSeatAction(selfPlayer.clientId) }"
          >
            <div v-if="seatActionText(selfPlayer.clientId) || isCollectiveResponder(selfPlayer.clientId)" class="center-seat-action">{{ seatActionText(selfPlayer.clientId) || "待响" }}</div>
          </div>
        </div>
        <div v-if="centerPointerDirection" class="center-pointer" :class="`pointer-${centerPointerDirection}`">
          <i class="center-pointer-head"></i>
        </div>
        <div class="deck-anchor" ref="deckAnchorRef"></div>
      </section>

      <section
        v-if="rightPlayer"
        :ref="(el) => rightPlayer && setSeatRef(rightPlayer.clientId, el as HTMLElement | null)"
        class="player-card player-right"
        :class="{
          active: isCurrentTurn(rightPlayer.clientId),
          dealer: isDealer(rightPlayer.clientId),
          'actor-flash': flashActorId === rightPlayer.clientId,
        }"
      >
        <div v-if="isCurrentTurn(rightPlayer.clientId)" class="turn-arrow turn-arrow-side" aria-hidden="true">▲</div>
        <header class="seat-head">
          <strong>{{ rightPlayer.name }}</strong>
          <div class="seat-tags">
            <span v-if="isCurrentTurn(rightPlayer.clientId)" class="tag turn">当前回合</span>
            <span
              v-if="isCurrentTurn(rightPlayer.clientId) && seatCountdownSeconds !== null"
              class="turn-countdown"
            >
              剩余 {{ seatCountdownSeconds }}s
            </span>
            <span class="tag status">{{ statusText(rightPlayer) }}</span>
          </div>
        </header>
        <p class="seat-meta">手牌 {{ playerHandCount(rightPlayer) }} 张 · 牌组 {{ rightGroupBlocks.length }} 组 · 暗坎 {{ rightPlayer.declaredKongs }}</p>
        <div v-if="rightGroupBlocks.length" class="group-block-list compact">
          <div
            v-for="group in rightGroupBlocks"
            :key="`right-group-${group.id}`"
            class="group-block"
            :class="group.tone"
          >
            <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
            <div class="mini-card-strip">
              <span
                v-for="card in group.cards"
                :key="`right-group-card-${card.id}`"
                class="mini-card"
                :class="cardColorClass(card)"
                :title="cardLabel(card)"
              >
                {{ cardGlyph(card) }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="selfPlayer" class="flow-card flow-bottom-left">
        <p>{{ flowTitle(selfPlayer.clientId) }}</p>
        <div v-if="flowCardCount(selfPlayer.clientId)" class="discard-strip">
          <span
            v-for="(card, index) in visibleFlowCards(selfPlayer.clientId)"
            :key="`flow-bottom-left-${card.id}`"
            class="discard-token"
            :class="[cardColorClass(card), { active: isActiveDiscardCard(selfPlayer.clientId, card, index) }]"
            :title="cardLabel(card)"
          >
            {{ cardGlyph(card) }}
          </span>
        </div>
        <div v-else class="discard-empty">暂无流水</div>
      </section>

      <section v-if="selfPlayer" class="self-groups-card" ref="selfOpenRef">
        <p>牌组（{{ selfGroupBlocks.length }}组）</p>
        <div v-if="selfGroupBlocks.length" class="group-block-list">
          <div
            v-for="group in selfGroupBlocks"
            :key="`self-exp-${group.id}`"
            class="group-block"
            :class="group.tone"
          >
            <span v-if="group.badge" class="group-badge">{{ group.badge }}</span>
            <div class="mini-card-strip">
              <span
                v-for="card in group.cards"
                :key="`self-exp-card-${card.id}`"
                class="mini-card"
                :class="cardColorClass(card)"
                :title="cardLabel(card)"
              >
                {{ cardGlyph(card) }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="discard-empty">暂无牌组</div>
      </section>

      <section v-if="rightPlayer" class="flow-card flow-bottom-right">
        <p>{{ flowTitle(rightPlayer.clientId) }}</p>
        <div v-if="flowCardCount(rightPlayer.clientId)" class="discard-strip">
          <span
            v-for="(card, index) in visibleFlowCards(rightPlayer.clientId)"
            :key="`flow-bottom-right-${card.id}`"
            class="discard-token"
            :class="[cardColorClass(card), { active: isActiveDiscardCard(rightPlayer.clientId, card, index) }]"
            :title="cardLabel(card)"
          >
            {{ cardGlyph(card) }}
          </span>
        </div>
        <div v-else class="discard-empty">暂无流水</div>
      </section>

      <Transition name="deal-fade">
        <div v-if="showDealAnimation" class="deal-overlay">发牌中...</div>
      </Transition>

      <Transition name="dealer-reveal">
        <div v-if="dealerReveal" :key="`dealer-${dealerReveal.id}`" class="dealer-reveal">
          <span class="dealer-reveal-label">{{ dealerReveal.label }}</span>
          <strong>{{ dealerReveal.name }}</strong>
          <div v-if="dealerReveal.card" class="dealer-reveal-card">
            <CardComp
              v-if="props.tableCardMode === 'full'"
              :card="dealerReveal.card"
              size="md"
            />
            <div v-else class="corner-card" :class="cardColorClass(dealerReveal.card)">{{ cardGlyph(dealerReveal.card) }}</div>
          </div>
        </div>
      </Transition>

      <Transition name="dealer-flight">
        <div
          v-if="dealerFlight"
          :key="`dealer-flight-${dealerFlight.id}`"
          class="dealer-flight"
          :style="dealerFlightStyle(dealerFlight)"
        >
          庄家
        </div>
      </Transition>
    </div>

    <section
      v-if="selfPlayer"
      class="self-info-card"
      :class="{ active: isMyTurn, dealer: isDealer(selfPlayer.clientId), 'actor-flash': flashActorId === selfPlayer.clientId }"
      ref="selfZoneRef"
    >
      <div v-if="isMyTurn" class="turn-arrow self-turn-arrow" aria-hidden="true">▲</div>
      <header class="self-head">
        <div>
          <h3>{{ selfPlayer.name }}（你）</h3>
          <p>手牌 {{ playerHandCount(selfPlayer) }} 张 · 牌组 {{ selfGroupBlocks.length }} 组 · 暗坎 {{ selfPlayer.declaredKongs }}</p>
        </div>
        <div class="seat-tags">
          <span v-if="isMyTurn" class="tag turn">当前回合</span>
          <span v-if="isMyTurn && seatCountdownSeconds !== null" class="turn-countdown">剩余 {{ seatCountdownSeconds }}s</span>
          <span class="tag status">{{ statusText(selfPlayer) }}</span>
        </div>
      </header>
      <div v-if="isMyTurn && seatCountdownSeconds !== null" class="turn-timer-bar self-turn-timer">
        <span :style="{ width: `${seatCountdownPercent}%` }"></span>
      </div>
      <p class="self-info-hint">{{ compactCenterHint }}</p>
      <ActionPanel
        v-if="props.embeddedActionPanel && props.state?.phase === 'playing'"
        class="embedded-actions embedded-actions-side"
        :actions="props.actions ?? []"
        :can-act="Boolean(props.canAct)"
        :is-current-turn="Boolean(props.isCurrentTurn)"
        :response-phase="props.responsePhase ?? ''"
        :current-player-name="props.currentPlayerName ?? '-'"
        :selection-mode="props.selectionMode ?? null"
        :selected-candidate-id="props.selectedCandidateId ?? null"
        @submit="onSubmitAction"
        @selection-change="onSelectionChange"
      />
    </section>

    <section v-if="selfPlayer" class="self-hand-card">
      <div class="self-hand-panel">
        <p class="discard-tip">
          手牌（{{ displayPrivateHand.length }}<template v-if="showDealAnimation">/{{ props.privateHand.length }}</template>张）<span v-if="canDiscard"> · 点击弃一张（将牌/金条不可弃）</span>
        </p>
        <div class="cards hand" ref="selfHandRef">
          <button
            v-for="card in displayPrivateHand"
            :key="`me-${card.id}`"
            :data-testid="`hand-card-${card.id}`"
            class="hand-card"
            :class="{
              playable: canDiscardCard(card),
              blocked: !canDiscardCard(card),
              'gold-blocked': card.color === 'gold',
              'candidate-active': isCandidateCard(card.id),
              'candidate-selected': isSelectedCandidateCard(card.id),
            }"
            :disabled="!canDiscardCard(card) || Boolean(discardingCardId)"
            @click="onDiscard(card.id, $event)"
          >
            <span v-if="candidateBadgeText(card.id)" class="candidate-badge">{{ candidateBadgeText(card.id) }}</span>
            <CardComp :card="card" size="xl" />
          </button>
        </div>
      </div>
    </section>

    <div class="fx-layer">
      <div
        v-for="flight in flights"
        :key="`fx-${flight.id}`"
        class="fx-card"
        :class="flight.mode"
        :style="flightStyle(flight)"
      >
        <div v-if="flight.mode === 'deal'" class="card-back"></div>
        <CardComp v-else-if="flight.card" :card="flight.card" size="md" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "./ActionPanel.vue";
import CardComp from "./Card.vue";
import type { ActionCandidate, ActionRequest, AvailableAction, Card, PlayerState } from "@/types/game";
import { getCardFaceText, getCardLabelText } from "@/utils/cardText";

type ExposedGroup = {
  id: string;
  cards: Card[];
};

type VisibleGroupBlock = {
  id: string;
  cards: Card[];
  badge?: string;
  tone: "meld" | "fish" | "public";
};

type FlightMode = "deal" | "discard" | "meld";

type CardFlight = {
  id: number;
  mode: FlightMode;
  card?: Card;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  width: number;
  height: number;
  duration: number;
  delay: number;
};

type DealerFlight = {
  id: number;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
};

const props = defineProps<{
  state: any;
  players: PlayerState[];
  privateHand: Card[];
  mySeatId: string;
  canDiscard?: boolean;
  actions?: AvailableAction[];
  canAct?: boolean;
  isCurrentTurn?: boolean;
  responsePhase?: string;
  currentPlayerName?: string;
  turnHint?: string;
  embeddedActionPanel?: boolean;
  tableCardMode?: "simple" | "full";
  selectionMode?: "kai" | "peng" | "chi" | null;
  selectedCandidateId?: string | null;
  activeCandidates?: ActionCandidate[];
}>();

const emit = defineEmits<{
  discardCard: [cardId: string];
  submitAction: [request: ActionRequest];
  selectionChange: [payload: { mode: "kai" | "peng" | "chi" | null; selectedCandidateId: string | null }];
}>();

const isCompactLandscape = ref(false);
const nowMs = ref(Date.now());

function isOpeningDealIntroState(): boolean {
  return (
    props.state?.phase === "declaring" &&
    /^DEALER(?:_PICK|_CARD)?\s+\S+/.test(String(props.state?.lastAction ?? "")) &&
    Number(props.state?.responseEndsAt ?? 0) > nowMs.value
  );
}

function shouldConcealOpeningHand(): boolean {
  return props.state?.phase === "waiting" || isOpeningDealIntroState();
}

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
const discardingCardId = ref<string | null>(null);
const lastLocalDiscardAt = ref(0);
const flights = ref<CardFlight[]>([]);
const showDealAnimation = ref(false);
const visibleHandCount = ref(shouldConcealOpeningHand() ? 0 : props.privateHand.length);
const dealerReveal = ref<{ id: number; label: string; name: string; card?: Card | null } | null>(null);
const dealerFlight = ref<DealerFlight | null>(null);
const flashActorId = ref("");
const drawHiddenCardId = ref("");

const tableRef = ref<HTMLElement | null>(null);
const responseLandingRef = ref<HTMLElement | null>(null);
const deckAnchorRef = ref<HTMLElement | null>(null);
const selfHandRef = ref<HTMLElement | null>(null);
const selfZoneRef = ref<HTMLElement | null>(null);
const selfOpenRef = ref<HTMLElement | null>(null);
const selfOpenCompactRef = ref<HTMLElement | null>(null);
const seatRefMap = new Map<string, HTMLElement>();

let dealerRevealSeq = 0;
let dealerFlightSeq = 0;
let flightSeq = 0;
let dealRunSeq = 0;
let dealTimer: ReturnType<typeof setTimeout> | null = null;
let dealInterval: ReturnType<typeof setInterval> | null = null;
let dealerTimer: ReturnType<typeof setTimeout> | null = null;
let dealerIntroTimer: ReturnType<typeof setTimeout> | null = null;
let dealAnimatingUntil = 0;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let drawHideTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
const OP_COUNTDOWN_MS = 20000;

function splitExposedGroups(cards: Card[], sizes: number[], prefix: string): ExposedGroup[] {
  const normalizeResponseFlag = (chunk: Card[]): Card[] => {
    const firstResponseIndex = chunk.findIndex((card) => Boolean(card.isResponseCard));
    if (firstResponseIndex < 0) {
      return chunk.map((card) => ({ ...card }));
    }
    return chunk.map((card, idx) => ({
      ...card,
      isResponseCard: idx === firstResponseIndex,
    }));
  };

  const cleanSizes = sizes.filter((size) => Number.isFinite(size) && size > 0);
  const total = cleanSizes.reduce((sum, size) => sum + size, 0);
  if (!cleanSizes.length || total !== cards.length) {
    return cards.map((card, idx) => ({ id: `${prefix}-fallback-${idx}`, cards: [{ ...card }] }));
  }

  const groups: ExposedGroup[] = [];
  let offset = 0;
  for (let idx = 0; idx < cleanSizes.length; idx += 1) {
    const size = cleanSizes[idx];
    const chunk = normalizeResponseFlag(cards.slice(offset, offset + size));
    offset += size;
    if (chunk.length > 0) {
      groups.push({ id: `${prefix}-${idx}`, cards: chunk });
    }
  }
  return groups;
}

function buildOpenGroups(player: PlayerState, prefix: string): ExposedGroup[] {
  const exposed = splitExposedGroups(player.exposedArea ?? [], player.exposedGroupSizes ?? [], `${prefix}-exp`);
  const generals = (player.generalArea ?? []).map((card, idx) => ({ id: `${prefix}-gen-${idx}`, cards: [{ ...card }] }));
  return [...exposed, ...generals];
}

function splitFishGroups(cards: Card[], prefix: string): ExposedGroup[] {
  const groups: ExposedGroup[] = [];
  const buckets = new Map<string, Card[]>();
  const order: string[] = [];
  for (const card of cards) {
    const key = `${card.color}:${card.type}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push({ ...card });
  }
  order.forEach((key, index) => {
    const cardsInGroup = buckets.get(key) ?? [];
    if (cardsInGroup.length) {
      groups.push({ id: `${prefix}-fish-${index}`, cards: cardsInGroup });
    }
  });
  return groups;
}

function buildPlayerGroupBlocks(player: PlayerState, prefix: string): VisibleGroupBlock[] {
  const fish = splitFishGroups(player.fishArea ?? [], prefix).map((group) => ({
    ...group,
    badge: "鱼",
    tone: "fish" as const,
  }));
  const exposed = splitExposedGroups(player.exposedArea ?? [], player.exposedGroupSizes ?? [], `${prefix}-exp`).map((group) => ({
    ...group,
    tone: "meld" as const,
  }));
  return [...fish, ...exposed];
}

const selfGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = selfPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `self-${player.clientId}`);
});

const topGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = topPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});

const leftGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = leftPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});

const rightGroupBlocks = computed<VisibleGroupBlock[]>(() => {
  const player = rightPlayer.value;
  if (!player) {
    return [];
  }
  return buildPlayerGroupBlocks(player, `seat-${player.clientId}`);
});

const latestDiscardFromAction = computed<Card | null>(() => {
  const match = String(props.state?.lastAction ?? "").match(/^(\S+)\s+DISCARD$/);
  if (!match) {
    return null;
  }

  const ownerId = match[1];
  const owner = props.players.find((x) => x.clientId === ownerId);
  const ownerDiscardCount = owner?.discardPile?.length ?? 0;
  const latestDiscard = ownerDiscardCount > 0 ? owner?.discardPile?.[ownerDiscardCount - 1] : undefined;
  if (latestDiscard?.id) {
    return { ...latestDiscard, source: "upper" };
  }

  const publicTop = props.state?.publicDiscardPile?.[props.state?.publicDiscardPile?.length - 1];
  if (publicTop?.id) {
    return { ...(publicTop as Card), source: "upper" };
  }

  return null;
});

const responseCard = computed<Card | null>(() => {
  const directResponse = props.state?.responseCard;
  if (directResponse?.id) {
    return directResponse as Card;
  }

  const directTarget = props.state?.targetCard;
  if (props.state?.responsePhase === "collective" && directTarget?.id) {
    return directTarget as Card;
  }

  const collective = props.state?.responsePhase === "collective";
  if (collective) {
    const publicCount = props.state?.publicDiscardPile?.length ?? 0;
    const publicTop = publicCount > 0 ? props.state?.publicDiscardPile?.[publicCount - 1] : undefined;
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

  return collective ? latestDiscardFromAction.value : null;
});

function getPreviousPlayer(playerId: string): PlayerState | null {
  const list = props.players ?? [];
  const idx = list.findIndex((player) => player.clientId === playerId);
  if (idx < 0 || list.length === 0) {
    return null;
  }
  return list[(idx - 1 + list.length) % list.length] ?? null;
}

function getNextPlayer(playerId: string): PlayerState | null {
  const list = props.players ?? [];
  const idx = list.findIndex((player) => player.clientId === playerId);
  if (idx < 0 || list.length === 0) {
    return null;
  }
  return list[(idx + 1) % list.length] ?? null;
}

function flowOwner(playerId: string): PlayerState | null {
  return getPreviousPlayer(playerId);
}

function flowTitle(playerId: string): string {
  const receiver = props.players.find((player) => player.clientId === playerId);
  const sender = flowOwner(playerId);
  if (!receiver?.name || !sender?.name) {
    return "流水";
  }
  return `${sender.name} -> ${receiver.name} 的流水`;
}

const activeFlowSourcePlayerId = computed(() => {
  const pending = responseCard.value;
  if (!pending || pending.source !== "upper") {
    return "";
  }
  return String(props.state?.pollOriginPlayerId || props.state?.previousPlayerId || "");
});

const activeFlowTargetPlayerId = computed(() => {
  const sourcePlayerId = activeFlowSourcePlayerId.value;
  if (!sourcePlayerId) {
    return "";
  }
  return getNextPlayer(sourcePlayerId)?.clientId ?? "";
});

function shouldAppendPendingToFlow(playerId: string): boolean {
  const pending = responseCard.value;
  if (!pending || pending.source !== "upper") {
    return false;
  }
  if (activeFlowTargetPlayerId.value !== playerId) {
    return false;
  }
  const owner = props.players.find((player) => player.clientId === activeFlowSourcePlayerId.value);
  return !owner?.discardPile?.some((card) => card.id === pending.id);
}

function flowCards(playerId: string): Card[] {
  const owner = flowOwner(playerId);
  const cards = owner?.discardPile ? [...owner.discardPile] : [];
  if (shouldAppendPendingToFlow(playerId) && responseCard.value) {
    cards.push(responseCard.value);
  }
  return cards;
}

function flowCardCount(playerId: string): number {
  return flowCards(playerId).length;
}

function visibleFlowCards(playerId: string): Card[] {
  const cards = flowCards(playerId);
  const limit = isCompactLandscape.value ? 10 : 14;
  return cards.slice(Math.max(0, cards.length - limit));
}

function isActiveDiscardCard(playerId: string, card: Card, index: number): boolean {
  const cards = visibleFlowCards(playerId);
  if (index !== cards.length - 1) {
    return false;
  }
  const pending = responseCard.value;
  if (!pending || pending.source !== "upper") {
    return false;
  }
  if (pending.id !== card.id) {
    return false;
  }
  if (shouldAppendPendingToFlow(playerId)) {
    return activeFlowTargetPlayerId.value === playerId;
  }
  const owner = flowOwner(playerId);
  const latestCount = owner?.discardPile?.length ?? 0;
  const latest = latestCount > 0 ? owner?.discardPile?.[latestCount - 1] : undefined;
  return Boolean(latest?.id === card.id);
}

const displayTurnPlayerId = computed(() => {
  if (props.state?.responsePhase === "collective") {
    return (
      props.state?.currentTurnPlayerId ||
      props.state?.currentPlayerId ||
      props.state?.pollOriginPlayerId ||
      ""
    );
  }
  return props.state?.currentTurnPlayerId || props.state?.currentPlayerId || "";
});

const currentPlayer = computed(() => {
  const playerId = displayTurnPlayerId.value;
  if (!playerId) {
    return null;
  }
  return props.players.find((x) => x.clientId === playerId) ?? null;
});

const currentPlayerName = computed(() => {
  const playerId = displayTurnPlayerId.value;
  if (!playerId) {
    return "-";
  }
  return currentPlayer.value?.name || playerId;
});

const isMyTurn = computed(
  () =>
    String(props.state?.responsePhase ?? "") !== "collective" &&
    Boolean(props.mySeatId) &&
    displayTurnPlayerId.value === props.mySeatId &&
    !Boolean(currentPlayer.value?.isBot),
);

const canDiscard = computed(() => Boolean(props.canDiscard));
const openingDealIntroActive = computed(() => isOpeningDealIntroState());
const displayPrivateHand = computed<Card[]>(() => {
  if (props.state?.phase === "waiting") {
    return [];
  }
  const shouldLimit = showDealAnimation.value || openingDealIntroActive.value;
  const limit = shouldLimit ? Math.max(0, visibleHandCount.value || 0) : props.privateHand.length;
  return props.privateHand.slice(0, limit);
});
const isResponseCardDrawHidden = computed(
  () => Boolean(drawHiddenCardId.value) && responseCard.value?.id === drawHiddenCardId.value,
);
const activeCandidates = computed<ActionCandidate[]>(() => props.activeCandidates ?? []);
const selectedCandidate = computed<ActionCandidate | null>(() => {
  const id = props.selectedCandidateId ?? "";
  if (!id) {
    return null;
  }
  return activeCandidates.value.find((candidate) => candidate.id === id) ?? null;
});

const candidateIndexesByCardId = computed(() => {
  const map = new Map<string, number[]>();
  activeCandidates.value.forEach((candidate, index) => {
    candidate.cardIds.forEach((cardId) => {
      const list = map.get(cardId) ?? [];
      list.push(index + 1);
      map.set(cardId, list);
    });
  });
  return map;
});

const ACTION_LABELS: Record<string, string> = {
  DISCARD: "出牌",
  PENG: "碰",
  KAI: "开",
  CHI: "吃",
  HU: "胡",
  ZHUA: "抓",
  PASS: "过",
  TIMEOUT_PASS: "超时过",
};

const latestSeatAction = computed<{ actorId: string; label: string } | null>(() => {
  const action = String(props.state?.lastAction ?? "").trim();
  if (!action) {
    return null;
  }
  const { actor, keyword } = parseActionDescriptor(action);
  if (!actor) {
    return null;
  }
  const label = ACTION_LABELS[keyword];
  if (!label) {
    return null;
  }
  return { actorId: actor, label };
});

const seatCountdownSeconds = computed<number | null>(() => {
  if (
    /^DEALER\s+\S+/.test(String(props.state?.lastAction ?? "")) &&
    Number(props.state?.responseEndsAt ?? 0) > nowMs.value
  ) {
    return null;
  }
  const endsAt = Number(props.state?.responseEndsAt ?? 0);
  if (!endsAt || endsAt <= nowMs.value) {
    return null;
  }
  return Math.max(0, Math.ceil((endsAt - nowMs.value) / 1000));
});

const seatCountdownPercent = computed<number>(() => {
  if (
    /^DEALER\s+\S+/.test(String(props.state?.lastAction ?? "")) &&
    Number(props.state?.responseEndsAt ?? 0) > nowMs.value
  ) {
    return 0;
  }
  const endsAt = Number(props.state?.responseEndsAt ?? 0);
  if (!endsAt || endsAt <= nowMs.value) {
    return 0;
  }
  const remain = endsAt - nowMs.value;
  const raw = (remain / OP_COUNTDOWN_MS) * 100;
  return Math.max(0, Math.min(100, Number(raw.toFixed(1))));
});

const compactCenterHint = computed(() => {
  if (props.turnHint) {
    return props.turnHint;
  }
  if (canDiscard.value) {
    return "请选择弃牌";
  }
  if (String(props.state?.responsePhase ?? "") === "collective") {
    return props.canAct ? "全局待响：可胡/开/碰/过" : "等待三家响应";
  }
  if (String(props.state?.responsePhase ?? "") === "local_upper" && Boolean(props.canAct)) {
    return "可吃或抓";
  }
  if (String(props.state?.responsePhase ?? "") === "local_draw" && Boolean(props.canAct)) {
    return "可吃或过";
  }
  return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});

const centerPointerDirection = computed<"up" | "down" | "left" | "right" | null>(() => {
  if (String(props.state?.responsePhase ?? "") === "collective") {
    return null;
  }
  const currentId = String(displayTurnPlayerId.value || "");
  if (!currentId) {
    return null;
  }
  const position = resolvePlayerPosition(currentId);
  if (position === "top") {
    return "up";
  }
  if (position === "left") {
    return "left";
  }
  if (position === "right") {
    return "right";
  }
  return "down";
});

const dealerName = computed(() => {
  const dealerId = String(props.state?.dealerId ?? "");
  if (!dealerId) {
    return "-";
  }
  return props.players.find((p) => p.clientId === dealerId)?.name || dealerId;
});

const dealerPickerName = computed(() => {
  const pickerId = String(props.state?.dealerPickerId ?? "");
  if (!pickerId) {
    return "";
  }
  return props.players.find((p) => p.clientId === pickerId)?.name || pickerId;
});

const dealerInfoCard = computed<Card | null>(() => {
  const card = props.state?.dealerCard;
  return card?.id ? (card as Card) : null;
});

function isCollectiveResponder(playerId: string): boolean {
  void playerId;
  return false;
}

function seatActionText(playerId: string): string {
  return latestSeatAction.value?.actorId === playerId ? latestSeatAction.value.label : "";
}

function hasSeatAction(playerId: string): boolean {
  return seatActionText(playerId).length > 0;
}

function isCurrentTurn(playerId: string): boolean {
  if (String(props.state?.responsePhase ?? "") === "collective") {
    return false;
  }
  return displayTurnPlayerId.value === playerId;
}

function statusText(player: PlayerState): string {
  if (player.isBot) {
    return "BOT托管";
  }
  return player.connected ? "在线" : "离线";
}

function playerHandCount(player: PlayerState): number {
  if (player.clientId === props.mySeatId) {
    return props.privateHand.length;
  }
  return Number(player.handCount ?? 0);
}

function isDealer(playerId: string): boolean {
  return Boolean(playerId) && String(props.state?.dealerId ?? "") === playerId;
}

function isSystemAction(actionKey: string): boolean {
  return actionKey === "NO_RESPONSE" || actionKey === "TURN_DRAW" || actionKey === "KONG_DRAW";
}

function canDiscardCard(card: Card): boolean {
  return canDiscard.value && card.type !== "jiang" && card.color !== "gold";
}

function onDiscard(cardId: string, event?: MouseEvent): void {
  if (!canDiscard.value || discardingCardId.value) {
    return;
  }
  const picked = props.privateHand.find((card) => card.id === cardId);
  if (picked && event?.currentTarget instanceof HTMLElement) {
    triggerDiscardAnimationFromElement(event.currentTarget, picked);
    lastLocalDiscardAt.value = Date.now();
  }
  discardingCardId.value = cardId;
  window.setTimeout(() => {
    emit("discardCard", cardId);
  }, 220);
  window.setTimeout(() => {
    if (discardingCardId.value === cardId) {
      discardingCardId.value = null;
    }
  }, 460);
}

function onSubmitAction(request: ActionRequest): void {
  emit("submitAction", request);
}

function onSelectionChange(payload: { mode: "kai" | "peng" | "chi" | null; selectedCandidateId: string | null }): void {
  emit("selectionChange", payload);
}

function isCandidateCard(cardId: string): boolean {
  return candidateIndexesByCardId.value.has(cardId);
}

function isSelectedCandidateCard(cardId: string): boolean {
  return Boolean(selectedCandidate.value?.cardIds.includes(cardId));
}

function candidateBadgeText(cardId: string): string {
  const indexes = candidateIndexesByCardId.value.get(cardId) ?? [];
  return indexes.length > 0 ? indexes.join("/") : "";
}

function cardLabel(card: Card): string {
  return getCardLabelText(card);
}

function cardGlyph(card: Card): string {
  return getCardFaceText(card);
}

function cardColorClass(card: Card): string {
  return `tone-${card.color || "white"}`;
}

function parseActionDescriptor(action: string): { actor: string; keyword: string } {
  const parts = String(action ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { actor: "", keyword: "" };
  }
  if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
    return {
      actor: parts[0],
      keyword: parts[1] ?? "",
    };
  }
  return {
    actor: "",
    keyword: parts[0],
  };
}

function setSeatRef(playerId: string, el: HTMLElement | null): void {
  if (!playerId) {
    return;
  }
  if (el) {
    seatRefMap.set(playerId, el);
  } else {
    seatRefMap.delete(playerId);
  }
}

function resolvePlayerPosition(playerId: string): "top" | "left" | "right" | "self" {
  if (selfPlayer.value?.clientId === playerId) {
    return "self";
  }
  if (topPlayer.value?.clientId === playerId) {
    return "top";
  }
  if (leftPlayer.value?.clientId === playerId) {
    return "left";
  }
  if (rightPlayer.value?.clientId === playerId) {
    return "right";
  }
  return "self";
}

function pointFromElement(el: HTMLElement | null): { x: number; y: number } | null {
  if (!el) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function openAreaTargetForSelf(): { x: number; y: number } | null {
  return pointFromElement(selfOpenCompactRef.value) ?? pointFromElement(selfOpenRef.value) ?? pointFromElement(selfZoneRef.value);
}

function targetForPlayer(playerId: string): { x: number; y: number } | null {
  if (!playerId) {
    return null;
  }
  if (selfPlayer.value?.clientId === playerId) {
    return pointFromElement(selfHandRef.value) ?? pointFromElement(selfZoneRef.value);
  }
  return pointFromElement(seatRefMap.get(playerId) ?? null);
}

function responseLandingPoint(): { x: number; y: number } | null {
  return pointFromElement(responseLandingRef.value) ?? pointFromElement(tableRef.value);
}

function dealStartPoint(): { x: number; y: number } | null {
  return pointFromElement(deckAnchorRef.value) ?? responseLandingPoint();
}

function groupOffsets(count: number): Array<{ x: number; y: number }> {
  if (count <= 1) {
    return [{ x: 0, y: 0 }];
  }
  if (count === 3) {
    return [
      { x: -20, y: 6 },
      { x: 0, y: -10 },
      { x: 20, y: 6 },
    ];
  }
  return [
    { x: -28, y: 8 },
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 28, y: 8 },
  ];
}

function spawnFlight(flight: Omit<CardFlight, "id">): void {
  const id = ++flightSeq;
  flights.value.push({ id, ...flight });
  const ttl = Math.max(120, flight.duration + flight.delay + 120);
  window.setTimeout(() => {
    flights.value = flights.value.filter((item) => item.id !== id);
  }, ttl);
}

function flightStyle(flight: CardFlight): Record<string, string> {
  return {
    "--sx": `${flight.sx}px`,
    "--sy": `${flight.sy}px`,
    "--ex": `${flight.ex}px`,
    "--ey": `${flight.ey}px`,
    "--dur": `${flight.duration}ms`,
    "--delay": `${flight.delay}ms`,
    width: `${flight.width}px`,
    height: `${flight.height}px`,
  };
}

function dealerFlightStyle(flight: DealerFlight): Record<string, string> {
  return {
    "--sx": `${flight.sx}px`,
    "--sy": `${flight.sy}px`,
    "--ex": `${flight.ex}px`,
    "--ey": `${flight.ey}px`,
  };
}

function triggerDealerFlight(dealerId: string): void {
  const start = pointFromElement(tableRef.value);
  const end = targetForPlayer(dealerId);
  if (!start || !end) {
    return;
  }
  const id = ++dealerFlightSeq;
  dealerFlight.value = {
    id,
    sx: start.x - 26,
    sy: start.y - 18,
    ex: end.x - 26,
    ey: end.y - 18,
  };
  window.setTimeout(() => {
    if (dealerFlight.value?.id === id) {
      dealerFlight.value = null;
    }
  }, 980);
}

function triggerDiscardAnimationFromElement(sourceEl: HTMLElement, card: Card): void {
  const source = pointFromElement(sourceEl);
  const target = responseLandingPoint();
  if (!source || !target) {
    return;
  }
  spawnFlight({
    mode: "discard",
    card,
    sx: source.x - 12,
    sy: source.y - 34,
    ex: target.x - 14,
    ey: target.y - 38,
    width: 28,
    height: 76,
    duration: 260,
    delay: 0,
  });
}

function triggerDiscardAnimationFromSeat(actorId: string): void {
  const source = targetForPlayer(actorId);
  const target = responseLandingPoint();
  const card = responseCard.value ?? latestDiscardFromAction.value ?? undefined;
  if (!source || !target || !card) {
    return;
  }
  spawnFlight({
    mode: "discard",
    card,
    sx: source.x - 12,
    sy: source.y - 34,
    ex: target.x - 14,
    ey: target.y - 38,
    width: 28,
    height: 76,
    duration: 300,
    delay: 0,
  });
}

function triggerMeldAnimation(actorId: string, keyword: string): void {
  const source = responseLandingPoint();
  const target =
    selfPlayer.value?.clientId === actorId
      ? openAreaTargetForSelf()
      : pointFromElement(seatRefMap.get(actorId) ?? null);
  if (!source || !target) {
    return;
  }
  const baseCard = responseCard.value ?? latestDiscardFromAction.value ?? undefined;
  if (!baseCard) {
    return;
  }
  const count = keyword === "KAI" ? 4 : 3;
  const offsets = groupOffsets(count);
  offsets.forEach((offset, index) => {
    spawnFlight({
      mode: "meld",
      card: { ...baseCard, id: `${baseCard.id}-meld-${index}-${Date.now()}` },
      sx: source.x - 11 + index * 3,
      sy: source.y - 32 + index * 2,
      ex: target.x - 13 + offset.x,
      ey: target.y - 36 + offset.y,
      width: 26,
      height: 72,
      duration: 330,
      delay: index * 70,
    });
  });
}

function triggerDrawAnimation(actorId: string): void {
  const source = dealStartPoint();
  const target = responseLandingPoint();
  const card = responseCard.value ?? undefined;
  if (!source || !target || !card) {
    return;
  }
  if (drawHideTimer) {
    clearTimeout(drawHideTimer);
    drawHideTimer = null;
  }
  drawHiddenCardId.value = card.id;
  spawnFlight({
    mode: "discard",
    card,
    sx: source.x - 12,
    sy: source.y - 34,
    ex: target.x - 14,
    ey: target.y - 38,
    width: 28,
    height: 76,
    duration: 340,
    delay: 0,
  });
  drawHideTimer = setTimeout(() => {
    if (drawHiddenCardId.value === card.id) {
      drawHiddenCardId.value = "";
    }
    drawHideTimer = null;
  }, 330);
  triggerActorFlash(actorId);
}

function buildDealPlan(): string[] {
  const players = orderedPlayers.value.map((p) => p.clientId);
  if (players.length !== 4) {
    return [];
  }
  const dealerId = String(props.state?.dealerId ?? "");
  if (!dealerId || !players.includes(dealerId)) {
    return [];
  }
  const dealerIdx = players.indexOf(dealerId);
  const ring = Array.from({ length: players.length }, (_, idx) => players[(dealerIdx + idx) % players.length]);
  const rest = new Map<string, number>(players.map((id) => [id, id === dealerId ? 21 : 20]));
  const plan: string[] = [];
  let safe = 0;
  while (safe < 120) {
    safe += 1;
    let progressed = false;
    for (const id of ring) {
      const left = rest.get(id) ?? 0;
      if (left <= 0) {
        continue;
      }
      plan.push(id);
      rest.set(id, left - 1);
      progressed = true;
    }
    if (!progressed) {
      break;
    }
  }
  return plan;
}

function clearDealAnimationRuntime(): void {
  if (dealTimer) {
    clearTimeout(dealTimer);
    dealTimer = null;
  }
  if (dealInterval) {
    clearInterval(dealInterval);
    dealInterval = null;
  }
  visibleHandCount.value = props.privateHand.length;
}

function triggerDealAnimation(): number {
  clearDealAnimationRuntime();
  const plan = buildDealPlan();
  const start = dealStartPoint();
  if (!plan.length || !start) {
    showDealAnimation.value = false;
    dealAnimatingUntil = Date.now();
    return 0;
  }

  const runId = ++dealRunSeq;
  showDealAnimation.value = true;
  visibleHandCount.value = 0;
  let index = 0;
  const finishMs = plan.length * 32 + 320;
  dealAnimatingUntil = Date.now() + finishMs;
  const dispatch = () => {
    if (runId !== dealRunSeq) {
      return;
    }
    const targetSeat = plan[index];
    const end = targetForPlayer(targetSeat);
    if (end) {
      spawnFlight({
        mode: "deal",
        sx: start.x - 10,
        sy: start.y - 28,
        ex: end.x - 10,
        ey: end.y - 28,
        width: 20,
        height: 56,
        duration: 230,
        delay: 0,
      });
    }
    index += 1;
    const fullHand = props.privateHand.length;
    if (fullHand > 0) {
      const reveal = Math.min(fullHand, Math.ceil((index / plan.length) * fullHand));
      visibleHandCount.value = Math.max(visibleHandCount.value, reveal);
    }
    if (index >= plan.length) {
      clearDealAnimationRuntime();
      dealTimer = setTimeout(() => {
        if (runId === dealRunSeq) {
          showDealAnimation.value = false;
          visibleHandCount.value = props.privateHand.length;
        }
      }, 320);
    }
  };

  dispatch();
  dealInterval = setInterval(dispatch, 32);
  return finishMs;
}

function clearDealerIntroTimer(): void {
  if (dealerIntroTimer) {
    clearTimeout(dealerIntroTimer);
    dealerIntroTimer = null;
  }
}

function triggerActorFlash(actorId: string): void {
  if (!actorId) {
    return;
  }
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  flashActorId.value = actorId;
  flashTimer = setTimeout(() => {
    flashActorId.value = "";
    flashTimer = null;
  }, 780);
}

function triggerDealerReveal(label: string, name: string, card?: Card | null, dealerId?: string) {
  if (!name || name === "-") {
    return;
  }
  if (dealerTimer) {
    clearTimeout(dealerTimer);
    dealerTimer = null;
  }
  dealerReveal.value = { id: ++dealerRevealSeq, label, name, card: card ?? null };
  dealerTimer = setTimeout(() => {
    dealerReveal.value = null;
    dealerTimer = null;
  }, 1400);
  if (dealerId) {
    triggerDealerFlight(dealerId);
  }
}

function updateCompactLandscape() {
  const compact = window.matchMedia("(orientation: landscape) and (max-width: 960px)").matches;
  if (compact !== isCompactLandscape.value) {
    isCompactLandscape.value = compact;
  }
}

onMounted(() => {
  updateCompactLandscape();
  window.addEventListener("resize", updateCompactLandscape);
  window.addEventListener("orientationchange", updateCompactLandscape);
  countdownTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 500);
  if (openingDealIntroActive.value) {
    visibleHandCount.value = 0;
    window.setTimeout(() => {
      if (openingDealIntroActive.value) {
        triggerDealAnimation();
      }
    }, 0);
  }
});

onUnmounted(() => {
  clearDealAnimationRuntime();
  clearDealerIntroTimer();
  if (dealerTimer) {
    clearTimeout(dealerTimer);
    dealerTimer = null;
  }
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  if (drawHideTimer) {
    clearTimeout(drawHideTimer);
    drawHideTimer = null;
  }
  flashActorId.value = "";
  drawHiddenCardId.value = "";
  dealerFlight.value = null;
  window.removeEventListener("resize", updateCompactLandscape);
  window.removeEventListener("orientationchange", updateCompactLandscape);
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

watch(
  () => props.state?.lastAction,
  (action) => {
    const dealerPickMatch = String(action ?? "").match(/^DEALER_PICK\s+(\S+)/);
    if (dealerPickMatch) {
      const pickerId = dealerPickMatch[1];
      const name = props.players.find((p) => p.clientId === pickerId)?.name || pickerId;
      triggerDealerReveal("抽取定庄牌", name);
      return;
    }
    const dealerCardMatch = String(action ?? "").match(/^DEALER_CARD\s+(\S+)/);
    if (dealerCardMatch) {
      const dealerId = dealerCardMatch[1];
      const name = props.players.find((p) => p.clientId === dealerId)?.name || dealerId;
      triggerDealerReveal("定庄牌", name, dealerInfoCard.value, dealerId);
      return;
    }
    const dealerMatch = String(action ?? "").match(/^DEALER\s+(\S+)/);
    if (dealerMatch && props.state?.phase === "declaring") {
      triggerDealAnimation();
      return;
    }
    const { actor, keyword } = parseActionDescriptor(String(action ?? ""));
    if (actor) {
      triggerActorFlash(actor);
    }
    if (keyword === "DISCARD" && actor) {
      if (!(actor === props.mySeatId && Date.now() - lastLocalDiscardAt.value < 650)) {
        triggerDiscardAnimationFromSeat(actor);
      }
      return;
    }
    if ((keyword === "PENG" || keyword === "KAI" || keyword === "CHI") && actor) {
      triggerMeldAnimation(actor, keyword);
      return;
    }
    if ((keyword === "ZHUA" || keyword === "TURN_DRAW" || keyword === "KONG_DRAW") && actor) {
      triggerDrawAnimation(actor);
    }
  },
);

watch(
  () => props.privateHand.map((x) => x.id).join("|"),
  () => {
    if (!showDealAnimation.value && !openingDealIntroActive.value && props.state?.phase !== "waiting") {
      visibleHandCount.value = props.privateHand.length;
    }
    if (discardingCardId.value && !props.privateHand.some((card) => card.id === discardingCardId.value)) {
      discardingCardId.value = null;
    }
  },
);
</script>

<style scoped>
.board {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 23%) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) clamp(8.5rem, 26vh, 13rem);
  gap: clamp(0.3rem, 0.9vh, 0.5rem);
  overflow: hidden;
}

.table {
  position: relative;
  grid-column: 1 / -1;
  width: 100%;
  aspect-ratio: auto;
  height: 100%;
  min-height: 0;
  max-height: none;
  margin: 0 auto;
  border-radius: clamp(0.5rem, 1.5vh, 1rem);
  border: 1px solid #1e293b;
  background:
    radial-gradient(120% 90% at 50% 50%, rgba(6, 78, 59, 0.9), rgba(15, 23, 42, 0.96) 70%),
    linear-gradient(160deg, #0b1220 0%, #020617 100%);
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 23%) minmax(0, 1fr) minmax(0, 23%);
  grid-template-rows: minmax(4.6rem, 0.82fr) minmax(5.2rem, 1fr) minmax(4.8rem, 0.9fr);
  grid-template-areas:
    "flowtl top flowtr"
    "left center right"
    "flowbl selfgroups flowbr";
  column-gap: clamp(0.3rem, 1vw, 0.75rem);
  row-gap: clamp(0.25rem, 0.9vh, 0.6rem);
  padding: clamp(0.35rem, 1vh, 0.7rem);
}

.corner-card {
  min-width: 4.3rem;
  min-height: 2rem;
  padding: 0.2rem 0.55rem;
  border-radius: 0.7rem;
  border: 2px solid rgba(15, 23, 42, 0.42);
  color: #111827;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 800;
}

.response-card-simple {
  min-width: clamp(2.2rem, 5vh, 2.9rem);
  min-height: clamp(3rem, 7vh, 4rem);
  font-size: clamp(1rem, 2.4vh, 1.38rem);
}

.player-card,
.flow-card,
.self-groups-card,
.self-info-card,
.self-hand-card {
  position: relative;
  background: rgba(11, 18, 32, 0.88);
  border: 1px solid #1e293b;
  border-radius: clamp(0.4rem, 1vh, 0.8rem);
  padding: clamp(0.25rem, 0.8vh, 0.5rem);
  color: #e2e8f0;
  min-height: 0;
}

.player-card {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 6px;
  overflow: auto;
}

.player-top {
  grid-area: top;
  width: 100%;
  justify-self: center;
  height: auto;
  min-height: clamp(4.6rem, 13vh, 6.6rem);
}

.player-left {
  grid-area: left;
  width: 100%;
  height: 100%;
}

.player-right {
  grid-area: right;
  width: 100%;
  height: 100%;
}

.player-card.active,
.self-info-card.active {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
  animation: seat-turn-pulse 1.45s ease-in-out infinite;
}

.player-card.actor-flash,
.self-info-card.actor-flash {
  animation: actor-flash 0.8s ease-out;
}

.player-card.dealer,
.self-info-card.dealer {
  border-color: rgba(245, 158, 11, 0.92);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.34) inset, 0 0 18px rgba(245, 158, 11, 0.2);
}

.flow-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow: auto;
}

.flow-card p,
.self-groups-card p {
  margin: 0;
  font-size: clamp(0.72rem, 1.3vh, 0.86rem);
  color: #cbd5e1;
}

.flow-top-left {
  grid-area: flowtl;
}

.flow-top-right {
  grid-area: flowtr;
}

.flow-bottom-left {
  grid-area: flowbl;
}

.flow-bottom-right {
  grid-area: flowbr;
}

.self-groups-card {
  grid-area: selfgroups;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow: auto;
}

.self-info-card {
  grid-column: 1;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 0.35rem;
  overflow: hidden;
}

.self-hand-card {
  grid-column: 2 / 4;
  overflow: hidden;
}

.turn-arrow {
  position: absolute;
  left: 50%;
  top: 4px;
  transform: translateX(-50%);
  color: #22c55e;
  font-size: clamp(0.9rem, 1.9vh, 1.2rem);
  line-height: 1;
  text-shadow: 0 0 8px rgba(34, 197, 94, 0.65);
  animation: turn-arrow-bounce 0.85s ease-in-out infinite;
  pointer-events: none;
}

.turn-arrow-side {
  top: 2px;
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
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
}

.seat-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: clamp(0.68rem, 1.15vh, 0.82rem);
  line-height: 18px;
  white-space: nowrap;
  border: 1px solid #334155;
  color: #cbd5e1;
}

.tag.turn {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  color: #bbf7d0;
}

.turn-countdown {
  border-radius: 999px;
  border: 1px solid rgba(16, 185, 129, 0.75);
  background: rgba(6, 78, 59, 0.28);
  color: #a7f3d0;
  padding: 1px 7px;
  font-size: clamp(0.62rem, 1.2vh, 0.75rem);
  line-height: 1.2;
  white-space: nowrap;
}

.turn-timer-bar {
  position: relative;
  width: 100%;
  height: 7px;
  margin-top: 2px;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(71, 85, 105, 0.9);
  overflow: hidden;
}

.turn-timer-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #84cc16);
  transition: width 0.35s linear;
}

.tag.status {
  border-color: #334155;
}

.tag.dealer {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.16);
  color: #fde68a;
}

.self-info-hint {
  margin: 0;
  color: #bfdbfe;
  font-size: clamp(0.74rem, 1.35vh, 0.88rem);
  line-height: 1.35;
}

.seat-zone {
  margin: 0;
  border-top: 1px dashed #334155;
  padding-top: 6px;
  min-height: 0;
  overflow: auto;
}

.discard-zone {
  min-height: 5.2rem;
}

.seat-zone p {
  margin: 0 0 6px;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #cbd5e1;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.discard-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: flex-start;
}

.discard-token {
  position: relative;
  width: clamp(1.72rem, 3.3vh, 1.95rem);
  height: clamp(1.72rem, 3.3vh, 1.95rem);
  border-radius: 0.45rem;
  border: 2px solid rgba(15, 23, 42, 0.45);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.84rem, 1.55vh, 0.98rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  color: #020617;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.22);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}

.discard-token.active {
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.discard-token.active::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 0.62rem;
  padding: 3px;
  background: linear-gradient(135deg, #f43f5e, #f59e0b, #22c55e, #38bdf8, #a855f7);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: flow-active-glow 1.35s linear infinite;
  pointer-events: none;
}

.discard-empty {
  min-height: 3.2rem;
  border: 1px dashed rgba(100, 116, 139, 0.55);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  background: rgba(15, 23, 42, 0.18);
}

.grouped-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.group-block-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.group-block-list.compact {
  gap: 4px;
}

.group-block {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 2rem;
  padding: 0.25rem 0.35rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(71, 85, 105, 0.9);
  background: rgba(15, 23, 42, 0.56);
  flex: 0 1 auto;
  max-width: 100%;
}

.group-block.fish {
  border-color: rgba(56, 189, 248, 0.7);
  background: rgba(8, 47, 73, 0.42);
}

.group-block.public {
  border-color: rgba(250, 204, 21, 0.72);
  background: rgba(113, 63, 18, 0.32);
}

.group-badge {
  flex: 0 0 auto;
  min-width: 1.55rem;
  height: 1.55rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.68rem, 1.15vh, 0.8rem);
  font-weight: 700;
}

.mini-card-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.mini-card {
  width: clamp(1.55rem, 3vh, 1.8rem);
  height: clamp(1.68rem, 3.2vh, 1.95rem);
  border-radius: 0.45rem;
  border: 2px solid rgba(15, 23, 42, 0.42);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #020617;
  font-size: clamp(0.84rem, 1.5vh, 0.98rem);
  font-weight: 800;
  line-height: 1;
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.22);
}

.group-chip {
  appearance: none;
  border: 1px solid #334155;
  background: rgba(15, 23, 42, 0.62);
  border-radius: 8px;
  padding: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.group-chip.stacked {
  padding-right: 6px;
  overflow: visible;
}

.group-chip.expanded {
  background: rgba(30, 41, 59, 0.65);
  border-color: #64748b;
}

.group-chip:focus-visible {
  outline: 2px solid #22c55e;
  outline-offset: 1px;
}

.stacked-preview {
  display: inline-flex;
  align-items: flex-end;
  padding: 2px 2px 0 0;
}

.stack-item {
  transform-origin: bottom center;
  transition: transform 0.2s ease;
}

.stack-count {
  margin-left: 6px;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #bfdbfe;
  font-weight: 700;
}

.expanded-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-start;
}

.seat-zone .cards {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.center {
  position: relative;
  grid-area: center;
  width: 100%;
  justify-self: stretch;
  min-width: 0;
  min-height: 0;
  background: rgba(11, 18, 32, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: clamp(0.5rem, 1.4vh, 0.9rem);
  padding: clamp(0.3rem, 0.95vh, 0.65rem);
  color: #e2e8f0;
  display: flex;
  align-items: stretch;
  align-self: stretch;
}

.center-board {
  width: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7.6rem, 1.35fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1fr);
  grid-template-areas:
    ". top ."
    "left core right"
    ". bottom .";
  gap: clamp(0.22rem, 0.7vh, 0.48rem);
}

.center-seat {
  min-width: 0;
  min-height: 0;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: clamp(0.18rem, 0.55vh, 0.35rem);
  pointer-events: none;
}

.center-seat-top {
  grid-area: top;
  align-self: start;
}

.center-seat-left {
  grid-area: left;
  justify-self: start;
  align-self: center;
}

.center-seat-right {
  grid-area: right;
  justify-self: end;
  align-self: center;
}

.center-seat-bottom {
  grid-area: bottom;
  align-self: end;
}

.center-seat-name {
  font-size: clamp(0.62rem, 1.2vh, 0.76rem);
  color: #cbd5e1;
  text-align: center;
}

.center-seat-action {
  min-width: clamp(3rem, 7vw, 4.3rem);
  min-height: clamp(2rem, 4.8vh, 2.8rem);
  padding: 0.18rem 0.42rem;
  border-radius: 0.8rem;
  border: 1px dashed rgba(71, 85, 105, 0.8);
  background: rgba(15, 23, 42, 0.46);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.84rem, 1.6vh, 1.02rem);
  font-weight: 800;
  color: #94a3b8;
  text-align: center;
  line-height: 1.1;
}

.center-seat.action .center-seat-action {
  border-style: solid;
  border-color: rgba(251, 191, 36, 0.88);
  background: rgba(120, 53, 15, 0.34);
  color: #fef3c7;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.18);
}

.center-seat.responding .center-seat-action,
.center-seat.active .center-seat-action {
  border-color: rgba(34, 197, 94, 0.88);
  color: #dcfce7;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.24) inset, 0 0 16px rgba(34, 197, 94, 0.16);
}

.center-core {
  grid-area: core;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(51, 65, 85, 0.68);
  border-radius: clamp(0.45rem, 1vh, 0.8rem);
  background: rgba(2, 6, 23, 0.32);
  padding: clamp(0.24rem, 0.75vh, 0.48rem);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(0.28rem, 0.8vh, 0.55rem);
  align-items: stretch;
}

.center-core-cell {
  min-width: 0;
  min-height: 0;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 0.28rem;
  text-align: center;
}

.center-core-subtle {
  font-size: clamp(0.56rem, 1.1vh, 0.68rem);
  color: #94a3b8;
}

.center-core-card {
  display: grid;
  place-items: center;
}

.pending-inline {
  display: flex;
  align-items: center;
  justify-content: center;
}

.pending-inline.draw-pending-hidden > * {
  opacity: 0;
}

.center-core-label {
  font-size: clamp(0.62rem, 1.15vh, 0.74rem);
  color: #93c5fd;
}

.pending-placeholder {
  min-height: clamp(3.4rem, 7vh, 4.4rem);
  display: grid;
  place-items: center;
  padding: 0.35rem;
  border-radius: 0.7rem;
  border: 1px dashed rgba(71, 85, 105, 0.72);
  color: #64748b;
  font-size: clamp(0.62rem, 1.15vh, 0.74rem);
}

.deck-stack {
  position: relative;
  width: clamp(2.6rem, 5.6vh, 3.4rem);
  height: clamp(3.4rem, 7vh, 4.4rem);
  display: grid;
  place-items: center;
}

.deck-stack-card {
  position: absolute;
  inset: auto;
  width: clamp(2rem, 4.8vh, 2.7rem);
  height: clamp(2.8rem, 6.1vh, 3.6rem);
  border-radius: 0.5rem;
  background: linear-gradient(180deg, #b91c1c, #7f1d1d);
  border: 1px solid rgba(127, 29, 29, 0.9);
  box-shadow: 0 4px 10px rgba(2, 6, 23, 0.24);
}

.deck-stack-card:nth-child(1) {
  transform: translate(-8px, -6px);
}

.deck-stack-card:nth-child(2) {
  transform: translate(0, 0);
}

.deck-stack-card:nth-child(3) {
  transform: translate(8px, 6px);
}

.deck-stack-count {
  position: relative;
  z-index: 1;
  min-width: 1.7rem;
  height: 1.7rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.84);
  color: #fef2f2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.7rem, 1.6vh, 0.96rem);
  box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.28);
}

.resp-move-enter-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}

.resp-move-enter-from {
  transform: translateY(38px) scale(0.86);
  opacity: 0;
}

.resp-move-enter-to {
  transform: translateY(0) scale(1);
  opacity: 1;
}

.center-pointer {
  position: absolute;
  width: 34px;
  height: 34px;
  pointer-events: none;
  z-index: 4;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.75));
}

.center-pointer::before {
  content: "";
  position: absolute;
  width: 4px;
  height: 16px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.98);
  top: 14px;
}

.center-pointer-head {
  position: absolute;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-bottom: 16px solid #22c55e;
  top: 0;
}

.pointer-up {
  left: 50%;
  top: -16px;
  transform: translateX(-50%) rotate(0deg);
}

.pointer-right {
  right: -16px;
  top: 50%;
  transform: translateY(-50%) rotate(90deg);
}

.pointer-down {
  left: 50%;
  bottom: -16px;
  transform: translateX(-50%) rotate(180deg);
}

.pointer-left {
  left: -16px;
  top: 50%;
  transform: translateY(-50%) rotate(270deg);
}

.empty {
  margin: 0;
  color: #64748b;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
}

.self-hand-card {
  display: flex;
}

.self-zone {
  position: relative;
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: clamp(0.45rem, 1vh, 0.85rem);
  padding: clamp(0.3rem, 0.9vh, 0.6rem);
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: clamp(0.25rem, 0.8vh, 0.55rem);
  min-height: 0;
  overflow: hidden;
}

.self-zone.active {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
  background: linear-gradient(180deg, rgba(8, 26, 19, 0.9), rgba(11, 18, 32, 0.95));
  animation: self-turn-pulse 1.15s ease-in-out infinite;
}

.self-zone.dealer {
  border-color: rgba(245, 158, 11, 0.95);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.38) inset, 0 0 24px rgba(245, 158, 11, 0.16);
}

.self-zone.actor-flash {
  animation: actor-flash 0.8s ease-out;
}

.self-turn-arrow {
  top: 2px;
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

.self-turn-timer {
  margin-top: 2px;
}

.self-main {
  display: grid;
  grid-template-columns: minmax(10rem, 34%) minmax(0, 1fr);
  gap: clamp(0.25rem, 0.8vh, 0.55rem);
  min-height: 0;
  flex: 1 1 auto;
}

.self-main.no-open {
  grid-template-columns: minmax(0, 1fr);
}

.self-areas {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(0.2rem, 0.7vh, 0.5rem);
  max-height: 100%;
  overflow: auto;
}

.self-hand-panel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(0.25rem, 0.7vh, 0.5rem);
}

.self-area {
  background: #111827;
  border: 1px solid #334155;
  border-radius: clamp(0.3rem, 0.8vh, 0.55rem);
  padding: clamp(0.2rem, 0.6vh, 0.4rem);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.self-area p {
  margin: 0 0 6px;
  color: #cbd5e1;
  font-size: 12px;
}

.self-area .cards {
  max-height: none;
  overflow: visible;
  padding-right: 2px;
}

.discard-tip {
  margin: 0;
  color: #bfdbfe;
  font-size: 13px;
}

.tone-red {
  background: #e53935;
}

.tone-yellow {
  background: #ffd700;
}

.tone-green {
  background: #43a047;
}

.tone-white {
  background: #ffffff;
}

.tone-gold {
  background: #c41e1e;
}

.hand {
  flex: 1 1 auto;
  min-height: 0;
  align-content: flex-start;
  overflow: auto;
  padding-right: 0;
  gap: clamp(0.2rem, 0.7vh, 0.55rem);
}

.hand-card {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 10px;
  min-width: 48px;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.hand-card.gold-blocked {
  opacity: 0.55;
  filter: saturate(0.7) grayscale(0.1);
}

.hand-card.candidate-active {
  position: relative;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.65);
}

.hand-card.candidate-selected {
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.95);
  transform: translateY(-2px);
}

.candidate-badge {
  position: absolute;
  right: 2px;
  top: 2px;
  z-index: 2;
  min-width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #1d4ed8;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  padding: 0 3px;
}

.hand :deep(.size-xl) {
  width: clamp(1.3rem, 2vw, 2rem);
  height: clamp(3.5rem, 5.2vw, 5.3rem);
}

.embedded-actions {
  flex: 0 0 auto;
  min-height: 0;
}

.embedded-actions-side {
  margin-top: auto;
}

.embedded-actions :deep(.panel) {
  background: transparent;
  border-top: none;
  padding: 0;
  gap: clamp(0.2rem, 0.5vh, 0.4rem);
}

.embedded-actions :deep(.hint) {
  display: none;
}

.deck-anchor {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1px;
  height: 1px;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
}

.fx-layer {
  position: fixed;
  inset: 0;
  z-index: 36;
  pointer-events: none;
  overflow: hidden;
}

.fx-card {
  position: fixed;
  left: 0;
  top: 0;
  transform: translate(var(--sx), var(--sy));
  animation-name: fly-card;
  animation-duration: var(--dur);
  animation-delay: var(--delay);
  animation-timing-function: cubic-bezier(0.2, 0.75, 0.2, 1);
  animation-fill-mode: forwards;
  filter: drop-shadow(0 8px 14px rgba(2, 6, 23, 0.36));
}

.fx-card.deal {
  filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.45));
}

.card-back {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.8);
  background:
    linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.95)),
    repeating-linear-gradient(
      -40deg,
      rgba(71, 85, 105, 0.75) 0px,
      rgba(71, 85, 105, 0.75) 4px,
      rgba(30, 41, 59, 0.85) 4px,
      rgba(30, 41, 59, 0.85) 8px
    );
}

.deal-overlay {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: radial-gradient(circle at center, rgba(15, 23, 42, 0.32), rgba(2, 6, 23, 0.58));
  color: #e2e8f0;
  font-size: clamp(0.95rem, 2.1vh, 1.3rem);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-shadow: 0 0 12px rgba(148, 163, 184, 0.55);
}

.dealer-reveal {
  position: absolute;
  z-index: 10;
  left: 50%;
  top: 18%;
  transform: translateX(-50%);
  min-width: clamp(9rem, 24vw, 15rem);
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.85);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
  box-shadow: 0 0 22px rgba(245, 158, 11, 0.32);
  padding: clamp(0.38rem, 0.95vh, 0.62rem) clamp(0.65rem, 1.5vw, 1rem);
  display: grid;
  justify-items: center;
  gap: 2px;
  pointer-events: none;
}

.dealer-reveal-label {
  color: #fbbf24;
  font-size: clamp(0.62rem, 1.45vh, 0.8rem);
}

.dealer-reveal strong {
  color: #fef3c7;
  font-size: clamp(0.84rem, 1.95vh, 1.08rem);
  letter-spacing: 0.02em;
}

.dealer-flight {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 40;
  min-width: 52px;
  text-align: center;
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.95);
  background: rgba(15, 23, 42, 0.95);
  color: #fbbf24;
  font-size: clamp(0.78rem, 1.7vh, 0.96rem);
  font-weight: 800;
  padding: 0.18rem 0.55rem;
  transform: translate(var(--sx), var(--sy));
  animation: dealer-fly 0.9s cubic-bezier(0.22, 0.8, 0.24, 1) forwards;
  box-shadow: 0 0 14px rgba(245, 158, 11, 0.38);
  pointer-events: none;
}

.deal-fade-enter-active,
.deal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.deal-fade-enter-from,
.deal-fade-leave-to {
  opacity: 0;
}

.dealer-reveal-enter-active,
.dealer-reveal-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.dealer-reveal-enter-from,
.dealer-reveal-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px) scale(0.92);
}

.dealer-flight-enter-active,
.dealer-flight-leave-active {
  transition: opacity 0.18s ease;
}

.dealer-flight-enter-from,
.dealer-flight-leave-to {
  opacity: 0;
}

.center.my-turn {
  border-color: rgba(34, 197, 94, 0.7);
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
}

@keyframes blink-turn {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@keyframes seat-turn-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
  }
  50% {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.8) inset, 0 0 18px rgba(34, 197, 94, 0.25);
  }
}

@keyframes self-turn-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35) inset;
  }
  50% {
    box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.85) inset, 0 0 22px rgba(34, 197, 94, 0.22);
  }
}

@keyframes turn-arrow-bounce {
  0%,
  100% {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
  50% {
    transform: translateX(-50%) translateY(-4px);
    opacity: 0.75;
  }
}

@keyframes actor-flash {
  0% {
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.88);
  }
  100% {
    box-shadow: 0 0 0 14px rgba(56, 189, 248, 0);
  }
}

@keyframes dealer-fly {
  0% {
    transform: translate(var(--sx), var(--sy)) scale(2.8);
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--ex), var(--ey)) scale(1);
    opacity: 1;
  }
}

@keyframes flow-active-glow {
  0% {
    filter: hue-rotate(0deg);
  }
  100% {
    filter: hue-rotate(360deg);
  }
}

@keyframes fly-card {
  0% {
    transform: translate(var(--sx), var(--sy)) scale(1);
    opacity: 0.98;
  }
  75% {
    opacity: 0.98;
  }
  100% {
    transform: translate(var(--ex), var(--ey)) scale(0.92);
    opacity: 0.12;
  }
}

@media (min-width: 961px) {
  .table {
    height: 100%;
    max-height: 100%;
    aspect-ratio: auto;
  }

  .hand :deep(.size-xl) {
    height: clamp(3rem, 4.3vw, 4.8rem);
  }
}

@media (max-width: 1200px) {
  .table {
    grid-template-columns: minmax(0, 24%) minmax(0, 1fr) minmax(0, 24%);
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .board {
    gap: 0.25rem;
  }

  .table {
    aspect-ratio: auto;
    max-height: none;
    border-radius: 0.65rem;
    padding: 0.25rem;
  }

  .center {
    padding: 0.25rem;
  }

  .center-board {
    gap: 0.18rem;
  }

  .center-seat-action {
    min-width: 2.6rem;
    min-height: 1.7rem;
    font-size: clamp(0.68rem, 1.35vh, 0.84rem);
  }

  .response-wrap {
    min-height: clamp(2.8rem, 8.8vh, 4.6rem);
  }

  .response-wrap small {
    font-size: 11px;
  }

  .self-head h3 {
    font-size: 16px;
  }

  .self-head p {
    font-size: 12px;
  }

  .hand {
    gap: 0.2rem;
  }

  .turn-timer-bar {
    height: 6px;
  }
}

@media (orientation: landscape) and (max-width: 960px) {
  .board {
    grid-template-columns: minmax(0, 24%) minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) clamp(8.8rem, 27vh, 11.2rem);
    gap: 0.55vh;
  }

  .table {
    height: 100%;
    max-height: none;
    aspect-ratio: auto;
    padding: 0.7vh;
    border-radius: 1.6vh;
    grid-template-columns: minmax(0, 24%) minmax(0, 1fr) minmax(0, 24%);
    grid-template-rows: minmax(3.9rem, 0.82fr) minmax(4.6rem, 1fr) minmax(4rem, 0.88fr);
    grid-template-areas:
      "flowtl top flowtr"
      "left center right"
      "flowbl selfgroups flowbr";
    column-gap: 0.55vh;
    row-gap: 0.55vh;
  }

  .corner-card {
    min-width: 3rem;
    min-height: 1.55rem;
    font-size: 0.76rem;
  }

  .group-block-list {
    gap: 0.35vh;
  }

  .group-block {
    gap: 0.35vh;
    padding: 0.28vh 0.4vh;
    border-radius: 0.9vh;
  }

  .group-badge {
    min-width: 1.28rem;
    height: 1.28rem;
    font-size: clamp(0.5rem, 1.15vh, 0.62rem);
  }

  .mini-card {
    width: 1.3rem;
    height: 1.45rem;
    font-size: clamp(0.62rem, 1.32vh, 0.74rem);
  }

  .player-card,
  .flow-card,
  .self-groups-card,
  .self-info-card,
  .self-hand-card {
    padding: 0.45vh 0.55vh;
    gap: 0.35vh;
  }

  .player-top {
    min-height: 0;
  }

  .seat-head strong {
    font-size: clamp(0.88rem, 2.1vh, 1.02rem);
  }

  .seat-meta {
    font-size: clamp(0.56rem, 1.35vh, 0.68rem);
  }

  .tag {
    padding: 0.1rem 0.35rem;
    line-height: 1.1;
    font-size: clamp(0.54rem, 1.25vh, 0.65rem);
  }

  .flow-card p,
  .self-groups-card p {
    font-size: clamp(0.55rem, 1.3vh, 0.66rem);
  }

  .center {
    padding: 0.7vh 0.9vh;
    border-radius: 1.4vh;
  }

  .center-board {
    grid-template-columns: minmax(0, 1fr) minmax(6.4rem, 1.2fr) minmax(0, 1fr);
    gap: 0.45vh;
  }

  .center-text p {
    font-size: clamp(0.62rem, 1.4vh, 0.76rem);
  }

  .center-info-row {
    gap: 0.22rem;
  }

  .info-chip {
    min-height: 1.25rem;
    padding: 0.08rem 0.35rem;
    font-size: clamp(0.5rem, 1.15vh, 0.64rem);
  }

  .center-seat-name {
    font-size: clamp(0.5rem, 1.1vh, 0.62rem);
  }

  .center-seat-action {
    min-width: 2.4rem;
    min-height: 1.55rem;
    padding: 0.12rem 0.28rem;
    font-size: clamp(0.62rem, 1.28vh, 0.76rem);
  }

  .response-wrap {
    min-height: 8.8vh;
    padding: 0.45vh;
  }

  .response-wrap small {
    font-size: clamp(0.54rem, 1.28vh, 0.66rem);
  }

  .self-head {
    align-items: flex-start;
    gap: 0.4vh;
    flex-wrap: wrap;
  }

  .self-head h3 {
    font-size: clamp(0.92rem, 2.25vh, 1.08rem);
    line-height: 1.08;
  }

  .self-head p {
    font-size: clamp(0.58rem, 1.45vh, 0.72rem);
  }

  .self-head .seat-tags {
    width: 100%;
    justify-content: flex-start;
    gap: 0.35vh;
  }

  .self-info-card {
    border-radius: 1.4vh;
    padding: 0.55vh 0.8vh;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
  }

  .self-groups-card,
  .self-hand-card {
    border-radius: 1.1vh;
    padding: 0.35vh 0.55vh;
  }

  .self-info-hint {
    font-size: clamp(0.54rem, 1.28vh, 0.66rem);
  }

  .discard-tip {
    font-size: clamp(0.56rem, 1.35vh, 0.72rem);
  }

  .discard-token {
    width: 1.45rem;
    height: 1.45rem;
    font-size: clamp(0.62rem, 1.35vh, 0.76rem);
  }

  .hand {
    overflow: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45vh 0.18vh;
    min-height: 0;
    align-content: start;
    padding-bottom: 0.2vh;
  }

  .hand-card {
    border-radius: 0.7vh;
    flex: 0 0 clamp(1.7rem, 4.6vw, 2.4rem);
    width: auto;
    min-height: 48px;
  }

  .hand :deep(.size-xl) {
    width: clamp(0.9rem, 2.2vw, 1.3rem);
    height: clamp(2.7rem, 6.6vh, 3.8rem);
    font-size: clamp(0.62rem, 1.55vh, 0.82rem);
  }

  .embedded-actions {
    margin-top: 0;
    border-top: 1px solid rgba(51, 65, 85, 0.8);
    background: #0b1220;
    position: relative;
    z-index: 2;
    padding-top: 0.35vh;
  }

  .embedded-actions :deep(.panel) {
    background: #0b1220;
    border-top: none;
    gap: 0.35vh;
  }

  .embedded-actions :deep(.actions) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(48px, 1fr));
    gap: 0.45vh;
    justify-content: initial;
    align-items: stretch;
    flex-wrap: nowrap;
  }

  .embedded-actions :deep(.btn) {
    width: 100%;
    flex: 0 0 auto;
    min-width: 48px;
    min-height: 48px;
    font-size: clamp(0.84rem, 1.95vh, 1rem);
    border-radius: 0.85vh;
  }

  .embedded-actions :deep(.btn:disabled) {
    opacity: 0.58;
  }

  .embedded-actions-side {
    border-top: 1px solid rgba(51, 65, 85, 0.8);
    padding-top: 0.35vh;
    margin-top: auto;
  }

  .embedded-actions-side :deep(.actions) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35vh;
  }

  .embedded-actions-side :deep(.btn) {
    min-width: 0;
    min-height: 42px;
    padding: 0;
  }
}

@supports (-webkit-touch-callout: none) {
  @media (orientation: landscape) and (max-width: 960px) {
    .hand {
      -webkit-overflow-scrolling: touch;
    }
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

  .self-main {
    grid-template-columns: 1fr;
  }
}
</style>
