import { expect, test, type Page } from "@playwright/test";

async function enterModeLobby(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

async function browserBack(page: Page): Promise<void> {
  await page.evaluate(() => window.history.back());
}

async function expectCleanRoomNavigationState(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => ({
    guarded: Boolean(window.history.state?.__siseRoomGuard),
    roomId: new URL(window.location.href).searchParams.get("roomId"),
    playerToken: new URL(window.location.href).searchParams.get("playerToken"),
    isNew: new URL(window.location.href).searchParams.get("new"),
    storedRoom: window.localStorage.getItem("four_room_id"),
    storedTokens: Object.keys(window.localStorage).filter((key) => key.startsWith("four_player_token")),
  }))).toEqual({
    guarded: false,
    roomId: null,
    playerToken: null,
    isNew: null,
    storedRoom: null,
    storedTokens: [],
  });
}

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

test("browser back closes a game layer before offering a safe room exit", async ({ page }) => {
  await enterModeLobby(page);
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });

  const roomIdentity = await page.evaluate(() => ({
    roomId: window.localStorage.getItem("four_room_id"),
    handCards: document.querySelectorAll(".hand-preview-card").length,
  }));
  expect(roomIdentity.roomId).toBeTruthy();
  expect(roomIdentity.handCards).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__siseRoomGuard))).toBe(true);

  await page.getByTestId("game-settings").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await browserBack(page);
  await expect(page.getByTestId("settings-panel")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "退出当前牌局？" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__siseRoomGuard))).toBe(true);

  await browserBack(page);
  await expect(page.getByRole("heading", { name: "退出当前牌局？" })).toBeVisible();
  await expect(page.getByTestId("cancel-exit")).toBeFocused();
  await page.getByTestId("cancel-exit").click();
  await expect(page.getByTestId("confirm-declaration")).toBeVisible();
  await expect(page.locator(".hand-preview-card")).toHaveCount(roomIdentity.handCards);
  expect(await page.evaluate(() => window.localStorage.getItem("four_room_id"))).toBe(roomIdentity.roomId);

  await browserBack(page);
  await expect(page.getByRole("heading", { name: "退出当前牌局？" })).toBeVisible();
  await page.getByTestId("confirm-exit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await expectCleanRoomNavigationState(page);
});

test("the visible waiting-room exit also releases browser history protection", async ({ page }) => {
  await enterModeLobby(page);
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("leave-waiting-room")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__siseRoomGuard))).toBe(true);

  await page.getByTestId("leave-waiting-room").click();
  await expect(page.getByRole("heading", { name: "离开当前好友房？" })).toBeVisible();
  await page.getByTestId("confirm-waiting-leave").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await expectCleanRoomNavigationState(page);
});

test("browser back asks before abandoning a saved-room recovery", async ({ page }, testInfo) => {
  const roomId = "missing-room-for-back-guard";
  await page.addInitScript((storedRoomId) => {
    window.localStorage.setItem("sise_entry_name", "回归玩家");
    window.localStorage.setItem("four_room_id", storedRoomId);
    window.localStorage.setItem(`four_player_token:${storedRoomId}`, "expired-player-token");
  }, roomId);
  await page.goto("/");
  await expect(page.getByTestId("resume-session-screen")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.history.state?.__siseRoomGuard))).toBe(true);

  await browserBack(page);
  await expect(page.getByRole("heading", { name: "放弃恢复原牌局？" })).toBeVisible();
  await expect(page.getByTestId("cancel-resume-abandon")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("resume-abandon-confirm-320x568.png") });
  await page.getByTestId("cancel-resume-abandon").click();
  await expect(page.getByTestId("resume-session-screen")).toBeVisible();

  await browserBack(page);
  await page.getByTestId("confirm-resume-abandon").click();
  await expect(page.getByTestId("nickname-input")).toBeVisible();
  await expectCleanRoomNavigationState(page);
});
