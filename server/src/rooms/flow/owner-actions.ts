import type { Card } from "../../rules/types.js";

type SeatId = string;

interface PendingLike {
  ownerId: SeatId;
  card: Card;
}

export interface ExecuteEatDeps {
  pending: PendingLike | null;
  executeChiOperation: (ownerId: SeatId, pendingCard: Card) => boolean;
  setLastAction: (action: string) => void;
  finalizeWithDiscardFrom: (ownerId: SeatId) => void;
}

export function executeEatFlow(deps: ExecuteEatDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  if (!deps.executeChiOperation(ownerId, pending.card)) {
    return;
  }
  deps.setLastAction(`${ownerId} CHI`);
  deps.finalizeWithDiscardFrom(ownerId);
}

export interface ExecuteGrabDeps {
  pending: PendingLike | null;
  deck: Card[];
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  shouldEndDrawAfterUpperPass: (deckCount: number) => boolean;
  endRound: (lastAction: string) => void;
  setDeckCount: (deckCount: number) => void;
  addCardToHand: (ownerId: SeatId, card: Card) => void;
  setupCollectiveAfterGrab: (ownerId: SeatId, card: Card) => void;
  setLastAction: (action: string) => void;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function executeGrabFlow(deps: ExecuteGrabDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  deps.pushDiscard(ownerId, pending.card);

  if (deps.shouldEndDrawAfterUpperPass(deps.deck.length)) {
    deps.endRound("DRAW_GAME");
    return;
  }

  const newCard = deps.deck.shift();
  deps.setDeckCount(deps.deck.length);
  if (!newCard) {
    deps.endRound("DRAW_GAME");
    return;
  }

  deps.addCardToHand(ownerId, newCard);
  deps.setupCollectiveAfterGrab(ownerId, newCard);
  deps.setLastAction(`${ownerId} PASS`);
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

export interface ExecutePassToNextDeps {
  pending: PendingLike | null;
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  setLastAction: (action: string) => void;
  advanceToNextOwner: (ownerId: SeatId, card: Card) => void;
}

export function executePassToNextFlow(deps: ExecutePassToNextDeps, ownerId: SeatId): void {
  const pending = deps.pending;
  if (!pending) {
    return;
  }
  deps.pushDiscard(ownerId, pending.card);
  deps.setLastAction(`${ownerId} PASS`);
  deps.advanceToNextOwner(ownerId, pending.card);
}

export interface FinalizeWithDiscardDeps {
  pickDiscardCard: (ownerId: SeatId) => Card | null;
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  advanceToNextOwner: (ownerId: SeatId, card: Card) => void;
  endRound: (lastAction: string) => void;
}

export function finalizeWithDiscardFlow(deps: FinalizeWithDiscardDeps, ownerId: SeatId): void {
  const discard = deps.pickDiscardCard(ownerId);
  if (!discard) {
    deps.endRound(`${ownerId} NO_DISCARD`);
    return;
  }
  deps.pushDiscard(ownerId, discard);
  deps.advanceToNextOwner(ownerId, discard);
}
