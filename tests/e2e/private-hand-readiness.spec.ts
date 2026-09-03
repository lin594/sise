import { expect, test } from "@playwright/test";
import type { RoomStateSnapshot } from "../../client/src/types/game";
import { isPrivateHandSynchronized } from "../../client/src/utils/privateHandReadiness";

function snapshot(handCount: number): RoomStateSnapshot {
  return {
    phase: "playing",
    players: [{ clientId: "seat_1", handCount }],
  } as RoomStateSnapshot;
}

test("private hand readiness requires the authoritative player and exact card count", () => {
  expect(isPrivateHandSynchronized(null, "seat_1", 20)).toBe(false);
  expect(isPrivateHandSynchronized(snapshot(20), "", 20)).toBe(false);
  expect(isPrivateHandSynchronized(snapshot(20), "seat_2", 20)).toBe(false);
  expect(isPrivateHandSynchronized(snapshot(20), "seat_1", 19)).toBe(false);
  expect(isPrivateHandSynchronized(snapshot(20), "seat_1", 21)).toBe(false);
  expect(isPrivateHandSynchronized(snapshot(20), "seat_1", 20)).toBe(true);
  expect(isPrivateHandSynchronized(snapshot(0), "seat_1", 0)).toBe(true);
});
