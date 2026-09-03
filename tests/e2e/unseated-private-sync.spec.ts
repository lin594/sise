import { expect, test } from "@playwright/test";

test("an unseated friend-room visitor waits for a seat before polling private state", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const privateStateStatuses: number[] = [];
  const consoleMessages: string[] = [];

  guest.on("response", (response) => {
    if (response.url().includes("/private-state")) {
      privateStateStatuses.push(response.status());
    }
  });
  guest.on("console", (message) => consoleMessages.push(message.text()));

  try {
    await host.goto("/");
    await host.getByTestId("nickname-input").fill("候客房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("seat-grid")).toBeVisible();

    await guest.goto(host.url());
    await guest.getByTestId("nickname-input").fill("待入座牌友");
    await guest.getByTestId("login-submit").click();
    await expect(guest.getByTestId("seat-grid")).toBeVisible();
    await expect(guest.getByRole("heading", { name: "请先选择座位" })).toBeVisible();

    await guest.waitForTimeout(5_300);
    expect(privateStateStatuses).toEqual([]);
    expect(consoleMessages.some((message) => message.includes("lobby_presence"))).toBe(false);

    await guest.getByTestId("claim-seat-1").click();
    await expect(guest.getByTestId("seat-1")).toContainText("你");
    await expect.poll(() => privateStateStatuses.length, { timeout: 7_000 }).toBeGreaterThan(0);
    expect(privateStateStatuses.every((status) => status === 200)).toBe(true);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
