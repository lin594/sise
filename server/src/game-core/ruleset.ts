import { getChiPlans, getKaiPlans, getPengPlans } from "../rules/actions.js";
import { canDiscardPreservingKans } from "../rules/declared-kans.js";
import { createDeck, isDiscardRestricted, shuffle } from "../rules/deck.js";
import { explainHand, explainHu, type HuExplainOptions } from "../rules/hu.js";
import {
  buildDeclarationSelection,
  buildDefaultDeclarationPayload,
  type DeclarationSelection,
} from "../rules/declaration.js";
import type { ActionType, Card, HuResult } from "../rules/types.js";
import {
  buildChiCandidates,
  buildKaiCandidates,
  buildPengCandidates,
  type ActionCandidate,
} from "../rooms/flow/action-candidates.js";
import { pickCollectiveWinner } from "../rooms/flow/support.js";
import { pickRandomDealerId, resolveDealerFromAnchorAndCard } from "../rooms/flow/support.js";

export interface RuleRef {
  id: string;
  version: string;
}

export const PUTIAN_STANDARD_RULE_ID = "putian-standard";
export const PUTIAN_V1_RULE_REF = Object.freeze({
  id: PUTIAN_STANDARD_RULE_ID,
  version: "1.0",
}) satisfies RuleRef;
export const PUTIAN_LEGACY_RULE_REF = Object.freeze({
  id: PUTIAN_STANDARD_RULE_ID,
  version: "legacy",
}) satisfies RuleRef;

export type RoundBootstrapSetup =
  | { mode: "picker"; pickerId: string }
  | { mode: "fixed"; dealerId: string };

export interface NextRoundInput {
  winnerId: string | null;
  huType: "small" | "big" | null;
  roundDealerId: string | null;
  playerOrder: string[];
  hasPlayer: (seatId: string) => boolean;
}

export interface ScoredRoundPlayer {
  totalScore: number;
  scoreBreakdown: Array<{ key: string; label: string; count: number; unit: number; total: number }>;
}

export interface RuleSet {
  readonly ref: RuleRef;
  readonly enforceDeclaredKans: boolean;
  collectivePriority(action: ActionType): number;
  createShuffledDeck(random?: () => number): Card[];
  isDiscardRestricted(card: Card): boolean;
  canDiscard(hand: readonly Card[], cardId: string, declaredKongs: number): boolean;
  buildKaiCandidates(hand: Card[], response: Card, wildcardPool: Card[]): ActionCandidate[];
  buildPengCandidates(hand: Card[], response: Card): ActionCandidate[];
  buildChiCandidates(hand: Card[], response: Card, wildcardPool: Card[]): ActionCandidate[];
  explainHu(hand: Card[], response: Card, options?: number | HuExplainOptions): HuResult;
  explainHand(hand: Card[]): HuResult;
  buildDefaultDeclarationPayload(hand: Card[]): { fishCardIds: string[]; declaredKongs: number };
  buildDeclarationSelection(
    hand: Card[],
    payload: { fishCardIds?: string[]; declaredKongs?: number },
  ): DeclarationSelection;
  pickInitialDealer(playerOrder: string[], random?: () => number): string;
  resolveDealer(playerOrder: string[], anchorSeatId: string, card: Card): string;
  pickCollectiveWinner(
    order: string[],
    collectives: Map<string, { action: ActionType; candidateId?: string }>,
  ): { id: string; choice: { action: ActionType; candidateId?: string } } | null;
  settleRound<T extends ScoredRoundPlayer>(players: T[]): T[];
  prepareNextRound(input: NextRoundInput): RoundBootstrapSetup | null;
}

function oppositeSeat(playerOrder: string[], seatId: string): string {
  const index = playerOrder.indexOf(seatId);
  if (index < 0 || playerOrder.length === 0) return playerOrder[0] ?? "";
  return playerOrder[(index + Math.floor(playerOrder.length / 2)) % playerOrder.length] ?? seatId;
}

export function createPutianRuleSet(
  ref: RuleRef,
  options: { enforceDeclaredKans: boolean; legacyDrawKeepsDealer: boolean },
): RuleSet {
  return {
    ref: Object.freeze({ ...ref }),
    enforceDeclaredKans: options.enforceDeclaredKans,
    collectivePriority: (action) => action === "hu" ? 2 : action === "kai" || action === "peng" ? 1 : 0,
    createShuffledDeck: (random = Math.random) => shuffle(createDeck(), random),
    isDiscardRestricted,
    canDiscard: (hand, cardId, declaredKongs) =>
      canDiscardPreservingKans(hand, cardId, options.enforceDeclaredKans ? declaredKongs : 0),
    buildKaiCandidates: (hand, response, wildcardPool) =>
      buildKaiCandidates(hand, response, wildcardPool).map((item) => item.candidate),
    buildPengCandidates: (hand, response) =>
      buildPengCandidates(hand, response).map((item) => item.candidate),
    buildChiCandidates: (hand, response, wildcardPool) =>
      buildChiCandidates(hand, response, wildcardPool).map((item) => item.candidate),
    explainHu,
    explainHand,
    buildDefaultDeclarationPayload,
    buildDeclarationSelection,
    pickInitialDealer: pickRandomDealerId,
    resolveDealer: resolveDealerFromAnchorAndCard,
    pickCollectiveWinner,
    settleRound: <T extends ScoredRoundPlayer>(players: T[]) => players.map((player) => ({
      ...player,
      scoreBreakdown: player.scoreBreakdown.map((item) => ({ ...item })),
    })),
    prepareNextRound: ({ winnerId, huType, roundDealerId, playerOrder, hasPlayer }) => {
      if (winnerId && huType === "small") return { mode: "fixed", dealerId: winnerId };
      if (winnerId && huType === "big") return { mode: "picker", pickerId: oppositeSeat(playerOrder, winnerId) };
      const dealerId = roundDealerId && hasPlayer(roundDealerId) ? roundDealerId : playerOrder[0];
      if (!dealerId) return null;
      return options.legacyDrawKeepsDealer
        ? { mode: "fixed", dealerId }
        : { mode: "picker", pickerId: oppositeSeat(playerOrder, dealerId) };
    },
  };
}

export function ruleRefKey(ref: RuleRef): string {
  return `${ref.id}@${ref.version}`;
}

export function isRuleRef(value: unknown): value is RuleRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RuleRef>;
  return typeof candidate.id === "string" && candidate.id.length > 0
    && typeof candidate.version === "string" && candidate.version.length > 0;
}

export class RuleSetRegistry {
  private readonly entries = new Map<string, RuleSet>();

  register(ruleSet: RuleSet): this {
    const key = ruleRefKey(ruleSet.ref);
    if (this.entries.has(key)) throw new Error(`duplicate ruleset: ${key}`);
    this.entries.set(key, ruleSet);
    return this;
  }

  resolve(ref: RuleRef): RuleSet {
    const ruleSet = this.entries.get(ruleRefKey(ref));
    if (!ruleSet) throw new Error(`unknown or incompatible ruleset: ${ruleRefKey(ref)}`);
    return ruleSet;
  }
}

export function createDefaultRuleSetRegistry(): RuleSetRegistry {
  return new RuleSetRegistry()
    .register(createPutianRuleSet(PUTIAN_V1_RULE_REF, {
      enforceDeclaredKans: true,
      legacyDrawKeepsDealer: false,
    }))
    .register(createPutianRuleSet(PUTIAN_LEGACY_RULE_REF, {
      enforceDeclaredKans: false,
      legacyDrawKeepsDealer: true,
    }));
}

export function ruleRefFromLegacyVersion(version: "legacy" | "1.0" | undefined): RuleRef {
  return version === "1.0" ? PUTIAN_V1_RULE_REF : PUTIAN_LEGACY_RULE_REF;
}

export function legacyVersionFromRuleRef(ref: RuleRef): "legacy" | "1.0" {
  if (ref.id !== PUTIAN_STANDARD_RULE_ID || (ref.version !== "legacy" && ref.version !== "1.0")) {
    throw new Error(`ruleset cannot be represented by legacy recovery field: ${ruleRefKey(ref)}`);
  }
  return ref.version;
}

// Keep plan-level primitives visible to future RuleSet implementations without
// forcing the session to depend on Putian-specific candidate details.
export const putianRulePrimitives = Object.freeze({ getChiPlans, getKaiPlans, getPengPlans });
