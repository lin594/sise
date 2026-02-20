import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface HuExplainResult {
  valid: boolean;
  groups: string[];
}

interface HuDeps {
  getHand: (seatId: SeatId) => Card[];
  explainHuForSeat: (seatId: SeatId, hand: Card[], responseCard: Card) => HuExplainResult;
  logHuCheck: (stage: string, seatId: SeatId, hand: Card[], response: Card, valid: boolean) => void;
  setLastAction: (action: string) => void;
  enterNoResponsePath: () => void;
  endRound: (lastAction: string, winnerId?: SeatId | null, groups?: string[]) => void;
}

interface PendingLike {
  card: Card;
}

export function executeHuAction(
  deps: HuDeps,
  pending: PendingLike,
  winnerId: SeatId,
): void {
  const winnerHand = deps.getHand(winnerId);
  const response = pending.card;
  const hu = deps.explainHuForSeat(winnerId, winnerHand, response);
  deps.logHuCheck("collective_winner_hu", winnerId, winnerHand, response, hu.valid);
  if (!hu.valid) {
    deps.setLastAction("HU_INVALID");
    deps.enterNoResponsePath();
    return;
  }
  deps.endRound(`${winnerId} HU`, winnerId, hu.groups);
}
