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

function selectPane(visible: ViewportRect, segments: readonly DOMRectReadOnly[]): { visible: ViewportRect; segment: DOMRectReadOnly } | null {
  if (!hasOccludedGap(segments)) return null;
  let best: { visible: ViewportRect; segment: DOMRectReadOnly } | null = null;
  for (const segment of segments) {
    const left = Math.max(visible.left, segment.left);
    const top = Math.max(visible.top, segment.top);
    const width = Math.min(visible.left + visible.width, segment.right) - left;
    const height = Math.min(visible.top + visible.height, segment.bottom) - top;
    if (width > 0 && height > 0 && (!best || width * height > best.visible.width * best.visible.height)) {
      best = { visible: { left, top, width, height }, segment };
    }
  }
  return best;
}

export function useResponsiveViewport(geometryBusy?: Ref<boolean>) {
  const viewportWidth = ref(typeof window === "undefined" ? 1280 : window.innerWidth);
  const viewportHeight = ref(typeof window === "undefined" ? 720 : window.innerHeight);
  const layoutWidth = ref(viewportWidth.value);
  const layoutHeight = ref(viewportHeight.value);
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
    const layout = {
      width: document.documentElement.clientWidth || window.innerWidth,
      height: document.documentElement.clientHeight || window.innerHeight,
    };
    // Pinch zoom is magnification, not a request to rotate/reflow the table.
    // innerWidth may expand to fit the previous rotated canvas on iOS/mobile
    // emulation; the root client size still describes the new layout viewport.
    const useVisual = visual && Math.abs(visual.scale - 1) < 0.01;
    const visible = {
      width: useVisual ? visual.width : layout.width,
      height: useVisual ? visual.height : layout.height,
      left: useVisual ? visual.offsetLeft : 0,
      top: useVisual ? visual.offsetTop : 0,
    };
    const pane = selectPane(visible, (window as SegmentedWindow).viewport?.segments ?? []);
    // A physical occlusion takes effect immediately, including during a flight.
    if (geometryBusy?.value && !pane && !hasViewportHinge.value) return;
    hasViewportHinge.value = Boolean(pane);
    const usable = pane?.visible ?? visible;
    // A keyboard changes the visible area, not the device's orientation. Use
    // the layout viewport (or the chosen physical pane before clipping) for
    // rotation, while still fitting the table and dialogs above the keyboard.
    layoutWidth.value = pane?.segment.width ?? layout.width;
    layoutHeight.value = pane?.segment.height ?? layout.height;
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
    () => (coarsePointer.value || hasViewportHinge.value)
      && Math.min(layoutWidth.value, layoutHeight.value) <= PHONE_SHORT_EDGE_MAX,
  );
  const isRotatedPhonePortrait = computed(
    () => isPhoneLike.value
      && layoutHeight.value >= layoutWidth.value * PORTRAIT_PHONE_MIN_ASPECT,
  );
  const effectiveWidth = computed(() =>
    isRotatedPhonePortrait.value ? viewportHeight.value : viewportWidth.value,
  );
  const effectiveHeight = computed(() =>
    isRotatedPhonePortrait.value ? viewportWidth.value : viewportHeight.value,
  );
  const roomForTwoHandRows = computed(() => {
    const short = Math.min(effectiveWidth.value, effectiveHeight.value);
    const long = Math.max(effectiveWidth.value, effectiveHeight.value);
    return short >= ROOMY_TOUCH_MIN_EDGE && long <= short * ROOMY_TOUCH_MAX_ASPECT;
  });
  const isRoomyTouchViewport = computed(() => coarsePointer.value && roomForTwoHandRows.value);
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

  let segmentObserver: ResizeObserver | undefined;
  const segmentProbes: HTMLElement[] = [];
  function observeSegmentGeometry() {
    if (!("viewport" in window) || typeof ResizeObserver === "undefined") return;
    // The hinge can move or close while the viewport size and segment count stay the same.
    segmentObserver = new ResizeObserver(updateViewport);
    for (const [width, height] of [
      ["viewport-segment-right 0 0", "viewport-segment-bottom 0 0"],
      ["viewport-segment-left 1 0", "viewport-segment-top 0 1"],
    ]) {
      const probe = document.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:strict;width:env(${width},0px);height:env(${height},0px)`;
      document.body.append(probe);
      segmentProbes.push(probe);
      segmentObserver.observe(probe);
    }
  }

  onMounted(() => {
    observeSegmentGeometry();
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
    segmentObserver?.disconnect();
    segmentProbes.forEach(probe => probe.remove());
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
    roomForTwoHandRows,
    isRotatedPhonePortrait,
    isUltraCompactViewport,
    viewportLeft,
    viewportTop,
    viewportHeight,
    viewportWidth,
  };
}
