import { expect, test } from "@playwright/test";

async function enterModeLobby(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill("测试牌友");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await page.getByTestId("mode-friends").click();
}

test("room creation explains a rate limit and its retry time", async ({ page }) => {
  await page.route("**/rooms", async (route) => {
    await route.fulfill({
      status: 429,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Retry-After",
        "Content-Type": "application/json",
        "Retry-After": "7",
      },
      body: JSON.stringify({
        ok: false,
        code: "rate_limited",
        message: "创建房间过于频繁，请稍后再试。",
      }),
    });
  });
  await enterModeLobby(page);
  await page.getByTestId("lobby-start").click();

  await expect(page.getByRole("alert")).toHaveText("创建房间过于频繁，请在 7 秒后再试。");
  await expect(page.getByTestId("lobby-start")).toBeEnabled();
});

test("room creation does not expose a server-side failure detail", async ({ page }) => {
  await page.route("**/rooms", async (route) => {
    await route.fulfill({
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, message: "internal database path /secret/data" }),
    });
  });
  await enterModeLobby(page);
  await page.getByTestId("lobby-start").click();

  await expect(page.getByRole("alert")).toHaveText("创建好友房失败，请稍后重试。");
  await expect(page.getByText(/secret\/data/)).toHaveCount(0);
});
