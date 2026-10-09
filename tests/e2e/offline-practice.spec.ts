import { expect, test } from "@playwright/test";

const DYNAMIC_PATH = /^\/(?:api|health|invite|matchmake|private-state|guest-profile|product-events|reset-room|room-id|rooms|share)(?:\/|$)/u;

test("uses its cached shell offline, completes a local round, and starts the next without backend traffic", async ({ browser, baseURL, browserName }) => {
  test.setTimeout(180_000);
  const origin = baseURL ?? "http://127.0.0.1:4173";
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await context.addInitScript(() => {
    localStorage.setItem("sise_entry_name", "离线牌友");
    localStorage.setItem("sise_layout_onboarding_v1", "done");
  });

  const onlinePage = await context.newPage();
  await onlinePage.goto(`${origin}/?e2eDebug=1`);
  await expect(onlinePage.getByTestId("offline-readiness")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await onlinePage.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  const dynamicRequests: string[] = [];
  const sockets: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (DYNAMIC_PATH.test(url.pathname)) dynamicRequests.push(`${request.method()} ${url.pathname}`);
  });
  context.on("websocket", (socket) => sockets.push(socket.url()));

  let page = onlinePage;
  if (browserName === "webkit") {
    // Playwright WebKit reports an engine-level internal error when a brand-new
    // page performs its first navigation after context.setOffline(true). Reload
    // once so the active worker controls this page, then prove the cached shell
    // is fetchable offline before exercising the complete local game.
    await onlinePage.reload();
    await expect(onlinePage.getByTestId("offline-readiness")).toHaveAttribute("data-state", "ready");
    expect(await onlinePage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    const cachedShell = await onlinePage.evaluate(async () => {
      const response = await fetch("/", { cache: "reload" });
      return { ok: response.ok, body: await response.text() };
    });
    expect(cachedShell.ok).toBe(true);
    expect(cachedShell.body).toContain('<div id="app"></div>');
  } else {
    await onlinePage.close();
    await context.setOffline(true);
    page = await context.newPage();
    await page.goto(`${origin}/?e2eDebug=1`, { waitUntil: "domcontentloaded" });
  }
  await expect(page.getByTestId("offline-readiness")).toHaveAttribute("data-state", "ready");
  // Optional lobby profile/telemetry calls may already have been attempted
  // during application boot. The explicit offline mode must add none of its own.
  await page.waitForTimeout(100);
  dynamicRequests.length = 0;
  sockets.length = 0;
  await page.getByTestId("mode-offline_practice").click();
  await expect(page.getByTestId("game-board")).toBeVisible();
  await expect(page.getByTestId("opponent-hand-count")).toHaveCount(3);
  await expect(page.getByTestId("game-auto-play")).toHaveCount(0);
  await expect(page.getByTestId("game-interaction")).toHaveCount(0);

  await expect.poll(async () => page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: {
        advanceOfflinePracticeAsBot: () => boolean;
        getRoomState: () => { phase?: string } | null;
      };
    }).__siseLocalTest;
    bridge?.advanceOfflinePracticeAsBot();
    return bridge?.getRoomState()?.phase ?? "missing";
  }), { timeout: 120_000, intervals: [5, 10, 20] }).toBe("ended");

  await expect(page.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.evaluate(() => {
    const result = (window as Window & {
      __siseLocalTest?: { getRoundResult: () => { players?: unknown[] } | null };
    }).__siseLocalTest?.getRoundResult();
    return result?.players?.length ?? 0;
  })).toBe(4);

  await page.getByTestId("next-round-trigger").click();
  await expect(page.getByTestId("settlement-panel")).toHaveCount(0);
  await expect(page.getByTestId("game-board")).toBeVisible();
  expect(dynamicRequests).toEqual([]);
  expect(sockets).toEqual([]);

  await context.close();
});
