import { startLobbyAction } from "./helpers/game";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

test("single-player practice keeps human decisions untimed", async ({ page }) => {
  await page.goto("/?e2eDebug=1");

  await startLobbyAction(page);
  await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) throw new Error("Local test bridge is unavailable");
    bridge.setupScenario("staged_declaration");
  });
  await expect.poll(() => page.evaluate(() =>
    (window as Window & {
      __siseLocalTest?: { getLastResult: () => { scenario: string; ok: boolean } | null };
    }).__siseLocalTest?.getLastResult() ?? null,
  )).toMatchObject({ scenario: "staged_declaration", ok: true });

  const declarationConfirm = page.getByTestId("confirm-declaration");
  await expect(declarationConfirm).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId("decision-countdown")).toContainText("不限时");
  await expect(page.getByText("练习不限时", { exact: true })).toBeHidden();
  await expect(page.getByTestId("request-more-time")).toHaveCount(0);

  await declarationConfirm.click();
  await expect(page.locator(".pending-fish-back")).toHaveCount(4);
  await expect(declarationConfirm.locator("span")).toHaveText("确认坎数");
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
