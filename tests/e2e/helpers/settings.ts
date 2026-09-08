import { expect, type Page } from "@playwright/test";

export async function revealSetting(page: Page, testId: string) {
  const control = page.getByTestId(testId);
  if (await control.isVisible()) return;
  if (await page.getByTestId("settings-all").isVisible()) await page.getByTestId("settings-all").click();
  const category = testId.startsWith("skin-") ? "appearance"
    : /^(turn-alert-|spoken-turn)/.test(testId) ? "sound"
    : /^(reduce-motion|card-color-assist|keep-screen)/.test(testId) ? "assist" : "table";
  if (!await page.getByTestId(`settings-category-${category}`).isVisible()) {
    await page.getByTestId("settings-back").click();
  }
  if (testId !== "settings-rules" && testId !== "settings-install-app") await page.getByTestId(`settings-category-${category}`).click();
  await expect(control).toBeVisible();
}

/** Open an in-game tool through the user-facing tools home. */
export async function revealTool(page: Page, testId: string) {
  if (await page.getByTestId('game-settings').getAttribute('aria-expanded') !== 'true') {
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    await page.getByTestId('game-settings').click();
  }
  if (await page.getByTestId(testId).isVisible()) return;
  while (!await page.getByTestId(testId).isVisible() && await page.getByTestId('settings-back').isVisible()) {
    await page.getByTestId('settings-back').click();
  }
  await expect(page.getByTestId(testId)).toBeVisible();
}
