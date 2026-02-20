import { canPeng, findKaiPlan, getChiPlans } from "../../rules/actions.js";
import type { Card } from "../../rules/types.js";

type SeatId = string;

export interface OperationExecutorDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getWildcardPoolCards: (seatId: SeatId) => Card[];
  consumePlanCards: (seatId: SeatId, handCards: Card[], poolCards: Card[]) => Card[];
  removeFromHand: (seatId: SeatId, card: Card) => void;
  takeMatchingCards: (seatId: SeatId, target: Card, count: number) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean) => void;
}

export function tryExecuteKai(
  deps: OperationExecutorDeps,
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

export function tryExecutePeng(
  deps: OperationExecutorDeps,
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

export function tryExecuteChi(
  deps: OperationExecutorDeps,
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
