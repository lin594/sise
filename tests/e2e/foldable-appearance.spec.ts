import { expect, test, type Page } from "@playwright/test";
import { finishDeclarationIfNeeded, startLobbyAction } from "./helpers/game";

test.use({ hasTouch: true, isMobile: true });

async function enterDecision(page: Page): Promise<void> {
  await page.goto("/?new=1&e2eDebug=1");
  await startLobbyAction(page);
  await finishDeclarationIfNeeded(page);
  await page.evaluate(() => (window as any).__siseLocalTest.setupScenario("chi_local_upper"));
  await expect(page.getByTestId("pending-card")).toBeVisible();
  await expect(page.getByTestId("action-chi")).toBeEnabled();
}

test("a narrow touch phone rotates while a near-square touch viewport stays native", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDecision(page);
  const layout = page.locator("main.layout");
  const board = page.getByTestId("game-board");
  await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
  await expect(layout).toHaveAttribute("data-effective-viewport", "844x390");

  for (const [width, height] of [[600, 775], [690, 820], [820, 690]] as const) {
    await page.setViewportSize({ width, height });
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "false");
    await expect(layout).toHaveClass(/\broomy-touch-viewport\b/);
    await expect(layout).toHaveAttribute("data-effective-viewport", `${width}x${height}`);
    await expect(board).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("action-chi")).toBeInViewport({ ratio: 1 });
  }

  await page.setViewportSize({ width: 568, height: 320 });
  await expect(layout).not.toHaveClass(/\broomy-touch-viewport\b/);
  await expect(board).toHaveAttribute("data-table-layout", "compact");
  await expect(page.getByTestId("action-chi")).toBeInViewport({ ratio: 1 });
});

