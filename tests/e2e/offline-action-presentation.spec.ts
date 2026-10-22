import { expect, test, type Page } from "@playwright/test";
import { finishDeclarationIfNeeded } from "./helpers/game";
import { writeFile } from "node:fs/promises";

async function openPractice(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sise_entry_name", "节奏验收");
    localStorage.setItem("sise_layout_onboarding_v1", "done");
  });
  await page.goto("/?e2eDebug=1");
  await page.evaluate(() => {
    let seed = 1;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  });
  await page.getByTestId("mode-practice_bots").click();
  await finishDeclarationIfNeeded(page);
}

const state = (page: Page) => page.evaluate(() => (window as any).__siseLocalTest.getRoomState());
const humanStep = (page: Page) => page.evaluate(() => (window as any).__siseLocalTest.advanceOfflinePracticeAsBot());

test("each local action is painted, held through its animation, then hands control back to the human", async ({ page }, info) => {
  await openPractice(page);
  await page.evaluate(() => {
    const samples: any[] = [];
    (window as any).presentationSamples = samples;
    let previous = "";
    const sample = () => {
      const room = (window as any).__siseLocalTest?.getRoomState();
      const label = document.querySelector(".center-seat-action")?.textContent;
      const flights = document.querySelectorAll(".table-flight").length;
      if (room && String(room.stateRevision) !== previous) {
        previous = String(room.stateRevision);
        samples.push({ at: Date.now(), revision: room.stateRevision, action: room.lastAction,
          until: room.presentationUntil, event: room.tableTransitions?.at(-1),
          labels: label ? [label] : [], flights });
      } else if (samples.length) {
        // A RAF callback can publish state before Vue commits that frame.
        // Retain the painted DOM from subsequent frames of the same action.
        if (label && !samples.at(-1).labels.includes(label)) samples.at(-1).labels.push(label);
        samples.at(-1).flights = Math.max(samples.at(-1).flights, flights);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  // Anchor the real 250ms probe to the action in the browser. Screenshot
  // encoding and protocol round trips must not consume its 700ms window.
  const probe = await page.evaluate(async () => {
    const bridge = (window as any).__siseLocalTest;
    const accepted = bridge.advanceOfflinePracticeAsBot();
    const first = JSON.parse(JSON.stringify(bridge.getRoomState()));
    const acceptedAgain = bridge.advanceOfflinePracticeAsBot();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { accepted, first, acceptedAgain, at: Date.now(), revision: bridge.getRoomState().stateRevision };
  });
  expect(probe.accepted).toBe(true);
  const first = probe.first;
  expect(first.tablePresentationVersion).toBe(1);
  expect(first.tableTransitions.at(-1).kind).toBe("discard");
  expect(probe.acceptedAgain).toBe(false);
  expect(probe.at, "the native 250ms probe must finish within the presentation window").toBeLessThan(first.presentationUntil);
  expect(probe.revision).toBe(first.stateRevision);
  await expect(page.locator('[data-transition-kind="discard"]')).not.toHaveCount(0);
  await page.screenshot({ path: info.outputPath("human-discard.png") });

  await expect.poll(async () => {
    const room = await state(page);
    return room.tableTransitions.at(-1)?.kind === "meld" && room.presentationUntil > Date.now() + 300;
  }, { timeout: 15_000, intervals: [20] }).toBe(true);
  const meld = await state(page);
  expect(meld.lastAction).toMatch(/seat_[123] (?:CHI|PENG|KAI|FORCE_TAKE)/);
  await expect(page.locator('[data-transition-kind="meld"]')).not.toHaveCount(0);
  await expect(page.locator(".center-seat-action")).toContainText([/吃|碰|开/]);
  await page.screenshot({ path: info.outputPath("bot-meld.png") });
  await expect.poll(async () => {
    const room = await state(page);
    const bridge = await page.evaluate(() => (window as any).__siseLocalTest.getDeferredChiDebug());
    return room.presentationUntil <= Date.now() && bridge.actions.length > 0;
  }, { timeout: 15_000 }).toBe(true);
  const ready = await state(page);
  await page.waitForTimeout(500);
  expect((await state(page)).stateRevision).toBe(ready.stateRevision);
  await expect.poll(async () => {
    await humanStep(page);
    return (await state(page)).tableTransitions.some((event: any) => /^seat_3 /.test(event.action));
  }, { timeout: 20_000, intervals: [100] }).toBe(true);
  await page.screenshot({ path: info.outputPath("third-bot.png") });
  const samples = await page.evaluate(() => (window as any).presentationSamples);
  const timelinePath = info.outputPath("painted-action-timeline.json");
  await writeFile(timelinePath, JSON.stringify(samples, null, 2));
  await info.attach("painted-action-timeline", { path: timelinePath, contentType: "application/json" });
  expect(samples.length).toBeGreaterThan(3);
  const firstPaint = samples.find((sample: any) => sample.event?.id === first.tableTransitions.at(-1).id);
  expect(firstPaint, "the first action must reach a painted frame").toBeDefined();
  expect(firstPaint.revision).toBe(first.stateRevision);
  expect(firstPaint.labels).toContain("出牌");
  expect(firstPaint.flights).toBeGreaterThan(0);
  for (let index = 1; index < samples.length; index++) {
    // A collective submission may only remove private choices, so useRoom
    // deliberately keeps its identical public object. Every actual table
    // event must still receive its own painted state, in sequence.
    if (samples[index - 1].event && samples[index].event) {
      expect(samples[index].event.id - samples[index - 1].event.id, "no table action may be flattened").toBeLessThanOrEqual(1);
      expect(samples[index].event.id).toBeGreaterThanOrEqual(samples[index - 1].event.id);
    }
    if (samples[index - 1].event) expect(samples[index].at).toBeGreaterThanOrEqual(samples[index - 1].until - 20);
  }
  const labels: Record<string, string> = { DISCARD: "出牌", CHI: "吃", PENG: "碰", KAI: "开", FORCE_TAKE: "吃", ZHUA: "抓", PASS: "过" };
  const animated = samples.filter((sample: any) => sample.flights > 0 && sample.event?.action);
  expect(animated.length).toBeGreaterThan(1);
  for (const sample of animated) expect(sample.labels).toContain(labels[sample.event.action.split(" ")[1]]);
});

test("reduced motion keeps the readable action window and releases local controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPractice(page);
  expect(await humanStep(page)).toBe(true);
  const before = await state(page);
  await expect(page.locator(".table-flight")).toHaveCount(0);
  await expect(page.locator(".center-seat-action")).toHaveText("出牌");
  await page.waitForTimeout(250);
  expect((await state(page)).stateRevision).toBe(before.stateRevision);
  expect(await humanStep(page)).toBe(false);
  await expect.poll(async () => {
    const room = await state(page);
    return room.presentationUntil <= Date.now() && (room.lastAction === "seat_2 DISCARD");
  }, { timeout: 15_000, intervals: [100] }).toBe(true);
  expect(await humanStep(page)).toBe(true);
});

test("hidden time pauses local automation and resumes the pending presentation", async ({ page }) => {
  await openPractice(page);
  await humanStep(page);
  await page.waitForTimeout(150);
  const before = await state(page);
  // Simulate the browser visibility event, keeping real timers and rendering.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(1500);
  expect((await state(page)).stateRevision).toBe(before.stateRevision);
  expect(await humanStep(page)).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const resumed = await state(page);
  expect(resumed.lastAction).toBe(before.lastAction);
  expect(resumed.presentationUntil).toBeGreaterThan(before.presentationUntil + 1400);
  await page.waitForTimeout(150);
  expect((await state(page)).stateRevision).toBe(resumed.stateRevision);
  await expect.poll(async () => (await state(page)).stateRevision).toBeGreaterThan(resumed.stateRevision);
});

test("leaving during a pending action cancels old automation before a new deal", async ({ page }) => {
  await openPractice(page);
  await humanStep(page);
  await page.getByTestId("game-settings").click();
  await page.getByTestId("game-exit").click();
  await page.getByTestId("confirm-exit").click();
  await expect(page.getByTestId("mode-practice_bots")).toBeVisible();
  await page.getByTestId("mode-practice_bots").click();
  const opening = await state(page);
  expect(opening.lastAction).toMatch(/^DEALER_PICK/);
  await page.waitForTimeout(1600);
  const stillOpening = await state(page);
  expect(stillOpening.lastAction).toBe(opening.lastAction);
  expect(stillOpening.tableTransitions).toEqual([]);
  expect(stillOpening.completedRounds).toBe(0);
});

test("the opening deadline remains shifted through reveal and deal after background recovery", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sise_entry_name", "开局验收");
    localStorage.setItem("sise_layout_onboarding_v1", "done");
  });
  await page.goto("/?e2eDebug=1");
  await page.clock.install();
  await page.getByTestId("mode-practice_bots").click();
  const first = await state(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(10_000);
  expect((await state(page)).lastAction).toBe(first.lastAction);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const resumed = await state(page);
  expect(resumed.responseEndsAt - first.responseEndsAt).toBeGreaterThanOrEqual(10_000);
  expect(resumed.responseEndsAt - first.responseEndsAt).toBeLessThan(10_100);
  await page.clock.runFor(2300);
  const reveal = await state(page);
  expect(reveal.lastAction).toMatch(/^DEALER_CARD/);
  expect(reveal.responseEndsAt).toBe(resumed.responseEndsAt);
  await page.clock.runFor(3400);
  const deal = await state(page);
  expect(deal.lastAction).toMatch(/^DEALER /);
  expect(deal.responseEndsAt).toBe(resumed.responseEndsAt);
  await page.clock.runFor(3300);
  expect((await state(page)).lastAction).not.toMatch(/^DEALER/);
});
