import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { finishDeclarationIfNeeded } from "./helpers/game";

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
  await expect(page.getByTestId("mode-offline_practice")).toHaveCount(0);
  await page.getByTestId("mode-practice_bots").click();
  await expect(page.getByTestId("game-board")).toBeVisible();
  await expect(page.locator(".dealer-reveal")).toBeVisible();
  await expect(page.locator(".deal-overlay")).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => page.locator("[data-testid^='hand-card-'].deal-concealed").count()).toBeGreaterThan(0);
  await expect(page.locator(".deal-overlay")).toHaveCount(0, { timeout: 12_000 });
  await expect(page.getByTestId("opponent-hand-count")).toHaveCount(3);
  await expect(page.getByTestId("game-auto-play")).toHaveCount(0);
  await expect(page.getByTestId("game-interaction")).toHaveCount(0);

  // Opening and the presentation contract are checked at real speed above
  // and in offline-action-presentation. Advance the same timers for a full round.
  await page.clock.install();
  await expect.poll(async () => {
    await page.clock.fastForward(1500);
    await page.clock.runFor(64);
    return page.evaluate(() => {
      const bridge = (window as Window & {
        __siseLocalTest?: {
          advanceOfflinePracticeAsBot: () => boolean;
          getRoomState: () => { phase?: string } | null;
        };
      }).__siseLocalTest;
      bridge?.advanceOfflinePracticeAsBot();
      return bridge?.getRoomState()?.phase ?? "missing";
    });
  }, { timeout: 120_000, intervals: [5, 10, 20] }).toBe("ended");

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
  // during application boot. The single-player offline fallback must add none of its own.
  await page.waitForTimeout(100);
  dynamicRequests.length = 0;
  sockets.length = 0;
  await completeLocalRound(page);
  expect(dynamicRequests).toEqual([]);
  expect(sockets).toEqual([]);

  await context.close();
});

test("a drawn general can be eaten locally and continues to the discard step", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const origin = baseURL ?? "http://127.0.0.1:4173";
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await prepareContext(context);

  const page = await context.newPage();
  try {
    await page.goto(`${origin}/?e2eDebug=1`);
    await page.evaluate(() => {
      let state = 1;
      Math.random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    });
    await page.getByTestId("mode-practice_bots").click();
    await finishDeclarationIfNeeded(page);
    await page.clock.install();

    await expect.poll(async () => {
      await page.clock.fastForward(1500);
      await page.clock.runFor(64);
      return page.evaluate(() => {
        const bridge = (window as Window & {
          __siseLocalTest?: {
            advanceOfflinePracticeAsBot: () => boolean;
            getDeferredChiDebug: () => {
              actions?: Array<{ action: string; deferred?: boolean }>;
            };
            getRoomState: () => {
              phase?: string;
              currentPlayerId?: string;
              responseCard?: { id?: string; color?: string; type?: string } | null;
            } | null;
          };
        }).__siseLocalTest;
        const room = bridge?.getRoomState();
        const actions = bridge?.getDeferredChiDebug().actions ?? [];
        if (
          room?.phase === "playing" &&
          room.currentPlayerId === "seat_0" &&
          room.responseCard?.color === "white" &&
          room.responseCard.type === "jiang" &&
          actions.some((action) => action.action === "chi" && action.deferred)
        ) {
          return room.responseCard.id ?? "";
        }
        bridge?.advanceOfflinePracticeAsBot();
        return "";
      });
    }, { timeout: 60_000, intervals: [5, 10, 20] }).not.toBe("");
    const targetCardId = await page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: {
          getRoomState: () => { responseCard?: { id?: string } | null } | null;
        };
      }).__siseLocalTest?.getRoomState()?.responseCard?.id ?? "",
    );
    const chiCardIds = await page.evaluate(() => {
      const actions = (window as Window & {
        __siseLocalTest?: {
          getDeferredChiDebug: () => {
            actions?: Array<{
              action: string;
              candidates?: Array<{ cardIds?: string[] }>;
            }>;
          };
        };
      }).__siseLocalTest?.getDeferredChiDebug().actions ?? [];
      const candidates = actions.find((action) => action.action === "chi")?.candidates ?? [];
      return candidates.find((candidate) => candidate.cardIds?.length)?.cardIds ?? [];
    });

    await expect(page.getByTestId("action-chi")).toBeEnabled();
    for (const cardId of chiCardIds) {
      const card = page.getByTestId(`hand-card-${cardId}`);
      if (await card.getAttribute("aria-pressed") !== "true") await card.click();
    }
    await page.getByTestId("action-chi").click();
    await page.clock.fastForward(5000);
    await page.clock.runFor(64);
    await expect.poll(() => page.evaluate((cardId) => {
      const room = (window as Window & {
        __siseLocalTest?: {
          getRoomState: () => {
            players?: Array<{
              clientId?: string;
              exposedArea?: Array<{ id?: string }>;
              generalArea?: Array<{ id?: string }>;
            }>;
          } | null;
        };
      }).__siseLocalTest?.getRoomState();
      const human = room?.players?.find((player) => player.clientId === "seat_0");
      return [...(human?.exposedArea ?? []), ...(human?.generalArea ?? [])]
        .some((card) => card.id === cardId);
    }, targetCardId)).toBe(true);
    await expect.poll(() => page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: { getDeferredChiDebug: () => { intent?: unknown } };
      }).__siseLocalTest?.getDeferredChiDebug().intent ?? null,
    )).toBeNull();
    await expect(page.getByTestId("discard-confirm")).toBeVisible();
  } finally {
    await context.close();
  }
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
