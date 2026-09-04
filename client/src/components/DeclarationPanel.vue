<template>
  <div class="declare-mask">
    <div
      ref="panelRef"
      class="declare-panel"
      :class="{ compact, 'ultra-compact': ultraCompact }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="declare-title"
      aria-describedby="declare-description"
      tabindex="-1"
      @keydown.tab="trapFocus"
    >
      <span id="declare-description" class="sr-only">系统已经按规则选好推荐方案。可以直接开始游戏，也可以查看手牌并调整亮鱼和暗坎。</span>
      <header class="declare-header">
        <div class="declare-heading">
          <span class="declare-kicker">开局标识</span>
          <h2 id="declare-title">声明亮鱼与暗坎</h2>
          <p aria-hidden="true">系统已选好推荐方案；点击牌组或数字即可调整。</p>
        </div>
        <div class="declare-timer-tools">
          <div
            class="declare-timer"
            :class="{ urgent: !untimed && secondsLeft <= 10, untimed }"
            :aria-label="untimed ? '练习模式声明不限时' : '声明剩余时间'"
          >
            <strong>{{ untimed ? "不限时" : secondsLeft }}</strong>
            <span>{{ untimed ? "练习模式" : "秒" }}</span>
          </div>
          <button
            v-if="canRequestMoreTime && !submitted"
            type="button"
            class="declare-more-time"
            data-testid="declare-request-more-time"
            :disabled="moreTimeRequested || !connectionReady"
            :aria-label="`需要更多时间，增加${moreTimeSeconds}秒`"
            @click="requestMoreTime"
          >
            <span class="more-time-prefix">需要更多时间</span>
            <strong>{{ moreTimeRequested ? "加时中…" : `+${moreTimeSeconds}秒` }}</strong>
          </button>
        </div>
      </header>

      <div v-if="!untimed" class="declare-progress" aria-hidden="true">
        <div class="declare-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>

      <p v-if="submitted" class="declare-submitted" role="status">
        <span>✓</span> 声明已提交，正在等待其他玩家
      </p>

      <p v-else-if="!handReady" class="declare-syncing" role="status" aria-live="polite">
        <span class="loading-mark"></span>
        <span><strong>正在同步完整手牌</strong><small>手牌到齐后才能调整和确认声明，请稍候。</small></span>
      </p>

      <template v-if="handReady && hand.length">
        <section class="hand-preview" aria-labelledby="declare-hand-title">
          <div class="section-heading compact-heading">
            <div>
              <span class="section-index">01</span>
              <h3 id="declare-hand-title">查看手牌</h3>
            </div>
            <div class="hand-heading-tools">
              <span class="hand-total">共 {{ hand.length }} 张</span>
              <div class="legend" aria-label="手牌标记说明">
                <span class="legend-item fish"><i></i>已选亮鱼</span>
                <span class="legend-item kong"><i></i>可成暗坎</span>
              </div>
              <div v-if="handHasOverflow" class="declare-hand-scroll-tools" data-testid="declare-hand-scroll-tools">
                <button
                  type="button"
                  data-testid="declare-hand-scroll-prev"
                  aria-label="向前翻看声明手牌"
                  :disabled="!handCanScrollBackward"
                  @click="scrollHandPreview('backward')"
                >‹ 前翻</button>
                <span
                  class="declare-hand-visible-range"
                  data-testid="declare-hand-visible-range"
                  :aria-label="handVisibleRangeLabel"
                >{{ handVisibleRange.start }}–{{ handVisibleRange.end }} / {{ handVisibleRange.total }}</span>
                <button
                  type="button"
                  data-testid="declare-hand-scroll-next"
                  aria-label="向后翻看更多声明手牌"
                  :disabled="!handCanScrollForward"
                  @click="scrollHandPreview('forward')"
                >后翻 ›</button>
              </div>
            </div>
          </div>
          <div
            ref="handRailRef"
            class="hand-rail"
            data-testid="declare-hand-preview"
            :aria-label="`完整手牌预览，共 ${hand.length} 张`"
            tabindex="0"
            @scroll.passive="updateHandScrollState"
          >
            <div
              v-for="card in hand"
              :key="`declare-preview-${card.id}`"
              class="hand-preview-card"
              :class="{
                fish: selectedFishCardIds.has(card.id),
                kong: hiddenKongAnalysis.cardIds.has(card.id),
              }"
            >
              <CardComp :card="card" size="sm" :mode="cardMode" />
            </div>
          </div>
        </section>

        <div class="declare-controls">
          <section class="declare-section fish-section" aria-labelledby="fish-title">
            <div class="section-heading">
              <div>
                <span class="section-index">02</span>
                <h3 id="fish-title">选择亮鱼</h3>
              </div>
              <span class="section-result">{{ selectedFishOptionIds.size }}/{{ fishOptions.length }} 组</span>
            </div>

            <div v-if="fishOptions.length" class="fish-options">
              <button
                v-for="option in fishOptions"
                :key="option.id"
                class="fish-option"
                :class="{ selected: selectedFishOptionIds.has(option.id) }"
                type="button"
                :aria-pressed="selectedFishOptionIds.has(option.id)"
                :disabled="isLocked"
                :data-testid="`fish-option-${option.id}`"
                @click="toggleFish(option)"
              >
                <span class="fish-option-copy">
                  <strong>{{ fishOptionTitle(option) }}</strong>
                  <small>{{ selectedFishOptionIds.has(option.id) ? "已亮出" : "保留手中" }}</small>
                </span>
                <span class="fish-option-cards" aria-hidden="true">
                  <CardComp
                    v-for="card in option.cards"
                    :key="`${option.id}-${card.id}`"
                    :card="card"
                    size="sm"
                    :mode="cardMode"
                  />
                </span>
                <span class="option-check" aria-hidden="true">✓</span>
              </button>
            </div>
            <div v-else class="empty-option">
              <strong>没有可亮的鱼</strong>
              <span>这项无需操作</span>
            </div>
          </section>

          <section class="declare-section kong-section" aria-labelledby="kong-title">
            <div class="section-heading">
              <div>
                <span class="section-index">03</span>
                <h3 id="kong-title">声明暗坎</h3>
              </div>
              <span class="section-result amber">建议 {{ hiddenKongAnalysis.count }} 个</span>
            </div>

            <div class="kong-choices" role="radiogroup" aria-label="暗坎声明数量">
              <button
                v-for="count in kongChoices"
                :key="count"
                class="kong-choice"
                :class="{ selected: declaredKongs === count }"
                type="button"
                role="radio"
                :aria-checked="declaredKongs === count"
                :disabled="isLocked"
                :data-testid="`kong-count-${count}`"
                @click="selectKongCount(count)"
              >
                <strong>{{ count }}</strong>
                <span>个</span>
              </button>
            </div>
            <p class="kong-note">亮鱼变化时会重新计算；手动选择后会保留你的数量。</p>
          </section>
        </div>
      </template>

      <div v-else-if="handReady" class="declaration-loading" role="status">
        <span class="loading-mark"></span>
        正在同步手牌…
      </div>

      <footer class="declare-footer">
        <div class="footer-meta">
          <button
            class="reset-recommendation"
            type="button"
            :disabled="isLocked || !initialized || isAtRecommendation"
            @click="restoreRecommendation"
          >
            恢复系统建议
          </button>
          <p v-if="untimed" class="untimed-message">
            <span class="untimed-dot"></span>{{ ultraCompact ? "上下滑调整 · 手牌可前后翻 · 练习不限时" : "不限时，请按自己的节奏确认" }}
          </p>
          <p v-else><span class="timeout-dot"></span>超时将按系统建议提交</p>
          <p v-if="displayedError" class="declare-error" role="alert">{{ displayedError }}</p>
        </div>
        <button
          ref="confirmButtonRef"
          class="confirm-declaration"
          type="button"
          :disabled="isLocked || !initialized"
          data-testid="confirm-declaration"
          @click="submit"
        >
          <span v-if="!connectionReady">等待网络恢复</span>
          <span v-else-if="submitted">已提交，等待其他玩家</span>
          <span v-else-if="submitPending">提交中…</span>
          <span v-else>{{ confirmationText }}</span>
          <small v-if="connectionReady && !submitted && !submitPending">确认后不可修改</small>
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import CardComp from "@/components/Card.vue";
import type { Card, RenderedCardMode } from "@/types/game";
import { getCardLabelText } from "@/utils/cardText";
import {
  analyzeHiddenKongs,
  buildFishOptions,
  getRecommendedFishOptionIds,
  getSelectedFishCardIds,
  getDeclarationStartLabel,
  reconcileDeclaredKongs,
  toggleFishOptionId,
  type FishOption,
} from "@/utils/declaration";

const props = defineProps<{
  hand: Card[];
  handReady: boolean;
  submitted: boolean;
  secondsLeft: number;
  untimed?: boolean;
  progressPercent: number;
  serverError: string;
  connectionReady: boolean;
  compact: boolean;
  ultraCompact: boolean;
  cardMode: RenderedCardMode;
  canRequestMoreTime: boolean;
  moreTimeSeconds: number;
  decisionKey: string;
}>();

const emit = defineEmits<{
  submit: [payload: { declaredKongs: number; fishCardIds: string[] }];
  requestMoreTime: [];
}>();

const initialized = ref(false);
const selectedFishOptionIds = ref<Set<string>>(new Set());
const declaredKongs = ref(0);
const kongSelectionTouched = ref(false);
const submitPending = ref(false);
const localSubmitError = ref("");
const moreTimeRequested = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const confirmButtonRef = ref<HTMLButtonElement | null>(null);
const handRailRef = ref<HTMLElement | null>(null);
const handHasOverflow = ref(false);
const handCanScrollBackward = ref(false);
const handCanScrollForward = ref(false);
const handVisibleRange = ref({ start: 0, end: 0, total: 0 });
let primaryFocusPlaced = false;
let moreTimeRetryTimer: number | null = null;
let submitRetryTimer: number | null = null;
let handResizeObserver: ResizeObserver | null = null;

const SUBMIT_CONFIRM_WAIT_MS = 3500;

const handVisibleRangeLabel = computed(() => {
  const { start, end, total } = handVisibleRange.value;
  return `当前显示第 ${start} 到 ${end} 张，共 ${total} 张`;
});

function clearMoreTimeRetryTimer(): void {
  if (moreTimeRetryTimer !== null) {
    window.clearTimeout(moreTimeRetryTimer);
    moreTimeRetryTimer = null;
  }
}

function clearSubmitRetryTimer(): void {
  if (submitRetryTimer !== null) {
    window.clearTimeout(submitRetryTimer);
    submitRetryTimer = null;
  }
}

function requestMoreTime(): void {
  if (!props.canRequestMoreTime || moreTimeRequested.value || props.submitted) {
    return;
  }
  moreTimeRequested.value = true;
  emit("requestMoreTime");
  clearMoreTimeRetryTimer();
  moreTimeRetryTimer = window.setTimeout(() => {
    moreTimeRetryTimer = null;
    if (props.canRequestMoreTime) {
      moreTimeRequested.value = false;
    }
  }, 2500);
}

const fishOptions = computed(() => buildFishOptions(props.hand));
const recommendedFishOptionIds = computed(() => getRecommendedFishOptionIds(fishOptions.value));
const selectedFishCardIds = computed(() => getSelectedFishCardIds(fishOptions.value, selectedFishOptionIds.value));
const recommendedFishCardIds = computed(() => getSelectedFishCardIds(fishOptions.value, recommendedFishOptionIds.value));
const hiddenKongAnalysis = computed(() => analyzeHiddenKongs(props.hand, selectedFishCardIds.value));
const recommendedKongCount = computed(() => analyzeHiddenKongs(props.hand, recommendedFishCardIds.value).count);
const kongChoices = computed(() => Array.from({ length: hiddenKongAnalysis.value.count + 1 }, (_, index) => index));
const isLocked = computed(
  () => !props.handReady || !props.connectionReady || props.submitted || submitPending.value,
);
const displayedError = computed(() => {
  if (!props.connectionReady) {
    return "网络已断开，恢复后可继续提交；刚才的选择还在。";
  }
  return props.serverError || localSubmitError.value;
});
const isAtRecommendation = computed(() => {
  if (declaredKongs.value !== recommendedKongCount.value) {
    return false;
  }
  if (selectedFishOptionIds.value.size !== recommendedFishOptionIds.value.size) {
    return false;
  }
  return [...recommendedFishOptionIds.value].every((id) => selectedFishOptionIds.value.has(id));
});
const confirmationText = computed(() => {
  return getDeclarationStartLabel(selectedFishOptionIds.value.size, declaredKongs.value);
});

function focusableControls(): HTMLElement[] {
  const panel = panelRef.value;
  if (!panel) {
    return [];
  }
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

function trapFocus(event: KeyboardEvent): void {
  const panel = panelRef.value;
  if (!panel) {
    return;
  }
  const focusable = focusableControls();
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function placeInitialFocus(): void {
  const panel = panelRef.value;
  if (!panel) {
    return;
  }
  if (props.submitted) {
    panel.focus();
    return;
  }
  if (!props.handReady) {
    primaryFocusPlaced = false;
    panel.focus();
    return;
  }
  if (initialized.value && !isLocked.value && !primaryFocusPlaced) {
    confirmButtonRef.value?.focus();
    primaryFocusPlaced = true;
    return;
  }
  if (!panel.contains(document.activeElement)) {
    panel.focus();
  }
}

function fishOptionTitle(option: FishOption): string {
  if (option.kind !== "regular") {
    return option.title;
  }
  const firstCard = option.cards[0];
  return firstCard ? `${getCardLabelText(firstCard)}鱼` : "普通鱼";
}

function restoreRecommendation() {
  selectedFishOptionIds.value = new Set(recommendedFishOptionIds.value);
  kongSelectionTouched.value = false;
  declaredKongs.value = recommendedKongCount.value;
  initialized.value = true;
}

function toggleFish(option: FishOption) {
  if (isLocked.value) {
    return;
  }
  selectedFishOptionIds.value = toggleFishOptionId(selectedFishOptionIds.value, option);
  declaredKongs.value = reconcileDeclaredKongs(
    declaredKongs.value,
    hiddenKongAnalysis.value.count,
    kongSelectionTouched.value,
  );
}

function selectKongCount(count: number) {
  if (isLocked.value) {
    return;
  }
  kongSelectionTouched.value = true;
  declaredKongs.value = reconcileDeclaredKongs(count, hiddenKongAnalysis.value.count, true);
}

function submit() {
  if (isLocked.value || !initialized.value) {
    return;
  }
  localSubmitError.value = "";
  clearSubmitRetryTimer();
  submitPending.value = true;
  emit("submit", {
    declaredKongs: declaredKongs.value,
    fishCardIds: [...selectedFishCardIds.value],
  });
  submitRetryTimer = window.setTimeout(() => {
    submitRetryTimer = null;
    if (props.submitted) {
      return;
    }
    submitPending.value = false;
    localSubmitError.value = "暂未收到服务器确认，请重新提交。";
    void nextTick(() => confirmButtonRef.value?.focus());
  }, SUBMIT_CONFIRM_WAIT_MS);
}

function updateHandScrollState(): void {
  const rail = handRailRef.value;
  if (!rail) {
    handHasOverflow.value = false;
    handCanScrollBackward.value = false;
    handCanScrollForward.value = false;
    handVisibleRange.value = { start: 0, end: 0, total: 0 };
    return;
  }
  const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
  handHasOverflow.value = maxScrollLeft > 2;
  handCanScrollBackward.value = rail.scrollLeft > 2;
  handCanScrollForward.value = rail.scrollLeft < maxScrollLeft - 2;

  const cards = Array.from(rail.querySelectorAll<HTMLElement>(".hand-preview-card"));
  const firstCardOffset = cards[0]?.offsetLeft ?? 0;
  const viewportStart = rail.scrollLeft;
  const viewportEnd = viewportStart + rail.clientWidth;
  let visibleIndexes = cards
    .map((card, index) => ({ index, start: card.offsetLeft - firstCardOffset, width: card.offsetWidth }))
    .filter(({ start, width }) => {
      const center = start + width / 2;
      return center >= viewportStart && center <= viewportEnd;
    })
    .map(({ index }) => index);
  if (!visibleIndexes.length) {
    visibleIndexes = cards
      .map((card, index) => ({ index, start: card.offsetLeft - firstCardOffset, width: card.offsetWidth }))
      .filter(({ start, width }) => start + width > viewportStart && start < viewportEnd)
      .map(({ index }) => index);
  }
  handVisibleRange.value = visibleIndexes.length
    ? { start: visibleIndexes[0]! + 1, end: visibleIndexes.at(-1)! + 1, total: cards.length }
    : { start: 0, end: 0, total: cards.length };
}

function scrollHandPreview(direction: "backward" | "forward"): void {
  const rail = handRailRef.value;
  if (!rail) {
    return;
  }
  const distance = Math.max(120, Math.round(rail.clientWidth * 0.72));
  rail.scrollBy({
    left: direction === "forward" ? distance : -distance,
    behavior: shouldReduceMotion(rail) ? "auto" : "smooth",
  });
  window.setTimeout(updateHandScrollState, 320);
}

function shouldReduceMotion(element: HTMLElement | null): boolean {
  return Boolean(element?.closest(".reduce-motion")) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function observeHandScroller(rail: HTMLElement | null): void {
  handResizeObserver?.disconnect();
  handResizeObserver = null;
  if (!rail) {
    updateHandScrollState();
    return;
  }
  if (typeof ResizeObserver !== "undefined") {
    handResizeObserver = new ResizeObserver(updateHandScrollState);
    handResizeObserver.observe(rail);
    rail.querySelectorAll<HTMLElement>(".hand-preview-card").forEach((card) => handResizeObserver?.observe(card));
  }
  void nextTick(updateHandScrollState);
}

watch(
  () => `${props.handReady ? "ready" : "waiting"}|${props.hand.map((card) => card.id).join("|")}`,
  () => {
    if (props.handReady && props.hand.length > 0 && !props.submitted && !submitPending.value) {
      restoreRecommendation();
    }
    void nextTick(() => {
      if (handRailRef.value) {
        handRailRef.value.scrollLeft = 0;
      }
      observeHandScroller(handRailRef.value);
    });
  },
  { immediate: true },
);

watch(
  () => props.serverError,
  (error) => {
    if (error) {
      clearSubmitRetryTimer();
      submitPending.value = false;
    }
  },
);

watch(
  () => [props.connectionReady, props.submitted] as const,
  ([connectionReady, submitted]) => {
    if (connectionReady && !submitted) {
      localSubmitError.value = "";
      return;
    }
    clearSubmitRetryTimer();
    submitPending.value = false;
    if (submitted) {
      localSubmitError.value = "";
    }
  },
);

watch(
  () => `${props.decisionKey}|${props.canRequestMoreTime ? "available" : "used"}`,
  () => {
    const available = props.canRequestMoreTime;
    if (available) {
      clearMoreTimeRetryTimer();
      moreTimeRequested.value = false;
    }
  },
);

watch(
  () => [props.handReady, props.submitted, initialized.value, submitPending.value] as const,
  () => {
    void nextTick(placeInitialFocus);
  },
  { immediate: true },
);

watch(
  () => props.cardMode,
  () => void nextTick(updateHandScrollState),
);

watch(handRailRef, observeHandScroller, { immediate: true });

onBeforeUnmount(() => {
  clearMoreTimeRetryTimer();
  clearSubmitRetryTimer();
  handResizeObserver?.disconnect();
  handResizeObserver = null;
});
</script>

<style scoped>
.sr-only {
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

.declare-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: max(0.35rem, var(--safe-top)) max(0.35rem, var(--safe-right))
    max(0.35rem, var(--safe-bottom)) max(0.35rem, var(--safe-left));
  background:
    radial-gradient(circle at 20% 10%, rgba(20, 184, 166, 0.16), transparent 32%),
    rgba(2, 6, 23, 0.76);
  backdrop-filter: blur(5px);
}

.declare-panel {
  --ink: #172033;
  --muted: #64748b;
  --line: #d7dee8;
  --paper: #fffdf7;
  --fish: #0f766e;
  --fish-soft: #e2f5f1;
  --kong: #b45309;
  --kong-soft: #fff1d6;
  width: min(96vw, 1080px);
  max-height: 92vh;
  overflow: auto;
  color: var(--ink);
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 20px;
  background:
    linear-gradient(rgba(15, 23, 42, 0.025) 1px, transparent 1px) 0 0 / 100% 28px,
    linear-gradient(145deg, #fffefa, #f7f3e9);
  box-shadow: 0 28px 80px rgba(2, 6, 23, 0.48);
  padding: clamp(0.8rem, 2vh, 1.15rem);
  display: grid;
  gap: 0.7rem;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.declare-header {
  position: sticky;
  top: calc(-1 * clamp(0.8rem, 2vh, 1.15rem));
  z-index: 5;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-top: calc(-1 * clamp(0.8rem, 2vh, 1.15rem));
  padding: clamp(0.8rem, 2vh, 1.15rem) 0 0.55rem;
  background: linear-gradient(180deg, #fffefa 84%, rgba(255, 254, 250, 0));
}

.declare-heading {
  min-width: 0;
}

.declare-kicker,
.section-index {
  color: var(--fish);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.declare-heading h2 {
  margin: 0.08rem 0 0;
  font-family: "STKaiti", "KaiTi", serif;
  font-size: clamp(1.3rem, 3vh, 1.75rem);
  letter-spacing: 0.04em;
}

.declare-heading p {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.declare-timer-tools {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}

.declare-timer {
  flex: 0 0 auto;
  min-width: 4.6rem;
  min-height: 3.45rem;
  padding: 0.4rem 0.7rem;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.2rem;
  color: #fff7ed;
  border-radius: 14px;
  background: linear-gradient(145deg, #9a3412, #dc2626);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18), 0 8px 20px rgba(185, 28, 28, 0.18);
}

.declare-timer strong {
  font-size: 1.75rem;
  line-height: 1;
}

.declare-timer span {
  font-size: 0.72rem;
}

.declare-timer.urgent {
  animation: timer-pulse 1s ease-in-out infinite;
}

.declare-more-time {
  min-height: 3.45rem;
  padding: 0.35rem 0.72rem;
  border: 1px solid #0e7490;
  border-radius: 14px;
  background: #ecfeff;
  color: #155e75;
  display: grid;
  place-content: center;
  gap: 0.08rem;
  font-weight: 800;
  cursor: pointer;
}

.declare-more-time span {
  font-size: 0.68rem;
}

.declare-more-time strong {
  font-size: 0.92rem;
}

.declare-progress {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #e2e8f0;
}

.declare-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--fish), #2dd4bf);
  transition: width 0.3s ease;
}

.declare-submitted {
  margin: 0;
  padding: 0.55rem 0.75rem;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  background: #f0fdf4;
  font-weight: 700;
}

.declare-submitted span {
  display: inline-grid;
  place-items: center;
  width: 1.35rem;
  height: 1.35rem;
  margin-right: 0.3rem;
  color: white;
  border-radius: 50%;
  background: #16a34a;
}

.declare-syncing {
  margin: 0;
  min-height: 4.5rem;
  padding: 0.75rem;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  background: #f0f9ff;
  color: #075985;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  text-align: left;
}

.declare-syncing > span:last-child {
  display: grid;
  gap: 0.15rem;
}

.declare-syncing small {
  color: #475569;
  font-weight: 500;
}

.hand-preview,
.declare-section {
  min-width: 0;
  padding: 0.65rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
}

.section-heading,
.section-heading > div {
  display: flex;
  align-items: center;
}

.section-heading {
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.section-heading > div {
  gap: 0.5rem;
}

.section-heading h3 {
  margin: 0;
  font-size: 0.94rem;
}

.section-result {
  flex: 0 0 auto;
  padding: 0.2rem 0.55rem;
  color: var(--fish);
  border-radius: 999px;
  background: var(--fish-soft);
  font-size: 0.72rem;
  font-weight: 800;
}

.section-result.amber {
  color: var(--kong);
  background: var(--kong-soft);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
}

.hand-heading-tools {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.hand-total {
  flex: 0 0 auto;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 800;
  white-space: nowrap;
}

.declare-hand-scroll-tools {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
}

.declare-hand-scroll-tools button {
  min-width: 3rem;
  height: 2.25rem;
  padding: 0 0.5rem;
  border: 1px solid #0f766e;
  border-radius: 0.5rem;
  background: #0f766e;
  color: #f0fdfa;
  font-size: 0.86rem;
  font-weight: 900;
  line-height: 1;
}

.declare-hand-scroll-tools button:disabled {
  border-color: #cbd5e1;
  background: #e2e8f0;
  color: #64748b;
  opacity: 0.78;
}

.declare-hand-visible-range {
  min-width: 4.7rem;
  height: 2.25rem;
  padding: 0 0.42rem;
  border: 1px solid #94a3b8;
  border-radius: 999px;
  background: #f8fafc;
  color: #0f172a;
  display: inline-grid;
  place-items: center;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--muted);
  font-size: 0.7rem;
}

.legend-item i {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 2px;
  background: currentColor;
}

.legend-item.fish {
  color: var(--fish);
}

.legend-item.kong {
  color: var(--kong);
}

.hand-rail {
  display: flex;
  gap: 0.35rem;
  min-width: 0;
  overflow-x: auto;
  padding: 0.18rem 0.12rem 0.35rem;
  scrollbar-width: thin;
  overscroll-behavior-inline: contain;
  touch-action: pan-x;
}

.hand-preview-card {
  flex: 0 0 auto;
  padding: 0.16rem;
  border: 2px solid transparent;
  border-radius: 9px;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.hand-preview-card.fish {
  border-color: var(--fish);
  background: var(--fish-soft);
  transform: translateY(-2px);
}

.hand-preview-card.kong {
  border-color: #f59e0b;
  background: var(--kong-soft);
}

.declare-controls {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(15rem, 0.65fr);
  gap: 0.7rem;
  min-width: 0;
}

.fish-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.fish-option {
  position: relative;
  min-width: 0;
  min-height: 64px;
  padding: 0.45rem 2rem 0.45rem 0.55rem;
  display: grid;
  grid-template-columns: minmax(4.5rem, auto) minmax(0, 1fr);
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
  color: var(--ink);
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.fish-option.selected {
  border-color: var(--fish);
  background: linear-gradient(135deg, #f0fdfa, var(--fish-soft));
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
}

.fish-option-copy {
  display: grid;
  gap: 0.08rem;
}

.fish-option-copy strong {
  font-size: 0.82rem;
}

.fish-option-copy small {
  color: var(--muted);
  font-size: 0.68rem;
}

.fish-option.selected .fish-option-copy small {
  color: var(--fish);
}

.fish-option-cards {
  display: flex;
  gap: 0.2rem;
  min-width: 0;
  overflow: hidden;
}

.option-check {
  position: absolute;
  top: 50%;
  right: 0.55rem;
  display: grid;
  place-items: center;
  width: 1.2rem;
  height: 1.2rem;
  color: transparent;
  border: 1px solid #94a3b8;
  border-radius: 50%;
  transform: translateY(-50%);
}

.fish-option.selected .option-check {
  color: white;
  border-color: var(--fish);
  background: var(--fish);
}

.empty-option {
  min-height: 64px;
  display: grid;
  place-content: center;
  gap: 0.1rem;
  color: var(--muted);
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  text-align: center;
}

.empty-option strong {
  color: #475569;
  font-size: 0.82rem;
}

.empty-option span {
  font-size: 0.7rem;
}

.kong-choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
  gap: 0.45rem;
}

.kong-choice {
  min-width: 48px;
  min-height: 54px;
  padding: 0.25rem;
  display: grid;
  place-content: center;
  color: #78350f;
  border: 1px solid #f3c77b;
  border-radius: 11px;
  background: #fffbeb;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.kong-choice strong {
  font-size: 1.15rem;
  line-height: 1;
}

.kong-choice span {
  font-size: 0.62rem;
}

.kong-choice.selected {
  color: white;
  border-color: var(--kong);
  background: linear-gradient(145deg, #d97706, #92400e);
  box-shadow: 0 5px 14px rgba(180, 83, 9, 0.22);
}

.kong-note {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.35;
}

.declaration-loading {
  min-height: 9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  color: var(--muted);
}

.loading-mark {
  width: 1rem;
  height: 1rem;
  border: 2px solid #cbd5e1;
  border-top-color: var(--fish);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.declare-footer {
  position: sticky;
  bottom: calc(-1 * clamp(0.8rem, 2vh, 1.15rem));
  z-index: 5;
  display: grid;
  grid-template-columns: minmax(11rem, auto) minmax(20rem, 1fr);
  align-items: center;
  gap: 0.7rem;
  margin: 0 calc(-1 * clamp(0.8rem, 2vh, 1.15rem)) calc(-1 * clamp(0.8rem, 2vh, 1.15rem));
  padding: 0.6rem clamp(0.8rem, 2vh, 1.15rem) clamp(0.8rem, 2vh, 1.15rem);
  background: linear-gradient(180deg, rgba(247, 243, 233, 0), #f7f3e9 24%);
}

.footer-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.7rem;
}

.footer-meta p {
  margin: 0;
  color: var(--muted);
  font-size: 0.68rem;
}

.timeout-dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  margin-right: 0.25rem;
  border-radius: 50%;
  background: #dc2626;
}

.untimed-dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  margin-right: 0.25rem;
  border-radius: 50%;
  background: #059669;
}

.footer-meta .untimed-message {
  color: #065f46;
  font-size: max(0.75rem, 12px);
  font-weight: 750;
  white-space: nowrap;
}

.declare-timer.untimed {
  min-width: 5.7rem;
  border-color: #6ee7b7;
  background: #ecfdf5;
  color: #065f46;
}

.declare-timer.untimed strong {
  font-size: clamp(1rem, 3.4vh, 1.35rem);
}

.reset-recommendation {
  min-height: 42px;
  padding: 0.35rem 0.75rem;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  cursor: pointer;
}

.confirm-declaration {
  min-height: 54px;
  padding: 0.55rem 1rem;
  display: grid;
  place-content: center;
  color: white;
  border: 0;
  border-radius: 13px;
  background: linear-gradient(135deg, #0f766e, #0d9488);
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.24);
  font-size: 0.94rem;
  font-weight: 800;
  cursor: pointer;
}

.confirm-declaration small {
  margin-top: 0.08rem;
  color: #ccfbf1;
  font-size: 0.62rem;
  font-weight: 500;
}

.declare-error {
  width: 100%;
  color: #b91c1c !important;
  font-weight: 700;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

button:focus-visible {
  outline: 3px solid rgba(14, 165, 233, 0.45);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .fish-option:not(:disabled):hover,
  .kong-choice:not(:disabled):hover,
  .reset-recommendation:not(:disabled):hover {
    transform: translateY(-2px);
  }
}

.declare-panel.compact {
  width: 100%;
  height: 100%;
  max-height: none;
  padding: 0.55rem;
  gap: 0.42rem;
  border-radius: 12px;
}

.declare-panel.compact .declare-header {
  top: -0.55rem;
  margin-top: -0.55rem;
  padding: 0.55rem 0 0.3rem;
}

.declare-panel.compact .declare-heading p {
  display: none;
}

.declare-panel.compact .declare-timer {
  min-width: 4.1rem;
  min-height: 2.8rem;
}

.declare-panel.compact .declare-timer-tools {
  gap: 0.3rem;
}

.declare-panel.compact .declare-more-time {
  min-width: 4.5rem;
  min-height: 2.8rem;
  padding: 0.2rem 0.45rem;
}

.declare-panel.compact .more-time-prefix {
  display: none;
}

.declare-panel.compact .declare-timer strong {
  font-size: 1.45rem;
}

.declare-panel.compact .hand-preview,
.declare-panel.compact .declare-section {
  padding: 0.45rem;
  border-radius: 11px;
}

.declare-panel.compact .section-heading {
  margin-bottom: 0.35rem;
}

.declare-panel.compact .section-result,
.declare-panel.compact .hand-total,
.declare-panel.compact .declare-timer span,
.declare-panel.compact .declare-more-time span,
.declare-panel.compact .fish-option-copy small,
.declare-panel.compact .empty-option span,
.declare-panel.compact .kong-choice span,
.declare-panel.compact .footer-meta p,
.declare-panel.compact .confirm-declaration small {
  font-size: max(0.8125rem, 13px);
}

.declare-panel.compact .section-index {
  font-size: max(0.75rem, 12px);
}

.declare-panel.compact .section-heading h3,
.declare-panel.compact .fish-option-copy strong,
.declare-panel.compact .empty-option strong,
.declare-panel.compact .declare-more-time strong {
  font-size: max(0.875rem, 14px);
}

.declare-panel.compact .declare-hand-scroll-tools button {
  min-width: 44px;
  height: 36px;
  padding: 0 0.42rem;
  font-size: max(0.8125rem, 13px);
}

.declare-panel.compact .declare-hand-visible-range {
  min-width: 4.25rem;
  height: 36px;
  padding: 0 0.28rem;
  font-size: max(0.8125rem, 13px);
}

.declare-panel.compact .hand-rail {
  gap: 2px;
}

.declare-panel.compact .hand-preview-card :deep(.card.size-sm.mode-large) {
  width: 40px;
  height: 44px;
  font-size: 17px;
}

.declare-panel.compact .hand-preview-card :deep(.card.size-sm.mode-long) {
  width: 28px;
  height: 52px;
  font-size: 16px;
}

.declare-panel.compact .declare-controls {
  grid-template-columns: minmax(0, 1.35fr) minmax(13rem, 0.65fr);
  gap: 0.42rem;
}

.declare-panel.compact .fish-options {
  display: flex;
  overflow-x: auto;
  gap: 0.4rem;
  padding: 0.12rem 0.12rem 0.25rem;
  touch-action: pan-x;
}

.declare-panel.compact .fish-option {
  flex: 0 0 min(20rem, 82%);
  min-height: 58px;
}

.declare-panel.compact .kong-choice {
  min-height: 48px;
}

.declare-panel.compact .kong-note {
  display: none;
}

.declare-panel.compact .declare-footer {
  bottom: -0.55rem;
  grid-template-columns: minmax(12rem, auto) minmax(19rem, 1fr);
  margin: 0 -0.55rem -0.55rem;
  padding: 0.4rem 0.55rem 0.55rem;
}

.declare-panel.compact .confirm-declaration {
  min-height: 50px;
}

.declare-panel.ultra-compact .declare-kicker,
.declare-panel.ultra-compact .legend,
.declare-panel.ultra-compact .footer-meta p:not(.declare-error):not(.untimed-message),
.declare-panel.ultra-compact .confirm-declaration small {
  display: none;
}

.declare-panel.ultra-compact .declare-heading h2 {
  font-size: 1.12rem;
}

.declare-panel.ultra-compact .hand-preview-card {
  padding: 0.08rem;
}

@media (max-width: 680px) and (pointer: fine) {
  .declare-controls,
  .declare-footer {
    grid-template-columns: 1fr;
  }

  .fish-options {
    grid-template-columns: 1fr;
  }
}

@keyframes timer-pulse {
  50% {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18), 0 0 0 5px rgba(220, 38, 38, 0.12);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
</style>
