import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../../game-core/game-session.js";
import { OfflinePracticeSession } from "../../game-core/offline-practice-session.js";
import {
  PUTIAN_V1_RULE_REF,
  RuleSetRegistry,
  createPutianRuleSet,
  type RuleSet,
} from "../../game-core/ruleset.js";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { chooseBotDiscard } from "../../rooms/bot-strategy.js";
import { findListeningDiscards } from "../../rooms/flow/listening-hints.js";
import { createRoomStateOps } from "../../rooms/flow/room-state-ops.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

const blocked: Card = { id: "blocked", color: "white", type: "shi" };
const allowed: Card = { id: "allowed", color: "red", type: "ju" };
const variantRef = { id: "test-discard-variant", version: "1" };
const base = createPutianRuleSet(PUTIAN_V1_RULE_REF, {
  enforceDeclaredKans: true,
  legacyDrawKeepsDealer: false,
});
const variant = {
  ...base,
  ref: variantRef,
  canDiscard: (hand, cardId, declaredKongs) =>
    cardId !== blocked.id && base.canDiscard(hand, cardId, declaredKongs),
} satisfies RuleSet;

function createSession(): GameSession {
  return new GameSession(PUTIAN_V1_RULE_REF, new RuleSetRegistry().register(base).register(variant));
}

test("online legal IDs, manual rejection and automatic discard follow the current RuleSet", () => {
  const room = new FourColorGameRoom() as any;
  room.gameSession = createSession();
  room.state = new GameState();
  room.state.phase = "playing";
  const player = new PlayerState();
  player.clientId = "A";
  room.state.players.set("A", player);
  room.playerHands = new Map([["A", [{ ...blocked }, { ...allowed }]]]);
  room.awaitingDiscardOwnerId = "A";

  // Construct the operations under the standard rule before switching it.
  assert.deepEqual(room.buildDecisionTimerSnapshot("A").legalDiscardCardIds, [blocked.id, allowed.id]);
  room.gameSession.useRuleSet(variantRef);
  assert.deepEqual(room.buildDecisionTimerSnapshot("A").legalDiscardCardIds, [allowed.id]);
  const before = structuredClone(room.playerHands.get("A"));
  assert.equal(room.ops.discardCardById("A", blocked.id), null);
  assert.deepEqual(room.playerHands.get("A"), before);
  assert.equal(room.ops.pickDiscardCard("A")?.id, allowed.id);
  assert.deepEqual(room.playerHands.get("A"), [blocked]);

  room.gameSession.useRuleSet(PUTIAN_V1_RULE_REF);
  assert.deepEqual(room.buildDecisionTimerSnapshot("A").legalDiscardCardIds, [blocked.id]);
  assert.equal(room.ops.discardCardById("A", blocked.id)?.id, blocked.id);
});

test("offline legal IDs, atomic rejection and bot automation use dynamically selected rules", () => {
  const offline = new OfflinePracticeSession("测试玩家", () => 0);
  // Keep the original session and hand map captured by the offline operations.
  const registry = (offline.gameSession as unknown as { registry: RuleSetRegistry }).registry;
  registry.register(variant);
  offline.state.phase = "playing";
  offline.gameSession.state.playerHands.set(offline.humanSeatId, [{ ...blocked }, { ...allowed }]);
  offline.gameSession.state.awaitingDiscardOwnerId = offline.humanSeatId;
  assert.deepEqual(offline.view().decisionTimer.legalDiscardCardIds, [blocked.id, allowed.id]);

  offline.gameSession.useRuleSet(variantRef);
  assert.deepEqual(offline.view().decisionTimer.legalDiscardCardIds, [allowed.id]);
  const before = offline.view();
  assert.equal(offline.discard(blocked.id), false);
  assert.deepEqual(offline.view().privateHand, before.privateHand);
  assert.equal(offline.view().stateRevision, before.stateRevision);
  assert.deepEqual(offline.view().publicDiscardPile, before.publicDiscardPile);

  let discarded = "";
  (offline as any).beginCollectiveFromDiscard = (_seatId: string, card: Card) => { discarded = card.id; };
  assert.equal(offline.discard(allowed.id), true);
  assert.equal(discarded, allowed.id);
  assert.deepEqual(offline.view().privateHand, [blocked]);

  const botId = "seat_1";
  offline.gameSession.state.playerHands.set(botId, [{ ...blocked }, { ...allowed }]);
  offline.gameSession.state.awaitingDiscardOwnerId = botId;
  assert.equal(offline.advanceAutomation(), true);
  assert.equal(discarded, allowed.id);
  assert.deepEqual(offline.gameSession.state.playerHands.get(botId), [blocked]);

  offline.gameSession.state.awaitingDiscardOwnerId = offline.humanSeatId;
  offline.gameSession.useRuleSet(PUTIAN_V1_RULE_REF);
  assert.deepEqual(offline.view().decisionTimer.legalDiscardCardIds, [blocked.id]);
  assert.equal(offline.discard(blocked.id), true);
});

test("direct state operations and bot calls retain the default Putian discard policy", () => {
  const hand: Card[] = [{ id: "general", color: "red", type: "jiang" }, { ...allowed }];
  const hands = new Map([["A", hand]]);
  const ops = createRoomStateOps(new GameState(), hands, () => null);
  assert.equal(ops.canDiscardCard("A", "general"), false);
  assert.equal(ops.canDiscardCard("A", allowed.id), true);
  assert.equal(chooseBotDiscard({ hand, visibleCards: [], strength: 50, random: () => 0 })?.id, allowed.id);
});

test("session bots cannot override RuleSet legality and switch without losing the full hand", () => {
  const session = createSession();
  const hand = [{ ...blocked }, { ...allowed }];
  const input = { hand, visibleCards: [], strength: 50, random: () => 0, canDiscard: () => false };
  assert.ok(session.chooseBotDiscard(input));
  session.useRuleSet(variantRef);
  for (const strength of [0, 20, 50, 85, 100]) {
    assert.equal(session.chooseBotDiscard({ ...input, strength })?.id, allowed.id);
  }
  assert.deepEqual(hand, [blocked, allowed]);
  assert.equal(session.chooseBotDiscard({ ...input, hand: [{ ...blocked }] }), null);
  session.useRuleSet(PUTIAN_V1_RULE_REF);
  assert.equal(session.chooseBotDiscard({ ...input, hand: [{ ...blocked }] })?.id, blocked.id);
});

test("a nonempty Putian listening set cannot remove every rule-legal bot discard", () => {
  const hand: Card[] = [
    { id: "chariot", color: "red", type: "ju" },
    { id: "horse", color: "red", type: "ma" },
    { id: "pawn", color: "white", type: "zu" },
    { id: "general", color: "red", type: "jiang" },
    { id: "gold", color: "gold", type: "gong" },
  ];
  const listeningIds = new Set(findListeningDiscards(hand).map((route) => route.discardCardId));
  assert.ok(listeningIds.size > 0);
  assert.equal(listeningIds.has("general"), false);
  const restricted = {
    ...base,
    ref: variantRef,
    canDiscard: (cards, cardId) => cardId === "general" && cards.some((card) => card.id === cardId),
  } satisfies RuleSet;
  const session = new GameSession(variantRef, new RuleSetRegistry().register(restricted));
  assert.equal(session.chooseBotDiscard({ hand, visibleCards: [], strength: 50, random: () => 0 })?.id, "general");
  assert.deepEqual(hand.map((card) => card.id), ["chariot", "horse", "pawn", "general", "gold"]);
});
