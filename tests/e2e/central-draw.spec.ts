import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

type RectSnapshot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type MeldHandoff = {
  done: boolean;
  histories: Record<string, RectSnapshot[]>;
  layoutSizes: Record<string, Array<{ width: number; height: number }>>;
  lastFlights: Record<string, RectSnapshot>;
  targets: Record<string, RectSnapshot>;
  handCounts: Record<string, number>;
  visibleCounts: Record<string, number>;
  targetModes: Record<string, string | null>;
};

async function start(page: Page, scenario: string) {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("confirm-declaration").click();
  await expect(page.locator("main.layout")).toHaveClass(/playing/);
  await page.evaluate((name) => {
    (window as any).__drawStages = [];
    new MutationObserver(() => {
      const stage = document.querySelector('[data-transition-kind="draw"]')?.getAttribute("data-transition-stage");
      if (stage && !(window as any).__drawStages.includes(stage)) (window as any).__drawStages.push(stage);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-transition-stage"] });
    (window as any).__siseLocalTest.setupScenario(name);
  }, scenario);
}

async function selectTableCardMode(page: Page, mode: "large" | "long") {
  await page.getByTestId("game-settings").click();
  await page.getByTestId(`card-mode-table-${mode}`).click();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.getByTestId("pending-card").locator(`[data-card-mode="${mode}"]`)).toBeVisible();
}

async function recordPengHandoff(page: Page, expectedIds: string[]): Promise<MeldHandoff> {
  await page.evaluate((ids) => {
    const trackingWindow = window as any;
    const result: MeldHandoff & { seen: boolean } = {
      seen: false,
      done: false,
      histories: {},
      layoutSizes: {},
      lastFlights: {},
      targets: {},
      handCounts: {},
      visibleCounts: {},
      targetModes: {},
    };
    trackingWindow.__siseMeldHandoff = result;

    const rectOf = (element: Element): RectSnapshot => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    const elementsWithId = (selector: string, id: string): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((element) => element.dataset.faceId === id);
    const isVisible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };

    const sample = () => {
      const flights = Array.from(document.querySelectorAll<HTMLElement>('[data-transition-kind="meld"]'));
      if (flights.length > 0) {
        result.seen = true;
        for (const flight of flights) {
          const id = flight.dataset.transitionCardId;
          if (!id || !ids.includes(id)) continue;
          const snapshot = rectOf(flight);
          (result.histories[id] ??= []).push(snapshot);
          (result.layoutSizes[id] ??= []).push({
            width: flight.offsetWidth,
            height: flight.offsetHeight,
          });
          result.lastFlights[id] = snapshot;
        }
      } else if (result.seen) {
        for (const id of ids) {
          const targets = elementsWithId(".self-groups-card .group-block-list [data-face-id]", id);
          if (targets[0]) {
            result.targets[id] = rectOf(targets[0]);
            result.targetModes[id] = targets[0].dataset.cardMode ?? null;
          }
          result.handCounts[id] = elementsWithId(".hand-card [data-face-id]", id).length;
          result.visibleCounts[id] = elementsWithId("[data-face-id]", id).filter(isVisible).length;
        }
        result.done = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, expectedIds);

  await page.getByTestId("action-peng").click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__siseMeldHandoff?.done))).toBe(true);
  return page.evaluate(() => (window as any).__siseMeldHandoff as MeldHandoff);
}

function expectRectClose(actual: RectSnapshot, expected: RectSnapshot) {
  for (const key of ["left", "top", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${key} handoff delta`).toBeLessThanOrEqual(1);
  }
}

function expectSizeConverges(history: RectSnapshot[], target: RectSnapshot) {
  expect(history.length).toBeGreaterThan(2);
  for (const key of ["width", "height"] as const) {
    const direction = Math.sign(target[key] - history[0][key]);
    for (let index = 1; index < history.length; index += 1) {
      const step = history[index][key] - history[index - 1][key];
      expect(direction === 0 ? Math.abs(step) : step * direction, `${key} frame ${index}`).toBeGreaterThanOrEqual(-0.5);
    }
  }
}

async function expectRedXiangPengHandoff(page: Page, mode: "large" | "long") {
  await start(page, "upper_peng_xiang");
  await selectTableCardMode(page, mode);
  await expect(page.getByTestId("action-peng")).toBeEnabled();
  const responseId = await page.evaluate(() => (window as any).__siseLocalTest.getRoomState().responseCard.id as string);
  const expectedIds = [responseId, "red-xiang-1", "red-xiang-2"];
  const handoff = await recordPengHandoff(page, expectedIds);

  expect(Object.keys(handoff.lastFlights).sort()).toEqual([...expectedIds].sort());
  expect(Object.keys(handoff.targets).sort()).toEqual([...expectedIds].sort());
  for (const id of expectedIds) {
    expectRectClose(handoff.lastFlights[id], handoff.targets[id]);
    expectSizeConverges(handoff.histories[id], handoff.targets[id]);
    expect(new Set(handoff.layoutSizes[id].map((size) => `${size.width}x${size.height}`)).size,
      `${id} must animate size on the compositor without per-frame layout`).toBe(1);
    expect(handoff.handCounts[id], `${id} must not remain in hand`).toBe(0);
    expect(handoff.visibleCounts[id], `${id} must have one visible instance`).toBe(1);
    expect(handoff.targetModes[id]).toBe(mode);
  }
  await expect(page.locator(".self-groups-card .group-block-list [data-face-id]")).toHaveCount(3);
  await expect(page.locator('.hand-card [data-face-id="yellow-ma-spare"]')).toBeVisible();
}

test("red Xiang Peng hands off all three large cards to the public meld without a geometry jump", async ({ page }) => {
  await expectRedXiangPengHandoff(page, "large");
});

test("a CPU-throttled meld still holds the exact final rectangles", async ({ page }) => {
  await start(page, "upper_peng_xiang");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  try {
    await expect(page.getByTestId("action-peng")).toBeEnabled();
    const responseId = await page.evaluate(() => (window as any).__siseLocalTest.getRoomState().responseCard.id as string);
    const expectedIds = [responseId, "red-xiang-1", "red-xiang-2"];
    const handoff = await recordPengHandoff(page, expectedIds);
    for (const id of expectedIds) {
      expectRectClose(handoff.lastFlights[id], handoff.targets[id]);
      expect(new Set(handoff.layoutSizes[id].map((size) => `${size.width}x${size.height}`)).size).toBe(1);
      expect(handoff.visibleCounts[id]).toBe(1);
    }
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
});

test.describe("desktop long-card meld handoff", () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false });

  test("red Xiang Peng converges to long-card meld geometry", async ({ page }) => {
    await expectRedXiangPengHandoff(page, "long");
  });
});

test("draw flies face down, pauses, flips, then accepts B's eat with real cards", async ({ page }, testInfo) => {
  await start(page, "draw_choice");
  const flight = page.locator('[data-transition-kind="draw"]');
  await expect(flight).toBeVisible();
  await expect(flight.locator(".card-back")).toBeVisible();
  await expect(flight).toHaveAttribute("data-transition-stage", "waiting");
  const landedDraw = await page.evaluate(() => {
    const read = (selector: string) => {
      const rect = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    return {
      flight: read('[data-transition-kind="draw"]'),
      target: read('[data-testid="pending-card"] .response-card-face'),
    };
  });
  expectRectClose(landedDraw.flight, landedDraw.target);
  await expect(page.getByTestId("action-chi")).toHaveCount(0);
  await expect(page.getByTestId("action-chi")).toBeVisible();
  await expect(page.getByTestId("action-chi")).toBeDisabled();
  await expect(flight).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__drawStages)).toEqual(["flying", "waiting", "flipping"]);
  await expect(page.getByTestId("pending-card")).toBeVisible();
  await expect(page.locator('.discard-token[data-face-id^="draw-ma"]')).toHaveCount(0);
  await page.getByTestId("hand-card-red-ju").click();
  await page.getByTestId("hand-card-red-pao").click();
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await page.getByTestId("action-chi").click();
  await expect(page.locator('[data-transition-kind="meld"]')).toHaveCount(3);
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  const ids = await page.evaluate(() => (window as any).__siseLocalTest.getRoomState().players.flatMap((p: any) => p.exposedArea.map((c: any) => c.id)));
  expect(ids).toEqual(expect.arrayContaining(["red-ju", "red-pao"]));
  await page.screenshot({ path: testInfo.outputPath("central-draw.png") });
});

for (const action of ["hu", "chi"] as const) {
  test(`gold ${action} settles gong separately with no kan or duplicate`, async ({ page }) => {
    await start(page, "draw_gold_settlement");
    await expect(page.getByTestId(`action-${action}`)).toBeEnabled();
    await page.getByTestId(`action-${action}`).click();
    await expect(page.getByTestId("settlement-panel")).toBeVisible();
    const result = await page.evaluate(() => (window as any).__siseLocalTest.getRoundResult());
    const winner = result.players.find((p: any) => p.clientId === result.winnerId);
    expect(winner.totalScore).toBe(36);
    expect(winner.winningGroups.every((g: any) => g.key === "SingleGold")).toBe(true);
    expect(winner.resolvedHandGroups.map((g: any) => g.key)).toEqual(["SingleGold", "SingleGold"]);
    expect(winner.scoreBreakdown.some((line: any) => line.key.includes("GoldTriplet"))).toBe(false);
  });
}

test("ordinary winning response displays Peng rather than Kan", async ({ page }) => {
  await start(page, "draw_peng_settlement");
  await expect(page.getByTestId("action-hu")).toBeEnabled();
  await page.getByTestId("action-hu").click();
  await expect(page.getByTestId("settlement-panel")).toBeVisible();
  const result = await page.evaluate(() => (window as any).__siseLocalTest.getRoundResult());
  const winner = result.players.find((p: any) => p.clientId === result.winnerId);
  expect(winner.winningGroups[0].key).toBe("Peng");
  await page.locator(".settlement-item.winner summary").click();
  await expect(page.locator(".settlement-item.winner .settlement-group-badge")).toHaveText("碰");
});

test("declining a draw lands it in the drawer's outgoing flow without a second poll", async ({ page }) => {
  await start(page, "draw_choice");
  await expect(page.getByTestId("action-pass")).toBeEnabled();
  const origin = await page.evaluate(() => {
    const state = (window as any).__siseLocalTest.getRoomState();
    return { id: state.responseCard.id, owner: state.pollOriginPlayerId };
  });
  await page.getByTestId("action-pass").click();
  const flowFlight = page.locator(`[data-transition-kind="flow"][data-transition-card-id="${origin.id}"]`);
  await expect(flowFlight).toHaveAttribute("data-transition-stage", "landed");
  const landedFlow = await page.evaluate((id) => {
    const read = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    return {
      flight: read(document.querySelector<HTMLElement>(`[data-transition-kind="flow"][data-transition-card-id="${id}"]`)!),
      target: read(document.querySelector<HTMLElement>(`.discard-token[data-face-id="${id}"]`)!),
    };
  }, origin.id);
  expectRectClose(landedFlow.flight, landedFlow.target);
  await expect(page.locator(`.discard-token[data-face-id="${origin.id}"]`)).toBeVisible();
  const events = await page.evaluate((id) => (window as any).__siseLocalTest.getRoomState().tableTransitions.filter((e: any) => e.moves.some((m: any) => m.card.id === id)), origin.id);
  expect(events.map((event: any) => event.kind)).toEqual(["draw", "flow"]);
  expect(events[1].moves[0].to).toEqual({ zone: "flow", playerId: origin.owner });
});

test("reduced motion reveals at the central landing point without flight or flip", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await start(page, "draw_choice");
  const flight = page.locator('[data-transition-kind="draw"]');
  await expect(flight).toHaveCount(0);
  const landing = page.getByTestId("pending-card").locator(".response-card-face");
  await expect(landing).toBeVisible();
  const rect = await landing.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(568);
  await expect(page.getByTestId("action-chi")).toBeVisible();
});
