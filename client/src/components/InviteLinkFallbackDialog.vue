<template>
  <div class="invite-copy-mask" data-testid="invite-copy-fallback-mask" @click.self="emit('close')">
    <section
      ref="dialogRef"
      class="invite-copy-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-copy-title"
      aria-describedby="invite-copy-description"
      tabindex="-1"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown.tab="trapFocus"
    >
      <div class="invite-copy-symbol" aria-hidden="true">链</div>
      <h2 id="invite-copy-title">复制邀请链接</h2>
      <p id="invite-copy-description">浏览器没能自动复制。请长按下面的链接，再选择“复制”。</p>
      <textarea
        ref="linkFieldRef"
        class="invite-link-field"
        data-testid="invite-copy-fallback-url"
        :value="url"
        readonly
        rows="3"
        aria-label="好友房邀请链接"
        @focus="selectLink"
      ></textarea>
      <p v-if="selectionConfirmed" class="selection-hint" role="status" aria-live="polite">
        链接已选中，请在系统菜单中点“复制”
      </p>
      <div class="invite-copy-actions">
        <button type="button" data-testid="close-invite-copy-fallback" @click="emit('close')">
          关闭
        </button>
        <button class="primary" type="button" data-testid="select-invite-link" @click="selectLink">
          选中链接
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

defineProps<{
  url: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const linkFieldRef = ref<HTMLTextAreaElement | null>(null);
const selectionConfirmed = ref(false);

function selectLink(): void {
  const field = linkFieldRef.value;
  if (!field) {
    return;
  }
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, field.value.length);
  selectionConfirmed.value = true;
}

function trapFocus(event: KeyboardEvent): void {
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      "textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    ),
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

onMounted(() => {
  void nextTick(selectLink);
});
</script>

<style scoped>
.invite-copy-mask {
  position: fixed;
  inset: 0;
  z-index: 160;
  display: grid;
  place-items: center;
  padding: max(0.7rem, var(--safe-top, 0px)) max(0.7rem, var(--safe-right, 0px))
    max(0.7rem, var(--safe-bottom, 0px)) max(0.7rem, var(--safe-left, 0px));
  background: rgba(2, 6, 23, 0.82);
}

.invite-copy-dialog {
  width: min(31rem, calc(100% - 0.4rem));
  max-height: calc(100% - 0.4rem);
  overflow: auto;
  padding: clamp(0.85rem, 2.5vh, 1.2rem);
  border: 1px solid rgba(125, 211, 252, 0.6);
  border-radius: 1rem;
  background: linear-gradient(155deg, #172033, #020617);
  color: #f8fafc;
  text-align: center;
  box-shadow: 0 22px 54px rgba(2, 6, 23, 0.68);
}

.invite-copy-symbol {
  width: 2.8rem;
  height: 2.8rem;
  margin: 0 auto 0.5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #075985;
  color: #e0f2fe;
  font-size: 1.15rem;
  font-weight: 900;
}

h2,
p {
  margin: 0;
}

h2 {
  font-size: clamp(1.15rem, 4vh, 1.4rem);
}

#invite-copy-description {
  margin-top: 0.45rem;
  color: #dbeafe;
  font-size: max(0.9rem, 16px);
  line-height: 1.5;
}

.invite-link-field {
  box-sizing: border-box;
  width: 100%;
  min-height: 4.8rem;
  margin-top: 0.75rem;
  padding: 0.7rem;
  resize: none;
  border: 2px solid #7dd3fc;
  border-radius: 0.75rem;
  background: #f8fafc;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 16px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.invite-link-field:focus-visible {
  outline: 3px solid #fde047;
  outline-offset: 2px;
}

.selection-hint {
  margin-top: 0.45rem;
  color: #bbf7d0;
  font-size: 0.85rem;
  font-weight: 750;
}

.invite-copy-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  margin-top: 0.8rem;
}

.invite-copy-actions button {
  min-height: 48px;
  padding: 0.55rem 0.7rem;
  border: 1px solid #64748b;
  border-radius: 0.75rem;
  background: #1e293b;
  color: #f8fafc;
  font-size: 1rem;
  font-weight: 800;
}

.invite-copy-actions button.primary {
  border-color: #0284c7;
  background: #0369a1;
}

.invite-copy-actions button:focus-visible {
  outline: 3px solid #fde047;
  outline-offset: 2px;
}

@media (max-height: 380px) {
  .invite-copy-dialog {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.35rem 0.75rem;
    align-items: center;
    text-align: left;
  }

  .invite-copy-symbol {
    grid-row: 1 / span 2;
    margin: 0;
  }

  .invite-link-field,
  .selection-hint,
  .invite-copy-actions {
    grid-column: 1 / -1;
  }

  #invite-copy-description {
    margin-top: 0;
    font-size: 0.88rem;
  }

  .invite-link-field {
    min-height: 3.7rem;
    margin-top: 0.2rem;
  }

  .invite-copy-actions {
    margin-top: 0.25rem;
  }
}
</style>
