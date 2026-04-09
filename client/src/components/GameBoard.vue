<template>
  <div class="board">
    <div class="table" ref="tableRef">
      <section
        class="self-open-left"
        v-if="isCompactLandscape && selfPlayer && (selfOpenGroups.length || selfPlayer.fishArea.length)"
        ref="selfOpenCompactRef"
      >
        <p>你的明示区</p>
        <div class="grouped-cards">
          <button
            v-for="group in selfOpenGroups"
            :key="`self-open-left-${group.id}`"
            class="group-chip"
            :class="{ expanded: isOpenGroupExpanded(selfPlayer.clientId, group.id), stacked: !isOpenGroupExpanded(selfPlayer.clientId, group.id) }"
            @click="toggleOpenGroup(selfPlayer.clientId, group.id)"
          >
            <div v-if="isOpenGroupExpanded(selfPlayer.clientId, group.id)" class="expanded-preview cards">
              <CardComp v-for="card in group.cards" :key="`self-open-left-card-${card.id}`" :card="card" size="sm" />
            </div>
            <div v-else class="stacked-preview">
              <CardComp
                v-for="(card, idx) in previewGroupCards(group.cards)"
                :key="`self-open-left-stack-${card.id}`"
                :card="card"
                size="sm"
                class="stack-item"
                :style="fanCardStyle(idx, previewGroupSize(group.cards))"
              />
              <span class="stack-count">x{{ group.cards.length }}</span>
            </div>
          </button>
          <CardComp v-for="card in selfPlayer.fishArea" :key="`self-fish-left-${card.id}`" :card="card" size="sm" />
        </div>
      </section>

      <section
        v-for="entry in seatEntries"
        :key="entry.position"
        :ref="(el) => setSeatRef(entry.player.clientId, el as HTMLElement | null)"
        class="seat"
        :class="[
          entry.position,
          {
            active: isCurrentTurn(entry.player.clientId),
            'with-fish': entry.player.fishArea.length > 0,
            dealer: isDealer(entry.player.clientId),
            'actor-flash': flashActorId === entry.player.clientId,
          },
        ]"
      >
        <div v-if="isCurrentTurn(entry.player.clientId)" class="turn-arrow" aria-hidden="true">▲</div>
        <header class="seat-head">
          <strong>{{ entry.player.name }}</strong>
          <div class="seat-tags">
            <span v-if="isDealer(entry.player.clientId)" class="tag dealer">庄家</span>
            <span v-if="isCurrentTurn(entry.player.clientId)" class="tag turn">当前回合</span>
            <span
              v-if="isCurrentTurn(entry.player.clientId) && seatCountdownSeconds !== null"
              class="turn-countdown"
            >
              剩余 {{ seatCountdownSeconds }}s
            </span>
            <span class="tag status">{{ statusText(entry.player) }}</span>
          </div>
        </header>
        <div v-if="isCurrentTurn(entry.player.clientId) && seatCountdownSeconds !== null" class="turn-timer-bar">
          <span :style="{ width: `${seatCountdownPercent}%` }"></span>
        </div>

        <p class="seat-meta">声明暗坎: {{ entry.player.declaredKongs }}</p>

        <div class="seat-zone" v-if="entry.openGroups.length">
          <p>明示区</p>
          <div class="grouped-cards">
            <button
              v-for="group in entry.openGroups"
              :key="`exp-${entry.player.clientId}-${group.id}`"
              class="group-chip"
              :class="{ expanded: isOpenGroupExpanded(entry.player.clientId, group.id), stacked: !isOpenGroupExpanded(entry.player.clientId, group.id) }"
              @click="toggleOpenGroup(entry.player.clientId, group.id)"
            >
              <div v-if="isOpenGroupExpanded(entry.player.clientId, group.id)" class="expanded-preview cards">
                <CardComp
                  v-for="card in group.cards"
                  :key="`exp-card-${entry.player.clientId}-${card.id}`"
                  :card="card"
                  size="sm"
                />
              </div>
              <div v-else class="stacked-preview">
                <CardComp
                  v-for="(card, idx) in previewGroupCards(group.cards)"
                  :key="`exp-stack-${entry.player.clientId}-${card.id}`"
                  :card="card"
                  size="sm"
                  class="stack-item"
                  :style="fanCardStyle(idx, previewGroupSize(group.cards))"
                />
                <span class="stack-count">x{{ group.cards.length }}</span>
              </div>
            </button>
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

        <div class="seat-zone" v-if="entry.player.discardPile.length">
          <p>弃牌（{{ entry.player.discardPile.length }}张）</p>
          <div class="cards">
            <CardComp
              v-for="card in entry.player.discardPile.slice(0, 8)"
              :key="`dp-${entry.player.clientId}-${card.id}`"
              :card="card"
              size="sm"
            />
          </div>
        </div>
      </section>

      <section class="center" :class="{ 'my-turn': isMyTurn }">
        <div class="center-text">
          <p>当前行动者: <strong>{{ currentPlayerName }}</strong><span v-if="isMyTurn">（你）</span></p>
          <p class="center-turn-hint">{{ compactCenterHint }}</p>
          <p v-if="centerEventText" class="center-event">{{ centerEventText }}</p>
        </div>
        <div class="response-wrap" v-if="responseCard" ref="responseLandingRef">
          <Transition name="resp-move" mode="out-in">
            <CardComp :key="`resp-${responseCard.id}-${responseCard.source || 'upper'}`" :card="responseCard" size="lg" />
          </Transition>
          <small>待响牌</small>
        </div>
        <section class="table-action-log" v-if="mergedActionLogs.length">
          <ul>
            <li v-for="log in mergedActionLogs" :key="`merged-log-${log.id}`">
              <time>{{ log.at }}</time>
              <span>{{ log.actorLabel }} {{ log.displayText }}</span>
            </li>
          </ul>
        </section>
        <div v-if="centerPointerDirection" class="center-pointer" :class="`pointer-${centerPointerDirection}`">
          <i class="center-pointer-head"></i>
        </div>
        <div class="deck-anchor" ref="deckAnchorRef"></div>
      </section>

      <Transition name="deal-fade">
        <div v-if="showDealAnimation" class="deal-overlay">发牌中...</div>
      </Transition>

      <Transition name="dealer-reveal">
        <div v-if="dealerReveal" :key="`dealer-${dealerReveal.id}`" class="dealer-reveal">
          <span class="dealer-reveal-label">本局庄家</span>
          <strong>{{ dealerReveal.name }}</strong>
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

      <Transition name="action-pop">
        <div v-if="actionEffect" :key="`act-${actionEffect.id}`" class="action-effect">
          {{ actionEffect.label }}
        </div>
      </Transition>
    </div>

    <section
      class="self-zone"
      :class="{ active: isMyTurn, dealer: isDealer(selfPlayer.clientId), 'actor-flash': flashActorId === selfPlayer.clientId }"
      v-if="selfPlayer"
      ref="selfZoneRef"
    >
      <div v-if="isMyTurn" class="turn-arrow self-turn-arrow" aria-hidden="true">▲</div>
      <header class="self-head">
        <div>
          <h3>{{ selfPlayer.name }}（你）</h3>
          <p>声明暗坎: {{ selfPlayer.declaredKongs }}</p>
        </div>
        <div class="seat-tags">
          <span v-if="isDealer(selfPlayer.clientId)" class="tag dealer">庄家</span>
          <span v-if="isMyTurn && seatCountdownSeconds !== null" class="turn-countdown">剩余 {{ seatCountdownSeconds }}s</span>
          <span v-if="!isCompactLandscape" class="tag status">{{ statusText(selfPlayer) }}</span>
        </div>
      </header>
      <div v-if="isMyTurn && seatCountdownSeconds !== null" class="turn-timer-bar self-turn-timer">
        <span :style="{ width: `${seatCountdownPercent}%` }"></span>
      </div>
      <div
        class="self-main"
        :class="{ 'no-open': isCompactLandscape || !(selfOpenGroups.length || selfPlayer.fishArea.length || selfPlayer.discardPile.length) }"
      >
        <div
          class="self-areas"
          v-if="!isCompactLandscape && (selfOpenGroups.length || selfPlayer.fishArea.length || selfPlayer.discardPile.length)"
          ref="selfOpenRef"
        >
          <div class="self-area" v-if="selfOpenGroups.length">
            <p>明示区</p>
            <div class="grouped-cards">
              <button
                v-for="group in selfOpenGroups"
                :key="`self-exp-${group.id}`"
                class="group-chip"
                :class="{ expanded: isOpenGroupExpanded(selfPlayer.clientId, group.id), stacked: !isOpenGroupExpanded(selfPlayer.clientId, group.id) }"
                @click="toggleOpenGroup(selfPlayer.clientId, group.id)"
              >
                <div v-if="isOpenGroupExpanded(selfPlayer.clientId, group.id)" class="expanded-preview cards">
                  <CardComp v-for="card in group.cards" :key="`self-exp-card-${card.id}`" :card="card" size="sm" />
                </div>
                <div v-else class="stacked-preview">
                  <CardComp
                    v-for="(card, idx) in previewGroupCards(group.cards)"
                    :key="`self-exp-stack-${card.id}`"
                    :card="card"
                    size="sm"
                    class="stack-item"
                    :style="fanCardStyle(idx, previewGroupSize(group.cards))"
                  />
                  <span class="stack-count">x{{ group.cards.length }}</span>
                </div>
              </button>
            </div>
          </div>

          <div class="self-area" v-if="selfPlayer.fishArea.length">
            <p>亮鱼区</p>
            <div class="cards">
              <CardComp v-for="card in selfPlayer.fishArea" :key="`self-fish-${card.id}`" :card="card" size="sm" />
            </div>
          </div>

          <div class="self-area" v-if="selfPlayer.discardPile.length">
            <p>弃牌（{{ selfPlayer.discardPile.length }}张）</p>
            <div class="cards">
              <CardComp
                v-for="card in selfPlayer.discardPile.slice(0, 12)"
                :key="`self-dp-${card.id}`"
                :card="card"
                size="sm"
              />
            </div>
          </div>
        </div>
        <div class="self-hand-panel">
          <p v-if="canDiscard" class="discard-tip">点击手牌弃一张（将牌/金条不可弃）</p>
          <div class="cards hand" ref="selfHandRef">
            <button
              v-for="card in privateHand"
              :key="`me-${card.id}`"
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

          <ActionPanel
            v-if="props.embeddedActionPanel && props.state?.phase === 'playing'"
            class="embedded-actions"
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
import type { ActionCandidate, ActionRequest, AvailableAction, Card, ParsedActionLog, PlayerState } from "@/types/game";

type ExposedGroup = {
  id: string;
  cards: Card[];
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
  selectionMode?: "kai" | "peng" | "chi" | null;
  selectedCandidateId?: string | null;
  activeCandidates?: ActionCandidate[];
  parsedActionLogs?: ParsedActionLog[];
}>();

const emit = defineEmits<{
  discardCard: [cardId: string];
  submitAction: [request: ActionRequest];
  selectionChange: [payload: { mode: "kai" | "peng" | "chi" | null; selectedCandidateId: string | null }];
}>();

const isCompactLandscape = ref(false);
const nowMs = ref(Date.now());

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
const expandedOpenGroups = ref<Record<string, string | null>>({});
const discardingCardId = ref<string | null>(null);
const lastLocalDiscardAt = ref(0);
const flights = ref<CardFlight[]>([]);
const showDealAnimation = ref(false);
const actionEffect = ref<{ id: number; label: string } | null>(null);
const dealerReveal = ref<{ id: number; name: string } | null>(null);
const dealerFlight = ref<DealerFlight | null>(null);
const flashActorId = ref("");

const tableRef = ref<HTMLElement | null>(null);
const responseLandingRef = ref<HTMLElement | null>(null);
const deckAnchorRef = ref<HTMLElement | null>(null);
const selfHandRef = ref<HTMLElement | null>(null);
const selfZoneRef = ref<HTMLElement | null>(null);
const selfOpenRef = ref<HTMLElement | null>(null);
const selfOpenCompactRef = ref<HTMLElement | null>(null);
const seatRefMap = new Map<string, HTMLElement>();

let actionEffectSeq = 0;
let dealerRevealSeq = 0;
let dealerFlightSeq = 0;
let flightSeq = 0;
let dealRunSeq = 0;
let dealTimer: ReturnType<typeof setTimeout> | null = null;
let dealInterval: ReturnType<typeof setInterval> | null = null;
let actionTimer: ReturnType<typeof setTimeout> | null = null;
let dealerTimer: ReturnType<typeof setTimeout> | null = null;
let dealerIntroTimer: ReturnType<typeof setTimeout> | null = null;
let dealAnimatingUntil = 0;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
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

const seatEntries = computed<Array<{ position: "top" | "left" | "right"; player: PlayerState; openGroups: ExposedGroup[] }>>(() => {
  const entries: Array<{ position: "top" | "left" | "right"; player: PlayerState | null }> = [
    { position: "top", player: topPlayer.value },
    { position: "left", player: leftPlayer.value },
    { position: "right", player: rightPlayer.value },
  ];

  return entries
    .filter((x): x is { position: "top" | "left" | "right"; player: PlayerState } => Boolean(x.player))
    .map((entry) => ({
      ...entry,
      openGroups: buildOpenGroups(entry.player, `seat-${entry.player.clientId}`),
    }));
});

const selfOpenGroups = computed<ExposedGroup[]>(() => {
  const player = selfPlayer.value;
  if (!player) {
    return [];
  }
  return buildOpenGroups(player, `self-${player.clientId}`);
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

  return collective ? latestDiscardFromAction.value : null;
});

const currentPlayer = computed(() => {
  const playerId = props.state?.currentTurnPlayerId || props.state?.currentPlayerId;
  if (!playerId) {
    return null;
  }
  return props.players.find((x) => x.clientId === playerId) ?? null;
});

const currentPlayerName = computed(() => {
  const playerId = props.state?.currentTurnPlayerId || props.state?.currentPlayerId;
  if (!playerId) {
    return "-";
  }
  return currentPlayer.value?.name || playerId;
});

const isMyTurn = computed(
  () =>
    Boolean(props.mySeatId) &&
    (props.state?.currentTurnPlayerId || props.state?.currentPlayerId) === props.mySeatId &&
    !Boolean(currentPlayer.value?.isBot),
);

const canDiscard = computed(() => Boolean(props.canDiscard));

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

const centerEventText = computed(() => {
  const action = String(props.state?.lastAction ?? "").trim();
  if (!action) {
    return "";
  }
  const { actor, keyword } = parseActionDescriptor(action);
  if (isSystemAction(keyword)) {
    return "";
  }
  const actionMap: Record<string, string> = {
    DISCARD: "出牌",
    PENG: "碰",
    OPEN: "开",
    KAI: "开",
    EAT: "吃",
    CHI: "吃",
    HU: "胡",
    PASS: "过",
    TIMEOUT_PASS: "超时过",
  };
  const label = actionMap[keyword];
  if (!label) {
    return "";
  }
  const actorName = props.players.find((player) => player.clientId === actor)?.name || actor || "系统";
  const target = responseCard.value ?? latestDiscardFromAction.value;
  const targetLabel = target ? cardLabel(target) : "-";
  return `${actorName} ${label}（target: ${targetLabel}）`;
});

const seatCountdownSeconds = computed<number | null>(() => {
  const endsAt = Number(props.state?.responseEndsAt ?? 0);
  if (!endsAt || endsAt <= nowMs.value) {
    return null;
  }
  return Math.max(0, Math.ceil((endsAt - nowMs.value) / 1000));
});

const seatCountdownPercent = computed<number>(() => {
  const endsAt = Number(props.state?.responseEndsAt ?? 0);
  if (!endsAt || endsAt <= nowMs.value) {
    return 0;
  }
  const remain = endsAt - nowMs.value;
  const raw = (remain / OP_COUNTDOWN_MS) * 100;
  return Math.max(0, Math.min(100, Number(raw.toFixed(1))));
});

const compactCenterHint = computed(() => {
  if (canDiscard.value) {
    return "请选择弃牌";
  }
  if (String(props.state?.responsePhase ?? "") === "collective") {
    return isMyTurn.value ? "等待他人响应" : "待响应阶段";
  }
  return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});

const mergedActionLogs = computed(() => {
  const logs = props.parsedActionLogs ?? [];
  return logs.slice(0, 12).map((log) => ({
    ...log,
    actorLabel: props.players.find((player) => player.clientId === log.actorId)?.name || log.actorId || "系统",
  }));
});

const centerPointerDirection = computed<"up" | "down" | "left" | "right" | null>(() => {
  const currentId = String(props.state?.currentTurnPlayerId || props.state?.currentPlayerId || "");
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

function isCurrentTurn(playerId: string): boolean {
  return (props.state?.currentTurnPlayerId || props.state?.currentPlayerId) === playerId;
}

function statusText(player: PlayerState): string {
  if (player.isBot) {
    return "BOT托管";
  }
  return player.connected ? "在线" : "离线";
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
  const colorMap: Record<string, string> = {
    red: "红",
    yellow: "黄",
    green: "绿",
    white: "白",
    gold: "金",
  };
  const typeMap: Record<string, string> = {
    jiang: "将",
    shi: "士",
    xiang: "相",
    ju: "车",
    ma: "马",
    pao: "炮",
    zu: "卒",
    gong: "条",
    hou: "侯",
    bo: "伯",
    zi: "子",
    nan: "男",
  };
  return `${colorMap[card.color] ?? card.color}${typeMap[card.type] ?? card.type}`;
}

function previewGroupCards(cards: Card[]): Card[] {
  return cards.slice(0, previewGroupSize(cards));
}

function previewGroupSize(cards: Card[]): number {
  return Math.min(4, cards.length);
}

function fanCardStyle(index: number, total: number): Record<string, string> {
  const center = (total - 1) / 2;
  const offset = index - center;
  return {
    zIndex: String(index + 1),
    marginLeft: index === 0 ? "0" : "-0.68rem",
    transform: `rotate(${offset * 8}deg) translateY(${Math.abs(offset) * 1.4}px)`,
  };
}

function isOpenGroupExpanded(playerId: string, groupId: string): boolean {
  return expandedOpenGroups.value[playerId] === groupId;
}

function toggleOpenGroup(playerId: string, groupId: string): void {
  const current = expandedOpenGroups.value[playerId];
  expandedOpenGroups.value = {
    ...expandedOpenGroups.value,
    [playerId]: current === groupId ? null : groupId,
  };
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
  const seat = seatEntries.value.find((entry) => entry.player.clientId === playerId);
  return seat?.position ?? "self";
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
  const count = keyword === "OPEN" || keyword === "KAI" ? 4 : 3;
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
    if (index >= plan.length) {
      clearDealAnimationRuntime();
      dealTimer = setTimeout(() => {
        if (runId === dealRunSeq) {
          showDealAnimation.value = false;
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

function triggerActionEffect(label: string) {
  if (actionTimer) {
    clearTimeout(actionTimer);
    actionTimer = null;
  }
  actionEffect.value = { id: ++actionEffectSeq, label };
  actionTimer = setTimeout(() => {
    actionEffect.value = null;
    actionTimer = null;
  }, 760);
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

function triggerDealerReveal(name: string, dealerId?: string) {
  if (!name || name === "-") {
    return;
  }
  if (dealerTimer) {
    clearTimeout(dealerTimer);
    dealerTimer = null;
  }
  dealerReveal.value = { id: ++dealerRevealSeq, name };
  dealerTimer = setTimeout(() => {
    dealerReveal.value = null;
    dealerTimer = null;
  }, 1400);
  if (dealerId) {
    triggerDealerFlight(dealerId);
  }
}

function queueDealerIntro(name: string, dealerId?: string): void {
  clearDealerIntroTimer();
  const delay = Math.max(0, dealAnimatingUntil - Date.now());
  dealerIntroTimer = setTimeout(() => {
    dealerIntroTimer = null;
    triggerDealerReveal(name, dealerId);
  }, delay);
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
});

onUnmounted(() => {
  clearDealAnimationRuntime();
  clearDealerIntroTimer();
  if (actionTimer) {
    clearTimeout(actionTimer);
    actionTimer = null;
  }
  if (dealerTimer) {
    clearTimeout(dealerTimer);
    dealerTimer = null;
  }
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  flashActorId.value = "";
  dealerFlight.value = null;
  window.removeEventListener("resize", updateCompactLandscape);
  window.removeEventListener("orientationchange", updateCompactLandscape);
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

watch(
  () => props.state?.phase,
  (phase, prev) => {
    if (prev === "declaring" && phase === "playing") {
      triggerDealAnimation();
      queueDealerIntro(dealerName.value, String(props.state?.dealerId ?? ""));
    }
  },
);

watch(
  () => props.state?.lastAction,
  (action) => {
    const dealerMatch = String(action ?? "").match(/^DEALER\s+(\S+)/);
    if (dealerMatch) {
      const dealerId = dealerMatch[1];
      const name = props.players.find((p) => p.clientId === dealerId)?.name || dealerId;
      queueDealerIntro(name, dealerId);
      return;
    }
    const { actor, keyword } = parseActionDescriptor(String(action ?? ""));
    if (actor) {
      triggerActorFlash(actor);
    }
    const labelMap: Record<string, string> = {
      PENG: "碰",
      EAT: "吃",
      CHI: "吃",
      OPEN: "开",
      KAI: "开",
      HU: "胡",
      KONG_DRAW: "补牌",
      GRAB: "抓",
    };
    const label = labelMap[keyword];
    if (label) {
      triggerActionEffect(label);
    }
    if (keyword === "DISCARD" && actor) {
      if (!(actor === props.mySeatId && Date.now() - lastLocalDiscardAt.value < 650)) {
        triggerDiscardAnimationFromSeat(actor);
      }
      return;
    }
    if ((keyword === "PENG" || keyword === "EAT" || keyword === "OPEN" || keyword === "KAI" || keyword === "CHI") && actor) {
      triggerMeldAnimation(actor, keyword);
    }
  },
);

watch(
  () => props.privateHand.map((x) => x.id).join("|"),
  () => {
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
  grid-template-rows: minmax(0, 1fr) clamp(9rem, 26vh, 13rem);
  gap: clamp(0.3rem, 0.9vh, 0.5rem);
  overflow: hidden;
}

.table {
  position: relative;
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
  grid-template-columns: minmax(0, 24%) minmax(0, 1fr) minmax(0, 24%);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    ". top ."
    "left center right";
  column-gap: clamp(0.3rem, 1vw, 0.75rem);
  row-gap: clamp(0.25rem, 0.9vh, 0.6rem);
  padding: clamp(0.25rem, 1vh, 0.7rem);
}

.self-open-left {
  display: none;
}

.seat {
  position: relative;
  background: rgba(11, 18, 32, 0.88);
  border: 1px solid #1e293b;
  border-radius: clamp(0.4rem, 1vh, 0.8rem);
  padding: clamp(0.25rem, 0.8vh, 0.5rem);
  color: #e2e8f0;
  display: grid;
  grid-template-rows: auto auto minmax(86px, 1fr);
  gap: 6px;
  overflow: auto;
  min-height: 0;
}

.seat.with-fish {
  grid-template-rows: auto auto minmax(62px, 1fr) minmax(62px, 1fr);
}

.seat.top {
  grid-area: top;
  width: 100%;
  justify-self: center;
  height: auto;
  min-height: clamp(6rem, 16vh, 8.2rem);
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
  animation: seat-turn-pulse 1.45s ease-in-out infinite;
}

.seat.actor-flash {
  animation: actor-flash 0.8s ease-out;
}

.seat.dealer {
  border-color: rgba(245, 158, 11, 0.92);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.34) inset, 0 0 18px rgba(245, 158, 11, 0.2);
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

.seat-zone {
  margin: 0;
  border-top: 1px dashed #334155;
  padding-top: 6px;
  min-height: 0;
  overflow: auto;
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

.grouped-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
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
  font-size: 12px;
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
  width: min(100%, 66%);
  justify-self: center;
  min-width: 0;
  min-height: 0;
  background: rgba(11, 18, 32, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: clamp(0.5rem, 1.4vh, 0.9rem);
  padding: clamp(0.3rem, 0.95vh, 0.65rem);
  color: #e2e8f0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: clamp(0.25rem, 0.8vh, 0.55rem);
  align-self: stretch;
}

.center-text {
  display: grid;
  grid-auto-rows: min-content;
  align-content: center;
  gap: 6px;
  text-align: left;
}

.center-text p {
  margin: 0;
  font-size: clamp(0.64rem, 1.45vh, 0.82rem);
}

.center-text strong {
  color: #e2e8f0;
}

.center-turn-hint {
  margin: 0;
  color: #bfdbfe;
  font-size: clamp(0.58rem, 1.45vh, 0.78rem);
}

.response-wrap {
  border: 1px solid rgba(51, 65, 85, 0.6);
  border-radius: clamp(0.35rem, 0.9vh, 0.7rem);
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: clamp(0.2rem, 0.65vh, 0.5rem);
  padding: clamp(0.2rem, 0.7vh, 0.5rem);
  min-height: clamp(3.8rem, 10vh, 5.2rem);
}

.response-wrap small {
  color: #bfdbfe;
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

.center-event {
  margin: 0;
  color: #fde68a;
  font-size: clamp(0.65rem, 1.5vh, 0.86rem);
  font-weight: 700;
}

.table-action-log {
  position: absolute;
  left: clamp(0.3rem, 1vw, 0.55rem);
  bottom: clamp(0.3rem, 1vh, 0.55rem);
  width: min(54%, 18rem);
  max-height: clamp(5.2rem, 18vh, 8.6rem);
  overflow: auto;
  border-radius: 8px;
  border: 1px solid rgba(51, 65, 85, 0.8);
  background: rgba(2, 6, 23, 0.64);
  padding: 0.3rem 0.42rem;
  z-index: 3;
}

.table-action-log ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.16rem;
}

.table-action-log li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem;
  font-size: clamp(0.56rem, 1.2vh, 0.7rem);
  color: #dbeafe;
}

.table-action-log time {
  color: #93c5fd;
  font-variant-numeric: tabular-nums;
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
  font-size: 12px;
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
  display: flex;
  flex-direction: column;
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
  color: #facc15;
  font-size: 13px;
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

.action-effect {
  position: absolute;
  z-index: 10;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  min-width: clamp(2.2rem, 5vw, 3.6rem);
  min-height: clamp(2.2rem, 5vw, 3.6rem);
  border-radius: 999px;
  border: 1px solid rgba(34, 197, 94, 0.7);
  background: rgba(15, 23, 42, 0.88);
  color: #bbf7d0;
  display: grid;
  place-items: center;
  font-size: clamp(0.88rem, 2.1vh, 1.2rem);
  font-weight: 800;
  pointer-events: none;
  box-shadow: 0 0 24px rgba(34, 197, 94, 0.35);
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

.action-pop-enter-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.action-pop-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.action-pop-enter-from,
.action-pop-leave-to {
  transform: translate(-50%, -38%) scale(0.76);
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
    max-height: none;
    grid-template-columns: minmax(0, 25%) minmax(0, 1fr) minmax(0, 25%);
  }

  .center {
    width: min(100%, 72%);
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

  .seat {
    padding: 0.2rem;
    gap: 0.2rem;
  }

  .seat.top {
    height: clamp(3.3rem, 11vh, 4.8rem);
  }

  .center {
    width: min(100%, 74%);
    padding: 0.25rem;
    gap: 0.2rem;
  }

  .response-wrap {
    min-height: clamp(2.8rem, 8.8vh, 4.6rem);
  }

  .response-wrap small {
    font-size: 11px;
  }

  .self-zone {
    gap: 0.2rem;
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

  .table-action-log {
    max-height: clamp(4.4rem, 15vh, 6.6rem);
    width: min(58%, 15rem);
  }
}

@media (orientation: landscape) and (max-width: 960px) {
  .board {
    grid-template-columns: minmax(0, 66%) minmax(0, 34%);
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 1vh;
  }

  .table {
    grid-column: 1;
    grid-row: 1;
    height: 100%;
    max-height: none;
    aspect-ratio: auto;
    padding: 1vh;
    border-radius: 1.6vh;
    grid-template-columns: minmax(0, 22%) minmax(0, 1fr) minmax(0, 22%);
    grid-template-rows: minmax(0, 40%) minmax(0, 1fr);
    grid-template-areas:
      "selfopen top ."
      "left center right";
    column-gap: 1vh;
    row-gap: 1vh;
  }

  .self-open-left {
    grid-area: selfopen;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid #334155;
    border-radius: 1.1vh;
    background: rgba(11, 18, 32, 0.88);
    padding: 0.35vh 0.5vh;
    overflow: auto;
  }

  .self-open-left p {
    margin: 0 0 0.35vh;
    font-size: clamp(0.54rem, 1.28vh, 0.66rem);
    color: #cbd5e1;
  }

  .self-open-left .cards {
    gap: 0.35vh;
    align-content: flex-start;
    overflow: auto;
  }

  .self-open-left .grouped-cards {
    gap: 0.35vh;
  }

  .seat {
    padding: 0.45vh 0.55vh;
    gap: 0.35vh;
  }

  .seat.top {
    height: auto;
    min-height: 15vh;
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

  .seat-zone {
    padding-top: 0.35vh;
  }

  .seat-zone p {
    margin-bottom: 0.35vh;
    font-size: clamp(0.55rem, 1.3vh, 0.66rem);
  }

  .seat-zone .cards {
    max-height: none;
    overflow: visible;
  }

  .grouped-cards {
    gap: 0.35vh;
  }

  .group-chip {
    padding: 0.24vh 0.28vh;
    border-radius: 0.8vh;
  }

  .stack-count {
    margin-left: 0.35vh;
    font-size: clamp(0.5rem, 1.2vh, 0.62rem);
  }

  .center {
    width: 100%;
    padding: 0.7vh 0.9vh;
    gap: 0.65vh;
    border-radius: 1.4vh;
  }

  .center-text p {
    font-size: clamp(0.62rem, 1.4vh, 0.76rem);
  }

  .response-wrap {
    min-height: 8.8vh;
    padding: 0.45vh;
  }

  .response-wrap small {
    font-size: clamp(0.54rem, 1.28vh, 0.66rem);
  }

  .self-zone {
    grid-column: 2;
    grid-row: 1;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    align-content: stretch;
    max-height: none;
    border-radius: 1.4vh;
    padding: 0.65vh 1vw;
    gap: 0.55vh;
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

  .self-areas {
    max-height: none;
    gap: 0.45vh;
    overflow: auto;
  }

  .self-main {
    grid-template-columns: minmax(0, 1fr);
  }

  .self-area {
    border-radius: 1.1vh;
    padding: 0.35vh 0.55vh;
  }

  .self-area p {
    margin-bottom: 0.2vh;
    font-size: clamp(0.54rem, 1.28vh, 0.66rem);
  }

  .self-area .cards {
    max-height: none;
    overflow: auto;
  }

  .self-area .grouped-cards {
    gap: 0.35vh;
  }

  .discard-tip {
    font-size: clamp(0.56rem, 1.35vh, 0.72rem);
  }

  .hand {
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(clamp(1.7rem, 4.6vw, 2.4rem), 1fr));
    column-gap: 0.08vh;
    row-gap: 0.7vh;
    min-height: 0;
    align-content: start;
    padding-bottom: 0.2vh;
  }

  .hand-card {
    border-radius: 0.7vh;
    min-width: 0;
    width: 100%;
    min-height: 48px;
  }

  .hand :deep(.size-xl) {
    width: min(100%, clamp(0.9rem, 2.2vw, 1.3rem));
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

  .table-action-log {
    width: min(62%, 12.5rem);
    max-height: clamp(4rem, 13vh, 5.6rem);
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

  .table-action-log {
    position: static;
    width: 100%;
    max-height: 6rem;
    margin-top: 0.2rem;
  }
}
</style>
