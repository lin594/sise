import { isGeneral, isGold, isSameFace } from "./deck.js";
import type { Card } from "./types.js";

type FaceNeed = {
  color: Card["color"];
  type: Card["type"];
};

type CardRef = {
  card: Card;
  from: "hand" | "pool";
};

export interface ConsumePlan {
  handCards: Card[];
  poolCards: Card[];
  wildcardFromHand: Card[];
  wildcardFromPool: Card[];
}

export interface KaiPlan extends ConsumePlan {
  kind: "regular" | "gold";
}

export interface ChiPlan extends ConsumePlan {
  kind: "jmp" | "jsx" | "zu3" | "zu4" | "pair";
}

function isWildcard(card: Card): boolean {
  return isGeneral(card) || isGold(card);
}

function splitPlan(refs: CardRef[]): ConsumePlan {
  const handCards = refs.filter((x) => x.from === "hand").map((x) => x.card);
  const poolCards = refs.filter((x) => x.from === "pool").map((x) => x.card);
  return {
    handCards,
    poolCards,
    wildcardFromHand: handCards.filter(isWildcard),
    wildcardFromPool: poolCards.filter(isWildcard),
  };
}

function collectRefs(hand: Card[], wildcardPool: Card[]): CardRef[] {
  return [
    ...hand.map((card) => ({ card, from: "hand" as const })),
    ...wildcardPool.map((card) => ({ card, from: "pool" as const })),
  ];
}

function countMatching(cards: Card[], target: Card): number {
  return cards.filter((card) => isSameFace(card, target)).length;
}

function removeRefById(refs: CardRef[], cardId: string): CardRef[] {
  let removed = false;
  return refs.filter((ref) => {
    if (removed) {
      return true;
    }
    if (ref.card.id !== cardId) {
      return true;
    }
    removed = true;
    return false;
  });
}

function pickExact(
  refs: CardRef[],
  need: FaceNeed,
): { picked: CardRef | null; rest: CardRef[] } {
  const picked = refs.find((ref) => ref.card.color === need.color && ref.card.type === need.type) ?? null;
  if (!picked) {
    return { picked: null, rest: refs };
  }
  return { picked, rest: removeRefById(refs, picked.card.id) };
}

function pickWildcard(refs: CardRef[]): { picked: CardRef | null; rest: CardRef[] } {
  const picked = refs.find((ref) => isWildcard(ref.card)) ?? null;
  if (!picked) {
    return { picked: null, rest: refs };
  }
  return { picked, rest: removeRefById(refs, picked.card.id) };
}

function buildConsumePlan(requirements: FaceNeed[], hand: Card[], wildcardPool: Card[]): ConsumePlan | null {
  let refs = collectRefs(hand, wildcardPool);
  const picked: CardRef[] = [];

  for (const need of requirements) {
    const exact = pickExact(refs, need);
    if (exact.picked) {
      picked.push(exact.picked);
      refs = exact.rest;
      continue;
    }
    const wildcard = pickWildcard(refs);
    if (!wildcard.picked) {
      return null;
    }
    picked.push(wildcard.picked);
    refs = wildcard.rest;
  }

  return splitPlan(picked);
}

export function canPeng(hand: Card[], response: Card): boolean {
  if (isGeneral(response)) {
    return false;
  }
  return countMatching(hand, response) >= 2;
}

export function findKaiPlan(hand: Card[], response: Card, wildcardPool: Card[] = []): KaiPlan | null {
  const all = collectRefs(hand, wildcardPool);

  if (isGold(response)) {
    const goldRefs = all.filter((x) => isGold(x.card)).slice(0, 3);
    if (goldRefs.length < 3) {
      return null;
    }
    return { kind: "gold", ...splitPlan(goldRefs) };
  }

  const sameRefs = all.filter((x) => isSameFace(x.card, response));
  if (sameRefs.length >= 3) {
    return { kind: "regular", ...splitPlan(sameRefs.slice(0, 3)) };
  }

  if (sameRefs.length >= 2) {
    const sameIds = new Set(sameRefs.slice(0, 2).map((x) => x.card.id));
    const rest = all.filter((x) => !sameIds.has(x.card.id));
    const wildcard = rest.find((x) => isWildcard(x.card));
    if (wildcard) {
      return { kind: "regular", ...splitPlan([...sameRefs.slice(0, 2), wildcard]) };
    }
  }

  return null;
}

export function canKai(hand: Card[], response: Card, wildcardPool: Card[] = []): boolean {
  return Boolean(findKaiPlan(hand, response, wildcardPool));
}

function chiRequirements(response: Card): Array<{ kind: ChiPlan["kind"]; needs: FaceNeed[] }> {
  if (isGold(response)) {
    return [];
  }

  const list: Array<{ kind: ChiPlan["kind"]; needs: FaceNeed[] }> = [];

  if (response.type === "ju" || response.type === "ma" || response.type === "pao") {
    const need = (["ju", "ma", "pao"] as const)
      .filter((type) => type !== response.type)
      .map((type) => ({ color: response.color, type }));
    list.push({ kind: "jmp", needs: need });
  }

  if (response.type === "jiang" || response.type === "shi" || response.type === "xiang") {
    const need = (["jiang", "shi", "xiang"] as const)
      .filter((type) => type !== response.type)
      .map((type) => ({ color: response.color, type }));
    list.push({ kind: "jsx", needs: need });
  }

  if (response.type === "zu") {
    const colors = (["yellow", "red", "green", "white"] as const).filter((color) => color !== response.color);

    for (let i = 0; i < colors.length; i += 1) {
      for (let j = i + 1; j < colors.length; j += 1) {
        list.push({
          kind: "zu3",
          needs: [
            { color: colors[i], type: "zu" },
            { color: colors[j], type: "zu" },
          ],
        });
      }
    }

    list.push({
      kind: "zu4",
      needs: colors.map((color) => ({ color, type: "zu" })),
    });
  }

  list.push({
    kind: "pair",
    needs: [{ color: response.color, type: response.type }],
  });

  return list;
}

export function getChiPlans(hand: Card[], response: Card, wildcardPool: Card[] = []): ChiPlan[] {
  const plans: ChiPlan[] = [];
  const seen = new Set<string>();

  for (const item of chiRequirements(response)) {
    const consume = buildConsumePlan(item.needs, hand, wildcardPool);
    if (!consume) {
      continue;
    }
    const fp = [
      item.kind,
      ...consume.handCards.map((c) => c.id),
      ...consume.poolCards.map((c) => c.id),
    ]
      .sort()
      .join("|");
    if (seen.has(fp)) {
      continue;
    }
    seen.add(fp);
    plans.push({ kind: item.kind, ...consume });
  }

  return plans;
}

export function canChi(hand: Card[], response: Card, wildcardPool: Card[] = []): boolean {
  return getChiPlans(hand, response, wildcardPool).length > 0;
}

// Legacy compatibility for current room logic during migration.
export function canOpen(hand: Card[], response: Card): boolean {
  return canKai(hand, response, []);
}

// Legacy compatibility for current room logic during migration.
export function getEatCandidates(hand: Card[], response: Card): Card[][] {
  return getChiPlans(hand, response, [])
    .map((plan) => plan.handCards)
    .filter((cards) => cards.length > 0);
}

// Legacy compatibility for current room logic during migration.
export function canEat(hand: Card[], response: Card): boolean {
  return canChi(hand, response, []);
}
