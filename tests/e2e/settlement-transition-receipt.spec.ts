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

test("practice next round locks settlement actions and recovers after no receipt", async ({ page }) => {
  test.setTimeout(60_000);
  await reachPracticeSettlement(page);
  await holdSocketMessage(page, "next_round");

  const nextRound = page.getByTestId("next-round-trigger");
  const returnToModes = page.getByTestId("practice-return-to-modes");
  await nextRound.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  await expect.poll(() => heldMessageCount(page)).toBe(1);
  await expect(nextRound).toBeDisabled();
  await expect(nextRound).toHaveText("正在开始下一局…");
  await expect(returnToModes).toBeDisabled();
  await expect(page.getByTestId("settlement-transition-status")).toHaveText("下一局请求已发送，请稍候");

  await expect(page.getByRole("alert")).toHaveText("暂未确认下一局，请再点一次。", {
    timeout: 10_000,
  });
  await expect(nextRound).toBeEnabled();
  await expect(returnToModes).toBeEnabled();
  await nextRound.click();
  await expect.poll(() => heldMessageCount(page)).toBe(2);

  await releaseSocketMessages(page);
  await expect(page.getByTestId("confirm-declaration")).toBeVisible({ timeout: 20_000 });
});

test("practice settlement returns personally to the complete mode picker", async ({ page }) => {
  test.setTimeout(60_000);
  await reachPracticeSettlement(page);
  await holdSocketMessage(page, "return_lobby");
  await page.getByTestId("practice-return-to-modes").click();
  await expect.poll(() => heldMessageCount(page)).toBe(0);
  await expect(page.getByText("游戏模式选择")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("mode-practice_bots")).toBeVisible();
  await expect(page.getByTestId("mode-quick_match")).toBeVisible();
  await expect(page.getByTestId("mode-friends")).toBeVisible();
  await expect(page.getByTestId("settlement-panel")).toHaveCount(0);
  await releaseSocketMessages(page);
});
