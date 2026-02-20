import { getChiPlans } from "../../../rules/actions.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getWildcardPoolCards: (seatId: SeatId) => Card[];
  consumePlanCards: (seatId: SeatId, handCards: Card[], poolCards: Card[]) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean) => void;
}

export function tryExecuteChi(
  deps: OperationDeps,
  seatId: SeatId,
  pendingCard: Card,
): boolean {
  const hand = deps.getHandWithoutPending(seatId, pendingCard);
  const plans = getChiPlans(hand, pendingCard, deps.getWildcardPoolCards(seatId));
  if (plans.length === 0) {
    return false;
  }
  const picked = plans[0];
  const taken = deps.consumePlanCards(seatId, picked.handCards, picked.poolCards);
  deps.pushExposedGroup(seatId, [pendingCard, ...taken], true);
  return true;
}

interface ActionDeps {
  isEatResponder: (ownerId: SeatId, responderId: SeatId) => boolean;
  executeChiOperation: (seatId: SeatId, pendingCard: Card) => boolean;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  startTurn: (ownerId: SeatId, tag: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
}

interface PendingLike {
  ownerId: SeatId;
  card: Card;
}

export function executeChiAction(
  deps: ActionDeps,
  pending: PendingLike,
  winnerId: SeatId,
): void {
  const response = pending.card;
  if (!deps.isEatResponder(pending.ownerId, winnerId)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  if (!deps.executeChiOperation(winnerId, response)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  deps.enterDiscardStage(winnerId, "CHI");
}
