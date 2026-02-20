import assert from "node:assert/strict";
import { canChi, canKai, canPeng, findKaiPlan, getChiPlans } from "../rules/actions.js";
import { explainHu, validateHu } from "../rules/hu.js";
import type { Card } from "../rules/types.js";
import { FourColorGameRoom } from "../rooms/GameRoom.js";
import { GameState, PlayerState } from "../schema/game-state.schema.js";

type TestFn = () => void;

const tests: Array<{ name: string; fn: TestFn }> = [];

function t(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

function c(id: string, color: Card["color"], type: Card["type"], source?: "upper" | "draw"): Card {
  return source ? { id, color, type, source } : { id, color, type };
}

t("actions: kai supports 2 matching + wildcard pool", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const pool = [c("wj", "white", "jiang")];
  assert.equal(canKai(hand, response, pool), true);
  const plan = findKaiPlan(hand, response, pool);
  assert.ok(plan);
  assert.equal(plan!.handCards.length, 2);
  assert.equal(plan!.poolCards.length, 1);
});

t("actions: peng does not consume wildcard", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("wj", "white", "jiang")];
  assert.equal(canPeng(hand, response), false);
});

t("actions: chi supports wildcard completion", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rm", "red", "ma")];
  const pool = [c("g1", "gold", "gong")];
  assert.equal(canChi(hand, response, pool), true);
  const plans = getChiPlans(hand, response, pool);
  assert.ok(plans.length > 0);
});

t("hu: single jiang is valid", () => {
  const result = explainHu([], c("rj", "red", "jiang"));
  assert.equal(result.valid, true);
});

t("hu: wildcard pool participates", () => {
  const hand = [c("rju", "red", "ju"), c("rma", "red", "ma")];
  const response = c("rpa", "red", "pao");
  const wildcardPool = [c("wj", "white", "jiang")];
  const result = explainHu(hand, response, { wildcardPool });
  assert.equal(result.valid, true);
});

t("hu: numeric wildcard option compatible", () => {
  const hand = [c("rju", "red", "ju")];
  const response = c("rma", "red", "ma");
  assert.equal(validateHu(hand, response, 1), true);
});

function mkRoom(seats: string[]) {
  const room = new FourColorGameRoom() as any;
  const state = new GameState();
  for (const seat of seats) {
    const p = new PlayerState();
    p.clientId = seat;
    p.name = seat;
    state.players.set(seat, p);
  }
  room.state = state;
  room.playerOrder = [...seats];
  room.state.phase = "playing";
  return room;
}

t("room: collective draw order starts from owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const order = room.getCollectiveOrder({
    ownerId: "A",
    card: c("x", "red", "ju", "draw"),
    collectives: new Map(),
  });
  assert.deepEqual(order, ["A", "B", "C", "D"]);
});

t("room: collective upper order starts from next and includes owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const order = room.getCollectiveOrder({
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map(),
  });
  assert.deepEqual(order, ["B", "C", "D", "A"]);
});

t("room: no-response on upper enters local_upper for next player", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.enterOwnerLocalPhaseAfterNoResponse("A");
  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentPlayerId, "B");
});

let failed = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log(`PASS ${item.name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} test(s) passed`);
