import test from "node:test";
import assert from "node:assert/strict";
import { GameSession } from "../../game-core/game-session.js";
import {
  PUTIAN_V1_RULE_REF,
  RuleSetRegistry,
  createPutianRuleSet,
  type RuleRef,
  type RuleSet,
} from "../../game-core/ruleset.js";
import type { Card } from "../../rules/types.js";

function card(id: string, color: Card["color"], type: Card["type"]): Card {
  return { id, color, type };
}

function localUpperActions(session: GameSession) {
  const response = card("response", "red", "ju");
  const hand = [card("horse", "red", "ma"), card("cannon", "red", "pao")];
  return session.getAvailableActions({
    phase: "playing",
    seatId: "seat_1",
    pending: { ownerId: "seat_1", card: response },
    responsePhase: "local_upper",
    collectiveResponderId: null,
    awaitingDiscardOwnerId: null,
    hand,
    wildcardPool: [],
    explainHuForSeat: () => ({ valid: false }),
    logHuCheck: () => undefined,
    getHandWithoutPending: () => hand,
    getNextPlayerId: () => "seat_2",
  });
}

test("GameSession selects rules by stable RuleRef and rejects unknown versions", () => {
  const session = new GameSession(PUTIAN_V1_RULE_REF);
  assert.deepEqual(session.ruleRef, PUTIAN_V1_RULE_REF);
  assert.throws(
    () => session.useRuleSet({ id: PUTIAN_V1_RULE_REF.id, version: "9.9" }),
    /unknown or incompatible ruleset/,
  );
  assert.deepEqual(session.ruleRef, PUTIAN_V1_RULE_REF);
});

test("GameSession owns a serializable authoritative core state", () => {
  const session = new GameSession(PUTIAN_V1_RULE_REF);
  session.state.playerOrder = ["A", "B"];
  session.state.botIds.add("B");
  session.state.deck = [card("deck", "green", "zu")];
  session.state.playerHands.set("A", [card("hand", "red", "ju")]);
  session.state.pendingResponse = {
    ownerId: "A",
    card: card("response", "white", "ma"),
    collectives: new Map([["B", { action: "peng", candidateId: "candidate" }]]),
  };

  const restored = new GameSession();
  restored.restore(session.serialize());
  assert.deepEqual(restored.serialize(), session.serialize());

  restored.state.deck[0]!.id = "mutated";
  assert.equal(session.state.deck[0]!.id, "deck");
});

test("a registered test-only RuleSet changes a real action without engine or host branches", () => {
  const variantRef = { id: "test-variant", version: "1" } satisfies RuleRef;
  const base = createPutianRuleSet(PUTIAN_V1_RULE_REF, {
    enforceDeclaredKans: true,
    legacyDrawKeepsDealer: false,
  });
  const variantRules = {
    ...base,
    ref: variantRef,
    buildChiCandidates: () => [],
    settleRound: <T extends { totalScore: number; scoreBreakdown: Array<{ total: number }> }>(players: T[]): T[] =>
      players.map((player) => ({
        ...player,
        totalScore: player.totalScore * 2,
        scoreBreakdown: player.scoreBreakdown.map((item) => ({ ...item, total: item.total * 2 })),
      })),
  } satisfies RuleSet;
  const registry = new RuleSetRegistry().register(base).register(variantRules);

  const standard = new GameSession(PUTIAN_V1_RULE_REF, registry);
  const variant = new GameSession(variantRef, registry);
  assert.equal(localUpperActions(standard).find((entry) => entry.action === "chi")?.enabled, true);
  assert.equal(localUpperActions(variant).find((entry) => entry.action === "chi")?.enabled, false);
  assert.equal(standard.settleRound([{ totalScore: 3, scoreBreakdown: [] }])[0]?.totalScore, 3);
  assert.equal(variant.settleRound([{ totalScore: 3, scoreBreakdown: [] }])[0]?.totalScore, 6);
});

test("seeded session shuffles are reproducible without changing the 117-card deck", () => {
  const sequence = [0.91, 0.13, 0.72, 0.04, 0.55];
  const random = () => {
    let index = 0;
    return () => sequence[index++ % sequence.length]!;
  };
  const session = new GameSession();
  const first = session.createShuffledDeck(random());
  const second = session.createShuffledDeck(random());
  assert.equal(first.length, 117);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.equal(new Set(first.map((item) => item.id)).size, 117);
});

test("RuleSet controls draw continuation while preserving winner dealer rules", () => {
  const v1 = new GameSession();
  assert.deepEqual(v1.prepareNextRound({
    winnerId: "B",
    huType: "small",
    roundDealerId: "A",
    playerOrder: ["A", "B", "C", "D"],
    hasPlayer: () => true,
  }), { mode: "fixed", dealerId: "B" });
  assert.deepEqual(v1.prepareNextRound({
    winnerId: null,
    huType: null,
    roundDealerId: "A",
    playerOrder: ["A", "B", "C", "D"],
    hasPlayer: () => true,
  }), { mode: "picker", pickerId: "C" });
});
