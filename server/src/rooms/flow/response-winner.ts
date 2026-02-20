import type { ActionType, Card } from "../../rules/types.js";
import { executeChiAction } from "./actions/chi.js";
import { executeHuAction } from "./actions/hu.js";
import { executeKaiAction } from "./actions/kai.js";
import { executePengAction } from "./actions/peng.js";

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
  if (action === "hu") {
    executeHuAction(deps, pending, winnerId);
    return;
  }
  if (action === "kai") {
    executeKaiAction(deps, pending, winnerId);
    return;
  }
  if (action === "peng") {
    executePengAction(deps, pending, winnerId);
    return;
  }
  if (action === "chi") {
    executeChiAction(deps, pending, winnerId);
    return;
  }
  const nextId = deps.getNextPlayerId(pending.ownerId);
  deps.startTurn(nextId, "TURN_DRAW");
}
