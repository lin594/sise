import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
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

test("draw flies face down, pauses, flips, then accepts B's eat with real cards", async ({ page }, testInfo) => {
  await start(page, "draw_choice");
  const flight = page.locator('[data-transition-kind="draw"]');
  await expect(flight).toBeVisible();
  await expect(flight.locator(".card-back")).toBeVisible();
  await expect(page.getByTestId("action-chi")).toHaveCount(0);
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await expect(flight).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__drawStages)).toEqual(["flying", "waiting", "flipping"]);
  await expect(page.getByTestId("pending-card")).toBeVisible();
  await expect(page.locator('.discard-token[data-face-id^="draw-ma"]')).toHaveCount(0);
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
  await expect(page.locator(`[data-transition-kind="flow"][data-transition-card-id="${origin.id}"]`)).toBeVisible();
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
  await expect(flight).toBeVisible();
  await expect(flight.locator(".card-back")).toHaveCount(0);
  const position = await flight.boundingBox();
  expect(position).not.toBeNull();
  expect(position!.x).toBeGreaterThanOrEqual(0);
  expect(position!.y).toBeGreaterThanOrEqual(0);
  expect(position!.x + position!.width).toBeLessThanOrEqual(320);
  expect(position!.y + position!.height).toBeLessThanOrEqual(568);
  await expect(flight.locator(".table-flight-turn")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
});
