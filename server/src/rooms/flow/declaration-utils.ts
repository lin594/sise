import type { Card } from "../../rules/types.js";
import type { PlayerState } from "../../schema/game-state.schema.js";

export function areAllDeclarationsReady(playerOrder: string[], getPlayer: (seatId: string) => PlayerState | undefined): boolean {
  return playerOrder.every((seatId) => getPlayer(seatId)?.declaredReady);
}

export function validateFishSelection(cards: Card[]): boolean {
  if (!cards.length) {
    return true;
  }

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
    if (count !== 4) {
      return false;
    }
  }

  return goldCount === 0 || goldCount === 4 || goldCount === 5;
}

export function pickCardsByIdsFromHand(hand: Card[], ids: string[]): Card[] {
  const wanted = new Set(ids);
  const selected: Card[] = [];
  for (const card of hand) {
    if (wanted.has(card.id)) {
      selected.push(card);
    }
  }
  return selected;
}

export interface DeclarationSelection {
  declaredKongs: number;
  selectedCards: Card[];
  idMatch: boolean;
  fishValid: boolean;
}

export function buildDeclarationSelection(hand: Card[], payload: { declaredKongs?: number; fishCardIds?: string[] }): DeclarationSelection {
  const declaredKongs = Math.max(0, Number(payload?.declaredKongs) || 0);
  const fishIds = Array.isArray(payload?.fishCardIds) ? payload.fishCardIds.map(String).filter(Boolean) : [];
  const uniqueFishIds = [...new Set(fishIds)];
  const selectedCards = pickCardsByIdsFromHand(hand, uniqueFishIds);
  const idMatch = uniqueFishIds.length === selectedCards.length;
  const fishValid = validateFishSelection(selectedCards);
  return {
    declaredKongs,
    selectedCards,
    idMatch,
    fishValid,
  };
}
