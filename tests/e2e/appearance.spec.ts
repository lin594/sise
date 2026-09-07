import { revealSetting } from "./helpers/settings";
import { expect, test } from "@playwright/test";

test("global appearance settings are reachable before joining and retain other preferences", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sise_game_display_preferences_v2", JSON.stringify({ ownCards: "long", handLayout: "paged" })));
  await page.goto("/?new=1");
  await page.getByTestId("game-settings").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await revealSetting(page, "card-mode-own-long");
  await expect(page.getByTestId("card-mode-own-long")).toHaveAttribute("aria-checked", "true");
  await revealSetting(page, "hand-layout-paged");
  await expect(page.getByTestId("hand-layout-paged")).toHaveAttribute("aria-checked", "true");
  await revealSetting(page, "skin-cyber-minimal");
  await page.getByTestId("skin-cyber-minimal").click();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "cyber-minimal");
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await expect(page.getByTestId("game-settings")).toBeFocused();
});

test("settings use categories outside play and restore navigation focus", async ({ page }) => {
  await page.goto('/?new=1');
  await page.getByTestId('game-settings').click();
  await expect(page.getByTestId('settings-category-table')).toBeVisible();
  await expect(page.getByTestId('card-mode-own-long')).toHaveCount(0);
  await page.getByTestId('settings-category-table').click();
  await expect(page.getByTestId('hand-layout-paged')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-category-table')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('game-settings')).toBeFocused();
});
