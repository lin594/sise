<template>
  <section
    class="lobby"
    :class="{
      'friend-waiting-room': roomMode === 'friends' && Boolean(roomId),
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
        <button v-if="roomId" class="ghost head-action" type="button" @click="$emit('open-rules')">查看规则</button>
        <button
          v-if="roomMode === 'friends' && roomId"
          ref="leaveButtonRef"
          class="ghost head-action leave-room"
          type="button"
          data-testid="leave-waiting-room"
          @click="requestLeaveRoom"
        >
          离开房间
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
          <p>复制邀请链接给朋友；链接不会包含你的身份凭据。</p>
        </div>
        <button class="ghost" type="button" data-testid="copy-invite" @click="$emit('copy-invite')">复制邀请链接</button>
      </div>

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
            <span v-if="slot.player?.clientId === hostPlayerId">
              {{ slot.player?.clientId === mySeatId ? "房主 · 你" : "房主" }}
            </span>
            <span v-else-if="slot.player?.clientId === mySeatId">你</span>
          </div>

          <template v-if="slot.player">
            <p class="player-name">{{ slot.player.name }}</p>
            <small v-if="slot.player.isConfiguredBot">机器人 · {{ botLevelForStrength(slot.player.botStrength).label }}</small>
            <small v-else>{{ slot.player.connected ? "真人在线" : "真人离线（座位暂留）" }}</small>

            <template v-if="slot.player.isConfiguredBot && isHost">
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
              v-else-if="isHost && slot.player.clientId !== hostPlayerId"
              class="danger mini"
              type="button"
              @click="$emit('remove-seat', slot.seatIndex)"
            >
              移出玩家
            </button>
          </template>

          <template v-else>
            <p class="empty-label">等待入座</p>
            <div class="seat-actions">
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

      <p v-if="joinError" class="error" role="alert">{{ joinError }}</p>
    </div>

    <div class="lobby-actions">
      <div class="lobby-primary-actions">
        <button
          v-if="showFillBots"
          class="ghost fill-bots"
          type="button"
          data-testid="fill-bots"
          :disabled="fillRequested"
          @click="requestFillBots"
        >
          {{ fillRequested ? "正在补齐…" : `补齐 ${emptySeatCount} 位电脑` }}
        </button>
        <button
          ref="startButtonRef"
          class="primary"
          type="button"
          data-testid="lobby-start"
          :disabled="!canStart"
          @click="$emit('start')"
        >
          {{ startLabel }}
        </button>
      </div>
      <span v-if="startHint" class="start-hint" role="status" aria-live="polite">{{ startHint }}</span>
    </div>

    <Teleport to=".layout">
      <div
        v-if="confirmingLeave"
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
          <div class="leave-symbol" aria-hidden="true">↩</div>
          <h2 id="waiting-leave-title">离开当前好友房？</h2>
          <p id="waiting-leave-description">{{ leaveRoomDescription }}</p>
          <div class="waiting-leave-actions">
            <button ref="leaveCancelButtonRef" type="button" data-testid="cancel-waiting-leave" @click="cancelLeaveRoom">继续等待</button>
            <button class="danger" type="button" data-testid="confirm-waiting-leave" @click="confirmLeaveRoom">确认离开</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

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
  connected: boolean;
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
  roomMode: "practice" | "friends" | "";
  players: LobbyPlayer[];
}>();

const seatNames = ["首席", "二席", "三席", "四席"];
const botLevels = [
  { id: "easy", label: "轻松", strength: 20 },
  { id: "standard", label: "标准", strength: 50 },
  { id: "expert", label: "高手", strength: 85 },
] as const;
const emit = defineEmits<{
  "open-rules": [];
  start: [];
  "select-mode": [modeId: string];
  "copy-invite": [];
  "claim-seat": [seatIndex: number];
  "add-bot": [seatIndex: number];
  "fill-bots": [];
  "update-bot": [seatIndex: number, strength: number];
  "remove-seat": [seatIndex: number];
  "leave-room": [];
}>();
const confirmingLeave = ref(false);
const fillRequested = ref(false);
const leaveButtonRef = ref<HTMLButtonElement | null>(null);
const startButtonRef = ref<HTMLButtonElement | null>(null);
const lobbyTitleRef = ref<HTMLHeadingElement | null>(null);
const leaveDialogRef = ref<HTMLElement | null>(null);
const leaveCancelButtonRef = ref<HTMLButtonElement | null>(null);
let fillRequestTimer: number | null = null;
const leaveRoomDescription = computed(() => {
  if (props.isHost) {
    return "如果还有真人，房主会自动转交；如果只剩你，房间会关闭。你将返回游戏模式大厅。";
  }
  if (props.mySeatId) {
    return "你的座位会被释放，你将返回游戏模式大厅。";
  }
  return "你还没有入座，将返回游戏模式大厅。";
});
const seatSlots = computed(() =>
  Array.from({ length: 4 }, (_, seatIndex) => ({
    seatIndex,
    player: props.players.find((player) => player.seatIndex === seatIndex) ?? null,
  })),
);
const emptySeatCount = computed(() => seatSlots.value.filter((slot) => !slot.player).length);
const showFillBots = computed(
  () => props.roomMode === "friends" && Boolean(props.roomId) && props.isHost && emptySeatCount.value > 0,
);

watch(
  () => [emptySeatCount.value, props.canStart, props.joinError] as const,
  async ([emptySeats, canStart, joinError]) => {
    if (joinError && fillRequested.value) {
      clearFillRequestState();
      return;
    }
    if (!fillRequested.value || emptySeats !== 0) {
      return;
    }
    clearFillRequestState();
    await nextTick();
    if (canStart) {
      startButtonRef.value?.focus();
    } else {
      lobbyTitleRef.value?.focus();
    }
  },
);

onUnmounted(() => clearFillRequestState());

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
  emit("fill-bots");
  fillRequestTimer = window.setTimeout(() => {
    fillRequested.value = false;
    fillRequestTimer = null;
  }, 5_000);
}

async function requestLeaveRoom(): Promise<void> {
  confirmingLeave.value = true;
  await nextTick();
  leaveCancelButtonRef.value?.focus();
}

async function cancelLeaveRoom(): Promise<void> {
  if (!confirmingLeave.value) {
    return;
  }
  confirmingLeave.value = false;
  await nextTick();
  leaveButtonRef.value?.focus();
}

function confirmLeaveRoom(): void {
  confirmingLeave.value = false;
  emit("leave-room");
}

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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.mode-card,
.seat-card,
.invite-card {
  border: 1px solid #334155;
  border-radius: 14px;
  background: linear-gradient(180deg, #172033 0%, #0f172a 100%);
  color: #e2e8f0;
  padding: 0.9rem;
}

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

.ghost {
  background: #1f2937;
  color: #e2e8f0;
  border: 1px solid #334155;
}

.leave-room {
  border-color: rgba(248, 113, 113, 0.62);
  color: #fecaca;
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
  .invite-card {
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
    gap: 0.3rem;
    padding: 0.4rem;
  }

  .mode-selection .lobby-rule-tip {
    display: none;
  }

  .lobby-scroll {
    gap: 0.4rem;
  }

  .lobby-head-actions {
    gap: 0.35rem;
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

  .invite-card p {
    display: none;
  }

  .invite-card .ghost {
    min-height: 42px;
    padding: 0.5rem 0.7rem;
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

:global(.layout.legacy-compact-viewport .friend-waiting-room .lobby-actions) {
  min-height: 46px;
  padding-top: 0.1rem;
}

:global(.layout.legacy-compact-viewport .friend-waiting-room .lobby-primary-actions button) {
  min-height: 46px;
  padding-block: 0.4rem;
}
</style>
