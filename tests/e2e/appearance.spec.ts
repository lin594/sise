import { startLobbyAction } from "./helpers/game";
import { expect, test } from "@playwright/test";
test.use({ hasTouch: true, isMobile: true });

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
  await startLobbyAction(page);
  await expect(page.getByTestId("game-board")).toBeVisible();
  for (const skin of ["cyber-minimal", "licheng-water", "puxian-house", "meizhou-sea"]) {
    for (const layout of ["compact", "classic"]) {
      await page.getByTestId("game-settings").click();
      await page.getByTestId(`skin-${skin}`).click();
      await page.getByTestId(`layout-${layout}`).click();
      await page.getByRole("button", { name: "关闭设置", exact: true }).click();
      await expect(page.getByTestId("settings-panel")).toBeHidden();
      await expect(page.getByTestId("game-board")).toHaveAttribute("data-table-layout", layout);
      for (const [width, height] of [[568,320], [844,390], [390,844], [1024,768], [1440,900]]) {
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

test("lobby boots with a saved name and edits without an entry screen", async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem("sise_entry_name")) localStorage.setItem("sise_entry_name", "荔城牌友"); });
  await page.goto("/?new=1");
  await expect(page.getByTestId("change-entry-name")).toContainText("荔城牌友");
  await expect(page.getByTestId("nickname-input")).toHaveCount(0);
  await page.getByTestId("change-entry-name").click();
  await page.getByTestId("nickname-input").fill("湄洲牌友");
  await page.getByTestId("cancel-nickname").click();
  await expect(page.getByTestId("change-entry-name")).toContainText("荔城牌友");
  await expect(page.getByTestId("change-entry-name")).toBeFocused();
  await page.getByTestId("change-entry-name").click();
  await page.getByTestId("nickname-input").fill("湄洲牌友");
  await page.getByTestId("login-submit").click();
  await page.reload();
  await expect(page.getByTestId("change-entry-name")).toContainText("湄洲牌友");
  await expect(page.locator(".mode-card")).toHaveCount(3);
});

test("invalid fields fall back independently and a dismissed hint stays dismissed", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("sise_game_display_preferences_v2")) localStorage.setItem("sise_game_display_preferences_v2", JSON.stringify({ skin: "unknown", tableLayout: "unknown", ownCards: "large", reduceMotion: true }));
  });
  await page.goto("/?new=1");
  await expect(page.locator("html")).toHaveAttribute("data-skin", "licheng-water");
  await expect(page.locator("main")).toHaveAttribute("data-table-layout", "classic");
  await page.getByTestId("dismiss-compact-recommendation").click();
  await page.reload();
  await expect(page.getByTestId("small-screen-recommendation")).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("data-table-layout", "classic");
  await page.getByTestId("game-settings").click();
  await expect(page.getByTestId("card-mode-own-large")).toHaveAttribute("aria-checked", "true");
});

test("blocked storage keeps appearance choices and hint dismissal for the session", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.addInitScript(() => {
    for (const name of ["getItem", "setItem", "removeItem"]) Object.defineProperty(Storage.prototype, name, { configurable: true, value() { throw new DOMException("blocked", "SecurityError"); } });
  });
  await page.goto("/?new=1");
  await page.getByTestId("dismiss-compact-recommendation").click();
  await page.getByTestId("game-settings").click();
  await page.getByTestId("skin-meizhou-sea").click();
  await page.getByTestId("layout-compact").click();
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await page.getByTestId("mode-practice_bots").click();
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-table-layout", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-skin", "meizhou-sea");
  await expect(page.getByTestId("small-screen-recommendation")).toHaveCount(0);
});

test("changing layout and skin preserves a prepared chi without submitting", async ({ page }) => {
  await page.goto("/?new=1&e2eDebug=1");
  await page.getByTestId("mode-practice_bots").click();
  await expect(page.getByTestId("game-board")).toBeVisible();
  await page.evaluate(() => {
    const bridge = (window as Window & { __siseLocalTest?: { setupScenario: (name: string) => void } }).__siseLocalTest;
    bridge?.setupScenario("chi_local_upper");
  });
  const shi = page.getByTestId("hand-card-d1");
  const xiang = page.getByTestId("hand-card-d2");
  await expect(shi).toHaveAttribute("aria-pressed", "true");
  await expect(xiang).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("game-settings").click();
  await page.getByTestId("layout-compact").click();
  await page.getByTestId("skin-puxian-house").click();
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-table-layout", "compact");
  await expect(shi).toHaveAttribute("aria-pressed", "true");
  await expect(xiang).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
});
