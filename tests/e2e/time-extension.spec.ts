import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

test("single-player practice lets the human decide without a countdown", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();

  const declarationConfirm = page.getByTestId("confirm-declaration");
  await expect(declarationConfirm).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId("decision-countdown")).toContainText("不限时");
  await expect(page.getByText("选择鱼和坎 · 练习不限时")).toBeVisible();
  await expect(page.getByTestId("request-more-time")).toHaveCount(0);

  await declarationConfirm.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("chi_local_upper");
  });

  await expect(page.getByTestId("action-guidance")).toContainText("练习不限时");
  await expect(page.getByTestId("request-more-time")).toHaveCount(0);
  await expect(page.getByTestId("action-chi")).toBeEnabled();
});
