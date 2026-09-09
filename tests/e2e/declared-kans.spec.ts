import { expect, test } from "@playwright/test";
import { startLobbyAction, finishDeclarationIfNeeded } from "./helpers/game";

for (const viewport of [{ width: 568, height: 320 }, { width: 375, height: 667 }, { width: 1280, height: 800 }]) {
  test(`server-issued kan protection survives refresh at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?e2eDebug=1');
    await startLobbyAction(page);
    await finishDeclarationIfNeeded(page);
    await page.evaluate(() => (window as any).__siseLocalTest.setupScenario('protected_kan_discard'));
    const protectedCards = page.locator('.hand button').filter({ has: page.locator('[data-face-id^="protected-kan-"]') });
    const legal = page.locator('.hand button').filter({ has: page.locator('[data-face-id="legal-discard"]') });
    await expect(protectedCards).toHaveCount(3);
    for (const card of await protectedCards.all()) {
      await expect(card).toBeDisabled();
      await expect(card.locator('.discard-protected-badge')).toHaveText('留');
    }
    await expect(legal).toBeEnabled();
    await legal.focus();
    await page.keyboard.press('Enter');
    await expect(legal).toHaveClass(/discard-selected/);
    await page.reload();
    await expect(protectedCards).toHaveCount(3);
    await expect(protectedCards.first()).toBeDisabled();
    await expect(legal).toBeEnabled();
  });
}
