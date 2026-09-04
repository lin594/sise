import { expect, test, type Page } from "@playwright/test";

type HeldSeatClaims = {
  count: () => number;
  release: () => void;
};

async function holdSeatClaims(page: Page): Promise<void> {
  await page.evaluate(() => {
    const originalSend = WebSocket.prototype.send;
    const held: Array<{ socket: WebSocket; data: string | ArrayBufferLike | Blob | ArrayBufferView }> = [];
    const readablePayload = (data: string | ArrayBufferLike | Blob | ArrayBufferView): string => {
      if (typeof data === "string") return data;
      if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
      if (ArrayBuffer.isView(data)) {
        return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      }
      return "";
    };
    WebSocket.prototype.send = function holdClaim(data) {
      if (readablePayload(data).includes("claim_seat")) {
        held.push({ socket: this, data });
        return;
      }
      originalSend.call(this, data);
    };
    const testWindow = window as typeof window & { __heldSeatClaims?: HeldSeatClaims };
    testWindow.__heldSeatClaims = {
      count: () => held.length,
      release: () => {
        WebSocket.prototype.send = originalSend;
        held.splice(0).forEach(({ socket, data }) => originalSend.call(socket, data));
      },
    };
  });
}

async function heldSeatClaimCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const testWindow = window as typeof window & { __heldSeatClaims?: HeldSeatClaims };
    return testWindow.__heldSeatClaims?.count() ?? 0;
  });
}

async function releaseSeatClaims(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __heldSeatClaims?: HeldSeatClaims };
    testWindow.__heldSeatClaims?.release();
  });
}

test("a slow friend-room seat claim keeps the first deliberate choice", async ({ browser }) => {
  test.setTimeout(60_000);
  const hostContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/");
    await host.getByTestId("nickname-input").fill("选座房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect(host.getByTestId("seat-grid")).toBeVisible();

    await guest.goto(host.url());
    await guest.getByTestId("nickname-input").fill("选座牌友");
    await guest.getByTestId("login-submit").click();
    await expect(guest.getByTestId("claim-seat-1")).toBeVisible();
    await holdSeatClaims(guest);

    await guest.evaluate(() => {
      document.querySelector<HTMLButtonElement>("[data-testid='claim-seat-1']")?.click();
      document.querySelector<HTMLButtonElement>("[data-testid='claim-seat-2']")?.click();
    });

    await expect.poll(() => heldSeatClaimCount(guest)).toBe(1);
    await expect(guest.getByTestId("claim-seat-1")).toBeDisabled();
    await expect(guest.getByTestId("claim-seat-1")).toHaveText("正在入座…");
    await expect(guest.getByTestId("claim-seat-2")).toBeDisabled();
    await expect(guest.getByTestId("claim-seat-3")).toBeDisabled();
    await expect(guest.getByTestId("seat-claim-status")).toHaveText("正在确认 B位（2号），请稍候");

    await releaseSeatClaims(guest);
    await expect(guest.getByTestId("seat-1")).toContainText("你");
    await expect(guest.getByTestId("seat-2")).not.toContainText("你");
    await expect(guest.getByTestId("lobby-ready")).toBeVisible();

    await holdSeatClaims(guest);
    await guest.getByTestId("claim-seat-2").click();
    await expect(guest.getByTestId("claim-seat-2")).toHaveText("正在换座…");
    await expect(guest.getByRole("alert")).toHaveText("暂未确认座位，请重新选择。", { timeout: 10_000 });
    await expect(guest.getByTestId("claim-seat-2")).toBeEnabled();
    await guest.getByTestId("claim-seat-2").click();
    await expect.poll(() => heldSeatClaimCount(guest)).toBe(2);
    await releaseSeatClaims(guest);
    await expect(guest.getByTestId("seat-2")).toContainText("你");
    await expect(guest.getByTestId("seat-1")).not.toContainText("你");
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
