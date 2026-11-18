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
  const examples = [
    { section: page.locator(".practice-card"), names: ["红俥", "红傌", "红炮"], colors: 1 },
    { section: page.getByTestId("mode-friends"), names: ["绿將", "绿士", "绿象"], colors: 1 },
    { section: page.getByTestId("mode-quick_match"), names: ["红兵", "绿卒", "黄兵"], colors: 3 },
  ];
  for (const { section, names, colors } of examples) {
    const cards = section.locator(".mode-tiles [data-preview-card-id]");
    await expect(cards.locator(".text-top")).toHaveText(names.map(name => name.slice(1)));
    await expect(cards.locator(".text-bottom")).toHaveText(names.map(name => name.slice(1)));
    expect(await cards.evaluateAll(faces => faces.map(face => face.getAttribute("aria-label")))).toEqual(names);
    expect(await cards.evaluateAll(faces => new Set(faces.map(face => getComputedStyle(face).background)).size)).toBe(colors);
  }
  await page.screenshot({ path: testInfo.outputPath("first-visit-568x320.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("first-visit-1440x900.png") });
  await page.setViewportSize({ width: 568, height: 320 });
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
