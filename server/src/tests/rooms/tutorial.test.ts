import { isPublicMatchmakingAllowed } from "../../http/public-matchmaking.js";
import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";
import { createTutorialDeal, advanceTutorial } from "../../rooms/tutorial.js";
import { isRoomRecoverySnapshot } from "../../rooms/room-recovery.js";

function roomForTutorial(): any {
  const room = new FourColorGameRoom() as any;
  room.roomId = "teaching-test";
  room.state = new GameState();
  room.state.roomMode = "practice";
  room.playerOrder = ["A", "B", "C", "D"];
  room.state.hostPlayerId = "A";
  for (const [i,id] of room.playerOrder.entries()) {
    const player = new PlayerState(); player.clientId = id; player.seatIndex = i;
    player.connected = i === 0; player.isConfiguredBot = i > 0; player.isBot = i > 0;
    room.state.players.set(id, player);
  }
  room.configuredBotIds = new Set(["B", "C", "D"]);
  room.botIds = new Set(["B", "C", "D"]);
  room.seatByToken.set("private-teacher-token", "A");
  room.tutorial = { seatId: "A", step: "intro" };
  room.tickBots = () => {};
  room.bootstrapRound();
  return room;
}
test("teaching fixture conserves all 117 physical cards and offers the normal grab", () => {
  const deal = createTutorialDeal();
  const ids = [...deal.hand, ...deal.opponents, deal.upper, ...deal.deck].map(c => c.id);
  assert.equal(ids.length, 117); assert.equal(new Set(ids).size, 117);
  const room = roomForTutorial();
  assert.equal(room.getPrivateStateByToken("private-teacher-token").privateHand.length, 8);
  assert.ok(room.getAvailableActions("A").some((a: any) => a.action === "pass" && a.enabled));
  assert.equal(room.buildClientRoomSnapshot("B").tutorial, null);
  assert.equal(room.getPrivateStateByToken("wrong-token"), null);
  room.onDispose();
});
test("progress is private, survives recovery, and restart invalidates old decisions", () => {
  const room = roomForTutorial(); room.tutorial.step = "discard_chi";
  const snapshot = room.exportRecoverySnapshot();
  assert.equal(isRoomRecoverySnapshot(snapshot), true);
  const restored = new FourColorGameRoom() as any;
  restored.state = new GameState(); restored.state.restore(snapshot.state);
  restored.restoreRecoveryPrivateState(snapshot);
  assert.deepEqual(restored.tutorial, { seatId: "A", step: "discard_chi" });
  assert.equal(restored.collectiveResponseWindowMs, 120000);
  restored.tickBots = () => {};
  restored.resumeRecoveredRoom();
  assert.equal(restored.takeoverTimers.has("A"), false);
  restored.activateTemporaryTakeover("A");
  assert.equal(restored.botIds.has("A"), false);
  const key = room.buildDecisionTimerSnapshot("A").decisionKey;
  room.bootstrapRound();
  assert.notEqual(room.buildDecisionTimerSnapshot("A").decisionKey, key);
  assert.equal(room.state.publicDiscardPile.length, 1);
  assert.equal(room.playerHands.get("A").length, 8);
  snapshot.privateState.tutorial.step = "arbitrary";
  assert.equal(isRoomRecoverySnapshot(snapshot), false);
  room.onDispose(); restored.onDispose();
});
test("accepted hu waits for actual settlement and alternate legal choices offer retry", () => {
  assert.equal(advanceTutorial("hu", "hu"), "hu");
  assert.equal(advanceTutorial("complete", "hu"), "complete");
  assert.equal(advanceTutorial("discard_chi", "discard", "white_pao_01"), "retry");
  assert.equal(advanceTutorial("discard_chi", "discard", "white_shi_01"), "peng");
  const room = roomForTutorial(); room.seatBySession.set("session", "A");
  room.tutorialActionAccepted = false;
  room.advanceTutorialAfterAction({sessionId:"session"}, "pass");
  assert.equal(room.tutorial.step, "intro");
  room.onDispose();
});


test("public matchmaking cannot inject tutorial or recovery fixtures and preserves quick entry", () => {
  const options = { roomMode: "match", matchOpen: true, name: "玩家", playerToken: "local", profileToken: "profile" };
  assert.equal(isPublicMatchmakingAllowed("joinOrCreate", options), true);
  for (const key of ["tutorial", "recoverySnapshot", "seed", "hand", "hostKey"]) assert.equal(isPublicMatchmakingAllowed("joinOrCreate", { ...options, [key]: {} }), false);
  assert.equal(isPublicMatchmakingAllowed("create", {tutorial:true}), false);
  assert.equal(isPublicMatchmakingAllowed("joinOrCreate", {roomMode:"practice"}), false);
  assert.equal(isPublicMatchmakingAllowed("joinById", {playerToken:"local"}), true);
});
