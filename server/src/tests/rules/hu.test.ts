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

test("a response jiang stays single or completes a quad", () => {
  const triplet = explainHu(
    [c("rj1", "red", "jiang"), c("rj2", "red", "jiang")],
    c("rj3", "red", "jiang"),
  );
  assert.equal(triplet.valid, true);
  assert.deepEqual(triplet.groups, ["SingleJiang", "SingleJiang", "SingleJiang"]);

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

test("jiang forms a valid same-color jsx frame", () => {
  const result = explainHu(
    [c("rj1", "red", "jiang"), c("rs1", "red", "shi")],
    c("rx1", "red", "xiang"),
  );
  assert.equal(result.valid, true);
  assert.equal(result.groups.includes("FrameJSX"), true);
});

test("hu cannot split a declared white soldier triplet across mixed groups", () => {
  const hand = [
    c("yzu1", "yellow", "zu"),
    c("yzu2", "yellow", "zu"),
    c("rzu1", "red", "zu"),
    c("gzu1", "green", "zu"),
    c("wzu1", "white", "zu"),
    c("wzu2", "white", "zu"),
    c("wzu3", "white", "zu"),
  ];
  const response = c("rj1", "red", "jiang");

  assert.equal(explainHu(hand, response).valid, true, "the unconstrained solver can split the white triplet");
  assert.equal(explainHu(hand, response, { minimumHiddenTriplets: 1 }).valid, false);
});

test("hu remains valid when the declared triplet stays intact", () => {
  const hand = [
    c("yzu1", "yellow", "zu"),
    c("rzu1", "red", "zu"),
    c("gzu1", "green", "zu"),
    c("wzu1", "white", "zu"),
    c("wzu2", "white", "zu"),
    c("wzu3", "white", "zu"),
  ];
  const result = explainHu(hand, c("rj1", "red", "jiang"), { minimumHiddenTriplets: 1 });

  assert.equal(result.valid, true);
  assert.equal(result.details?.some((group) =>
    group.key === "Triplet" && group.cards.every((card) => card.color === "white" && card.type === "zu")
  ), true);
});

test("a declared triplet may grow into a quad with the winning response", () => {
  const hand = [
    c("wzu1", "white", "zu"),
    c("wzu2", "white", "zu"),
    c("wzu3", "white", "zu"),
  ];
  const result = explainHu(hand, c("wzu4", "white", "zu"), { minimumHiddenTriplets: 1 });

  assert.equal(result.valid, true);
  assert.deepEqual(result.groups, ["Quad"]);
});


test("drawn gong cannot turn two hand golds into a hidden triplet", () => {
  const result = explainHu([c("bo", "gold", "bo"), c("zi", "gold", "zi")], c("gong", "gold", "gong"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.groups, ["SingleGold", "SingleGold", "SingleGold"]);
  assert.deepEqual(result.details?.[0]?.cards.map((card) => card.id), ["gong"]);
  assert.equal(new Set(result.details?.flatMap((group) => group.cards.map((card) => card.id))).size, 3);
});

test("ordinary response triplet is Peng while a hand triplet stays hidden", () => {
  const hand = [c("r1", "red", "ju"), c("r2", "red", "ju"), c("w1", "white", "ma"), c("w2", "white", "ma"), c("w3", "white", "ma")];
  const result = explainHu(hand, c("r3", "red", "ju"), { minimumHiddenTriplets: 1 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.groups, ["Peng", "Triplet"]);
  assert.ok(result.details?.[0]?.cards.some((card) => card.id === "r3"));
});

test("an existing gold kan is preserved when another gold wins as a single", () => {
  const result = explainHu([c("g1", "gold", "bo"), c("g2", "gold", "zi"), c("g3", "gold", "hou")], c("g4", "gold", "gong"), { minimumHiddenTriplets: 1 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.groups, ["GoldQuad"]);
});
