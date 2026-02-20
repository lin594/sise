import test from "node:test";
import assert from "node:assert/strict";
import { canChi, canKai, canPeng, findKaiPlan, getChiPlans } from "../../rules/actions.js";
import type { Card } from "../../rules/types.js";

function c(id: string, color: Card["color"], type: Card["type"]): Card {
  return { id, color, type };
}

test("canKai allows 2 matching cards + 1 wildcard from pool", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const pool = [c("wj", "white", "jiang")];

  assert.equal(canKai(hand, response, pool), true);
  const plan = findKaiPlan(hand, response, pool);
  assert.ok(plan);
  assert.equal(plan!.handCards.length, 2);
  assert.equal(plan!.poolCards.length, 1);
});

test("canPeng does not use wildcard substitution", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("gj", "green", "jiang")];
  assert.equal(canPeng(hand, response), false);
});

test("canChi allows wildcard completion for same-color frame", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rm", "red", "ma")];
  const pool = [c("gold1", "gold", "gong")];

  assert.equal(canChi(hand, response, pool), true);
  const plans = getChiPlans(hand, response, pool);
  assert.ok(plans.length > 0);
  assert.equal(plans[0].kind, "jmp");
});

test("canChi rejects gold response card", () => {
  const response = c("gold1", "gold", "gong");
  const hand = [c("rm", "red", "ma"), c("rp", "red", "pao")];
  assert.equal(canChi(hand, response, []), false);
});
