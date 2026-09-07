import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { quickPhrases } from "../../client/src/generated/quickPhrases";

const PHRASE = quickPhrases[0];

async function installAudioRecorder(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    class TestAudio {
      private source = "";
      preload = "";
      muted = false;
      volume = 1;
      currentTime = 0;

      get src(): string {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
        const sources = JSON.parse(sessionStorage.getItem("sise_test_audio_sources") ?? "[]") as string[];
        sources.push(value);
        sessionStorage.setItem("sise_test_audio_sources", JSON.stringify(sources));
      }

      play(): Promise<void> {
        if (!this.muted) {
          const messages = JSON.parse(sessionStorage.getItem("sise_test_quick_phrase_audio") ?? "[]") as string[];
          messages.push(this.src);
          sessionStorage.setItem("sise_test_quick_phrase_audio", JSON.stringify(messages));
        }
        return Promise.resolve();
      }

      pause(): void {}
    }
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: TestAudio,
    });
  });
}

async function playedAudio(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("sise_test_quick_phrase_audio") ?? "[]") as string[],
  );
}

async function loadedPhraseAudio(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (JSON.parse(sessionStorage.getItem("sise_test_audio_sources") ?? "[]") as string[])
      .filter((source) => source.includes("/quick-phrases/")),
  );
}

async function playedPhraseAudio(page: Page): Promise<string[]> {
  return (await playedAudio(page)).filter((source) => source.includes("/quick-phrases/"));
}

test("folder-driven quick phrases are visible and played once for sender and tablemates", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const hostContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  const guestContext = await browser.newContext({ viewport: { width: 568, height: 320 } });
  await Promise.all([installAudioRecorder(hostContext), installAudioRecorder(guestContext)]);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto("/");
    await host.getByTestId("nickname-input").fill("短句房主");
    await host.getByTestId("login-submit").click();
    await host.getByTestId("mode-friends").click();
    await host.getByTestId("lobby-start").click();
    await expect.poll(() => host.url()).toContain("roomId=");

    await guest.goto(host.url());
    await guest.getByTestId("nickname-input").fill("短句牌友");
    await guest.getByTestId("login-submit").click();
    await guest.getByTestId("claim-seat-1").click();
    await host.getByTestId("fill-bots").click();
    await guest.getByTestId("lobby-ready").click();
    await expect(host.getByTestId("lobby-start")).toBeEnabled();
    await host.getByTestId("lobby-start").click();

    const hostInteraction = host.getByTestId("game-interaction");
    const guestInteraction = guest.getByTestId("game-interaction");
    await expect(hostInteraction).toBeEnabled({ timeout: 20_000 });
    await expect(guestInteraction).toBeEnabled({ timeout: 20_000 });
    await hostInteraction.click();
    // 第一次手势只允许加载静音解锁素材，不能提前加载或误播第一条互动语音。
    await expect.poll(() => loadedPhraseAudio(host)).toEqual([]);
    await expect.poll(() => playedPhraseAudio(host)).toEqual([]);
    for (const phrase of quickPhrases) {
      await expect(host.getByRole("button", { name: phrase.label, exact: true })).toBeVisible();
    }
    await host.getByRole("button", { name: PHRASE.label, exact: true }).click();

    const hostToast = host.getByTestId("quick-phrase-toast");
    const guestToast = guest.getByTestId("quick-phrase-toast");
    await expect(hostToast).toBeVisible();
    await expect(hostToast).toContainText("你");
    await expect(hostToast).toContainText(PHRASE.label);
    await expect(guestToast).toBeVisible();
    await expect(guestToast).toContainText("短句房主");
    await expect(guestToast).toContainText(PHRASE.label);
    await expect.poll(() => playedPhraseAudio(host)).toEqual([PHRASE.url]);
    await expect.poll(() => playedPhraseAudio(guest)).toEqual([PHRASE.url]);
    await expect(hostInteraction).toBeDisabled();
    await expect(guestInteraction).toBeDisabled();
    await host.waitForTimeout(500);
    await expect.poll(() => playedPhraseAudio(host)).toHaveLength(1);
    await expect.poll(() => playedPhraseAudio(guest)).toHaveLength(1);

    await host.screenshot({ path: testInfo.outputPath("quick-phrase-host-568x320.png") });
    await expect(hostToast).toHaveCount(0, { timeout: 4_000 });
    await expect(guestToast).toHaveCount(0, { timeout: 4_000 });
    await expect(hostInteraction).toBeEnabled();
    await expect(guestInteraction).toBeEnabled();
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
