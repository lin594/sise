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
  await expect(chi).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(shi).toHaveAttribute("aria-pressed", "false");
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

test("a player can freely choose a three-color or four-color zu chi from the hand", async ({ page }) => {
  await enterPractice(page);
  await setupChiScenario(page, "chi_four_zu");

  const chi = page.getByTestId("action-chi");
  const red = page.getByTestId("hand-card-zu-red");
  const green = page.getByTestId("hand-card-zu-green");
  const white = page.getByTestId("hand-card-zu-white");
  await expect(chi).toBeDisabled();

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
