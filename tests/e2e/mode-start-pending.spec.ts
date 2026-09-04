import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

async function enterModeLobby(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill("慢网牌友");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

for (const scenario of [
  {
    name: "practice",
    modeTestId: "mode-practice_bots",
    pendingLabel: "正在创建练习房…",
    readyLabel: "开始单人练习",
  },
  {
    name: "friend room",
    modeTestId: "mode-friends",
    pendingLabel: "正在创建好友房…",
    readyLabel: "创建好友房",
  },
] as const) {
  test(`${scenario.name} creation shows one stable pending action`, async ({ page }) => {
    let releaseRequest!: () => void;
    let roomRequests = 0;
    await page.route("**/rooms", async (route) => {
      roomRequests += 1;
      await new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "private internal detail" }),
      });
    });

    await enterModeLobby(page);
    await page.getByTestId(scenario.modeTestId).click();
    const start = page.getByTestId("lobby-start");
    await start.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    await expect(page.locator(".lobby")).toHaveAttribute("aria-busy", "true");
    await expect(start).toBeDisabled();
    await expect(start).toHaveText(scenario.pendingLabel);
    await expect(page.locator(".start-hint")).toHaveText("请稍候，不用重复点击");
    await expect(page.locator(".mode-card:disabled")).toHaveCount(3);
    expect(roomRequests).toBe(1);

    releaseRequest();
    await expect(page.getByRole("alert")).toContainText("失败，请稍后重试");
    await expect(page.getByText("private internal detail")).toHaveCount(0);
    await expect(page.locator(".lobby")).toHaveAttribute("aria-busy", "false");
    await expect(start).toBeEnabled();
    await expect(start).toHaveText(scenario.readyLabel);
    await expect(page.locator(".mode-card:disabled")).toHaveCount(0);
  });
}

test("quick match uses joining language and can return to mode selection", async ({ page }) => {
  await page.route("**/matchmake/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await enterModeLobby(page);
  await page.getByTestId("mode-quick_match").click();
  await page.getByTestId("lobby-start").click();

  const progress = page.getByTestId("resume-session-screen");
  await expect(progress.getByText("快速配桌", { exact: true })).toBeVisible();
  await expect(progress.getByRole("heading", { name: "正在寻找牌友" })).toBeVisible();
  await expect(progress).toContainText("正在连接配桌服务，请稍候");
  await expect(progress).not.toContainText("恢复牌局");
  await expect(progress.getByTestId("cancel-session-resume")).toHaveText("取消，返回玩法选择");

  await progress.getByTestId("cancel-session-resume").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await expect(page.getByTestId("mode-quick_match")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("lobby-start")).toHaveText("开始快速配桌");
  await page.waitForTimeout(900);
  await expect(page.getByText("游戏模式选择")).toBeVisible();
});
