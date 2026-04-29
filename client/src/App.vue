<template>
  <OrientationGuard />
  <main class="layout" :class="{ playing: isPlaying, 'compact-landscape': isCompactLandscape && isPlaying }">
    <header class="top">
      <div class="top-brand">
        <h1>四色牌</h1>
        <p class="top-slogan">象棋魂·麻将韵·纸牌趣——四色牌，一局见真章！</p>
      </div>
      <div class="meta" v-if="hasLobbySession">
        <span>{{ connected ? "已连接" : "同步中..." }}</span>
        <span>座位ID: {{ mySeatId || "-" }}</span>
        <span>房主: {{ state?.hostPlayerId || "-" }}</span>
        <span>庄家: {{ dealerName }}</span>
        <div class="view-mode-toggle">
          <button class="ghost mini" :class="{ active: tableCardMode === 'simple' }" @click="tableCardMode = 'simple'">简化大字</button>
          <button class="ghost mini" :class="{ active: tableCardMode === 'full' }" @click="tableCardMode = 'full'">长条色牌</button>
        </div>
        <button v-if="canReturnToLobby" class="ghost reset-btn" @click="returnLobby">返回大厅</button>
        <button v-else class="ghost reset-btn" @click="showRules = true">查看规则</button>
      </div>
      <div class="meta" v-else>
        <span>首页</span>
        <button class="ghost reset-btn" @click="showRules = true">查看规则</button>
      </div>
    </header>
    <p v-if="globalError" class="error global-error">{{ globalError }}</p>

    <LoginPage
      v-if="showEntry"
      :nickname="entryName"
      :entering="enteringLobby"
      :primary-label="entryPrimaryLabel"
      :history-names="nicknameHistory"
      @update:nickname="entryName = $event"
      @submit="enterLobby"
      @open-rules="showRules = true"
      @randomize="randomizeNickname"
      @select-history="entryName = $event"
    />

    <LobbyPage
      v-else-if="showModeLobby"
      :kicker="isWaiting ? '房间页' : '大厅页'"
      :title="lobbyTitle"
      :subtitle="lobbySubtitle"
      :modes="lobbyModes"
      :selected-mode="selectedLobbyMode"
      :can-start="canStartSelectedMode"
      :start-label="lobbyStartLabel"
      :join-error="joinError"
      :host-player-id="state?.hostPlayerId || ''"
      :players="players"
      @open-rules="showRules = true"
      @start="startSelectedMode"
      @select-mode="selectedLobbyMode = $event as LobbyModeId"
    />

    <section v-else-if="showSyncingScreen" class="sync-shell">
      <div class="sync-card">
        <p class="entry-kicker">同步中</p>
        <h2>正在进入大厅</h2>
        <p class="entry-desc">房间连接已经建立，正在同步当前牌局状态。</p>
      </div>
    </section>

    <template v-else>
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
        :table-card-mode="tableCardMode"
        :selection-mode="selectionMode"
        :selected-candidate-id="selectedCandidateId"
        :active-candidates="activeCandidates"
        @discard-card="sendDiscardCard"
        @submit-action="onPanelSubmit"
        @selection-change="onPanelSelectionChange"
      />
    </template>

    <ActionPanel
      v-if="isPlaying && !isCompactLandscape"
      :actions="availableActions"
      :can-act="canAct"
      :is-current-turn="isMyTurn"
      :response-phase="state?.responsePhase || ''"
      :current-player-name="currentPlayerName"
      :selection-mode="selectionMode"
      :selected-candidate-id="selectedCandidateId"
      @submit="onPanelSubmit"
      @selection-change="onPanelSelectionChange"
    />

    <div v-if="isPlaying && selectionMode" class="candidate-mask">
      <div class="candidate-panel">
        <div class="candidate-head">
          <h3>{{ actionText(selectionMode) }}候选牌组</h3>
          <button class="ghost" @click="clearSelection">取消</button>
        </div>
        <p class="candidate-desc">{{ candidatePromptText }}</p>
        <div v-if="activeCandidates.length" class="candidate-list">
          <button
            v-for="(candidate, index) in activeCandidates"
            :key="candidate.id"
            class="candidate-item"
            :class="{ selected: selectedCandidateId === candidate.id }"
            @click="submitCandidate(candidate.id)"
          >
            <span class="candidate-title">{{ index + 1 }}. {{ candidate.title }}</span>
            <div class="candidate-cards-preview">
              <div class="preview-col target" v-if="candidateTargetCard">
                <small>目标牌</small>
                <CardComp :card="candidateTargetCard" size="sm" />
              </div>
              <div class="preview-col group">
                <small>组合牌</small>
                <div v-if="candidateGroupCards(candidate).length" class="preview-cards">
                  <CardComp
                    v-for="card in candidateGroupCards(candidate)"
                    :key="`cand-${candidate.id}-${card.id}`"
                    :card="card"
                    size="sm"
                  />
                </div>
                <small v-else class="candidate-raw">{{ candidate.cardIds.join("、") || "无需手牌" }}</small>
              </div>
            </div>
            <small>{{ candidateSourceText(candidate.source) }}</small>
          </button>
        </div>
        <p v-else class="candidate-empty">当前没有可选牌组</p>
      </div>
    </div>

    <div v-if="shouldShowDeclarePanel" class="declare-mask">
      <div class="declare-panel">
        <div class="declare-header">
          <div>
            <h2>声明鱼和暗坎</h2>
            <p class="declare-desc">先看手牌，鱼按可成组的选项点选，暗坎只声明数量；倒计时结束或四家确认后统一亮出。</p>
          </div>
          <div class="declare-timer-card">
            <strong>{{ declareSecondsLeft }}</strong>
            <span>秒</span>
          </div>
        </div>
        <p v-if="isDeclareSubmitted" class="declare-submitted">你已提交声明，等待其他玩家...</p>
        <div class="declare-progress">
          <div class="declare-progress-fill" :style="{ width: `${declareProgressPercent}%` }"></div>
        </div>

        <div class="declare-grid">
          <section class="declare-card-section">
            <p class="zone-title">鱼</p>
            <div class="fish-option-list" v-if="fishOptions.length">
              <button
                v-for="option in fishOptions"
                :key="option.id"
                class="fish-option"
                :class="{ selected: selectedFishOptionIds.has(option.id) }"
                :disabled="isDeclareSubmitted"
                @click="toggleFishOption(option.id)"
              >
                <span class="fish-option-title">{{ option.title }}</span>
                <span class="declare-mini-cards">
                  <CardComp v-for="card in option.cards" :key="`fish-option-${option.id}-${card.id}`" :card="card" size="sm" />
                </span>
              </button>
            </div>
            <p v-else class="settlement-empty">（没有可声明的鱼）</p>
            <p v-if="selectedFishCards.length" class="declare-tip">已选 {{ selectedFishCards.length }} 张，提交后会等四家都声明完再公开。</p>
            <p v-if="!fishSelectionValid" class="error">亮鱼组合不合法：普通鱼需4张同牌；金条鱼需4或5张金条。</p>
            <p v-if="declareError" class="error">{{ declareError }}</p>
          </section>

          <section class="declare-card-section declare-summary-card">
            <p class="zone-title">暗坎数量</p>
            <div class="declare-stepper">
              <button class="ghost mini" :disabled="isDeclareSubmitted || declareKongsInput <= 0" @click="adjustDeclareKongs(-1)">-</button>
              <div class="declare-stepper-value">
                <strong>{{ declareKongsInput }}</strong>
                <span>个</span>
              </div>
              <button class="ghost mini" :disabled="isDeclareSubmitted || declareKongsInput >= maxDeclaredKongs" @click="adjustDeclareKongs(1)">+</button>
            </div>
            <div class="declare-chip-row">
              <span class="declare-chip accent">系统建议 {{ suggestedDeclaredKongs }} 个</span>
              <button class="ghost mini" :disabled="isDeclareSubmitted" @click="useSuggestedDeclaredKongs">采用建议</button>
            </div>
            <p class="declare-tip">已选为鱼的牌不会再计入暗坎建议；实际过程里仍要保留声明数量的暗坎。</p>
          </section>
        </div>

        <section class="declare-zone">
          <p class="zone-title">手牌</p>
          <div class="declare-chip-row">
            <span v-if="suggestedFishCardIds.size" class="declare-chip">青框可成鱼</span>
            <span v-if="suggestedKongCardIds.size" class="declare-chip">橙框建议暗坎</span>
          </div>
          <div class="declare-cards" v-if="privateHand.length">
            <button
              v-for="card in privateHand"
              :key="`declare-hand-${card.id}`"
              class="declare-card-btn"
              :class="{ selected: selectedFishCardIds.has(card.id), suggested: suggestedKongCardIds.has(card.id), fish: suggestedFishCardIds.has(card.id) }"
              :disabled="isDeclareSubmitted"
              @click="toggleFishCard(card.id)"
            >
              <CardComp :card="card" size="sm" />
            </button>
          </div>
          <p v-else class="settlement-empty">（无可选手牌）</p>
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
        <template v-if="derivedWinnerId">
          <p>赢家: {{ winnerName }}</p>
        </template>
        <template v-else>
          <p>{{ endSummary }}</p>
          <p>最后动作: {{ state?.lastAction || "-" }}</p>
        </template>
        <p v-if="roundDealerCard" class="end-global-info">本局定庄牌: {{ cardLabel(roundDealerCard) }}</p>
        <section v-if="winnerSettlementPlayer && huCalculationLines.length" class="settlement scoring-explain">
          <h3>胡牌计分</h3>
          <div class="score-formula">
            <p>{{ winnerSettlementPlayer.name }} {{ winnerSettlementPlayer.huType === "big" ? "大胡" : "小胡" }}：赢一家 {{ signedScore(winnerPerOpponentScore) }}分</p>
            <ul>
              <li v-for="line in huCalculationLines" :key="`hu-calc-${line.key}`">
                {{ line.label }}：{{ signedScore(line.unit) }}分
              </li>
            </ul>
          </div>
        </section>

        <section v-if="remainingDeckPreview.length" class="settlement remaining-deck">
          <h3>留底牌堆前{{ remainingDeckPreview.length }}张</h3>
          <div class="settlement-cards">
            <CardComp
              v-for="card in remainingDeckPreview"
              :key="`remain-${card.id}`"
              :card="card"
              size="sm"
            />
          </div>
        </section>

        <section v-if="settlementPlayers.length" class="settlement">
          <h3>结算展示</h3>
          <div class="settlement-list">
            <div
              v-for="p in settlementPlayers"
              :key="`settle-${p.clientId}`"
              class="settlement-item"
              :class="{ winner: isSettlementWinner(p) }"
            >
              <div class="settlement-head">
                <div>
                  <p class="settlement-name">{{ p.name }}</p>
                  <p class="settlement-meta">
                    手牌 {{ p.hand.length }} 张 · 牌组 {{ settlementGroupBlocks(p).length }} 组 · 流水 {{ p.discardCount }} 张
                  </p>
                </div>
                <p class="score-total" :class="scoreToneClass(p.totalScore)">{{ signedScore(p.totalScore) }}分</p>
              </div>

              <div class="settlement-zone">
                <p class="zone-title">牌组区</p>
                <div class="settlement-group-list" v-if="settlementGroupBlocks(p).length">
                  <div
                    v-for="group in settlementGroupBlocks(p)"
                    :key="`settle-group-${p.clientId}-${group.id}`"
                    class="settlement-group"
                    :class="group.tone"
                  >
                    <span v-if="group.badge" class="settlement-group-badge">{{ group.badge }}</span>
                    <div class="settlement-cards compact">
                      <CardComp
                        v-for="card in group.cards"
                        :key="`settle-e-${p.clientId}-${group.id}-${card.id}`"
                        :card="card"
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
                <p v-else class="settlement-empty">（无）</p>
              </div>

              <div class="settlement-zone">
                <p class="zone-title">手牌区</p>
                <div class="settlement-group-list" v-if="settlementHandBlocks(p).length">
                  <div
                    v-for="group in settlementHandBlocks(p)"
                    :key="`settle-hand-${p.clientId}-${group.id}`"
                    class="settlement-group"
                    :class="group.tone"
                  >
                    <span v-if="group.badge" class="settlement-group-badge">{{ group.badge }}</span>
                    <div class="settlement-cards compact">
                      <CardComp
                        v-for="card in group.cards"
                        :key="`settle-hg-${p.clientId}-${group.id}-${card.id}`"
                        :card="card"
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
                <div class="settlement-cards" v-else-if="p.hand.length">
                  <CardComp v-for="card in p.hand" :key="`settle-${p.clientId}-${card.id}`" :card="card" size="sm" />
                </div>
                <p v-else class="settlement-empty">（无手牌）</p>
              </div>

              <div class="score-breakdown">
                <p class="zone-title">分数明细</p>
                <p v-if="!settlementScoreLines(p).length" class="settlement-empty">（无）</p>
                <ul v-else>
                  <li v-for="line in settlementScoreLines(p)" :key="`score-${p.clientId}-${line.key}`">
                    {{ line.label }}：{{ signedScore(line.total) }}分
                  </li>
                </ul>
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

    <div v-if="showRules" class="rules-mask" @click.self="showRules = false">
      <div class="rules-panel">
        <div class="rules-head">
          <div>
            <p class="rules-kicker">玩家速查</p>
            <h2>四色牌规则</h2>
            <p class="rules-slogan">象棋魂·麻将韵·纸牌趣——四色牌，一局见真章！</p>
          </div>
          <button class="ghost" @click="showRules = false">关闭</button>
        </div>

        <section class="rules-section">
          <h3>快速上手</h3>
          <div class="rules-chip-list">
            <span class="rules-chip">4 人对局</span>
            <span class="rules-chip">庄家 21 张</span>
            <span class="rules-chip">闲家 20 张</span>
            <span class="rules-chip">将 / 金条不能主动打出</span>
          </div>
          <ul class="rules-list">
            <li>牌有黄、红、绿、白四色，将、士、象、车、马、炮、卒各 4 张，另有公侯伯子男 5 张金条牌。</li>
            <li>定庄牌会决定谁是庄家，而且这张牌本身也属于庄家的手牌，所以庄家比别人多 1 张。</li>
            <li>开局先模拟发牌，再声明暗坎和亮鱼，四家都确认后正式进入出牌循环。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>轮到你时怎么做</h3>
          <ul class="rules-list">
            <li>全局先轮询胡、开、碰；如果没人响应，当前玩家再处理自己面前的牌。</li>
            <li>当前玩家的基本顺序是：能吃就吃，不能吃就抓；抓出来的新牌再重新轮询一次胡、开、碰。</li>
            <li>如果重新轮询后仍然没人响应，这张牌会继续作为你打给下家的牌，进入对应的流水。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>常见牌组</h3>
          <ul class="rules-list">
            <li>吃牌可形成：车马炮架、将士象架、三异色卒、四异色卒、对子、单将组、单金条组。</li>
            <li>碰是 3 张同色同字的明示组；开是在已有暗坎基础上接第 4 张；鱼是亮出的 4 张同牌或 4/5 张金条。</li>
            <li>将和金条都不能主动弃牌，通常只会在抓到后被组成单张组、架子、开，或者直接拿来胡。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>胡牌与结算</h3>
          <ul class="rules-list">
            <li>胡牌的本质是：响应当前那张牌后，你的手牌和牌组可以完全拆成有效牌组，没有零散牌。</li>
            <li>小胡：3 + 吃分 + 碰分 + 未开坎分 + 单张将 / 金条分。</li>
            <li>大胡：在上面基础上加上开分和鱼分后整体翻倍；只要含至少 1 个鱼或开，就算大胡。</li>
            <li>赢家会向另外三家分别收胡牌分；闲家之间再单独结算开和坎的互付分。</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3>界面怎么看</h3>
          <ul class="rules-list">
            <li>流水表示牌从谁传给谁；被吃、碰、开、胡走的待响牌，会从原来的流水里移除。</li>
            <li>牌组区显示已经亮出的牌组，手牌区显示你还握在手里的牌。</li>
            <li>中央区会显示庄家、定庄牌、牌堆剩余数量和当前待响牌。</li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ActionPanel from "@/components/ActionPanel.vue";
import CardComp from "@/components/Card.vue";
import GameBoard from "@/components/GameBoard.vue";
import LobbyPage from "@/components/LobbyPage.vue";
import LoginPage from "@/components/LoginPage.vue";
import OrientationGuard from "@/components/OrientationGuard.vue";
import { useRoom } from "@/composables/useRoom";
import { BACKEND_HTTP_URL } from "@/config/backend";
import type { ActionCandidate, ActionRequest, Card, RoundResultPlayer } from "@/types/game";
import { getCardLabelText } from "@/utils/cardText";

type SettlementGroupBlock = {
  id: string;
  cards: Card[];
  badge?: string;
  label?: string;
  tone: "meld" | "fish" | "public" | "strong";
};
type FishOption = {
  id: string;
  title: string;
  cards: Card[];
};
type LobbyModeId = "practice_bots" | "ranked_reserved" | "friends_reserved";
type LobbyMode = {
  id: LobbyModeId;
  name: string;
  description: string;
  enabled: boolean;
};
const HTTP_URL = BACKEND_HTTP_URL;

function randomFrom(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? "玩家";
}

function generateRandomNickname(): string {
  const prefix = ["青", "白", "赤", "黄", "东", "南", "西", "北", "云", "风", "星", "月"];
  const suffix = ["雀客", "牌友", "棋童", "将军", "行者", "小侠", "掌柜", "阿福", "阿宁", "子衿"];
  return `${randomFrom(prefix)}${randomFrom(suffix)}`;
}

function readNicknameHistory(): string[] {
  try {
    const raw = window.localStorage.getItem("sise_entry_name_history") ?? "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

function writeNicknameHistory(names: string[]) {
  window.localStorage.setItem("sise_entry_name_history", JSON.stringify(names.slice(0, 8)));
}

const {
  connect,
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
  clearActionLogs,
  sendAction,
  sendDiscardCard,
  declareSetup,
  startGame,
  nextRound,
  returnLobby,
} = useRoom("玩家");

const ENTRY_NAME_KEY = "sise_entry_name";
const ENTRY_HISTORY_KEY = "sise_entry_name_history";
const entryName = ref(window.localStorage.getItem(ENTRY_NAME_KEY)?.trim() || "");
const nicknameHistory = ref<string[]>(readNicknameHistory());
const enteringLobby = ref(false);
const enteredFrontLobby = ref(false);
const pendingPracticeAutoStart = ref(false);
const selectedLobbyMode = ref<LobbyModeId>("practice_bots");
const lobbyModes: LobbyMode[] = [
  {
    id: "practice_bots" as const,
    name: "单人练习",
    description: "当前模式：你进入大厅后，由系统自动补 3 个机器人，适合单机练习和规则体验。",
    enabled: true,
  },
  {
    id: "friends_reserved" as const,
    name: "好友同桌",
    description: "预留入口：未来会扩展成 4 名真人通过邀请码或房间模式一起对局。",
    enabled: false,
  },
  {
    id: "ranked_reserved" as const,
    name: "联机匹配",
    description: "预留入口：未来会接账号、匹配和更多大厅信息，但这次先把结构留好。",
    enabled: false,
  },
];

const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const hasLobbySession = computed(() => Boolean(connected.value || state.value || mySeatId.value));
const showEntry = computed(() => !enteredFrontLobby.value && !hasLobbySession.value);
const showSyncingScreen = computed(() => hasLobbySession.value && !state.value);
const showModeLobby = computed(() => {
  if (showSyncingScreen.value) {
    return false;
  }
  // Once game state exists (room joined), never show mode lobby again
  // The mode lobby is only for mode selection BEFORE joining a room
  if (state.value) {
    return false;
  }
  // Before game state, show mode lobby if entered front
  return enteredFrontLobby.value;
});
const canReturnToLobby = computed(() => isDeclaring.value || isPlaying.value || isEnded.value);
const canPressStartGame = computed(
  () =>
    Boolean(connected.value) && Boolean(state.value) && Boolean(mySeatId.value) && isWaiting.value && isHost.value,
);
const canStartSelectedMode = computed(
  () => selectedLobbyMode.value === "practice_bots" && (!hasLobbySession.value || canPressStartGame.value),
);
const lobbyTitle = computed(() => (isWaiting.value ? "房间准备中" : "游戏模式选择"));
const lobbySubtitle = computed(() =>
  isWaiting.value
    ? "你已经进入房间页，正在同步开局状态。"
    : "先选择一种玩法；当前开放单人练习，其余模式先保留入口。",
);
const lobbyStartLabel = computed(() => {
  if (selectedLobbyMode.value !== "practice_bots") {
    return "该模式尚未开放";
  }
  if (!hasLobbySession.value) {
    return "进入单人练习";
  }
  if (pendingPracticeAutoStart.value) {
    return "正在自动开始...";
  }
  return isHost.value ? "开始单人练习" : "等待房主开始";
});
const entryPrimaryLabel = computed(() => {
  const query = new URLSearchParams(window.location.search);
  return query.get("roomId") ? "加入大厅" : "进入大厅";
});
const nowMs = ref(Date.now());
const displayTurnPlayerId = computed(() => {
  if (state.value?.responsePhase === "collective") {
    return (
      state.value?.currentTurnPlayerId ||
      state.value?.currentPlayerId ||
      state.value?.pollOriginPlayerId ||
      ""
    );
  }
  return state.value?.currentTurnPlayerId || state.value?.currentPlayerId || "";
});
const isMyTurn = computed(() => {
  if (state.value?.responsePhase === "collective") {
    return false;
  }
  if (!mySeatId.value || displayTurnPlayerId.value !== mySeatId.value) {
    return false;
  }
  const me = players.value.find((x) => x.clientId === mySeatId.value);
  return !Boolean(me?.isBot);
});

const openingDealActive = computed(
  () =>
    isPlaying.value &&
    /^DEALER\s+\S+/.test(String(state.value?.lastAction ?? "")) &&
    Number(state.value?.responseEndsAt ?? 0) > nowMs.value,
);
const openingDealSecondsLeft = computed(() => {
  if (!openingDealActive.value) {
    return 0;
  }
  return Math.max(0, Math.ceil((Number(state.value?.responseEndsAt ?? 0) - nowMs.value) / 1000));
});
const canAct = computed(
  () => !openingDealActive.value && isPlaying.value && availableActions.value.some((x) => x.enabled || x.deferred),
);
const canDiscard = computed(
  () =>
    !openingDealActive.value &&
    isPlaying.value &&
    isMyTurn.value &&
    state.value?.responsePhase === "local_draw" &&
    availableActions.value.length === 0,
);
const selectionMode = ref<"kai" | "peng" | "chi" | null>(null);
const selectedCandidateId = ref<string | null>(null);
const pendingDeferredChiCandidateId = ref<string | null>(null);
const pendingDeferredGrab = ref(false);
const activeCandidates = computed<ActionCandidate[]>(() => {
  if (!selectionMode.value) {
    return [];
  }
  const item = availableActions.value.find(
    (action) => action.action === selectionMode.value && (action.enabled || action.deferred),
  );
  return item?.candidates ?? [];
});
const candidateTargetCard = computed<Card | null>(() => {
  return (state.value?.responseCard ?? state.value?.targetCard ?? state.value?.publicDiscardPile?.[0] ?? null) as Card | null;
});
const candidatePromptText = computed(() => {
  if (state.value?.responsePhase === "collective" && selectionMode.value === "chi") {
    return "请先选吃的牌组；系统会先过待响，待无人胡/开/碰后自动吃";
  }
  return selectionMode.value ? `请点击一个牌组确认${actionText(selectionMode.value)}` : "请点击一个牌组确认";
});
const isCompactLandscape = ref(false);
const tableCardMode = ref<"simple" | "full">(
  (window.localStorage.getItem("sise_table_card_mode") as "simple" | "full" | null) ?? "simple",
);
const globalError = ref("");
const showRules = ref(false);
const updateCompactLandscape = () => {
  isCompactLandscape.value = window.matchMedia("(orientation: landscape) and (max-width: 960px)").matches;
};

const showEndPanel = computed(() => Boolean(huResult.value) || Boolean(roundResult.value) || isEnded.value);
const mePlayer = computed(() => players.value.find((x) => x.clientId === mySeatId.value) ?? null);
const isDeclareSubmitted = computed(() => Boolean(mePlayer.value?.declaredReady));
const shouldShowDeclarePanel = computed(
  () =>
    isDeclaring.value &&
    !declareDealIntroActive.value &&
    Boolean(mySeatId.value) &&
    !Boolean(mePlayer.value?.isBot),
);
const declareDealIntroActive = computed(
  () => isDeclaring.value && Number(state.value?.responseEndsAt ?? 0) > nowMs.value,
);

const declareKongsInput = ref(0);
let declareTick: number | null = null;
const selectedFishCardIds = ref<Set<string>>(new Set());
const selectedFishOptionIds = ref<Set<string>>(new Set());
const selectedFishCards = computed(() => privateHand.value.filter((card) => selectedFishCardIds.value.has(card.id)));
const fishOptions = computed<FishOption[]>(() => {
  const options: FishOption[] = [];
  const grouped = new Map<string, Card[]>();
  const goldCards: Card[] = [];
  for (const card of privateHand.value) {
    if (card.color === "gold") {
      goldCards.push(card);
      continue;
    }
    const key = `${card.color}:${card.type}`;
    const list = grouped.get(key) ?? [];
    list.push(card);
    grouped.set(key, list);
  }
  for (const [key, cards] of grouped.entries()) {
    if (cards.length === 4) {
      options.push({
        id: `fish:${key}`,
        title: `${cardLabel(cards[0])}鱼`,
        cards,
      });
    }
  }
  if (goldCards.length >= 4) {
    options.push({
      id: "fish:gold:4",
      title: "金条鱼（4张）",
      cards: goldCards.slice(0, 4),
    });
  }
  if (goldCards.length >= 5) {
    options.push({
      id: "fish:gold:5",
      title: "金条鱼（5张）",
      cards: goldCards.slice(0, 5),
    });
  }
  return options;
});
const suggestedFishCardIds = computed<Set<string>>(() => {
  const picked = new Set<string>();
  for (const option of fishOptions.value) {
    option.cards.forEach((card) => picked.add(card.id));
  }
  return picked;
});
const suggestedKongCardIds = computed<Set<string>>(() => {
  const byFace = new Map<string, Card[]>();
  const goldCards: Card[] = [];
  for (const card of privateHand.value) {
    if (selectedFishCardIds.value.has(card.id)) {
      continue;
    }
    if (card.color === "gold") {
      goldCards.push(card);
      continue;
    }
    const key = `${card.color}:${card.type}`;
    const list = byFace.get(key) ?? [];
    list.push(card);
    byFace.set(key, list);
  }

  const picked = new Set<string>();
  for (const cards of byFace.values()) {
    const count = Math.floor(cards.length / 3) * 3;
    for (const card of cards.slice(0, count)) {
      picked.add(card.id);
    }
  }
  for (const card of goldCards.slice(0, Math.floor(goldCards.length / 3) * 3)) {
    picked.add(card.id);
  }
  return picked;
});
const suggestedDeclaredKongs = computed(() => Math.floor(suggestedKongCardIds.value.size / 3));
const maxDeclaredKongs = computed(() => Math.max(suggestedDeclaredKongs.value, Number(mePlayer.value?.declaredKongs ?? 0), 0));
const declareSecondsLeft = computed(() => {
  if (declareDealIntroActive.value) {
    return 0;
  }
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

function syncSelectedFishOptionsFromCards() {
  const cardIds = selectedFishCardIds.value;
  const next = new Set<string>();
  for (const option of fishOptions.value) {
    if (option.cards.every((card) => cardIds.has(card.id))) {
      next.add(option.id);
    }
  }
  selectedFishOptionIds.value = next;
}

function toggleFishOption(optionId: string) {
  if (isDeclareSubmitted.value) {
    return;
  }
  const option = fishOptions.value.find((item) => item.id === optionId);
  if (!option) {
    return;
  }
  const nextCards = new Set(selectedFishCardIds.value);
  const nextOptions = new Set(selectedFishOptionIds.value);
  const selected = nextOptions.has(optionId);
  if (selected) {
    option.cards.forEach((card) => nextCards.delete(card.id));
    nextOptions.delete(optionId);
  } else {
    option.cards.forEach((card) => nextCards.add(card.id));
    if (optionId === "fish:gold:4") {
      nextOptions.delete("fish:gold:5");
      fishOptions.value.find((item) => item.id === "fish:gold:5")?.cards.forEach((card) => nextCards.delete(card.id));
      option.cards.forEach((card) => nextCards.add(card.id));
    }
    if (optionId === "fish:gold:5") {
      nextOptions.delete("fish:gold:4");
    }
    nextOptions.add(optionId);
  }
  selectedFishCardIds.value = nextCards;
  selectedFishOptionIds.value = nextOptions;
}

function toggleFishCard(cardId: string) {
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
  syncSelectedFishOptionsFromCards();
}

function clearSelection() {
  selectionMode.value = null;
  selectedCandidateId.value = null;
}

function onPanelSelectionChange(payload: { mode: "kai" | "peng" | "chi" | null; selectedCandidateId: string | null }) {
  selectionMode.value = payload.mode;
  selectedCandidateId.value = payload.selectedCandidateId;
}

function actionFromRequest(request: ActionRequest): string {
  return typeof request === "string" ? request : request.action;
}

function candidateIdFromRequest(request: ActionRequest): string {
  return typeof request === "string" ? "" : String(request.candidateId ?? "").trim();
}

function onPanelSubmit(request: ActionRequest) {
  const action = actionFromRequest(request);
  const isDeferred = typeof request !== "string" && Boolean(request.deferred);
  if (state.value?.responsePhase === "collective" && action === "pass" && isDeferred) {
    pendingDeferredGrab.value = true;
    sendAction("pass");
    clearSelection();
    return;
  }
  if (state.value?.responsePhase === "collective" && action === "chi") {
    const candidateId = candidateIdFromRequest(request);
    if (candidateId) {
      pendingDeferredChiCandidateId.value = candidateId;
      sendAction("pass");
    }
    clearSelection();
    return;
  }
  pendingDeferredChiCandidateId.value = null;
  pendingDeferredGrab.value = false;
  sendAction(request);
  clearSelection();
}

function submitCandidate(candidateId: string) {
  if (!selectionMode.value) {
    return;
  }
  selectedCandidateId.value = candidateId;
  onPanelSubmit({ action: selectionMode.value, candidateId });
}

function actionText(action: "kai" | "peng" | "chi"): string {
  if (action === "kai") {
    return "开";
  }
  if (action === "peng") {
    return "碰";
  }
  return "吃";
}

function candidateSourceText(source: ActionCandidate["source"]): string {
  if (source === "hand+pool") {
    return "手牌+将/金条区";
  }
  return "手牌";
}

function cardLabel(card: Card): string {
  return getCardLabelText(card);
}

function parseCardIdToCard(cardId: string): Card | null {
  const match = String(cardId ?? "").trim().match(/^([a-z]+)_([a-z]+)_\d+$/i);
  if (!match) {
    return null;
  }
  return {
    id: cardId,
    color: match[1].toLowerCase(),
    type: match[2].toLowerCase(),
  };
}

function candidateGroupCards(candidate: ActionCandidate): Card[] {
  return candidate.cardIds.map((id) => parseCardIdToCard(id)).filter((card): card is Card => Boolean(card));
}

function submitDeferredChiIfReady() {
  const candidateId = pendingDeferredChiCandidateId.value;
  if (!candidateId) {
    return;
  }
  const phase = String(state.value?.responsePhase ?? "");
  if (phase === "collective") {
    return;
  }
  const isLocalChiPhase =
    (phase === "local_upper" || phase === "local_draw") && String(state.value?.currentPlayerId ?? "") === mySeatId.value;
  if (!isLocalChiPhase) {
    pendingDeferredChiCandidateId.value = null;
    return;
  }
  const chiEntry = availableActions.value.find((item) => item.action === "chi" && item.enabled);
  if (!chiEntry) {
    return;
  }
  if (!chiEntry.candidates?.some((candidate) => candidate.id === candidateId)) {
    pendingDeferredChiCandidateId.value = null;
    return;
  }
  pendingDeferredChiCandidateId.value = null;
  sendAction({ action: "chi", candidateId });
}

function submitDeferredGrabIfReady() {
  if (!pendingDeferredGrab.value) {
    return;
  }
  const isLocalUpper =
    String(state.value?.responsePhase ?? "") === "local_upper" && String(state.value?.currentPlayerId ?? "") === mySeatId.value;
  if (String(state.value?.responsePhase ?? "") === "collective") {
    return;
  }
  if (!isLocalUpper) {
    pendingDeferredGrab.value = false;
    return;
  }
  const passEntry = availableActions.value.find((item) => item.action === "pass" && item.enabled);
  if (!passEntry) {
    return;
  }
  pendingDeferredGrab.value = false;
  sendAction("pass");
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

function adjustDeclareKongs(delta: number) {
  declareKongsInput.value = Math.min(maxDeclaredKongs.value, Math.max(0, declareKongsInput.value + delta));
}

function useSuggestedDeclaredKongs() {
  declareKongsInput.value = suggestedDeclaredKongs.value;
}

watch(shouldShowDeclarePanel, (show) => {
  if (show) {
    selectedFishCardIds.value = new Set();
    selectedFishOptionIds.value = new Set();
    declareKongsInput.value = Math.max(
      Number(mePlayer.value?.declaredKongs ?? 0),
      Number(suggestedDeclaredKongs.value ?? 0),
    );
  }
});

watch(
  () => `${state.value?.phase ?? ""}|${state.value?.responsePhase ?? ""}|${state.value?.currentPlayerId ?? ""}`,
  () => {
    clearSelection();
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
  },
);

watch(
  () => availableActions.value,
  () => {
    submitDeferredGrabIfReady();
    submitDeferredChiIfReady();
    if (!selectionMode.value) {
      return;
    }
    const current = availableActions.value.find(
      (item) => item.action === selectionMode.value && (item.enabled || item.deferred),
    );
    if (!current) {
      clearSelection();
      return;
    }
    if (
      selectedCandidateId.value &&
      !Boolean(current.candidates?.some((candidate) => candidate.id === selectedCandidateId.value))
    ) {
      selectedCandidateId.value = null;
    }
  },
  { deep: true },
);

onMounted(() => {
  if (!entryName.value) {
    entryName.value = nicknameHistory.value[0] || generateRandomNickname();
  }
  declareTick = window.setInterval(() => {
    nowMs.value = Date.now();
  }, 500);
  updateCompactLandscape();
  window.localStorage.setItem("sise_table_card_mode", tableCardMode.value);
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

watch(tableCardMode, (mode) => {
  window.localStorage.setItem("sise_table_card_mode", mode);
});

function maybeAutoStartPractice() {
  if (!pendingPracticeAutoStart.value || !canPressStartGame.value) {
    return;
  }
  // 单人练习应该在房间准备就绪后立刻发 start_game，
  // 不能只依赖“ready 从 false 变 true”的 watcher，
  // 否则当 ready 先成立、pending 后置为 true 时会永远卡住。
  startGame();
  pendingPracticeAutoStart.value = false;
}

watch(
  () => [canPressStartGame.value, pendingPracticeAutoStart.value] as const,
  () => {
    maybeAutoStartPractice();
  },
  { immediate: true },
);

// 一旦房间离开 waiting 阶段（即已成功开局），清除自动开局标记以阻止后续重试。
watch(
  () => state.value?.phase,
  (phase) => {
    if (phase && phase !== "waiting" && pendingPracticeAutoStart.value) {
      pendingPracticeAutoStart.value = false;
    }
  },
);

// 更直接的兜底：一旦收到手牌，说明游戏已实际开始，立即清除 pending。
watch(
  () => privateHand.value.length,
  (length) => {
    if (length > 0 && pendingPracticeAutoStart.value) {
      pendingPracticeAutoStart.value = false;
    }
  },
);

const endPanelTitle = computed(() => {
  if (derivedWinnerId.value) {
    return "胡牌结算";
  }
  return "流局结算";
});
const derivedWinnerId = computed(() => {
  const explicit = huResult.value?.winnerId ?? roundResult.value?.winnerId;
  if (explicit) {
    return explicit;
  }
  const match = String(state.value?.lastAction ?? "").match(/^(\S+)\s+HU$/);
  return match?.[1] ?? "";
});
const winnerName = computed(() => {
  const winnerId = derivedWinnerId.value;
  if (!winnerId) {
    return "-";
  }
  const player = players.value.find((x) => x.clientId === winnerId);
  return player?.name || winnerId;
});

const settlementPlayers = computed<RoundResultPlayer[]>(() => roundResult.value?.players ?? []);
const remainingDeckPreview = computed<Card[]>(() => roundResult.value?.remainingDeck ?? []);

function splitCardGroups(cards: Card[], sizes: number[]): Card[][] {
  const groups: Card[][] = [];
  let offset = 0;
  for (const size of sizes) {
    if (!Number.isFinite(size) || size <= 0) {
      continue;
    }
    const chunk = cards.slice(offset, offset + size);
    offset += size;
    if (chunk.length === size) {
      groups.push(chunk);
    }
  }
  if (!groups.length && cards.length) {
    groups.push([...cards]);
  }
  return groups;
}

function splitExposedGroupsWithKinds(cards: Card[], sizes: number[], kinds: string[]): Array<{ cards: Card[]; kind: string }> {
  const groups = splitCardGroups(cards, sizes);
  return groups.map((group, index) => ({
    cards: group,
    kind: kinds[index] ?? "",
  }));
}

function splitFishGroups(cards: Card[]): Card[][] {
  if (!cards.length) {
    return [];
  }
  if (cards.every((card) => card.color === "gold")) {
    return [[...cards]];
  }
  const grouped = new Map<string, Card[]>();
  for (const card of cards) {
    const key = `${card.color}:${card.type}`;
    const list = grouped.get(key) ?? [];
    list.push(card);
    grouped.set(key, list);
  }
  return [...grouped.values()];
}

function isSameSettlementFace(cards: Card[]): boolean {
  if (!cards.length) {
    return false;
  }
  const head = cards[0];
  return cards.every((card) => card.color === head.color && card.type === head.type);
}

function settlementBadge(cards: Card[], kind = ""): string | undefined {
  if (!cards.length) {
    return undefined;
  }
  const head = cards[0];
  if (kind === "peng") {
    return "碰";
  }
  if (kind === "kai") {
    return "开";
  }
  if (head.color === "gold" && cards.length >= 3) {
    return cards.length >= 4 ? "开" : "坎";
  }
  if (cards.length === 2 && isSameSettlementFace(cards)) {
    return "对";
  }
  if (isSameSettlementFace(cards)) {
    if (cards.length >= 4) {
      return "开";
    }
    if (cards.length === 3) {
      return "坎";
    }
    return undefined;
  }
  if (cards.length === 4) {
    return "鱼";
  }
  return undefined;
}

function settlementGroupLabel(cards: Card[], kind = ""): string | undefined {
  if (!cards.length) {
    return undefined;
  }
  const head = cards[0];
  if (head.color === "gold") {
    if (cards.length >= 4 || kind === "kai") {
      return "金条开";
    }
    if (cards.length === 3) {
      return "金条坎";
    }
    if (cards.length === 1) {
      return "金条单张";
    }
  }
  if (kind === "peng") {
    return `${cardLabel(head)}碰`;
  }
  if (kind === "kai") {
    return `${cardLabel(head)}开`;
  }
  if (isSameSettlementFace(cards)) {
    if (cards.length >= 4) {
      return `${cardLabel(head)}开`;
    }
    if (cards.length === 3) {
      return `${cardLabel(head)}坎`;
    }
    if (cards.length === 2) {
      return `${cardLabel(head)}对子`;
    }
    if (cards.length === 1 && head.type === "jiang") {
      return `${cardLabel(head)}单张`;
    }
  }
  const sameColor = cards.every((card) => card.color === head.color);
  const types = new Set(cards.map((card) => card.type));
  const colorPrefix = cardLabel(head).slice(0, 1);
  if (sameColor && cards.length === 3 && types.has("ju") && types.has("ma") && types.has("pao")) {
    return `${colorPrefix}车马炮架`;
  }
  if (sameColor && cards.length === 3 && types.has("jiang") && types.has("shi") && types.has("xiang")) {
    const faces = ["jiang", "shi", "xiang"]
      .map((type) => getCardLabelText({ color: head.color, type }).slice(1))
      .join("");
    return `${colorPrefix}${faces}架`;
  }
  if (cards.length === 4) {
    return `${cardLabel(head)}鱼`;
  }
  return settlementBadge(cards, kind);
}

function settlementTone(cards: Card[]): SettlementGroupBlock["tone"] {
  const head = cards[0];
  if (!head) {
    return "meld";
  }
  if (head.color === "gold" || (isSameSettlementFace(cards) && cards.length >= 3)) {
    return "strong";
  }
  if (cards.length === 1 && (head.type === "jiang" || head.color === "gold")) {
    return "public";
  }
  if (cards.length === 4) {
    return "fish";
  }
  return "meld";
}

function settlementGroupBlocks(player: RoundResultPlayer): SettlementGroupBlock[] {
  const blocks: SettlementGroupBlock[] = [];
  (player.winningGroups ?? []).forEach((group, index) => {
    blocks.push({
      id: `winning-${index}-${group.cards.map((card) => card.id).join("-")}`,
      cards: group.cards,
      badge: settlementBadge(group.cards),
      label: settlementGroupLabel(group.cards),
      tone: settlementTone(group.cards),
    });
  });
  splitExposedGroupsWithKinds(player.exposedArea ?? [], player.exposedGroupSizes ?? [], player.exposedGroupKinds ?? []).forEach(({ cards, kind }, index) => {
    blocks.push({
      id: `meld-${index}-${cards.map((card) => card.id).join("-")}`,
      cards,
      badge: settlementBadge(cards, kind),
      label: settlementGroupLabel(cards, kind),
      tone: settlementTone(cards),
    });
  });
  (player.generalArea ?? []).forEach((card, index) => {
    blocks.push({
      id: `public-${index}-${card.id}`,
      cards: [card],
      badge: settlementBadge([card]),
      label: settlementGroupLabel([card]),
      tone: settlementTone([card]),
    });
  });
  splitFishGroups(player.fishArea ?? []).forEach((cards, index) => {
    blocks.push({
      id: `fish-${index}-${cards.map((card) => card.id).join("-")}`,
      cards,
      badge: settlementBadge(cards),
      label: settlementGroupLabel(cards),
      tone: settlementTone(cards),
    });
  });
  return blocks;
}

function settlementHandBlocks(player: RoundResultPlayer): SettlementGroupBlock[] {
  if (isSettlementWinner(player)) {
    return (player.resolvedHandGroups ?? []).map((group, index) => ({
      id: `hand-${index}-${group.cards.map((card) => card.id).join("-")}`,
      cards: group.cards,
      badge: settlementBadge(group.cards),
      label: settlementGroupLabel(group.cards),
      tone: settlementTone(group.cards),
    }));
  }

  return groupHandWithHiddenKans(player.hand ?? [], Number(player.declaredKongs ?? 0));
}

function groupHandWithHiddenKans(cards: Card[], declaredKongs: number): SettlementGroupBlock[] {
  const used = new Set<string>();
  const byFace = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
    const list = byFace.get(key) ?? [];
    list.push(card);
    byFace.set(key, list);
  }

  const blocks: SettlementGroupBlock[] = [];
  let remainingDeclaredKongs = Math.max(0, Math.floor(Number(declaredKongs) || 0));
  for (const [key, sameFaceCards] of byFace.entries()) {
    const kanCount = Math.floor(sameFaceCards.length / 3);
    for (let index = 0; index < kanCount; index += 1) {
      const chunk = sameFaceCards.slice(index * 3, index * 3 + 3);
      if (chunk.length !== 3) {
        continue;
      }
      chunk.forEach((card) => used.add(card.id));
      const isDeclaredKan = remainingDeclaredKongs > 0;
      if (isDeclaredKan) {
        remainingDeclaredKongs -= 1;
      }
      blocks.push({
        id: `${isDeclaredKan ? "hidden-kan" : "peng"}-${key}-${index}-${chunk.map((card) => card.id).join("-")}`,
        cards: chunk,
        badge: isDeclaredKan ? "坎" : "碰",
        label: settlementGroupLabel(chunk),
        tone: settlementTone(chunk),
      });
    }
  }

  const looseCards = cards.filter((card) => !used.has(card.id));
  if (looseCards.length) {
    blocks.push({
      id: `loose-${looseCards.map((card) => card.id).join("-")}`,
      cards: looseCards,
      tone: "meld",
    });
  }
  return blocks;
}

function signedScore(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function scoreToneClass(value: number): string {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "neutral";
}

function isSettlementWinner(player: RoundResultPlayer): boolean {
  return Boolean(roundResult.value?.winnerId) && roundResult.value?.winnerId === player.clientId;
}

function huFormulaLineOrder(key: string): number {
  if (key === "HuBase") {
    return 0;
  }
  if (String(key).startsWith("HuBigMultiplier")) {
    return 2;
  }
  return 1;
}

const winnerSettlementPlayer = computed<RoundResultPlayer | null>(() => {
  const winnerId = roundResult.value?.winnerId;
  if (!winnerId) {
    return null;
  }
  return settlementPlayers.value.find((player) => player.clientId === winnerId) ?? null;
});

const huCalculationLines = computed(() =>
  (winnerSettlementPlayer.value?.scoreBreakdown ?? [])
    .filter((line) => /^Hu(Base|Win|BigMultiplier)/.test(String(line.key ?? "")))
    .map((line) => ({
      ...line,
      label: String(line.key ?? "").startsWith("HuBigMultiplier") ? "大胡整体 ×2" : line.label,
    }))
    .sort((a, b) => huFormulaLineOrder(a.key) - huFormulaLineOrder(b.key)),
);

const winnerPerOpponentScore = computed(() => {
  const winner = winnerSettlementPlayer.value;
  if (!winner) {
    return 0;
  }
  const payerCount = Math.max(1, settlementPlayers.value.filter((player) => player.clientId !== winner.clientId).length);
  return Math.round(winner.totalScore / payerCount);
});

function settlementScoreLines(player: RoundResultPlayer): Array<{ key: string; label: string; total: number }> {
  const winnerId = roundResult.value?.winnerId;
  if (!winnerId) {
    return (player.scoreBreakdown ?? []).map((line) => ({
      key: line.key,
      label: line.label,
      total: line.total,
    }));
  }
  const winner = settlementPlayers.value.find((item) => item.clientId === winnerId);
  const payers = settlementPlayers.value.filter((item) => item.clientId !== winnerId);
  const payerCount = payers.length || 1;
  const winnerPerOpponent = winner ? Math.round(winner.totalScore / payerCount) : 0;

  if (winnerId !== player.clientId) {
    const nonHuLines = (player.scoreBreakdown ?? [])
      .filter((line) => !/^Hu(Base|Lose|Win|BigMultiplier)/.test(String(line.key ?? "")))
      .map((line) => ({
        key: line.key,
        label: line.label,
        total: line.total,
      }));
    const huLine =
      winner && winnerPerOpponent
        ? [
            {
              key: `hu-pay-${winner.clientId}-${player.clientId}`,
              label: `${winner.name} 收胡牌分`,
              total: -winnerPerOpponent,
            },
          ]
        : [];
    return [...huLine, ...nonHuLines];
  }
  return payers.map((payer) => ({
    key: `hu-pay-${payer.clientId}`,
    label: `${payer.name} 付胡牌分`,
    total: winnerPerOpponent,
  }));
}

const endSummary = computed(() => {
  const action = String(state.value?.lastAction ?? "");
  if (action === "DECK_EMPTY" || action === "DRAW_GAME") {
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
  if (openingDealActive.value) {
    return `发牌中，${openingDealSecondsLeft.value}s 后开局`;
  }
  if (canDiscard.value) {
    return "请点击手牌弃一张";
  }
  if (state.value?.responsePhase === "local_upper" && canAct.value) {
    return isMyTurn.value ? "可选择吃或抓" : "等待对方操作";
  }
  if (state.value?.responsePhase === "local_draw" && canAct.value) {
    return isMyTurn.value ? "可选择吃或过" : "等待对方操作";
  }
  if (state.value?.responsePhase === "collective") {
    if (canAct.value) {
      return "全局待响阶段：你可以选择胡/开/碰/过";
    }
    return "等待三家响应";
  }
  return isMyTurn.value ? "轮到你操作" : "等待对方操作";
});

const currentPlayerName = computed(() => {
  const playerId = displayTurnPlayerId.value;
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

const roundDealerCard = computed<Card | null>(() => {
  const card = state.value?.dealerCard ?? null;
  return card?.id ? card : null;
});

async function enterLobby() {
  const nickname = entryName.value.trim() || generateRandomNickname();
  entryName.value = nickname;
  globalError.value = "";
  window.localStorage.setItem(ENTRY_NAME_KEY, nickname);
  const mergedHistory = [nickname, ...nicknameHistory.value.filter((item) => item !== nickname)].slice(0, 8);
  nicknameHistory.value = mergedHistory;
  writeNicknameHistory(mergedHistory);
  enteredFrontLobby.value = true;
}

function randomizeNickname() {
  entryName.value = generateRandomNickname();
}

function startSelectedMode() {
  if (selectedLobbyMode.value !== "practice_bots") {
    globalError.value = "该模式暂未开放，当前只支持单人练习。";
    return;
  }
  globalError.value = "";
  if (!hasLobbySession.value) {
    void startPracticeLobby();
    return;
  }
  requestPracticeAutoStart();
}

function requestPracticeAutoStart() {
  pendingPracticeAutoStart.value = true;
  maybeAutoStartPractice();
}

async function startPracticeLobby() {
  if (enteringLobby.value) {
    return;
  }
  const nickname = entryName.value.trim() || generateRandomNickname();
  entryName.value = nickname;
  enteringLobby.value = true;
  try {
    const response = await fetch(`${HTTP_URL}/reset-room`, { method: "POST" });
    if (!response.ok) {
      throw new Error("创建单人练习房间失败");
    }
    const payload = (await response.json()) as { ok?: boolean; roomId?: string; message?: string };
    if (!payload?.ok || !payload.roomId) {
      throw new Error(payload?.message || "创建单人练习房间失败");
    }
    const ok = await connect({
      nameOverride: nickname,
      roomId: payload.roomId,
      forceNew: true,
    });
    if (!ok) {
      throw new Error(joinError.value || "进入大厅失败");
    }
    requestPracticeAutoStart();
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "进入大厅失败";
  } finally {
    enteringLobby.value = false;
  }
}

watch(
  () => state.value?.phase,
  (phase) => {
    if (phase && phase !== "waiting") {
      pendingPracticeAutoStart.value = false;
    }
  },
);

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

.global-error {
  margin: 0;
}

.reset-btn {
  margin-left: 0.25rem;
}

.view-mode-toggle {
  display: inline-flex;
  gap: 0.25rem;
}

.ghost.mini {
  padding: 0.2rem 0.45rem;
  min-height: auto;
  font-size: clamp(0.58rem, 1.25vh, 0.72rem);
}

.ghost.mini.active {
  border-color: #38bdf8;
  color: #e0f2fe;
  background: rgba(12, 74, 110, 0.35);
}

.layout.playing {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.layout.compact-landscape.playing {
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  padding: max(0.2rem, env(safe-area-inset-top)) max(0.2rem, env(safe-area-inset-right))
    max(0.2rem, env(safe-area-inset-bottom)) max(0.2rem, env(safe-area-inset-left));
}

.layout.compact-landscape .top {
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

.top-brand {
  display: grid;
  gap: 0.18rem;
}

.top h1 {
  margin: 0;
  font-size: clamp(0.95rem, 2.2vh, 1.25rem);
  line-height: 1;
}

.top-slogan {
  margin: 0;
  color: #fde68a;
  font-size: clamp(0.6rem, 1.3vh, 0.8rem);
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
  display: grid;
  gap: 0.9rem;
}

.entry-shell {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 18px;
  padding: clamp(0.9rem, 2vh, 1.3rem);
  color: #e2e8f0;
  display: grid;
  gap: 1rem;
}

.sync-shell {
  display: grid;
}

.sync-card {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 18px;
  padding: clamp(1rem, 2vh, 1.4rem);
  color: #e2e8f0;
  display: grid;
  gap: 0.45rem;
}

.entry-hero {
  display: grid;
  gap: 0.45rem;
}

.entry-kicker,
.lobby-kicker {
  margin: 0;
  color: #fbbf24;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.entry-hero h2,
.lobby-head h2 {
  margin: 0;
  font-size: clamp(1.2rem, 2.8vh, 1.6rem);
}

.entry-desc {
  margin: 0;
  color: #cbd5e1;
  max-width: 70ch;
  line-height: 1.65;
}

.entry-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid #334155;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.92));
}

.entry-field {
  display: grid;
  gap: 0.45rem;
}

.entry-field span {
  color: #bfdbfe;
  font-size: 0.85rem;
  font-weight: 600;
}

.entry-input {
  width: min(26rem, 100%);
  min-height: 2.8rem;
  border-radius: 12px;
  border: 1px solid #475569;
  background: #020617;
  color: #f8fafc;
  padding: 0.7rem 0.85rem;
  font-size: 1rem;
}

.entry-input:focus {
  outline: none;
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.lobby-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.mode-card {
  border: 1px solid #334155;
  border-radius: 14px;
  background: linear-gradient(180deg, #172033 0%, #0f172a 100%);
  color: #e2e8f0;
  padding: 0.9rem;
  display: grid;
  gap: 0.45rem;
  text-align: left;
  cursor: pointer;
}

.mode-card.active {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.mode-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.mode-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
}

.mode-head strong {
  font-size: 0.98rem;
}

.mode-head span {
  font-size: 0.72rem;
  color: #93c5fd;
  white-space: nowrap;
}

.mode-card p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.55;
  font-size: 0.84rem;
}

.lobby-slogan {
  margin: 0 0 0.65rem;
  color: #fef3c7;
  font-size: clamp(0.82rem, 1.8vh, 1rem);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.lobby-rule-tip {
  margin: 0;
  color: #93c5fd;
  font-size: clamp(0.72rem, 1.5vh, 0.88rem);
}

.lobby-actions {
  display: flex;
  flex-wrap: wrap;
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

.lobby-mode-grid {
  margin-top: -0.1rem;
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

.rules-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.72);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 92;
  padding: 12px;
}

.candidate-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.68);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 95;
  padding: 12px;
}

.candidate-panel {
  width: min(760px, 96vw);
  max-height: 82vh;
  overflow: auto;
  background: #0b1220;
  border: 1px solid #1e3a5f;
  border-radius: 12px;
  color: #e2e8f0;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.candidate-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.candidate-head h3 {
  margin: 0;
  font-size: 18px;
}

.candidate-desc {
  margin: 0;
  color: #bfdbfe;
  font-size: 14px;
}

.candidate-list {
  display: grid;
  gap: 8px;
}

.candidate-item {
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
}

.candidate-item.selected {
  border-color: #f59e0b;
  background: #3f2d0f;
}

.candidate-cards-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.preview-col {
  display: grid;
  gap: 4px;
}

.preview-col small {
  color: #93c5fd;
}

.preview-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.candidate-raw {
  color: #cbd5e1;
}

.candidate-title {
  font-size: 14px;
  font-weight: 700;
}

.candidate-empty {
  margin: 0;
  color: #fca5a5;
}

.rules-panel {
  width: min(920px, 96vw);
  max-height: 88vh;
  overflow: auto;
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(250, 204, 21, 0.14), transparent 30%),
    linear-gradient(180deg, #fffdf7 0%, #f8fafc 100%);
  color: #0f172a;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.42);
  padding: clamp(1rem, 2.4vh, 1.35rem);
  display: grid;
  gap: 0.9rem;
}

.rules-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;
}

.rules-kicker {
  margin: 0 0 0.2rem;
  color: #b45309;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.rules-head h2 {
  margin: 0;
  font-size: clamp(1.2rem, 2.5vh, 1.55rem);
}

.rules-slogan {
  margin: 0.35rem 0 0;
  color: #7c2d12;
  font-weight: 700;
  font-size: clamp(0.84rem, 1.75vh, 0.98rem);
}

.rules-section {
  display: grid;
  gap: 0.55rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.82);
}

.rules-section h3 {
  margin: 0;
  font-size: clamp(0.96rem, 1.9vh, 1.1rem);
}

.rules-list {
  margin: 0;
  padding-left: 1.15rem;
  display: grid;
  gap: 0.38rem;
  color: #334155;
  font-size: clamp(0.78rem, 1.6vh, 0.92rem);
  line-height: 1.55;
}

.rules-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.rules-chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.2rem 0.68rem;
  border-radius: 999px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 0.82rem;
  font-weight: 600;
}

.declare-panel {
  background: linear-gradient(180deg, #fffdf7 0%, #f8fafc 100%);
  color: #0f172a;
  padding: clamp(0.9rem, 2vh, 1.2rem);
  border-radius: 18px;
  min-width: 320px;
  width: min(96vw, 1100px);
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
  display: grid;
  gap: 0.8rem;
}

.declare-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.declare-header h2 {
  margin: 0;
  font-size: clamp(1.1rem, 2.2vh, 1.4rem);
}

.declare-timer-card {
  min-width: 4.8rem;
  padding: 0.7rem 0.8rem;
  border-radius: 14px;
  background: linear-gradient(135deg, #7c2d12, #dc2626);
  color: #fff7ed;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.declare-timer-card strong {
  font-size: clamp(1.3rem, 3vh, 1.8rem);
  line-height: 1;
}

.declare-timer-card span {
  font-size: 0.78rem;
}

.declare-desc {
  margin: 0.35rem 0 0;
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
}

.declare-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #84cc16);
  transition: width 0.3s ease;
}

.declare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.declare-card-section {
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  padding: 0.85rem;
  display: grid;
  gap: 0.7rem;
}

.declare-summary-card {
  background: linear-gradient(180deg, rgba(255, 247, 237, 0.95), rgba(255, 255, 255, 0.88));
}

.declare-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.declare-stepper-value {
  flex: 1 1 auto;
  min-height: 4.2rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #dbe4f0;
  display: grid;
  place-items: center;
}

.declare-stepper-value strong {
  font-size: clamp(1.5rem, 3.8vh, 2.2rem);
  line-height: 1;
}

.declare-stepper-value span {
  color: #64748b;
  font-size: 0.82rem;
}

.declare-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.declare-chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  font-size: 0.82rem;
  color: #475569;
  background: #eef2ff;
}

.declare-chip.accent {
  color: #9a3412;
  background: #ffedd5;
}

.fish-option-list {
  display: grid;
  gap: 0.5rem;
}

.fish-option {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.95);
  color: #0f172a;
  padding: 0.55rem;
  display: grid;
  grid-template-columns: minmax(4.5rem, auto) minmax(0, 1fr);
  gap: 0.55rem;
  align-items: center;
  text-align: left;
  cursor: pointer;
}

.fish-option.selected {
  border-color: #0f766e;
  background: rgba(240, 253, 250, 0.98);
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.16);
}

.fish-option-title {
  font-weight: 700;
  color: #0f172a;
}

.declare-tip {
  margin: 0;
  color: #475569;
  font-size: 13px;
}

.declare-zone {
  padding-top: 0.25rem;
}

.declare-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(2.6rem, max-content));
  gap: 0.45rem;
}

.declare-mini-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.declare-card-btn {
  border: 1px solid #d6deea;
  background: rgba(255, 255, 255, 0.96);
  padding: 0.18rem;
  border-radius: 10px;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.declare-card-btn.selected {
  border-color: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.18);
  background: rgba(240, 253, 244, 0.95);
}

.declare-card-btn.suggested {
  border-color: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.18);
  background: rgba(245, 158, 11, 0.06);
}

.declare-card-btn.fish {
  border-color: #0f766e;
  background: rgba(240, 253, 250, 0.92);
}

.hu-panel {
  background: #f8fafc;
  color: #0f172a;
  padding: clamp(0.9rem, 2vh, 1.2rem) clamp(1rem, 2.4vw, 1.4rem);
  border-radius: 12px;
  min-width: 300px;
  max-width: min(92vw, 1100px);
  max-height: 86vh;
  overflow: auto;
  font-size: clamp(0.84rem, 1.45vh, 1rem);
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

@media (max-width: 720px) {
  .rules-head {
    flex-direction: column;
  }

  .rules-panel {
    width: min(100vw, 100%);
    max-height: 100vh;
    border-radius: 16px;
  }
}

.end-global-info {
  margin: 6px 0 0;
  color: #f59e0b;
  font-weight: 600;
}

.settlement-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settlement-item {
  position: relative;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  padding: clamp(0.5rem, 1.1vh, 0.75rem);
}

.settlement-item.winner {
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.12);
}

.settlement-item.winner::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 12px;
  padding: 2px;
  background: linear-gradient(135deg, #f43f5e, #f59e0b, #22c55e, #38bdf8, #a855f7);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  animation: settlement-winner-glow 2.4s linear infinite;
}

.settlement-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.settlement-name {
  margin: 0 0 6px;
  font-weight: 600;
  font-size: clamp(0.92rem, 1.7vh, 1.08rem);
}

.settlement-meta {
  margin: 0 0 8px;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #334155;
}

.settlement-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settlement-cards.compact {
  gap: 4px;
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
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #334155;
  font-weight: 600;
}

.settlement-group-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settlement-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 2rem;
  max-width: 100%;
  padding: 0.24rem 0.32rem;
  border-radius: 0.72rem;
  border: 1px solid rgba(148, 163, 184, 0.8);
  background: rgba(241, 245, 249, 0.9);
}

.settlement-group.meld {
  border-color: rgba(148, 163, 184, 0.9);
  background: rgba(241, 245, 249, 0.92);
}

.settlement-group.fish {
  border-color: rgba(14, 165, 233, 0.6);
  background: rgba(224, 242, 254, 0.9);
}

.settlement-group.public {
  border-color: rgba(245, 158, 11, 0.6);
  background: rgba(254, 243, 199, 0.92);
}

.settlement-group.strong {
  border-color: rgba(185, 28, 28, 0.92);
  border-width: 2px;
  background:
    linear-gradient(180deg, rgba(255, 251, 235, 0.98), rgba(254, 242, 242, 0.96));
  box-shadow: 0 0 0 1px rgba(185, 28, 28, 0.12) inset;
}

.settlement-group-badge {
  flex: 0 0 auto;
  min-width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: 1px solid rgba(100, 116, 139, 0.55);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  font-size: clamp(0.68rem, 1.15vh, 0.78rem);
  font-weight: 700;
}

.score-breakdown {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

.score-formula {
  display: grid;
  gap: 0.4rem;
}

.score-formula p {
  margin: 0;
  color: #0f172a;
  font-weight: 700;
}

.score-formula ul {
  margin: 0;
  padding-left: 18px;
}

.score-formula li {
  color: #0f172a;
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
}

.score-breakdown ul {
  margin: 0;
  padding-left: 18px;
}

.score-breakdown li {
  font-size: clamp(0.72rem, 1.25vh, 0.84rem);
  color: #0f172a;
}

.score-total {
  margin: 0;
  font-weight: 700;
  font-size: clamp(0.92rem, 1.75vh, 1.12rem);
}

.score-total.positive {
  color: #166534;
}

.score-total.negative {
  color: #b91c1c;
}

.score-total.neutral {
  color: #0f172a;
}

.end-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

@keyframes settlement-winner-glow {
  0% {
    filter: hue-rotate(0deg);
  }
  100% {
    filter: hue-rotate(360deg);
  }
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

  .settlement-list {
    grid-template-columns: 1fr;
  }

  .candidate-cards-preview {
    grid-template-columns: 1fr;
  }

  .declare-grid {
    grid-template-columns: 1fr;
  }

  .declare-header {
    align-items: stretch;
  }

  .fish-option {
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

}

@media (orientation: landscape) and (max-width: 960px) {
  .layout {
    gap: 0.7vh;
    padding: 0.7vh;
  }

  .layout.playing {
    grid-template-rows: auto minmax(0, 1fr) auto;
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

  .layout.compact-landscape.playing {
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    padding: max(0.15rem, env(safe-area-inset-top)) max(0.15rem, env(safe-area-inset-right))
      max(0.15rem, env(safe-area-inset-bottom)) max(0.15rem, env(safe-area-inset-left));
  }
}
</style>
