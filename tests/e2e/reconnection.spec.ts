import { expect, test } from "@playwright/test";

test.describe("牌局断线恢复", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test("保留当前牌桌并在联网后自动恢复", async ({ context, page }, testInfo) => {
    test.setTimeout(90_000);
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

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeVisible({ timeout: 15_000 });
    await confirmDeclaration.click();
    await expect(page.locator(".layout.compact-landscape")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-testid^='hand-card-']").first()).toBeVisible();

    const beforeDisconnect = await page.evaluate(() => {
      const roomId = localStorage.getItem("four_room_id");
      return {
        roomId,
        token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
        handIds: Array.from(document.querySelectorAll<HTMLElement>("[data-testid^='hand-card-']")).map(
          (card) => card.dataset.testid,
        ),
      };
    });
    expect(beforeDisconnect.roomId).toBeTruthy();
    expect(beforeDisconnect.token).toMatch(/^pt_[0-9a-f]{48}$/);
    expect(beforeDisconnect.handIds.length).toBeGreaterThan(0);

    await context.setOffline(true);
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", "offline", { timeout: 10_000 });
    await expect(page.getByTestId("connection-status")).toContainText("网络已断开");
    await expect(page.getByTestId("game-board")).toBeVisible();
    await expect(page.locator("[data-testid^='hand-card-']")).toHaveCount(beforeDisconnect.handIds.length);
    expect(
      await page.locator("[data-testid^='hand-card-']").evaluateAll((cards) =>
        cards.map((card) => (card as HTMLElement).dataset.testid),
      ),
    ).toEqual(beforeDisconnect.handIds);
    await expect(page.locator(".action-dock button:enabled")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-offline.png") });

    await context.setOffline(false);
    await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", /restored|connected/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("game-board")).toBeVisible();
    await expect(page.locator("[data-testid^='hand-card-']")).toHaveCount(beforeDisconnect.handIds.length);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-restored.png") });

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

    const confirmDeclaration = page.getByTestId("confirm-declaration");
    await expect(confirmDeclaration).toBeEnabled({ timeout: 15_000 });
    await confirmDeclaration.click();
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

  test("失效的历史房间可以放弃恢复并清除凭证", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("four_room_id", "missing-room-for-resume");
      localStorage.setItem("four_player_token:missing-room-for-resume", "pt_stale_resume_token");
      localStorage.setItem("sise_entry_name", "测试牌友");
    });

    await page.goto("/");
    await expect(page.getByTestId("resume-session-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("header.top").getByText("首页")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("iphone-se-resume-screen.png") });
    await page.getByTestId("cancel-session-resume").click();
    await expect(page.getByTestId("nickname-input")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        roomId: localStorage.getItem("four_room_id"),
        token: localStorage.getItem("four_player_token:missing-room-for-resume"),
      })),
    ).toEqual({ roomId: null, token: null });
  });
});
