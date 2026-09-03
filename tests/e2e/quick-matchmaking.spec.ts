import { expect, test, type Page } from "@playwright/test";

async function enterModeLobby(page: Page, name: string, path = "/"): Promise<void> {
  await page.goto(path);
  await page.getByTestId("nickname-input").fill(name);
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

async function applyDebugScenario(page: Page, scenario: string): Promise<void> {
  await expect.poll(() =>
    page.evaluate((nextScenario) => {
      const bridge = (window as Window & {
        __siseLocalTest?: {
          setupScenario: (value: string) => void;
          getLastResult: () => { scenario: string; ok: boolean } | null;
        };
      }).__siseLocalTest;
      if (!bridge) throw new Error("Local test bridge is unavailable");
      const result = bridge.getLastResult();
      if (result?.scenario !== nextScenario || !result.ok) {
        bridge.setupScenario(nextScenario);
      }
      return result;
    }, scenario),
  ).toMatchObject({ scenario, ok: true });
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
    await expect(first.getByTestId("leave-waiting-room")).toHaveText("退出配桌");
    await expect(first.getByTestId("match-human-count")).toHaveText("真人 1 / 4");
    await expect(first.getByTestId("match-countdown")).toContainText("秒后");
    await expect(first.getByTestId("leave-waiting-room")).toBeVisible();
    await expect(first.getByTestId("lobby-start")).toHaveText("电脑补位，立即开始");

    await second.getByTestId("mode-quick_match").click();
    await second.getByTestId("lobby-start").click();
    await expect(first.getByTestId("match-human-count")).toHaveText("真人 2 / 4");
    await expect(second.getByTestId("match-human-count")).toHaveText("真人 2 / 4");
    await first.screenshot({ path: testInfo.outputPath("quick-match-waiting-568x320.png") });

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

test("quick match keeps its countdown through refresh and auto-starts on a rotated legacy phone", async ({ browser }) => {
  test.setTimeout(45_000);
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await enterModeLobby(page, "守桌牌友");
    await expect(page.locator(".layout")).toHaveAttribute("data-rotated-phone-portrait", "true");
    await page.getByTestId("mode-quick_match").click();
    await page.getByTestId("lobby-start").click();
    await expect(page.getByTestId("match-human-count")).toHaveText("真人 1 / 4");
    await expect(page.getByTestId("match-countdown")).toContainText("秒后");
    const initialSeconds = Number((await page.getByTestId("match-countdown").textContent())?.match(/\d+/)?.[0]);
    expect(initialSeconds).toBeGreaterThanOrEqual(8);

    await page.waitForTimeout(2_000);
    await page.reload();
    await expect(page.getByTestId("match-human-count")).toHaveText("真人 1 / 4");
    await expect(page.getByTestId("match-countdown")).toContainText("秒后");
    const restoredSeconds = Number((await page.getByTestId("match-countdown").textContent())?.match(/\d+/)?.[0]);
    expect(restoredSeconds).toBeLessThan(initialSeconds);
    expect(page.url()).not.toContain("roomId=");

    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".player-card .bot-seat-badge")).toHaveCount(3);
  } finally {
    await context.close();
  }
});

test("leaving quick-match waiting clears its local room identity", async ({ page }) => {
  await enterModeLobby(page, "先走牌友");
  await page.getByTestId("mode-quick_match").click();
  await page.getByTestId("lobby-start").click();
  const roomId = await page.evaluate(() => localStorage.getItem("four_room_id"));
  expect(roomId).toBeTruthy();

  await page.getByTestId("leave-waiting-room").click();
  await expect(page.getByRole("dialog", { name: "离开快速配桌？" })).toContainText("不会把其他牌友一起带走");
  await page.getByTestId("confirm-waiting-leave").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  const stored = await page.evaluate((departedRoomId) => ({
    roomId: localStorage.getItem("four_room_id"),
    token: localStorage.getItem(`four_player_token:${departedRoomId}`),
  }), roomId);
  expect(stored).toEqual({ roomId: null, token: null });
});

test("quick-match players rematch independently without pulling others from settlement", async ({ browser }) => {
  const firstContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const secondContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    await Promise.all([
      enterModeLobby(first, "续桌甲", "/?e2eDebug=1"),
      enterModeLobby(second, "续桌乙", "/?e2eDebug=1"),
    ]);
    await Promise.all([
      first.getByTestId("mode-quick_match").click(),
      second.getByTestId("mode-quick_match").click(),
    ]);
    await first.getByTestId("lobby-start").click();
    await second.getByTestId("lobby-start").click();
    await expect(first.getByTestId("match-human-count")).toHaveText("真人 2 / 4");
    const oldRoomId = await first.evaluate(() => localStorage.getItem("four_room_id"));
    expect(oldRoomId).toBeTruthy();

    await first.getByTestId("lobby-start").click();
    await expect(first.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await applyDebugScenario(first, "settlement_hu");
    await expect(first.getByTestId("settlement-panel")).toBeVisible();
    await expect(second.getByTestId("settlement-panel")).toBeVisible();
    await expect(first.getByTestId("quick-rematch")).toHaveText("再来一局（重新配桌）");

    await first.getByTestId("quick-rematch").click();
    await expect(first.getByTestId("match-human-count")).toHaveText("真人 1 / 4");
    const newRoomId = await first.evaluate(() => localStorage.getItem("four_room_id"));
    expect(newRoomId).toBeTruthy();
    expect(newRoomId).not.toBe(oldRoomId);
    await expect(second.getByTestId("settlement-panel")).toBeVisible();
    await expect(second.getByTestId("quick-rematch")).toBeVisible();
  } finally {
    await secondContext.close();
    await firstContext.close();
  }
});
