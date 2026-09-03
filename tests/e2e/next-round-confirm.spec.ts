import { expect, test } from "@playwright/test";

test("a friend-room host confirms before pulling other players out of settlement", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const guestContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
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
    await guest.getByTestId("nickname-input").fill("看分牌友");
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId("claim-seat-1").click();
    await host.getByTestId("fill-bots").click();
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
      bridge.setupScenario("settlement_hu");
    });

    await expect(host.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false");
    await expect(guest.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false");
    const nextRoundTrigger = host.getByTestId("next-round-trigger");
    await nextRoundTrigger.click();

    const dialog = host.getByRole("dialog", { name: "现在开始下一局？" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("其他牌友会立即离开本局结算");
    await expect(host.getByTestId("cancel-next-round")).toBeFocused();
    await host.keyboard.press("Shift+Tab");
    await expect(host.getByTestId("confirm-next-round")).toBeFocused();
    await host.keyboard.press("Tab");
    await expect(host.getByTestId("cancel-next-round")).toBeFocused();

    const dialogGeometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        cancelHeight: element.querySelector<HTMLElement>("[data-testid='cancel-next-round']")?.getBoundingClientRect().height ?? 0,
        confirmHeight: element.querySelector<HTMLElement>("[data-testid='confirm-next-round']")?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(dialogGeometry.insideViewport).toBe(true);
    expect(dialogGeometry.cancelHeight).toBeGreaterThanOrEqual(44);
    expect(dialogGeometry.confirmHeight).toBeGreaterThanOrEqual(44);
    await host.screenshot({ path: testInfo.outputPath("friend-next-round-confirm-568x320.png") });

    await host.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(nextRoundTrigger).toBeFocused();
    await expect(host.getByTestId("settlement-panel")).toBeVisible();
    await expect(guest.getByTestId("settlement-panel")).toBeVisible();

    await nextRoundTrigger.click();
    await host.getByTestId("confirm-next-round").click();
    await expect(host.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
