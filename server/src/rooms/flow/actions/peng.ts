import { canPeng } from "../../../rules/actions.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  removeFromHand: (seatId: SeatId, card: Card) => void;
  takeMatchingCards: (seatId: SeatId, target: Card, count: number) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean) => void;
}

export function tryExecutePeng(
  deps: OperationDeps,
  seatId: SeatId,
  pendingCard: Card,
): boolean {
  const hand = deps.getHandWithoutPending(seatId, pendingCard);
  if (!canPeng(hand, pendingCard)) {
    return false;
  }
  deps.removeFromHand(seatId, pendingCard);
  const taken = deps.takeMatchingCards(seatId, pendingCard, 2);
  deps.pushExposedGroup(seatId, [pendingCard, ...taken], true);
  return true;
}

interface ActionDeps {
  executePengOperation: (seatId: SeatId, pendingCard: Card) => boolean;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  startTurn: (ownerId: SeatId, tag: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
}

interface PendingLike {
  ownerId: SeatId;
  card: Card;
}

export function executePengAction(
  deps: ActionDeps,
  pending: PendingLike,
  winnerId: SeatId,
): void {
  const response = pending.card;
  if (!deps.executePengOperation(winnerId, response)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  deps.enterDiscardStage(winnerId, "PENG");
}
