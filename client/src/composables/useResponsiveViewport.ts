import { computed, onMounted, onUnmounted, ref } from "vue";

const PHONE_SHORT_EDGE_MAX = 600;
const COMPACT_WIDTH_MAX = 960;
const COMPACT_HEIGHT_MAX = 500;
const ULTRA_COMPACT_WIDTH_MAX = 720;
const ULTRA_COMPACT_HEIGHT_MAX = 380;

export function useResponsiveViewport() {
  const viewportWidth = ref(typeof window === "undefined" ? 1280 : window.innerWidth);
  const viewportHeight = ref(typeof window === "undefined" ? 720 : window.innerHeight);
  const coarsePointer = ref(false);
  let coarsePointerQuery: MediaQueryList | null = null;
  let focusVisibilityTimer: number | null = null;

  const updateViewport = () => {
    viewportWidth.value = window.innerWidth;
    viewportHeight.value = window.innerHeight;
    coarsePointer.value = Boolean(coarsePointerQuery?.matches);
  };

  const keepFocusedControlVisible = () => {
    if (focusVisibilityTimer !== null) {
      window.clearTimeout(focusVisibilityTimer);
    }
    focusVisibilityTimer = window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
      focusVisibilityTimer = null;
    }, 80);
  };

  const isPhoneLike = computed(
    () => coarsePointer.value && Math.min(viewportWidth.value, viewportHeight.value) <= PHONE_SHORT_EDGE_MAX,
  );
  const isRotatedPhonePortrait = computed(
    () => isPhoneLike.value && viewportHeight.value > viewportWidth.value,
  );
  const effectiveWidth = computed(() =>
    isRotatedPhonePortrait.value ? viewportHeight.value : viewportWidth.value,
  );
  const effectiveHeight = computed(() =>
    isRotatedPhonePortrait.value ? viewportWidth.value : viewportHeight.value,
  );
  const isCompactViewport = computed(
    () => effectiveWidth.value <= COMPACT_WIDTH_MAX || effectiveHeight.value <= COMPACT_HEIGHT_MAX,
  );
  const isUltraCompactViewport = computed(
    () =>
      effectiveWidth.value <= ULTRA_COMPACT_WIDTH_MAX ||
      effectiveHeight.value <= ULTRA_COMPACT_HEIGHT_MAX,
  );

  onMounted(() => {
    coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    coarsePointerQuery.addEventListener?.("change", updateViewport);
    window.visualViewport?.addEventListener("resize", keepFocusedControlVisible);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateViewport);
    window.removeEventListener("orientationchange", updateViewport);
    coarsePointerQuery?.removeEventListener?.("change", updateViewport);
    window.visualViewport?.removeEventListener("resize", keepFocusedControlVisible);
    if (focusVisibilityTimer !== null) {
      window.clearTimeout(focusVisibilityTimer);
    }
  });

  return {
    effectiveHeight,
    effectiveWidth,
    isCompactViewport,
    isPhoneLike,
    isRotatedPhonePortrait,
    isUltraCompactViewport,
  };
}
