import { expect, test, type Page } from "@playwright/test";

type StartGameHold = {
  count: () => number;
  release: () => void;
};

async function enterModeLobby(page: Page, nickname: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("nickname-input").fill(nickname);
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("游戏模式选择")).toBeVisible();
}

async function holdStartGameMessages(page: Page): Promise<void> {
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
    WebSocket.prototype.send = function holdStartGame(data) {
      if (readablePayload(data).includes("start_game")) {
        held.push({ socket: this, data });
        return;
      }
      originalSend.call(this, data);
    };
    const testWindow = window as typeof window & { __startGameHold?: StartGameHold };
    testWindow.__startGameHold = {
      count: () => held.length,
      release: () => {
        WebSocket.prototype.send = originalSend;
        held.splice(0).forEach(({ socket, data }) => originalSend.call(socket, data));
      },
    };
  });
}

async function heldStartGameCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const testWindow = window as typeof window & { __startGameHold?: StartGameHold };
    return testWindow.__startGameHold?.count() ?? 0;
  });
}

async function releaseStartGameMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __startGameHold?: StartGameHold };
    testWindow.__startGameHold?.release();
  });
}

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test("practice auto-start stays visibly pending until the server advances", async ({ page }) => {
  await enterModeLobby(page, "练习牌友");
  await holdStartGameMessages(page);
  await page.getByTestId("mode-practice_bots").click();
  await page.getByTestId("lobby-start").click();

  const start = page.getByTestId("lobby-start");
  await expect.poll(() => heldStartGameCount(page)).toBe(1);
  await expect(start).toBeDisabled();
  await expect(start).toHaveText("正在开始练习…");
  await expect(page.locator(".start-hint")).toHaveText("开局请求已发送，请稍候");

  await releaseStartGameMessages(page);
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
});

test("friend-room start accepts one impatient double click", async ({ page }) => {
  await enterModeLobby(page, "好友房主");
  await page.getByTestId("mode-friends").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("seat-grid")).toBeVisible();
  await page.getByTestId("fill-bots").click();

  const start = page.getByTestId("lobby-start");
  await expect(start).toBeEnabled();
  await holdStartGameMessages(page);
  await start.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect.poll(() => heldStartGameCount(page)).toBe(1);
  await expect(start).toBeDisabled();
  await expect(start).toHaveText("正在开始好友对局…");
  await expect(page.locator(".start-hint")).toHaveText("开局请求已发送，请稍候");

  await expect(page.getByRole("alert")).toHaveText("暂未确认开局，请再点一次。", { timeout: 10_000 });
  await expect(start).toBeEnabled();
  await expect(start).toHaveText("开始好友对局");
  await start.click();
  await expect.poll(() => heldStartGameCount(page)).toBe(2);
  await expect(start).toBeDisabled();

  await releaseStartGameMessages(page);
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
});

test("quick match explains that bots and the round are being prepared", async ({ page }) => {
  await enterModeLobby(page, "配桌牌友");
  await page.getByTestId("mode-quick_match").click();
  await page.getByTestId("lobby-start").click();
  const start = page.getByTestId("lobby-start");
  await expect(start).toHaveText("电脑补位，立即开始");

  await holdStartGameMessages(page);
  await start.click();
  await expect.poll(() => heldStartGameCount(page)).toBe(1);
  await expect(start).toBeDisabled();
  await expect(start).toHaveText("正在补齐并开局…");
  await expect(page.locator(".start-hint")).toHaveText("开局请求已发送，请稍候");

  await releaseStartGameMessages(page);
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
});
