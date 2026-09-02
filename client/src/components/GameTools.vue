<template>
  <div class="game-tools" data-testid="game-tools">
    <div class="tool-buttons">
      <button
        class="tool-button"
        type="button"
        aria-label="牌局设置"
        title="牌局设置"
        data-testid="game-settings"
        :aria-expanded="settingsOpen"
        @click="settingsOpen = !settingsOpen"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" />
          <path d="m19.2 13.4 1.3 1-.1 1.5-1.5 1.8-1.6-.5a7.8 7.8 0 0 1-1.8 1l-.3 1.7-1.4.6h-2.5l-.7-1.5a7.8 7.8 0 0 1-2-.6l-1.4.9-1.3-.8-1.2-2.2.9-1.4a7.8 7.8 0 0 1-.2-2.1L4 11.7l.3-1.5 1.3-2 1.7.1a7.8 7.8 0 0 1 1.7-1.2l.1-1.7 1.4-.7H13l.9 1.4a7.8 7.8 0 0 1 1.9.8l1.5-.7 1.2.9 1 2.3-1 1.3c.2.9.3 1.8.1 2.7h.6Z" />
        </svg>
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
      </button>
    </div>

    <Transition name="popover">
      <section v-if="settingsOpen" class="settings-panel" data-testid="settings-panel">
        <header>
          <div>
            <small>牌局设置</small>
            <strong>牌面显示</strong>
          </div>
          <button type="button" aria-label="关闭设置" @click="settingsOpen = false">×</button>
        </header>
        <div class="mode-options" role="group" aria-label="牌面显示模式">
          <button
            type="button"
            data-testid="card-mode-simple"
            :class="{ active: props.modelValue === 'simple' }"
            @click="emit('update:modelValue', 'simple')"
          >
            <span class="mode-sample simple">帅</span>
            <span><strong>简化大字</strong><small>更适合小屏辨认</small></span>
          </button>
          <button
            type="button"
            data-testid="card-mode-full"
            :class="{ active: props.modelValue === 'full' }"
            @click="emit('update:modelValue', 'full')"
          >
            <span class="mode-sample full">帥</span>
            <span><strong>长条色牌</strong><small>保留传统牌面</small></span>
          </button>
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
import { ref } from "vue";

const props = defineProps<{
  modelValue: "simple" | "full";
}>();

const emit = defineEmits<{
  "update:modelValue": [mode: "simple" | "full"];
  openRules: [];
  exit: [];
}>();

const settingsOpen = ref(false);
const confirmingExit = ref(false);

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
  position: fixed;
  z-index: 105;
  top: max(0.45rem, var(--safe-top, 0px));
  right: max(0.45rem, var(--safe-right, 0px));
  pointer-events: none;
}

.tool-buttons {
  display: flex;
  justify-content: flex-end;
  gap: clamp(0.3rem, 0.8vh, 0.5rem);
}

.tool-button {
  pointer-events: auto;
  width: clamp(2.35rem, 6.8vh, 2.8rem);
  height: clamp(2.35rem, 6.8vh, 2.8rem);
  padding: 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.38);
  background: rgba(15, 23, 42, 0.84);
  color: #e2e8f0;
  box-shadow: 0 5px 16px rgba(2, 6, 23, 0.34);
  backdrop-filter: blur(10px);
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

.tool-button svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-panel {
  pointer-events: auto;
  width: min(18rem, calc(100dvw - 1rem));
  margin-top: 0.45rem;
  padding: 0.8rem;
  border-radius: 1rem;
  border: 1px solid rgba(71, 85, 105, 0.9);
  background: rgba(8, 15, 29, 0.96);
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
.mode-options button > span:last-child {
  display: grid;
  gap: 0.12rem;
  text-align: left;
}

.settings-panel small {
  color: #94a3b8;
  font-size: 0.7rem;
}

.settings-panel header strong {
  font-size: 1rem;
}

.settings-panel header button {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 50%;
  background: rgba(30, 41, 59, 0.78);
  color: #cbd5e1;
  font-size: 1.25rem;
}

.mode-options {
  display: grid;
  gap: 0.42rem;
  margin-top: 0.65rem;
}

.mode-options button,
.rules-entry {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(71, 85, 105, 0.78);
  background: rgba(15, 23, 42, 0.76);
  color: #e2e8f0;
}

.mode-options button {
  display: grid;
  grid-template-columns: 2.15rem minmax(0, 1fr);
  align-items: center;
  gap: 0.62rem;
  padding: 0.42rem 0.55rem;
}

.mode-options button.active {
  border-color: rgba(56, 189, 248, 0.88);
  background: rgba(8, 47, 73, 0.78);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.2) inset;
}

.mode-sample {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 0.48rem;
  font-weight: 900;
}

.mode-sample.simple {
  background: #facc15;
  color: #422006;
}

.mode-sample.full {
  width: 1.28rem;
  justify-self: center;
  border: 2px solid #b91c1c;
  background: #fff7ed;
  color: #991b1b;
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
  .game-tools {
    top: max(0.25rem, var(--safe-top, 0px));
    right: max(0.25rem, var(--safe-right, 0px));
  }

  .settings-panel {
    width: min(16rem, calc(100dvw - 0.5rem));
    max-height: calc(100dvh - 3.2rem);
    overflow: auto;
    padding: 0.6rem;
  }

  .mode-options {
    grid-template-columns: 1fr 1fr;
  }

  .mode-options button {
    min-height: 3rem;
    grid-template-columns: 1.8rem minmax(0, 1fr);
    padding: 0.35rem;
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
