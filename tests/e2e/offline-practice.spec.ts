import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const DYNAMIC_PATH = /^\/(?:api|health|invite|matchmake|private-state|guest-profile|product-events|reset-room|room-id|rooms|share)(?:\/|$)/u;

function observeDynamicTraffic(context: BrowserContext) {
  const dynamicRequests: string[] = [];
  const sockets: string[] = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (DYNAMIC_PATH.test(url.pathname)) dynamicRequests.push(`${request.method()} ${url.pathname}`);
  });
  context.on("websocket", (socket) => sockets.push(socket.url()));
  return { dynamicRequests, sockets };
}

async function completeLocalRound(page: Page): Promise<void> {
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
}

async function prepareContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    localStorage.setItem("sise_entry_name", "离线牌友");
    localStorage.setItem("sise_layout_onboarding_v1", "done");
  });
}

test("reopens offline from the cached shell and completes a local round without backend traffic", async ({ browser, baseURL, browserName }) => {
  test.skip(browserName === "webkit", "Playwright WebKit blocks Service Worker requests after context.setOffline(true); Safari device reopening stays in #74.");
  test.setTimeout(180_000);
  const origin = baseURL ?? "http://127.0.0.1:4173";
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await prepareContext(context);

  const onlinePage = await context.newPage();
  await onlinePage.goto(`${origin}/?e2eDebug=1`);
  await expect(onlinePage.getByTestId("offline-readiness")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await onlinePage.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await onlinePage.close();

  const { dynamicRequests, sockets } = observeDynamicTraffic(context);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`${origin}/?e2eDebug=1`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("offline-readiness")).toHaveAttribute("data-state", "ready");
  // Optional lobby profile/telemetry calls may already have been attempted
  // during application boot. The explicit offline mode must add none of its own.
  await page.waitForTimeout(100);
  dynamicRequests.length = 0;
  sockets.length = 0;
  await completeLocalRound(page);
  expect(dynamicRequests).toEqual([]);
  expect(sockets).toEqual([]);

  await context.close();
});

test("WebKit runs the Service Worker-controlled local game without backend traffic", async ({ browser, baseURL, browserName }) => {
  test.skip(browserName !== "webkit", "WebKit-specific Service Worker and local-engine coverage.");
  test.setTimeout(180_000);
  const origin = baseURL ?? "http://127.0.0.1:4173";
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await prepareContext(context);
  const page = await context.newPage();
  await page.goto(`${origin}/?e2eDebug=1`);
  await expect(page.getByTestId("offline-readiness")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("offline-readiness")).toHaveAttribute("data-state", "ready");
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const { dynamicRequests, sockets } = observeDynamicTraffic(context);
  await page.waitForTimeout(100);
  dynamicRequests.length = 0;
  sockets.length = 0;
  await completeLocalRound(page);
  expect(dynamicRequests).toEqual([]);
  expect(sockets).toEqual([]);

  await context.close();
});
