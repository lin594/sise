import { resolveDealerFromAnchorAndCard } from "../../rooms/flow/support.js";
import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";
import { countHiddenKans, canDiscardPreservingKans } from "../../rules/declared-kans.js";
import { chooseBotDiscard } from "../../rooms/bot-strategy.js";
import { buildDeclarationSelection } from "../../rooms/flow/match-runtime.js";
import type { Card } from "../../rules/types.js";

const kan = (prefix: string, color: Card["color"] = "red", type: Card["type"] = "ma"): Card[] =>
  [0, 1, 2].map(i => ({ id: `${prefix}${i}`, color, type, source: "upper" }));
const spare: Card = { id: "spare", color: "white", type: "shi", source: "upper" };
function roomWithHand(hand: Card[], declared = 1): any {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "playing";
  room.playerOrder = ["A", "B", "C", "D"];
  for (const id of room.playerOrder) {
    const player = new PlayerState(); player.clientId = id;
    room.state.players.set(id, player);
  }
  room.state.players.get("A").declaredKongs = declared;
  room.playerHands = new Map([["A", hand]]);
  room.awaitingDiscardOwnerId = "A";
  return room;
}

test("declaration is bounded after selected fish are removed", () => {
  const fish = [...kan("f"), { ...kan("f")[0], id: "f3" }];
  const selected = buildDeclarationSelection([...fish, ...kan("k", "green")], { fishCardIds: fish.map(c => c.id), declaredKongs: 99 });
  assert.equal(selected.declaredKongs, 1);
});
test("manual and automatic discard preserve the declared quota atomically", () => {
  const room = roomWithHand([...kan("k"), spare]);
  const before = structuredClone(room.playerHands.get("A"));
  assert.equal(room.ops.discardCardById("A", "k0"), null);
  assert.deepEqual(room.playerHands.get("A"), before);
  assert.deepEqual(room.buildDecisionTimerSnapshot("A").legalDiscardCardIds, ["spare"]);
  assert.equal(room.ops.pickDiscardCard("A").id, "spare");
  assert.equal(countHiddenKans(room.playerHands.get("A")), 1);
});
test("quota protects a count, not the original triplet identities", () => {
  assert.equal(canDiscardPreservingKans([...kan("a"), ...kan("b", "green")], "a0", 1), true);
  assert.equal(canDiscardPreservingKans([...kan("a"), ...kan("b", "green")], "a0", 2), false);
  assert.equal(canDiscardPreservingKans([...kan("a"), { ...kan("a")[0], id: "a3" }], "a0", 1), true);
  assert.equal(countHiddenKans([{ id: "g1", color: "gold", type: "gong" }, { id: "g2", color: "gold", type: "hou" }, { id: "g3", color: "gold", type: "bo" }] as Card[]), 1);
});
test("bot strengths only choose legal discards; legacy rounds retain old selection", () => {
  for (const strength of [0, 20, 50, 85, 100]) for (let i = 0; i < 20; i++) {
    assert.equal(chooseBotDiscard({ hand: [...kan("k"), spare], visibleCards: [], declaredKongs: 1, strength })?.id, "spare");
  }
  const room = roomWithHand(kan("k"));
  room.ruleVersion = "legacy";
  assert.ok(room.ops.discardCardById("A", "k0"));
});
test("an invalid bot selection falls back to a legal discard without awarding a win", () => {
  const room = roomWithHand([...kan("k"), spare]);
  let discarded = "";
  room.beginCollectiveFromDiscard = (_: string, card: Card) => { discarded = card.id; };
  room.discardFromAndCollective("A", "k0");
  assert.equal(discarded, "spare");
  assert.equal(room.state.phase, "playing");
});
test("only protected valid groups can finish without a discard; invalid hands cannot win", () => {
  const room = roomWithHand(kan("k"));
  let winner = "";
  room.endRound = (_: string, id: string) => { winner = id; };
  room.enterDiscardStage("A", "CHI");
  assert.equal(winner, "A");
  winner = "";
  room.playerHands.set("A", [spare]);
  room.declareNoDiscardWin("A", "AUTO_DISCARD");
  assert.equal(winner, "");
});
test("draw picker is the previous dealer's opposite; legacy draw retains dealer", () => {
  const room = roomWithHand([]);
  for (const dealer of room.playerOrder) {
    room.roundDealerId = dealer;
    room.prepareNextRoundSetup(null, null);
    assert.deepEqual(room.nextRoundSetup, { mode: "picker", pickerId: room.playerOrder[(room.playerOrder.indexOf(dealer) + 2) % 4] });
  }
  room.prepareNextRoundSetup("B", "small");
  assert.deepEqual(room.nextRoundSetup, { mode: "fixed", dealerId: "B" });
  room.prepareNextRoundSetup("B", "big");
  assert.deepEqual(room.nextRoundSetup, { mode: "picker", pickerId: "D" });
  room.ruleVersion = "legacy"; room.roundDealerId = "B";
  room.prepareNextRoundSetup(null, null);
  assert.deepEqual(room.nextRoundSetup, { mode: "fixed", dealerId: "B" });
});

test("kai credits one preserved kan only after successful execution", () => {
  const room = roomWithHand([...kan("k"), spare]);
  const pending: Card = { id: "fourth", color: "red", type: "ma", source: "draw" };
  room.awaitingDiscardOwnerId = null;
  room.pendingResponse = { ownerId: "A", card: pending, collectives: new Map() };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "A";
  const action = room.getAvailableActions("A", true).find((x: any) => x.action === "kai");
  assert.ok(action?.enabled);
  room.recordMeld = () => {};
  room.enterDiscardStage = () => {};
  room.executeResponseWinner("A", { action: "kai", candidateId: action.candidates[0].id });
  assert.equal(room.state.players.get("A").declaredKongs, 0);
  assert.deepEqual([...room.state.players.get("A").exposedGroupKinds], ["kai"]);
  assert.equal(room.state.players.get("A").exposedArea.length, 4);
  assert.deepEqual(room.playerHands.get("A").map((x: Card) => x.id), ["spare"]);
});

test("chi and peng candidates cannot consume a required hidden kan", () => {
  const room = roomWithHand([...kan("k"), { id: "car", color: "red", type: "ju" }]);
  room.awaitingDiscardOwnerId = null;
  room.pendingResponse = { ownerId: "A", card: { id: "cannon", color: "red", type: "pao", source: "draw" }, collectives: new Map() };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "A";
  assert.equal(room.getAvailableActions("A", true).some((x: any) => x.action === "chi" && x.enabled), false);
  room.pendingResponse.card = { id: "fourth", color: "red", type: "ma", source: "draw" };
  assert.equal(room.getAvailableActions("A", true).some((x: any) => x.action === "peng" && x.enabled), false);
  const before = structuredClone(room.playerHands.get("A"));
  assert.equal(room.preservesDeclaredKongsAfterAction("A", "kai", room.pendingResponse.card, "invalid"), false);
  assert.equal(room.state.players.get("A").declaredKongs, 1);
  assert.deepEqual(room.playerHands.get("A"), before);
});

test("failed collective candidate leaves pending card, hand, declaration and phase intact", () => {
  const room = roomWithHand([...kan("k"), spare]);
  room.pendingResponse = { ownerId: "B", card: { id: "fourth", color: "red", type: "ma", source: "upper" }, collectives: new Map() };
  room.state.pollOriginPlayerId = "B";
  room.ops.pushDiscard("B", room.pendingResponse.card);
  room.collectiveResponseEndsAt = 123;
  const before = JSON.stringify({ hand: room.playerHands.get("A"), pending: room.pendingResponse, state: room.state });
  room.executeResponseWinner("A", { action: "kai", candidateId: "stale" });
  assert.equal(JSON.stringify({ hand: room.playerHands.get("A"), pending: room.pendingResponse, state: room.state }), before);
  assert.equal(room.collectiveResponseEndsAt, 123);
});

test("all five draw-card colors count from the former dealer's opposite", () => {
  const room = roomWithHand([]);
  room.roundDealerId = "A";
  room.prepareNextRoundSetup(null, null);
  for (const [color, expected] of [["yellow", "C"], ["red", "D"], ["green", "A"], ["white", "B"], ["gold", "D"]] as const) {
    assert.equal(resolveDealerFromAnchorAndCard(room.playerOrder, room.nextRoundSetup.pickerId,
      { id: color, color, type: color === "gold" ? "gong" : "ma" } as Card), expected);
  }
});
