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

export interface PengPlan {
  kind: "hand" | "reusable_pair";
  handCards: Card[];
  pairCards: Card[];
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

function combinations<T>(list: T[], pick: number): T[][] {
  if (pick <= 0) {
    return [[]];
  }
  if (list.length < pick) {
    return [];
  }
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length === pick) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < list.length; i += 1) {
      acc.push(list[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
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

function buildConsumePlan(
  requirements: FaceNeed[],
  hand: Card[],
  wildcardPool: Card[],
  maxWildcardUse = Number.MAX_SAFE_INTEGER,
): ConsumePlan | null {
  let refs = collectRefs(hand, wildcardPool);
  const picked: CardRef[] = [];
  let wildcardUsed = 0;

  for (const need of requirements) {
    const exact = pickExact(refs, need);
    if (exact.picked) {
      picked.push(exact.picked);
      refs = exact.rest;
      continue;
    }
    if (wildcardUsed >= maxWildcardUse) {
      return null;
    }
    const wildcard = pickWildcard(refs);
    if (!wildcard.picked) {
      return null;
    }
    picked.push(wildcard.picked);
    refs = wildcard.rest;
    wildcardUsed += 1;
  }

  return splitPlan(picked);
}

export function canPeng(hand: Card[], response: Card, pairCards: Card[] = []): boolean {
  if (isWildcard(response)) {
    return false;
  }
  return countMatching(hand, response) >= 2 || countMatching(pairCards, response) >= 2;
}

export function getKaiPlans(hand: Card[], response: Card, wildcardPool: Card[] = []): KaiPlan[] {
  const all = collectRefs(hand, wildcardPool);
  const plans: KaiPlan[] = [];
  const seen = new Set<string>();
  const pushPlan = (kind: KaiPlan["kind"], refs: CardRef[]) => {
    const consume = splitPlan(refs);
    const fingerprint = [kind, ...consume.handCards.map((x) => x.id), ...consume.poolCards.map((x) => x.id)]
      .sort()
      .join("|");
    if (seen.has(fingerprint)) {
      return;
    }
    seen.add(fingerprint);
    plans.push({ kind, ...consume });
  };

  if (isGold(response)) {
    const goldRefs = all.filter((x) => isGold(x.card));
    for (const picked of combinations(goldRefs, 3)) {
      pushPlan("gold", picked);
    }
    return plans;
  }

  const sameRefs = all.filter((x) => isSameFace(x.card, response));
  for (const picked of combinations(sameRefs, 3)) {
    pushPlan("regular", picked);
  }

  const wildcards = all.filter((x) => isWildcard(x.card));
  for (const exactTwo of combinations(sameRefs, 2)) {
    const used = new Set(exactTwo.map((x) => x.card.id));
    for (const wildcard of wildcards) {
      if (used.has(wildcard.card.id)) {
        continue;
      }
      pushPlan("regular", [...exactTwo, wildcard]);
    }
  }

  return plans;
}

export function findKaiPlan(hand: Card[], response: Card, wildcardPool: Card[] = []): KaiPlan | null {
  const plans = getKaiPlans(hand, response, wildcardPool);
  if (plans.length > 0) {
    return plans[0];
  }
  return null;
}

export function canKai(hand: Card[], response: Card, wildcardPool: Card[] = []): boolean {
  return getKaiPlans(hand, response, wildcardPool).length > 0;
}

export function getPengPlans(hand: Card[], response: Card, pairCards: Card[] = []): PengPlan[] {
  if (isWildcard(response)) {
    return [];
  }
  const plans: PengPlan[] = [];
  const seen = new Set<string>();
  const pushPlan = (kind: PengPlan["kind"], handPicked: Card[], pairPicked: Card[]) => {
    const fingerprint = [kind, ...handPicked.map((x) => x.id), ...pairPicked.map((x) => x.id)].sort().join("|");
    if (seen.has(fingerprint)) {
      return;
    }
    seen.add(fingerprint);
    plans.push({ kind, handCards: handPicked, pairCards: pairPicked });
  };

  const handMatches = hand.filter((card) => isSameFace(card, response));
  for (const picked of combinations(handMatches, 2)) {
    pushPlan("hand", picked, []);
  }

  const pairMatches = pairCards.filter((card) => isSameFace(card, response));
  for (const picked of combinations(pairMatches, 2)) {
    pushPlan("reusable_pair", [], picked);
  }

  return plans;
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

  if (response.type !== "jiang") {
    list.push({
      kind: "pair",
      needs: [{ color: response.color, type: response.type }],
    });
  }

  return list;
}

function buildPairConsumePlan(response: Card, hand: Card[]): ConsumePlan | null {
  const exactMatches = hand.filter((card) => card.color === response.color && card.type === response.type);
  if (exactMatches.length === 0) {
    return null;
  }
  // 当手里已有两张同目标牌时，pair 响应按“三张组合”执行，避免降级为两张对子。
  const consumeFromHand = exactMatches.length >= 2 ? exactMatches.slice(0, 2) : [exactMatches[0]];
  return {
    handCards: consumeFromHand,
    poolCards: [],
    wildcardFromHand: [],
    wildcardFromPool: [],
  };
}

export function getChiPlans(hand: Card[], response: Card, wildcardPool: Card[] = []): ChiPlan[] {
  const plans: ChiPlan[] = [];
  const seen = new Set<string>();

  for (const item of chiRequirements(response)) {
    const consume =
      item.kind === "pair"
        ? buildPairConsumePlan(response, hand)
        : buildConsumePlan(item.needs, hand, wildcardPool, 1);
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
