import test from "node:test";
import assert from "node:assert/strict";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";
import { createPendingResponse } from "../../rooms/flow/support.js";
import { readTableTransitions } from "../../rooms/flow/table-presentation.js";
import type { Card } from "../../rules/types.js";

function fixture() {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "playing";
  room.state.roomMode = "friends";
  room.playerOrder = ["A", "B", "C", "D"];
  for (const id of room.playerOrder) {
    const player = new PlayerState(); player.clientId = id; player.name = id;
    room.state.players.set(id, player);
    room.playerHands.set(id, [{ id: `${id}-shi`, color: "white", type: "shi" }]);
  }
  room.broadcastAvailableActions = () => {};
  room.tickBots = () => {};
  room.state.pollOriginPlayerId = "B";
  room.state.responsePhase = "collective";
  return room;
}
const card = (id: string, color: Card["color"], type: Card["type"]): Card => ({ id, color, type });

test("drawer can reserve an eat in the only collective and its actual cards fly", () => {
  const room = fixture();
  room.playerHands.set("B", [card("ju", "red", "ju"), card("pao", "red", "pao"), card("spare", "yellow", "ma")]);
  room.pendingResponse = createPendingResponse("B", card("draw", "red", "ma"), "draw");
  room.collectiveResponderId = "B";
  room.collectiveQueue = ["B", "C", "D", "A"];
  room.collectiveCursor = 0;
  const chi = room.getAvailableActions("B").find((item: any) => item.action === "chi");
  assert.equal(chi.enabled, true);
  assert.equal(room.hasCollectiveActionBeyondPass("B"), true);
  room.seatBySession.set("clientB", "B");
  room.handleAction({ sessionId: "clientB", send: () => {} }, { action: "chi", candidateId: chi.candidates[0].id });
  assert.deepEqual(room.playerHands.get("B").map((item: Card) => item.id), ["spare"]);
  assert.equal(room.awaitingDiscardOwnerId, "B");
  const moves = readTableTransitions(room.state.tableTransitionsJson).find((event) => event.kind === "meld")!.moves;
  assert.deepEqual(moves.map((move) => move.card.type).sort(), ["ju", "ma", "pao"]);
  assert.equal(moves.filter((move) => move.from.zone === "hand").length, 2);
  room.clearCollectiveTimer();
});

test("all pass moves the draw to B→C exactly once and C alone may eat", () => {
  const room = fixture();
  room.pendingResponse = createPendingResponse("B", card("draw", "red", "ma"), "draw");
  for (const id of room.playerOrder) room.pendingResponse.collectives.set(id, { action: "pass" });
  room.startCollectivePolling = () => { throw new Error("second collective"); };
  room.resolveCollectivePhase();
  assert.equal(room.pendingResponse.ownerId, "C");
  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.pollOriginPlayerId, "B");
  assert.equal(room.state.players.get("B").discardPile.length, 1);
  assert.equal(readTableTransitions(room.state.tableTransitionsJson).filter((event) => event.kind === "flow").length, 1);
  for (const id of ["A", "B", "D"]) assert.equal(room.getAvailableActions(id).some((item: any) => item.enabled), false);
});

test("gold response settles as singles and single-eat auto hu does not count it twice", () => {
  for (const eat of [false, true]) {
    const room = fixture();
    room.playerHands.set("B", [card("bo", "gold", "bo"), card("zi", "gold", "zi")]);
    room.pendingResponse = createPendingResponse("B", card("gong", "gold", "gong"), "draw");
    if (eat) {
      room.state.responsePhase = "local_draw";
      const chi = room.getAvailableActions("B").find((item: any) => item.action === "chi");
      let result: any;
      room.endRound = () => { result = room.buildRoundResultPlayers("B", []); };
      assert.equal(room.executeEat("B", chi.candidates[0].id), true);
      const winner = result.find((item: any) => item.clientId === "B");
      assert.equal(winner.winningGroups.length, 0);
      assert.equal(winner.exposedArea.length, 1);
      assert.equal(winner.resolvedHandGroups.length, 2);
      assert.equal(winner.totalScore, 36);
    } else {
      const winner = room.buildRoundResultPlayers("B", []).find((item: any) => item.clientId === "B");
      assert.deepEqual(winner.winningGroups.map((group: any) => group.key), ["SingleGold"]);
      assert.deepEqual(winner.resolvedHandGroups.map((group: any) => group.key), ["SingleGold", "SingleGold"]);
      assert.equal(winner.totalScore, 36);
      assert.equal(winner.scoreBreakdown.some((item: any) => item.key.includes("GoldTriplet")), false);
    }
  }
});

test("presentation blocks actions and starts the decision only after reveal", async () => {
  const room = fixture();
  room.clients.push({ sessionId: "viewer", send: () => {} });
  room.pendingResponse = createPendingResponse("B", card("draw", "red", "ma"), "draw");
  room.playerHands.set("B", [card("ju", "red", "ju"), card("pao", "red", "pao"), card("spare", "yellow", "ma")]);
  room.startCollectivePolling();
  const event = readTableTransitions(room.state.tableTransitionsJson)[0]!;
  assert.equal(event.endsAt - event.startsAt, 1200);
  assert.equal(room.state.responseEndsAt, 0);
  assert.deepEqual(room.getAvailableActions("B"), []);
  room.clearPresentation();
  room.clients.length = 0;
  room.startCollectivePolling();
  assert.equal(room.collectiveResponderId, "B");
  assert.ok(room.state.responseEndsAt > Date.now());
  room.clearCollectiveTimer();
});

test("another seat's Peng beats the drawer's reserved eat", () => {
  const room = fixture();
  room.playerHands.set("B", [card("ju", "red", "ju"), card("pao", "red", "pao"), card("spareB", "yellow", "ma")]);
  room.playerHands.set("C", [card("ma1", "red", "ma"), card("ma2", "red", "ma"), card("spareC", "white", "shi")]);
  room.pendingResponse = createPendingResponse("B", card("draw", "red", "ma"), "draw");
  const chi = room.getAvailableActions("B", true).find((item: any) => item.action === "chi").candidates[0];
  const peng = room.getAvailableActions("C", true).find((item: any) => item.action === "peng").candidates[0];
  room.pendingResponse.collectives.set("B", { action: "chi", candidateId: chi.id });
  room.pendingResponse.collectives.set("C", { action: "peng", candidateId: peng.id });
  room.resolveCollectivePhase();
  assert.equal(room.playerHands.get("B").length, 3);
  assert.equal(room.state.players.get("C").exposedArea.length, 3);
  assert.equal(room.awaitingDiscardOwnerId, "C");
});

test("C's local eat removes only B's target discard and flies from B's flow", () => {
  const room = fixture();
  room.playerHands.set("C", [card("ma1", "red", "ma"), card("spare", "white", "shi")]);
  room.pendingResponse = createPendingResponse("B", card("draw", "red", "ma"), "draw");
  room.pendingResponse.collectives.set("B", { action: "pass" });
  room.ops.pushDiscard("B", card("old", "green", "ju"));
  room.resolveCollectivePhase();
  const chi = room.getAvailableActions("C").find((item: any) => item.action === "chi").candidates[0];
  assert.equal(room.executeEat("C", chi.id), true);
  assert.deepEqual([...room.state.players.get("B").discardPile].map((c: Card) => c.id), ["old"]);
  const event = readTableTransitions(room.state.tableTransitionsJson).find((event) => event.kind === "meld")!;
  assert.deepEqual(event.moves[0].from, { zone: "flow", playerId: "B" });
  assert.equal(room.state.players.get("C").exposedArea.length, 2);
});
