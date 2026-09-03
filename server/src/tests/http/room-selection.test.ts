import assert from "node:assert/strict";
import test from "node:test";
import { isReusablePracticeLobbyRoom } from "../../http/room-selection.js";

test("practice matchmaking reuses only a waiting practice room", () => {
  assert.equal(
    isReusablePracticeLobbyRoom({
      roomId: "practice-room",
      metadata: { phase: "waiting", roomMode: "practice" },
    }),
    true,
  );
});

test("practice matchmaking never reuses a waiting friend room", () => {
  assert.equal(
    isReusablePracticeLobbyRoom({
      roomId: "private-friend-room",
      metadata: { phase: "waiting", roomMode: "friends" },
    }),
    false,
  );
});

test("practice matchmaking rejects active or unclassified room listings", () => {
  assert.equal(
    isReusablePracticeLobbyRoom({
      roomId: "active-practice-room",
      metadata: { phase: "playing", roomMode: "practice" },
    }),
    false,
  );
  assert.equal(
    isReusablePracticeLobbyRoom({ roomId: "legacy-room", metadata: { phase: "waiting" } }),
    false,
  );
  assert.equal(isReusablePracticeLobbyRoom({ roomId: "unknown-room" }), false);
});
