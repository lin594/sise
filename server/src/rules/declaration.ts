import { countHiddenKans } from "./declared-kans.js";
import type { Card } from "./types.js";

function validateFishSelection(cards: Card[]): boolean {
  if (!cards.length) return true;

  let goldCount = 0;
  const nonGoldFaceCount = new Map<string, number>();
  for (const card of cards) {
    if (card.color === "gold") {
      goldCount += 1;
      continue;
    }
    const key = `${card.color}:${card.type}`;
    nonGoldFaceCount.set(key, (nonGoldFaceCount.get(key) ?? 0) + 1);
  }
  for (const count of nonGoldFaceCount.values()) {
    if (count !== 4) return false;
  }
  return goldCount === 0 || goldCount === 4 || goldCount === 5;
}

export function buildFishGroupSizes(cards: Card[]): number[] {
  const nonGold = new Map<string, number>();
  let goldCount = 0;
  for (const card of cards) {
    if (card.color === "gold") {
      goldCount += 1;
      continue;
    }
    const key = `${card.color}:${card.type}`;
    nonGold.set(key, (nonGold.get(key) ?? 0) + 1);
  }
  const sizes: number[] = [...nonGold.values()].filter((count) => count === 4);
  if (goldCount === 4 || goldCount === 5) sizes.push(goldCount);
  return sizes;
}

function pickCardsByIdsFromHand(hand: Card[], ids: string[]): Card[] {
  const wanted = new Set(ids);
  return hand.filter((card) => wanted.has(card.id));
}

function buildDefaultFishCards(hand: Card[]): Card[] {
  const byFace = new Map<string, Card[]>();
  const goldCards: Card[] = [];
  for (const card of hand) {
    if (card.color === "gold") {
      goldCards.push(card);
      continue;
    }
    const key = `${card.color}:${card.type}`;
    const list = byFace.get(key) ?? [];
    list.push(card);
    byFace.set(key, list);
  }

  const selected: Card[] = [];
  for (const cards of byFace.values()) {
    if (cards.length >= 4) selected.push(...cards.slice(0, 4));
  }
  if (goldCards.length >= 5) selected.push(...goldCards.slice(0, 5));
  else if (goldCards.length >= 4) selected.push(...goldCards.slice(0, 4));
  return selected;
}

export interface DeclarationSelection {
  declaredKongs: number;
  selectedCards: Card[];
  fishGroupSizes: number[];
  idMatch: boolean;
  fishValid: boolean;
}

export function buildDeclarationSelection(
  hand: Card[],
  payload: { declaredKongs?: number; fishCardIds?: string[] },
): DeclarationSelection {
  const fishIds = Array.isArray(payload?.fishCardIds) ? payload.fishCardIds.map(String).filter(Boolean) : [];
  const uniqueFishIds = [...new Set(fishIds)];
  const selectedCards = pickCardsByIdsFromHand(hand, uniqueFishIds);
  const idMatch = uniqueFishIds.length === selectedCards.length;
  const fishValid = validateFishSelection(selectedCards);
  const selectedIds = new Set(selectedCards.map((card) => card.id));
  const remainingAfterFish = hand.filter((card) => !selectedIds.has(card.id));
  const maxKongs = countHiddenKans(remainingAfterFish);
  const declaredKongs = Math.min(Math.max(0, Number(payload?.declaredKongs) || 0), maxKongs);
  return {
    declaredKongs,
    selectedCards,
    fishGroupSizes: fishValid ? buildFishGroupSizes(selectedCards) : [],
    idMatch,
    fishValid,
  };
}

export function buildDefaultDeclarationPayload(hand: Card[]): { declaredKongs: number; fishCardIds: string[] } {
  const selectedCards = buildDefaultFishCards(hand);
  const selectedIds = new Set(selectedCards.map((card) => card.id));
  const declaredKongs = countHiddenKans(hand.filter((card) => !selectedIds.has(card.id)));
  return { declaredKongs, fishCardIds: selectedCards.map((card) => card.id) };
}
