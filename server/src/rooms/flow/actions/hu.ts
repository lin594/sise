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

/**
 * 作用：执行 collective 胜出后的胡牌结算。
 * 关键输入/输出：输入赢家、响应牌与胡牌解释器，输出无返回值。
 * 副作用：胡成功直接 endRound；胡失败回退到无响应路径。
 */
export function executeHuAction(
  deps: HuDeps,
  pending: PendingLike,
  winnerId: SeatId,
): void {
  const winnerHand = deps.getHand(winnerId);
  const response = pending.card;
  const hu = deps.explainHuForSeat(winnerId, winnerHand, response);
  deps.logHuCheck("collective_winner_hu", winnerId, winnerHand, response, hu.valid);
  // 失败回退路径：优先保护主循环连续性，按 NO_RESPONSE 路径继续而非停在 HU_INVALID。
  if (!hu.valid) {
    deps.setLastAction("HU_INVALID");
    deps.enterNoResponsePath();
    return;
  }
  deps.endRound(`${winnerId} HU`, winnerId, hu.groups);
}
