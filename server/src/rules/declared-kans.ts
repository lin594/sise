import type { Card } from "./types.js";
import { isDiscardRestricted } from "./deck.js";

/** Gold faces share one kan family; four unexposed matching cards contain one kan. */
export function countHiddenKans(cards: readonly Card[]): number {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = card.color === "gold" ? "gold" : `${card.color}:${card.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.floor(count / 3), 0);
}

/** remainingDeclaredKans already excludes successful kan-to-kai conversions. */
export function canDiscardPreservingKans(hand: readonly Card[], cardId: string, remainingDeclaredKans: number): boolean {
  const index = hand.findIndex((card) => card.id === cardId);
  return index >= 0 && !isDiscardRestricted(hand[index]) &&
    countHiddenKans(hand.filter((_, i) => i !== index)) >= Math.max(0, remainingDeclaredKans);
}
