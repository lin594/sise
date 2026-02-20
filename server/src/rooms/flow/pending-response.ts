import type { ActionType, Card } from "../../rules/types.js";

export interface PendingResponseSnapshot {
  ownerId: string;
  card: Card;
  collectives: Map<string, ActionType>;
}

export function createPendingResponse(
  ownerId: string,
  card: Card,
  source: "upper" | "draw",
): PendingResponseSnapshot {
  return {
    ownerId,
    card: { ...card, source },
    collectives: new Map(),
  };
}
