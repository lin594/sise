import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

async function applySettlementScenario(page: Page): Promise<void> {
  await expect.poll(() =>
    page.evaluate(() => {
      const bridge = (window as Window & {
        __siseLocalTest?: {
          setupScenario: (scenario: string) => void;
          getLastResult: () => { scenario: string; ok: boolean } | null;
        };
      }).__siseLocalTest;
      if (!bridge) throw new Error("Local test bridge is unavailable");
      const result = bridge.getLastResult();
      if (result?.scenario !== "settlement_hu" || !result.ok) {
        bridge.setupScenario("settlement_hu");
      }
      return result;
    }),
  ).toMatchObject({ scenario: "settlement_hu", ok: true });
}

test("a passwordless local profile stays private and updates after settlement", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const requestUrls: string[] = [];
  page.on("request", (request) => requestUrls.push(request.url()));
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("nickname-input").fill("档案牌友");
  await page.getByTestId("login-submit").click();

  const summary = page.getByTestId("guest-profile-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("本机临时档案");
  await expect(summary).toContainText("还没有完成牌局");
  const profileToken = await page.evaluate(() => localStorage.getItem("sise_guest_profile_token_v1"));
  expect(profileToken).toMatch(/^gp_[a-f0-9]{48}$/);
  expect(page.url()).not.toContain("gp_");
  await page.screenshot({ path: testInfo.outputPath("guest-profile-zero-568x320.png") });

  const geometry = await summary.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const textSizes = Array.from(element.querySelectorAll("strong, span"), (child) =>
      Number.parseFloat(getComputedStyle(child).fontSize),
    );
    return {
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      smallestTextSize: Math.min(...textSizes),
      pageFits: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
    };
  });
  expect(geometry).toMatchObject({ insideViewport: true, pageFits: true });
  expect(geometry.smallestTextSize).toBeGreaterThanOrEqual(13);

  await expect(summary).toHaveAttribute("aria-haspopup", "dialog");
  await summary.click();
  const profileDialog = page.getByTestId("guest-profile-dialog");
  await expect(profileDialog).toBeVisible();
  await expect(profileDialog).toContainText("档案牌友");
  await expect(page.getByTestId("guest-profile-rounds")).toHaveText("0");
  await expect(page.getByTestId("guest-profile-wins")).toHaveText("0");
  await expect(page.getByTestId("guest-profile-win-rate")).toHaveText("—");
  await expect(page.getByTestId("guest-profile-score")).toHaveText("0分");
  await expect(profileDialog).toContainText("清除浏览器数据后无法找回");
  const dialogGeometry = await profileDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const textSizes = Array.from(element.querySelectorAll("strong, span, p"), (child) =>
      Number.parseFloat(getComputedStyle(child).fontSize),
    ).filter(Number.isFinite);
    return {
      insideViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      smallestTextSize: Math.min(...textSizes),
      pageFits: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
    };
  });
  expect(dialogGeometry).toMatchObject({ insideViewport: true, pageFits: true });
  expect(dialogGeometry.smallestTextSize).toBeGreaterThanOrEqual(13);
  await page.screenshot({ path: testInfo.outputPath("guest-profile-details-zero-568x320.png") });
  await expect(page.getByTestId("close-guest-profile")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("close-guest-profile")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("close-guest-profile")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profileDialog).toBeHidden();
  await expect(summary).toBeFocused();

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator(".layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
  await summary.click();
  await expect(profileDialog).toBeVisible();
  const rotatedDialogGeometry = await profileDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      insidePhysicalViewport:
        rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      pageFits: document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight,
    };
  });
  expect(rotatedDialogGeometry).toEqual({ insidePhysicalViewport: true, pageFits: true });
  await page.screenshot({ path: testInfo.outputPath("guest-profile-details-zero-rotated-320x568.png") });
  await page.getByTestId("guest-profile-mask").click({ position: { x: 2, y: 2 } });
  await expect(profileDialog).toBeHidden();
  await expect(summary).toBeFocused();
  await page.setViewportSize({ width: 568, height: 320 });

  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
  await applySettlementScenario(page);
  await expect(page.getByTestId("settlement-panel")).toBeVisible();

  await page.getByTestId("game-exit").click();
  await page.getByTestId("confirm-exit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await expect(summary).toContainText("已玩 1 局");
  await expect(summary).toContainText("胡 1 局");
  await summary.click();
  await expect(page.getByTestId("guest-profile-rounds")).toHaveText("1");
  await expect(page.getByTestId("guest-profile-wins")).toHaveText("1");
  await expect(page.getByTestId("guest-profile-win-rate")).toHaveText("100%");
  await expect(page.getByTestId("guest-profile-score")).toHaveText(/[+-]?\d+分/);
  await page.getByTestId("close-guest-profile").click();
  await expect(summary).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("sise_guest_profile_token_v1"))).toBe(profileToken);
  expect(page.url()).not.toContain("gp_");
  expect(requestUrls.some((url) => url.includes(profileToken ?? "gp_"))).toBe(false);

  await page.reload();
  await page.getByTestId("login-submit").click();
  await expect(summary).toContainText("已玩 1 局");
  await expect(summary).toContainText("胡 1 局");
});
