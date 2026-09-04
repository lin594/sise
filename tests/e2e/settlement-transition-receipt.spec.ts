import { expect, test, type Page } from "@playwright/test";

type HeldSocketMessages = {
  count: () => number;
  release: () => void;
};

async function reachPracticeSettlement(page: Page): Promise<void> {
  await page.goto("/?e2eDebug=1");
  await page.getByTestId("nickname-input").fill("结算房主");
  await page.getByTestId("login-submit").click();
  await page.getByTestId("mode-practice_bots").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("confirm-declaration").click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) throw new Error("local debug bridge is unavailable");
    bridge.setupScenario("settlement_hu");
  });
  await expect(page.getByTestId("settlement-panel")).toHaveAttribute("aria-busy", "false", {
    timeout: 20_000,
  });
}

async function holdSocketMessage(page: Page, messageName: string): Promise<void> {
  await page.evaluate((targetName) => {
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
    WebSocket.prototype.send = function holdSelectedMessage(data) {
      if (readablePayload(data).includes(targetName)) {
        held.push({ socket: this, data });
        return;
      }
      originalSend.call(this, data);
    };
    const testWindow = window as typeof window & { __heldSocketMessages?: HeldSocketMessages };
    testWindow.__heldSocketMessages = {
      count: () => held.length,
      release: () => {
        WebSocket.prototype.send = originalSend;
        held.splice(0).forEach(({ socket, data }) => originalSend.call(socket, data));
      },
    };
  }, messageName);
}

async function heldMessageCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const testWindow = window as typeof window & { __heldSocketMessages?: HeldSocketMessages };
    return testWindow.__heldSocketMessages?.count() ?? 0;
  });
}

async function releaseSocketMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __heldSocketMessages?: HeldSocketMessages };
    testWindow.__heldSocketMessages?.release();
  });
}

test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

test("next round locks both table-wide actions and recovers after no receipt", async ({ page }) => {
  test.setTimeout(60_000);
  await reachPracticeSettlement(page);
  await holdSocketMessage(page, "next_round");

  const nextRound = page.getByTestId("next-round-trigger");
  const returnLobby = page.getByTestId("return-lobby-trigger");
  await nextRound.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect.poll(() => heldMessageCount(page)).toBe(1);
  await expect(nextRound).toBeDisabled();
  await expect(nextRound).toHaveText("正在开始下一局…");
  await expect(returnLobby).toBeDisabled();
  await expect(page.getByTestId("settlement-transition-status")).toHaveText("整桌请求已发送，请稍候");

  await expect(page.getByRole("alert")).toHaveText("暂未确认整桌操作，请再点一次。", {
    timeout: 10_000,
  });
  await expect(nextRound).toBeEnabled();
  await expect(returnLobby).toBeEnabled();
  await nextRound.click();
  await expect.poll(() => heldMessageCount(page)).toBe(2);

  await releaseSocketMessages(page);
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
});

test("confirmed return to lobby submits once and shows stable progress", async ({ page }) => {
  test.setTimeout(60_000);
  await reachPracticeSettlement(page);
  await page.getByTestId("return-lobby-trigger").click();
  await holdSocketMessage(page, "return_lobby");

  const confirm = page.getByTestId("confirm-table-return");
  await confirm.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect.poll(() => heldMessageCount(page)).toBe(1);
  await expect(page.getByTestId("next-round-trigger")).toBeDisabled();
  await expect(page.getByTestId("return-lobby-trigger")).toBeDisabled();
  await expect(page.getByTestId("return-lobby-trigger")).toHaveText("正在返回房间大厅…");
  await expect(page.getByTestId("settlement-transition-status")).toHaveText("整桌请求已发送，请稍候");

  await releaseSocketMessages(page);
  await expect(page.getByRole("heading", { name: "房间准备中" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("settlement-panel")).toHaveCount(0);
});
