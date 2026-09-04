import { expect, test } from "@playwright/test";

test("storage-restricted browsers can still enter a practice game", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 568, height: 320 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    const unavailable = () => {
      throw new DOMException("Storage is disabled for this browser", "SecurityError");
    };
    Object.defineProperties(Storage.prototype, {
      getItem: { configurable: true, value: unavailable },
      setItem: { configurable: true, value: unavailable },
      removeItem: { configurable: true, value: unavailable },
    });
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto("/");

    const nickname = page.getByTestId("nickname-input");
    await expect(nickname).toBeVisible();
    expect((await nickname.inputValue()).trim().length).toBeGreaterThan(0);
    const limitation = page.getByTestId("storage-limited-note");
    await expect(limitation).toContainText("本次仍可正常游戏");
    await expect(limitation).toContainText("关闭页面后");

    const entryGeometry = await page.evaluate(() => {
      const note = document.querySelector<HTMLElement>("[data-testid='storage-limited-note']")!;
      const card = document.querySelector<HTMLElement>(".entry-card")!;
      const buttons = [...card.querySelectorAll<HTMLElement>("button")];
      const cardRect = card.getBoundingClientRect();
      return {
        noteFontSize: Number.parseFloat(getComputedStyle(note).fontSize),
        pageFits: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
        controlsInsideCard: buttons.every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= cardRect.left && rect.right <= cardRect.right
            && rect.top >= cardRect.top && rect.bottom <= cardRect.bottom;
        }),
      };
    });
    expect(entryGeometry.pageFits).toBe(true);
    expect(entryGeometry.controlsInsideCard).toBe(true);
    expect(entryGeometry.noteFontSize).toBeGreaterThanOrEqual(14);
    await page.screenshot({ path: testInfo.outputPath("storage-limited-entry-568x320.png") });

    await nickname.fill("隐私浏览器牌友");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expect(page.locator(".mode-card")).toHaveCount(3);
    await expect(page.getByTestId("guest-profile-summary")).toHaveCount(0);

    await page.getByTestId("lobby-start").click();
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
