import { buildPengCandidates } from "../action-candidates.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getReusablePairCards: (seatId: SeatId) => Card[];
  takeMatchingCards: (seatId: SeatId, target: Card, count: number) => Card[];
  takeMatchingReusablePairCards: (seatId: SeatId, target: Card, count: number) => Card[];
  upgradeExposedPairToTriplet: (seatId: SeatId, pairCards: Card[], pendingCard: Card, highlight: boolean) => boolean;
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean) => void;
}

export function tryExecutePeng(
  deps: OperationDeps,
  seatId: SeatId,
  pendingCard: Card,
  candidateId?: string,
): boolean {
  const hand = deps.getHandWithoutPending(seatId, pendingCard);
  const pairCards = deps.getReusablePairCards(seatId);
  const candidates = buildPengCandidates(hand, pendingCard, pairCards);
  if (candidates.length === 0) {
    return false;
  }
  const picked = candidateId ? candidates.find((item) => item.candidate.id === candidateId) : candidates[0];
  if (!picked) {
    return false;
  }

  const plan = picked.plan;
  if (plan.kind === "reusable_pair") {
    const takenFromPair = deps.takeMatchingReusablePairCards(seatId, pendingCard, plan.pairCards.length);
    if (takenFromPair.length < 2) {
      return false;
    }
    if (deps.upgradeExposedPairToTriplet(seatId, takenFromPair, pendingCard, true)) {
      return true;
    }
    // Fallback: keep a full meld group to avoid pair+single split display.
    deps.pushExposedGroup(seatId, [pendingCard, ...takenFromPair], true);
    return true;
  }

  const takenFromHand = deps.takeMatchingCards(seatId, pendingCard, plan.handCards.length);
  if (takenFromHand.length < 2) {
    return false;
  }
  deps.pushExposedGroup(seatId, [pendingCard, ...takenFromHand], true);
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
