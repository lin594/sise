import { createDeck } from "../rules/deck.js";
import type { Card } from "../rules/types.js";

export const TUTORIAL_STEPS = ["intro", "grab", "eat", "discard_chi", "peng", "discard_peng", "hu", "complete", "retry"] as const;
export type TutorialStep = typeof TUTORIAL_STEPS[number];
export interface TutorialProgress { seatId: string; step: TutorialStep }
export function isTutorialProgress(value: unknown): value is TutorialProgress {
  if (!value || typeof value !== "object") return false;
  const p = value as TutorialProgress;
  return typeof p.seatId === "string" && p.seatId.length <= 128 && TUTORIAL_STEPS.includes(p.step);
}

/** Production teaching fixture. Physical cards are removed exactly once from a full deck. */
export function createTutorialDeal() {
  const remaining = createDeck();
  const take = (id: string): Card => {
    const index = remaining.findIndex(card => card.id === id);
    if (index < 0) throw new Error("invalid built-in tutorial card");
    return remaining.splice(index, 1)[0]!;
  };
  const hand = ["red_ju_01", "red_ma_01", "green_ma_01", "green_ma_02", "yellow_ju_01", "yellow_ma_01", "white_shi_01", "white_pao_01"].map(take);
  const opponents = ["yellow_jiang_01", "green_jiang_01", "white_jiang_01"].map(take);
  const upper = take("white_zu_01");
  const draws = ["red_pao_01", "green_ma_03", "yellow_pao_01"].map(take);
  return { hand, opponents, upper, deck: [...draws, ...remaining] };
}

export function advanceTutorial(step: TutorialStep, action: string, cardId?: string): TutorialStep {
  if (step === "complete" || step === "retry") return step;
  if ((step === "intro" || step === "grab") && action === "pass") return "eat";
  if (step === "eat" && action === "chi") return "discard_chi";
  if (step === "discard_chi" && action === "discard" && cardId === "white_shi_01") return "peng";
  if (step === "peng" && action === "peng") return "discard_peng";
  if (step === "discard_peng" && action === "discard" && cardId === "white_pao_01") return "hu";
  if (step === "hu" && action === "hu") return "hu"; // Completion requires authoritative settlement.
  return "retry";
}
