import { expect, test } from "@playwright/test";

test("global appearance settings are reachable before joining and retain other preferences", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sise_game_display_preferences_v2", JSON.stringify({ ownCards: "long", handLayout: "paged" })));
  await page.goto("/?new=1");
  await page.getByTestId("game-settings").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await expect(page.getByTestId("card-mode-own-long")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("hand-layout-paged")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("skin-cyber-minimal").click();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "cyber-minimal");
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await expect(page.getByTestId("game-settings")).toBeFocused();
});
