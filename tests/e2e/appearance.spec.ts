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

for (const skin of ["cyber-minimal", "licheng-water", "puxian-house", "meizhou-sea"]) {
  test(`skin ${skin} applies across the page and settings`, async ({ page }, testInfo) => {
    await page.goto("/?new=1");
    await page.getByTestId("game-settings").click();
    await page.getByTestId(`skin-${skin}`).click();
    await expect(page.locator("html")).toHaveAttribute("data-skin", skin);
    await expect(page.getByTestId(`skin-${skin}`)).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: testInfo.outputPath(`${skin}-settings.png`) });
    await page.getByRole("button", { name: "关闭设置", exact: true }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-skin", skin);
    await expect(page.locator(".layout")).toBeVisible();
  });
}

test("new defaults and the small-screen recommendation respect explicit choices", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/?new=1");
  await page.getByTestId("login-submit").click();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "licheng-water");
  await expect(page.locator("main.layout")).toHaveAttribute("data-table-layout", "classic");
  await expect(page.getByTestId("small-screen-recommendation")).toBeVisible();
  await page.getByTestId("recommend-compact").click();
  await expect(page.locator("main.layout")).toHaveAttribute("data-table-layout", "compact");
  await page.reload();
  await expect(page.getByTestId("small-screen-recommendation")).toHaveCount(0);
  await expect(page.locator("main.layout")).toHaveAttribute("data-table-layout", "compact");
});

test("all skins and layouts keep a playable table inside representative viewports", async ({ page }, testInfo) => {
  await page.goto("/?new=1&e2eDebug=1");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("game-board")).toBeVisible();
  for (const skin of ["cyber-minimal", "licheng-water", "puxian-house", "meizhou-sea"]) {
    for (const layout of ["compact", "classic"]) {
      await page.getByTestId("game-settings").click();
      await page.getByTestId(`skin-${skin}`).click();
      await page.getByTestId(`layout-${layout}`).click();
      await page.getByRole("button", { name: "关闭设置", exact: true }).click();
      await expect(page.getByTestId("settings-panel")).toBeHidden();
      await expect(page.getByTestId("game-board")).toHaveAttribute("data-table-layout", layout);
      for (const [width, height] of [[568,320], [844,390], [1024,768], [1440,900]]) {
        await page.setViewportSize({ width, height });
        const board = page.getByTestId("game-board");
        await expect.poll(async () => board.evaluate(el => {
          const r = el.getBoundingClientRect();
          return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        })).toBe(true);
        await expect(page.getByTestId("small-screen-recommendation")).toHaveCount(0);
        if (width === 1440 || width === 568) await page.screenshot({ path: testInfo.outputPath(`${skin}-${layout}-${width}.png`) });
      }
    }
  }
});
