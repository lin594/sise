import { isGold, isSameFace } from "./deck.js";
import type { Card } from "./types.js";

type FaceNeed = {
  color: Card["color"];
  type: Card["type"];
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
  kind: "jmp" | "jsx" | "zu3" | "zu4" | "pair" | "single";
}

export interface PengPlan {
  kind: "hand";
  handCards: Card[];
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

function buildConsumePlan(
  requirements: FaceNeed[],
  hand: Card[],
  _wildcardPool: Card[],
): ConsumePlan | null {
  const picked: Card[] = [];
  const consumed = new Set<string>();

  for (const need of requirements) {
    const exact = hand.find(
      (card) => !consumed.has(card.id) && card.color === need.color && card.type === need.type,
    );
    if (exact) {
      picked.push(exact);
      consumed.add(exact.id);
      continue;
    }
    return null;
  }

  return {
    handCards: picked,
    poolCards: [],
    wildcardFromHand: [],
    wildcardFromPool: [],
  };
}

export function canPeng(hand: Card[], response: Card): boolean {
  if (response.type === "jiang" || isGold(response)) {
    return false;
  }
  return countMatching(hand, response) >= 2;
}

export function getKaiPlans(hand: Card[], response: Card, wildcardPool: Card[] = []): KaiPlan[] {
  const plans: KaiPlan[] = [];
  const seen = new Set<string>();
  const pushPlan = (kind: KaiPlan["kind"], cards: Card[]) => {
    const consume: ConsumePlan = {
      handCards: cards,
      poolCards: [],
      wildcardFromHand: [],
      wildcardFromPool: [],
    };
    const fingerprint = [kind, ...consume.handCards.map((x) => x.id)]
      .sort()
      .join("|");
    if (seen.has(fingerprint)) {
      return;
    }
    seen.add(fingerprint);
    plans.push({ kind, ...consume });
  };

  if (isGold(response)) {
    const goldCards = hand.filter((x) => isGold(x));
    for (const picked of combinations(goldCards, 3)) {
      pushPlan("gold", picked);
    }
    return plans;
  }

  const sameRefs = hand.filter((x) => isSameFace(x, response));
  for (const picked of combinations(sameRefs, 3)) {
    pushPlan("regular", picked);
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

export function getPengPlans(hand: Card[], response: Card): PengPlan[] {
  if (response.type === "jiang" || isGold(response)) {
    return [];
  }
  const plans: PengPlan[] = [];
  const seen = new Set<string>();
  const pushPlan = (kind: PengPlan["kind"], handPicked: Card[]) => {
    const fingerprint = [kind, ...handPicked.map((x) => x.id)].sort().join("|");
    if (seen.has(fingerprint)) {
      return;
    }
    seen.add(fingerprint);
    plans.push({ kind, handCards: handPicked });
  };

  const handMatches = hand.filter((card) => isSameFace(card, response));
  for (const picked of combinations(handMatches, 2)) {
    pushPlan("hand", picked);
  }

  return plans;
}

function chiRequirements(response: Card): Array<{ kind: ChiPlan["kind"]; needs: FaceNeed[] }> {
  if (isGold(response)) {
    return [{ kind: "single", needs: [] }];
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

  if (response.type === "jiang") {
    list.push({ kind: "single", needs: [] });
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
        : buildConsumePlan(item.needs, hand, wildcardPool);
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
