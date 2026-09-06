import { expect, test, type Page } from "@playwright/test";

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || "http://127.0.0.1:2567";
const BACKEND_HOST = new URL(BACKEND_URL).host;

async function finishOpeningIfNeeded(page: Page): Promise<void> {
  await expect.poll(async () => {
    const layoutClass = await page.locator("main.layout").getAttribute("class");
    if (layoutClass?.split(/\s+/u).includes("playing")) return "playing";
    const declaration = page.getByTestId("confirm-declaration");
    if (await declaration.isVisible().catch(() => false) && await declaration.isEnabled()) {
      await declaration.click();
    }
    return "waiting";
  }, { timeout: 20_000 }).toBe("playing");
}

test.describe("牌局断线恢复", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test("半开连接无回包时主动提示网络不稳并恢复", async ({ page }, testInfo) => {
    test.setTimeout(45_000);
    await page.goto("/");
    await page.getByTestId("random-nickname").click();
    await page.getByTestId("login-submit").click();
    await page.getByTestId("lobby-start").click();
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 15_000 });
    await finishOpeningIfNeeded(page);
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", "connected");

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 60_000,
      downloadThroughput: 1,
      uploadThroughput: 1,
      connectionType: "cellular2g",
    });
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    const status = page.getByTestId("connection-status");
    await expect(status).toHaveAttribute("data-state", /reconnecting|retry_wait/, { timeout: 15_000 });
    await expect(status).toContainText(/网络不稳|未连上/);
    await expect(page.getByTestId("game-board")).toBeVisible();
    await expect(page.getByTestId("table-notice-toast")).toContainText(/网络不稳定|暂时未连上/);
    await expect(page.getByTestId("action-guidance")).toHaveCount(0);
    await expect(page.getByTestId("action-paused")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("half-open-network-warning.png") });
  });

  test("保留当前牌桌并在联网后自动恢复", async ({ context, page }, testInfo) => {
    test.setTimeout(90_000);
    let roomSocketCount = 0;
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).host === BACKEND_HOST) {
        roomSocketCount += 1;
      }
    });
    await page.goto("/");
    await page.getByTestId("random-nickname").click();
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();

    const privateStateRequest = page.waitForRequest((request) => request.url().includes("/private-state"));
    await page.getByTestId("lobby-start").click();
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 15_000 });

    const recoveryRequest = await privateStateRequest;
    const recoveryUrl = new URL(recoveryRequest.url());
    const recoveryHeaders = await recoveryRequest.allHeaders();
    const recoveryResponse = await recoveryRequest.response();
    expect(recoveryUrl.searchParams.has("playerToken")).toBe(false);
    expect(recoveryHeaders.authorization).toMatch(/^Bearer pt_/);
    expect((await recoveryResponse?.allHeaders())?.["cache-control"]).toContain("no-store");

    await finishOpeningIfNeeded(page);
    await expect(page.locator(".layout.compact-landscape")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-testid^='hand-card-']").first()).toBeVisible();
    await expect.poll(async () => {
      const cards = page.locator("[data-testid^='hand-card-']");
      return await cards.count() > 0
        && await page.locator("[data-testid^='hand-card-'].deal-concealed").count() === 0;
    }, { timeout: 15_000 }).toBe(true);

    const beforeDisconnect = await page.evaluate(() => {
      const roomId = localStorage.getItem("four_room_id");
      return {
        roomId,
        token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
        seatId: document.querySelector<HTMLElement>("[data-testid='player-self']")?.dataset.playerId ?? null,
        handIds: Array.from(document.querySelectorAll<HTMLElement>("[data-testid^='hand-card-']")).map(
          (card) => card.dataset.testid,
        ),
      };
    });
    expect(beforeDisconnect.roomId).toBeTruthy();
    expect(beforeDisconnect.token).toMatch(/^pt_[0-9a-f]{48}$/);
    expect(beforeDisconnect.seatId).toBeTruthy();
    expect(beforeDisconnect.handIds.length).toBeGreaterThan(0);
    const socketCountBeforeDisconnect = roomSocketCount;
    expect(socketCountBeforeDisconnect).toBe(1);

    await context.setOffline(true);
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", "offline", { timeout: 10_000 });
    await page.setViewportSize({ width: 568, height: 320 });
    const offlineStatus = page.getByTestId("connection-status");
    await expect(offlineStatus).toContainText("断网 · 自动恢复中");
    await expect(page.locator(".compact-game-slogan")).toBeHidden();
    const offlineStatusGeometry = await offlineStatus.evaluate((status) => {
      const header = document.querySelector<HTMLElement>("[data-testid='game-control-header']")!;
      const brand = header.querySelector<HTMLElement>(".top-brand")!;
      const tools = header.querySelector<HTMLElement>("[data-testid='game-tools']")!;
      const title = status.querySelector<HTMLElement>("strong")!;
      const statusRect = status.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      return {
        insideHeader:
          statusRect.left >= headerRect.left &&
          statusRect.right <= headerRect.right &&
          statusRect.top >= headerRect.top &&
          statusRect.bottom <= headerRect.bottom,
        clearOfBrand: statusRect.left >= brand.getBoundingClientRect().right,
        clearOfTools: statusRect.right <= tools.getBoundingClientRect().left,
        titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
        titleUnclipped: title.scrollWidth <= title.clientWidth,
      };
    });
    expect(offlineStatusGeometry).toMatchObject({
      insideHeader: true,
      clearOfBrand: true,
      clearOfTools: true,
      titleUnclipped: true,
    });
    expect(offlineStatusGeometry.titleFontSize).toBeGreaterThanOrEqual(14);
    await expect(page.getByTestId("game-board")).toBeVisible();
    await expect(page.locator("[data-testid^='hand-card-']")).toHaveCount(beforeDisconnect.handIds.length);
    expect(
      await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
        cards.map((card) => (card as HTMLElement).dataset.testid),
      ),
    ).toEqual(beforeDisconnect.handIds);
    expect(
      await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
        Math.min(...cards.map((card) => Number.parseFloat(getComputedStyle(card).opacity))),
      ),
    ).toBeGreaterThanOrEqual(0.95);
    await expect(page.locator(".action-dock button:enabled")).toHaveCount(0);
    await expect(page.getByTestId("table-notice-toast")).toContainText("网络已断开，联网后自动恢复");
    await expect(page.getByTestId("action-guidance")).toHaveCount(0);
    await expect(page.getByTestId("action-paused")).toHaveCount(0);
    await expect(page.getByTestId("action-waiting")).toHaveCount(0);
    await expect(page.getByTestId("player-self")).toContainText("网络已断开，联网后自动恢复");
    await page.screenshot({ path: testInfo.outputPath("iphone-se-offline.png") });

    const reconnectPattern = "**/matchmake/joinById/**";
    await page.route(reconnectPattern, (route) => route.abort("connectionfailed"));
    await context.setOffline(false);
    const retryButton = page.getByTestId("retry-connection");
    await expect(retryButton).toBeVisible({ timeout: 10_000 });
    const retryGeometry = await retryButton.evaluate((button) => ({
      height: button.getBoundingClientRect().height,
      fontSize: Number.parseFloat(getComputedStyle(button).fontSize),
    }));
    expect(retryGeometry.height).toBeGreaterThanOrEqual(36);
    expect(retryGeometry.fontSize).toBeGreaterThanOrEqual(14);
    await page.unroute(reconnectPattern);
    await retryButton.click();
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", /restored|connected/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("game-board")).toBeVisible();
    await expect(page.locator("[data-testid^='hand-card-']").first()).toBeVisible();
    await expect.poll(() => roomSocketCount).toBe(socketCountBeforeDisconnect + 1);
    await page.waitForTimeout(1_000);
    expect(roomSocketCount).toBe(socketCountBeforeDisconnect + 1);
    const restoredStatus = page.getByTestId("connection-status");
    await expect(restoredStatus).toHaveAttribute("data-state", "restored");
    await expect(restoredStatus).toContainText("已恢复 · 请核对手牌");
    const restoredStatusGeometry = await restoredStatus.evaluate((status) => {
      const header = document.querySelector<HTMLElement>("[data-testid='game-control-header']")!;
      const brand = header.querySelector<HTMLElement>(".top-brand")!;
      const tools = header.querySelector<HTMLElement>("[data-testid='game-tools']")!;
      const title = status.querySelector<HTMLElement>("strong")!;
      const statusRect = status.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const toolsRect = tools.getBoundingClientRect();
      return {
        insideHeader:
          statusRect.left >= headerRect.left &&
          statusRect.right <= headerRect.right &&
          statusRect.top >= headerRect.top &&
          statusRect.bottom <= headerRect.bottom,
        clearOfBrand: statusRect.left >= brandRect.right,
        clearOfTools: statusRect.right <= toolsRect.left,
        titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
        titleUnclipped: title.scrollWidth <= title.clientWidth,
      };
    });
    expect(restoredStatusGeometry.insideHeader).toBe(true);
    expect(restoredStatusGeometry.clearOfBrand).toBe(true);
    expect(restoredStatusGeometry.clearOfTools).toBe(true);
    expect(restoredStatusGeometry.titleFontSize).toBeGreaterThanOrEqual(14);
    expect(restoredStatusGeometry.titleUnclipped).toBe(true);
    const restoredPrivateState = await page.evaluate(() => {
      const handIds = Array.from(document.querySelectorAll<HTMLElement>("[data-testid^='hand-card-']")).map(
        (card) => card.dataset.testid,
      );
      return {
        seatId: document.querySelector<HTMLElement>("[data-testid='player-self']")?.dataset.playerId ?? null,
        handIds,
      };
    });
    // 断线座位会由机器人临时托管，因此恢复后的权威手牌可能已合法变化；身份不能变化，也不能出现重复牌。
    expect(restoredPrivateState.seatId).toBe(beforeDisconnect.seatId);
    expect(restoredPrivateState.handIds.length).toBeGreaterThan(0);
    expect(new Set(restoredPrivateState.handIds).size).toBe(restoredPrivateState.handIds.length);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-restored.png") });
    await page.waitForTimeout(2_100);
    await expect(restoredStatus).toContainText("已恢复 · 请核对手牌");
    await expect(restoredStatus).toHaveCount(0, { timeout: 5_000 });

    const afterRecovery = await page.evaluate(() => {
      const roomId = localStorage.getItem("four_room_id");
      return {
        roomId,
        token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
      };
    });
    expect(afterRecovery).toEqual({ roomId: beforeDisconnect.roomId, token: beforeDisconnect.token });
  });

  test("刷新页面后无需重新输入昵称即可回到原座", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await page.getByTestId("random-nickname").click();
    await page.getByTestId("login-submit").click();
    await page.getByTestId("lobby-start").click();
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 15_000 });

    await finishOpeningIfNeeded(page);
    await expect(page.locator("[data-testid^='hand-card-']").first()).toBeVisible({ timeout: 15_000 });

    const beforeReload = await page.evaluate(() => {
      const roomId = localStorage.getItem("four_room_id");
      return {
        roomId,
        token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
        name: localStorage.getItem("sise_entry_name"),
        seatId: document.querySelector<HTMLElement>("[data-testid='player-self']")?.dataset.playerId ?? null,
      };
    });
    expect(beforeReload.roomId).toBeTruthy();
    expect(beforeReload.token).toBeTruthy();
    expect(beforeReload.seatId).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId("nickname-input")).toHaveCount(0);
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", /restored|connected/);
    await expect(page.getByTestId("player-self")).toHaveAttribute("data-player-id", beforeReload.seatId!);

    const afterReload = await page.evaluate(() => {
      const roomId = localStorage.getItem("four_room_id");
      return {
        roomId,
        token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
        name: localStorage.getItem("sise_entry_name"),
      };
    });
    expect(afterReload).toEqual({
      roomId: beforeReload.roomId,
      token: beforeReload.token,
      name: beforeReload.name,
    });
  });

  test("失效的历史房间停止自动重试并可清除凭证", async ({ page }, testInfo) => {
    let matchmakingRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/matchmake/joinById/")) {
        matchmakingRequests += 1;
      }
    });
    await page.addInitScript(() => {
      localStorage.setItem("four_room_id", "missing-room-for-resume");
      localStorage.setItem("four_player_token:missing-room-for-resume", "pt_stale_resume_token");
      localStorage.setItem("sise_entry_name", "测试牌友");
    });

    await page.goto("/");
    await expect(page.getByTestId("resume-session-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", "closed");
    await expect(page.getByTestId("resume-session-screen")).toContainText("原牌局已关闭");
    await expect(page.getByTestId("resume-session-screen")).toContainText("系统已停止自动恢复");
    await expect(page.getByTestId("retry-connection")).toHaveCount(0);
    await expect(page.locator("header.top").getByText("首页", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("cancel-session-resume")).toHaveText("清除旧牌局并返回玩法选择");
    await expect(page.getByTestId("cancel-session-resume")).toBeFocused();
    const requestCountAfterClosure = matchmakingRequests;
    expect(requestCountAfterClosure).toBeGreaterThan(0);
    await page.waitForTimeout(1_500);
    expect(matchmakingRequests).toBe(requestCountAfterClosure);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-resume-screen.png") });
    await page.getByTestId("cancel-session-resume").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expect(page.getByTestId("mode-practice_bots")).toBeFocused();
    expect(
      await page.evaluate(() => ({
        guarded: Boolean(window.history.state?.__siseRoomGuard),
        queryRoomId: new URL(window.location.href).searchParams.get("roomId"),
        roomId: localStorage.getItem("four_room_id"),
        token: localStorage.getItem("four_player_token:missing-room-for-resume"),
      })),
    ).toEqual({ guarded: false, queryRoomId: null, roomId: null, token: null });
  });

  test("失效的好友邀请提供直接出口并清除失败连接身份", async ({ page }, testInfo) => {
    const roomId = "missing-friend-room";
    await page.goto(`/?roomId=${roomId}`);
    await page.getByTestId("nickname-input").fill("过期邀请测试");
    await page.getByTestId("login-submit").click();

    const terminalScreen = page.getByTestId("resume-session-screen");
    await expect(terminalScreen).toBeVisible({ timeout: 15_000 });
    await expect(terminalScreen).toContainText("邀请已失效");
    await expect(terminalScreen).toContainText("这个好友房已经关闭");
    await expect(terminalScreen).toContainText("系统已停止自动恢复");
    await expect(page.getByTestId("login-submit")).toHaveCount(0);
    await expect(page.getByTestId("retry-connection")).toHaveCount(0);

    const returnButton = page.getByTestId("cancel-session-resume");
    await expect(returnButton).toHaveText("返回玩法选择");
    await expect(returnButton).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("expired-friend-invite-exit.png") });
    await returnButton.click();

    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expect(page.getByTestId("mode-practice_bots")).toBeFocused();
    await expect(page.locator(".front-lobby-identity")).toContainText("过期邀请测试");
    expect(
      await page.evaluate((failedRoomId) => ({
        guarded: Boolean(window.history.state?.__siseRoomGuard),
        queryRoomId: new URL(window.location.href).searchParams.get("roomId"),
        storedRoom: localStorage.getItem("four_room_id"),
        failedToken: localStorage.getItem(`four_player_token:${failedRoomId}`),
      }), roomId),
    ).toEqual({ guarded: false, queryRoomId: null, storedRoom: null, failedToken: null });
  });

  test("新窗口接管原座位后旧窗口停止抢回", async ({ context, page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await page.getByTestId("random-nickname").click();
    await page.getByTestId("login-submit").click();
    await page.getByTestId("lobby-start").click();
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 15_000 });

    await finishOpeningIfNeeded(page);
    await expect(page.locator("[data-testid^='hand-card-']").first()).toBeVisible({ timeout: 15_000 });
    const originalSeatId = await page.getByTestId("player-self").getAttribute("data-player-id");
    expect(originalSeatId).toBeTruthy();
    const originalIdentity = await page.evaluate(() => {
      const roomId = localStorage.getItem("four_room_id");
      return {
        roomId,
        token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
      };
    });

    const replacementPage = await context.newPage();
    await replacementPage.goto("/");
    await expect(replacementPage.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(replacementPage.getByTestId("player-self")).toHaveAttribute("data-player-id", originalSeatId!);
    const replacementIdentity = await replacementPage.evaluate(() => {
      const roomId = localStorage.getItem("four_room_id");
      return {
        roomId,
        token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
      };
    });
    expect(replacementIdentity).toEqual(originalIdentity);

    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", "closed", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("connection-status")).toContainText("已停止自动恢复");
    await expect(page.getByTestId("connection-status")).toContainText("其他窗口恢复");
    await expect(page.getByTestId("table-notice-toast")).toContainText("其他窗口恢复");
    await expect(page.getByTestId("terminal-return-to-modes")).toBeVisible();
    await expect(page.getByTestId("terminal-return-to-modes")).toBeFocused();

    await page.waitForTimeout(2_000);
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", "closed");
    await expect(replacementPage.locator("main.layout")).toHaveAttribute(
      "data-connection-state",
      /restored|connected/,
    );
    await expect(replacementPage.getByTestId("player-self")).toHaveAttribute("data-player-id", originalSeatId!);
  });

  test("个人退出后忽略迟到的旧房间私有状态", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await page.getByTestId("random-nickname").click();
    await page.getByTestId("login-submit").click();
    await page.getByTestId("lobby-start").click();
    await expect(page.getByTestId("game-board")).toBeVisible({ timeout: 15_000 });

    await finishOpeningIfNeeded(page);
    await expect(page.locator("[data-testid^='hand-card-']").first()).toBeVisible({ timeout: 15_000 });

    let releaseResponse = () => undefined;
    let markCaptured = () => undefined;
    const responseRelease = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const responseCaptured = new Promise<void>((resolve) => {
      markCaptured = resolve;
    });
    await page.route("**/private-state?**", async (route) => {
      const response = await route.fetch();
      markCaptured();
      await responseRelease;
      await route.fulfill({ response });
    });

    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await responseCaptured;
    await page.getByTestId("game-exit").click();
    await page.getByTestId("confirm-exit").click();
    await expect(page.getByText("游戏模式选择")).toBeVisible();

    releaseResponse();
    await page.waitForTimeout(500);
    await expect(page.getByText("游戏模式选择")).toBeVisible();
    await expect(page.getByTestId("resume-session-screen")).toHaveCount(0);
    await expect(page.getByTestId("game-board")).toHaveCount(0);
  });
});
