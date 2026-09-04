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

  await page.goto(`/?roomId=${encodeURIComponent(created.roomId!)}`);
  const nickname = page.getByTestId("nickname-input");
  await nickname.fill("急性子牌友");
  await nickname.evaluate((input) => {
    const eventInit = { key: "Enter", code: "Enter", bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    input.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  });

  const progress = page.getByTestId("resume-session-screen");
  await expect(progress).toBeVisible();
  await expect(progress.getByText("加入好友房", { exact: true })).toBeVisible();
  await expect(progress.getByRole("heading", { name: "正在进入朋友的牌桌" })).toBeVisible();
  await expect(progress).toContainText("正在连接房间，请稍候");
  await expect(progress.getByTestId("cancel-session-resume")).toHaveText("取消加入，返回首页");
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

test("a failed invite join returns to the same nickname step", async ({ page }) => {
  const missingRoomId = "missing-friend-room-for-entry-retry";
  await page.goto(`/?roomId=${missingRoomId}`);
  const nickname = page.getByTestId("nickname-input");
  await nickname.fill("重试牌友");
  await page.getByTestId("login-submit").click();

  await expect(page.getByRole("heading", { name: "输入昵称，加入好友房" })).toBeVisible();
  await expect(nickname).toHaveValue("重试牌友");
  await expect(page.getByTestId("login-submit")).toBeEnabled();
  await expect(page.getByTestId("login-submit")).toHaveText("加入好友房");
  await expect(page.getByRole("alert")).toContainText("房间不存在或已关闭");
  expect(new URL(page.url()).searchParams.get("roomId")).toBe(missingRoomId);
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
  await page.goto(`/?roomId=${encodeURIComponent(created.roomId!)}`);
  await page.getByTestId("nickname-input").fill("临时牌友");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("resume-session-screen")).toBeVisible();
  await page.getByTestId("cancel-session-resume").click();

  await expect(page.getByRole("heading", { name: "先取一个昵称" })).toBeVisible();
  await expect(page.getByTestId("login-submit")).toHaveText("下一步：选择玩法");
  expect(new URL(page.url()).searchParams.get("roomId")).toBeNull();
  await expect.poll(() => page.evaluate((roomId) => ({
    currentRoomId: localStorage.getItem("four_room_id"),
    pendingToken: localStorage.getItem(`four_player_token:${roomId}`),
  }), created.roomId!)).toEqual({ currentRoomId: null, pendingToken: null });

  await page.waitForTimeout(900);
  await expect(page.getByRole("heading", { name: "先取一个昵称" })).toBeVisible();
});
