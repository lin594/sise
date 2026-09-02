import { expect, test } from "@playwright/test";

test("host invites a friend, configures bots, and starts a shared game", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/");
    await host.getByTestId("random-nickname").click();
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

    await guest.goto(inviteUrl);
    await guest.getByTestId("random-nickname").click();
    await guest.getByTestId("login-submit").click();
    await expect(guest.getByTestId("seat-grid")).toBeVisible();
    await guest.getByTestId("claim-seat-1").click();
    await expect(guest.getByTestId("seat-1")).toContainText("你");
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
    await host.setViewportSize({ width: 1280, height: 720 });
    await expect(guestSeatOnHost).toContainText("真人在线");
    await expect(guestSeatOnHost).toContainText(guestIdentity.name!);
    await restoredGuest.screenshot({ path: testInfo.outputPath("friend-seat-restored.png") });
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
