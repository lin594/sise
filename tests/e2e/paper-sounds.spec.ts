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

test.beforeEach(async ({ page }) => {
  // Observe the real Web Audio sources without replacing the renderer or bypassing user gestures.
  await page.addInitScript(() => {
    const sounds = (window as SoundWindow).paperContacts = [] as number[];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) sounds.push(Math.round(this.buffer.duration * 1000));
      return start.apply(this, args);
    };
  });
});

test("paper contacts are opt-in, play once per public landing and honor session mute", async ({ page }) => {
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

test("the first authoritative reconnect snapshot establishes a silent sound baseline", async ({ page, context }) => {
  await page.goto("/?e2eDebug=1");
  await startLobbyAction(page);
  await finishDeclarationIfNeeded(page);
  await page.getByTestId("game-settings").click();
  await page.getByTestId("settings-category-sound").click();
  await page.getByTestId("paper-sounds").click();
  await page.keyboard.press("Escape");

  await context.setOffline(true);
  await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", "offline");
  await page.evaluate(() => {
    // Hold both JOIN_ROOM ACKs, as in room-bootstrap-appearance. The new socket can
    // complete its handshake while the board is still showing the old public state.
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
        : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      if (bytes?.length === 1 && bytes[0] === 10) return;
      send.call(this, data);
    };
    (window as SoundWindow).paperContacts.length = 0;
  });
  await context.setOffline(false);
  await expect(page.locator("main.layout")).toHaveAttribute("data-connection-state", /restored|connected/);
  const appendLanding = () => page.evaluate(() => {
    const bridge = (window as SoundWindow).__siseLocalTest;
    const state = bridge.getRoomState();
    const events = state.tableTransitions ?? [];
    const now = Date.now() + (state.presentationClockOffsetMs ?? 0);
    const card = { id: "paper-contact", color: "white", type: "zu" };
    bridge.applyRoomSnapshot({
      stateRevision: state.stateRevision + 1,
      serverNow: now,
      tableTransitions: [...events, {
        id: (events.at(-1)?.id ?? 0) + 1, round: state.completedRounds + 1,
        kind: "discard", startsAt: now, endsAt: now + 700,
        moves: [{ card, from: { zone: "hand" }, to: { zone: "center" } }],
      }],
    });
  });
  await appendLanding(); // A retained public move arrives on the new connection.
  await page.waitForTimeout(750);
  expect(await contactDurations(page)).toEqual([]);
  await appendLanding(); // An actual subsequent move still sounds normally.
  await expect.poll(() => contactDurations(page)).toEqual([85]);
});
