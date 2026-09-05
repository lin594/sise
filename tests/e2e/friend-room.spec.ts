import { expect, test, type Page } from "@playwright/test";

async function openFriendInvitation(page: Page) {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill("邀请房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();
}

async function observeDealFlights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trackingWindow = window as Window & {
      __siseDealFlightCount?: number;
      __siseDealFlightObserver?: MutationObserver;
    };
    trackingWindow.__siseDealFlightCount = 0;
    trackingWindow.__siseDealFlightObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(".fx-card.deal")) trackingWindow.__siseDealFlightCount! += 1;
          trackingWindow.__siseDealFlightCount! += node.querySelectorAll(".fx-card.deal").length;
        }
      }
    });
    trackingWindow.__siseDealFlightObserver.observe(document.body, { childList: true, subtree: true });
  });
}

async function expectOneNewDealSequence(page: Page, previousCount: number): Promise<number> {
  const samples: number[] = [];
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const declaration = document.querySelector<HTMLElement>("[data-testid='confirm-declaration']");
      return {
        declaring: Boolean(declaration?.getClientRects().length),
        handCount: document.querySelectorAll("[data-testid^='hand-card-']").length,
      };
    });
    if (sample.declaring) break;
    samples.push(sample.handCount);
    await page.waitForTimeout(40);
  }
  await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
  const fullHandCount = await page.locator("[data-testid^='hand-card-']").count();
  expect(fullHandCount).toBeGreaterThan(0);
  expect(
    samples.every((count) => count < fullHandCount),
    `A full ${fullHandCount}-card hand appeared before declaration: ${samples.join(",")}`,
  ).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0,
  )).toBeGreaterThan(previousCount);
  const currentCount = await page.evaluate(() =>
    (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0,
  );
  expect(currentCount - previousCount).toBeLessThanOrEqual(81);
  return currentCount;
}

test("both friend-room clients receive one concealed deal sequence in the first and second rounds", async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/?e2eDebug=1");
    await host.getByTestId("nickname-input").fill("续局房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("seat-grid")).toBeVisible();

    await guest.goto(host.url());
    await guest.getByTestId("nickname-input").fill("续局牌友");
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId("claim-seat-1").click();
    await expect(guest.getByTestId("seat-1")).toContainText("你");
    await guest.getByTestId("lobby-ready").click();

    await host.getByTestId("fill-bots").click();
    await expect(host.getByTestId("lobby-start")).toBeEnabled();
    await Promise.all([observeDealFlights(host), observeDealFlights(guest)]);
    await host.getByTestId("lobby-start").click();

    const [hostFirstCount, guestFirstCount] = await Promise.all([
      expectOneNewDealSequence(host, 0),
      expectOneNewDealSequence(guest, 0),
    ]);
    await host.getByTestId("confirm-declaration").click();
    await guest.getByTestId("confirm-declaration").click();
    await expect(host.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

    await host.evaluate(() => {
      const bridge = (window as Window & {
        __siseLocalTest?: { setupScenario: (scenario: string) => void };
      }).__siseLocalTest;
      if (!bridge) throw new Error("Local test bridge is unavailable");
      bridge.setupScenario("settlement_hu");
    });
    await expect(host.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
    await expect(guest.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
    await host.getByTestId("next-round-trigger").click();
    await host.getByTestId("confirm-next-round").click();

    const [hostSecondCount, guestSecondCount] = await Promise.all([
      expectOneNewDealSequence(host, hostFirstCount),
      expectOneNewDealSequence(guest, guestFirstCount),
    ]);
    await host.waitForTimeout(350);
    expect(await host.evaluate(() =>
      (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0,
    )).toBe(hostSecondCount);
    expect(await guest.evaluate(() =>
      (window as Window & { __siseDealFlightCount?: number }).__siseDealFlightCount ?? 0,
    )).toBe(guestSecondCount);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("host invites a friend, configures bots, and starts a shared game", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await hostContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.addInitScript(() => {
    let copiedInvite = "";
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        sessionStorage.setItem("sise_test_unexpected_share", "1");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          copiedInvite = value;
        },
        readText: async () => copiedInvite,
      },
    });
  });

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
    await expect(host.getByText("把邀请链接发给朋友，或点击“补齐 3 位电脑”后开始。")).toBeVisible();
    await expect(host.getByTestId("copy-invite")).toHaveText("复制邀请链接");
    await expect(host.getByTestId("share-invite")).toHaveText("邀请牌友");
    await host.evaluate(() => {
      history.replaceState(history.state, "", `${location.href}&playerToken=private&hostKey=secret#private`);
    });
    await host.getByTestId("copy-invite").click();
    await expect(host.getByTestId("global-notice")).toHaveText("邀请链接已复制，可以发给朋友了");
    const clipboardSnapshot = await host.evaluate(async () => ({
      secureContext: window.isSecureContext,
      copiedInviteUrl: navigator.clipboard?.readText ? await navigator.clipboard.readText() : null,
    }));
    expect(clipboardSnapshot.secureContext).toBe(true);
    expect(clipboardSnapshot.copiedInviteUrl).toBe(inviteUrl);
    expect(await host.evaluate(() => sessionStorage.getItem("sise_test_unexpected_share"))).toBeNull();

    await guest.setViewportSize({ width: 667, height: 375 });
    await guest.goto(clipboardSnapshot.copiedInviteUrl!);
    await expect(guest.getByRole("heading", { name: "输入昵称，加入好友房" })).toBeVisible();
    await expect(guest.getByText("不用注册。输入牌桌上显示的名字，就能进入朋友的房间选座。")).toBeVisible();
    await expect(guest.getByTestId("login-submit")).toHaveText("加入好友房");
    await guest.screenshot({ path: testInfo.outputPath("friend-invite-entry-iphone-se.png") });
    await guest.getByTestId("nickname-input").fill("同名牌友");
    await guest.getByTestId("login-submit").click();
    await expect(guest.getByTestId("seat-grid")).toBeVisible();
    await expect(guest.getByText("请选择一个写着“等待入座”的空座位；入座后等待房主开始。")).toBeVisible();
    await expect(guest.getByTestId("lobby-start")).toHaveText("请先选择座位");
    await expect(guest.getByTestId("fill-bots")).toHaveCount(0);
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
    await expect(guest.getByText("确认座位和设置后，请点击“我准备好了”。")).toBeVisible();
    await expect(guest.getByTestId("lobby-ready")).toHaveText("我准备好了");
    await expect(guest.getByTestId("seat-ready-1")).toHaveText("未准备");
    await expect(guest.getByTestId("fill-bots")).toHaveCount(0);
    await expect(host.getByTestId("seat-1")).toContainText("真人在线");

    await host.setViewportSize({ width: 667, height: 375 });
    await host.getByTestId("claim-seat-3").click();
    await expect(host.getByTestId("seat-3")).toContainText("房主");
    await expect(host.getByTestId("seat-3")).toContainText("你");

    await host.getByTestId("add-bot-0").click();
    await expect(host.getByTestId("fill-bots")).toHaveText("补齐 1 位电脑");
    await expect(host.getByTestId("seat-0")).toContainText("机器人 · 标准");
    await expect(host.getByTestId("bot-level-0-standard")).toHaveAttribute("aria-pressed", "true");
    await host.getByTestId("bot-level-0-expert").click();
    await expect(host.getByTestId("seat-0")).toContainText("机器人 · 高手");
    await expect(host.getByTestId("bot-level-0-expert")).toHaveAttribute("aria-pressed", "true");
    await expect(host.getByTestId("bot-level-0-standard")).toHaveAttribute("aria-pressed", "false");
    await expect(host.locator("input[type='range']")).toHaveCount(0);
    const botLevelMetrics = await host.getByTestId("bot-levels-0").evaluate((group) => {
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

    await host.getByTestId("fill-bots").click();
    await expect(host.getByTestId("fill-bots")).toHaveCount(0);
    await expect(host.getByTestId("seat-0")).toContainText("机器人 · 高手");
    await expect(host.getByTestId("seat-1").locator(".player-name")).toHaveText("同名牌友（2）");
    await expect(host.getByTestId("seat-2")).toContainText("机器人 · 标准");
    await expect(host.getByTestId("seat-3")).toContainText("房主 · 你");
    await expect(host.getByTestId("lobby-start")).toBeDisabled();
    await expect(host.getByRole("heading", { name: "还有 1 位牌友未准备" })).toBeVisible();

    await guest.getByTestId("lobby-ready").click();
    await expect(guest.getByTestId("lobby-ready")).toHaveText("取消准备");
    await expect(guest.getByTestId("lobby-ready")).toHaveAttribute("aria-pressed", "true");
    await expect(host.getByTestId("seat-ready-1")).toHaveText("已准备");
    await expect(host.getByTestId("lobby-start")).toBeEnabled();

    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });

    // 玩家实际按 B、D、A、C 的顺序完成占座/补位。牌桌仍必须严格按
    // seatIndex 的 A→B→C→D 顺序围绕本人排列，而不能沿用加入顺序。
    await expect(host.getByTestId("player-self")).toHaveAttribute("data-player-id", "seat_3");
    await expect(host.getByTestId("player-right")).toHaveAttribute("data-player-id", "seat_0");
    await expect(host.getByTestId("player-top")).toHaveAttribute("data-player-id", "seat_1");
    await expect(host.getByTestId("player-left")).toHaveAttribute("data-player-id", "seat_2");
    await expect(guest.getByTestId("player-self")).toHaveAttribute("data-player-id", "seat_1");
    await expect(guest.getByTestId("player-right")).toHaveAttribute("data-player-id", "seat_2");
    await expect(guest.getByTestId("player-top")).toHaveAttribute("data-player-id", "seat_3");
    await expect(guest.getByTestId("player-left")).toHaveAttribute("data-player-id", "seat_0");

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
    await expect(restoredGuest.getByTestId("player-self").getByRole("heading")).toHaveText("同名牌友（2）");
    await expect(restoredGuest.getByTestId("player-self").locator(".self-seat-badge")).toHaveText("你");
    await host.setViewportSize({ width: 1280, height: 720 });
    await expect(guestSeatOnHost).toContainText("真人在线");
    await expect(guestSeatOnHost).toContainText(guestIdentity.name!);
    await restoredGuest.screenshot({ path: testInfo.outputPath("friend-seat-restored.png") });
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test.describe("friend room invitation QR", () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test("is local, readable, and safe on a legacy phone", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill("二维码房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();
  await expect.poll(() => page.url()).toContain("roomId=");

  const inviteUrl = page.url();
  const roomId = new URL(inviteUrl).searchParams.get("roomId");
  expect(roomId).toBeTruthy();
  expect(inviteUrl).not.toContain("playerToken");
  expect(inviteUrl).not.toContain("hostKey");

  const trigger = page.getByTestId("show-invite-qr");
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "扫码加入好友房" });
  const qr = page.getByTestId("friend-invite-qr");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`好友房 ${roomId}`);
  await expect(dialog).toContainText("二维码只含加入地址和房间号，不含你的身份凭据");
  await expect(qr).toHaveAttribute("data-qr-content", inviteUrl);
  await expect(qr).toHaveAttribute("aria-label", new RegExp(`好友房 ${roomId} 邀请二维码`));
  await expect(page.getByTestId("close-friend-invite-qr")).toBeFocused();

  await expect.poll(async () => qr.evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
    imageLength: canvas.toDataURL("image/png").length,
  }))).toMatchObject({ width: 320, height: 320 });
  const qrPixels = await qr.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL("image/png").length);
  expect(qrPixels).toBeGreaterThan(2_000);

  const invitationGeometry = () => page.evaluate(() => {
    const dialogRect = document.querySelector<HTMLElement>(".invite-qr-dialog")!.getBoundingClientRect();
    const qrRect = document.querySelector<HTMLElement>("[data-testid='friend-invite-qr']")!.getBoundingClientRect();
    const closeRect = document.querySelector<HTMLElement>("[data-testid='close-friend-invite-qr']")!.getBoundingClientRect();
    return {
      dialogInside:
        dialogRect.left >= 0 && dialogRect.top >= 0 && dialogRect.right <= innerWidth && dialogRect.bottom <= innerHeight,
      qrSquareDifference: Math.abs(qrRect.width - qrRect.height),
      qrWidth: qrRect.width,
      closeWidth: closeRect.width,
      closeHeight: closeRect.height,
      closeInside:
        closeRect.left >= dialogRect.left &&
        closeRect.right <= dialogRect.right &&
        closeRect.top >= dialogRect.top &&
        closeRect.bottom <= dialogRect.bottom &&
        closeRect.left >= 0 &&
        closeRect.right <= innerWidth &&
        closeRect.top >= 0 &&
        closeRect.bottom <= innerHeight,
    };
  });
  const geometry = await invitationGeometry();
  expect(geometry.dialogInside).toBe(true);
  expect(geometry.qrSquareDifference).toBeLessThanOrEqual(1);
  expect(geometry.qrWidth).toBeGreaterThanOrEqual(145);
  expect(geometry.closeHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.closeInside).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("friend-invite-qr-568.png") });

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("close-friend-invite-qr")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("close-friend-invite-qr")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator(".layout")).toHaveAttribute("data-effective-viewport", "568x320");
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("close-friend-invite-qr")).toBeFocused();
  const rotatedGeometry = await invitationGeometry();
  expect(rotatedGeometry.dialogInside).toBe(true);
  expect(rotatedGeometry.qrSquareDifference).toBeLessThanOrEqual(1);
  expect(rotatedGeometry.qrWidth).toBeGreaterThanOrEqual(145);
  expect(Math.min(rotatedGeometry.closeWidth, rotatedGeometry.closeHeight)).toBeGreaterThanOrEqual(44);
  expect(Math.max(rotatedGeometry.closeWidth, rotatedGeometry.closeHeight)).toBeGreaterThanOrEqual(120);
  expect(rotatedGeometry.closeInside).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("friend-invite-qr-rotated-320x568.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 667, height: 375 });
  await trigger.click();
  const iphoneGeometry = await invitationGeometry();
  expect(iphoneGeometry.dialogInside).toBe(true);
  expect(iphoneGeometry.qrWidth).toBeGreaterThanOrEqual(145);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1280, height: 720 });
  await trigger.click();
  const desktopGeometry = await invitationGeometry();
  expect(desktopGeometry.dialogInside).toBe(true);
  expect(desktopGeometry.qrWidth).toBeGreaterThanOrEqual(280);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("falls back to a selectable local link when canvas generation fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => null,
    });
  });
  await page.goto("/");
  await page.getByTestId("nickname-input").fill("二维码回退测试");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();
  await expect.poll(() => page.url()).toContain("roomId=");

  const inviteUrl = page.url();
  await page.getByTestId("show-invite-qr").click();
  const fallback = page.getByTestId("friend-invite-qr-fallback-url");
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveValue(inviteUrl);
  await expect(fallback).toBeFocused();
  const selection = await fallback.evaluate((field: HTMLTextAreaElement) => ({
    start: field.selectionStart,
    end: field.selectionEnd,
    length: field.value.length,
  }));
  expect(selection.start).toBe(0);
  expect(selection.end).toBe(selection.length);
  await expect(page.getByRole("dialog", { name: "扫码加入好友房" })).toContainText(
    "二维码生成失败，请长按并复制下面的链接",
  );
});

});

test("a host refresh keeps ownership while a confirmed exit transfers it immediately", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/");
    await host.getByTestId("nickname-input").fill("刷新房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("seat-0")).toContainText("房主 · 你");
    const inviteUrl = host.url();

    await guest.goto(inviteUrl);
    await guest.getByTestId("nickname-input").fill("接任牌友");
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId("claim-seat-1").click();
    await expect(guest.getByTestId("seat-1")).toContainText("你");
    await expect(guest.getByTestId("fill-bots")).toHaveCount(0);

    await host.reload();
    await expect(host.getByTestId("seat-grid")).toBeVisible({ timeout: 20_000 });
    await expect(host.getByTestId("seat-0")).toContainText("房主 · 你");
    await expect(guest.getByTestId("seat-0")).toContainText("房主");
    await expect(guest.getByTestId("fill-bots")).toHaveCount(0);

    await host.getByTestId("leave-waiting-room").click();
    await host.getByTestId("confirm-waiting-leave").click();
    await expect(host.getByText("游戏模式选择")).toBeVisible();
    await expect(guest.getByTestId("seat-1")).toContainText("房主 · 你");
    await expect(guest.getByTestId("fill-bots")).toHaveText("补齐 3 位电脑");

    await guest.getByTestId("leave-waiting-room").click();
    await guest.getByTestId("confirm-waiting-leave").click();
    await expect(guest.getByText("游戏模式选择")).toBeVisible();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});

test("a later friend can preselect while the current peng winner receives the discard turn", async ({ browser }, testInfo) => {
  const hostContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const guestContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/?e2eDebug=1");
    await host.getByTestId("nickname-input").fill("预选房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("seat-grid")).toBeVisible();
    await expect.poll(() => host.url()).toContain("roomId=");
    const inviteUrl = host.url();

    await guest.goto(inviteUrl);
    await guest.getByTestId("nickname-input").fill("先响应牌友");
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId("claim-seat-1").click();
    await host.getByTestId("claim-seat-3").click();
    await host.getByTestId("fill-bots").click();
    await expect(host.getByTestId("lobby-start")).toBeDisabled();
    await guest.getByTestId("lobby-ready").click();
    await expect(host.getByTestId("lobby-start")).toBeEnabled();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
    await expect(guest.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
    await host.getByTestId("confirm-declaration").click();
    await guest.getByTestId("confirm-declaration").click();
    await expect(host.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

    await host.evaluate(() => {
      const bridge = (window as Window & {
        __siseLocalTest?: { setupScenario: (scenario: string) => void };
      }).__siseLocalTest;
      if (!bridge) {
        throw new Error("Local test bridge is unavailable");
      }
      bridge.setupScenario("early_collective_choice");
    });
    await expect.poll(() =>
      host.evaluate(() =>
        (window as Window & {
          __siseLocalTest?: { getLastResult: () => { scenario: string; ok: boolean } | null };
        }).__siseLocalTest?.getLastResult() ?? null,
      ),
    ).toMatchObject({ scenario: "early_collective_choice", ok: true });

    const guidance = host.getByTestId("action-guidance");
    await expect(guidance).toContainText(/该你操作了|现在可以先选/);
    await expect(host.getByTestId("action-peng")).toBeEnabled();
    await expect(guest.getByTestId("action-guidance")).toContainText("该你操作了");
    await expect(guest.getByTestId("action-peng")).toBeEnabled();
    await expect(guest.locator(".action-dock")).not.toContainText(/正在操作|轮到你时会提醒/);
    await host.screenshot({ path: testInfo.outputPath("friend-early-collective-choice.png") });

    await host.getByTestId("action-pass").click();
    const receipt = host.getByTestId("action-feedback");
    await expect(receipt).toHaveCount(0);
    await expect(host.getByTestId("action-pass")).toHaveCount(0);
    await expect(host.getByTestId("action-waiting")).toHaveCount(0);
    await expect(host.locator(".action-dock")).not.toContainText(/正在操作|轮到你时会提醒/);

    // The two compact boards share a live countdown and can reflow by a few
    // pixels while Playwright is computing the click point. Dispatch through
    // the visible, enabled control so this regression stays focused on the
    // authoritative post-peng turn owner.
    await guest.getByTestId("action-peng").evaluate((button: HTMLButtonElement) => button.click());
    await expect(guest.getByTestId("discard-confirm")).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByTestId("player-self")).toContainText("当前回合");
    await expect(host.getByTestId("player-self")).not.toContainText("当前回合");
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
  const fillBotsButton = page.getByTestId("fill-bots");
  const startButton = page.getByTestId("lobby-start");
  await expect(seatGrid).toBeVisible();
  await expect(leaveButton).toBeVisible();
  await expect(leaveButton).toHaveText("离开房间");
  await expect(page.getByRole("heading", { name: "还差 3 位即可开局" })).toBeVisible();
  await expect(fillBotsButton).toBeVisible();
  await expect(fillBotsButton).toHaveText("补齐 3 位电脑");
  await expect(startButton).toBeDisabled();

  const geometry = await page.evaluate(() => {
    const lobby = document.querySelector<HTMLElement>(".lobby")!;
    const header = lobby.querySelector<HTMLElement>(".lobby-head")!;
    const scroll = lobby.querySelector<HTMLElement>("[data-testid='lobby-scroll']")!;
    const actions = lobby.querySelector<HTMLElement>(".lobby-actions")!;
    const invite = lobby.querySelector<HTMLElement>(".invite-card")!;
    const firstSeat = lobby.querySelector<HTMLElement>("[data-testid='seat-0']")!;
    const controls = Array.from(
      lobby.querySelectorAll<HTMLElement>(".lobby-head-actions button, [data-testid='copy-invite'], [data-testid='fill-bots'], [data-testid='lobby-start']"),
    ).map((element) => element.getBoundingClientRect());
    const primaryActions = Array.from(
      lobby.querySelectorAll<HTMLElement>("[data-testid='fill-bots'], [data-testid='lobby-start']"),
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
      minimumPrimaryActionHeight: Math.min(...primaryActions.map((rect) => rect.height)),
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
  expect(geometry.minimumPrimaryActionHeight).toBeGreaterThanOrEqual(46);
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

  await fillBotsButton.click();
  await expect(page.getByTestId("fill-bots")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "四席已就绪" })).toBeVisible();
  await expect(page.getByText("四席已就绪，请点开始好友对局")).toHaveCount(1);
  await expect(startButton).toBeEnabled();
  await expect(startButton).toBeFocused();
  const configuredBots = page.locator(".seat-card").filter({ hasText: /机器人 · 标准/ });
  await expect(configuredBots).toHaveCount(3);
  const configuredBotNames = await configuredBots.locator(".player-name").allTextContents();
  expect(new Set(configuredBotNames.map((name) => name.trim())).size).toBe(3);
  expect(configuredBotNames.every((name) => !/^机器人\d+$/u.test(name.trim()))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("friend-waiting-room-filled-568.png") });

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
    await expect(page.getByTestId("fill-bots")).toBeVisible();
    await expect(page.getByTestId("fill-bots")).toHaveText("补齐 3 位电脑");
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

    const fillBotsButton = page.getByTestId("fill-bots");
    const startButton = page.getByTestId("lobby-start");
    await expect(fillBotsButton).toHaveText("补齐 3 位电脑");
    await fillBotsButton.click();
    await expect(fillBotsButton).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "四席已就绪" })).toBeVisible();
    await expect(startButton).toBeEnabled();
    await expect(startButton).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("friend-waiting-filled-rotated-320x568.png") });
  });
});

test("opens the phone system share sheet for a friend invitation", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        sessionStorage.setItem("sise_test_shared_invite", JSON.stringify(data));
      },
    });
  });

  await page.goto("/");
  await page.getByTestId("nickname-input").fill("分享房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();

  const inviteButton = page.getByTestId("share-invite");
  await expect(inviteButton).toHaveText("邀请牌友");
  await inviteButton.click();
  await expect(page.getByTestId("global-notice")).toHaveText("邀请已分享，等待牌友加入");
  await expect(inviteButton).toBeFocused();
  const shared = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("sise_test_shared_invite") ?? "{}") as ShareData,
  );
  const inviteUrl = page.url();
  const roomId = new URL(inviteUrl).searchParams.get("roomId");
  expect(shared).toEqual({ text: `加入好友房 ${roomId}，一起玩四色牌\n${inviteUrl}` });
  expect(shared.text).not.toContain("playerToken");
  expect(shared.text).not.toContain("hostKey");
});

test("keeps the friend room unchanged when system sharing is cancelled", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => sessionStorage.setItem("sise_test_unexpected_copy", "1") },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => { sessionStorage.setItem("sise_test_unexpected_copy", "1"); return true; },
    });
  });

  await page.goto("/");
  await page.getByTestId("nickname-input").fill("取消分享房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();

  const inviteButton = page.getByTestId("share-invite");
  await inviteButton.click();
  await expect(inviteButton).toBeEnabled();
  await expect(inviteButton).toBeFocused();
  await expect(page.getByTestId("global-notice")).toHaveCount(0);
  await expect(page.getByTestId("invite-copy-fallback-url")).toHaveCount(0);
  await expect(page.getByTestId("seat-grid")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("sise_test_unexpected_copy"))).toBeNull();
});

test("copies an invite link on an insecure LAN deployment", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string) => command === "copy",
    });
  });

  await page.goto("/");
  await page.getByTestId("nickname-input").fill("局域网房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();

  await expect(page.getByTestId("share-invite")).toHaveCount(0);
  await page.getByTestId("copy-invite").click();
  await expect(page.getByTestId("global-notice")).toHaveText("邀请链接已复制，可以发给朋友了");
  await expect(page.getByTestId("copy-invite")).toBeFocused();
});

for (const legacyCopy of [false, true]) {
  test(`failed sharing copies the URL using ${legacyCopy ? "legacy copy after clipboard rejection" : "the clipboard"}`, async ({ page }) => {
    await page.addInitScript(({ legacyCopy }) => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => { throw new DOMException("unavailable", "NotAllowedError"); },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            if (legacyCopy) throw new DOMException("blocked", "NotAllowedError");
            sessionStorage.setItem("sise_test_copied_invite", value);
          },
        },
      });
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: (command: string) => {
          if (!legacyCopy || command !== "copy") throw new Error("unexpected legacy copy");
          sessionStorage.setItem("sise_test_copied_invite", (document.activeElement as HTMLTextAreaElement).value);
          return true;
        },
      });
    }, { legacyCopy });
    await openFriendInvitation(page);
    const shareButton = page.getByTestId("share-invite");
    await shareButton.click();
    await expect(page.getByTestId("global-notice")).toHaveText("邀请链接已复制，可以发给朋友了");
    expect(await page.evaluate(() => sessionStorage.getItem("sise_test_copied_invite"))).toBe(page.url());
    await expect(shareButton).toBeFocused();
    await expect(page.getByTestId("copy-invite")).toBeEnabled();
  });
}

for (const action of ["copy", "share"] as const) {
  test(`locks invitation actions while ${action} is pending`, async ({ page }) => {
    await page.addInitScript(() => {
      const defer = () => {
        sessionStorage.setItem("sise_test_invite_calls", String(Number(sessionStorage.getItem("sise_test_invite_calls")) + 1));
        return new Promise<void>((resolve) => {
          Object.assign(window, { finishInvite: resolve });
        });
      };
      Object.defineProperty(navigator, "share", { configurable: true, value: defer });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: defer } });
    });
    await openFriendInvitation(page);
    const trigger = page.getByTestId(`${action}-invite`);
    await trigger.click();
    await expect(trigger).toHaveText(action === "copy" ? "正在复制…" : "正在打开…");
    await expect(page.getByTestId("copy-invite")).toBeDisabled();
    await expect(page.getByTestId("share-invite")).toBeDisabled();
    await expect(page.getByTestId("show-invite-qr")).toBeDisabled();
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="copy-invite"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document.querySelector<HTMLButtonElement>('[data-testid="share-invite"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(await page.evaluate(() => sessionStorage.getItem("sise_test_invite_calls"))).toBe("1");
    await page.evaluate(() => (window as Window & { finishInvite: () => void }).finishInvite());
    await expect(page.getByTestId("copy-invite")).toBeEnabled();
    await expect(page.getByTestId("share-invite")).toBeEnabled();
    await expect(trigger).toBeFocused();
  });
}

test.describe("all invitation buttons on mobile", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("keeps copying, sharing and QR reachable without hiding seats", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => {} });
    });
    await openFriendInvitation(page);
    for (const viewport of [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 320, height: 568 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      const rotated = viewport.width === 320;
      await expect(page.locator(".layout")).toHaveAttribute("data-effective-viewport", rotated ? "568x320" : `${viewport.width}x${viewport.height}`);
      const metrics = await page.evaluate(({ rotated }) => {
        const actions = document.querySelector<HTMLElement>(".invite-actions")!;
        const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>("button"));
        const seat = document.querySelector<HTMLElement>('[data-testid="seat-0"]')!.getBoundingClientRect();
        const scroll = document.querySelector<HTMLElement>('[data-testid="lobby-scroll"]')!.getBoundingClientRect();
        return {
          labels: buttons.map((button) => button.textContent!.trim()),
          controls: buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
              readable: button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight,
              size: Math.min(rect.width, rect.height),
            };
          }),
          seatVisible: rotated
            ? Math.min(seat.right, scroll.right) - Math.max(seat.left, scroll.left)
            : Math.min(seat.bottom, scroll.bottom) - Math.max(seat.top, scroll.top),
        };
      }, { rotated });
      expect(metrics.labels).toEqual(["复制邀请链接", "邀请牌友", "出示二维码"]);
      for (const control of metrics.controls) {
        expect(control.inside, JSON.stringify({ viewport, metrics })).toBe(true);
        expect(control.readable).toBe(true);
        expect(control.size).toBeGreaterThanOrEqual(42);
      }
      expect(metrics.seatVisible, JSON.stringify({ viewport, metrics })).toBeGreaterThanOrEqual(80);
      await page.screenshot({ path: testInfo.outputPath(`invite-actions-${viewport.width}x${viewport.height}.png`) });
    }
  });
});

for (const action of ["copy", "share"] as const) {
  test(`offers an accessible in-app fallback when invite ${action} cannot copy`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => {
          throw new DOMException("share unavailable", "NotAllowedError");
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => { throw new DOMException("blocked", "NotAllowedError"); } },
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

    const copyButton = page.getByTestId(`${action}-invite`);
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
}
