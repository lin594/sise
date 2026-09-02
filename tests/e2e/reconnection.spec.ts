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
    expect(beforeDisconnect.token).toBeTruthy();
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
});
