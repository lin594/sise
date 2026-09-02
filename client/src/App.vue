<template>
  <main
    class="layout"
    :class="{
      playing: isPlaying,
      'compact-viewport': isCompactViewport,
      'ultra-compact-viewport': isUltraCompactViewport,
      'compact-landscape': isCompactViewport && isPlaying,
      'rotated-phone-portrait': isRotatedPhonePortrait,
      'game-tools-active': showGameTools,
    }"
    :data-effective-viewport="`${effectiveWidth}x${effectiveHeight}`"
    :data-rotated-phone-portrait="isRotatedPhonePortrait ? 'true' : 'false'"
    :data-connection-state="connectionState"
  >
    <header
      class="top"
      :class="{ 'game-control-header': showGameTools }"
      :data-testid="showGameTools ? 'game-control-header' : undefined"
    >
      <div class="top-brand">
        <div class="brand-lockup">
          <span class="brand-suits" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <h1>四色牌</h1>
        </div>
        <p v-if="!showGameTools" class="top-slogan">象棋魂·麻将韵·纸牌趣——四色牌，一局见真章！</p>
      </div>
      <ConnectionStatus
        v-if="hasLobbySession || isConnectingWithoutState"
        :state="connectionState"
        :attempt="reconnectAttempt"
        :show-connected="!showGameTools"
        @retry="retryConnection"
      />
      <GameTools
        v-if="showGameTools"
        v-model="displayPreferences"
        :decision-active="settingsDecisionActive"
        @open-rules="showRules = true"
        @exit="handleLeaveRoom"
      />
      <div class="meta" v-if="!hasLobbySession && !isConnectingWithoutState">
        <span>首页</span>
        <button class="ghost reset-btn" @click="showRules = true">查看规则</button>
      </div>
    </header>
    <p v-if="globalError" class="error global-error" role="alert">{{ globalError }}</p>
    <p
      v-else-if="globalNotice"
      class="global-notice"
      role="status"
      aria-live="polite"
      data-testid="global-notice"
    >{{ globalNotice }}</p>

    <LoginPage
      v-if="showEntry"
      :nickname="entryName"
      :entering="enteringLobby"
      :primary-label="entryPrimaryLabel"
      :friend-invite="hasFriendInvite"
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
      :modes="state ? [] : lobbyModes"
      :selected-mode="selectedLobbyMode"
      :can-start="canStartSelectedMode"
      :start-label="lobbyStartLabel"
      :start-hint="lobbyStartHint"
      :join-error="joinError"
      :host-player-id="state?.hostPlayerId || ''"
      :my-seat-id="mySeatId"
      :is-host="isHost"
      :room-id="activeRoomId"
      :room-mode="state?.roomMode || ''"
      :players="players"
      @open-rules="showRules = true"
      @start="startSelectedMode"
      @select-mode="selectedLobbyMode = $event as LobbyModeId"
      @copy-invite="copyInviteLink"
      @claim-seat="claimSeat"
      @add-bot="addBot($event, 50)"
      @update-bot="updateBot"
      @remove-seat="removeSeat"
    />

    <section v-else-if="showSyncingScreen" class="sync-shell">
      <div class="sync-card" data-testid="resume-session-screen">
        <div class="sync-message" role="status" aria-live="polite">
          <p class="entry-kicker">{{ connectionState === 'offline' ? '等待网络' : '恢复牌局' }}</p>
          <h2>{{ connectionState === 'offline' ? '联网后会自动继续' : '正在回到原来的牌桌' }}</h2>
          <p class="entry-desc">
            {{ connectionState === 'offline'
              ? '你的座位和身份凭证仍保存在这台设备上，无需重新输入昵称。'
              : '正在使用这台设备保存的房间身份恢复座位和手牌，请稍候。' }}
          </p>
        </div>
        <button class="resume-cancel" type="button" data-testid="cancel-session-resume" @click="abandonSessionResume">
          放弃恢复，返回首页
        </button>
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
        :ultra-compact="isUltraCompactViewport"
        :own-card-mode="resolvedOwnCardMode"
        :table-card-mode="resolvedTableCardMode"
        :seat-direction="displayPreferences.seatDirection"
        :selection-mode="selectionMode"
        :selected-candidate-id="selectedCandidateId"
        :active-candidates="activeCandidates"
        @discard-card="sendDiscardCard"
        @submit-action="onPanelSubmit"
        @selection-change="onPanelSelectionChange"
      />
    </template>

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
                <CardComp :card="candidateTargetCard" size="sm" :mode="resolvedTableCardMode" />
              </div>
              <div class="preview-col group">
                <small>组合牌</small>
                <div v-if="candidateGroupCards(candidate).length" class="preview-cards">
                  <CardComp
                    v-for="card in candidateGroupCards(candidate)"
                    :key="`cand-${candidate.id}-${card.id}`"
                    :card="card"
                    size="sm"
                    :mode="resolvedOwnCardMode"
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

    <DeclarationPanel
      v-if="shouldShowDeclarePanel"
      :hand="privateHand"
      :submitted="isDeclareSubmitted"
      :seconds-left="declareSecondsLeft"
      :progress-percent="declareProgressPercent"
      :server-error="declareError"
      :compact="isCompactViewport"
      :ultra-compact="isUltraCompactViewport"
      :card-mode="resolvedOwnCardMode"
      @submit="submitDeclaration"
    />

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
              :mode="resolvedTableCardMode"
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
                        :mode="resolvedTableCardMode"
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
                        :mode="settlementHandCardMode(p.clientId)"
                      />
                    </div>
                  </div>
                </div>
                <div class="settlement-cards" v-else-if="p.hand.length">
                  <CardComp
                    v-for="card in p.hand"
                    :key="`settle-${p.clientId}-${card.id}`"
                    :card="card"
                    size="sm"
                    :mode="settlementHandCardMode(p.clientId)"
                  />
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
          <template v-if="isHost">
            <button class="primary" :disabled="!isEnded" @click="nextRound">下一局（房主）</button>
            <button class="ghost" :disabled="!isEnded" @click="returnLobby">全桌返回大厅（房主）</button>
          </template>
          <p v-else class="host-actions-hint">下一局与全桌返回由房主操作；你可以使用右上角退出按钮个人离开。</p>
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
            <li>庄家名字旁会显示“庄”和定庄牌；中央左侧是固定牌堆，右侧只突出当前待响牌。</li>
          </ul>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import CardComp from "@/components/Card.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import DeclarationPanel from "@/components/DeclarationPanel.vue";
import GameBoard from "@/components/GameBoard.vue";
import GameTools from "@/components/GameTools.vue";
import LobbyPage from "@/components/LobbyPage.vue";
import LoginPage from "@/components/LoginPage.vue";
import { useResponsiveViewport } from "@/composables/useResponsiveViewport";
import { useRoom } from "@/composables/useRoom";
import { BACKEND_HTTP_URL } from "@/config/backend";
import type {
  ActionCandidate,
  ActionRequest,
  Card,
  CardDisplayMode,
  GameDisplayPreferences,
  RenderedCardMode,
  RoundResultPlayer,
} from "@/types/game";
import { getCardLabelText } from "@/utils/cardText";

type SettlementGroupBlock = {
  id: string;
  cards: Card[];
  badge?: string;
  label?: string;
  tone: "meld" | "fish" | "public" | "strong";
};
type LobbyModeId = "practice_bots" | "friends" | "ranked_reserved";
type LobbyMode = {
  id: LobbyModeId;
  name: string;
  description: string;
  enabled: boolean;
};
const HTTP_URL = BACKEND_HTTP_URL;
const DISPLAY_PREFERENCES_KEY = "sise_game_display_preferences_v2";
const LEGACY_TABLE_CARD_MODE_KEY = "sise_table_card_mode";

function normalizeCardDisplayMode(value: unknown): CardDisplayMode | null {
  return value === "large" || value === "adaptive" || value === "long" ? value : null;
}

function readDisplayPreferences(): GameDisplayPreferences {
  try {
    const stored = window.localStorage.getItem(DISPLAY_PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<GameDisplayPreferences>;
      return {
        ownCards: normalizeCardDisplayMode(parsed.ownCards) ?? "adaptive",
        tableCards: normalizeCardDisplayMode(parsed.tableCards) ?? "adaptive",
        seatDirection: parsed.seatDirection === "clockwise" ? "clockwise" : "counterclockwise",
      };
    }
  } catch {
    // Invalid local preferences fall back to the compatible defaults below.
  }

  const legacyMode = window.localStorage.getItem(LEGACY_TABLE_CARD_MODE_KEY);
  return {
    ownCards: "adaptive",
    tableCards: legacyMode === "simple" ? "large" : legacyMode === "full" ? "long" : "adaptive",
    seatDirection: "counterclockwise",
  };
}

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
  connectionState,
  reconnectAttempt,
  retryConnection,
  mySeatId,
  activeRoomId,
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
  leaveRoom,
  claimSeat,
  addBot,
  updateBot,
  removeSeat,
} = useRoom("玩家");

const ENTRY_NAME_KEY = "sise_entry_name";
const ENTRY_HISTORY_KEY = "sise_entry_name_history";
const entryName = ref(window.localStorage.getItem(ENTRY_NAME_KEY)?.trim() || "");
const nicknameHistory = ref<string[]>(readNicknameHistory());
const enteringLobby = ref(false);
const enteredFrontLobby = ref(false);
const restoringStoredSession = ref(false);
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
    id: "friends" as const,
    name: "好友同桌",
    description: "创建私密好友房，通过链接邀请玩家自由选座，也可按座位添加不同强度的机器人。",
    enabled: true,
  },
  {
    id: "ranked_reserved" as const,
    name: "联机匹配",
    description: "预留入口：未来会接账号、匹配和更多大厅信息，但这次先把结构留好。",
    enabled: false,
  },
];

type StoredRoomSession = {
  roomId: string;
  playerToken: string;
  name: string;
};

function readBrowserStorage(key: string): string {
  return (window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? "").trim();
}

function readStoredRoomSession(): StoredRoomSession | null {
  const query = new URLSearchParams(window.location.search);
  if (query.get("new") === "1") {
    return null;
  }
  const queryRoomId = query.get("roomId")?.trim() || "";
  const cachedRoomId = readBrowserStorage("four_room_id");
  const roomId = queryRoomId || cachedRoomId;
  if (!roomId) {
    return null;
  }
  const playerToken =
    readBrowserStorage(`four_player_token:${roomId}`) ||
    (roomId === cachedRoomId ? readBrowserStorage("four_player_token") : "");
  const name = entryName.value.trim() || readBrowserStorage("four_player_name");
  if (!playerToken || !name) {
    return null;
  }
  return { roomId, playerToken, name };
}

async function resumeStoredRoomSession(): Promise<void> {
  if (enteredFrontLobby.value || connected.value) {
    return;
  }
  const storedSession = readStoredRoomSession();
  if (!storedSession) {
    return;
  }
  entryName.value = storedSession.name;
  enteredFrontLobby.value = true;
  enteringLobby.value = true;
  restoringStoredSession.value = true;
  globalError.value = "";
  try {
    const ok = await connect({
      nameOverride: storedSession.name,
      roomId: storedSession.roomId,
      playerToken: storedSession.playerToken,
      reconnecting: true,
      preserveState: true,
    });
    if (!ok) {
      retryConnection();
    }
  } finally {
    enteringLobby.value = false;
    restoringStoredSession.value = false;
  }
}

async function abandonSessionResume(): Promise<void> {
  restoringStoredSession.value = false;
  enteringLobby.value = false;
  globalError.value = "";
  await leaveRoom();
  enteredFrontLobby.value = false;
}

const isWaiting = computed(() => state.value?.phase === "waiting");
const isDeclaring = computed(() => state.value?.phase === "declaring");
const isPlaying = computed(() => state.value?.phase === "playing");
const isEnded = computed(() => state.value?.phase === "ended");
const isHost = computed(() => Boolean(mySeatId.value) && state.value?.hostPlayerId === mySeatId.value);
const hasLobbySession = computed(() => Boolean(connected.value || state.value || mySeatId.value));
const isConnectingWithoutState = computed(
  () =>
    !state.value &&
    enteredFrontLobby.value &&
    (restoringStoredSession.value ||
      connectionState.value === "connecting" ||
      connectionState.value === "reconnecting" ||
      connectionState.value === "retry_wait" ||
      connectionState.value === "offline"),
);
const showEntry = computed(() => !enteredFrontLobby.value && !hasLobbySession.value);
const showSyncingScreen = computed(
  () => !state.value && (hasLobbySession.value || isConnectingWithoutState.value),
);
const showModeLobby = computed(() => {
  if (showSyncingScreen.value) {
    return false;
  }
  return isWaiting.value || (enteredFrontLobby.value && !state.value);
});
const showGameTools = computed(() => isDeclaring.value || isPlaying.value || isEnded.value);
const canPressStartGame = computed(
  () =>
    Boolean(connected.value) &&
    Boolean(state.value) &&
    Boolean(mySeatId.value) &&
    isWaiting.value &&
    isHost.value &&
    (state.value?.roomMode !== "friends" ||
      (players.value.length === 4 && players.value.every((player) => player.isConfiguredBot || player.connected))),
);
const canStartSelectedMode = computed(
  () =>
    (!hasLobbySession.value && (selectedLobbyMode.value === "practice_bots" || selectedLobbyMode.value === "friends")) ||
    canPressStartGame.value,
);
const lobbyTitle = computed(() => (isWaiting.value ? "房间准备中" : "游戏模式选择"));
const lobbySubtitle = computed(() => {
  if (!isWaiting.value) {
    return "选择一键单人练习，或创建一个可以邀请朋友和配置机器人的好友房。";
  }
  if (state.value?.roomMode !== "friends") {
    return "正在补齐机器人并准备开始单人练习。";
  }
  if (!mySeatId.value) {
    return "请选择一个写着“等待入座”的空座位；入座后等待房主开始。";
  }
  if (isHost.value) {
    return "把邀请链接发给朋友；四个座位都准备好后即可开始。";
  }
  return "你已入座；等待房主开始，也可以换到其他空座位。";
});
const lobbyStartLabel = computed(() => {
  if (!hasLobbySession.value && selectedLobbyMode.value === "ranked_reserved") {
    return "该模式尚未开放";
  }
  if (!hasLobbySession.value) {
    return selectedLobbyMode.value === "friends" ? "创建好友房" : "进入单人练习";
  }
  if (pendingPracticeAutoStart.value) {
    return "正在自动开始...";
  }
  if (state.value?.roomMode === "friends" && !mySeatId.value) {
    return "请先选择座位";
  }
  return isHost.value ? (state.value?.roomMode === "friends" ? "开始好友对局" : "开始单人练习") : "等待房主开始";
});
const lobbyStartHint = computed(() => {
  if (!hasLobbySession.value || !isWaiting.value) return "";
  if (!mySeatId.value) return "请先选择一个空座位";
  if (!isHost.value) return "座位配置完成后由房主开始";
  if (state.value?.roomMode !== "friends") return "";
  if (players.value.length < 4) return `还差 ${4 - players.value.length} 个座位`;
  if (players.value.some((player) => !player.isConfiguredBot && !player.connected)) return "仍有真人玩家离线";
  return "四席已就绪";
});
const hasFriendInvite = computed(
  () => Boolean(new URLSearchParams(window.location.search).get("roomId")?.trim()),
);
const entryPrimaryLabel = computed(() => (hasFriendInvite.value ? "加入好友房" : "进入大厅"));
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
  () =>
    connected.value &&
    !openingDealActive.value &&
    isPlaying.value &&
    availableActions.value.some((x) => x.enabled || x.deferred),
);
const canDiscard = computed(
  () =>
    connected.value &&
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
const isPendingSpecialCard = computed(() => {
  const card = candidateTargetCard.value;
  return Boolean(card && (card.color === "gold" || card.type === "jiang"));
});
const candidatePromptText = computed(() => {
  if (selectionMode.value === "chi" && isPendingSpecialCard.value) {
    return state.value?.responsePhase === "collective"
      ? "请选择将士象组合，或单独收下；系统会先等待其他玩家响应"
      : "请选择将士象组合，或单独收下这张将/金条";
  }
  if (state.value?.responsePhase === "collective" && selectionMode.value === "chi") {
    return "请先选吃的牌组；系统会先过待响，待无人胡/开/碰后自动吃";
  }
  return selectionMode.value ? `请点击一个牌组确认${actionText(selectionMode.value)}` : "请点击一个牌组确认";
});
const {
  effectiveHeight,
  effectiveWidth,
  isCompactViewport,
  isRotatedPhonePortrait,
  isUltraCompactViewport,
} = useResponsiveViewport();
const displayPreferences = ref<GameDisplayPreferences>(readDisplayPreferences());
function resolveCardDisplayMode(mode: CardDisplayMode): RenderedCardMode {
  if (mode !== "adaptive") {
    return mode;
  }
  return isCompactViewport.value ? "large" : "long";
}
const resolvedOwnCardMode = computed<RenderedCardMode>(() =>
  resolveCardDisplayMode(displayPreferences.value.ownCards),
);
const resolvedTableCardMode = computed<RenderedCardMode>(() =>
  resolveCardDisplayMode(displayPreferences.value.tableCards),
);
const globalError = ref("");
const globalNotice = ref("");
let globalNoticeTimer: number | null = null;
const showRules = ref(false);
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
const settingsDecisionActive = computed(
  () => canAct.value || canDiscard.value,
);
const declareDealIntroActive = computed(
  () => isDeclaring.value && Number(state.value?.responseEndsAt ?? 0) > nowMs.value,
);

let declareTick: number | null = null;
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
function clearSelection() {
  selectionMode.value = null;
  selectedCandidateId.value = null;
}

async function handleLeaveRoom(): Promise<void> {
  globalError.value = "";
  pendingPracticeAutoStart.value = false;
  clearSelection();
  await leaveRoom();
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
    return "手牌与已有明示牌";
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

function submitDeclaration(payload: { declaredKongs: number; fishCardIds: string[] }) {
  if (isDeclareSubmitted.value) {
    return;
  }
  declareSetup(payload);
}

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
  window.localStorage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(displayPreferences.value));
  void resumeStoredRoomSession();
});

onUnmounted(() => {
  if (declareTick !== null) {
    window.clearInterval(declareTick);
    declareTick = null;
  }
  if (globalNoticeTimer !== null) {
    window.clearTimeout(globalNoticeTimer);
    globalNoticeTimer = null;
  }
});

watch(globalError, (message) => {
  if (message) {
    clearGlobalNotice();
  }
});

watch(
  displayPreferences,
  (preferences) => {
    window.localStorage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(preferences));
  },
  { deep: true },
);

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

function settlementHandCardMode(playerId: string): RenderedCardMode {
  return playerId === mySeatId.value ? resolvedOwnCardMode.value : resolvedTableCardMode.value;
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
    if (isMyTurn.value && isPendingSpecialCard.value) {
      return "请选择吃牌组合，或收下将/金条";
    }
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
  const invitedRoomId = new URLSearchParams(window.location.search).get("roomId")?.trim() || "";
  if (!invitedRoomId) {
    return;
  }
  enteringLobby.value = true;
  try {
    const ok = await connect({ nameOverride: nickname, roomId: invitedRoomId });
    if (!ok) {
      throw new Error(joinError.value || "加入好友房失败");
    }
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "加入好友房失败";
  } finally {
    enteringLobby.value = false;
  }
}

function randomizeNickname() {
  entryName.value = generateRandomNickname();
}

function startSelectedMode() {
  if (!hasLobbySession.value && selectedLobbyMode.value === "ranked_reserved") {
    globalError.value = "该模式暂未开放，当前只支持单人练习。";
    return;
  }
  globalError.value = "";
  if (!hasLobbySession.value) {
    if (selectedLobbyMode.value === "friends") {
      void startFriendLobby();
    } else {
      void startPracticeLobby();
    }
    return;
  }
  if (state.value?.roomMode === "friends") {
    startGame();
  } else {
    requestPracticeAutoStart();
  }
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
    const response = await fetch(`${HTTP_URL}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "practice" }),
    });
    if (!response.ok) {
      throw new Error("创建单人练习房间失败");
    }
    const payload = (await response.json()) as { ok?: boolean; roomId?: string; hostKey?: string; message?: string };
    if (!payload?.ok || !payload.roomId) {
      throw new Error(payload?.message || "创建单人练习房间失败");
    }
    const ok = await connect({
      nameOverride: nickname,
      roomId: payload.roomId,
      hostKey: payload.hostKey,
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

async function startFriendLobby() {
  if (enteringLobby.value) {
    return;
  }
  const nickname = entryName.value.trim() || generateRandomNickname();
  enteringLobby.value = true;
  try {
    const response = await fetch(`${HTTP_URL}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "friends" }),
    });
    if (!response.ok) {
      throw new Error("创建好友房失败");
    }
    const payload = (await response.json()) as { ok?: boolean; roomId?: string; hostKey?: string; message?: string };
    if (!payload.ok || !payload.roomId || !payload.hostKey) {
      throw new Error(payload.message || "创建好友房失败");
    }
    const ok = await connect({
      nameOverride: nickname,
      roomId: payload.roomId,
      hostKey: payload.hostKey,
      forceNew: true,
    });
    if (!ok) {
      throw new Error(joinError.value || "进入好友房失败");
    }
  } catch (error) {
    globalError.value = error instanceof Error ? error.message : "创建好友房失败";
  } finally {
    enteringLobby.value = false;
  }
}

async function copyInviteLink() {
  if (!activeRoomId.value) {
    return;
  }
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("roomId", activeRoomId.value);
  try {
    await navigator.clipboard.writeText(url.toString());
    globalError.value = "";
    showGlobalNotice("邀请链接已复制，可以发给朋友了");
  } catch {
    window.prompt("请复制邀请链接", url.toString());
  }
}

function clearGlobalNotice(): void {
  if (globalNoticeTimer !== null) {
    window.clearTimeout(globalNoticeTimer);
    globalNoticeTimer = null;
  }
  globalNotice.value = "";
}

function showGlobalNotice(message: string): void {
  clearGlobalNotice();
  globalNotice.value = message;
  globalNoticeTimer = window.setTimeout(() => {
    globalNotice.value = "";
    globalNoticeTimer = null;
  }, 3_000);
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
  --game-header-height: clamp(2.5rem, 7dvh, 3rem);
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  width: 100%;
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

.layout.rotated-phone-portrait {
  --safe-top: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-right, 0px);
  --safe-left: env(safe-area-inset-bottom, 0px);
  position: fixed;
  top: 0;
  left: 100dvw;
  width: 100dvh;
  height: 100dvw;
  transform: rotate(90deg);
  transform-origin: top left;
}

.global-error {
  margin: 0;
}

.global-notice {
  margin: 0;
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(74, 222, 128, 0.6);
  border-radius: 0.65rem;
  background: rgba(20, 83, 45, 0.96);
  color: #dcfce7;
  font-weight: 750;
}

.reset-btn {
  margin-left: 0.25rem;
}

.layout.playing {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.layout.compact-landscape.playing {
  grid-template-rows: var(--game-header-height) minmax(0, 1fr);
  gap: 0.2rem;
  padding: max(0.2rem, var(--safe-top)) max(0.2rem, var(--safe-right))
    max(0.2rem, var(--safe-bottom)) max(0.2rem, var(--safe-left));
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

.top.game-control-header {
  position: relative;
  z-index: 110;
  height: var(--game-header-height);
  min-height: var(--game-header-height);
  flex: 0 0 auto;
  padding-block: 0.18rem;
  background:
    linear-gradient(90deg, rgba(120, 53, 15, 0.2), transparent 35%),
    rgba(7, 15, 28, 0.98);
  border-color: rgba(148, 163, 184, 0.32);
  box-shadow: 0 5px 18px rgba(2, 6, 23, 0.3);
}

.top-brand {
  display: grid;
  gap: 0.18rem;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand-suits {
  display: flex;
  align-items: center;
  gap: 2px;
}

.brand-suits i {
  display: block;
  width: 0.34rem;
  height: 1.12rem;
  border-radius: 999px;
  background: #facc15;
  box-shadow: 0 0 7px rgba(250, 204, 21, 0.28);
}

.brand-suits i:nth-child(2) {
  background: #ef4444;
}

.brand-suits i:nth-child(3) {
  background: #22c55e;
}

.brand-suits i:nth-child(4) {
  background: #f8fafc;
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

.layout.game-tools-active .hu-mask,
.layout.game-tools-active .rules-mask,
.layout.game-tools-active .candidate-mask,
.layout.game-tools-active :deep(.declare-mask) {
  top: calc(var(--game-header-height) + 0.45rem);
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

.sync-message {
  display: grid;
  gap: 0.45rem;
}

.resume-cancel {
  width: fit-content;
  min-height: 2.65rem;
  margin-top: 0.35rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid #475569;
  border-radius: 0.7rem;
  background: #1e293b;
  color: #f8fafc;
  font-size: 1rem;
  font-weight: 750;
}

.resume-cancel:focus-visible {
  outline: 3px solid rgba(56, 189, 248, 0.42);
  outline-offset: 2px;
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
  min-height: 48px;
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
  padding: max(0.35rem, var(--safe-top)) max(0.35rem, var(--safe-right))
    max(0.35rem, var(--safe-bottom)) max(0.35rem, var(--safe-left));
}

.rules-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.72);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 92;
  padding: max(0.35rem, var(--safe-top)) max(0.35rem, var(--safe-right))
    max(0.35rem, var(--safe-bottom)) max(0.35rem, var(--safe-left));
}

.candidate-mask {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.68);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 95;
  padding: max(0.35rem, var(--safe-top)) max(0.35rem, var(--safe-right))
    max(0.35rem, var(--safe-bottom)) max(0.35rem, var(--safe-left));
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
  position: sticky;
  top: -12px;
  z-index: 3;
  padding: 12px 0 8px;
  background: linear-gradient(180deg, #0b1220 78%, rgba(11, 18, 32, 0));
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
  min-height: 48px;
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
  position: sticky;
  top: calc(-1 * clamp(1rem, 2.4vh, 1.35rem));
  z-index: 3;
  padding: clamp(1rem, 2.4vh, 1.35rem) 0 0.7rem;
  background: linear-gradient(180deg, #fffdf7 82%, rgba(255, 253, 247, 0));
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

@media (max-width: 720px) and (pointer: fine) {
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

.host-actions-hint {
  margin: 0;
  color: #475569;
  font-size: 0.82rem;
  line-height: 1.45;
}

.hu-panel > .end-actions {
  position: sticky;
  bottom: calc(-1 * clamp(0.9rem, 2vh, 1.2rem));
  z-index: 5;
  margin-inline: calc(-1 * clamp(0.9rem, 2vh, 1.2rem));
  padding: 0.65rem clamp(0.9rem, 2vh, 1.2rem) clamp(0.9rem, 2vh, 1.2rem);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0), #f8fafc 30%);
}

@keyframes settlement-winner-glow {
  0% {
    filter: hue-rotate(0deg);
  }
  100% {
    filter: hue-rotate(360deg);
  }
}

@media (max-width: 767px) and (pointer: fine) {
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

}

@media (max-height: 600px) {
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

@media (max-width: 960px), (max-height: 500px) {
  .layout {
    gap: 0.7vh;
    padding: max(0.25rem, var(--safe-top)) max(0.25rem, var(--safe-right))
      max(0.25rem, var(--safe-bottom)) max(0.25rem, var(--safe-left));
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
    grid-template-rows: var(--game-header-height) minmax(0, 1fr);
    gap: 0.2rem;
    padding: max(0.15rem, var(--safe-top)) max(0.15rem, var(--safe-right))
      max(0.15rem, var(--safe-bottom)) max(0.15rem, var(--safe-left));
  }

  .top.game-control-header {
    border-radius: 0.65rem;
    padding-inline: 0.45rem;
  }
}

.layout.compact-viewport .hu-mask,
.layout.compact-viewport .rules-mask,
.layout.compact-viewport .candidate-mask {
  align-items: stretch;
}

.layout.compact-viewport .candidate-panel,
.layout.compact-viewport .rules-panel,
.layout.compact-viewport .hu-panel {
  width: 100%;
  max-width: none;
  min-width: 0;
  height: 100%;
  max-height: none;
  border-radius: 12px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.layout.compact-viewport .rules-panel {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 0.55rem;
  padding: 0.65rem;
}

.layout.compact-viewport .rules-head {
  grid-column: 1 / -1;
  top: -0.65rem;
  padding: 0.65rem 0 0.45rem;
}

.layout.compact-viewport .rules-section {
  padding: 0.65rem;
  border-radius: 12px;
}

.layout.compact-viewport .hu-panel {
  padding: 0.65rem;
}

.layout.compact-viewport .settlement-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.layout.compact-viewport .candidate-panel {
  padding: 0.65rem;
}

.layout.compact-viewport .candidate-head {
  top: -0.65rem;
  padding: 0.65rem 0 0.45rem;
}

.layout.compact-viewport .hu-panel > .end-actions {
  bottom: -0.65rem;
  margin-inline: -0.65rem;
  padding: 0.55rem 0.65rem 0.65rem;
}

.layout.compact-viewport .ghost.mini,
.layout.compact-viewport .primary,
.layout.compact-viewport .ghost {
  min-height: 48px;
}

.layout.ultra-compact-viewport .top-slogan,
.layout.ultra-compact-viewport .meta > span:not(:first-child) {
  display: none;
}

.layout.ultra-compact-viewport .rules-slogan {
  display: none;
}

.layout.ultra-compact-viewport .rules-list {
  line-height: 1.35;
}
</style>
