import { isGeneral, isGold, isSameFace } from "./deck.js";
import type { Card } from "./types.js";

function countMatching(hand: Card[], target: Card): number {
  return hand.filter((card) => isSameFace(card, target)).length;
}

function findByFace(hand: Card[], color: Card["color"], type: Card["type"]): Card | undefined {
  return hand.find((card) => card.color === color && card.type === type);
}

export function canPeng(hand: Card[], response: Card): boolean {
  if (isGeneral(response)) {
    return false;
  }
  return countMatching(hand, response) >= 2;
}

export function canOpen(hand: Card[], response: Card): boolean {
  if (isGeneral(response)) {
    return false;
  }
  return countMatching(hand, response) >= 3;
}

export function getEatCandidates(hand: Card[], response: Card): Card[][] {
  if (isGold(response)) {
    return [];
  }

  const groups: Card[][] = [];

  const pushIfAll = (cards: Array<Card | undefined>) => {
    if (cards.every(Boolean)) {
      groups.push(cards as Card[]);
    }
  };

  if (response.type === "ju" || response.type === "ma" || response.type === "pao") {
    const need = ["ju", "ma", "pao"].filter((type) => type !== response.type);
    pushIfAll(need.map((type) => findByFace(hand, response.color, type as Card["type"])));
  }

  if (response.type === "jiang" || response.type === "shi" || response.type === "xiang") {
    const need = ["jiang", "shi", "xiang"].filter((type) => type !== response.type);
    pushIfAll(need.map((type) => findByFace(hand, response.color, type as Card["type"])));
  }

  if (response.type === "zu") {
    const colors: Card["color"][] = ["yellow", "red", "green", "white"];
    const others = colors.filter((color) => color !== response.color);
    const available = others
      .map((color) => findByFace(hand, color, "zu"))
      .filter(Boolean) as Card[];

    for (let i = 0; i < available.length; i += 1) {
      for (let j = i + 1; j < available.length; j += 1) {
        groups.push([available[i], available[j]]);
      }
    }
    if (available.length === 3) {
      groups.push([...available]);
    }
  }

  return groups;
}

export function canEat(hand: Card[], response: Card): boolean {
  return getEatCandidates(hand, response).length > 0;
}
