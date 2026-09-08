import { startLobbyAction, finishDeclarationIfNeeded } from "./helpers/game";
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

    await expect(page.getByTestId("mode-practice_bots")).toBeVisible();
    await expect(page.getByTestId("change-entry-name")).not.toHaveText("");
    await page.getByTestId("change-entry-name").click();
    const nickname = page.getByTestId("nickname-input");
    await expect(nickname).toBeVisible();
    expect((await nickname.inputValue()).trim().length).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("storage-limited-nickname-568x320.png") });
    await nickname.fill("隐私浏览器牌友");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expect(page.locator(".mode-card")).toHaveCount(3);
    await expect(page.getByTestId("guest-profile-summary")).toHaveCount(0);

    await startLobbyAction(page);
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await finishDeclarationIfNeeded(page);
    await page.getByTestId("game-exit").click();
    await page.getByTestId("confirm-exit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expect(page.getByTestId("guest-profile-summary")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
