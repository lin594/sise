<template>
  <div class="game-tools" data-testid="game-tools">
    <div class="tool-buttons">
      <button
        class="tool-button"
        type="button"
        :aria-label="decisionActive ? '请先完成当前操作，再打开设置' : '牌局设置'"
        :title="decisionActive ? '请先完成当前操作，再打开设置' : '牌局设置'"
        data-testid="game-settings"
        :aria-expanded="settingsOpen"
        :disabled="decisionActive"
        @click="settingsOpen = !settingsOpen"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" />
          <path d="m19.2 13.4 1.3 1-.1 1.5-1.5 1.8-1.6-.5a7.8 7.8 0 0 1-1.8 1l-.3 1.7-1.4.6h-2.5l-.7-1.5a7.8 7.8 0 0 1-2-.6l-1.4.9-1.3-.8-1.2-2.2.9-1.4a7.8 7.8 0 0 1-.2-2.1L4 11.7l.3-1.5 1.3-2 1.7.1a7.8 7.8 0 0 1 1.7-1.2l.1-1.7 1.4-.7H13l.9 1.4a7.8 7.8 0 0 1 1.9.8l1.5-.7 1.2.9 1 2.3-1 1.3c.2.9.3 1.8.1 2.7h.6Z" />
        </svg>
        <span>{{ decisionActive ? "先操作" : "设置" }}</span>
      </button>
      <button
        class="tool-button exit"
        type="button"
        aria-label="退出牌局"
        title="退出牌局"
        data-testid="game-exit"
        @click="confirmingExit = true; settingsOpen = false"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 5H5v14h5" />
          <path d="M13 8l4 4-4 4M8 12h9" />
        </svg>
        <span>退出</span>
      </button>
    </div>

    <Transition name="popover">
      <section
        v-if="settingsOpen"
        class="settings-panel"
        data-testid="settings-panel"
        role="dialog"
        aria-labelledby="settings-panel-title"
      >
        <header>
          <div>
            <small>牌局设置</small>
            <strong id="settings-panel-title">牌面显示</strong>
          </div>
          <button type="button" aria-label="关闭设置" @click="settingsOpen = false">×</button>
        </header>
        <div class="preference-group">
          <div class="preference-copy">
            <strong>我的牌</strong>
            <small>手牌、声明与本人结算</small>
          </div>
          <div class="mode-options" role="radiogroup" aria-label="我的牌显示模式">
            <button
              v-for="mode in cardModes"
              :key="`own-${mode.value}`"
              type="button"
              role="radio"
              :data-testid="`card-mode-own-${mode.value}`"
              :aria-checked="props.modelValue.ownCards === mode.value"
              :class="{ active: props.modelValue.ownCards === mode.value }"
              @click="setCardMode('ownCards', mode.value)"
            >
              <span class="mode-sample" :class="mode.value">{{ mode.sample }}</span>
              <span>{{ mode.label }}</span>
            </button>
          </div>
        </div>
        <div class="preference-group">
          <div class="preference-copy">
            <strong>桌面牌</strong>
            <small>待响、定庄、牌组与流水</small>
          </div>
          <div class="mode-options" role="radiogroup" aria-label="桌面牌显示模式">
            <button
              v-for="mode in cardModes"
              :key="`table-${mode.value}`"
              type="button"
              role="radio"
              :data-testid="`card-mode-table-${mode.value}`"
              :aria-checked="props.modelValue.tableCards === mode.value"
              :class="{ active: props.modelValue.tableCards === mode.value }"
              @click="setCardMode('tableCards', mode.value)"
            >
              <span class="mode-sample" :class="mode.value">{{ mode.sample }}</span>
              <span>{{ mode.label }}</span>
            </button>
          </div>
        </div>
        <div class="preference-group">
          <div class="preference-copy">
            <strong>玩家摆放</strong>
            <small>只调整你看到的左右方向</small>
          </div>
          <div class="direction-options" role="radiogroup" aria-label="玩家摆放方向">
            <button
              type="button"
              role="radio"
              data-testid="seat-direction-clockwise"
              :aria-checked="props.modelValue.seatDirection === 'clockwise'"
              :class="{ active: props.modelValue.seatDirection === 'clockwise' }"
              @click="setSeatDirection('clockwise')"
            >
              <span aria-hidden="true">↻</span>
              <span><strong>顺时针</strong><small>下家在左</small></span>
            </button>
            <button
              type="button"
              role="radio"
              data-testid="seat-direction-counterclockwise"
              :aria-checked="props.modelValue.seatDirection === 'counterclockwise'"
              :class="{ active: props.modelValue.seatDirection === 'counterclockwise' }"
              @click="setSeatDirection('counterclockwise')"
            >
              <span aria-hidden="true">↺</span>
              <span><strong>逆时针</strong><small>下家在右</small></span>
            </button>
          </div>
        </div>
        <div class="preference-group">
          <div class="preference-copy">
            <strong>轮到我提醒</strong>
            <small>每个操作窗口只提醒一次</small>
          </div>
          <div class="alert-options" role="radiogroup" aria-label="轮到我提醒方式">
            <button
              v-for="mode in alertModes"
              :key="mode.value"
              type="button"
              role="radio"
              :data-testid="`turn-alert-${mode.value}`"
              :aria-checked="props.modelValue.turnAlert === mode.value"
              :class="{ active: props.modelValue.turnAlert === mode.value }"
              @click="setTurnAlert(mode.value)"
            >
              <span aria-hidden="true">{{ mode.icon }}</span>
              <span>{{ mode.label }}</span>
            </button>
          </div>
        </div>
        <button class="rules-entry" type="button" data-testid="settings-rules" @click="openRules">
          <span>规则速查</span><span aria-hidden="true">›</span>
        </button>
      </section>
    </Transition>

    <Teleport to="body">
      <div v-if="confirmingExit" class="exit-confirm-mask" @click.self="confirmingExit = false">
        <section class="exit-confirm" role="dialog" aria-modal="true" aria-labelledby="exit-confirm-title">
          <div class="exit-symbol" aria-hidden="true">↗</div>
          <h2 id="exit-confirm-title">退出当前牌局？</h2>
          <p>退出后你的座位会由机器人接管，你将返回游戏模式大厅。</p>
          <div class="exit-actions">
            <button type="button" data-testid="cancel-exit" @click="confirmingExit = false">继续游戏</button>
            <button class="danger" type="button" data-testid="confirm-exit" @click="confirmExit">确认退出</button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { CardDisplayMode, GameDisplayPreferences, SeatDirection, TurnAlertMode } from "@/types/game";

const props = defineProps<{
  modelValue: GameDisplayPreferences;
  decisionActive?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [preferences: GameDisplayPreferences];
  openRules: [];
  exit: [];
}>();

const settingsOpen = ref(false);
const confirmingExit = ref(false);
const cardModes: Array<{ value: CardDisplayMode; label: string; sample: string }> = [
  { value: "large", label: "大字", sample: "帅" },
  { value: "adaptive", label: "自适应", sample: "自" },
  { value: "long", label: "长牌", sample: "帥" },
];
const alertModes: Array<{ value: TurnAlertMode; label: string; icon: string }> = [
  { value: "sound-vibration", label: "响铃+震动", icon: "♪" },
  { value: "sound", label: "仅响铃", icon: "♫" },
  { value: "off", label: "关闭", icon: "—" },
];

watch(
  () => props.decisionActive,
  (active) => {
    if (active) {
      settingsOpen.value = false;
    }
  },
);

function setCardMode(key: "ownCards" | "tableCards", mode: CardDisplayMode): void {
  emit("update:modelValue", { ...props.modelValue, [key]: mode });
}

function setSeatDirection(direction: SeatDirection): void {
  emit("update:modelValue", { ...props.modelValue, seatDirection: direction });
}

function setTurnAlert(turnAlert: TurnAlertMode): void {
  emit("update:modelValue", { ...props.modelValue, turnAlert });
}

function openRules(): void {
  settingsOpen.value = false;
  emit("openRules");
}

function confirmExit(): void {
  confirmingExit.value = false;
  emit("exit");
}
</script>

<style scoped>
.game-tools {
  position: relative;
  z-index: 2;
  margin-left: auto;
}

.tool-buttons {
  display: flex;
  justify-content: flex-end;
  gap: clamp(0.3rem, 0.8vh, 0.5rem);
}

.tool-button {
  min-width: clamp(4.25rem, 9vw, 5.25rem);
  height: clamp(2.15rem, 6.2vh, 2.55rem);
  padding: 0.35rem 0.62rem;
  border-radius: 0.72rem;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.84);
  color: #e2e8f0;
  box-shadow: 0 5px 16px rgba(2, 6, 23, 0.34);
  backdrop-filter: blur(10px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-weight: 750;
  font-size: clamp(0.76rem, 1.7vh, 0.9rem);
}

.tool-button:hover,
.tool-button[aria-expanded="true"] {
  border-color: rgba(56, 189, 248, 0.82);
  color: #bae6fd;
}

.tool-button.exit:hover {
  border-color: rgba(248, 113, 113, 0.82);
  color: #fecaca;
}

.tool-button:disabled {
  cursor: not-allowed;
  border-color: rgba(250, 204, 21, 0.62);
  background: #172033;
  color: #fde68a;
  opacity: 1;
}

.tool-button svg {
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-panel {
  position: absolute;
  top: calc(100% + 0.42rem);
  right: 0;
  width: min(18rem, calc(100dvw - 1rem));
  max-height: calc(100dvh - var(--game-header-height, 3rem) - 0.8rem);
  overflow: auto;
  padding: 0.8rem;
  border-radius: 1rem;
  border: 1px solid rgba(71, 85, 105, 0.9);
  background: #080f1d;
  color: #e2e8f0;
  box-shadow: 0 16px 36px rgba(2, 6, 23, 0.48);
  backdrop-filter: blur(14px);
}

.settings-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.7rem;
}

.settings-panel header div,
.preference-copy {
  display: grid;
  gap: 0.12rem;
  text-align: left;
}

.settings-panel small {
  color: #94a3b8;
  font-size: 0.78rem;
}

.settings-panel header strong {
  font-size: 1rem;
}

.settings-panel header button {
  width: 2.75rem;
  height: 2.75rem;
  min-width: 42px;
  min-height: 42px;
  border: 0;
  border-radius: 50%;
  background: rgba(30, 41, 59, 0.78);
  color: #cbd5e1;
  font-size: 1.25rem;
}

.preference-group {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.65rem;
}

.preference-copy {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 0.55rem;
}

.preference-copy strong {
  font-size: 0.92rem;
}

.mode-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.alert-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.mode-options button,
.direction-options button,
.alert-options button,
.rules-entry {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(71, 85, 105, 0.78);
  background: rgba(15, 23, 42, 0.76);
  color: #e2e8f0;
}

.alert-options button {
  min-width: 0;
  padding: 0.38rem 0.2rem;
  display: grid;
  place-items: center;
  gap: 0.08rem;
  font-size: 0.76rem;
  font-weight: 750;
}

.alert-options button > span:first-child {
  color: #fbbf24;
  font-size: 1rem;
  line-height: 1;
}

.alert-options button.active {
  border-color: rgba(56, 189, 248, 0.88);
  background: rgba(8, 47, 73, 0.78);
}

.mode-options button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.24rem;
  padding: 0.35rem 0.2rem;
  font-size: 0.82rem;
  font-weight: 750;
}

.mode-options button.active {
  border-color: rgba(56, 189, 248, 0.88);
  background: rgba(8, 47, 73, 0.78);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.2) inset;
}

.direction-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}

.direction-options button {
  min-height: 2.85rem;
  padding: 0.3rem 0.45rem;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.42rem;
  text-align: left;
}

.direction-options button > span:first-child {
  color: #fbbf24;
  font-size: 1.3rem;
  line-height: 1;
}

.direction-options button > span:last-child {
  display: grid;
  gap: 0.05rem;
}

.direction-options button > span:last-child small {
  font-size: 0.78rem;
}

.direction-options button.active {
  border-color: rgba(56, 189, 248, 0.88);
  background: rgba(8, 47, 73, 0.78);
}

.mode-sample {
  width: 1.75rem;
  height: 1.75rem;
  display: inline-grid;
  place-items: center;
  border-radius: 0.48rem;
  font-weight: 900;
}

.mode-sample.large {
  background: #facc15;
  color: #422006;
}

.mode-sample.long {
  width: 1.05rem;
  justify-self: center;
  border: 2px solid #b91c1c;
  background: #fff7ed;
  color: #991b1b;
}

.mode-sample.adaptive {
  background: linear-gradient(135deg, #facc15 0 48%, #fff7ed 48% 100%);
  color: #172033;
  border: 1px solid rgba(148, 163, 184, 0.65);
}

.rules-entry {
  margin-top: 0.62rem;
  padding: 0.45rem 0.65rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
}

.popover-enter-active,
.popover-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-0.3rem) scale(0.97);
}

.exit-confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 0.7rem;
  background: rgba(2, 6, 23, 0.72);
}

.exit-confirm {
  width: min(22rem, calc(100dvw - 1.4rem));
  padding: 1.1rem;
  border-radius: 1.15rem;
  border: 1px solid rgba(148, 163, 184, 0.46);
  background: linear-gradient(160deg, #111827, #020617);
  color: #f8fafc;
  text-align: center;
  box-shadow: 0 20px 48px rgba(2, 6, 23, 0.58);
}

.exit-symbol {
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

.exit-confirm h2,
.exit-confirm p {
  margin: 0;
}

.exit-confirm h2 {
  font-size: 1.15rem;
}

.exit-confirm p {
  margin-top: 0.45rem;
  color: #cbd5e1;
  font-size: 0.86rem;
  line-height: 1.55;
}

.exit-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  margin-top: 0.9rem;
}

.exit-actions button {
  min-height: 2.65rem;
  border-radius: 0.72rem;
  border: 1px solid #475569;
  background: #1e293b;
  color: #f8fafc;
  font-weight: 750;
}

.exit-actions button.danger {
  border-color: #dc2626;
  background: #b91c1c;
}

@media (max-width: 960px), (max-height: 500px) {
  .settings-panel {
    width: min(16rem, calc(100dvw - 0.5rem));
    padding: 0.6rem;
  }

  .tool-button {
    min-width: clamp(3.85rem, 10vw, 4.6rem);
    height: clamp(2.05rem, 9.5vh, 2.4rem);
    padding-inline: 0.5rem;
  }

  .mode-options button {
    min-height: 3.15rem;
  }

  .mode-sample {
    width: 1.7rem;
    height: 1.7rem;
  }

  .exit-confirm {
    padding: 0.8rem;
  }
}
</style>
