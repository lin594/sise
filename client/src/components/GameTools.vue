<template>
  <div ref="gameToolsRef" class="game-tools" data-testid="game-tools">
    <div class="tool-buttons">
      <button
        ref="historyButtonRef"
        class="tool-button history"
        type="button"
        :aria-label="historyButtonLabel"
        title="回看本局最近操作"
        data-testid="game-history"
        aria-controls="game-history-panel"
        :aria-expanded="historyOpen"
        @click="toggleHistory"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h11M4 12h11M4 17h8" />
          <path d="M18 14v5l3-2.5L18 14Z" />
        </svg>
        <span>记录</span>
        <span v-if="historyItems.length" class="history-count" aria-hidden="true">{{ historyCountText }}</span>
      </button>
      <button
        ref="settingsButtonRef"
        class="tool-button settings"
        type="button"
        :aria-label="decisionActive ? '完成当前操作后可打开设置' : '牌局设置'"
        :title="decisionActive ? '完成当前操作后可打开设置' : '牌局设置'"
        data-testid="game-settings"
        aria-controls="game-settings-panel"
        :aria-expanded="settingsOpen"
        :disabled="decisionActive"
        @click="toggleSettings"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" />
          <path d="m19.2 13.4 1.3 1-.1 1.5-1.5 1.8-1.6-.5a7.8 7.8 0 0 1-1.8 1l-.3 1.7-1.4.6h-2.5l-.7-1.5a7.8 7.8 0 0 1-2-.6l-1.4.9-1.3-.8-1.2-2.2.9-1.4a7.8 7.8 0 0 1-.2-2.1L4 11.7l.3-1.5 1.3-2 1.7.1a7.8 7.8 0 0 1 1.7-1.2l.1-1.7 1.4-.7H13l.9 1.4a7.8 7.8 0 0 1 1.9.8l1.5-.7 1.2.9 1 2.3-1 1.3c.2.9.3 1.8.1 2.7h.6Z" />
        </svg>
        <span>设置</span>
      </button>
      <button
        ref="autoPlayButtonRef"
        class="tool-button auto-play"
        :class="{ active: props.autoPlay }"
        type="button"
        :aria-label="props.autoPlay ? '取消托管，恢复自己操作' : '开启托管，让机器人代为操作'"
        :title="props.autoPlay ? '取消托管' : '开启托管'"
        :aria-pressed="props.autoPlay"
        :disabled="props.autoPlayPending"
        data-testid="game-auto-play"
        @click="requestAutoPlayChange"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 7h8a4 4 0 0 1 4 4v7H4v-7a4 4 0 0 1 4-4Z" />
          <path d="M12 4v3M9 12h.01M15 12h.01M8 18v2M16 18v2" />
        </svg>
        <span>{{ props.autoPlay ? "取消托管" : "托管" }}</span>
      </button>
      <button
        ref="exitButtonRef"
        class="tool-button exit"
        type="button"
        aria-label="退出牌局"
        title="退出牌局"
        data-testid="game-exit"
        @click="requestExit"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 5H5v14h5" />
          <path d="M13 8l4 4-4 4M8 12h9" />
        </svg>
        <span>退出</span>
      </button>
    </div>

    <Transition name="popover">
      <div
        v-if="historyOpen || settingsOpen"
        class="tools-popover-backdrop"
        data-testid="tools-popover-backdrop"
        aria-hidden="true"
        @click="closeOpenPopover"
      ></div>
    </Transition>

    <Transition name="popover">
      <section
        v-if="historyOpen"
        id="game-history-panel"
        ref="historyPanelRef"
        class="history-panel"
        data-testid="history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-panel-title"
        aria-describedby="history-panel-description"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeHistory()"
        @keydown.tab="trapHistoryFocus"
      >
        <header>
          <div>
            <small>没看清刚才发生了什么？</small>
            <strong id="history-panel-title">最近操作</strong>
          </div>
          <button type="button" aria-label="关闭最近操作" data-testid="close-history" @click="closeHistory()">×</button>
        </header>
        <p id="history-panel-description" class="history-description">本局最新记录排在最前；查看时牌局计时仍会继续。</p>
        <ol v-if="historyItems.length" class="history-list">
          <li
            v-for="item in historyItems"
            :key="item.id"
            data-testid="history-entry"
            :aria-label="`${item.at}，${item.actor}${item.action}`"
          >
            <time>{{ item.at }}</time>
            <p>
              <strong>{{ item.actor }}</strong>
              <span>{{ item.action }}</span>
            </p>
          </li>
        </ol>
        <div v-else class="history-empty" data-testid="history-empty">
          <span aria-hidden="true">◎</span>
          <p><strong>还没有可回看的操作</strong><small>正式开局后，出牌、吃碰开和系统托管会记录在这里。</small></p>
        </div>
      </section>
    </Transition>

    <Transition name="popover">
      <section
        v-if="settingsOpen"
        id="game-settings-panel"
        ref="settingsPanelRef"
        class="settings-panel"
        data-testid="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeSettings()"
        @keydown.tab="trapSettingsFocus"
        @scroll.passive="updateSettingsScrollState"
      >
        <header>
          <div>
            <small>牌局设置</small>
            <strong id="settings-panel-title">牌面显示</strong>
          </div>
          <button type="button" aria-label="关闭设置" @click="closeSettings()">×</button>
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
        <button
          class="setting-switch"
          type="button"
          role="switch"
          data-testid="spoken-turn-guidance"
          :disabled="!props.spokenTurnGuidanceSupported"
          :aria-checked="props.spokenTurnGuidanceSupported && props.modelValue.spokenTurnGuidance"
          @click="setSpokenTurnGuidance(!props.modelValue.spokenTurnGuidance)"
        >
          <span>
            <strong>语音提示轮到我</strong>
            <small>{{ props.spokenTurnGuidanceSupported ? "轮到你时读出下一步" : "此浏览器不支持语音" }}</small>
          </span>
          <span
            class="switch-state"
            :class="{ active: props.spokenTurnGuidanceSupported && props.modelValue.spokenTurnGuidance }"
          >
            {{ !props.spokenTurnGuidanceSupported ? "不可用" : props.modelValue.spokenTurnGuidance ? "开启" : "关闭" }}
          </span>
        </button>
        <button
          class="setting-switch"
          type="button"
          role="switch"
          data-testid="reduce-motion"
          :aria-checked="props.modelValue.reduceMotion"
          @click="setReduceMotion(!props.modelValue.reduceMotion)"
        >
          <span>
            <strong>减少动态效果</strong>
            <small>关闭飞牌、翻转和循环闪动</small>
          </span>
          <span class="switch-state" :class="{ active: props.modelValue.reduceMotion }">
            {{ props.modelValue.reduceMotion ? "开启" : "关闭" }}
          </span>
        </button>
        <button
          class="setting-switch"
          type="button"
          role="switch"
          data-testid="keep-screen-awake"
          :disabled="!props.screenWakeLockSupported"
          :aria-checked="props.screenWakeLockSupported && props.modelValue.keepScreenAwake"
          @click="setKeepScreenAwake(!props.modelValue.keepScreenAwake)"
        >
          <span>
            <strong>牌局中屏幕常亮</strong>
            <small>{{ props.screenWakeLockSupported ? "切到后台或牌局结束会自动释放" : "当前环境不支持屏幕常亮" }}</small>
          </span>
          <span
            class="switch-state"
            :class="{ active: props.screenWakeLockSupported && props.modelValue.keepScreenAwake }"
          >
            {{ !props.screenWakeLockSupported ? "不可用" : props.modelValue.keepScreenAwake ? "开启" : "关闭" }}
          </span>
        </button>
        <button class="rules-entry" type="button" data-testid="settings-rules" @click="openRules">
          <span>规则速查</span><span aria-hidden="true">›</span>
        </button>
        <p
          class="settings-scroll-hint"
          :class="{ hidden: !settingsCanScrollForward }"
          data-testid="settings-scroll-hint"
          aria-hidden="true"
        >↓ 下滑查看更多设置</p>
      </section>
    </Transition>

    <Teleport to=".layout">
      <div v-if="confirmingAutoPlay" class="exit-confirm-mask" @click.self="cancelAutoPlay">
        <section
          ref="autoPlayDialogRef"
          class="exit-confirm auto-play-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auto-play-confirm-title"
          aria-describedby="auto-play-confirm-description"
          tabindex="-1"
          @keydown.esc.stop.prevent="cancelAutoPlay"
          @keydown.tab="trapAutoPlayFocus"
        >
          <div class="exit-symbol auto-play-symbol" aria-hidden="true">机</div>
          <h2 id="auto-play-confirm-title">让机器人替你操作？</h2>
          <p id="auto-play-confirm-description">开启后机器人会自动选牌和出牌。顶部会一直显示“取消托管”，你可以随时拿回操作。</p>
          <div class="exit-actions">
            <button ref="cancelAutoPlayButtonRef" type="button" data-testid="cancel-auto-play" @click="cancelAutoPlay">暂不开启</button>
            <button class="auto-play-accept" type="button" data-testid="confirm-auto-play" @click="confirmAutoPlay">开启托管</button>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to=".layout">
      <div v-if="confirmingExit" class="exit-confirm-mask" @click.self="cancelExit">
        <section
          ref="exitDialogRef"
          class="exit-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-confirm-title"
          aria-describedby="exit-confirm-description"
          tabindex="-1"
          @keydown.esc.stop.prevent="cancelExit"
          @keydown.tab="trapExitFocus"
        >
          <div class="exit-symbol" aria-hidden="true">↗</div>
          <h2 id="exit-confirm-title">退出当前牌局？</h2>
          <p id="exit-confirm-description">退出后你的座位会由机器人接管，你将返回游戏模式大厅。</p>
          <div class="exit-actions">
            <button ref="cancelExitButtonRef" type="button" data-testid="cancel-exit" @click="cancelExit">继续游戏</button>
            <button class="danger" type="button" data-testid="confirm-exit" @click="confirmExit">确认退出</button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type {
  CardDisplayMode,
  GameDisplayPreferences,
  ParsedActionLog,
  PlayerState,
  SeatDirection,
  TurnAlertMode,
} from "@/types/game";

const props = withDefaults(
  defineProps<{
    modelValue: GameDisplayPreferences;
    decisionActive?: boolean;
    actionLogs?: ParsedActionLog[];
    players?: PlayerState[];
    mySeatId?: string;
    autoPlay?: boolean;
    autoPlayPending?: boolean;
    spokenTurnGuidanceSupported?: boolean;
    screenWakeLockSupported?: boolean;
  }>(),
  {
    decisionActive: false,
    actionLogs: () => [],
    players: () => [],
    mySeatId: "",
    autoPlay: false,
    autoPlayPending: false,
    spokenTurnGuidanceSupported: false,
    screenWakeLockSupported: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [preferences: GameDisplayPreferences];
  openRules: [];
  exit: [];
  setAutoPlay: [enabled: boolean];
}>();

const gameToolsRef = ref<HTMLElement | null>(null);
const historyButtonRef = ref<HTMLButtonElement | null>(null);
const historyPanelRef = ref<HTMLElement | null>(null);
const historyOpen = ref(false);
const settingsButtonRef = ref<HTMLButtonElement | null>(null);
const settingsPanelRef = ref<HTMLElement | null>(null);
const settingsOpen = ref(false);
const settingsCanScrollForward = ref(false);
let settingsResizeObserver: ResizeObserver | null = null;
const confirmingAutoPlay = ref(false);
const autoPlayButtonRef = ref<HTMLButtonElement | null>(null);
const autoPlayDialogRef = ref<HTMLElement | null>(null);
const cancelAutoPlayButtonRef = ref<HTMLButtonElement | null>(null);
const confirmingExit = ref(false);
const exitButtonRef = ref<HTMLButtonElement | null>(null);
const exitDialogRef = ref<HTMLElement | null>(null);
const cancelExitButtonRef = ref<HTMLButtonElement | null>(null);
let exitReturnFocus: HTMLElement | null = null;
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
const historyItems = computed(() =>
  props.actionLogs
    .filter((log) => Boolean(log.displayText))
    .slice(0, 16)
    .map((log) => {
      const player = props.players.find((candidate) => candidate.clientId === log.actorId);
      const identity = player?.isConfiguredBot
        ? "（机器人）"
        : player?.clientId === props.mySeatId
          ? player.isBot || player.isAutoPlay ? "（你·托管中）" : "（你）"
          : player?.isBot || player?.isAutoPlay ? "（托管中）" : "";
      return {
        id: log.id,
        at: log.at,
        actor: player ? `${player.name}${identity}` : log.actorId ? "一位玩家" : "系统",
        action: formattedHistoryAction(log),
      };
    }),
);
const historyCountText = computed(() => (historyItems.value.length > 99 ? "99+" : String(historyItems.value.length)));
const historyButtonLabel = computed(() =>
  historyItems.value.length
    ? `最近操作，共${historyItems.value.length}条`
    : "最近操作，暂无记录",
);

function formattedHistoryAction(log: ParsedActionLog): string {
  const card = log.cardLabel;
  if (!card) {
    return log.displayText;
  }
  const withCard: Partial<Record<string, string>> = {
    DISCARD: `打出 ${card}`,
    PENG: `碰 ${card}`,
    CHI: `吃 ${card}`,
    KAI: `开 ${card}`,
    HU: `以 ${card} 胡牌`,
    ZHUA: `抓到 ${card}`,
    PASS: `把 ${card} 让给下家`,
    TIMEOUT_PASS: `超时，系统自动过（${card}）`,
    TIMEOUT_DISCARD: `超时，系统自动打出 ${card}`,
    FORCE_TAKE: `吃 ${card}`,
    DRAW_GENERAL: `摸取公共将 ${card}`,
    DEALER: `以 ${card} 定为庄家`,
    DEALER_PICK: `翻开定庄牌 ${card}`,
    DEALER_CARD: `定庄牌 ${card} 揭晓`,
  };
  return withCard[log.actionKey] ?? log.displayText;
}

watch(
  () => props.decisionActive,
  (active) => {
    if (active) {
      removeSettingsOutsideListener();
      stopObservingSettingsScroll();
      settingsOpen.value = false;
      historyOpen.value = false;
    }
  },
);

async function toggleSettings(): Promise<void> {
  if (settingsOpen.value) {
    closeSettings();
    return;
  }
  closeHistory(false);
  settingsOpen.value = true;
  await nextTick();
  observeSettingsScroll();
  settingsPanelRef.value?.focus();
  document.addEventListener("pointerdown", handleSettingsOutsidePointer);
}

async function toggleHistory(): Promise<void> {
  if (historyOpen.value) {
    closeHistory();
    return;
  }
  closeSettings(false);
  historyOpen.value = true;
  await nextTick();
  historyPanelRef.value?.focus();
  document.addEventListener("pointerdown", handleSettingsOutsidePointer);
}

function closeOpenPopover(): void {
  if (historyOpen.value) {
    closeHistory();
    return;
  }
  closeSettings();
}

function closeHistory(restoreFocus = true): void {
  if (!historyOpen.value) {
    return;
  }
  removeSettingsOutsideListener();
  historyOpen.value = false;
  if (restoreFocus) {
    void nextTick(() => historyButtonRef.value?.focus());
  }
}

function closeSettings(restoreFocus = true): void {
  if (!settingsOpen.value) {
    return;
  }
  removeSettingsOutsideListener();
  stopObservingSettingsScroll();
  settingsOpen.value = false;
  if (restoreFocus) {
    void nextTick(() => settingsButtonRef.value?.focus());
  }
}

function handleSettingsOutsidePointer(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node) || gameToolsRef.value?.contains(target)) {
    return;
  }
  if (settingsOpen.value) {
    closeSettings();
  }
  if (historyOpen.value) {
    closeHistory();
  }
}

function removeSettingsOutsideListener(): void {
  document.removeEventListener("pointerdown", handleSettingsOutsidePointer);
}

function updateSettingsScrollState(): void {
  const panel = settingsPanelRef.value;
  settingsCanScrollForward.value = Boolean(
    panel && panel.scrollTop < panel.scrollHeight - panel.clientHeight - 2,
  );
}

function stopObservingSettingsScroll(): void {
  settingsResizeObserver?.disconnect();
  settingsResizeObserver = null;
  settingsCanScrollForward.value = false;
}

function observeSettingsScroll(): void {
  stopObservingSettingsScroll();
  const panel = settingsPanelRef.value;
  if (!panel) {
    return;
  }
  if (typeof ResizeObserver !== "undefined") {
    settingsResizeObserver = new ResizeObserver(updateSettingsScrollState);
    settingsResizeObserver.observe(panel);
  }
  updateSettingsScrollState();
}

function trapSettingsFocus(event: KeyboardEvent): void {
  trapPanelFocus(event, settingsPanelRef.value);
}

function trapHistoryFocus(event: KeyboardEvent): void {
  trapPanelFocus(event, historyPanelRef.value);
}

function trapPanelFocus(event: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) {
    return;
  }
  const focusable = Array.from(
    panel.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setCardMode(key: "ownCards" | "tableCards", mode: CardDisplayMode): void {
  emit("update:modelValue", { ...props.modelValue, [key]: mode });
}

function setSeatDirection(direction: SeatDirection): void {
  emit("update:modelValue", { ...props.modelValue, seatDirection: direction });
}

function setTurnAlert(turnAlert: TurnAlertMode): void {
  emit("update:modelValue", { ...props.modelValue, turnAlert });
}

function setSpokenTurnGuidance(spokenTurnGuidance: boolean): void {
  if (!props.spokenTurnGuidanceSupported) {
    return;
  }
  emit("update:modelValue", { ...props.modelValue, spokenTurnGuidance });
}

function setKeepScreenAwake(keepScreenAwake: boolean): void {
  if (!props.screenWakeLockSupported) {
    return;
  }
  emit("update:modelValue", { ...props.modelValue, keepScreenAwake });
}

function setReduceMotion(reduceMotion: boolean): void {
  emit("update:modelValue", { ...props.modelValue, reduceMotion });
}

function openRules(): void {
  removeSettingsOutsideListener();
  stopObservingSettingsScroll();
  settingsOpen.value = false;
  historyOpen.value = false;
  emit("openRules");
}

async function requestAutoPlayChange(): Promise<void> {
  if (props.autoPlayPending) {
    return;
  }
  removeSettingsOutsideListener();
  stopObservingSettingsScroll();
  settingsOpen.value = false;
  historyOpen.value = false;
  if (props.autoPlay) {
    emit("setAutoPlay", false);
    return;
  }
  confirmingAutoPlay.value = true;
  await nextTick();
  installConfirmationFocusGuard();
  cancelAutoPlayButtonRef.value?.focus();
}

async function cancelAutoPlay(): Promise<void> {
  confirmingAutoPlay.value = false;
  removeConfirmationFocusGuard();
  await nextTick();
  autoPlayButtonRef.value?.focus();
}

function confirmAutoPlay(): void {
  confirmingAutoPlay.value = false;
  removeConfirmationFocusGuard();
  emit("setAutoPlay", true);
}

function trapAutoPlayFocus(event: KeyboardEvent): void {
  trapPanelFocus(event, autoPlayDialogRef.value);
}

function keepConfirmationFocus(event: FocusEvent): void {
  const isExitConfirmation = confirmingExit.value;
  const dialog = isExitConfirmation ? exitDialogRef.value : autoPlayDialogRef.value;
  if (!dialog) {
    return;
  }
  const target = event.target;
  if (target instanceof Node && dialog.contains(target)) {
    return;
  }
  const safeChoice = isExitConfirmation
    ? cancelExitButtonRef.value
    : cancelAutoPlayButtonRef.value;
  (safeChoice ?? dialog).focus({ preventScroll: true });
}

function installConfirmationFocusGuard(): void {
  document.addEventListener("focusin", keepConfirmationFocus, true);
}

function removeConfirmationFocusGuard(): void {
  document.removeEventListener("focusin", keepConfirmationFocus, true);
}

async function requestExit(): Promise<void> {
  exitReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : exitButtonRef.value;
  removeSettingsOutsideListener();
  stopObservingSettingsScroll();
  settingsOpen.value = false;
  historyOpen.value = false;
  confirmingExit.value = true;
  await nextTick();
  installConfirmationFocusGuard();
  // “继续游戏” is intentionally first: an accidental Enter cannot confirm
  // the destructive action, and keyboard/switch users land on the safe choice.
  cancelExitButtonRef.value?.focus();
}

async function cancelExit(): Promise<void> {
  confirmingExit.value = false;
  removeConfirmationFocusGuard();
  await nextTick();
  const target = exitReturnFocus?.isConnected ? exitReturnFocus : exitButtonRef.value;
  target?.focus();
  exitReturnFocus = null;
}

function trapExitFocus(event: KeyboardEvent): void {
  const dialog = exitDialogRef.value;
  if (!dialog) {
    return;
  }
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"),
  );
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function confirmExit(): void {
  confirmingExit.value = false;
  removeConfirmationFocusGuard();
  exitReturnFocus = null;
  emit("exit");
}

function handleNavigationBack(): boolean {
  if (confirmingExit.value) {
    void cancelExit();
    return true;
  }
  if (confirmingAutoPlay.value) {
    void cancelAutoPlay();
    return true;
  }
  if (settingsOpen.value) {
    closeSettings();
    return true;
  }
  if (historyOpen.value) {
    closeHistory();
    return true;
  }
  return false;
}

defineExpose({
  handleNavigationBack,
  requestExit,
});

onBeforeUnmount(() => {
  removeSettingsOutsideListener();
  stopObservingSettingsScroll();
  removeConfirmationFocusGuard();
});
</script>

<style scoped>
.game-tools {
  position: relative;
  z-index: 2;
  margin-left: auto;
}

.tool-buttons {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  gap: clamp(0.3rem, 0.8vh, 0.5rem);
}

.tool-button {
  min-width: clamp(4.25rem, 9vw, 5.25rem);
  height: 2.55rem;
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
  font-size: max(0.875rem, 14px);
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

.tool-button.auto-play.active {
  border-color: #fbbf24;
  background: #713f12;
  color: #fef3c7;
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.22), 0 5px 16px rgba(2, 6, 23, 0.34);
}

.tool-button.auto-play:disabled {
  opacity: 0.72;
}

.history-count {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: #fbbf24;
  color: #422006;
  display: inline-grid;
  place-items: center;
  font-size: max(0.8125rem, 13px);
  font-weight: 900;
  line-height: 1;
}

.tool-button.settings:disabled {
  cursor: not-allowed;
  border-color: rgba(100, 116, 139, 0.42);
  background: rgba(15, 23, 42, 0.7);
  color: #94a3b8;
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

.settings-panel,
.history-panel {
  position: absolute;
  top: calc(100% + 0.42rem);
  right: 0;
  width: min(18rem, calc(var(--effective-viewport-width, 100vw) - 1rem));
  max-height: calc(var(--effective-viewport-height, 100vh) - var(--game-header-height, 3rem) - 0.8rem);
  overflow: auto;
  padding: 0.8rem;
  border-radius: 1rem;
  border: 1px solid rgba(71, 85, 105, 0.9);
  background: #080f1d;
  color: #e2e8f0;
  box-shadow: 0 16px 36px rgba(2, 6, 23, 0.48);
  backdrop-filter: blur(14px);
  z-index: 1;
}

.tools-popover-backdrop {
  position: fixed;
  inset: var(--game-header-height, 3rem) 0 0;
  z-index: 0;
  background: rgba(2, 6, 23, 0.16);
}

.history-panel {
  width: min(22rem, calc(var(--effective-viewport-width, 100vw) - 1rem));
  padding: 0.8rem;
}

.settings-panel header,
.history-panel header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.7rem;
}

.settings-panel header div,
.history-panel header div,
.preference-copy {
  display: grid;
  gap: 0.12rem;
  text-align: left;
}

.settings-panel small,
.history-panel small {
  color: #94a3b8;
  font-size: max(0.78rem, 13px);
}

.settings-panel header strong,
.history-panel header strong {
  font-size: max(1rem, 16px);
}

.settings-panel header button,
.history-panel header button {
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

.settings-scroll-hint {
  position: sticky;
  bottom: -0.8rem;
  z-index: 2;
  min-height: 2.25rem;
  margin: 0.55rem -0.8rem -0.8rem;
  padding: 0.75rem 0.5rem 0.35rem;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, rgba(8, 15, 29, 0), #080f1d 38%);
  color: #fde68a;
  font-size: max(0.78rem, 13px);
  font-weight: 850;
  line-height: 1.15;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.settings-scroll-hint.hidden {
  opacity: 0;
}

.history-description {
  margin: 0.45rem 0 0;
  color: #cbd5e1;
  font-size: max(0.8rem, 14px);
  line-height: 1.45;
}

.history-list {
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.38rem;
}

.history-list li {
  min-height: 2.7rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid rgba(71, 85, 105, 0.72);
  border-radius: 0.72rem;
  background: #111b2d;
  display: grid;
  grid-template-columns: 4.9rem minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  text-align: left;
}

.history-list time {
  color: #93c5fd;
  font-variant-numeric: tabular-nums;
  font-size: max(0.76rem, 13px);
}

.history-list p {
  min-width: 0;
  margin: 0;
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: 0.4rem;
  align-items: baseline;
  font-size: max(0.88rem, 14px);
  line-height: 1.35;
}

.history-list p strong {
  overflow: hidden;
  color: #fde68a;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-list p span {
  color: #f8fafc;
}

.history-empty {
  margin-top: 0.65rem;
  min-height: 5.2rem;
  padding: 0.7rem;
  border: 1px dashed rgba(100, 116, 139, 0.75);
  border-radius: 0.8rem;
  background: #111827;
  color: #cbd5e1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  text-align: left;
}

.history-empty > span {
  color: #fbbf24;
  font-size: 1.65rem;
}

.history-empty p {
  margin: 0;
  display: grid;
  gap: 0.18rem;
}

.history-empty small {
  line-height: 1.4;
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
  font-size: max(0.92rem, 15px);
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
.setting-switch,
.rules-entry {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(71, 85, 105, 0.78);
  background: rgba(15, 23, 42, 0.76);
  color: #e2e8f0;
}

.setting-switch {
  margin-top: 0.65rem;
  padding: 0.5rem 0.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  text-align: left;
}

.setting-switch:disabled {
  cursor: not-allowed;
  border-color: rgba(100, 116, 139, 0.46);
  background: rgba(15, 23, 42, 0.55);
  color: #94a3b8;
  opacity: 1;
}

.setting-switch > span:first-child {
  min-width: 0;
  display: grid;
  gap: 0.08rem;
}

.setting-switch strong {
  font-size: max(0.88rem, 14px);
}

.switch-state {
  flex: 0 0 auto;
  min-width: 3.1rem;
  padding: 0.3rem 0.45rem;
  border-radius: 999px;
  background: #334155;
  color: #cbd5e1;
  text-align: center;
  font-size: max(0.78rem, 13px);
  font-weight: 800;
}

.switch-state.active {
  background: #047857;
  color: #ecfdf5;
}

.alert-options button {
  min-width: 0;
  padding: 0.38rem 0.2rem;
  display: grid;
  place-items: center;
  gap: 0.08rem;
  font-size: max(0.82rem, 14px);
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
  font-size: max(0.82rem, 14px);
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
  font-size: max(0.82rem, 14px);
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
  font-size: max(0.78rem, 13px);
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
  font-size: max(0.88rem, 14px);
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
  width: min(22rem, calc(100% - 1.4rem));
  max-height: calc(100% - 1.4rem);
  overflow: auto;
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
  font-size: max(1.25rem, 20px);
}

.exit-confirm p {
  margin-top: 0.45rem;
  color: #cbd5e1;
  font-size: max(0.95rem, 16px);
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
  font-size: max(0.95rem, 16px);
  font-weight: 750;
}

.exit-actions button.danger {
  border-color: #dc2626;
  background: #b91c1c;
}

.auto-play-symbol {
  background: rgba(120, 53, 15, 0.58);
  color: #fde68a;
  font-weight: 900;
}

.exit-actions button.auto-play-accept {
  border-color: #d97706;
  background: #a16207;
}

@media (max-width: 960px), (max-height: 500px) {
  .settings-panel,
  .history-panel {
    width: min(16rem, calc(var(--effective-viewport-width, 100vw) - 0.5rem));
    padding: 0.6rem;
  }

  .tool-button {
    min-width: clamp(3.6rem, 9vw, 4.4rem);
    height: max(2.25rem, 36px);
    padding-inline: 0.42rem;
  }

  .history-list li {
    min-height: 2.55rem;
    grid-template-columns: 4.4rem minmax(0, 1fr);
    gap: 0.4rem;
  }

  .history-list p {
    display: block;
    font-size: max(0.82rem, 14px);
  }

  .history-list p strong {
    margin-right: 0.35rem;
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
