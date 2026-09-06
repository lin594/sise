import { expect, test } from "@playwright/test";
import {
  getDisplayedTurnPlayerId,
  getRoundKey,
  isQuietSelfDiscardWait,
  projectResponseCardPlacement,
} from "../../client/src/utils/gameFlowPresentation";

test("collective turn marker follows only the public pending receiver", () => {
  const base = { responsePhase: "collective", playerIds: ["self", "next", "other"] };
  expect(getDisplayedTurnPlayerId({
    ...base,
    pendingReceiverId: "next",
    currentTurnPlayerId: "self",
    currentPlayerId: "self",
  })).toBe("next");
  expect(getDisplayedTurnPlayerId({
    ...base,
    pendingReceiverId: "stale-seat",
    currentTurnPlayerId: "self",
    currentPlayerId: "self",
  })).toBe("");
});

test("first and later rounds use one stable presentation key", () => {
  expect(getRoundKey("friends", 0, "declaring")).toBe("friends:1");
  expect(getRoundKey("friends", 1, "ended")).toBe("friends:1");
  expect(getRoundKey("friends", 1, "declaring")).toBe("friends:2");
});

test("upper response card placement is projected for each viewer", () => {
  const base = {
    phase: "playing",
    hasResponseCard: true,
    currentPlayerId: "receiver",
  };
  expect(projectResponseCardPlacement({
    ...base,
    responsePhase: "collective",
    viewerPlayerId: "receiver",
  })).toBe("center");
  expect(projectResponseCardPlacement({
    ...base,
    responsePhase: "local_upper",
    viewerPlayerId: "receiver",
  })).toBe("center");
  expect(projectResponseCardPlacement({
    ...base,
    responsePhase: "local_upper",
    viewerPlayerId: "observer",
  })).toBe("flow");
  expect(projectResponseCardPlacement({
    ...base,
    responsePhase: "local_upper",
    viewerPlayerId: "receiver",
  })).toBe("center");
  expect(projectResponseCardPlacement({
    ...base,
    phase: "declaring",
    responsePhase: "local_upper",
    viewerPlayerId: "receiver",
  })).toBe("hidden");
});

test("the player who discarded receives no redundant collective wait prompt", () => {
  expect(isQuietSelfDiscardWait({
    responsePhase: "collective",
    responseSource: "upper",
    originPlayerId: "self",
    viewerPlayerId: "self",
  })).toBe(true);
  expect(isQuietSelfDiscardWait({
    responsePhase: "collective",
    responseSource: "upper",
    originPlayerId: "self",
    viewerPlayerId: "other",
  })).toBe(false);
});
