import { expect, test } from "@playwright/test";

test("host invites a friend, configures bots, and starts a shared game", async ({ browser }) => {
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
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
