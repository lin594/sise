import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

test("a human can request one server-authoritative time extension per decision", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();
  await page.getByTestId("add-bot-1").click();
  await page.getByTestId("add-bot-2").click();
  await page.getByTestId("add-bot-3").click();
  await expect(page.getByTestId("lobby-start")).toBeEnabled();
  await page.getByTestId("lobby-start").click();

  const declarationConfirm = page.getByTestId("confirm-declaration");
  await expect(declarationConfirm).toBeEnabled({ timeout: 20_000 });
  const declarationMoreTime = page.getByTestId("declare-request-more-time");
  await expect(declarationMoreTime).toBeVisible();
  await expect(declarationMoreTime).toHaveAccessibleName("需要更多时间，增加20秒");
  const declarationSecondsBefore = Number(await page.locator(".declare-timer strong").textContent());
  await declarationMoreTime.click();
  await expect(declarationMoreTime).toHaveCount(0);
  await expect.poll(async () => Number(await page.locator(".declare-timer strong").textContent())).toBeGreaterThan(
    declarationSecondsBefore + 15,
  );

  await declarationConfirm.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
  await page.setViewportSize({ width: 568, height: 320 });

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("chi_local_upper");
  });

  const actionMoreTime = page.getByTestId("request-more-time");
  await expect(actionMoreTime).toBeVisible();
  await expect(actionMoreTime).toHaveAccessibleName("需要更多时间，增加20秒");
  const actionSecondsBefore = Number(
    (await page.getByTestId("action-guidance").textContent())?.match(/还剩\s*(\d+)\s*秒/)?.[1] ?? 0,
  );
  const geometry = await actionMoreTime.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const dock = button.closest<HTMLElement>(".action-dock")!.getBoundingClientRect();
    return {
      height: rect.height,
      withinViewport: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
      inside:
        rect.left >= dock.left && rect.right <= dock.right && rect.top >= dock.top && rect.bottom <= dock.bottom,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(40);
  expect(geometry.inside).toBe(true);
  expect(geometry.withinViewport).toBe(true);
  expect(geometry.noHorizontalOverflow).toBe(true);

  await actionMoreTime.click();
  await expect(actionMoreTime).toHaveCount(0);
  await expect.poll(async () => {
    const text = (await page.getByTestId("action-guidance").textContent()) ?? "";
    return Number(text.match(/还剩\s*(\d+)\s*秒/)?.[1] ?? 0);
  }).toBeGreaterThan(actionSecondsBefore + 15);
  await expect(page.getByTestId("game-board")).toHaveAttribute("data-response-phase", "local_upper");
  await expect(page.getByTestId("action-chi")).toBeEnabled();
});

test("single-player practice lets the human decide without a countdown", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();

  const declarationConfirm = page.getByTestId("confirm-declaration");
  await expect(declarationConfirm).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator(".declare-timer")).toContainText("不限时");
  await expect(page.locator(".declare-timer")).toContainText("练习模式");
  await expect(page.getByText("上滑可调整 · 练习不限时")).toBeVisible();
  await expect(page.getByTestId("declare-request-more-time")).toHaveCount(0);

  await declarationConfirm.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("chi_local_upper");
  });

  await expect(page.getByTestId("action-guidance")).toContainText("练习不限时");
  await expect(page.getByTestId("request-more-time")).toHaveCount(0);
  await expect(page.getByTestId("action-chi")).toBeEnabled();
});
