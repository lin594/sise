import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

async function enterPractice(page: Page): Promise<void> {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
}

async function setupChiScenario(page: Page, scenario = "chi_local_upper"): Promise<void> {
  await page.evaluate((scenarioName) => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) throw new Error("Local test bridge is unavailable");
    bridge.setupScenario(scenarioName);
  }, scenario);
  await expect.poll(() =>
    page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: { getLastResult: () => { scenario: string; ok: boolean } | null };
      }).__siseLocalTest?.getLastResult() ?? null,
    ),
  ).toMatchObject({ scenario, ok: true });
}

test("a player composes chi directly from the real hand without a candidate dialog", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page);

  const chi = page.getByTestId("action-chi");
  const shi = page.getByTestId("hand-card-d1");
  const xiang = page.getByTestId("hand-card-d2");
  await expect(page.getByTestId("candidate-panel")).toHaveCount(0);
  await expect(chi).toHaveText("吃");
  await expect(chi).toBeEnabled(); // red jiang may be eaten as a single card

  await shi.scrollIntoViewIfNeeded();
  await shi.click();
  await expect(shi).toHaveAttribute("aria-pressed", "true");
  await expect(chi).toBeEnabled();
  await chi.click();
  await expect(page.getByTestId("action-feedback")).toContainText("这不是一个合法的吃牌组合");

  await shi.click();
  await expect(shi).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("action-feedback")).toHaveCount(0);
  await expect(chi).toBeEnabled();

  await shi.click();
  await xiang.scrollIntoViewIfNeeded();
  await xiang.click();
  await expect(shi).toHaveAttribute("aria-pressed", "true");
  await expect(xiang).toHaveAttribute("aria-pressed", "true");
  await expect(chi).toBeEnabled();

  await chi.click();
  const discard = page.getByTestId("discard-confirm");
  await expect(discard).toBeVisible();
  await expect(discard).toHaveText("出");
  await expect(discard).toBeDisabled();
});

test("the only visible chi composition is selected without submitting it", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_unique_jmp");

  const ju = page.getByTestId("hand-card-unique-yellow-ju-1");
  const ma = page.getByTestId("hand-card-unique-yellow-ma");
  const chi = page.getByTestId("action-chi");
  await expect(ju).toHaveAttribute("aria-pressed", "true");
  await expect(ma).toHaveAttribute("aria-pressed", "true");
  await expect(chi).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(ju).toHaveAttribute("aria-pressed", "false");
  await expect(ma).toHaveAttribute("aria-pressed", "false");
  await expect(chi).toBeEnabled();
  await chi.click();
  await expect(page.getByTestId("action-feedback")).toContainText("请先选择要吃的手牌");
  await page.waitForTimeout(250);
  await expect(ju).toHaveAttribute("aria-pressed", "false");
  await expect(ma).toHaveAttribute("aria-pressed", "false");
});

test("duplicate physical cards still count as one visible chi composition", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_unique_duplicate_jmp");

  await expect(page.getByTestId("hand-card-unique-yellow-ma")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await expect.poll(() => page.locator('[data-testid^="hand-card-unique-yellow-ju-"][aria-pressed="true"]').count())
    .toBe(1);
});

test("a complete chi draft survives collective to local_upper for the same card", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_collective_zu4");

  const selected = [
    page.getByTestId("hand-card-shared-zu-yellow"),
    page.getByTestId("hand-card-shared-zu-red"),
    page.getByTestId("hand-card-shared-zu-green"),
  ];
  await expect(page.getByTestId("action-chi")).toBeVisible();
  await selected[0].click();
  await expect(selected[0]).toHaveAttribute("aria-pressed", "true");
  await selected[1].click();
  await expect(selected[1]).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await selected[2].click();
  await expect(selected[2]).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();

  await setupChiScenario(page, "chi_local_upper_zu4");
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-response-phase", "local_upper");
  for (const card of selected) await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
});

test("a confirmed collective chi is deferred and applied exactly once", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_collective_zu4");

  await expect(page.getByTestId("action-chi")).toBeVisible();
  for (const id of ["shared-zu-yellow", "shared-zu-red", "shared-zu-green"]) {
    await page.getByTestId(`hand-card-${id}`).click();
  }
  const chi = page.getByTestId("action-chi");
  await expect(chi).toBeEnabled();
  await chi.click();

  const exposedCounts = () => page.evaluate(() => {
    const state = (window as Window & { __siseLocalTest?: { getRoomState: () => any } })
      .__siseLocalTest?.getRoomState();
    const exposedIds = (state?.players ?? []).flatMap((player: any) =>
      (player.exposedArea ?? []).map((card: any) => card.id),
    );
    return ["shared-zu-yellow", "shared-zu-red", "shared-zu-green", "shared-zu-white"]
      .map((id) => exposedIds.filter((exposedId: string) => exposedId === id).length);
  });
  await expect.poll(exposedCounts).toEqual([1, 1, 1, 1]);
  await page.waitForTimeout(500);
  await expect.poll(exposedCounts).toEqual([1, 1, 1, 1]);
});

test("a player can freely choose a three-color or four-color zu chi from the hand", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_four_zu");

  const chi = page.getByTestId("action-chi");
  const red = page.getByTestId("hand-card-zu-red");
  const green = page.getByTestId("hand-card-zu-green");
  const white = page.getByTestId("hand-card-zu-white");
  await expect(chi).toBeEnabled();
  await chi.click();
  await expect(page.getByTestId("action-feedback")).toContainText("请先选择要吃的手牌");

  await red.click();
  await green.click();
  await expect(chi).toBeEnabled();
  await white.click();
  await expect(chi).toBeEnabled();
  await chi.click();

  await expect.poll(() => page.evaluate(() => {
    const state = (window as Window & { __siseLocalTest?: { getRoomState: () => any } })
      .__siseLocalTest?.getRoomState();
    const exposedIds = (state?.players ?? []).flatMap((player: any) =>
      (player.exposedArea ?? []).map((card: any) => card.id),
    );
    return ["zu-yellow", "zu-red", "zu-green", "zu-white"].every((id) => exposedIds.includes(id));
  })).toBe(true);
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
});

test("the operation dock has no visible waiting narration", async ({ page }) => {
  await enterPractice(page);
  await expect(page.getByTestId("action-waiting")).toHaveCount(0);
  await expect(page.locator(".action-dock")).not.toContainText(/正在操作|轮到你时会提醒/);
});
