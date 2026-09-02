import { onMounted, onUnmounted, watch, type Ref } from "vue";

interface WakeLockSentinelLike {
  readonly released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void, options?: { once?: boolean }) => void;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

/**
 * 作用：在前台牌局期间尽力阻止屏幕自动熄灭。
 * 关键输入/输出：监听牌局活跃状态和本地开关；无返回值。
 * 副作用：申请或释放浏览器 Screen Wake Lock，不支持时静默降级。
 */
export function useScreenWakeLock(active: Readonly<Ref<boolean>>, enabled: Readonly<Ref<boolean>>): void {
  let sentinel: WakeLockSentinelLike | null = null;
  let requestSequence = 0;
  let requestPending = false;

  const shouldHold = (): boolean => active.value && enabled.value && document.visibilityState === "visible";

  const release = (): void => {
    requestSequence += 1;
    const current = sentinel;
    sentinel = null;
    if (current && !current.released) {
      void current.release().catch(() => undefined);
    }
  };

  const sync = async (): Promise<void> => {
    if (!shouldHold()) {
      release();
      return;
    }
    if (sentinel && !sentinel.released) {
      return;
    }
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock || requestPending) {
      return;
    }

    const sequence = ++requestSequence;
    requestPending = true;
    try {
      const next = await wakeLock.request("screen");
      if (sequence !== requestSequence || !shouldHold()) {
        if (!next.released) {
          void next.release().catch(() => undefined);
        }
        return;
      }
      sentinel = next;
      next.addEventListener("release", () => {
        if (sentinel === next) {
          sentinel = null;
        }
      }, { once: true });
    } catch {
      // Wake lock is optional and may be denied by the browser or operating system.
    } finally {
      requestPending = false;
    }
  };

  const handleVisibilityChange = (): void => {
    void sync();
  };
  const retryAfterGesture = (): void => {
    if (!sentinel && shouldHold()) {
      void sync();
    }
  };

  watch(
    () => [active.value, enabled.value] as const,
    () => void sync(),
    { immediate: true },
  );

  onMounted(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointerdown", retryAfterGesture, { passive: true });
  });

  onUnmounted(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pointerdown", retryAfterGesture);
    release();
  });
}
