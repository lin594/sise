import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

const PHONE_SHORT_EDGE_MAX = 600;
const COMPACT_WIDTH_MAX = 960;
const COMPACT_HEIGHT_MAX = 500;
const ULTRA_COMPACT_WIDTH_MAX = 720;
const ULTRA_COMPACT_HEIGHT_MAX = 380;
const LEGACY_COMPACT_WIDTH_MAX = 600;
const LEGACY_COMPACT_HEIGHT_MAX = 340;

export function useResponsiveViewport(geometryBusy?: Ref<boolean>) {
  const viewportWidth = ref(typeof window === "undefined" ? 1280 : window.innerWidth);
  const viewportHeight = ref(typeof window === "undefined" ? 720 : window.innerHeight);
  const viewportLeft = ref(0);
  const viewportTop = ref(0);
  const coarsePointer = ref(false);
  let coarsePointerQuery: MediaQueryList | null = null;
  let focusVisibilityTimer: number | null = null;

  const updateViewport = () => {
    if (geometryBusy?.value) return;
    const visual = window.visualViewport;
    // Pinch zoom is magnification, not a request to rotate/reflow the table.
    const useVisual = visual && Math.abs(visual.scale - 1) < 0.01;
    viewportWidth.value = useVisual ? visual.width : window.innerWidth;
    viewportHeight.value = useVisual ? visual.height : window.innerHeight;
    viewportLeft.value = useVisual ? visual.offsetLeft : 0;
    viewportTop.value = useVisual ? visual.offsetTop : 0;
    coarsePointer.value = Boolean(coarsePointerQuery?.matches);
  };

  if (geometryBusy) watch(geometryBusy, busy => { if (!busy) updateViewport(); });

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

  const handleVisualViewportResize = () => {
    updateViewport();
    keepFocusedControlVisible();
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
  const isLegacyCompactViewport = computed(
    () =>
      effectiveWidth.value <= LEGACY_COMPACT_WIDTH_MAX &&
      effectiveHeight.value <= LEGACY_COMPACT_HEIGHT_MAX,
  );

  onMounted(() => {
    coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("pageshow", updateViewport);
    document.addEventListener("visibilitychange", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    coarsePointerQuery.addEventListener?.("change", updateViewport);
    window.visualViewport?.addEventListener("resize", handleVisualViewportResize);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateViewport);
    window.removeEventListener("pageshow", updateViewport);
    document.removeEventListener("visibilitychange", updateViewport);
    window.visualViewport?.removeEventListener("scroll", updateViewport);
    window.removeEventListener("orientationchange", updateViewport);
    coarsePointerQuery?.removeEventListener?.("change", updateViewport);
    window.visualViewport?.removeEventListener("resize", handleVisualViewportResize);
    if (focusVisibilityTimer !== null) {
      window.clearTimeout(focusVisibilityTimer);
    }
  });

  return {
    effectiveHeight,
    effectiveWidth,
    isCompactViewport,
    isLegacyCompactViewport,
    isPhoneLike,
    isRotatedPhonePortrait,
    isUltraCompactViewport,
    viewportLeft,
    viewportTop,
    viewportHeight,
    viewportWidth,
  };
}
