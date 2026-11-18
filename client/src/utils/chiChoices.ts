import type { ActionCandidate, Card } from "@/types/game";

export interface ChiChoice {
  key: string;
  name: string;
  candidate: ActionCandidate;
  cards: Card[];
  selected: boolean;
}

const names: Record<string, string> = {
  jmp: "车马炮", jsx: "将士相", zu3: "三色卒", zu4: "四色卒", pair: "对子", single: "单吃",
};

/** A face-level option can represent several legal sets of physical copies. */
export function chiChoices(
  candidates: ActionCandidate[], hand: Card[], selectedIds: string[],
): ChiChoice[] {
  const byId = new Map(hand.map(card => [card.id, card]));
  const selected = new Set(selectedIds);
  const groups = new Map<string, { choice: ChiChoice; overlap: number }>();
  for (const candidate of candidates) {
    const cards = candidate.cardIds.flatMap(id => byId.get(id) ?? []);
    if (cards.length !== candidate.cardIds.length) continue;
    const faces = cards.map(card => `${card.color}:${card.type}`).sort().join("|");
    const key = `${candidate.kind}|${faces}`;
    const overlap = candidate.cardIds.filter(id => selected.has(id)).length;
    const previous = groups.get(key);
    if (previous && (previous.overlap > overlap ||
        (previous.overlap === overlap && previous.choice.candidate.id <= candidate.id))) continue;
    groups.set(key, { overlap, choice: {
      key, candidate, cards, name: names[candidate.kind ?? ""] ?? candidate.title,
      selected: selected.size === cards.length && overlap === cards.length,
    } });
  }
  return Array.from(groups.values(), group => group.choice);
}
