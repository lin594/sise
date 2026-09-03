import { expect, test } from "@playwright/test";

test("friend-room guests explicitly prepare before the host can start", async ({ browser }, testInfo) => {
  const hostContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/");
    await host.getByTestId("nickname-input").fill("准备房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("seat-grid")).toBeVisible();

    await guest.goto(host.url());
    await guest.getByTestId("nickname-input").fill("银发牌友");
    await guest.getByTestId("login-submit").click();
    await expect(guest.getByTestId("seat-grid")).toBeVisible();
    await guest.getByTestId("claim-seat-1").click();
    await expect(guest.getByTestId("seat-1")).toContainText("你");

    await host.getByTestId("fill-bots").click();
    const hostStart = host.getByTestId("lobby-start");
    await expect(hostStart).toBeDisabled();
    await expect(host.getByRole("heading", { name: "还有 1 位牌友未准备" })).toBeVisible();
    await expect(host.getByTestId("seat-ready-1")).toHaveText("未准备");
    const readyStateFontSize = await host.getByTestId("seat-ready-1").evaluate((status) =>
      Number.parseFloat(getComputedStyle(status).fontSize),
    );
    expect(readyStateFontSize).toBeGreaterThanOrEqual(13);

    const ready = guest.getByTestId("lobby-ready");
    await expect(ready).toBeVisible();
    await expect(ready).toHaveText("我准备好了");
    await expect(ready).toHaveAttribute("aria-pressed", "false");
    const readyGeometry = await ready.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      };
    });
    expect(readyGeometry.width).toBeGreaterThanOrEqual(160);
    expect(readyGeometry.height).toBeGreaterThanOrEqual(44);
    expect(readyGeometry.insideViewport).toBe(true);
    await guest.screenshot({ path: testInfo.outputPath("friend-ready-568x320.png") });
    await ready.click();
    await expect(ready).toHaveText("取消准备");
    await expect(ready).toHaveAttribute("aria-pressed", "true");
    await expect(host.getByTestId("seat-ready-1")).toHaveText("已准备");
    await expect(hostStart).toBeEnabled();

    await ready.click();
    await expect(host.getByTestId("seat-ready-1")).toHaveText("未准备");
    await expect(hostStart).toBeDisabled();

    await ready.click();
    await expect(hostStart).toBeEnabled();
    await hostStart.click();
    await expect(host.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId("game-board")).toBeVisible({ timeout: 20_000 });
    await expect(host.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
    await expect(guest.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
