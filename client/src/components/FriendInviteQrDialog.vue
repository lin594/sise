<template>
  <div class="invite-qr-mask" data-testid="friend-invite-qr-mask" @click.self="emit('close')">
    <section
      ref="dialogRef"
      class="invite-qr-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-qr-title"
      aria-describedby="invite-qr-description"
      tabindex="-1"
      @keydown.esc.stop.prevent="emit('close')"
      @keydown.tab="trapFocus"
    >
      <div class="qr-visual">
        <div v-if="!generationFailed" class="qr-frame">
          <canvas
            ref="canvasRef"
            role="img"
            :aria-label="`好友房 ${roomId} 邀请二维码，请用另一台设备扫描`"
            :data-qr-content="url"
            data-testid="friend-invite-qr"
          ></canvas>
        </div>
        <div v-else class="qr-fallback-symbol" aria-hidden="true">链</div>
      </div>

      <div class="qr-copy">
        <p class="qr-kicker">好友房 {{ roomId }}</p>
        <h2 id="invite-qr-title">扫码加入好友房</h2>
        <p id="invite-qr-description">
          {{ generationFailed ? "二维码生成失败，请长按并复制下面的链接。" : "请让牌友用另一台手机扫码，再输入昵称入座。" }}
        </p>
        <textarea
          v-if="generationFailed"
          ref="fallbackFieldRef"
          class="qr-fallback-link"
          data-testid="friend-invite-qr-fallback-url"
          :value="url"
          readonly
          rows="3"
          aria-label="好友房邀请链接"
          @focus="selectFallbackLink"
        ></textarea>
        <p class="privacy-note">二维码只含加入地址和房间号，不含你的身份凭据。</p>
        <button
          ref="closeButtonRef"
          class="qr-close"
          type="button"
          data-testid="close-friend-invite-qr"
          @click="emit('close')"
        >
          关闭二维码
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import QRCode from "qrcode";
import { nextTick, onMounted, ref } from "vue";

const props = defineProps<{
  url: string;
  roomId: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const fallbackFieldRef = ref<HTMLTextAreaElement | null>(null);
const generationFailed = ref(false);

function selectFallbackLink(): void {
  const field = fallbackFieldRef.value;
  if (!field) {
    return;
  }
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, field.value.length);
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

onMounted(async () => {
  await nextTick();
  const canvas = canvasRef.value;
  if (!canvas) {
    generationFailed.value = true;
    await nextTick();
    fallbackFieldRef.value?.focus({ preventScroll: true });
    return;
  }
  try {
    await QRCode.toCanvas(canvas, props.url, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });
    closeButtonRef.value?.focus({ preventScroll: true });
  } catch {
    generationFailed.value = true;
    await nextTick();
    fallbackFieldRef.value?.focus({ preventScroll: true });
  }
});
</script>

<style scoped>
.invite-qr-mask {
  position: fixed;
  inset: 0;
  z-index: 165;
  display: grid;
  place-items: center;
  padding: max(0.7rem, var(--safe-top, 0px)) max(0.7rem, var(--safe-right, 0px))
    max(0.7rem, var(--safe-bottom, 0px)) max(0.7rem, var(--safe-left, 0px));
  background: rgba(2, 6, 23, 0.84);
}

.invite-qr-dialog {
  box-sizing: border-box;
  width: min(44rem, calc(100% - 0.4rem));
  max-height: calc(100% - 0.4rem);
  overflow: auto;
  display: grid;
  grid-template-columns: minmax(13rem, 20rem) minmax(15rem, 1fr);
  gap: clamp(0.9rem, 3vw, 1.5rem);
  align-items: center;
  padding: clamp(0.85rem, 2.5vh, 1.25rem);
  border: 2px solid #7dd3fc;
  border-radius: 1rem;
  background: linear-gradient(155deg, #172033, #020617);
  color: #f8fafc;
  box-shadow: 0 22px 54px rgba(2, 6, 23, 0.7);
}

.invite-qr-dialog:focus-visible {
  outline: 3px solid #fde047;
  outline-offset: 2px;
}

.qr-visual {
  display: grid;
  place-items: center;
}

.qr-frame {
  box-sizing: border-box;
  width: min(100%, 20rem);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 0.35rem;
  border-radius: 0.85rem;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.18);
}

.qr-frame canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
  image-rendering: pixelated;
}

.qr-copy {
  min-width: 0;
}

.qr-kicker,
h2,
p {
  margin: 0;
}

.qr-kicker {
  color: #facc15;
  font-size: 1rem;
  font-weight: 900;
  letter-spacing: 0.04em;
}

h2 {
  margin-top: 0.25rem;
  font-size: clamp(1.35rem, 4vh, 1.8rem);
}

#invite-qr-description {
  margin-top: 0.55rem;
  color: #dbeafe;
  font-size: max(1rem, 16px);
  font-weight: 700;
  line-height: 1.55;
}

.privacy-note {
  margin-top: 0.65rem;
  color: #bbf7d0;
  font-size: 0.9rem;
  line-height: 1.45;
}

.qr-close {
  width: 100%;
  min-height: 50px;
  margin-top: 0.85rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid #0284c7;
  border-radius: 0.75rem;
  background: #0369a1;
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 900;
  cursor: pointer;
}

.qr-close:focus-visible,
.qr-fallback-link:focus-visible {
  outline: 3px solid #fde047;
  outline-offset: 2px;
}

.qr-fallback-symbol {
  width: 7rem;
  height: 7rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #075985;
  color: #e0f2fe;
  font-size: 2.5rem;
  font-weight: 900;
}

.qr-fallback-link {
  box-sizing: border-box;
  width: 100%;
  min-height: 4.5rem;
  margin-top: 0.65rem;
  padding: 0.65rem;
  resize: none;
  border: 2px solid #7dd3fc;
  border-radius: 0.7rem;
  background: #f8fafc;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 16px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

@media (max-width: 560px) and (min-height: 430px) {
  .invite-qr-dialog {
    width: min(23rem, calc(100% - 0.25rem));
    grid-template-columns: 1fr;
    gap: 0.65rem;
    text-align: center;
  }

  .qr-frame {
    width: min(16rem, calc(var(--physical-viewport-width, 100vw) * 0.68));
  }
}

:global(.layout[data-rotated-phone-portrait="true"]) .invite-qr-dialog {
  width: min(35rem, calc(100% - 0.2rem));
  max-height: calc(100% - 0.2rem);
  grid-template-columns: minmax(9rem, 10rem) minmax(0, 1fr);
  gap: 0.65rem;
  padding: 0.55rem;
  text-align: left;
}

:global(.layout[data-rotated-phone-portrait="true"]) .qr-frame {
  width: min(10rem, calc(var(--effective-viewport-height, 320px) * 0.5));
}

:global(.layout[data-rotated-phone-portrait="true"]) h2 {
  font-size: 1.2rem;
}

:global(.layout[data-rotated-phone-portrait="true"]) #invite-qr-description {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  line-height: 1.35;
}

:global(.layout[data-rotated-phone-portrait="true"]) .privacy-note {
  margin-top: 0.3rem;
  font-size: 0.75rem;
}

:global(.layout[data-rotated-phone-portrait="true"]) .qr-close {
  min-height: 46px;
  margin-top: 0.45rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.95rem;
}

@media (max-height: 420px) {
  .invite-qr-mask {
    padding: 0.35rem;
  }

  .invite-qr-dialog {
    width: min(39rem, calc(100% - 0.2rem));
    max-height: calc(100% - 0.2rem);
    grid-template-columns: minmax(9rem, 11rem) minmax(0, 1fr);
    gap: 0.65rem;
    padding: 0.55rem;
  }

  .qr-frame {
    width: min(11.5rem, calc(var(--physical-viewport-height, 100vh) * 0.5));
  }

  h2 {
    font-size: 1.2rem;
  }

  #invite-qr-description {
    margin-top: 0.25rem;
    font-size: 0.9rem;
    line-height: 1.35;
  }

  .privacy-note {
    margin-top: 0.3rem;
    font-size: 0.75rem;
  }

  .qr-close {
    min-height: 46px;
    margin-top: 0.45rem;
    padding: 0.45rem 0.6rem;
    font-size: 0.95rem;
  }
}

/* Portrait phones are rotated by the app into a landscape game canvas, while
   media queries still report the physical portrait viewport. Keep this modal
   on the effective landscape axis instead of applying the stacked phone rule. */
:global(.layout.rotated-phone-portrait .invite-qr-mask) {
  padding: 0.35rem;
}

:global(.layout.rotated-phone-portrait .invite-qr-dialog) {
  width: min(39rem, calc(100% - 0.2rem));
  max-height: calc(100% - 0.2rem);
  grid-template-columns: minmax(9rem, 10.5rem) minmax(0, 1fr);
  gap: 0.65rem;
  padding: 0.55rem;
  text-align: left;
}

:global(.layout.rotated-phone-portrait .qr-frame) {
  width: 10.5rem;
}

:global(.layout.rotated-phone-portrait .invite-qr-dialog h2) {
  font-size: 1.2rem;
}

:global(.layout.rotated-phone-portrait #invite-qr-description) {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  line-height: 1.35;
}

:global(.layout.rotated-phone-portrait .privacy-note) {
  margin-top: 0.3rem;
  font-size: 0.75rem;
}

:global(.layout.rotated-phone-portrait .qr-close) {
  min-height: 46px;
  margin-top: 0.45rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.95rem;
}
</style>
