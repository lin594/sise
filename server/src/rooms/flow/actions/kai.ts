import { buildKaiCandidates } from "../action-candidates.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getWildcardPoolCards: (seatId: SeatId) => Card[];
  consumePlanCards: (seatId: SeatId, handCards: Card[], poolCards: Card[]) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean, kind: string) => void;
}

/**
 * 作用：执行“开”(杠)的规则层操作（仅处理组合与扣牌）。
 * 关键输入/输出：输入座位和响应牌，输出是否能组成开。
 * 副作用：从手牌/百搭池扣牌并写入 exposedArea。
 */
export function tryExecuteKai(
  deps: OperationDeps,
  seatId: SeatId,
  pendingCard: Card,
  candidateId?: string,
): boolean {
  const hand = deps.getHandWithoutPending(seatId, pendingCard);
  const candidates = buildKaiCandidates(hand, pendingCard, deps.getWildcardPoolCards(seatId));
  if (candidates.length === 0) {
    return false;
  }
  const picked = candidateId
    ? candidates.find((item) => item.candidate.id === candidateId)
    : candidates[0];
  if (!picked) {
    return false;
  }
  const plan = picked.plan;
  const taken = deps.consumePlanCards(seatId, plan.handCards, plan.poolCards);
  deps.pushExposedGroup(seatId, [pendingCard, ...taken], true, "kai");
  return true;
}

interface ActionDeps {
  executeKaiOperation: (seatId: SeatId, pendingCard: Card, candidateId?: string) => boolean;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  setLastAction: (action: string) => void;
  startTurn: (ownerId: SeatId, tag: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
}

interface PendingLike {
  ownerId: SeatId;
  card: Card;
}

/**
 * 作用：执行 collective 胜出后的开动作流程。
 * 关键输入/输出：输入 pending 与胜者，输出无返回值。
 * 副作用：成功则胜者进入强制弃牌；失败回退到下家 `TURN_DRAW`。
 */
export function executeKaiAction(
  deps: ActionDeps,
  pending: PendingLike,
  winnerId: SeatId,
  candidateId?: string,
): void {
  const response = pending.card;
  // 失败回退路径：开牌条件失效时，按无效响应处理，交由下家继续。
  if (!deps.executeKaiOperation(winnerId, response, candidateId)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  deps.setLastAction(`${winnerId} KAI`);
  deps.enterDiscardStage(winnerId, "KAI");
}
