import { findKaiPlan } from "../../../rules/actions.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getWildcardPoolCards: (seatId: SeatId) => Card[];
  consumePlanCards: (seatId: SeatId, handCards: Card[], poolCards: Card[]) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean) => void;
}

export function tryExecuteKai(
  deps: OperationDeps,
  seatId: SeatId,
  pendingCard: Card,
): boolean {
  const hand = deps.getHandWithoutPending(seatId, pendingCard);
  const plan = findKaiPlan(hand, pendingCard, deps.getWildcardPoolCards(seatId));
  if (!plan) {
    return false;
  }
  const taken = deps.consumePlanCards(seatId, plan.handCards, plan.poolCards);
  deps.pushExposedGroup(seatId, [pendingCard, ...taken], true);
  return true;
}

interface ActionDeps {
  executeKaiOperation: (seatId: SeatId, pendingCard: Card) => boolean;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  setLastAction: (action: string) => void;
  startTurn: (ownerId: SeatId, tag: string) => void;
}

interface PendingLike {
  ownerId: SeatId;
  card: Card;
}

export function executeKaiAction(
  deps: ActionDeps,
  pending: PendingLike,
  winnerId: SeatId,
): void {
  const response = pending.card;
  if (!deps.executeKaiOperation(winnerId, response)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  deps.setLastAction(`${winnerId} KAI`);
  deps.startTurn(winnerId, "KONG_DRAW");
}
