import test from "node:test";
import assert from "node:assert/strict";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

function mkCard(id: string, color: Card["color"], type: Card["type"], source: "upper" | "draw"): Card {
  return { id, color, type, source };
}

function mkRoomWithSeats(seats: string[]) {
  const room = new FourColorGameRoom();
  const state = new GameState();
  for (const seat of seats) {
    const p = new PlayerState();
    p.clientId = seat;
    p.name = seat;
    state.players.set(seat, p);
  }
  (room as any).state = state;
  (room as any).playerOrder = [...seats];
  state.phase = "playing";
  (room as any).collectiveTimeoutMs = 5;
  (room as any).localTimeoutMs = 5;
  (room as any).operationTimeoutMs = 5;
  return room as any;
}

test("collective order for draw starts from owner then rotates", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  const pending = {
    ownerId: "A",
    card: mkCard("x", "red", "ju", "draw"),
    collectives: new Map(),
  };
  const order = room.getCollectiveOrder(pending);
  assert.deepEqual(order, ["A", "B", "C", "D"]);
});

test("collective order for upper starts from next and includes owner at tail", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  const pending = {
    ownerId: "A",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  const order = room.getCollectiveOrder(pending);
  assert.deepEqual(order, ["B", "C", "D", "A"]);
});

test("no-response on upper enters local_upper for next player", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.enterOwnerLocalPhaseAfterNoResponse("A");

  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentPlayerId, "B");
  assert.equal(room.pendingResponse.ownerId, "B");
});

test("local_upper human gets timeout countdown scheduled", () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.tickBots();

  assert.equal(room.state.responseEndsAt > Date.now(), true);
  assert.equal(Boolean(room.collectiveTimer), true);
  room.clearCollectiveTimer();
});

test("local_upper timeout defaults to pass", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.localTimeoutMs = 1;
  let called = false;
  room.executeGrab = (ownerId: string) => {
    called = ownerId === "B";
  };

  room.scheduleCollectiveTimeout();
  await new Promise((resolve) => setTimeout(resolve, 8));

  assert.equal(called, true);
});

test("local_draw timeout auto-discards when awaiting discard", async () => {
  const room = mkRoomWithSeats(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: mkCard("x", "red", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.awaitingDiscardOwnerId = "B";
  room.localTimeoutMs = 1;
  let called = false;
  room.discardFromAndCollective = (ownerId: string) => {
    called = ownerId === "B";
  };

  room.scheduleCollectiveTimeout();
  await new Promise((resolve) => setTimeout(resolve, 8));

  assert.equal(called, true);
});
