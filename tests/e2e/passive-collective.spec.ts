import { expect, test } from "@playwright/test";
import { finishDeclarationIfNeeded } from "./helpers/game";

async function finishOpening(page: import("@playwright/test").Page): Promise<void> {
  await expect.poll(async () => {
    if (await page.locator("main.layout").evaluate((node) => node.classList.contains("playing"))) {
      return "playing";
    }
    const confirm = page.getByTestId("confirm-declaration");
    if (await confirm.isVisible().catch(() => false) && await confirm.isEnabled()) {
      await confirm.click();
    }
    return "waiting";
  }, { timeout: 20_000 }).toBe("playing");
}

test("a shared three-second public clock preserves the ten-second manual response deadline", async ({ browser }) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/?e2eDebug=1");
    await host.getByTestId("nickname-input").fill("被动响应房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect.poll(() => host.url()).toContain("roomId=");

    await guest.goto(host.url());
    await guest.getByTestId("nickname-input").fill("观察响应牌友");
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId("claim-seat-1").click();
    await host.getByTestId("fill-bots").click();
    await guest.getByTestId("lobby-ready").click();
    await expect(host.getByTestId("lobby-start")).toBeEnabled();
    await host.getByTestId("lobby-start").click();

    // 无鱼或无坎时服务端会跳过该玩家的对应步骤，两端都只推进实际存在的声明。
    await Promise.all([finishOpening(host), finishOpening(guest)]);
    await expect(host.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });

    const hostSeatId = await host.getByTestId("player-self").getAttribute("data-player-id");
    expect(hostSeatId).toBeTruthy();
    await host.evaluate(() => {
      const bridge = (window as any).__siseLocalTest;
      if (!bridge) throw new Error("Local test bridge is unavailable");
      bridge.setupScenario("collective_passive_wait");
    });
    await expect.poll(() => host.evaluate(() => (window as any).__siseLocalTest?.getLastResult()))
      .toMatchObject({ scenario: "collective_passive_wait", ok: true, actions: [] });

    const readClock = (page: typeof host) => page.evaluate(() => {
      const bridge = (window as any).__siseLocalTest;
      const roomState = bridge.getRoomState();
      return {
        now: Date.now(),
        responseEndsAt: roomState?.responseEndsAt,
        currentTurnPlayerId: roomState?.currentTurnPlayerId,
        activeResponderId: roomState?.activeResponderId,
        responsePhase: roomState?.responsePhase,
        decisionTimer: bridge.getDecisionTimer(),
        actions: bridge.getLastResult()?.actions,
      };
    });
    await expect.poll(() => readClock(guest), { timeout: 2_500, intervals: [20, 50, 100] }).toMatchObject({
      currentTurnPlayerId: hostSeatId,
      activeResponderId: "",
      responsePhase: "collective",
      decisionTimer: { totalMs: 3_000 },
    });
    const [hostClock, guestClock] = await Promise.all([readClock(host), readClock(guest)]);
    expect(Number(guestClock.decisionTimer.endsAt) - guestClock.now).toBeGreaterThan(0);
    expect(Math.abs(Number(hostClock.decisionTimer.endsAt) - Number(guestClock.decisionTimer.endsAt))).toBeLessThan(150);

    await Promise.all([
      expect(host.locator("main.layout")).toHaveAttribute("data-decision-attention", "none"),
      expect(host.getByTestId("pending-card").locator(".response-caption")).toHaveText("待响"),
      expect(host.getByTestId("decision-countdown")).toHaveText(/^[0-3]秒$/),
      expect(host.locator(".action-dock .btn")).toHaveCount(0),
      expect(host.getByTestId("action-guidance")).toHaveCount(0),
      expect(host.getByTestId("decision-status")).toHaveText("等待其他玩家响应"),
      expect(host.getByTestId("self-turn-outline")).toBeVisible(),
      expect(host.locator(".center-pointer.pointer-down")).toBeVisible(),
      expect(host).not.toHaveTitle(/轮到你/),
      expect(host.getByTestId("game-settings")).toHaveAttribute("aria-label", "牌局设置"),
      expect(guest.getByTestId("pending-card").locator(".response-caption")).toHaveText("待响"),
      expect(guest.getByTestId("decision-countdown")).toHaveText(/^[0-3]秒$/),
    ]);

    await host.getByTestId("game-settings").click();
    await expect(host.getByTestId("settings-decision-reminder")).toHaveCount(0);
    await host.getByRole("button", { name: "关闭设置" }).click();
    await host.getByTestId("game-settings").click();
    await host.getByTestId("settings-rules").click();
    await expect(host.getByTestId("rules-decision-reminder")).toHaveCount(0);
    await host.getByTestId("close-rules").click();

    await expect.poll(
      async () => (await readClock(host)).responsePhase,
      { timeout: 6_000 },
    ).toBe("local_upper");
    const localClock = await readClock(host);
    expect(localClock.activeResponderId).toBe("");
    expect(localClock.decisionTimer.totalMs).toBe(30_000);
    await expect(host.getByTestId("decision-status")).toHaveCount(0);
    await host.evaluate(() => (window as any).__siseLocalTest.setupScenario("collective_manual_wait"));
    await expect(guest.getByTestId("action-peng")).toBeEnabled();
    const manualClock = await readClock(guest);
    expect(manualClock.decisionTimer.totalMs).toBe(10_000);
    await expect(host.getByTestId("decision-countdown")).toHaveText(/^[1-3]秒$/);
    await expect(guest.getByTestId("decision-countdown")).toHaveText(/^[1-3]秒$/);
    await expect(host.getByTestId("decision-countdown")).toHaveText("0秒", {timeout:4500});
    await expect(host.getByTestId("decision-status")).toHaveText("等待其他玩家操作");
    await expect(guest.getByTestId("decision-countdown")).toHaveText("0秒");
    await expect(guest.getByTestId("action-peng")).toBeEnabled();
    await guest.waitForTimeout(1200);
    expect((await readClock(guest)).decisionTimer.endsAt).toBe(manualClock.decisionTimer.endsAt);
    await expect(guest.getByTestId("action-peng")).toBeEnabled();
    await expect.poll(async () => (await readClock(host)).responsePhase, {timeout:8000}).not.toBe("collective");
    expect(Date.now()).toBeGreaterThanOrEqual(manualClock.decisionTimer.endsAt - 50);

    await expect(host.getByTestId("decision-countdown")).toContainText(/^(?:29|30)秒$/);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
