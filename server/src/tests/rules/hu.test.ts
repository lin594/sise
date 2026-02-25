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

test("wildcard options no longer act as substitution", () => {
  const hand = [c("rju", "red", "ju"), c("rma", "red", "ma")];
  const response = c("yzu", "yellow", "zu");
  const wildcardPool = [c("wj", "white", "jiang")];
  const result = explainHu(hand, response, { wildcardPool });
  assert.equal(result.valid, false);
});

test("numeric wildcardCount option stays backward compatible", () => {
  const hand = [c("rju", "red", "ju")];
  const response = c("rma", "red", "ma");
  assert.equal(validateHu(hand, response, 1), false);
});

test("jiang triplet and quad are valid groups", () => {
  const triplet = explainHu(
    [c("rj1", "red", "jiang"), c("rj2", "red", "jiang")],
    c("rj3", "red", "jiang"),
  );
  assert.equal(triplet.valid, true);
  assert.ok(triplet.groups.includes("JiangTriplet"));

  const quad = explainHu(
    [c("rj1", "red", "jiang"), c("rj2", "red", "jiang"), c("rj3", "red", "jiang")],
    c("rj4", "red", "jiang"),
  );
  assert.equal(quad.valid, true);
  assert.ok(quad.groups.includes("JiangQuad"));
});

test("gold quad is valid group", () => {
  const result = explainHu(
    [c("g1", "gold", "gong"), c("g2", "gold", "hou"), c("g3", "gold", "bo")],
    c("g4", "gold", "zi"),
  );
  assert.equal(result.valid, true);
  assert.ok(result.groups.includes("GoldQuad"));
});

test("multiple single jiang groups are allowed", () => {
  const result = explainHu([c("rj1", "red", "jiang")], c("rj2", "red", "jiang"));
  assert.equal(result.valid, true);
  assert.equal(result.groups.filter((x) => x === "SingleJiang").length, 2);
});

test("jiang cannot be used in jsx frame", () => {
  const result = explainHu(
    [c("rj1", "red", "jiang"), c("rs1", "red", "shi")],
    c("rx1", "red", "xiang"),
  );
  assert.equal(result.valid, false);
});
