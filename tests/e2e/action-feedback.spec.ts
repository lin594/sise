import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

async function setupChiScenario(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("chi_local_upper");
  });

  await expect.poll(() =>
    page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: {
          getLastResult: () => {
            scenario: string;
            ok: boolean;
            actions?: Array<{ action: string; enabled: boolean; deferred?: boolean }>;
          } | null;
        };
      }).__siseLocalTest?.getLastResult() ?? null,
    ),
  ).toMatchObject({
    scenario: "chi_local_upper",
    ok: true,
    actions: expect.arrayContaining([
      expect.objectContaining({ action: "chi", enabled: true }),
    ]),
  });
}

test("an invalid meld is explained and immediately becomes retryable", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();

  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

  await setupChiScenario(page);
  await expect(page.getByTestId("action-chi")).toBeEnabled();

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: {
        submitAction: (request: { action: "chi"; candidateId: string }) => void;
      };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.submitAction({ action: "chi", candidateId: "expired-candidate" });
  });

  const feedback = page.getByTestId("action-feedback");
  await expect(feedback).toHaveAttribute("data-status", "rejected");
  await expect(feedback).toContainText("这组牌已经不能使用，请重新选择");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-response-phase", "local_upper");
});

test("an accepted meld yields immediately to the next discard instruction", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();

  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

  await setupChiScenario(page);

  await page.getByTestId("action-chi").click();
  const options = page.getByTestId("candidate-option");
  await expect(options).toHaveCount(2);
  await options.first().click();

  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  await expect(page.getByTestId("discard-confirm")).toHaveText("先选牌");
  await expect(page.getByTestId("action-guidance")).toContainText("请先选择一张手牌");
  await expect(page.getByTestId("action-feedback")).toHaveCount(0);
});
