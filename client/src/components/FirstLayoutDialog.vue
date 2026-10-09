<template>
  <div class="layout-onboarding-mask" data-testid="layout-onboarding-mask">
    <section
      ref="dialogRef"
      class="layout-onboarding-dialog"
      data-testid="layout-onboarding-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="layout-onboarding-title"
      aria-describedby="layout-onboarding-description"
      tabindex="-1"
      @keydown.esc.stop.prevent="confirm"
      @keydown.tab="trapFocus"
    >
      <header>
        <p>第一次进入</p>
        <h2 id="layout-onboarding-title">选一个顺手的牌桌</h2>
        <span id="layout-onboarding-description">布局会影响牌面大小和操作空间，之后仍可在设置里更改。</span>
      </header>
      <AppearanceSettings
        section="layout"
        :model-value="modelValue"
        :resolved-layout="resolvedLayout"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <button ref="confirmButtonRef" class="confirm" type="button" data-testid="confirm-layout-onboarding" @click="confirm">
        使用这个布局
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import AppearanceSettings from "@/components/AppearanceSettings.vue";
import type { GameDisplayPreferences, RenderedTableLayoutId } from "@/types/game";

defineProps<{
  modelValue: GameDisplayPreferences;
  resolvedLayout: RenderedTableLayoutId;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: GameDisplayPreferences];
  confirm: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const confirmButtonRef = ref<HTMLButtonElement | null>(null);

function focusableControls(): HTMLElement[] {
  return Array.from(
    dialogRef.value?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
  );
}

function trapFocus(event: KeyboardEvent): void {
  const controls = focusableControls();
  if (!controls.length) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }
  const first = controls[0]!;
  const last = controls[controls.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function confirm(): void {
  emit("confirm");
}

onMounted(() => {
  void nextTick(() => {
    const selected = dialogRef.value?.querySelector<HTMLElement>("[role='radio'][aria-checked='true']");
    (selected ?? confirmButtonRef.value ?? dialogRef.value)?.focus({ preventScroll: true });
  });
});
</script>

<style scoped>
.layout-onboarding-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  place-items: center;
  padding: max(0.75rem, var(--safe-top, 0px)) max(0.75rem, var(--safe-right, 0px)) max(0.75rem, var(--safe-bottom, 0px)) max(0.75rem, var(--safe-left, 0px));
  background: #020617cc;
  backdrop-filter: blur(5px);
}

.layout-onboarding-dialog {
  width: min(38rem, 100%);
  max-height: 100%;
  overflow: auto;
  border: 1px solid var(--ui-border, #475569);
  border-radius: 1rem;
  padding: clamp(0.85rem, 3vw, 1.35rem);
  background: var(--ui-raised, #111e30);
  color: var(--ui-text, #f8fafc);
  box-shadow: 0 22px 70px #000a;
}

header p,
header h2,
header span {
  margin: 0;
}

header p {
  color: var(--ui-gold-text, #fcd34d);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

header h2 {
  margin-top: 0.2rem;
  font-size: clamp(1.25rem, 4vw, 1.7rem);
}

header span {
  display: block;
  margin-top: 0.35rem;
  color: var(--ui-muted, #cbd5e1);
  line-height: 1.45;
}

.confirm {
  width: 100%;
  min-height: 46px;
  margin-top: 0.35rem;
  border: 1px solid #f59e0b;
  border-radius: 0.7rem;
  background: #b45309;
  color: #fff;
  font-size: 1rem;
  font-weight: 900;
  cursor: pointer;
}

.confirm:focus-visible,
.layout-onboarding-dialog:focus-visible {
  outline: 3px solid var(--ui-accent-text, #bae6fd);
  outline-offset: 3px;
}

@media (max-height: 430px) {
  .layout-onboarding-mask { padding-block: 0.35rem; }
  .layout-onboarding-dialog { padding: 0.55rem 0.75rem; }
  header span { font-size: 0.78rem; }
  :deep(fieldset) { margin-block: 0.4rem; }
  :deep(.appearance-options) { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  :deep(.layout-preview) { height: 32px; }
  :deep(.appearance-options small) { display: none; }
  .confirm { min-height: 40px; }
}
</style>
