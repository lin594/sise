import { expect, test, type Page } from "@playwright/test";

async function enterModeLobby(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill(name);
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

test("quick match groups humans, fixes their seats, and can start with computers", async ({ browser }, testInfo) => {
  const firstContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const secondContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await Promise.all([
      enterModeLobby(first, "配桌甲"),
      enterModeLobby(second, "配桌乙"),
    ]);

    await expect(first.getByTestId("mode-practice_bots")).toBeVisible();
    await expect(first.getByTestId("mode-quick_match")).toBeVisible();
    await expect(first.getByTestId("mode-friends")).toBeVisible();
    await first.screenshot({ path: testInfo.outputPath("quick-match-modes-568x320.png") });

    await first.getByTestId("mode-quick_match").click();
    await first.getByTestId("lobby-start").click();
    await expect(first.getByTestId("match-human-count")).toHaveText("真人 1 / 4");
    await expect(first.getByTestId("match-countdown")).toContainText("秒后");
    await expect(first.getByTestId("leave-waiting-room")).toBeVisible();
    await expect(first.getByTestId("lobby-start")).toHaveText("电脑补位，立即开始");

    await second.getByTestId("mode-quick_match").click();
    await second.getByTestId("lobby-start").click();
    await expect(first.getByTestId("match-human-count")).toHaveText("真人 2 / 4");
    await expect(second.getByTestId("match-human-count")).toHaveText("真人 2 / 4");

    const [firstRoomId, secondRoomId] = await Promise.all([
      first.evaluate(() => localStorage.getItem("four_room_id")),
      second.evaluate(() => localStorage.getItem("four_room_id")),
    ]);
    expect(firstRoomId).toBeTruthy();
    expect(secondRoomId).toBe(firstRoomId);
    expect(first.url()).not.toContain("roomId=");
    expect(second.url()).not.toContain("roomId=");

    await expect(first.getByTestId("seat-0")).toContainText("配桌甲");
    await expect(first.getByTestId("seat-1")).toContainText("配桌乙");
    await expect(second.getByTestId("seat-0")).toContainText("配桌甲");
    await expect(second.getByTestId("seat-1")).toContainText("配桌乙");
    await expect(first.locator("[data-testid^='claim-seat-']")).toHaveCount(0);
    await expect(first.locator("[data-testid^='add-bot-']")).toHaveCount(0);
    await expect(first.getByTestId("scoring-mode-card")).toHaveCount(0);
    await expect(first.getByTestId("copy-invite")).toHaveCount(0);

    await first.getByTestId("lobby-start").click();
    await expect(first.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(second.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(first.locator(".player-card .bot-seat-badge")).toHaveCount(2);
  } finally {
    await secondContext.close();
    await firstContext.close();
  }
});
