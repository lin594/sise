import { getChiPlans, getKaiPlans, getPengPlans, type ChiPlan, type KaiPlan, type PengPlan } from "../../rules/actions.js";
import type { Card } from "../../rules/types.js";

export type MeldActionType = "kai" | "peng" | "chi";
export type ActionCandidateSource = "hand" | "hand+pool";

export interface ActionCandidate {
  id: string;
  action: MeldActionType;
  kind?: string;
  cardIds: string[];
  source: ActionCandidateSource;
  title: string;
}

export interface CandidateWithPlan<TPlan> {
  candidate: ActionCandidate;
  plan: TPlan;
}

function stableIds(cards: Card[]): string[] {
  return cards.map((card) => card.id).sort((a, b) => a.localeCompare(b));
}

function makeCandidateId(
  action: MeldActionType,
  kind: string,
  source: ActionCandidateSource,
  handIds: string[],
  extraIds: string[],
): string {
  return `${action}|${kind}|${source}|h:${[...handIds].sort().join(",")}|e:${[...extraIds].sort().join(",")}`;
}

export function buildKaiCandidates(hand: Card[], response: Card, wildcardPool: Card[]): Array<CandidateWithPlan<KaiPlan>> {
  return getKaiPlans(hand, response, wildcardPool).map((plan) => {
    const source: ActionCandidateSource = plan.poolCards.length > 0 ? "hand+pool" : "hand";
    const handIds = stableIds(plan.handCards);
    const poolIds = stableIds(plan.poolCards);
    const kindLabel = plan.kind === "gold" ? "金条开" : "开";
    return {
      candidate: {
        id: makeCandidateId("kai", plan.kind, source, handIds, poolIds),
        action: "kai",
        kind: plan.kind,
        cardIds: handIds,
        source,
        title: `${kindLabel}（${plan.handCards.length + plan.poolCards.length + 1}张）`,
      },
      plan,
    };
  });
}

export function buildPengCandidates(
  hand: Card[],
  response: Card,
): Array<CandidateWithPlan<PengPlan>> {
  return getPengPlans(hand, response).map((plan) => {
    const source: ActionCandidateSource = "hand";
    const handIds = stableIds(plan.handCards);
    return {
      candidate: {
        id: makeCandidateId("peng", plan.kind, source, handIds, []),
        action: "peng",
        kind: plan.kind,
        cardIds: handIds,
        source,
        title: "碰",
      },
      plan,
    };
  });
}

function chiKindLabel(kind: ChiPlan["kind"], response: Card): string {
  if (kind === "jmp") {
    return "吃（车马炮）";
  }
  if (kind === "jsx") {
    return "吃（将士相）";
  }
  if (kind === "zu3") {
    return "吃（三卒）";
  }
  if (kind === "zu4") {
    return "吃（四色卒）";
  }
  if (kind === "single") {
    return response.color === "gold" ? "吃（单金条）" : "吃（单将）";
  }
  return "吃（对子）";
}

export function buildChiCandidates(hand: Card[], response: Card, wildcardPool: Card[]): Array<CandidateWithPlan<ChiPlan>> {
  return getChiPlans(hand, response, wildcardPool).map((plan) => {
    const source: ActionCandidateSource = plan.poolCards.length > 0 ? "hand+pool" : "hand";
    const handIds = stableIds(plan.handCards);
    const poolIds = stableIds(plan.poolCards);
    return {
      candidate: {
        id: makeCandidateId("chi", plan.kind, source, handIds, poolIds),
        action: "chi",
        kind: plan.kind,
        cardIds: handIds,
        source,
        title: chiKindLabel(plan.kind, response),
      },
      plan,
    };
  });
}
