<template>
  <section
    class="lobby"
    :class="{
      'friend-waiting-room': roomMode === 'friends' && Boolean(roomId),
      'match-waiting-room': roomMode === 'match' && Boolean(roomId),
      'mode-selection': modes.length > 0,
    }"
  >
    <div class="lobby-head">
      <div>
        <p class="lobby-kicker">{{ kicker }}</p>
        <h2 ref="lobbyTitleRef" tabindex="-1">{{ title }}</h2>
        <p class="lobby-rule-tip">{{ subtitle }}</p>
      </div>
      <div class="lobby-head-actions">
        <button
          v-if="modes.length && guestProfileSummary"
          ref="guestProfileButtonRef"
          class="guest-profile-summary"
          data-testid="guest-profile-summary"
          type="button"
          aria-haspopup="dialog"
          :aria-expanded="guestProfileOpen"
          aria-label="查看本机临时档案详情"
          @click="openGuestProfile"
        >
          <span class="guest-profile-summary-copy" aria-live="polite">
            <strong>本机临时档案</strong>
            <span>{{ guestProfileSummary }}</span>
          </span>
          <span class="guest-profile-summary-view" aria-hidden="true">查看</span>
        </button>
        <button v-if="roomId" class="ghost head-action" type="button" @click="$emit('open-rules')">查看规则</button>
        <button
          v-if="(roomMode === 'friends' || roomMode === 'match') && roomId"
          ref="leaveButtonRef"
          class="ghost head-action leave-room"
          type="button"
          data-testid="leave-waiting-room"
          @click="requestLeaveRoom"
        >
          {{ roomMode === "match" ? "退出配桌" : "离开房间" }}
        </button>
        <button
          v-if="roomMode === 'friends' && roomId && isHost"
          ref="dissolveButtonRef"
          class="danger head-action dissolve-room"
          type="button"
          data-testid="dissolve-room"
          @click="requestDissolveRoom"
        >
          解散房间
        </button>
      </div>
    </div>

    <div class="lobby-scroll" data-testid="lobby-scroll">
      <div v-if="modes.length" class="mode-grid">
        <button
          v-for="mode in modes"
          :key="mode.id"
          :data-testid="`mode-${mode.id}`"
          class="mode-card"
          :class="{ active: selectedMode === mode.id, disabled: !mode.enabled }"
          :disabled="!mode.enabled"
          :aria-pressed="selectedMode === mode.id"
          @click="$emit('select-mode', mode.id)"
        >
          <div class="mode-head">
            <strong>{{ mode.name }}</strong>
            <span>{{ selectedMode === mode.id ? "已选择" : mode.badge }}</span>
          </div>
          <p>{{ mode.description }}</p>
        </button>
      </div>

      <div v-if="roomMode === 'friends' && roomId" class="invite-card">
        <div>
          <strong>好友房 {{ roomId }}</strong>
          <p>{{ canShareInvite ? "通过系统分享给牌友；链接不会包含你的身份凭据。" : "复制邀请链接给朋友；链接不会包含你的身份凭据。" }}</p>
        </div>
        <div class="invite-actions">
          <button
            class="ghost invite-button"
            type="button"
            data-testid="copy-invite"
            :disabled="invitePending"
            @click="$emit('copy-invite')"
          >
            {{ invitePending ? (canShareInvite ? "正在打开…" : "正在复制…") : (canShareInvite ? "邀请牌友" : "复制链接") }}
          </button>
          <button
            class="ghost invite-button show-qr-button"
            type="button"
            data-testid="show-invite-qr"
            @click="$emit('show-invite-qr')"
          >
            出示二维码
          </button>
        </div>
      </div>

      <section
        v-if="roomMode === 'match' && roomId"
        class="match-status-card"
        data-testid="match-status"
      >
        <div>
          <strong
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="match-human-count"
          >真人 {{ matchHumanCount }} / 4</strong>
          <span>先等真人，人数不足时电脑补位</span>
        </div>
        <b
          role="timer"
          :aria-label="matchCountdownText"
          data-testid="match-countdown"
        >
          {{ matchCountdownText }}
        </b>
      </section>

      <div v-if="roomId" class="seat-grid" data-testid="seat-grid">
        <article
          v-for="slot in seatSlots"
          :key="slot.seatIndex"
          class="seat-card"
          :class="{ empty: !slot.player, mine: slot.player?.clientId === mySeatId }"
          :data-testid="`seat-${slot.seatIndex}`"
        >
          <div class="seat-head">
            <strong>{{ seatNames[slot.seatIndex] }}</strong>
            <span v-if="roomMode !== 'match' && slot.player?.clientId === hostPlayerId">
              {{ slot.player?.clientId === mySeatId ? "房主 · 你" : "房主" }}
            </span>
            <span v-else-if="slot.player?.clientId === mySeatId">你</span>
          </div>

          <template v-if="slot.player">
            <p class="player-name">{{ slot.player.name }}</p>
            <small v-if="slot.player.isConfiguredBot">机器人 · {{ botLevelForStrength(slot.player.botStrength).label }}</small>
            <small v-else class="human-seat-status">
              {{ slot.player.connected ? "真人在线" : "真人离线（座位暂留）" }}
              <strong
                v-if="roomMode === 'friends' && slot.player.clientId !== hostPlayerId"
                class="ready-state"
                :class="{ ready: slot.player.lobbyReady }"
                :data-testid="`seat-ready-${slot.seatIndex}`"
              >{{ slot.player.lobbyReady ? "已准备" : "未准备" }}</strong>
            </small>

            <template v-if="roomMode === 'friends' && slot.player.isConfiguredBot && isHost">
              <div
                class="bot-level-group"
                role="group"
                :aria-label="`${slot.player.name}的机器人难度`"
                :data-testid="`bot-levels-${slot.seatIndex}`"
              >
                <span>选择难度</span>
                <div class="bot-level-options">
                  <button
                    v-for="level in botLevels"
                    :key="level.id"
                    type="button"
                    class="bot-level-button"
                    :class="{ active: botLevelForStrength(slot.player.botStrength).id === level.id }"
                    :aria-pressed="botLevelForStrength(slot.player.botStrength).id === level.id"
                    :aria-label="`将${slot.player.name}设为${level.label}难度`"
                    :data-testid="`bot-level-${slot.seatIndex}-${level.id}`"
                    @click="$emit('update-bot', slot.seatIndex, level.strength)"
                  >
                    {{ level.label }}
                  </button>
                </div>
              </div>
              <button class="danger mini" type="button" @click="$emit('remove-seat', slot.seatIndex)">移除机器人</button>
            </template>
            <button
              v-else-if="roomMode === 'friends' && isHost && slot.player.clientId !== hostPlayerId"
              class="danger mini"
              type="button"
              @click="$emit('remove-seat', slot.seatIndex)"
            >
              移出玩家
            </button>
          </template>

          <template v-else>
            <p class="empty-label">等待入座</p>
            <div v-if="roomMode === 'friends'" class="seat-actions">
              <button
                class="ghost mini"
                type="button"
                :data-testid="`claim-seat-${slot.seatIndex}`"
                @click="$emit('claim-seat', slot.seatIndex)"
              >
                {{ mySeatId ? "换到这里" : "选择此座" }}
              </button>
              <button
                v-if="isHost"
                class="ghost mini"
                type="button"
                :data-testid="`add-bot-${slot.seatIndex}`"
                @click="$emit('add-bot', slot.seatIndex)"
              >
                添加机器人
              </button>
            </div>
          </template>
        </article>
      </div>

      <section v-if="roomMode === 'friends' && roomId" class="scoring-card" data-testid="scoring-mode-card">
        <div class="scoring-copy">
          <strong>计分方式</strong>
          <p v-if="completedRounds > 0">本桌已完成 {{ completedRounds }} 局，计分方式已锁定到解散。</p>
          <p v-else>{{ isHost ? "开局前选择；开始后整桌保持不变。" : "由房主在开局前选择。" }}</p>
        </div>
        <div class="scoring-options" role="radiogroup" aria-label="好友房计分方式">
          <button
            v-for="option in scoringOptions"
            :key="option.mode"
            type="button"
            role="radio"
            :data-testid="`scoring-mode-${option.mode}`"
            :aria-checked="scoringMode === option.mode"
            :class="{ active: scoringMode === option.mode }"
            :disabled="!isHost || completedRounds > 0"
            @click="$emit('set-scoring-mode', option.mode)"
          >
            <strong>{{ option.label }}</strong>
            <small>{{ option.hint }}</small>
          </button>
        </div>
        <ol
          v-if="scoringMode === 'cumulative' && completedRounds > 0"
          class="cumulative-board"
          data-testid="cumulative-scoreboard"
          aria-label="本桌累计积分"
        >
          <li v-for="player in cumulativeRanking" :key="`score-${player.clientId}`">
            <span>{{ player.name }}<small v-if="player.clientId === mySeatId">（你）</small></span>
            <strong
              :class="{ positive: player.cumulativeScore > 0, negative: player.cumulativeScore < 0 }"
              :data-testid="`cumulative-score-${player.clientId}`"
            >
              {{ signedScore(player.cumulativeScore) }}分
            </strong>
          </li>
        </ol>
      </section>

      <p v-if="joinError" class="error" role="alert">{{ joinError }}</p>
    </div>

    <div class="lobby-actions">
      <div class="lobby-primary-actions">
        <button
          v-if="showFillBots"
          key="fill-bots"
          class="ghost fill-bots"
          type="button"
          data-testid="fill-bots"
          :disabled="fillRequested"
          @click="requestFillBots"
        >
          {{ fillRequested ? "正在补齐…" : `补齐 ${emptySeatCount} 位电脑` }}
        </button>
        <button
          v-if="showReadyAction"
          key="ready-toggle"
          class="primary ready-toggle"
          :class="{ active: myLobbyReady }"
          type="button"
          data-testid="lobby-ready"
          :aria-pressed="myLobbyReady"
          @click="$emit('set-lobby-ready', !myLobbyReady)"
        >
          {{ myLobbyReady ? "取消准备" : "我准备好了" }}
        </button>
        <button
          v-else-if="showStartAction"
          key="start-game"
          ref="startButtonRef"
          class="primary"
          type="button"
          data-testid="lobby-start"
          :disabled="!canStart"
          @click="$emit('start')"
        >
          {{ startLabel }}
        </button>
        <p v-else-if="roomMode === 'match'" class="match-waiting-note">正在等牌友，准备好后会自动开始</p>
      </div>
      <span v-if="startHint" class="start-hint" role="status" aria-live="polite">{{ startHint }}</span>
    </div>

    <Teleport to=".layout">
      <div
        v-if="guestProfileOpen"
        class="waiting-leave-mask guest-profile-mask"
        data-testid="guest-profile-mask"
        @click.self="closeGuestProfile"
      >
        <section
          ref="guestProfileDialogRef"
          class="waiting-leave-dialog guest-profile-dialog"
          data-testid="guest-profile-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-profile-title"
          aria-describedby="guest-profile-description"
          tabindex="-1"
          @keydown.esc.stop.prevent="closeGuestProfile"
          @keydown.tab="trapGuestProfileFocus"
        >
          <header class="guest-profile-dialog-head">
            <span aria-hidden="true">牌友</span>
            <div>
              <small>当前浏览器</small>
              <h2 id="guest-profile-title">本机临时档案</h2>
            </div>
          </header>
          <p class="guest-profile-name">昵称：<strong>{{ guestProfileName || "牌友" }}</strong></p>
          <div class="guest-profile-stats" aria-label="本机临时档案统计">
            <div><span data-testid="guest-profile-rounds">{{ normalizedProfileRounds }}</span><small>已玩局数</small></div>
            <div><span data-testid="guest-profile-wins">{{ normalizedProfileWins }}</span><small>胡牌局数</small></div>
            <div><span data-testid="guest-profile-win-rate">{{ guestProfileWinRate }}</span><small>胡牌率</small></div>
            <div><span data-testid="guest-profile-score">{{ signedScore(normalizedProfileScore) }}分</span><small>累计总分</small></div>
          </div>
          <p id="guest-profile-description" class="guest-profile-explanation">
            成绩按服务端结算记录，只凭当前浏览器保存的临时凭证找回。清除浏览器数据后无法找回，这不是正式账号。
          </p>
          <button
            ref="guestProfileCloseButtonRef"
            class="guest-profile-close"
            type="button"
            data-testid="close-guest-profile"
            @click="closeGuestProfile"
          >知道了</button>
        </section>
      </div>
    </Teleport>

    <Teleport to=".layout">
      <div
        v-if="departureIntent"
        class="waiting-leave-mask"
        data-testid="waiting-leave-mask"
        @click.self="cancelLeaveRoom"
      >
        <section
          ref="leaveDialogRef"
          class="waiting-leave-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="waiting-leave-title"
          aria-describedby="waiting-leave-description"
          tabindex="-1"
          @keydown.esc.stop.prevent="cancelLeaveRoom"
          @keydown.tab="trapLeaveFocus"
        >
          <div class="leave-symbol" :class="{ dissolve: departureIntent === 'dissolve' }" aria-hidden="true">
            {{ departureIntent === "dissolve" ? "散" : "↩" }}
          </div>
          <h2 id="waiting-leave-title">{{ departureDialogTitle }}</h2>
          <p id="waiting-leave-description">{{ leaveRoomDescription }}</p>
          <div class="waiting-leave-actions">
            <button ref="leaveCancelButtonRef" type="button" data-testid="cancel-waiting-leave" @click="cancelLeaveRoom">继续等待</button>
            <button
              class="danger"
              type="button"
              :data-testid="departureIntent === 'dissolve' ? 'confirm-dissolve-room' : 'confirm-waiting-leave'"
              @click="confirmDeparture"
            >
              {{ departureIntent === "dissolve" ? "确认解散整桌" : "确认离开" }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { ScoringMode } from "@/types/game";

type LobbyMode = {
  id: string;
  name: string;
  description: string;
  badge: string;
  enabled: boolean;
};

type LobbyPlayer = {
  clientId: string;
  seatIndex: number;
  name: string;
  isBot: boolean;
  isConfiguredBot: boolean;
  botStrength: number;
  cumulativeScore: number;
  connected: boolean;
  lobbyReady: boolean;
};

const props = defineProps<{
  kicker: string;
  title: string;
  subtitle: string;
  modes: LobbyMode[];
  selectedMode: string;
  canStart: boolean;
  startLabel: string;
  startHint: string;
  joinError: string;
  hostPlayerId: string;
  mySeatId: string;
  isHost: boolean;
  roomId: string;
  roomMode: "practice" | "friends" | "match" | "";
  matchSecondsLeft: number;
  players: LobbyPlayer[];
  canShareInvite: boolean;
  invitePending: boolean;
  scoringMode: ScoringMode;
  completedRounds: number;
  guestProfileSummary: string;
  guestProfileName: string;
  guestProfileRounds: number;
  guestProfileWins: number;
  guestProfileScore: number;
}>();

const seatNames = ["A位（1号）", "B位（2号）", "C位（3号）", "D位（4号）"];
const botLevels = [
  { id: "easy", label: "轻松", strength: 20 },
  { id: "standard", label: "标准", strength: 50 },
  { id: "expert", label: "高手", strength: 85 },
] as const;
const scoringOptions: Array<{ mode: ScoringMode; label: string; hint: string }> = [
  { mode: "single", label: "每局单算", hint: "只看这一局" },
  { mode: "cumulative", label: "本桌累计", hint: "一直算到解散" },
];
const emit = defineEmits<{
  "open-rules": [];
  start: [];
  "select-mode": [modeId: string];
  "copy-invite": [];
  "show-invite-qr": [];
  "claim-seat": [seatIndex: number];
  "add-bot": [seatIndex: number];
  "fill-bots": [];
  "update-bot": [seatIndex: number, strength: number];
  "remove-seat": [seatIndex: number];
  "leave-room": [];
  "dissolve-room": [];
  "set-scoring-mode": [mode: ScoringMode];
  "set-lobby-ready": [ready: boolean];
}>();
const departureIntent = ref<"leave" | "dissolve" | null>(null);
const fillRequested = ref(false);
const leaveButtonRef = ref<HTMLButtonElement | null>(null);
const dissolveButtonRef = ref<HTMLButtonElement | null>(null);
const startButtonRef = ref<HTMLButtonElement | null>(null);
const lobbyTitleRef = ref<HTMLHeadingElement | null>(null);
const leaveDialogRef = ref<HTMLElement | null>(null);
const leaveCancelButtonRef = ref<HTMLButtonElement | null>(null);
const guestProfileButtonRef = ref<HTMLButtonElement | null>(null);
const guestProfileDialogRef = ref<HTMLElement | null>(null);
const guestProfileCloseButtonRef = ref<HTMLButtonElement | null>(null);
const guestProfileOpen = ref(false);
let fillRequestTimer: number | null = null;
let focusStartAfterFillRequested = false;
const leaveRoomDescription = computed(() => {
  if (departureIntent.value === "dissolve") {
    return "这会结束本桌的累计积分，并让所有牌友立即返回模式选择。这个操作不能撤销。";
  }
  if (props.roomMode === "match") {
    return "只让你退出这次配桌，不会把其他牌友一起带走。你将返回游戏模式大厅。";
  }
  if (props.isHost) {
    return "如果还有真人，房主会自动转交；如果只剩你，房间会关闭。你将返回游戏模式大厅。";
  }
  if (props.mySeatId) {
    return "你的座位会被释放，你将返回游戏模式大厅。";
  }
  return "你还没有入座，将返回游戏模式大厅。";
});
const departureDialogTitle = computed(() =>
  departureIntent.value === "dissolve"
    ? "解散整张好友桌？"
    : props.roomMode === "practice"
      ? "离开当前练习？"
      : props.roomMode === "match"
        ? "离开快速配桌？"
        : "离开当前好友房？",
);
const seatSlots = computed(() =>
  Array.from({ length: 4 }, (_, seatIndex) => ({
    seatIndex,
    player: props.players.find((player) => player.seatIndex === seatIndex) ?? null,
  })),
);
const emptySeatCount = computed(() => seatSlots.value.filter((slot) => !slot.player).length);
const matchHumanCount = computed(
  () => props.players.filter((player) => !player.isConfiguredBot).length,
);
const matchHasOfflineHuman = computed(
  () => props.players.some((player) => !player.isConfiguredBot && !player.connected),
);
const matchCountdownText = computed(() => {
  if (matchHasOfflineHuman.value) return "等待牌友恢复连接";
  if (props.matchSecondsLeft <= 0) return "正在准备配桌…";
  return `${props.matchSecondsLeft} 秒后自动开始`;
});
const myLobbyReady = computed(
  () => props.players.find((player) => player.clientId === props.mySeatId)?.lobbyReady ?? false,
);
const showReadyAction = computed(
  () =>
    props.roomMode === "friends" &&
    Boolean(props.roomId) &&
    Boolean(props.mySeatId) &&
    !props.isHost,
);
const showFillBots = computed(
  () => props.roomMode === "friends" && Boolean(props.roomId) && props.isHost && emptySeatCount.value > 0,
);
const showStartAction = computed(() => props.roomMode !== "match" || props.isHost);
const cumulativeRanking = computed(() =>
  [...props.players].sort((left, right) =>
    right.cumulativeScore - left.cumulativeScore || left.seatIndex - right.seatIndex,
  ),
);
const normalizedProfileRounds = computed(() => Math.max(0, Math.trunc(Number(props.guestProfileRounds) || 0)));
const normalizedProfileWins = computed(() =>
  Math.min(normalizedProfileRounds.value, Math.max(0, Math.trunc(Number(props.guestProfileWins) || 0))),
);
const normalizedProfileScore = computed(() => Math.trunc(Number(props.guestProfileScore) || 0));
const guestProfileWinRate = computed(() =>
  normalizedProfileRounds.value > 0
    ? `${Math.round((normalizedProfileWins.value / normalizedProfileRounds.value) * 100)}%`
    : "—",
);

function signedScore(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

watch(
  () => [emptySeatCount.value, props.canStart, props.joinError] as const,
  async ([emptySeats, canStart, joinError]) => {
    if (joinError && (fillRequested.value || focusStartAfterFillRequested)) {
      focusStartAfterFillRequested = false;
      clearFillRequestState();
      return;
    }
    if (!focusStartAfterFillRequested || emptySeats !== 0 || !canStart) {
      return;
    }
    await nextTick();
    // The fill control is replaced by a differently keyed start control.
    // Wait for that new button to be painted before moving keyboard focus;
    // otherwise a slow browser can drop focus while removing the old button.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    startButtonRef.value?.focus({ preventScroll: true });
    focusStartAfterFillRequested = false;
    clearFillRequestState();
  },
);

onUnmounted(() => {
  focusStartAfterFillRequested = false;
  clearFillRequestState();
});

function botLevelForStrength(strength: number): (typeof botLevels)[number] {
  const normalized = Number.isFinite(strength) ? strength : 50;
  if (normalized < 35) {
    return botLevels[0];
  }
  if (normalized < 70) {
    return botLevels[1];
  }
  return botLevels[2];
}

function clearFillRequestState(): void {
  fillRequested.value = false;
  if (fillRequestTimer !== null) {
    window.clearTimeout(fillRequestTimer);
    fillRequestTimer = null;
  }
}

function requestFillBots(): void {
  if (fillRequested.value || !showFillBots.value) {
    return;
  }
  fillRequested.value = true;
  focusStartAfterFillRequested = true;
  emit("fill-bots");
  fillRequestTimer = window.setTimeout(() => {
    fillRequested.value = false;
    fillRequestTimer = null;
  }, 5_000);
}

async function requestLeaveRoom(): Promise<void> {
  departureIntent.value = "leave";
  await nextTick();
  leaveCancelButtonRef.value?.focus();
}

async function requestDissolveRoom(): Promise<void> {
  departureIntent.value = "dissolve";
  await nextTick();
  leaveCancelButtonRef.value?.focus();
}

async function cancelLeaveRoom(): Promise<void> {
  if (!departureIntent.value) {
    return;
  }
  const returnTarget = departureIntent.value === "dissolve" ? dissolveButtonRef.value : leaveButtonRef.value;
  departureIntent.value = null;
  await nextTick();
  returnTarget?.focus();
}

function confirmDeparture(): void {
  const intent = departureIntent.value;
  departureIntent.value = null;
  if (intent === "dissolve") {
    emit("dissolve-room");
    return;
  }
  if (intent === "leave") {
    emit("leave-room");
  }
}

async function openGuestProfile(): Promise<void> {
  guestProfileOpen.value = true;
  await nextTick();
  guestProfileCloseButtonRef.value?.focus();
}

async function closeGuestProfile(): Promise<void> {
  if (!guestProfileOpen.value) {
    return;
  }
  guestProfileOpen.value = false;
  await nextTick();
  guestProfileButtonRef.value?.focus();
}

function handleNavigationBack(): boolean {
  if (guestProfileOpen.value) {
    void closeGuestProfile();
    return true;
  }
  if (!departureIntent.value) {
    return false;
  }
  void cancelLeaveRoom();
  return true;
}

function trapGuestProfileFocus(event: KeyboardEvent): void {
  const dialog = guestProfileDialogRef.value;
  const button = guestProfileCloseButtonRef.value;
  if (!dialog || !button) {
    return;
  }
  event.preventDefault();
  button.focus();
}

defineExpose({
  handleNavigationBack,
  requestLeaveRoom,
});

function trapLeaveFocus(event: KeyboardEvent): void {
  const dialog = leaveDialogRef.value;
  if (!dialog) {
    return;
  }
  const focusable = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<style scoped>
.lobby {
  background: #0b1220;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 14px;
  color: #e2e8f0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 1rem;
  min-height: 0;
  overflow: hidden;
}

.lobby-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  display: grid;
  align-content: start;
  gap: 1rem;
}

.lobby-head,
.lobby-head-actions,
.invite-card,
.invite-actions,
.seat-head,
.lobby-actions,
.seat-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.lobby-head,
.invite-card,
.seat-head {
  justify-content: space-between;
}

.lobby-head > div:first-child {
  min-width: 0;
}

.lobby-head h2:focus-visible {
  outline: 3px solid #facc15;
  outline-offset: 3px;
  border-radius: 4px;
}

.lobby-head-actions {
  flex: 0 0 auto;
}

.guest-profile-summary {
  min-width: 11.5rem;
  min-height: 40px;
  padding: 0.48rem 0.72rem;
  border: 1px solid rgba(56, 189, 248, 0.5);
  border-radius: 0.72rem;
  background: rgba(7, 89, 133, 0.34);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.55rem;
  gap: 0.1rem;
  color: #e0f2fe;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.guest-profile-summary:hover,
.guest-profile-summary:focus-visible {
  border-color: #7dd3fc;
  background: rgba(3, 105, 161, 0.5);
}

.guest-profile-summary:focus-visible {
  outline: 3px solid #facc15;
  outline-offset: 2px;
}

.guest-profile-summary-copy {
  display: grid;
  gap: 0.1rem;
}

.guest-profile-summary-copy strong {
  color: #fef08a;
  font-size: max(0.875rem, 14px);
}

.guest-profile-summary-copy > span {
  font-size: 0.9rem;
  font-weight: 800;
  white-space: nowrap;
}

.guest-profile-summary-view {
  align-self: center;
  color: #bae6fd;
  font-size: max(0.875rem, 14px);
  font-weight: 850;
  white-space: nowrap;
}

.invite-actions {
  flex: 0 0 auto;
  gap: 0.5rem;
}

.show-qr-button {
  border-color: rgba(125, 211, 252, 0.72);
  background: #075985;
  color: #f0f9ff;
  font-weight: 850;
}

.lobby-kicker {
  margin: 0;
  color: #fbbf24;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lobby-head h2 {
  margin: 0;
  font-size: clamp(1.2rem, 2.8vh, 1.6rem);
}

.lobby-rule-tip,
.invite-card p {
  margin: 0.35rem 0 0;
  color: #93c5fd;
  font-size: 0.84rem;
}

.mode-grid,
.seat-grid {
  display: grid;
  gap: 0.75rem;
}

.mode-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.seat-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mode-card,
.seat-card,
.invite-card,
.match-status-card,
.scoring-card {
  border: 1px solid #334155;
  border-radius: 14px;
  background: linear-gradient(180deg, #172033 0%, #0f172a 100%);
  color: #e2e8f0;
  padding: 0.9rem;
}

.match-status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-color: rgba(56, 189, 248, 0.55);
  background: linear-gradient(135deg, rgba(7, 89, 133, 0.72), rgba(15, 23, 42, 0.96));
}

.match-status-card > div {
  display: grid;
  gap: 0.18rem;
}

.match-status-card strong {
  color: #fef08a;
  font-size: 1.1rem;
}

.match-status-card span {
  color: #bae6fd;
  font-size: 0.82rem;
}

.match-status-card b {
  flex: 0 0 auto;
  color: #fff;
  font-size: 1rem;
}

.match-waiting-note {
  margin: 0;
  color: #bae6fd;
  font-weight: 750;
}

.scoring-card {
  display: grid;
  grid-template-columns: minmax(8rem, 0.8fr) minmax(16rem, 1.2fr);
  align-items: center;
  gap: 0.75rem;
}

.scoring-copy p {
  margin: 0.28rem 0 0;
  color: #bfdbfe;
  font-size: 0.8rem;
}

.scoring-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.scoring-options button {
  min-height: 50px;
  padding: 0.42rem 0.55rem;
  border: 1px solid #475569;
  border-radius: 0.72rem;
  background: #111827;
  color: #e2e8f0;
  display: grid;
  gap: 0.08rem;
  text-align: left;
}

.scoring-options button.active {
  border-color: #fbbf24;
  background: #713f12;
  color: #fef3c7;
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.24);
}

.scoring-options button:disabled {
  opacity: 1;
  cursor: default;
}

.scoring-options button:not(.active):disabled {
  opacity: 0.58;
}

.scoring-options small {
  font-size: 0.75rem;
}

.cumulative-board {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
}

.cumulative-board li {
  min-width: 0;
  padding: 0.38rem 0.5rem;
  border-radius: 0.6rem;
  background: rgba(15, 23, 42, 0.82);
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
}

.cumulative-board li span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cumulative-board strong.positive { color: #86efac; }
.cumulative-board strong.negative { color: #fca5a5; }

.mode-card {
  display: grid;
  gap: 0.45rem;
  text-align: left;
  cursor: pointer;
}

.mode-card.active,
.seat-card.mine {
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
  font-size: 1.02rem;
}

.mode-head span {
  color: #93c5fd;
  font-size: 0.8rem;
  font-weight: 750;
  white-space: nowrap;
}

.mode-card p,
.player-name,
.empty-label {
  margin: 0.35rem 0;
}

.mode-card p {
  color: #cbd5e1;
  font-size: 0.9rem;
  line-height: 1.45;
}

.seat-card {
  min-height: 130px;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.seat-card.empty {
  border-style: dashed;
}

.seat-head span {
  color: #fbbf24;
  font-size: 0.75rem;
}

.human-seat-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.38rem;
  color: #cbd5e1;
}

.ready-state {
  padding: 0.12rem 0.38rem;
  border: 1px solid #fb7185;
  border-radius: 999px;
  color: #fecdd3;
  font-size: 0.82rem;
  line-height: 1.25;
}

.ready-state.ready {
  border-color: #4ade80;
  background: rgba(20, 83, 45, 0.72);
  color: #dcfce7;
}

.seat-actions {
  margin-top: auto;
  flex-wrap: wrap;
}

.bot-level-group {
  display: grid;
  gap: 0.3rem;
}

.bot-level-group > span {
  color: #bfdbfe;
  font-size: 0.72rem;
  font-weight: 750;
}

.bot-level-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.bot-level-button {
  min-width: 0;
  min-height: 44px;
  padding: 0.4rem 0.25rem;
  border: 1px solid #475569;
  border-radius: 9px;
  background: #172033;
  color: #e2e8f0;
  font-weight: 800;
  cursor: pointer;
}

.bot-level-button.active {
  border-color: #38bdf8;
  background: #075985;
  color: #f0f9ff;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.28);
}

.bot-level-button:focus-visible,
.head-action:focus-visible,
.primary:focus-visible,
.ghost:focus-visible,
.danger:focus-visible {
  outline: 3px solid #facc15;
  outline-offset: 2px;
}

.primary,
.ghost,
.danger {
  border: none;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  min-height: 48px;
}

.primary {
  background: #2563eb;
  color: #fff;
  font-weight: 750;
}

.primary:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.ready-toggle {
  min-width: min(18rem, 100%);
  font-size: 1rem;
}

.ready-toggle.active {
  border: 1px solid #86efac;
  background: #14532d;
  color: #dcfce7;
}

.ghost {
  background: #1f2937;
  color: #e2e8f0;
  border: 1px solid #334155;
}

.leave-room {
  border-color: rgba(248, 113, 113, 0.62);
  color: #fecaca;
}

.dissolve-room {
  border: 1px solid #dc2626;
  font-weight: 850;
}

.danger {
  background: #7f1d1d;
  color: #fee2e2;
}

.mini {
  padding: 7px 10px;
  font-size: 0.78rem;
  min-height: 48px;
}

.start-hint {
  color: #cbd5e1;
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.25;
}

.error {
  margin: 0;
  color: #fca5a5;
}

.lobby-actions {
  min-width: 0;
  padding-top: 0.7rem;
  padding-bottom: max(0.1rem, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(71, 85, 105, 0.72);
  background: #0b1220;
}

.lobby-primary-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.fill-bots {
  border-color: rgba(250, 204, 21, 0.72);
  background: #3f2f0b;
  color: #fef3c7;
  font-weight: 800;
}

.fill-bots:disabled {
  cursor: wait;
  opacity: 0.72;
}

.invite-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.mode-selection .lobby-actions .primary {
  width: min(18rem, 100%);
  font-size: 1rem;
}

.mode-selection .lobby-primary-actions {
  width: 100%;
}

.waiting-leave-mask {
  position: fixed;
  inset: 0;
  z-index: 125;
  display: grid;
  place-items: center;
  padding: 0.7rem;
  background: rgba(2, 6, 23, 0.76);
}

.waiting-leave-dialog {
  width: min(23rem, calc(100dvw - 1.4rem));
  max-height: calc(100dvh - 1.4rem);
  overflow: auto;
  padding: 1.1rem;
  border-radius: 1.15rem;
  border: 1px solid rgba(148, 163, 184, 0.46);
  background: linear-gradient(160deg, #111827, #020617);
  color: #f8fafc;
  text-align: center;
  box-shadow: 0 20px 48px rgba(2, 6, 23, 0.58);
}

.waiting-leave-dialog:focus-visible {
  outline: 3px solid #7dd3fc;
  outline-offset: 2px;
}

.leave-symbol {
  width: 2.8rem;
  height: 2.8rem;
  margin: 0 auto 0.55rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(127, 29, 29, 0.48);
  color: #fecaca;
  font-size: 1.45rem;
}

.leave-symbol.dissolve {
  background: #991b1b;
  color: #fff1f2;
  font-weight: 900;
}

.waiting-leave-dialog h2,
.waiting-leave-dialog p {
  margin: 0;
}

.waiting-leave-dialog h2 {
  font-size: 1.15rem;
}

.waiting-leave-dialog p {
  margin-top: 0.45rem;
  color: #cbd5e1;
  font-size: 0.9rem;
  line-height: 1.55;
}

.waiting-leave-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  margin-top: 0.9rem;
}

.waiting-leave-actions button {
  min-height: 48px;
  border-radius: 0.72rem;
  border: 1px solid #475569;
  background: #1e293b;
  color: #f8fafc;
  font-size: 0.92rem;
  font-weight: 750;
}

.waiting-leave-actions button.danger {
  border-color: #dc2626;
  background: #b91c1c;
}

.guest-profile-dialog {
  width: min(30rem, calc(100dvw - 1.4rem));
  padding: 0.85rem;
  text-align: left;
}

.guest-profile-dialog-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.guest-profile-dialog-head > span {
  width: 3rem;
  height: 3rem;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #075985;
  color: #fef08a;
  font-size: 0.9rem;
  font-weight: 900;
}

.guest-profile-dialog-head div {
  display: grid;
  gap: 0.05rem;
}

.guest-profile-dialog-head small {
  color: #7dd3fc;
  font-size: 0.82rem;
  font-weight: 750;
}

.guest-profile-dialog h2 {
  font-size: 1.2rem;
}

.guest-profile-dialog .guest-profile-name {
  margin-top: 0.5rem;
  color: #e2e8f0;
  font-size: 0.9rem;
}

.guest-profile-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.55rem;
}

.guest-profile-stats > div {
  min-width: 0;
  padding: 0.48rem 0.3rem;
  display: grid;
  justify-items: center;
  gap: 0.08rem;
  border: 1px solid rgba(56, 189, 248, 0.42);
  border-radius: 0.7rem;
  background: rgba(7, 89, 133, 0.28);
  text-align: center;
}

.guest-profile-stats span {
  color: #fef08a;
  font-size: 1.3rem;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.guest-profile-stats small {
  color: #bae6fd;
  font-size: 0.78rem;
  font-weight: 750;
  white-space: nowrap;
}

.guest-profile-dialog .guest-profile-explanation {
  margin-top: 0.55rem;
  color: #cbd5e1;
  font-size: 0.84rem;
  line-height: 1.4;
}

.guest-profile-close {
  width: 100%;
  min-height: 44px;
  margin-top: 0.6rem;
  border: 1px solid #38bdf8;
  border-radius: 0.72rem;
  background: #0369a1;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 850;
}

@media (max-width:700px) and (pointer:fine) {
  .mode-grid,
  .seat-grid {
    grid-template-columns: 1fr;
  }

  .invite-card {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width:960px), (max-height:500px) {
  .lobby {
    gap: 0.55rem;
    padding: 0.65rem;
  }

  .lobby-scroll {
    gap: 0.55rem;
  }

  .lobby-head h2 {
    font-size: 1.15rem;
  }

  .lobby-rule-tip,
  .invite-card p {
    margin-top: 0.2rem;
    font-size: 0.76rem;
  }

  .mode-grid,
  .seat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .mode-card,
  .seat-card,
  .invite-card,
  .match-status-card,
  .scoring-card {
    padding: 0.62rem;
    border-radius: 11px;
  }

  .mode-card {
    gap: 0.25rem;
  }

  .seat-card {
    min-height: 108px;
    gap: 0.25rem;
  }

  .lobby-actions {
    padding-top: 0.5rem;
  }
}

@media (max-width:720px), (max-height:380px) {
  .lobby {
    gap: 0.4rem;
    padding: 0.5rem;
  }

  .mode-selection {
    gap: 0.2rem;
    padding: 0.3rem;
  }

  .mode-selection .lobby-rule-tip {
    display: none;
  }

  .mode-selection .mode-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .mode-selection .mode-card {
    padding-block: 0.45rem;
  }

  .lobby-scroll {
    gap: 0.4rem;
  }

  .lobby-head-actions {
    gap: 0.35rem;
  }

  .mode-selection .guest-profile-summary {
    min-width: 0;
    min-height: 40px;
    padding: 0.3rem 0.5rem;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .mode-selection .guest-profile-summary-copy {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .mode-selection .guest-profile-summary-copy strong {
    font-size: max(0.875rem, 14px);
  }

  .mode-selection .guest-profile-summary-copy > span {
    font-size: 0.9rem;
  }

  .mode-selection .guest-profile-summary-view {
    font-size: max(0.875rem, 14px);
  }

  .head-action {
    min-height: 42px;
    padding: 0.45rem 0.65rem;
    font-size: 0.78rem;
  }

  .lobby-kicker {
    display: none;
  }

  .mode-head strong {
    font-size: 1.05rem;
  }

  .mode-head span {
    font-size: 0.82rem;
  }

  .mode-card p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.35;
  }

  .match-status-card {
    padding: 0.45rem 0.6rem;
  }

  .match-status-card span {
    display: none;
  }

  .lobby-rule-tip {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .invite-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .scoring-card {
    grid-template-columns: minmax(6.5rem, 0.65fr) minmax(14rem, 1.35fr);
    gap: 0.45rem;
  }

  .scoring-copy p {
    display: none;
  }

  .scoring-options {
    gap: 0.35rem;
  }

  .scoring-options button {
    min-height: 42px;
    padding: 0.28rem 0.42rem;
  }

  .invite-card p {
    display: none;
  }

  .invite-card .ghost {
    min-height: 42px;
    padding: 0.5rem 0.7rem;
  }

  .invite-actions {
    gap: 0.35rem;
  }

  .seat-card {
    min-height: 96px;
  }

  .lobby-actions {
    min-height: 48px;
    padding-top: 0.35rem;
  }

  .friend-waiting-room .lobby-actions {
    justify-content: space-between;
    gap: 0.45rem;
  }

  .friend-waiting-room .lobby-primary-actions {
    flex: 1 1 auto;
    gap: 0.4rem;
  }

  .friend-waiting-room .lobby-primary-actions button {
    flex: 1 1 0;
    min-width: 0;
    min-height: 46px;
    padding: 0.45rem 0.55rem;
    font-size: 0.9375rem;
  }

  .friend-waiting-room .start-hint {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .waiting-leave-dialog {
    width: min(26rem, calc(100dvw - 0.8rem));
    padding: 0.65rem;
  }

  .leave-symbol {
    width: 2rem;
    height: 2rem;
    margin-bottom: 0.25rem;
    font-size: 1.1rem;
  }

  .waiting-leave-dialog p {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .waiting-leave-actions {
    margin-top: 0.5rem;
  }
}

:global(.layout.legacy-compact-viewport .friend-waiting-room) {
  gap: 0.3rem;
  padding: 0.35rem;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .lobby-scroll) {
  gap: 0.3rem;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .lobby-rule-tip) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .invite-card) {
  padding: 0.1rem 0.35rem;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .invite-actions) {
  gap: 0.25rem;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .invite-button) {
  min-height: 42px;
  padding-inline: 0.5rem;
  font-size: 0.76rem;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .lobby-actions) {
  min-height: 46px;
  padding-top: 0.1rem;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .lobby-primary-actions button) {
  min-height: 46px;
  padding-block: 0.4rem;
}
</style>
