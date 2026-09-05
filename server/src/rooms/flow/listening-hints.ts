import { createDeck, isDiscardRestricted } from '../../rules/deck.js';
import { validateHu } from '../../rules/hu.js';
import type { Card } from '../../rules/types.js';

export interface ListeningRoute { discardCardId: string; waits: Card[] }
export interface ListeningHints {
  stateRevision: number;
  decisionKey: string;
  discards: ListeningRoute[];
  chi: Array<{ candidateId: string; discards: ListeningRoute[] }>;
}
// Synthetic faces only: never inspect the live deck or another player's hand.
const faces = createDeck().filter((card) => card.id.endsWith('_01'))
  .map((card) => ({ ...card, id: `hint-${card.color}-${card.type}` }));
export function findListeningDiscards(hand: Card[], minimumHiddenTriplets = 0): ListeningRoute[] {
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
    if (waits.length) routes.push({ discardCardId: discard.id, waits });
  }
  return routes;
}
