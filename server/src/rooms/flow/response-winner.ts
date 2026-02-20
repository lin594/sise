import type { ActionType, Card } from "../../rules/types.js";

type SeatId = string;

interface HuExplainResult {
  valid: boolean;
  groups: string[];
}

export interface PendingResponseLike {
  ownerId: SeatId;
  card: Card;
}

export interface ResponseWinnerDeps {
  getHand: (seatId: SeatId) => Card[];
  explainHuForSeat: (seatId: SeatId, hand: Card[], responseCard: Card) => HuExplainResult;
  logHuCheck: (stage: string, seatId: SeatId, hand: Card[], response: Card, valid: boolean) => void;
  executeKaiOperation: (seatId: SeatId, pendingCard: Card) => boolean;
  executePengOperation: (seatId: SeatId, pendingCard: Card) => boolean;
  executeChiOperation: (seatId: SeatId, pendingCard: Card) => boolean;
  isEatResponder: (ownerId: SeatId, responderId: SeatId) => boolean;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  setLastAction: (action: string) => void;
  startTurn: (ownerId: SeatId, tag: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
  enterNoResponsePath: () => void;
  endRound: (lastAction: string, winnerId?: SeatId | null, groups?: string[]) => void;
}

export function executeResponseWinner(
  deps: ResponseWinnerDeps,
  pending: PendingResponseLike,
  winnerId: SeatId,
  action: ActionType,
): void {
  const winnerHand = deps.getHand(winnerId);
  const response = pending.card;

  if (action === "hu") {
    const hu = deps.explainHuForSeat(winnerId, winnerHand, response);
    deps.logHuCheck("collective_winner_hu", winnerId, winnerHand, response, hu.valid);
    if (!hu.valid) {
      deps.setLastAction("HU_INVALID");
      deps.enterNoResponsePath();
      return;
    }
    deps.endRound(`${winnerId} HU`, winnerId, hu.groups);
    return;
  }

  if (action === "kai") {
    if (!deps.executeKaiOperation(winnerId, response)) {
      const nextId = deps.getNextPlayerId(pending.ownerId);
      deps.startTurn(nextId, "TURN_DRAW");
      return;
    }
    deps.setLastAction(`${winnerId} KAI`);
    deps.startTurn(winnerId, "KONG_DRAW");
    return;
  }

  if (action === "peng") {
    if (!deps.executePengOperation(winnerId, response)) {
      const nextId = deps.getNextPlayerId(pending.ownerId);
      deps.startTurn(nextId, "TURN_DRAW");
      return;
    }
    deps.enterDiscardStage(winnerId, "PENG");
    return;
  }

  if (action === "chi") {
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
    return;
  }

  const nextId = deps.getNextPlayerId(pending.ownerId);
  deps.startTurn(nextId, "TURN_DRAW");
}
