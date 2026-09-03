import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

async function enterDeclaration(page: Page, path = "/?e2eDebug=1"): Promise<void> {
  await page.goto(path);
  await page.getByTestId("random-nickname").click();
  await page.getByTestId("login-submit").click();
  await page.getByTestId("lobby-start").click();
  await expect(page.getByTestId("confirm-declaration")).toBeEnabled({ timeout: 20_000 });
}

async function setupChiScenario(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (window as Window & {
      __siseLocalTest?: { setupScenario: (scenario: string) => void };
    }).__siseLocalTest;
    if (!bridge) throw new Error("Local test bridge is unavailable");
    bridge.setupScenario("chi_local_upper");
  });
  await expect.poll(() =>
    page.evaluate(() =>
      (window as Window & {
        __siseLocalTest?: { getLastResult: () => { scenario: string; ok: boolean } | null };
      }).__siseLocalTest?.getLastResult() ?? null,
    ),
  ).toMatchObject({ scenario: "chi_local_upper", ok: true });
}

async function spokenMessages(page: Page): Promise<string[]> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("sise_test_spoken_messages") ?? "[]") as string[]);
}

test("optional spoken guidance explains each new decision once and persists", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    class TestUtterance {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;

      constructor(text = "") {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: () => undefined,
        getVoices: () => [],
        pause: () => undefined,
        pending: false,
        paused: false,
        resume: () => undefined,
        speak: (utterance: TestUtterance) => {
          const messages = JSON.parse(sessionStorage.getItem("sise_test_spoken_messages") ?? "[]") as string[];
          messages.push(utterance.text);
          sessionStorage.setItem("sise_test_spoken_messages", JSON.stringify(messages));
        },
        speaking: false,
      },
    });
  });
  await enterDeclaration(page);

  await page.getByTestId("game-settings").click();
  const voiceSetting = page.getByTestId("spoken-turn-guidance");
  await expect(voiceSetting).toBeAttached({ timeout: 5_000 });
  await voiceSetting.scrollIntoViewIfNeeded();
  await expect(voiceSetting).toBeVisible();
  await expect(voiceSetting).toBeEnabled();
  await expect(voiceSetting).toHaveAttribute("role", "switch");
  await expect(voiceSetting).toHaveAttribute("aria-checked", "false");
  await expect(voiceSetting).toContainText("轮到你时读出下一步");
  await voiceSetting.click();
  await expect(voiceSetting).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: testInfo.outputPath("spoken-turn-guidance-enabled-320x568.png") });
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}").spokenTurnGuidance,
  )).toBe(true);
  await page.keyboard.press("Escape");

  await page.getByTestId("confirm-declaration").click();
  await expect(page.locator("main.layout")).toHaveClass(/\bplaying\b/, { timeout: 20_000 });
  await page.evaluate(() => sessionStorage.removeItem("sise_test_spoken_messages"));
  await setupChiScenario(page);
  await expect.poll(() => spokenMessages(page)).toEqual(["轮到你了。可选择吃或抓。"]);
  await page.waitForTimeout(500);
  await expect.poll(() => spokenMessages(page)).toHaveLength(1);

  await page.getByTestId("action-chi").click();
  await page.getByTestId("candidate-option").first().click();
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  await expect.poll(() => spokenMessages(page)).toEqual([
    "轮到你了。可选择吃或抓。",
    "轮到你出牌。先选一张手牌，再点出牌。",
  ]);

  await page.reload();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("sise_game_display_preferences_v2") ?? "{}").spokenTurnGuidance,
  )).toBe(true);
});

test("unsupported browsers explain why spoken guidance is unavailable", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
  });
  await enterDeclaration(page, "/");
  await page.getByTestId("game-settings").click();
  const voiceSetting = page.getByTestId("spoken-turn-guidance");
  await expect(voiceSetting).toBeAttached({ timeout: 5_000 });
  await voiceSetting.scrollIntoViewIfNeeded();
  await expect(voiceSetting).toBeDisabled();
  await expect(voiceSetting).toContainText("此浏览器不支持语音");
  await expect(voiceSetting).toHaveAttribute("aria-checked", "false");
});
