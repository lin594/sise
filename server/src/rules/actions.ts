import { isGeneral, isGold, isSameFace } from "./deck.js";
import type { Card } from "./types.js";

function countMatching(hand: Card[], target: Card): number {
  return hand.filter((card) => isSameFace(card, target)).length;
}

function findByFace(hand: Card[], color: Card["color"], type: Card["type"]): Card | undefined {
  return hand.find((card) => card.color === color && card.type === type);
}

export function canPeng(hand: Card[], response: Card): boolean {
  if (isGeneral(response) || isGold(response)) {
    return false;
  }
  return countMatching(hand, response) >= 2;
}

export function canOpen(hand: Card[], response: Card): boolean {
  if (isGeneral(response) || isGold(response)) {
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

  // 车马炮架: Must have exactly one of each type (ju, ma, pao) in same color
  // Response card is one of these types, we need to find the other two distinct types
  if (response.type === "ju" || response.type === "ma" || response.type === "pao") {
    const need = ["ju", "ma", "pao"].filter((type) => type !== response.type);
    // findByFace ensures we get at most ONE card of each needed type
    // If we don't have both types, pushIfAll will reject it (undefined check)
    pushIfAll(need.map((type) => findByFace(hand, response.color, type as Card["type"])));
  }

  // 将士象架: Must have exactly one of each type (jiang, shi, xiang) in same color  
  if (response.type === "jiang" || response.type === "shi" || response.type === "xiang") {
    const need = ["jiang", "shi", "xiang"].filter((type) => type !== response.type);
    // findByFace ensures we get at most ONE card of each needed type
    pushIfAll(need.map((type) => findByFace(hand, response.color, type as Card["type"])));
  }

  // 三异色卒/四异色卒: Must have different colors for each zu
  if (response.type === "zu") {
    const colors: Card["color"][] = ["yellow", "red", "green", "white"];
    const others = colors.filter((color) => color !== response.color);
    const available = others
      .map((color) => findByFace(hand, color, "zu"))
      .filter(Boolean) as Card[];

    // Generate all valid 3-zu combinations (response + 2 from hand)
    for (let i = 0; i < available.length; i += 1) {
      for (let j = i + 1; j < available.length; j += 1) {
        groups.push([available[i], available[j]]);
      }
    }
    // If we have all 3 other colors, we can also form 4-zu (response + 3 from hand)
    if (available.length === 3) {
      groups.push([...available]);
    }
  }

  return groups;
}

export function canEat(hand: Card[], response: Card): boolean {
  return getEatCandidates(hand, response).length > 0;
}
