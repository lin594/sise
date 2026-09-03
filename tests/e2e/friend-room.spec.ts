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
    const copiedInviteUrl = await host.evaluate(async () =>
      navigator.clipboard?.readText ? await navigator.clipboard.readText() : null,
    );
    if (copiedInviteUrl !== null) {
      expect(copiedInviteUrl).toBe(inviteUrl);
      expect(copiedInviteUrl).not.toContain("playerToken");
      expect(copiedInviteUrl).not.toContain("hostKey");
    }

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
    await guest.getByTestId("leave-waiting-room").click();
    await expect(guest.getByRole("dialog", { name: "离开当前好友房？" })).toContainText("你还没有入座，将返回游戏模式大厅。");
    await expect(guest.getByTestId("cancel-waiting-leave")).toBeFocused();
    await guest.keyboard.press("Escape");
    await expect(guest.getByTestId("leave-waiting-room")).toBeFocused();
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

    await host.setViewportSize({ width: 667, height: 375 });
    await host.getByTestId("claim-seat-3").click();
    await expect(host.getByTestId("seat-3")).toContainText("房主");
    await expect(host.getByTestId("seat-3")).toContainText("你");

    await host.getByTestId("add-bot-0").click();
    await host.getByTestId("add-bot-2").click();
    await expect(host.getByTestId("seat-2")).toContainText("机器人 · 标准");
    await expect(host.getByTestId("bot-level-2-standard")).toHaveAttribute("aria-pressed", "true");
    await host.getByTestId("bot-level-2-expert").click();
    await expect(host.getByTestId("seat-2")).toContainText("机器人 · 高手");
    await expect(host.getByTestId("bot-level-2-expert")).toHaveAttribute("aria-pressed", "true");
    await expect(host.getByTestId("bot-level-2-standard")).toHaveAttribute("aria-pressed", "false");
    await expect(host.locator("input[type='range']")).toHaveCount(0);
    const botLevelMetrics = await host.getByTestId("bot-levels-2").evaluate((group) => {
      const seat = group.closest<HTMLElement>(".seat-card")!.getBoundingClientRect();
      const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button")).map((button) =>
        button.getBoundingClientRect(),
      );
      return {
        count: buttons.length,
        minimumWidth: Math.min(...buttons.map((rect) => rect.width)),
        minimumHeight: Math.min(...buttons.map((rect) => rect.height)),
        insideSeat: buttons.every((rect) => rect.left >= seat.left && rect.right <= seat.right),
      };
    });
    expect(botLevelMetrics.count).toBe(3);
    expect(botLevelMetrics.minimumWidth).toBeGreaterThanOrEqual(48);
    expect(botLevelMetrics.minimumHeight).toBeGreaterThanOrEqual(42);
    expect(botLevelMetrics.insideSeat).toBe(true);
    await host.screenshot({ path: testInfo.outputPath("friend-bot-levels-iphone-se.png") });
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
    await expect(host.locator(".player-card .bot-seat-badge")).toHaveCount(2);
    const botNames = await host.locator(".player-card .seat-identity strong").evaluateAll((elements) =>
      elements
        .filter((element) => element.parentElement?.querySelector(".bot-seat-badge"))
        .map((element) => element.textContent?.trim() ?? ""),
    );
    expect(new Set(botNames).size).toBe(2);
    expect(botNames.every((name) => !/^机器人\d+$/.test(name))).toBe(true);

    await guest.close();
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

test("legacy small waiting room keeps seats clear and allows a safe personal exit", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await page.getByTestId("nickname-input").fill("小屏房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();

  const seatGrid = page.getByTestId("seat-grid");
  const leaveButton = page.getByTestId("leave-waiting-room");
  await expect(seatGrid).toBeVisible();
  await expect(leaveButton).toBeVisible();
  await expect(leaveButton).toHaveText("离开房间");

  const geometry = await page.evaluate(() => {
    const lobby = document.querySelector<HTMLElement>(".lobby")!;
    const header = lobby.querySelector<HTMLElement>(".lobby-head")!;
    const scroll = lobby.querySelector<HTMLElement>("[data-testid='lobby-scroll']")!;
    const actions = lobby.querySelector<HTMLElement>(".lobby-actions")!;
    const invite = lobby.querySelector<HTMLElement>(".invite-card")!;
    const firstSeat = lobby.querySelector<HTMLElement>("[data-testid='seat-0']")!;
    const controls = Array.from(
      lobby.querySelectorAll<HTMLElement>(".lobby-head-actions button, [data-testid='copy-invite'], [data-testid='lobby-start']"),
    ).map((element) => element.getBoundingClientRect());
    const lobbyRect = lobby.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    const firstSeatRect = firstSeat.getBoundingClientRect();
    return {
      lobbyInsideViewport:
        lobbyRect.left >= 0 && lobbyRect.top >= 0 && lobbyRect.right <= innerWidth && lobbyRect.bottom <= innerHeight,
      headerBeforeScroll: headerRect.bottom <= scrollRect.top + 1,
      scrollBeforeActions: scrollRect.bottom <= actionRect.top + 1,
      visibleFirstSeatHeight:
        Math.min(firstSeatRect.bottom, scrollRect.bottom) - Math.max(firstSeatRect.top, scrollRect.top),
      lobbyHeight: lobbyRect.height,
      headerHeight: headerRect.height,
      scrollHeight: scrollRect.height,
      actionHeight: actionRect.height,
      inviteHeight: invite.getBoundingClientRect().height,
      minimumControlHeight: Math.min(...controls.map((rect) => rect.height)),
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  expect(geometry.lobbyInsideViewport).toBe(true);
  expect(geometry.headerBeforeScroll).toBe(true);
  expect(geometry.scrollBeforeActions).toBe(true);
  expect(geometry.visibleFirstSeatHeight, JSON.stringify(geometry)).toBeGreaterThanOrEqual(80);
  expect(geometry.minimumControlHeight).toBeGreaterThanOrEqual(42);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bodyHeight).toBeLessThanOrEqual(geometry.viewportHeight);
  await page.screenshot({ path: testInfo.outputPath("friend-waiting-room-568.png") });

  await leaveButton.click();
  const leaveDialog = page.getByRole("dialog", { name: "离开当前好友房？" });
  const cancel = page.getByTestId("cancel-waiting-leave");
  const confirm = page.getByTestId("confirm-waiting-leave");
  await expect(leaveDialog).toBeVisible();
  await expect(leaveDialog).toContainText("房主会自动转交");
  await expect(cancel).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("friend-waiting-leave-confirm-568.png") });
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(leaveDialog).toHaveCount(0);
  await expect(leaveButton).toBeFocused();

  await leaveButton.click();
  await page.getByTestId("waiting-leave-mask").click({ position: { x: 2, y: 2 } });
  await expect(leaveDialog).toHaveCount(0);
  await expect(leaveButton).toBeFocused();

  const departingRoomId = await page.evaluate(() => localStorage.getItem("four_room_id"));
  expect(departingRoomId).toBeTruthy();
  await leaveButton.click();
  await confirm.click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
  await page.waitForTimeout(1_200);
  await expect(seatGrid).toHaveCount(0);
  const leaveState = await page.evaluate((roomId) => ({
    roomId: localStorage.getItem("four_room_id"),
    token: roomId ? localStorage.getItem(`four_player_token:${roomId}`) : null,
    queryRoomId: new URL(location.href).searchParams.get("roomId"),
  }), departingRoomId);
  expect(leaveState).toEqual({ roomId: null, token: null, queryRoomId: null });
});

test.describe("rotated legacy friend waiting room", () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test("keeps the leave confirmation inside the rotated canvas", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await page.getByTestId("nickname-input").fill("竖屏牌友");
    await page.getByTestId("login-submit").click();
    await page.getByTestId("mode-friends").click();
    await page.getByTestId("lobby-start").click();

    const layout = page.locator(".layout");
    await expect(layout).toHaveAttribute("data-effective-viewport", "568x320");
    await expect(layout).toHaveAttribute("data-rotated-phone-portrait", "true");
    await page.getByTestId("leave-waiting-room").click();
    const leaveDialog = page.getByRole("dialog", { name: "离开当前好友房？" });
    await expect(leaveDialog).toBeVisible();
    await expect(page.getByTestId("cancel-waiting-leave")).toBeFocused();

    const geometry = await page.evaluate(() => {
      const mask = document.querySelector<HTMLElement>("[data-testid='waiting-leave-mask']")!.getBoundingClientRect();
      const dialog = document.querySelector<HTMLElement>(".waiting-leave-dialog")!.getBoundingClientRect();
      return {
        maskInsideViewport:
          mask.left >= 0 && mask.top >= 0 && mask.right <= innerWidth && mask.bottom <= innerHeight,
        dialogInsideViewport:
          dialog.left >= 0 && dialog.top >= 0 && dialog.right <= innerWidth && dialog.bottom <= innerHeight,
      };
    });
    expect(geometry.maskInsideViewport).toBe(true);
    expect(geometry.dialogInsideViewport).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("friend-waiting-leave-confirm-rotated-320x568.png") });
    await page.keyboard.press("Escape");
    await expect(leaveDialog).toHaveCount(0);
    await expect(page.getByTestId("leave-waiting-room")).toBeFocused();
  });
});

test("copies an invite link on an insecure LAN deployment", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
  });

  await page.goto("/");
  await page.getByTestId("nickname-input").fill("局域网房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();

  await page.getByTestId("copy-invite").click();
  await expect(page.getByTestId("global-notice")).toHaveText("邀请链接已复制，可以发给朋友了");
  await expect(page.getByTestId("copy-invite")).toBeFocused();
});

test("offers an accessible in-app fallback when invite copying is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(window, "prompt", {
      configurable: true,
      value: () => {
        (window as Window & { __legacyPromptCalled?: boolean }).__legacyPromptCalled = true;
        return null;
      },
    });
  });
  await page.setViewportSize({ width: 375, height: 667 });

  await page.goto("/");
  await page.getByTestId("nickname-input").fill("复制受限房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();

  const copyButton = page.getByTestId("copy-invite");
  await copyButton.click();
  const fallback = page.getByRole("dialog", { name: "复制邀请链接" });
  const linkField = page.getByTestId("invite-copy-fallback-url");
  await expect(fallback).toBeVisible();
  await expect(linkField).toBeFocused();
  const inviteUrl = await linkField.inputValue();
  expect(inviteUrl).toContain("roomId=");
  expect(inviteUrl).not.toContain("playerToken");
  expect(inviteUrl).not.toContain("hostKey");
  expect(await page.evaluate(() => (window as Window & { __legacyPromptCalled?: boolean }).__legacyPromptCalled)).not.toBe(true);

  const metrics = await fallback.evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const selectedText = window.getSelection()?.toString() ?? "";
    const field = dialog.querySelector<HTMLTextAreaElement>("textarea")!;
    const close = dialog.querySelector<HTMLElement>("[data-testid='close-invite-copy-fallback']")!;
    const select = dialog.querySelector<HTMLElement>("[data-testid='select-invite-link']")!;
    return {
      withinViewport:
        rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
      selectionStart: field.selectionStart,
      selectionEnd: field.selectionEnd,
      valueLength: field.value.length,
      selectedText,
      closeHeight: close.getBoundingClientRect().height,
      selectHeight: select.getBoundingClientRect().height,
    };
  });
  expect(metrics.withinViewport).toBe(true);
  expect(metrics.selectionStart).toBe(0);
  expect(metrics.selectionEnd).toBe(metrics.valueLength);
  expect(metrics.closeHeight).toBeGreaterThanOrEqual(48);
  expect(metrics.selectHeight).toBeGreaterThanOrEqual(48);

  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("select-invite-link")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(linkField).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(fallback).toHaveCount(0);
  await expect(copyButton).toBeFocused();
});
