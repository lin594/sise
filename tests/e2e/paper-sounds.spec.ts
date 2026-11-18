import { expect, test, type Page } from "@playwright/test";
import type { RoomStateSnapshot } from "../../client/src/types/game";
import { finishDeclarationIfNeeded, startLobbyAction } from "./helpers/game";

type SoundWindow = Window & {
  paperContacts: number[];
  __siseLocalTest: {
    setupScenario: (scenario: string) => void;
    getRoomState: () => RoomStateSnapshot;
    applyRoomSnapshot: (snapshot: Partial<RoomStateSnapshot>) => void;
  };
};

async function contactDurations(page: Page) {
  return page.evaluate(() => (window as SoundWindow).paperContacts);
}

test("paper contacts are opt-in, play once per public landing and honor session mute", async ({ page }) => {
  // Observe the real Web Audio sources without replacing the renderer or bypassing user gestures.
  await page.addInitScript(() => {
    const sounds = (window as SoundWindow).paperContacts = [] as number[];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) sounds.push(Math.round(this.buffer.duration * 1000));
      return start.apply(this, args);
    };
  });
  await page.goto("/?e2eDebug=1");
  await startLobbyAction(page);
  await finishDeclarationIfNeeded(page);
  const setupChi = () => page.evaluate(() => (window as SoundWindow).__siseLocalTest.setupScenario("chi_local_upper"));
  await setupChi();
  await page.getByTestId("action-chi").click();
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  expect(await contactDurations(page)).toEqual([]);

  await page.getByTestId("game-settings").click();
  await page.getByTestId("settings-category-sound").click();
  const setting = page.getByTestId("paper-sounds");
  await expect(setting).toHaveAttribute("aria-checked", "false");
  await setting.click();
  await expect(setting).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  await setupChi();
  await page.getByTestId("action-chi").click();
  await expect.poll(() => contactDurations(page)).toEqual([140]);
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  await page.evaluate(() => {
    const bridge = (window as SoundWindow).__siseLocalTest;
    const state = bridge.getRoomState();
    bridge.applyRoomSnapshot({ stateRevision: state.stateRevision + 1, tableTransitions: state.tableTransitions });
  });
  await page.locator('[data-testid^="hand-card-"]:enabled').first().click();
  await page.getByTestId("discard-confirm").click();
  await expect.poll(() => contactDurations(page)).toContain(85);

  await setupChi();
  await expect(page.getByTestId("action-chi")).toBeEnabled();
  await page.getByTestId("game-settings").click();
  await page.getByTestId("session-mute").click();
  await page.keyboard.press("Escape");
  const beforeMute = await contactDurations(page);
  await page.getByTestId("action-chi").click();
  await expect(page.getByTestId("discard-confirm")).toBeVisible();
  expect(await contactDurations(page)).toEqual(beforeMute);
  expect(beforeMute.filter(duration => duration === 140)).toHaveLength(1);
});
