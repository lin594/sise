import test from "node:test";
import assert from "node:assert/strict";
import { explainHu, validateHu } from "../../rules/hu.js";
import type { Card } from "../../rules/types.js";

function c(id: string, color: Card["color"], type: Card["type"]): Card {
  return { id, color, type };
}

test("single jiang is a valid hu group", () => {
  const result = explainHu([], c("rj", "red", "jiang"));
  assert.equal(result.valid, true);
  assert.ok(result.groups.includes("SingleJiang"));
});

test("single gold is a valid hu group", () => {
  const result = explainHu([], c("g1", "gold", "gong"));
  assert.equal(result.valid, true);
  assert.ok(result.groups.includes("SingleGold"));
});

test("wildcard pool participates in hu explain", () => {
  const hand = [c("rju", "red", "ju"), c("rma", "red", "ma")];
  const response = c("rpa", "red", "pao");
  const wildcardPool = [c("wj", "white", "jiang")];
  const result = explainHu(hand, response, { wildcardPool });
  assert.equal(result.valid, true);
});

test("numeric wildcardCount option stays backward compatible", () => {
  const hand = [c("rju", "red", "ju")];
  const response = c("rma", "red", "ma");
  assert.equal(validateHu(hand, response, 1), true);
});
