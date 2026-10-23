import { expect, test } from "@playwright/test";
import { isPublishedDecision } from "../helpers/decisionWindow";
const target = { phase: "local_upper", cardId: "same-card", ownerId: "same-owner", previousKey: "play:7" };
const ready = { responsePhase: "local_upper", responseCardId: "same-card", currentTurnPlayerId: "same-owner",
  responseEndsAt: 40_000, decisionTimer: { decisionKey: "play:8", endsAt: 40_000, totalMs: 30_000 } };
test("table presentation and mismatched public/private deadlines are not decision readiness", () => {
  expect(isPublishedDecision({ ...ready, responseEndsAt: 0,
    decisionTimer: { decisionKey: "play:7", endsAt: 0, totalMs: 3_000 } }, target)).toBe(false);
  expect(isPublishedDecision({ ...ready, responseEndsAt: 0 }, target)).toBe(false);
  expect(isPublishedDecision({ ...ready, decisionTimer: { ...ready.decisionTimer, endsAt: 3_000 } }, target)).toBe(false);
  expect(isPublishedDecision({ ...ready, decisionTimer: { ...ready.decisionTimer, decisionKey: "play:7" } }, target)).toBe(false);
});
test("a later card or owner cannot satisfy the original decision barrier", () => {
  expect(isPublishedDecision({ ...ready, responseCardId: "later-card" }, target)).toBe(false);
  expect(isPublishedDecision({ ...ready, currentTurnPlayerId: "later-owner" }, target)).toBe(false);
});
test("a coherent but incorrectly short new window remains observable by the duration assertion", () => {
  expect(isPublishedDecision(ready, target)).toBe(true);
  expect(isPublishedDecision({ ...ready, responseEndsAt: 13_000, decisionTimer: { ...ready.decisionTimer, endsAt: 13_000, totalMs: 3_000 } }, target)).toBe(true);
});
