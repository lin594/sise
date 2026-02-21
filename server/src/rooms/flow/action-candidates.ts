import { getChiPlans, getKaiPlans, getPengPlans, type ChiPlan, type KaiPlan, type PengPlan } from "../../rules/actions.js";
import type { Card } from "../../rules/types.js";

export type MeldActionType = "kai" | "peng" | "chi";
export type ActionCandidateSource = "hand" | "hand+pool" | "reusable_pair";

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
  reusablePairCards: Card[],
): Array<CandidateWithPlan<PengPlan>> {
  return getPengPlans(hand, response, reusablePairCards).map((plan) => {
    const source: ActionCandidateSource = plan.kind === "reusable_pair" ? "reusable_pair" : "hand";
    const handIds = stableIds(plan.handCards);
    const pairIds = stableIds(plan.pairCards);
    return {
      candidate: {
        id: makeCandidateId("peng", plan.kind, source, handIds, pairIds),
        action: "peng",
        kind: plan.kind,
        cardIds: source === "reusable_pair" ? pairIds : handIds,
        source,
        title: source === "reusable_pair" ? "碰（对子升级）" : "碰",
      },
      plan,
    };
  });
}

function chiKindLabel(kind: ChiPlan["kind"]): string {
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
        title: chiKindLabel(plan.kind),
      },
      plan,
    };
  });
}
