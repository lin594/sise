import { expect, test } from "@playwright/test";
import {
  getRoundKey,
  isQuietSelfDiscardWait,
  projectResponseCardPlacement,
} from "../../client/src/utils/gameFlowPresentation";

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
    viewerHasLegalChi: true,
  })).toBe("center");
  expect(projectResponseCardPlacement({
    ...base,
    responsePhase: "local_upper",
    viewerPlayerId: "receiver",
    viewerHasLegalChi: true,
  })).toBe("center");
  expect(projectResponseCardPlacement({
    ...base,
    responsePhase: "local_upper",
    viewerPlayerId: "observer",
    viewerHasLegalChi: false,
  })).toBe("flow");
  expect(projectResponseCardPlacement({
    ...base,
    responsePhase: "local_upper",
    viewerPlayerId: "receiver",
    viewerHasLegalChi: false,
  })).toBe("flow");
  expect(projectResponseCardPlacement({
    ...base,
    phase: "declaring",
    responsePhase: "local_upper",
    viewerPlayerId: "receiver",
    viewerHasLegalChi: true,
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
