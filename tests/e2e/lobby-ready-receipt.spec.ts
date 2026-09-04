import { expect, test, type Page } from "@playwright/test";

type HeldReadyMessages = {
  count: () => number;
  release: () => void;
};

async function holdReadyMessages(page: Page): Promise<void> {
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
    WebSocket.prototype.send = function holdReady(data) {
      if (readablePayload(data).includes("set_lobby_ready")) {
        held.push({ socket: this, data });
        return;
      }
      originalSend.call(this, data);
    };
    const testWindow = window as typeof window & { __heldReadyMessages?: HeldReadyMessages };
    testWindow.__heldReadyMessages = {
      count: () => held.length,
      release: () => {
        WebSocket.prototype.send = originalSend;
        held.splice(0).forEach(({ socket, data }) => originalSend.call(socket, data));
      },
    };
  });
}

async function heldReadyMessageCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const testWindow = window as typeof window & { __heldReadyMessages?: HeldReadyMessages };
    return testWindow.__heldReadyMessages?.count() ?? 0;
  });
}

async function releaseReadyMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __heldReadyMessages?: HeldReadyMessages };
    testWindow.__heldReadyMessages?.release();
  });
}

test("friend ready and cancel each wait for one authoritative update", async ({ browser }) => {
  test.setTimeout(60_000);
  const hostContext = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });
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
    await guest.getByTestId("nickname-input").fill("准备牌友");
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId("claim-seat-1").click();
    const ready = guest.getByTestId("lobby-ready");
    await expect(ready).toHaveText("我准备好了");
    await holdReadyMessages(guest);

    await ready.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    await expect.poll(() => heldReadyMessageCount(guest)).toBe(1);
    await expect(ready).toBeDisabled();
    await expect(ready).toHaveText("正在准备…");
    await expect(guest.locator(".start-hint")).toHaveText("准备状态已发送，请稍候");
    await expect(host.getByTestId("seat-ready-1")).toHaveText("未准备");

    await releaseReadyMessages(guest);
    await expect(ready).toBeEnabled();
    await expect(ready).toHaveText("取消准备");
    await expect(host.getByTestId("seat-ready-1")).toHaveText("已准备");

    await holdReadyMessages(guest);
    await ready.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await expect.poll(() => heldReadyMessageCount(guest)).toBe(1);
    await expect(ready).toHaveText("正在取消准备…");
    await expect(guest.getByRole("alert")).toHaveText("暂未确认准备状态，请再点一次。", {
      timeout: 10_000,
    });
    await expect(ready).toBeEnabled();
    await expect(ready).toHaveText("取消准备");
    await ready.click();
    await expect.poll(() => heldReadyMessageCount(guest)).toBe(2);

    await releaseReadyMessages(guest);
    await expect(ready).toHaveText("我准备好了");
    await expect(host.getByTestId("seat-ready-1")).toHaveText("未准备");
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
