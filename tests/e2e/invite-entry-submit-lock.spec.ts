import { openGameAs } from "./helpers/game";
import { expect, test } from "@playwright/test";

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:2567";

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test("an impatient invitee starts only one clearly labelled join", async ({ page, request }, testInfo) => {
  const createResponse = await request.post(`${BACKEND_URL}/rooms`, {
    data: { mode: "friends" },
  });
  expect(createResponse.ok()).toBe(true);
  const created = (await createResponse.json()) as { roomId?: string };
  expect(created.roomId).toBeTruthy();

  let matchmakeRequests = 0;
  await page.route("**/matchmake/**", async (route) => {
    matchmakeRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });

  await openGameAs(page, `/?roomId=${encodeURIComponent(created.roomId!)}`, "急性子牌友");
  await expect(page.getByTestId("nickname-input")).toHaveCount(0);
  const progress = page.getByTestId("resume-session-screen");
  await expect(progress).toBeVisible();
  await expect(progress.getByText("加入好友房", { exact: true })).toBeVisible();
  await expect(progress.getByRole("heading", { name: "正在进入朋友的牌桌" })).toBeVisible();
  await expect(progress).toContainText("正在连接房间，请稍候");
  await expect(progress.getByTestId("cancel-session-resume")).toHaveText("取消加入，返回玩法选择");
  await expect(progress).not.toContainText("恢复牌局");
  await expect(progress).not.toContainText("找回原来的座位和手牌");
  const progressGeometry = await progress.evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    const heading = panel.querySelector<HTMLElement>("h2")!;
    const description = panel.querySelector<HTMLElement>(".entry-desc")!;
    const cancel = panel.querySelector<HTMLButtonElement>("[data-testid='cancel-session-resume']")!;
    return {
      insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
      descriptionFontSize: Number.parseFloat(getComputedStyle(description).fontSize),
      cancelHeight: cancel.getBoundingClientRect().height,
      cancelFontSize: Number.parseFloat(getComputedStyle(cancel).fontSize),
    };
  });
  expect(progressGeometry.insideViewport).toBe(true);
  expect(progressGeometry.headingFontSize).toBeGreaterThanOrEqual(20);
  expect(progressGeometry.descriptionFontSize).toBeGreaterThanOrEqual(14);
  expect(progressGeometry.cancelHeight).toBeGreaterThanOrEqual(42);
  expect(progressGeometry.cancelFontSize).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: testInfo.outputPath("friend-invite-joining-568x320.png") });

  await expect(page.getByTestId("seat-grid")).toBeVisible({ timeout: 15_000 });
  expect(matchmakeRequests).toBe(1);
  await expect(page.locator(".global-error")).toHaveCount(0);
});

test("an expired invite leaves the retry loop for mode selection", async ({ page }) => {
  const missingRoomId = "missing-friend-room-for-entry-retry";
  await openGameAs(page, `/?roomId=${missingRoomId}`, "重试牌友");

  await expect(page.getByRole("heading", { name: "这个好友房已经关闭" })).toBeVisible();
  await expect(page.getByTestId("login-submit")).toHaveCount(0);
  const returnButton = page.getByRole("button", { name: "返回玩法选择" });
  await expect(returnButton).toBeFocused();
  await returnButton.click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await expect(page.getByTestId("change-entry-name")).toContainText("重试牌友");
  expect(new URL(page.url()).searchParams.get("roomId")).toBeNull();
  expect(await page.evaluate((roomId) => localStorage.getItem(`four_player_token:${roomId}`), missingRoomId)).toBeNull();
});

test("a temporary invite network failure stays retryable and then joins", async ({ page, request }) => {
  const createResponse = await request.post(`${BACKEND_URL}/rooms`, {
    data: { mode: "friends" },
  });
  const created = (await createResponse.json()) as { roomId?: string };
  expect(created.roomId).toBeTruthy();

  let joinAttempts = 0;
  await page.route("**/matchmake/joinById/**", async (route) => {
    joinAttempts += 1;
    if (joinAttempts <= 2) {
      await route.abort("connectionfailed");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await openGameAs(page, `/?roomId=${encodeURIComponent(created.roomId!)}`, "网络恢复牌友");

  const progress = page.getByTestId("resume-session-screen");
  await expect(progress.getByRole("heading", { name: "正在重新连接好友房" })).toBeVisible();
  await expect(progress.getByTestId("retry-session-entry")).toBeVisible();
  await expect(progress.getByTestId("cancel-session-resume")).toHaveText("放弃加入，返回玩法选择");
  await expect(page.getByTestId("seat-grid")).toBeVisible({ timeout: 15_000 });
  expect(joinAttempts).toBeGreaterThanOrEqual(3);
});

test("cancelling an in-flight invite clears its temporary room credential", async ({ page, request }) => {
  const createResponse = await request.post(`${BACKEND_URL}/rooms`, {
    data: { mode: "friends" },
  });
  const created = (await createResponse.json()) as { roomId?: string };
  expect(created.roomId).toBeTruthy();

  await page.route("**/matchmake/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await openGameAs(page, `/?roomId=${encodeURIComponent(created.roomId!)}`, "临时牌友");
  await expect(page.getByTestId("resume-session-screen")).toBeVisible();
  await page.getByTestId("cancel-session-resume").click();

  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await expect(page.getByTestId("mode-practice_bots")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("roomId")).toBeNull();
  await expect.poll(() => page.evaluate((roomId) => ({
    currentRoomId: localStorage.getItem("four_room_id"),
    pendingToken: localStorage.getItem(`four_player_token:${roomId}`),
  }), created.roomId!)).toEqual({ currentRoomId: null, pendingToken: null });

  await page.waitForTimeout(900);
  await expect(page.getByText("游戏模式选择")).toBeVisible();
});
