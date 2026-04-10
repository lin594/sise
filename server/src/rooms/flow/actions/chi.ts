import { buildChiCandidates } from "../action-candidates.js";
import type { Card } from "../../../rules/types.js";

type SeatId = string;

interface OperationDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getWildcardPoolCards: (seatId: SeatId) => Card[];
  consumePlanCards: (seatId: SeatId, handCards: Card[], poolCards: Card[]) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean, kind: string) => void;
}

export interface ChiExecutionResult {
  ok: boolean;
  kind?: "jmp" | "jsx" | "zu3" | "zu4" | "pair" | "single";
  groupCards?: Card[];
}

/**
 * 作用：执行“吃”的规则层操作（仅处理牌面组合，不推进流程）。
 * 关键输入/输出：输入座位和响应牌，输出是否成功组成吃牌。
 * 副作用：从手牌/百搭池扣牌，并写入 exposedArea。
 */
export function tryExecuteChi(
  deps: OperationDeps,
  seatId: SeatId,
  pendingCard: Card,
  candidateId?: string,
): ChiExecutionResult {
  const hand = deps.getHandWithoutPending(seatId, pendingCard);
  const candidates = buildChiCandidates(hand, pendingCard, deps.getWildcardPoolCards(seatId));
  if (candidates.length === 0) {
    return { ok: false };
  }
  const picked = candidateId
    ? candidates.find((item) => item.candidate.id === candidateId)
    : candidates[0];
  if (!picked) {
    return { ok: false };
  }
  const plan = picked.plan;
  const taken = deps.consumePlanCards(seatId, plan.handCards, plan.poolCards);
  const groupCards = [pendingCard, ...taken];
  deps.pushExposedGroup(seatId, groupCards, true, "chi");
  return { ok: true, kind: plan.kind, groupCards };
}

interface ActionDeps {
  isEatResponder: (ownerId: SeatId, responderId: SeatId) => boolean;
  executeChiOperation: (seatId: SeatId, pendingCard: Card, candidateId?: string) => boolean;
  getNextPlayerId: (playerId: SeatId) => SeatId;
  startTurn: (ownerId: SeatId, tag: string) => void;
  enterDiscardStage: (ownerId: SeatId, tag: string) => void;
}

interface PendingLike {
  ownerId: SeatId;
  card: Card;
}

/**
 * 作用：执行 collective 胜出后的吃动作流程。
 * 关键输入/输出：输入 pending 与胜者，输出无返回值。
 * 副作用：成功进入弃牌阶段；失败回退到下家 `TURN_DRAW`。
 */
export function executeChiAction(
  deps: ActionDeps,
  pending: PendingLike,
  winnerId: SeatId,
  candidateId?: string,
): void {
  const response = pending.card;
  // 失败回退路径：不是合法吃牌位时不阻塞流程，直接交给下家开新回合。
  if (!deps.isEatResponder(pending.ownerId, winnerId)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  // 失败回退路径：规则执行失败同样转下家，避免房间卡死。
  if (!deps.executeChiOperation(winnerId, response, candidateId)) {
    const nextId = deps.getNextPlayerId(pending.ownerId);
    deps.startTurn(nextId, "TURN_DRAW");
    return;
  }
  deps.enterDiscardStage(winnerId, "CHI");
}
