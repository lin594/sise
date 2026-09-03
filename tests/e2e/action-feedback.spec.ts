import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test("an invalid meld is explained and immediately becomes retryable", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();

  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("chi_local_upper");
  });
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
