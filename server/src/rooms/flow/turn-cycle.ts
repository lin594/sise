import type { Card } from "../../rules/types.js";

export function normalizeDiscardCardId(payload: { cardId?: string } | string): string {
  return typeof payload === "string" ? payload : String(payload?.cardId ?? "");
}

export interface DiscardRequestInput {
  hasPending: boolean;
  phase: string;
  pendingOwnerId: string;
  seatId: string;
  awaitingDiscardOwnerId: string | null;
  responsePhase: "collective" | "local_upper" | "local_draw";
}

export function canAcceptDiscardRequest(input: DiscardRequestInput): boolean {
  if (!input.hasPending || input.phase !== "playing") {
    return false;
  }
  if (input.pendingOwnerId !== input.seatId) {
    return false;
  }
  if (input.awaitingDiscardOwnerId !== input.seatId) {
    return false;
  }
  if (input.responsePhase === "collective") {
    return false;
  }
  return true;
}

export function pickFallbackDiscard(hand: Card[], isDiscardRestricted: (card: Card) => boolean): Card | null {
  return hand.find((card) => !isDiscardRestricted(card)) ?? null;
}
