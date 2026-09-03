import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

async function enterDeclaration(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
}

async function recordNextDeclarationScrollBehavior(page: Page): Promise<void> {
  await page.getByTestId("declare-hand-preview").evaluate((rail) => {
    const target = rail as HTMLElement;
    const original = target.scrollBy.bind(target);
    target.scrollBy = ((options: ScrollToOptions) => {
      window.sessionStorage.setItem("sise_test_hand_scroll_behavior", String(options.behavior ?? ""));
      original(options);
    }) as typeof target.scrollBy;
  });
  await page.getByTestId("declare-hand-scroll-next").click();
}

test("the game motion preference is immediate, persistent, and still defers to the operating system", async ({ page }, testInfo) => {
  await enterDeclaration(page);

  const layout = page.locator("main.layout");
  const settingsButton = page.getByTestId("game-settings");
  await settingsButton.click();
  const setting = page.getByTestId("reduce-motion");
  await setting.scrollIntoViewIfNeeded();
  await expect(setting).toBeVisible();
  await expect(setting).toHaveAttribute("role", "switch");
  await expect(setting).toHaveAttribute("aria-checked", "false");
  await expect(setting).toContainText("关闭飞牌、翻转和循环闪动");

  await setting.click();
  await expect(setting).toHaveAttribute("aria-checked", "true");
  await expect(layout).toHaveAttribute("data-reduce-motion", "true");
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}").reduceMotion,
  )).toBe(true);

  const explicitTransitionSeconds = await page.getByTestId("settings-rules").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration) || 0,
  );
  expect(explicitTransitionSeconds).toBeLessThanOrEqual(0.00001);
  await page.evaluate(() => {
    for (const className of ["fx-card", "dealer-flight"]) {
      const sample = document.createElement("span");
      sample.className = className;
      sample.dataset.testid = `reduced-${className}`;
      document.querySelector("main.layout")?.append(sample);
    }
  });
  await expect(page.getByTestId("reduced-fx-card")).toBeHidden();
  await expect(page.getByTestId("reduced-dealer-flight")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("reduced-motion-enabled-320x568.png") });
  await page.keyboard.press("Escape");
  await recordNextDeclarationScrollBehavior(page);
  expect(await page.evaluate(() => sessionStorage.getItem("sise_test_hand_scroll_behavior"))).toBe("auto");

  await page.reload();
  await expect(layout).toHaveAttribute("data-reduce-motion", "true", { timeout: 20_000 });
  await expect(settingsButton).toBeEnabled({ timeout: 20_000 });
  await settingsButton.click();
  await expect(setting).toHaveAttribute("aria-checked", "true");

  await setting.click();
  await expect(layout).toHaveAttribute("data-reduce-motion", "false");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const systemTransitionSeconds = await page.getByTestId("confirm-declaration").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration) || 0,
  );
  expect(systemTransitionSeconds).toBeLessThanOrEqual(0.00001);
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}").reduceMotion,
  )).toBe(false);
  await recordNextDeclarationScrollBehavior(page);
  expect(await page.evaluate(() => sessionStorage.getItem("sise_test_hand_scroll_behavior"))).toBe("auto");
});
