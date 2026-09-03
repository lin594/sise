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

test("the host can dissolve after the whole table returns from settlement", async ({ page }) => {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("nickname-input").fill("返厅解散房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();
  await page.getByTestId("fill-bots").click();
  await expect(page.getByTestId("lobby-start")).toBeEnabled();
  await page.getByTestId("lobby-start").click();

  const declaration = page.getByTestId("confirm-declaration");
  await expect(declaration).toBeEnabled({ timeout: 20_000 });
  await declaration.click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) {
      throw new Error("Local test bridge is unavailable");
    }
    bridge.setupScenario("settlement_hu");
  });
  await expect(page.getByTestId("settlement-panel")).toBeVisible();
  await expect(page.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "全桌返回大厅（房主）" }).click();
  await page.getByTestId("confirm-table-return").click();

  await expect(page.getByTestId("seat-grid")).toBeVisible();
  await expect(page.getByTestId("dissolve-room")).toBeVisible();
  await page.getByTestId("dissolve-room").click();
  await page.getByTestId("confirm-dissolve-room").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
});
