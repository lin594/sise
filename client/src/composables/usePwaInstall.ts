import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

type StandaloneNavigator = Navigator & { standalone?: boolean };

export type PwaInstallGuide = {
  kind: "wechat" | "ios" | "mac-safari" | "android" | "browser";
  title: string;
  description: string;
  steps: string[];
};

export type PwaInstallRequestResult =
  | { kind: "accepted" | "dismissed" }
  | { kind: "guide"; guide: PwaInstallGuide };

type BrowserFamily = PwaInstallGuide["kind"] | "unsupported";

function detectBrowserFamily(): BrowserFamily {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const isWechat = /MicroMessenger/iu.test(userAgent);
  const isIos = /iPad|iPhone|iPod/iu.test(userAgent)
    || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/iu.test(userAgent);
  const isChromium = /Chrome|Chromium|CriOS|EdgA|EdgiOS|Edg/iu.test(userAgent);
  const isSafari = /Safari/iu.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/iu.test(userAgent);
  const isMac = /Mac/iu.test(platform) || /Macintosh/iu.test(userAgent);

  if (isWechat) return "wechat";
  if (isIos) return "ios";
  if (isAndroid) return "android";
  if (isMac && isSafari) return "mac-safari";
  if (isChromium) return "browser";
  return "unsupported";
}

function guideFor(family: Exclude<BrowserFamily, "unsupported">): PwaInstallGuide {
  if (family === "wechat") {
    return {
      kind: family,
      title: "先在浏览器里打开",
      description: "微信里不能直接调起系统安装。当前好友房地址会保留，不需要重新找链接。",
      steps: ["点右上角“…”", "选择“在浏览器打开”", "回到页面后再点“安装四色牌”"],
    };
  }
  if (family === "ios") {
    return {
      kind: family,
      title: "添加到主屏幕",
      description: "添加后会以独立窗口打开，牌面空间更宽；游戏仍需联网。",
      steps: ["点浏览器的“分享”按钮", "选择“添加到主屏幕”", "打开“作为 Web App 打开”，再点“添加”"],
    };
  }
  if (family === "mac-safari") {
    return {
      kind: family,
      title: "添加到程序坞",
      description: "添加后可像普通应用一样从程序坞或聚焦搜索打开；游戏仍需联网。",
      steps: ["打开 Safari 的“文件”菜单", "选择“添加到程序坞…”", "确认名称为“四色牌”，再点“添加”"],
    };
  }
  if (family === "android") {
    return {
      kind: family,
      title: "安装四色牌",
      description: "当前浏览器没有提供一键安装框，可以从浏览器菜单添加；游戏仍需联网。",
      steps: ["打开浏览器右上角菜单", "选择“安装应用”或“添加到主屏幕”", "按系统提示确认安装"],
    };
  }
  return {
    kind: family,
    title: "安装四色牌",
    description: "当前浏览器没有提供一键安装框，可以从浏览器菜单安装；游戏仍需联网。",
    steps: ["打开浏览器菜单", "选择“安装四色牌”或“安装应用”", "按系统提示确认安装"],
  };
}

export function usePwaInstall() {
  const deferredPrompt = shallowRef<BeforeInstallPromptEvent | null>(null);
  const installed = ref(false);
  const standalone = ref(false);
  const browserFamily = ref<BrowserFamily>("unsupported");
  let displayModeQuery: MediaQueryList | null = null;

  function updateStandaloneState(): void {
    standalone.value = Boolean(
      displayModeQuery?.matches || (navigator as StandaloneNavigator).standalone,
    );
  }

  function onBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    deferredPrompt.value = event as BeforeInstallPromptEvent;
  }

  function onAppInstalled(): void {
    installed.value = true;
    deferredPrompt.value = null;
  }

  const canOfferInstall = computed(() =>
    !installed.value
    && !standalone.value
    && (Boolean(deferredPrompt.value) || browserFamily.value !== "unsupported"),
  );

  async function requestInstall(): Promise<PwaInstallRequestResult> {
    const prompt = deferredPrompt.value;
    if (prompt) {
      deferredPrompt.value = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        installed.value = true;
      }
      return { kind: choice.outcome };
    }

    const family = browserFamily.value === "unsupported" ? "browser" : browserFamily.value;
    return { kind: "guide", guide: guideFor(family) };
  }

  onMounted(() => {
    browserFamily.value = detectBrowserFamily();
    displayModeQuery = window.matchMedia("(display-mode: standalone)");
    updateStandaloneState();
    if (displayModeQuery.addEventListener) {
      displayModeQuery.addEventListener("change", updateStandaloneState);
    } else {
      displayModeQuery.addListener(updateStandaloneState);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
  });

  onUnmounted(() => {
    if (displayModeQuery?.removeEventListener) {
      displayModeQuery.removeEventListener("change", updateStandaloneState);
    } else {
      displayModeQuery?.removeListener(updateStandaloneState);
    }
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.removeEventListener("appinstalled", onAppInstalled);
    displayModeQuery = null;
    deferredPrompt.value = null;
  });

  return {
    canOfferInstall,
    requestInstall,
  };
}
