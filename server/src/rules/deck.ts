import type { Card, CardColor, CardType } from "./types.js";

const COLORS: CardColor[] = ["yellow", "red", "green", "white"];
const BASE_TYPES: CardType[] = ["jiang", "shi", "xiang", "ju", "ma", "pao", "zu"];
const GOLD_TYPES: CardType[] = ["gong", "hou", "bo", "zi", "nan"];

export function createDeck(): Card[] {
  const cards: Card[] = [];

  for (const color of COLORS) {
    for (const type of BASE_TYPES) {
      for (let i = 1; i <= 4; i += 1) {
        cards.push({
          id: `${color}_${type}_${String(i).padStart(2, "0")}`,
          color,
          type,
        });
      }
    }
  }

  for (const type of GOLD_TYPES) {
    cards.push({
      id: `gold_${type}_01`,
      color: "gold",
      type,
    });
  }

  return cards;
}

export function shuffle<T>(arr: T[]): T[] {
  const cloned = [...arr];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

export function isGeneral(card: Card): boolean {
  return card.type === "jiang";
}

export function isGold(card: Card): boolean {
  return card.color === "gold";
}

export function isDiscardRestricted(card: Card): boolean {
  return isGeneral(card) || isGold(card);
}

export function isSameFace(a: Card, b: Card): boolean {
  return a.color === b.color && a.type === b.type;
}
