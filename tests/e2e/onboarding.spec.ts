import { expect, test, type Locator } from "@playwright/test";

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

// These are physical device sizes. The app may rotate the canvas, so measure
// the control's layout height rather than assuming screen Y is its short edge.
test.describe("touch lobby readability", () => {
  test.use({ hasTouch: true, isMobile: true });

  async function expectTouchControl(locator: Locator, senior = false) {
    const minimum = senior ? { height: 48, font: 16 } : { height: 44, font: 14 };
    await expect.poll(() => locator.evaluate((element) => ({
      height: (element as HTMLElement).offsetHeight,
      font: Number.parseFloat(getComputedStyle(element).fontSize),
    })).then(({ height, font }) => height >= minimum.height && font >= minimum.font)).toBe(true);
  }

  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [667, 375], [568, 320]]) {
    test(`practice entry stays readable and tappable at ${width}x${height}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const practice = page.getByTestId("mode-practice_bots");
      for (const senior of [false, true, false]) {
        if (senior !== (await page.getByTestId("senior-mode-entry").getAttribute("aria-pressed") === "true")) {
          await page.getByTestId("senior-mode-entry").click();
        }
        for (const id of ["game-settings", "change-entry-name", "senior-mode-entry", "pwa-install-entry"]) {
          const control = page.getByTestId(id);
          if (id === "pwa-install-entry" && !await control.isVisible()) continue;
          await expect.poll(() => control.evaluate(el => Math.min((el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight)))
            .toBeGreaterThanOrEqual(senior ? 48 : 44);
        }
        for (const control of [page.getByTestId("tutorial-entry"), practice]) {
          await expectTouchControl(control, senior);
          await control.scrollIntoViewIfNeeded();
          // Rotated canvases can round the scroll edge by a fraction of a pixel.
          await expect(control).toBeInViewport({ ratio: 0.99 });
        }
        if (senior) await page.screenshot({ path: info.outputPath(`senior-lobby-${width}x${height}.png`) });
      }
      await page.getByTestId("game-settings").click();
      await expect(page.getByTestId("settings-panel")).toBeVisible();
      await page.getByRole("button", { name: "关闭设置", exact: true }).click();
      await practice.click();
      await expect(page.getByTestId("game-board")).toBeVisible();
    });
  }

  test("unfolding restores mode explanations and comfortable practice targets", async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const explanations = page.locator(".mode-card > p");
    await expect(explanations.first()).toBeHidden();
    for (const [width, height] of [[720, 720], [768, 1024], [840, 720]]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator("main.layout")).toHaveClass(/roomy-touch-viewport/);
      for (const description of await explanations.all()) {
        await expect(description).toBeVisible();
        await expect(description).toBeInViewport({ ratio: 1 });
        expect(await description.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
      }
      await expectTouchControl(page.getByTestId("tutorial-entry"));
      await expectTouchControl(page.getByTestId("mode-practice_bots"));
      await page.screenshot({ path: info.outputPath(`unfolded-lobby-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(explanations.first()).toBeHidden();
    await page.getByTestId("mode-practice_bots").click();
    await expect(page.getByTestId("game-board")).toBeVisible();
  });

  for (const [width, height] of [[320, 568], [568, 320]]) {
    test(`friend controls remain reachable when enlarged at ${width}x${height}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.getByTestId("mode-friends").click();
      await expect(page.getByTestId("seat-grid")).toBeVisible();
      for (const senior of [false, true]) {
        if (senior) await page.getByTestId("senior-mode-entry").click();
        for (const id of ["lobby-rules", "leave-waiting-room", "dissolve-room", "copy-invite", "show-invite-qr", "fill-bots"]) {
          await expectTouchControl(page.getByTestId(id), senior);
        }
        await expect(page.getByTestId("fill-bots")).toBeInViewport({ ratio: 1 });
        await expect(page.getByTestId("lobby-start")).toBeInViewport({ ratio: 1 });
      }
      await page.getByTestId("show-invite-qr").click();
      await expect(page.getByTestId("friend-invite-qr")).toBeVisible();
      await page.getByTestId("close-friend-invite-qr").click();
      const scoring = page.getByTestId("friend-table-settings-toggle");
      await scoring.scrollIntoViewIfNeeded();
      await expectTouchControl(scoring, true);
      await scoring.click();
      await page.getByTestId("scoring-mode-cumulative").click();
      await expect(page.getByTestId("scoring-mode-cumulative")).toHaveAttribute("aria-checked", "true");
      await page.getByTestId("add-bot-1").click();
      await page.getByTestId("bot-settings-1").click();
      await expectTouchControl(page.getByTestId("bot-settings-1"), true);
      await expectTouchControl(page.getByTestId("bot-level-1-expert"), true);
      await page.getByTestId("bot-level-1-expert").click();
      await expect(page.getByTestId("bot-level-1-expert")).toHaveAttribute("aria-pressed", "true");
      const scroll = page.getByTestId("lobby-scroll");
      expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await expect(page.getByTestId("fill-bots")).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath(`senior-friend-controls-${width}x${height}.png`) });
      await page.getByTestId("fill-bots").click();
      await expect(page.getByTestId("lobby-start")).toBeEnabled();
    });
  }
});
