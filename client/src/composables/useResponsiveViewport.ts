import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

const PHONE_SHORT_EDGE_MAX = 600;
const PORTRAIT_PHONE_MIN_ASPECT = 1.35;
const ROOMY_TOUCH_MIN_EDGE = 600;
const ROOMY_TOUCH_MAX_ASPECT = 4 / 3;
const COMPACT_WIDTH_MAX = 960;
const COMPACT_HEIGHT_MAX = 500;
const ULTRA_COMPACT_WIDTH_MAX = 720;
const ULTRA_COMPACT_HEIGHT_MAX = 380;
const LEGACY_COMPACT_WIDTH_MAX = 600;
const LEGACY_COMPACT_HEIGHT_MAX = 340;

type ViewportRect = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;
type SegmentedWindow = Window & { viewport?: { segments?: readonly DOMRectReadOnly[] | null } };

function hasOccludedGap(segments: readonly DOMRectReadOnly[]): boolean {
  return segments.some((a, index) => segments.slice(index + 1).some(b => {
    const shareRows = Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
    const shareColumns = Math.min(a.right, b.right) > Math.max(a.left, b.left);
    return (shareRows && (a.right < b.left || b.right < a.left))
      || (shareColumns && (a.bottom < b.top || b.bottom < a.top));
  }));
}

function selectPane(visible: ViewportRect, segments: readonly DOMRectReadOnly[]): ViewportRect | null {
  if (!hasOccludedGap(segments)) return null;
  let best: ViewportRect | null = null;
  for (const segment of segments) {
    const left = Math.max(visible.left, segment.left);
    const top = Math.max(visible.top, segment.top);
    const width = Math.min(visible.left + visible.width, segment.right) - left;
    const height = Math.min(visible.top + visible.height, segment.bottom) - top;
    if (width > 0 && height > 0 && (!best || width * height > best.width * best.height)) {
      best = { left, top, width, height };
    }
  }
  return best;
}

export function useResponsiveViewport(geometryBusy?: Ref<boolean>) {
  const viewportWidth = ref(typeof window === "undefined" ? 1280 : window.innerWidth);
  const viewportHeight = ref(typeof window === "undefined" ? 720 : window.innerHeight);
  const viewportLeft = ref(0);
  const viewportTop = ref(0);
  const coarsePointer = ref(false);
  const hasViewportHinge = ref(false);
  let coarsePointerQuery: MediaQueryList | null = null;
  let segmentQueries: MediaQueryList[] = [];
  let devicePosture: EventTarget | undefined;
  let focusVisibilityTimer: number | null = null;

  const updateViewport = () => {
    const visual = window.visualViewport;
    // Pinch zoom is magnification, not a request to rotate/reflow the table.
    // innerWidth may expand to fit the previous rotated canvas on iOS/mobile
    // emulation; the root client size still describes the new layout viewport.
    const useVisual = visual && Math.abs(visual.scale - 1) < 0.01;
    const visible = {
      width: useVisual ? visual.width : document.documentElement.clientWidth || window.innerWidth,
      height: useVisual ? visual.height : document.documentElement.clientHeight || window.innerHeight,
      left: useVisual ? visual.offsetLeft : 0,
      top: useVisual ? visual.offsetTop : 0,
    };
    const pane = selectPane(visible, (window as SegmentedWindow).viewport?.segments ?? []);
    // A physical occlusion takes effect immediately, including during a flight.
    if (geometryBusy?.value && !pane && !hasViewportHinge.value) return;
    hasViewportHinge.value = Boolean(pane);
    const usable = pane ?? visible;
    viewportWidth.value = usable.width;
    viewportHeight.value = usable.height;
    viewportLeft.value = usable.left;
    viewportTop.value = usable.top;
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
    () => !hasViewportHinge.value && isPhoneLike.value
      && viewportHeight.value >= viewportWidth.value * PORTRAIT_PHONE_MIN_ASPECT,
  );
  const effectiveWidth = computed(() =>
    isRotatedPhonePortrait.value ? viewportHeight.value : viewportWidth.value,
  );
  const effectiveHeight = computed(() =>
    isRotatedPhonePortrait.value ? viewportWidth.value : viewportHeight.value,
  );
  const isRoomyTouchViewport = computed(() => {
    const short = Math.min(effectiveWidth.value, effectiveHeight.value);
    const long = Math.max(effectiveWidth.value, effectiveHeight.value);
    return coarsePointer.value && short >= ROOMY_TOUCH_MIN_EDGE && long <= short * ROOMY_TOUCH_MAX_ASPECT;
  });
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
    segmentQueries = [
      window.matchMedia("(horizontal-viewport-segments >= 2)"),
      window.matchMedia("(vertical-viewport-segments >= 2)"),
    ];
    devicePosture = (navigator as Navigator & { devicePosture?: EventTarget }).devicePosture;
    devicePosture?.addEventListener("change", updateViewport);
    segmentQueries.forEach(query => query.addEventListener?.("change", updateViewport));
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
    segmentQueries.forEach(query => query.removeEventListener?.("change", updateViewport));
    devicePosture?.removeEventListener("change", updateViewport);
    window.visualViewport?.removeEventListener("resize", handleVisualViewportResize);
    if (focusVisibilityTimer !== null) {
      window.clearTimeout(focusVisibilityTimer);
    }
  });

  return {
    effectiveHeight,
    effectiveWidth,
    hasViewportHinge,
    isCompactViewport,
    isLegacyCompactViewport,
    isPhoneLike,
    isRoomyTouchViewport,
    isRotatedPhonePortrait,
    isUltraCompactViewport,
    viewportLeft,
    viewportTop,
    viewportHeight,
    viewportWidth,
  };
}
