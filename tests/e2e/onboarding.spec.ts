import { expect, test } from "@playwright/test";

test("a fresh player chooses a table layout once and keyboard focus returns to the lobby", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.addInitScript(() => {
    localStorage.removeItem("sise_layout_onboarding_v1");
    localStorage.removeItem("sise_game_display_preferences_v2");
    localStorage.removeItem("sise_entry_name");
  });
  await page.goto("/");

  const dialog = page.getByTestId("layout-onboarding-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "选一个顺手的牌桌" })).toBeVisible();
  await expect(dialog).toContainText("之后仍可在设置里更改");

  const adaptive = page.getByTestId("layout-adaptive");
  const confirm = page.getByTestId("confirm-layout-onboarding");
  await expect(dialog.getByRole("radio", { name: /自适应布局/ })).toBeVisible();
  await expect(adaptive).toHaveAttribute("aria-checked", "true");
  await expect(adaptive).toBeFocused();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox && dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= 320).toBeTruthy();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(adaptive).toBeFocused();

  await page.getByTestId("layout-compact").click();
  await expect(page.getByTestId("layout-compact")).toHaveAttribute("aria-checked", "true");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("mode-practice_bots")).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({
    onboarding: localStorage.getItem("sise_layout_onboarding_v1"),
    layout: JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}").tableLayout,
  }))).toEqual({ onboarding: "done", layout: "compact" });

  await page.reload();
  await expect(page.getByTestId("layout-onboarding-dialog")).toHaveCount(0);
  await expect(page.getByTestId("mode-practice_bots")).toBeVisible();
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
});
