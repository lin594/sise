import { openGameAs, startLobbyAction } from "./helpers/game";
import { revealSetting } from "./helpers/settings";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

function pngInfo(bytes: Buffer): { width: number; height: number; colorType: number } {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

test("publishes a recognizable browser and home-screen identity", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/sise-180.png");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0b1220");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /四人|四色牌/u);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "四色牌");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black");

  const manifestResponse = await page.request.get("/site.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "四色牌",
    short_name: "四色牌",
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    handle_links: "preferred",
    launch_handler: {
      client_mode: ["navigate-existing", "auto"],
    },
    related_applications: [
      {
        platform: "webapp",
        url: "/site.webmanifest",
        id: "/",
      },
    ],
    background_color: "#020617",
    theme_color: "#0b1220",
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/sise-192.png", sizes: "192x192", type: "image/png" }),
    expect.objectContaining({ src: "/icons/sise-512.png", sizes: "512x512", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/sise-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }),
  ]));

  for (const [src, size] of [
    ["/icons/sise-180.png", 180],
    ["/icons/sise-192.png", 192],
    ["/icons/sise-512.png", 512],
    ["/icons/sise-maskable-512.png", 512],
  ] as const) {
    const response = await page.request.get(src);
    expect(response.ok(), `${src} should be available`).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
    const info = pngInfo(await response.body());
    expect(info.width).toBe(size);
    expect(info.height).toBe(size);
    expect([2, 6]).toContain(info.colorType);
  }

  const shareThumbnailResponse = await page.request.get("/share-thumbnail-v3.png");
  expect(shareThumbnailResponse.ok()).toBe(true);
  expect(shareThumbnailResponse.headers()["content-type"]).toBe("image/png");
  const shareThumbnailInfo = pngInfo(await shareThumbnailResponse.body());
  expect(shareThumbnailInfo).toMatchObject({ width: 800, height: 800 });
  expect([2, 6]).toContain(shareThumbnailInfo.colorType);

  for (const src of ["/favicon.svg", "/share-thumbnail-v3.svg"]) {
    const response = await page.request.get(src);
    expect(response.ok(), `${src} should be available`).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    const svg = await response.text();
    for (const face of ["帥", "相", "車", "士"]) {
      expect(svg.match(new RegExp(`>${face}<`, "gu")), `${src} should print ${face} at both ends`).toHaveLength(2);
    }
    expect(svg).not.toMatch(/>[帅车]</u);
    expect(svg.match(/rotate\(180 /gu)).toHaveLength(4);
  }

  const legacyIconResponse = await page.request.get("/favicon.ico");
  expect(legacyIconResponse.ok()).toBe(true);
  expect(legacyIconResponse.headers()["content-type"]).toMatch(/image\/(?:x-icon|vnd\.microsoft\.icon)/u);
});

test("does not disguise missing icon files as the app shell", async () => {
  const nginxConfig = await readFile(path.join(process.cwd(), "client/nginx/default.conf"), "utf8");

  expect(nginxConfig).toMatch(/location\s+~\*\s+\\\.\(\?:css\|js\|ico\|svg\|png\)\$[\s\S]*?try_files\s+\$uri\s+=404;/u);
  expect(nginxConfig).toMatch(/location\s+=\s+\/site\.webmanifest[\s\S]*?default_type\s+application\/manifest\+json;[\s\S]*?try_files\s+\$uri\s+=404;/u);

  const sourceFiles = await Promise.all([
    "client/src/main.ts",
    "client/src/App.vue",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")));
  expect(sourceFiles.join("\n")).not.toContain("serviceWorker.register");
});

test("shares the public game card from mode selection", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        sessionStorage.setItem("sise_test_shared_game", JSON.stringify(data));
      },
    });
  });
  await page.goto("/");


  const shareButton = page.getByTestId("share-game");
  await expect(shareButton).toHaveText("分享四色牌");
  await page.screenshot({ path: testInfo.outputPath("mode-selection-share.png") });
  await shareButton.click();
  await expect(page.getByTestId("global-notice")).toHaveText("四色牌已分享到系统分享菜单");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("sise_test_shared_game") ?? "{}"))).toEqual({
    title: "邀请你一起传承四色牌文化",
    text: "象棋魂 · 麻将韵 · 纸牌趣——四色牌，一局见真章！",
    url: `${new URL(page.url()).origin}/share`,
  });
});

test("offers one-click installation when Chromium exposes the install prompt", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("load", () => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.defineProperties(event, {
        prompt: {
          value: async () => sessionStorage.setItem("sise_test_install_prompted", "1"),
        },
        userChoice: {
          value: Promise.resolve({ outcome: "accepted", platform: "web" }),
        },
      });
      window.dispatchEvent(event);
    }, { once: true });
  });

  await page.goto("/");
  const installButton = page.getByTestId("pwa-install-entry");
  await expect(installButton).toBeVisible();
  await installButton.click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("sise_test_install_prompted"))).toBe("1");
  await expect(page.getByTestId("global-notice")).toHaveText("四色牌已安装，可以从桌面直接打开");
  await expect(installButton).toHaveCount(0);
});

test("guides WeChat visitors to keep the current link and open it in a browser", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50",
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.getByTestId("pwa-install-entry").click();
    const guide = page.getByTestId("pwa-install-guide-mask");
    await expect(guide.getByRole("heading")).toHaveText("先在浏览器里打开");
    await expect(guide).toContainText("当前好友房地址会保留");
    await expect(guide).toContainText("选择“在浏览器打开”");
    await page.getByTestId("close-pwa-install-guide").click();
    await expect(guide).toHaveCount(0);
    await expect(page.getByTestId("pwa-install-entry")).toBeFocused();
  } finally {
    await context.close();
  }
});

test("does not offer installation inside an installed standalone app", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  });
  await page.goto("/");
  await expect(page.getByTestId("pwa-install-entry")).toHaveCount(0);
});

test("does not offer installation when Chromium reports the related PWA is already installed", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: async () => [{ platform: "webapp", url: "/site.webmanifest", id: "/" }],
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("pwa-install-entry")).toHaveCount(0);
});

test("restores the install entry when installed-app detection does not answer", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      configurable: true,
      value: () => new Promise(() => undefined),
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("pwa-install-entry")).toHaveCount(0);
  await expect(page.getByTestId("pwa-install-entry")).toBeVisible({ timeout: 2_500 });
});

test("keeps installation discoverable in game settings without occupying the table header", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 667, height: 375 });
  await openGameAs(page, "/?e2eDebug=1", "桌面应用测试");
  await startLobbyAction(page);
  await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("pwa-install-entry")).toHaveCount(0);

  await page.getByTestId("game-settings").click();
  await revealSetting(page, "settings-install-app");
  const settingsInstall = page.getByTestId("settings-install-app");
  await expect(settingsInstall).toBeVisible();
  await settingsInstall.click();
  await expect(page.getByTestId("pwa-install-guide-mask")).toBeVisible();
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario("hu_ready_mode2"));
  await page.getByTestId("close-pwa-install-guide").click();
  await expect(page.getByTestId("game-settings")).toBeFocused();
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario("eat_mode1"));
  await expect(page.getByTestId("game-settings")).toBeFocused();
});
