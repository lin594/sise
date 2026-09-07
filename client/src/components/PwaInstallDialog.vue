<template>
  <div class="install-mask" data-testid="pwa-install-guide-mask" @click.self="emit('close')">
    <section
      ref="dialogRef"
      class="install-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-description"
      tabindex="-1"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown.tab="trapFocus"
    >
      <img src="/icons/sise-192.png" alt="" aria-hidden="true" />
      <div class="install-copy">
        <p class="install-kicker">更宽的牌桌体验</p>
        <h2 id="pwa-install-title">{{ guide.title }}</h2>
        <p id="pwa-install-description">{{ guide.description }}</p>
        <ol>
          <li v-for="(step, index) in guide.steps" :key="step">
            <span aria-hidden="true">{{ index + 1 }}</span>
            <strong>{{ step }}</strong>
          </li>
        </ol>
        <button ref="closeButtonRef" type="button" data-testid="close-pwa-install-guide" @click="emit('close')">
          我知道了
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import type { PwaInstallGuide } from "@/composables/usePwaInstall";

defineProps<{
  guide: PwaInstallGuide;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);

function trapFocus(event: KeyboardEvent): void {
  const button = closeButtonRef.value;
  if (!button) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }
  event.preventDefault();
  button.focus();
}

onMounted(() => {
  void nextTick(() => closeButtonRef.value?.focus({ preventScroll: true }));
});
</script>

<style scoped>
.install-mask {
  position: fixed;
  inset: 0;
  z-index: 170;
  display: grid;
  place-items: center;
  padding: max(0.7rem, var(--safe-top, 0px)) max(0.7rem, var(--safe-right, 0px))
    max(0.7rem, var(--safe-bottom, 0px)) max(0.7rem, var(--safe-left, 0px));
  background: rgba(var(--ui-page-rgb, 2, 6, 23), 0.84);
}

.install-dialog {
  width: min(37rem, calc(100% - 0.4rem));
  max-height: calc(100% - 0.4rem);
  overflow: auto;
  display: grid;
  grid-template-columns: 8rem minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  padding: clamp(0.85rem, 2.5vh, 1.2rem);
  border: 2px solid rgba(251, 191, 36, 0.72);
  border-radius: 1rem;
  background: linear-gradient(155deg, var(--ui-panel, #172033), var(--ui-page, #020617));
  color: var(--ui-text, #f8fafc);
  box-shadow: 0 22px 54px rgba(var(--ui-page-rgb, 2, 6, 23), 0.72);
}

.install-dialog > img {
  width: 8rem;
  height: 8rem;
  border-radius: 1.75rem;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.38);
}

.install-copy {
  min-width: 0;
}

.install-kicker,
h2,
p {
  margin: 0;
}

.install-kicker {
  color: #facc15;
  font-size: 0.85rem;
  font-weight: 850;
  letter-spacing: 0.06em;
}

h2 {
  margin-top: 0.18rem;
  font-size: clamp(1.25rem, 4vh, 1.65rem);
}

#pwa-install-description {
  margin-top: 0.42rem;
  color: var(--ui-accent-text, #dbeafe);
  font-size: max(0.92rem, 15px);
  line-height: 1.5;
}

ol {
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.42rem;
}

li {
  display: grid;
  grid-template-columns: 1.7rem minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem;
  min-height: 2.3rem;
  color: var(--ui-text, #f8fafc);
}

li > span {
  width: 1.7rem;
  height: 1.7rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #92400e;
  color: var(--ui-gold-text, #fef3c7);
  font-weight: 900;
}

.install-copy button {
  width: 100%;
  min-height: 48px;
  margin-top: 0.75rem;
  border: 1px solid #d97706;
  border-radius: 0.75rem;
  background: #b45309;
  color: #fff7ed;
  font-size: 1rem;
  font-weight: 900;
}

.install-copy button:focus-visible,
.install-dialog:focus-visible {
  outline: 3px solid var(--ui-accent, #7dd3fc);
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .install-dialog {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .install-dialog > img {
    width: 5rem;
    height: 5rem;
    border-radius: 1.1rem;
  }

  li {
    text-align: left;
  }
}

@media (max-height: 380px) {
  .install-dialog {
    grid-template-columns: 4.5rem minmax(0, 1fr);
    gap: 0.65rem;
    align-items: start;
    text-align: left;
  }

  .install-dialog > img {
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 1rem;
  }

  #pwa-install-description {
    line-height: 1.35;
  }

  ol {
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
  }

  li {
    grid-template-columns: 1.45rem minmax(0, 1fr);
    gap: 0.3rem;
    font-size: 0.82rem;
  }

  li > span {
    width: 1.45rem;
    height: 1.45rem;
  }

  .install-copy button {
    min-height: 42px;
    margin-top: 0.45rem;
  }
}
</style>
