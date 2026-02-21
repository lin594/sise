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

export interface CollectiveChoiceLike {
  action: ActionType;
  candidateId?: string;
}

export interface ResponseWinnerDeps {
  getHand: (seatId: SeatId) => Card[];
  explainHuForSeat: (seatId: SeatId, hand: Card[], responseCard: Card) => HuExplainResult;
  logHuCheck: (stage: string, seatId: SeatId, hand: Card[], response: Card, valid: boolean) => void;
  executeKaiOperation: (seatId: SeatId, pendingCard: Card, candidateId?: string) => boolean;
  executePengOperation: (seatId: SeatId, pendingCard: Card, candidateId?: string) => boolean;
  executeChiOperation: (seatId: SeatId, pendingCard: Card, candidateId?: string) => boolean;
  isEatResponder: (ownerId: SeatId, responderId: SeatId) => boolean;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  setLastAction: (action: string) => void;
  startTurn: (ownerId: SeatId, tag: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
  enterNoResponsePath: () => void;
  endRound: (lastAction: string, winnerId?: SeatId | null, groups?: string[]) => void;
}

/**
 * 作用：在 collective 已决出胜者后，按动作类型分发到具体执行器。
 * 关键输入/输出：输入 pending、胜者座位与动作选择；输出无返回值。
 * 副作用：触发胡/开/碰/吃执行，或回退到下家起新回合。
 */
export function executeResponseWinner(
  deps: ResponseWinnerDeps,
  pending: PendingResponseLike,
  winnerId: SeatId,
  winnerChoice: CollectiveChoiceLike | ActionType,
): void {
  const action = typeof winnerChoice === "string" ? winnerChoice : winnerChoice.action;
  const candidateId = typeof winnerChoice === "string" ? undefined : winnerChoice.candidateId;

  // 设计原因：优先级已在 pickCollectiveWinner 判定（hu > kai/peng > 其余），这里仅执行既定胜者。
  // 调度层只做路由，不直接写规则细节；具体规则由 actions/*.ts 执行。
  if (action === "hu") {
    executeHuAction(deps, pending, winnerId);
    return;
  }
  if (action === "kai") {
    executeKaiAction(deps, pending, winnerId, candidateId);
    return;
  }
  if (action === "peng") {
    executePengAction(deps, pending, winnerId, candidateId);
    return;
  }
  if (action === "chi") {
    executeChiAction(deps, pending, winnerId, candidateId);
    return;
  }

  // 兜底回退：未知动作不阻塞主循环，直接转到下家继续摸牌流程。
  const nextId = deps.getNextPlayerId(pending.ownerId);
  deps.startTurn(nextId, "TURN_DRAW");
}
