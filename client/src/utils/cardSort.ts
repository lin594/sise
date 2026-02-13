import type { Card } from "@/types/game";

const GOLD_ORDER: Record<string, number> = {
  gong: 0,
  hou: 1,
  bo: 2,
  zi: 3,
  nan: 4,
};

const COLOR_ORDER: Record<string, number> = {
  yellow: 0,
  red: 1,
  green: 2,
  white: 3,
};

const NORMAL_TYPE_ORDER: Record<string, number> = {
  jiang: 0,
  shi: 1,
  xiang: 2,
  ju: 3,
  ma: 4,
  pao: 5,
};

function mainGroup(card: Card): number {
  if (card.color === "gold") {
    return 0;
  }
  if (card.type === "zu") {
    return 2;
  }
  return 1;
}

function orderValue(card: Card): number {
  if (card.color === "gold") {
    return GOLD_ORDER[card.type] ?? 99;
  }
  if (card.type === "zu") {
    return COLOR_ORDER[card.color] ?? 99;
  }
  return (COLOR_ORDER[card.color] ?? 99) * 10 + (NORMAL_TYPE_ORDER[card.type] ?? 99);
}

export function compareHandCard(a: Card, b: Card): number {
  const ga = mainGroup(a);
  const gb = mainGroup(b);
  if (ga !== gb) {
    return ga - gb;
  }

  const va = orderValue(a);
  const vb = orderValue(b);
  if (va !== vb) {
    return va - vb;
  }

  if (a.color !== b.color) {
    return a.color.localeCompare(b.color);
  }
  if (a.type !== b.type) {
    return a.type.localeCompare(b.type);
  }
  return a.id.localeCompare(b.id);
}

export function sortHandCards(cards: Card[]): Card[] {
  return [...cards].sort(compareHandCard);
}
