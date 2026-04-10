import { buildPengCandidates } from "../action-candidates.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  takeMatchingCards: (seatId: SeatId, target: Card, count: number) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean, kind: string) => void;
}

export function tryExecutePeng(
  deps: OperationDeps,
  seatId: SeatId,
  pendingCard: Card,
  candidateId?: string,
): boolean {
  const hand = deps.getHandWithoutPending(seatId, pendingCard);
  const candidates = buildPengCandidates(hand, pendingCard);
  if (candidates.length === 0) {
    return false;
  }
  const picked = candidateId ? candidates.find((item) => item.candidate.id === candidateId) : candidates[0];
  if (!picked) {
    return false;
  }

  const plan = picked.plan;
  const takenFromHand = deps.takeMatchingCards(seatId, pendingCard, plan.handCards.length);
  if (takenFromHand.length < 2) {
    return false;
  }
  deps.pushExposedGroup(seatId, [pendingCard, ...takenFromHand], true, "peng");
  return true;
}

interface ActionDeps {
  executePengOperation: (seatId: SeatId, pendingCard: Card, candidateId?: string) => boolean;
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
  candidateId?: string,
): void {
  const response = pending.card;
  if (!deps.executePengOperation(winnerId, response, candidateId)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  deps.enterDiscardStage(winnerId, "PENG");
}
