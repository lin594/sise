import { expect, test } from "@playwright/test";

test("a host can dissolve a waiting friend table for everyone", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const guestContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/");
    await host.getByTestId("nickname-input").fill("解散房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("seat-grid")).toBeVisible();
    const inviteUrl = host.url();
    const roomId = new URL(inviteUrl).searchParams.get("roomId");
    expect(roomId).toBeTruthy();

    await guest.goto(inviteUrl);
    await guest.getByTestId("nickname-input").fill("桌边牌友");
    await guest.getByTestId("login-submit").click();
    await expect(guest.getByTestId("seat-grid")).toBeVisible();
    await expect(guest.getByTestId("dissolve-room")).toHaveCount(0);

    const dissolve = host.getByTestId("dissolve-room");
    await expect(dissolve).toBeVisible();
    await dissolve.click();
    const dialog = host.getByRole("dialog", { name: "解散整张好友桌？" });
    await expect(dialog).toContainText("让所有牌友立即返回模式选择");
    await expect(host.getByTestId("cancel-waiting-leave")).toBeFocused();
    await host.keyboard.press("Escape");
    await expect(dissolve).toBeFocused();

    await dissolve.click();
    await host.getByTestId("confirm-dissolve-room").click();
    await expect(host.getByText("游戏模式选择")).toBeVisible();
    await expect(guest.getByText("游戏模式选择")).toBeVisible();
    await expect(guest.getByText("房主已解散本桌，大家已返回模式选择。")).toBeVisible();

    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate((endedRoomId) => ({
        roomId: localStorage.getItem("four_room_id"),
        token: endedRoomId ? localStorage.getItem(`four_player_token:${endedRoomId}`) : null,
        queryRoomId: new URL(location.href).searchParams.get("roomId"),
      }), roomId)).toEqual({ roomId: null, token: null, queryRoomId: null });
    }
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
