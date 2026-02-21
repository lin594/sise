import { buildPengCandidates } from "../action-candidates.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getReusablePairCards: (seatId: SeatId) => Card[];
  takeMatchingCards: (seatId: SeatId, target: Card, count: number) => Card[];
  takeMatchingReusablePairCards: (seatId: SeatId, target: Card, count: number) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean) => void;
}

/**
 * 作用：执行“碰”的规则层操作（仅处理组合与扣牌）。
 * 关键输入/输出：输入座位和响应牌，输出是否碰牌成功。
 * 副作用：移除手牌对应牌并写入 exposedArea。
 */
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
  const picked = candidateId
    ? candidates.find((item) => item.candidate.id === candidateId)
    : candidates[0];
  if (!picked) {
    return false;
  }
  const plan = picked.plan;
  if (plan.kind === "reusable_pair") {
    const takenFromPair = deps.takeMatchingReusablePairCards(seatId, pendingCard, plan.pairCards.length);
    if (takenFromPair.length < 2) {
      return false;
    }
    // 对子牌本就在 meld/exposed 区展示，这里仅追加新来的响应牌，避免重复展示。
    deps.pushExposedGroup(seatId, [pendingCard], true);
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

/**
 * 作用：执行 collective 胜出后的碰动作流程。
 * 关键输入/输出：输入 pending 与胜者，输出无返回值。
 * 副作用：成功进入胜者弃牌阶段；失败回退到下家 `TURN_DRAW`。
 */
export function executePengAction(
  deps: ActionDeps,
  pending: PendingLike,
  winnerId: SeatId,
  candidateId?: string,
): void {
  const response = pending.card;
  // 失败回退路径：碰执行失败则不重试，直接推进主循环到下家。
  if (!deps.executePengOperation(winnerId, response, candidateId)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  deps.enterDiscardStage(winnerId, "PENG");
}
