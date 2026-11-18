import { expect, test } from "@playwright/test";

test("a fresh player chooses a table layout once and keyboard focus returns to the lobby", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.addInitScript(() => {
    localStorage.removeItem("sise_layout_onboarding_v1");
    localStorage.removeItem("sise_game_display_preferences_v2");
    localStorage.removeItem("sise_entry_name");
  });
  await page.goto("/");
  await expect(page.getByTestId("layout-onboarding-dialog")).toHaveCount(0);
  const tutorial = page.getByTestId("tutorial-entry");
  const practice = page.getByTestId("mode-practice_bots");
  await expect(tutorial).toBeVisible();
  await expect(practice).toBeVisible();
  await expect(practice).toContainText("直接练一局");
  await page.screenshot({ path: testInfo.outputPath("first-visit-568x320.png") });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}").tableLayout)).toBe("adaptive");
  await tutorial.focus();
  await expect(tutorial).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(practice).toBeFocused();
  await page.reload();
  await expect(page.getByTestId("layout-onboarding-dialog")).toHaveCount(0);
});

test("an existing player is not mistaken for a first-time visitor after the feature ships", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("sise_layout_onboarding_v1");
    localStorage.setItem("sise_entry_name", "回桌牌友");
    localStorage.setItem("sise_game_display_preferences_v2", JSON.stringify({ tableLayout: "mahjong" }));
  });
  await page.goto("/");
  await expect(page.getByTestId("layout-onboarding-dialog")).toHaveCount(0);
  await expect(page.getByTestId("mode-practice_bots")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}").tableLayout)).toBe("mahjong");
});
