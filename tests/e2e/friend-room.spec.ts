import { expect, test } from "@playwright/test";

test("host invites a friend, configures bots, and starts a shared game", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await hostContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/");
    await host.getByTestId("nickname-input").fill("同名牌友");
    await host.getByTestId("login-submit").click();
    await expect(host.getByText("游戏模式选择")).toBeVisible();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();

    await expect(host.getByTestId("seat-grid")).toBeVisible();
    await expect(host.getByTestId("seat-0")).toContainText("房主");
    const inviteUrl = host.url();
    expect(inviteUrl).toContain("roomId=");
    expect(inviteUrl).not.toContain("playerToken");
    expect(inviteUrl).not.toContain("hostKey");
    await expect(host.getByText("把邀请链接发给朋友；四个座位都准备好后即可开始。")).toBeVisible();
    await host.getByTestId("copy-invite").click();
    await expect(host.getByTestId("global-notice")).toHaveText("邀请链接已复制，可以发给朋友了");
    const copiedInviteUrl = await host.evaluate(() => navigator.clipboard.readText());
    expect(copiedInviteUrl).toBe(inviteUrl);
    expect(copiedInviteUrl).not.toContain("playerToken");
    expect(copiedInviteUrl).not.toContain("hostKey");

    await guest.setViewportSize({ width: 667, height: 375 });
    await guest.goto(inviteUrl);
    await expect(guest.getByRole("heading", { name: "输入昵称，加入好友房" })).toBeVisible();
    await expect(guest.getByText("这是朋友发来的牌局邀请。输入昵称后进入房间，再选择一个空座位。")).toBeVisible();
    await expect(guest.getByTestId("login-submit")).toHaveText("加入好友房");
    await guest.screenshot({ path: testInfo.outputPath("friend-invite-entry-iphone-se.png") });
    await guest.getByTestId("nickname-input").fill("同名牌友");
    await guest.getByTestId("login-submit").click();
    await expect(guest.getByTestId("seat-grid")).toBeVisible();
    await expect(guest.getByText("请选择一个写着“等待入座”的空座位；入座后等待房主开始。")).toBeVisible();
    await expect(guest.getByTestId("lobby-start")).toHaveText("请先选择座位");
    const friendLobbyGeometry = await guest.evaluate(() => {
      const invite = document.querySelector<HTMLElement>(".invite-card")!.getBoundingClientRect();
      const firstSeat = document.querySelector<HTMLElement>('[data-testid="seat-0"]')!.getBoundingClientRect();
      return {
        inviteHeight: Math.round(invite.height),
        firstSeatTop: Math.round(firstSeat.top),
        firstSeatVisibleHeight: Math.round(Math.min(firstSeat.bottom, innerHeight) - Math.max(firstSeat.top, 0)),
      };
    });
    expect(friendLobbyGeometry.inviteHeight).toBeLessThanOrEqual(70);
    expect(friendLobbyGeometry.firstSeatTop).toBeLessThan(290);
    expect(friendLobbyGeometry.firstSeatVisibleHeight).toBeGreaterThanOrEqual(80);
    await guest.screenshot({ path: testInfo.outputPath("friend-lobby-iphone-se.png") });
    await guest.getByTestId("claim-seat-1").click();
    await expect(guest.getByTestId("seat-1")).toContainText("你");
    await expect(guest.getByTestId("seat-1").locator(".player-name")).toHaveText("同名牌友（2）");
    await expect(guest.getByText("你已入座；等待房主开始，也可以换到其他空座位。")).toBeVisible();
    await expect(host.getByTestId("seat-1")).toContainText("真人在线");

    await host.getByTestId("claim-seat-3").click();
    await expect(host.getByTestId("seat-3")).toContainText("房主");
    await expect(host.getByTestId("seat-3")).toContainText("你");

    await host.getByTestId("add-bot-0").click();
    await host.getByTestId("add-bot-2").click();
    await expect(host.getByTestId("seat-2")).toContainText("强度 50");
    await host.getByTestId("bot-strength-2").fill("85");
    await expect(host.getByTestId("seat-2")).toContainText("强度 85");
    await expect(host.getByTestId("lobby-start")).toBeEnabled();

    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });

    await expect(host.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 15_000 });
    await expect(guest.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 15_000 });
    await host.getByTestId("confirm-declaration").click();
    await guest.getByTestId("confirm-declaration").click();
    await expect(host.getByTestId("confirm-declaration")).toHaveCount(0, { timeout: 15_000 });

    const guestIdentity = await guest.evaluate(() => ({
      name: localStorage.getItem("sise_entry_name"),
      seatId: document.querySelector<HTMLElement>("[data-testid='player-self']")?.dataset.playerId ?? "",
    }));
    expect(guestIdentity.name).toBeTruthy();
    expect(guestIdentity.seatId).toBeTruthy();
    const guestSeatOnHost = host.locator(
      `[data-testid^='player-'][data-player-id='${guestIdentity.seatId}']`,
    );
    await expect(host.locator(".player-card .tag.status").filter({ hasText: /^机器人$/ })).toHaveCount(2);

    await guest.close();
    await host.setViewportSize({ width: 667, height: 375 });
    await expect(guestSeatOnHost).toContainText(guestIdentity.name!);
    await expect(guestSeatOnHost.locator(".tag.status.temporary-control")).toBeVisible();
    await expect(guestSeatOnHost.locator(".tag.status.temporary-control")).toHaveText("托管中");
    await expect(guestSeatOnHost).not.toContainText("[BOT]");
    await host.screenshot({ path: testInfo.outputPath("friend-temporary-bot-control.png") });

    const restoredGuest = await guestContext.newPage();
    await restoredGuest.goto(inviteUrl);
    await expect(restoredGuest.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(restoredGuest.getByTestId("player-self")).toHaveAttribute("data-player-id", guestIdentity.seatId);
    await expect(restoredGuest.getByTestId("player-self").getByRole("heading")).toHaveText("同名牌友（2）（你）");
    await host.setViewportSize({ width: 1280, height: 720 });
    await expect(guestSeatOnHost).toContainText("真人在线");
    await expect(guestSeatOnHost).toContainText(guestIdentity.name!);
    await restoredGuest.screenshot({ path: testInfo.outputPath("friend-seat-restored.png") });
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
