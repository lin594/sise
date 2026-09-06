import { createDeck, isDiscardRestricted } from '../../rules/deck.js';
import { validateHu } from '../../rules/hu.js';
import type { Card } from '../../rules/types.js';

export interface ListeningWait { card: Card; visibleRemaining: number }
export interface ListeningRoute { discardCardId: string; waits: ListeningWait[] }
export interface ListeningHints {
  stateRevision: number;
  decisionKey: string;
  currentWaits: ListeningWait[];
  discards: ListeningRoute[];
  chi: Array<{ candidateId: string; discards: ListeningRoute[] }>;
}
// Synthetic faces only: never inspect the live deck or another player's hand.
const faces = createDeck().filter((card) => card.id.endsWith('_01'))
  .map((card) => ({ ...card, id: `hint-${card.color}-${card.type}` }));
const faceTotals = createDeck().reduce((totals, card) => {
  const key = `${card.color}:${card.type}`;
  totals.set(key, (totals.get(key) ?? 0) + 1);
  return totals;
}, new Map<string, number>());

export function buildVisibleRemainingByFace(
  knownCards: Array<{ id: string; color: string; type: string }>,
): Map<string, number> {
  const visibleCounts = new Map<string, number>();
  const seenIds = new Set<string>();
  for (const card of knownCards) {
    if (!card.id || seenIds.has(card.id)) continue;
    seenIds.add(card.id);
    const key = `${card.color}:${card.type}`;
    visibleCounts.set(key, (visibleCounts.get(key) ?? 0) + 1);
  }
  return new Map(
    [...faceTotals].map(([key, total]) => [key, Math.max(0, total - (visibleCounts.get(key) ?? 0))]),
  );
}

export function findListeningDiscards(
  hand: Card[],
  minimumHiddenTriplets = 0,
  visibleRemainingByFace: ReadonlyMap<string, number> = faceTotals,
): ListeningRoute[] {
  const byFace = new Map<string, Card[]>();
  const routes: ListeningRoute[] = [];
  for (const discard of hand) {
    if (isDiscardRestricted(discard)) continue;
    const key = `${discard.color}:${discard.type}`;
    let waits = byFace.get(key);
    if (!waits) {
      const remaining = hand.filter((card) => card.id !== discard.id);
      waits = faces.filter((response) => validateHu(remaining, response, { minimumHiddenTriplets }));
      byFace.set(key, waits);
    }
    if (waits.length) {
      routes.push({
        discardCardId: discard.id,
        waits: waits.map((card) => ({
          card,
          visibleRemaining: Math.max(0, visibleRemainingByFace.get(`${card.color}:${card.type}`) ?? 0),
        })),
      });
    }
  }
  return routes;
}

export function findCurrentListeningWaits(
  hand: Card[],
  minimumHiddenTriplets = 0,
  visibleRemainingByFace: ReadonlyMap<string, number> = faceTotals,
): ListeningWait[] {
  return faces
    .filter((response) => validateHu(hand, response, { minimumHiddenTriplets }))
    .map((card) => ({
      card,
      visibleRemaining: Math.max(0, visibleRemainingByFace.get(`${card.color}:${card.type}`) ?? 0),
    }));
}
