import { expect, test, type Locator, type Page } from "@playwright/test";

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

  async function expectLobbyHeaderContained(page: Page) {
    await expect.poll(() => page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".top")!;
      const headerRect = header.getBoundingClientRect();
      const lobbyRect = document.querySelector(".lobby")!.getBoundingClientRect();
      const rotated = document.querySelector(".layout")!.classList.contains("rotated-phone-portrait");
      const controls = [...header.querySelectorAll<HTMLElement>("button")]
        .filter(element => element.getBoundingClientRect().width > 0);
      return header.offsetHeight <= 64
        && (rotated ? headerRect.left >= lobbyRect.right - 1 : headerRect.bottom <= lobbyRect.top + 1)
        && controls.every(element => {
          const rect = element.getBoundingClientRect();
          return rect.left >= headerRect.left - 1 && rect.right <= headerRect.right + 1
            && rect.top >= headerRect.top - 1 && rect.bottom <= headerRect.bottom + 1
            && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        });
    })).toBe(true);
  }

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
      await expectLobbyHeaderContained(page);
      const originalHeaderHeight = await page.locator(".top").evaluate(el => (el as HTMLElement).offsetHeight);
      await page.getByTestId("show-invite-qr").click();
      await expect(page.getByTestId("friend-invite-qr")).toBeVisible();
      await page.getByTestId("close-friend-invite-qr").click();
      // Lazy QR styles must not restyle the root canvas, even when opened in
      // landscape before rotating. Visible controls alone missed that overlap.
      for (const viewport of [{ width, height }, { width: height, height: width }]) {
        await page.setViewportSize(viewport);
        await expectLobbyHeaderContained(page);
        expect(await page.locator(".top").evaluate(el => (el as HTMLElement).offsetHeight)).toBe(originalHeaderHeight);
        await page.getByTestId("game-settings").click();
        await expect(page.getByTestId("settings-panel")).toBeVisible();
        await page.getByRole("button", { name: "关闭设置", exact: true }).click();
      }
      await page.setViewportSize({ width, height });
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
      await expectLobbyHeaderContained(page);
      await page.screenshot({ path: info.outputPath(`senior-friend-controls-${width}x${height}.png`) });
      await page.getByTestId("fill-bots").click();
      await expect(page.getByTestId("lobby-start")).toBeEnabled();
    });
  }
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
