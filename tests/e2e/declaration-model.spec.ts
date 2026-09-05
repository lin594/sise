import { expect, test } from "@playwright/test";
import type { Card } from "../../client/src/types/game";
import {
  analyzeHiddenKongs,
  buildFishOptions,
  getRecommendedFishOptionIds,
  getSelectedFishCardIds,
  getDeclarationStartLabel,
  reconcileDeclaredKongs,
  toggleFishOptionId,
} from "../../client/src/utils/declaration";

function card(id: string, color: string, type: string): Card {
  return { id, color, type };
}

test("declaration model recommends every regular fish and the five-card gold fish", () => {
  const hand = [
    ...[1, 2, 3, 4].map((index) => card(`rj${index}`, "red", "ju")),
    ...[1, 2, 3, 4, 5].map((index) => card(`g${index}`, "gold", `gold-${index}`)),
  ];
  const options = buildFishOptions(hand);
  const recommended = getRecommendedFishOptionIds(options);

  expect(options.map((option) => option.id)).toEqual([
    "fish:red:ju",
    "fish:gold:4",
    "fish:gold:5",
  ]);
  expect([...recommended]).toEqual(["fish:red:ju", "fish:gold:5"]);
  expect(getSelectedFishCardIds(options, recommended).size).toBe(9);
});

test("gold fish sizes are mutually exclusive", () => {
  const hand = [1, 2, 3, 4, 5].map((index) => card(`g${index}`, "gold", `gold-${index}`));
  const options = buildFishOptions(hand);
  const fourGold = options.find((option) => option.id === "fish:gold:4")!;
  const selected = toggleFishOptionId(new Set(["fish:gold:5"]), fourGold);

  expect([...selected]).toEqual(["fish:gold:4"]);
  expect(getSelectedFishCardIds(options, selected).size).toBe(4);
});

test("selected fish cards are excluded from hidden kong analysis", () => {
  const hand = [
    ...[1, 2, 3, 4].map((index) => card(`wp${index}`, "white", "pao")),
    ...[1, 2, 3].map((index) => card(`rj${index}`, "red", "ju")),
    ...[1, 2, 3].map((index) => card(`gs${index}`, "green", "shi")),
  ];
  const options = buildFishOptions(hand);
  const fishCardIds = getSelectedFishCardIds(options, getRecommendedFishOptionIds(options));
  const analysis = analyzeHiddenKongs(hand, fishCardIds);

  expect(analysis.count).toBe(2);
  expect([...analysis.cardIds].sort()).toEqual(["gs1", "gs2", "gs3", "rj1", "rj2", "rj3"]);
});

test("untouched hidden kong count follows recommendations while a manual value is preserved and clamped", () => {
  expect(reconcileDeclaredKongs(1, 3, false)).toBe(3);
  expect(reconcileDeclaredKongs(1, 3, true)).toBe(1);
  expect(reconcileDeclaredKongs(3, 1, true)).toBe(1);
});

test("declaration start labels explain both the action and selected result", () => {
  expect(getDeclarationStartLabel(0, 0)).toBe("开始游戏");
  expect(getDeclarationStartLabel(2, 0)).toBe("开始游戏 · 鱼 2");
  expect(getDeclarationStartLabel(0, 1)).toBe("开始游戏 · 坎 1");
  expect(getDeclarationStartLabel(2, 1)).toBe("开始游戏 · 鱼 2 · 坎 1");
});
