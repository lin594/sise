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
