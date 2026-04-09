import test from "node:test";
import assert from "node:assert/strict";
import { canChi, canKai, canPeng, findKaiPlan, getChiPlans, getKaiPlans, getPengPlans } from "../../rules/actions.js";
import type { Card } from "../../rules/types.js";

function c(id: string, color: Card["color"], type: Card["type"]): Card {
  return { id, color, type };
}

test("canKai requires three exact matching cards in hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const pool = [c("wj", "white", "jiang")];

  assert.equal(canKai(hand, response, pool), false);
});

test("canKai allows three exact cards", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju")];
  assert.equal(canKai(hand, response, []), true);
  const plan = findKaiPlan(hand, response, []);
  assert.ok(plan);
  assert.equal(plan!.handCards.length, 3);
  assert.equal(plan!.poolCards.length, 0);
});

test("getKaiPlans returns deterministic plan ids for same input", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju")];
  const plansA = getKaiPlans(hand, response, []);
  const plansB = getKaiPlans(hand, response, []);
  assert.equal(plansA.length > 0, true);
  assert.deepEqual(
    plansA.map((x) => x.handCards.map((card) => card.id).sort().join("|")),
    plansB.map((x) => x.handCards.map((card) => card.id).sort().join("|")),
  );
});

test("canPeng does not use wildcard substitution", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("gj", "green", "jiang")];
  assert.equal(canPeng(hand, response), false);
});

test("getPengPlans only builds hand-based plans", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const plans = getPengPlans(hand, response);
  assert.equal(plans.some((x) => x.kind === "hand"), true);
});

test("canChi rejects missing exact cards even with jiang/gold in hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rm", "red", "ma"), c("wj", "white", "jiang")];
  const pool = [c("gold1", "gold", "gong")];

  assert.equal(canChi(hand, response, pool), false);
});

test("canChi allows exact same-color frame", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rm", "red", "ma"), c("rp", "red", "pao")];
  assert.equal(canChi(hand, response, []), true);
});

test("canChi rejects gold response card", () => {
  const response = c("gold1", "gold", "gong");
  const hand = [c("rm", "red", "ma"), c("rp", "red", "pao")];
  assert.equal(canChi(hand, response, []), false);
});

test("canChi pair mode rejects jiang response", () => {
  const response = c("rj", "red", "jiang");
  const hand = [c("rj2", "red", "jiang")];
  assert.equal(getChiPlans(hand, response, []).some((x) => x.kind === "pair"), false);
});

test("canChi pair mode rejects wildcard substitution from hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("wj", "white", "jiang")];
  assert.equal(getChiPlans(hand, response, []).some((x) => x.kind === "pair"), false);
});

test("canChi pair mode rejects wildcard substitution from pool", () => {
  const response = c("rj", "red", "ju");
  const hand: Card[] = [];
  const pool = [c("gold1", "gold", "gong")];
  assert.equal(getChiPlans(hand, response, pool).some((x) => x.kind === "pair"), false);
});

test("canPeng rejects jiang and gold response", () => {
  const hand = [c("rj1", "red", "jiang"), c("rj2", "red", "jiang")];
  assert.equal(canPeng(hand, c("rj", "red", "jiang")), false);
  assert.equal(canPeng([c("g1", "gold", "gong"), c("g2", "gold", "hou")], c("g0", "gold", "bo")), false);
});

test("canChi pair mode with two exact cards consumes two from hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const plans = getChiPlans(hand, response, []);
  const pair = plans.find((x) => x.kind === "pair");
  assert.ok(pair);
  assert.equal(pair!.handCards.length, 2);
  assert.equal(pair!.poolCards.length, 0);
});
