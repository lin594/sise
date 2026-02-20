import { isDiscardRestricted } from "../../rules/deck.js";
import type { Card } from "../../rules/types.js";

type SeatId = string;

export interface PendingFactory {
  ownerId: SeatId;
  card: Card;
  source: "upper" | "draw";
}

export interface DrawForOwnerDeps<Pending> {
  phase: string;
  deck: Card[];
  setDeckCount: (count: number) => void;
  endRound: (lastAction: string) => void;
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  clearAwaitingDiscardOwner: () => void;
  setResponseCard: (card: Card, source: "draw") => void;
  applyCollectivePollState: (ownerId: SeatId, previousPlayerId: SeatId, pollOriginPlayerId: SeatId, lastAction: string) => void;
  getPreviousPlayerId: (ownerId: SeatId) => SeatId;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function drawForOwnerFlow<Pending>(deps: DrawForOwnerDeps<Pending>, ownerId: SeatId, tag: string): void {
  if (deps.phase !== "playing") {
    return;
  }

  const drawn = deps.deck.shift();
  deps.setDeckCount(deps.deck.length);
  if (!drawn) {
    deps.endRound("DRAW_GAME");
    return;
  }

  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId,
      card: drawn,
      source: "draw",
    }),
  );
  deps.clearAwaitingDiscardOwner();
  deps.setResponseCard(drawn, "draw");
  deps.applyCollectivePollState(ownerId, deps.getPreviousPlayerId(ownerId), ownerId, `${ownerId} ${tag}`);
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

export interface BeginCollectiveFromDiscardDeps<Pending> {
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  clearAwaitingDiscardOwner: () => void;
  setResponseCard: (card: Card, source: "upper") => void;
  applyCollectivePollState: (ownerId: SeatId, previousPlayerId: SeatId, pollOriginPlayerId: SeatId, lastAction: string) => void;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function beginCollectiveFromDiscardFlow<Pending>(
  deps: BeginCollectiveFromDiscardDeps<Pending>,
  ownerId: SeatId,
  discard: Card,
): void {
  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId,
      card: discard,
      source: "upper",
    }),
  );
  deps.clearAwaitingDiscardOwner();
  deps.setResponseCard(discard, "upper");
  deps.applyCollectivePollState(ownerId, ownerId, ownerId, `${ownerId} DISCARD`);
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}

export interface EnterDiscardStageDeps<Pending> {
  playerHand: Card[];
  endRound: (lastAction: string) => void;
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  setAwaitingDiscardOwner: (ownerId: SeatId) => void;
  resetCollectivePolling: () => void;
  applyEnterDiscardStageState: (ownerId: SeatId, tag: string) => void;
  clearResponseCard: () => void;
  syncAllPrivateHands: () => void;
  tickBots: () => void;
}

export function enterDiscardStageFlow<Pending>(deps: EnterDiscardStageDeps<Pending>, ownerId: SeatId, tag: string): void {
  const fallback = deps.playerHand.find((card) => !isDiscardRestricted(card)) ?? null;
  if (!fallback) {
    deps.endRound(`${ownerId} NO_DISCARD`);
    return;
  }

  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId,
      card: fallback,
      source: "draw",
    }),
  );
  deps.setAwaitingDiscardOwner(ownerId);
  deps.resetCollectivePolling();
  deps.applyEnterDiscardStageState(ownerId, tag);
  deps.clearResponseCard();
  deps.syncAllPrivateHands();
  deps.tickBots();
}

export interface DiscardFromAndCollectiveDeps {
  pickDiscardCard: (ownerId: SeatId) => Card | null;
  pushDiscard: (ownerId: SeatId, card: Card) => void;
  beginCollectiveFromDiscard: (ownerId: SeatId, discard: Card) => void;
  clearAwaitingDiscardOwner: () => void;
  endRound: (lastAction: string) => void;
}

export function discardFromAndCollectiveFlow(deps: DiscardFromAndCollectiveDeps, ownerId: SeatId): void {
  deps.clearAwaitingDiscardOwner();
  const discard = deps.pickDiscardCard(ownerId);
  if (!discard) {
    deps.endRound(`${ownerId} NO_DISCARD`);
    return;
  }
  deps.pushDiscard(ownerId, discard);
  deps.beginCollectiveFromDiscard(ownerId, discard);
}

export interface AdvanceToNextOwnerDeps<Pending> {
  getNextPlayerId: (ownerId: SeatId) => SeatId;
  createPendingResponse: (input: PendingFactory) => Pending;
  setPendingResponse: (pending: Pending) => void;
  setCurrentPlayer: (ownerId: SeatId) => void;
  setResponsePhaseCollective: () => void;
  setResponseCard: (card: Card, source: "upper") => void;
  setCurrentTurnPlayer: (ownerId: SeatId) => void;
  setPreviousPlayer: (ownerId: SeatId) => void;
  setLoopStageGlobal: () => void;
  clearActiveResponder: () => void;
  clearResponseEndsAt: () => void;
  setPollOriginPlayer: (ownerId: SeatId) => void;
  syncAllPrivateHands: () => void;
  startCollectivePolling: () => void;
}

export function advanceToNextOwnerFlow<Pending>(
  deps: AdvanceToNextOwnerDeps<Pending>,
  currentOwnerId: SeatId,
  cardToNext: Card,
): void {
  const nextId = deps.getNextPlayerId(currentOwnerId);
  deps.setPendingResponse(
    deps.createPendingResponse({
      ownerId: nextId,
      card: cardToNext,
      source: "upper",
    }),
  );
  deps.setCurrentPlayer(nextId);
  deps.setResponsePhaseCollective();
  deps.setResponseCard(cardToNext, "upper");
  deps.setCurrentTurnPlayer(nextId);
  deps.setPreviousPlayer(currentOwnerId);
  deps.setLoopStageGlobal();
  deps.clearActiveResponder();
  deps.setPollOriginPlayer(currentOwnerId);
  deps.clearResponseEndsAt();
  deps.syncAllPrivateHands();
  deps.startCollectivePolling();
}
