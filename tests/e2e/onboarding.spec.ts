import { expect, test, type Page } from "@playwright/test";

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

// Model only the browser's visible-area resize. This does not emulate a native
// keyboard or replace the real-device acceptance tracked in issue #74.
async function setVisibleViewport(page: Page, width: number, height: number, scale = 1) {
  await page.evaluate(({ width, height, scale }) => {
    Object.defineProperties(window.visualViewport!, {
      width: { configurable: true, value: width },
      height: { configurable: true, value: height },
      scale: { configurable: true, value: scale },
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  }, { width, height, scale });
}

async function restoreVisibleViewport(page: Page) {
  await page.evaluate(() => {
    for (const key of ["width", "height", "scale"]) Reflect.deleteProperty(window.visualViewport!, key);
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
}

async function expectNicknameControlsInVisibleArea(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const visible = window.visualViewport!;
    const body = document.querySelector(".nickname-body")!.getBoundingClientRect();
    return ["nickname-input", "login-submit", "cancel-nickname"].map(id => {
      const rect = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      return rect.width >= 39 && rect.height >= 39
        && rect.left >= visible.offsetLeft - 1 && rect.top >= visible.offsetTop - 1
        && rect.right <= visible.offsetLeft + visible.width + 1
        && rect.bottom <= visible.offsetTop + visible.height + 1
        && (id !== "nickname-input" || (rect.left >= body.left - 1 && rect.top >= body.top - 1
          && rect.right <= body.right + 1 && rect.bottom <= body.bottom + 1));
    });
  })).toEqual([true, true, true]);
}

test.describe("nickname editing with a reduced visible viewport", () => {
  test.use({ hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("sise_entry_name", "王阿姨");
      localStorage.setItem("sise_entry_name_history", JSON.stringify(
        Array.from({ length: 8 }, (_, index) => `第${index + 1}位很长昵称的牌友`),
      ));
    });
  });

  for (const [width, height, visibleHeight] of [[390, 844, 400], [320, 568, 280], [667, 375, 165]]) {
    test(`keeps the draft, direction and save reachable when ${width}x${height} shrinks to ${visibleHeight}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto("/?new=1");
      await page.getByTestId("change-entry-name").click();
      const input = page.getByTestId("nickname-input");
      await input.fill("和朋友一起玩");
      const rotated = height > width;
      await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", String(rotated));
      await setVisibleViewport(page, width, visibleHeight);
      await expect(page.locator("main.layout")).toHaveAttribute("data-effective-viewport",
        rotated ? `${visibleHeight}x${width}` : `${width}x${visibleHeight}`);
      await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", String(rotated));
      await expect(input).toHaveValue("和朋友一起玩");
      await expect(input).toBeFocused();
      await expectNicknameControlsInVisibleArea(page);
      await page.screenshot({ path: info.outputPath(`nickname-keyboard-${width}x${height}.png`) });

      // Even an expanded long history must not push the primary action away.
      await page.getByText("用过的昵称", { exact: true }).click();
      await page.getByRole("button", { name: "第7位很长昵称的牌友", exact: true }).click();
      await expect(input).toHaveValue("第7位很长昵称的牌友");
      await expect(input).toBeFocused();
      await expect(page.locator(".nickname-history")).not.toHaveAttribute("open", "");
      await expectNicknameControlsInVisibleArea(page);
      await input.fill("和朋友一起玩");
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("change-entry-name")).toContainText("和朋友一起玩");
      await restoreVisibleViewport(page);
      await expect(page.locator("main.layout")).toHaveAttribute("data-effective-viewport",
        rotated ? `${height}x${width}` : `${width}x${height}`);
    });
  }

  test("actual rotation still changes direction and pinch zoom preserves the nickname draft", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?new=1");
    await page.getByTestId("change-entry-name").click();
    const input = page.getByTestId("nickname-input");
    await input.fill("转屏后继续输入");
    await setVisibleViewport(page, 195, 422, 2);
    await expect(page.locator("main.layout")).toHaveAttribute("data-effective-viewport", "844x390");
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    await restoreVisibleViewport(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "false");
    await expect(input).toHaveValue("转屏后继续输入");
    await expectNicknameControlsInVisibleArea(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    await expect(input).toHaveValue("转屏后继续输入");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("change-entry-name")).toContainText("转屏后继续输入");
  });

  test("nickname history and collapsed items preserve the dialog keyboard loop", async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto("/?new=1");
    // Safari does not focus buttons on pointer clicks; start this keyboard
    // journey with focus on its trigger so restoring that focus is meaningful.
    await page.getByTestId("change-entry-name").focus();
    await page.keyboard.press("Enter");
    await setVisibleViewport(page, 667, 165);
    const summary = page.locator(".nickname-history summary");
    await page.keyboard.press("Tab");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    const firstHistory = page.locator(".nickname-history-names button").first();
    await expect(firstHistory).toBeFocused();
    const selected = await firstHistory.innerText();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("nickname-input")).toBeFocused();
    await expect(page.getByTestId("nickname-input")).toHaveValue(selected);
    await expectNicknameControlsInVisibleArea(page);
    await page.keyboard.press("Tab");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("random-nickname")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cancel-nickname")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("login-submit")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "关闭修改昵称" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("login-submit")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("change-entry-name")).toBeFocused();
  });
});
