import { isDiscardRestricted } from "../rules/deck.js";
import { analyzeCardGrouping } from "../rules/hu.js";
import type { ActionType, Card } from "../rules/types.js";
import type { AvailableActionEntry } from "./flow/playing-flow.js";
import { buildVisibleRemainingByFace, findListeningDiscards } from "./flow/listening-hints.js";

export type RandomSource = () => number;

export interface BotDecision {
  action: ActionType;
  candidateId?: string;
}

export interface BotDecisionInput {
  hand: Card[];
  pendingCard: Card;
  actions: AvailableActionEntry[];
  visibleCards: Card[];
  strength: number;
  random?: RandomSource;
}

export interface BotDiscardInput {
  hand: Card[];
  visibleCards: Card[];
  declaredKongs?: number;
  strength: number;
  random?: RandomSource;
}

interface ScoredChoice<T> {
  choice: T;
  score: number;
}

function normalizedStrength(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50)) / 100;
}

function shapeUtility(cards: Card[]): number {
  const shape = analyzeCardGrouping(cards);
  return -12 * shape.leftoverCount + 2 * shape.groupedCount + shape.score;
}

function removeCardIds(cards: Card[], cardIds: string[]): Card[] {
  const wanted = new Set(cardIds);
  return cards.filter((card) => !wanted.has(card.id));
}

function visibleCopies(card: Card, visibleCards: Card[]): number {
  return visibleCards.filter((item) => item.color === card.color && item.type === card.type).length;
}

function publicDanger(card: Card, visibleCards: Card[]): number {
  if (card.color === "gold") {
    return 0;
  }
  return Math.max(0, 1 - Math.min(4, visibleCopies(card, visibleCards)) / 4);
}

function immediateActionValue(action: ActionType): number {
  if (action === "kai") return 8;
  if (action === "peng") return 4;
  if (action === "chi") return 2;
  return 0;
}

function sampleSoftmax<T>(items: ScoredChoice<T>[], strength: number, random: RandomSource): T {
  if (items.length === 1) {
    return items[0]!.choice;
  }
  const s = normalizedStrength(strength);
  const temperature = 1.2 - s;
  const scores = items.map((item) => item.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore;
  const weights = items.map((item) => {
    const normalized = range <= 0 ? 0.5 : (item.score - minScore) / range;
    return Math.exp(normalized / temperature);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.max(0, Math.min(0.999999999, random())) * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index] ?? 0;
    if (cursor <= 0) {
      return items[index]!.choice;
    }
  }
  return items[items.length - 1]!.choice;
}

export function chooseBotAction(input: BotDecisionInput): BotDecision {
  const hu = input.actions.find((item) => item.action === "hu" && item.enabled);
  if (hu) {
    return { action: "hu" };
  }

  const s = normalizedStrength(input.strength);
  const immediateWeight = 0.5 + 0.5 * s;
  const exposureWeight = 0.25 + 0.75 * s;
  const defenseWeight = 0.8 * s * s;
  const choices: Array<ScoredChoice<BotDecision>> = [];

  for (const entry of input.actions) {
    if (!entry.enabled || entry.action === "hu") {
      continue;
    }
    const candidates = entry.candidates?.length ? entry.candidates : [undefined];
    for (const candidate of candidates) {
      const consumedIds = candidate?.cardIds ?? [];
      const remaining = removeCardIds(input.hand, consumedIds);
      const exposureCost = consumedIds.length;
      const responseRisk = entry.action === "pass" ? publicDanger(input.pendingCard, input.visibleCards) : 0;
      const score =
        shapeUtility(remaining) +
        immediateActionValue(entry.action) * immediateWeight -
        exposureCost * exposureWeight -
        responseRisk * defenseWeight;
      choices.push({
        choice: { action: entry.action, candidateId: candidate?.id },
        score,
      });
    }
  }

  if (!choices.length) {
    return { action: "pass" };
  }
  let eligibleChoices = isDiscardRestricted(input.pendingCard)
    ? choices.filter((item) => item.choice.action === "chi")
    : choices;
  // Quality floor shared by configured bots and autoplay: when taking the
  // offered card can preserve an already complete same-colour group, do not
  // dismantle that group merely to eat and leave the duplicate behind.
  if (!isDiscardRestricted(input.pendingCard) && eligibleChoices.some((item) => item.choice.action === "pass")) {
    eligibleChoices = eligibleChoices.filter((item) => {
      if (item.choice.action !== "chi" || !item.choice.candidateId) return true;
      const entry = input.actions.find((action) => action.action === "chi");
      const candidate = entry?.candidates?.find((candidateItem) => candidateItem.id === item.choice.candidateId);
      if (!candidate?.cardIds.length) return true;
      const consumed = input.hand.filter((card) => candidate.cardIds.includes(card.id));
      const duplicate = input.hand.find((card) =>
        !candidate.cardIds.includes(card.id)
        && card.color === input.pendingCard.color
        && card.type === input.pendingCard.type,
      );
      return !duplicate || analyzeCardGrouping([...consumed, duplicate]).leftoverCount > 0;
    });
  }
  return sampleSoftmax(eligibleChoices.length ? eligibleChoices : choices, input.strength, input.random ?? Math.random);
}

export function chooseBotDiscard(input: BotDiscardInput): Card | null {
  const s = normalizedStrength(input.strength);
  const defenseWeight = 0.8 * s * s;
  let choices: Array<ScoredChoice<Card>> = input.hand
    .filter((card) => !isDiscardRestricted(card))
    .map((card) => ({
      choice: card,
      score:
        shapeUtility(input.hand.filter((item) => item.id !== card.id)) -
        publicDanger(card, input.visibleCards) * defenseWeight,
    }));
  if (!choices.length) {
    return null;
  }
  const visibleRemaining = buildVisibleRemainingByFace([...input.visibleCards, ...input.hand]);
  const listeningIds = new Set(
    findListeningDiscards(input.hand, input.declaredKongs ?? 0, visibleRemaining).map((route) => route.discardCardId),
  );
  if (listeningIds.size > 0) {
    choices = choices.filter((item) => listeningIds.has(item.choice.id));
  } else {
    const bestShape = Math.max(...choices.map((item) => shapeUtility(input.hand.filter((card) => card.id !== item.choice.id))));
    choices = choices.filter((item) =>
      shapeUtility(input.hand.filter((card) => card.id !== item.choice.id)) === bestShape,
    );
  }
  return sampleSoftmax(choices, input.strength, input.random ?? Math.random);
}

export function createSeededRandom(seed: number): RandomSource {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
