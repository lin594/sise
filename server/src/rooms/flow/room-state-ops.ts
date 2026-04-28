import { isDiscardRestricted, isSameFace } from "../../rules/deck.js";
import { analyzeCardGrouping, explainHu } from "../../rules/hu.js";
import type { Card } from "../../rules/types.js";
import { CardSchema, type GameState } from "../../schema/game-state.schema.js";

type SeatId = string;

export interface OperationExecutorDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getWildcardPoolCards: (seatId: SeatId) => Card[];
  consumePlanCards: (seatId: SeatId, handCards: Card[], poolCards: Card[]) => Card[];
  removeFromHand: (seatId: SeatId, card: Card) => void;
  takeMatchingCards: (seatId: SeatId, target: Card, count: number) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean, kind: string) => void;
}

/**
 * 房间状态读写层：集中处理手牌/明牌/弃牌/响应牌等状态变更。
 * 关键输入/输出：输入 `GameState` 与 `playerHands`，输出统一状态操作方法。
 * 副作用：本类方法会直接修改 `playerHands` 与 `state.players/*` 区域。
 */
export class RoomStateOps {
  constructor(
    private readonly state: GameState,
    private readonly playerHands: Map<SeatId, Card[]>,
    private readonly getPendingOwnerId: () => SeatId | null,
  ) {}

  /**
   * 作用：返回“去掉 pending 响应牌”后的手牌视图。
   * 关键输入/输出：输入座位和 pending 牌，输出过滤后的手牌副本。
   * 副作用：无。
   */
  getHandWithoutPending(ownerId: SeatId, pendingCard: Card): Card[] {
    const hand = this.playerHands.get(ownerId) ?? [];
    let removed = false;
    return hand.filter((card) => {
      if (!removed && card.id === pendingCard.id) {
        removed = true;
        return false;
      }
      return true;
    });
  }

  /**
   * 作用：为自动流程挑选首张可弃牌并从手牌移除。
   * 关键输入/输出：输入座位，输出被移除的牌或 null。
   * 副作用：修改 `playerHands`。
   */
  pickDiscardCard(playerId: SeatId): Card | null {
    const hand = this.playerHands.get(playerId) ?? [];
    const candidates = hand
      .map((card, index) => ({ card, index }))
      .filter((item) => !isDiscardRestricted(item.card));
    if (!candidates.length) {
      return null;
    }
    let bestLeftover = Number.POSITIVE_INFINITY;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestIndexes: number[] = [];
    candidates.forEach(({ index }) => {
      const remaining = hand.filter((_, cardIndex) => cardIndex !== index);
      const analysis = analyzeCardGrouping(remaining);
      if (
        analysis.leftoverCount < bestLeftover ||
        (analysis.leftoverCount === bestLeftover && analysis.score > bestScore)
      ) {
        bestLeftover = analysis.leftoverCount;
        bestScore = analysis.score;
        bestIndexes = [index];
        return;
      }
      if (analysis.leftoverCount === bestLeftover && analysis.score === bestScore) {
        bestIndexes.push(index);
      }
    });
    const pickedIndex = bestIndexes[Math.floor(Math.random() * bestIndexes.length)] ?? candidates[0]!.index;
    const [discard] = hand.splice(pickedIndex, 1);
    this.playerHands.set(playerId, hand);
    return discard;
  }

  /**
   * 作用：按 cardId 执行玩家主动弃牌。
   * 关键输入/输出：输入座位与 cardId，输出被弃的牌或 null。
   * 副作用：修改 `playerHands`。
   */
  discardCardById(playerId: SeatId, cardId: string): Card | null {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((card) => card.id === cardId);
    if (idx < 0) {
      return null;
    }
    const discard = hand[idx];
    if (isDiscardRestricted(discard)) {
      return null;
    }
    hand.splice(idx, 1);
    this.playerHands.set(playerId, hand);
    return discard;
  }

  /**
   * 作用：按牌面移除固定数量手牌（碰/杠/吃等组合消耗）。
   * 关键输入/输出：输入目标牌面和数量，输出实际移除牌列表。
   * 副作用：修改 `playerHands`。
   */
  takeMatchingCards(playerId: SeatId, target: Card, count: number): Card[] {
    const hand = this.playerHands.get(playerId) ?? [];
    let rest = count;
    const removed: Card[] = [];
    for (let i = hand.length - 1; i >= 0 && rest > 0; i -= 1) {
      if (isSameFace(hand[i], target)) {
        removed.push(...hand.splice(i, 1));
        rest -= 1;
      }
    }
    this.playerHands.set(playerId, hand);
    return removed;
  }

  /**
   * 作用：优先按 id、其次按牌面从手牌移除一张牌。
   * 关键输入/输出：输入座位和目标牌，输出无返回值。
   * 副作用：修改 `playerHands`。
   */
  removeFromHand(playerId: SeatId, card: Card): void {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((x) => x.id === card.id);
    if (idx >= 0) {
      hand.splice(idx, 1);
      this.playerHands.set(playerId, hand);
      return;
    }
    const byFace = hand.findIndex((x) => x.color === card.color && x.type === card.type);
    if (byFace >= 0) {
      hand.splice(byFace, 1);
      this.playerHands.set(playerId, hand);
    }
  }

  /**
   * 作用：从 wildcardPool/generalArea 同步移除一张百搭牌。
   * 关键输入/输出：输入座位和目标牌，输出无返回值。
   * 副作用：修改 `wildcardPool` 与 `generalArea`。
   */
  removeFromWildcardPool(playerId: SeatId, card: Card): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    const idx = player.wildcardPool.findIndex((x) => x.id === card.id);
    if (idx >= 0) {
      player.wildcardPool.splice(idx, 1);
      return;
    }
    const byFace = player.wildcardPool.findIndex((x) => x.color === card.color && x.type === card.type);
    if (byFace >= 0) {
      player.wildcardPool.splice(byFace, 1);
    }
    // 设计原因：wildcardPool 与 generalArea 是同一张牌的两种视图，移除时必须保持同步。
    const gById = player.generalArea.findIndex((x) => x.id === card.id);
    if (gById >= 0) {
      player.generalArea.splice(gById, 1);
      return;
    }
    const gByFace = player.generalArea.findIndex((x) => x.color === card.color && x.type === card.type);
    if (gByFace >= 0) {
      player.generalArea.splice(gByFace, 1);
    }
  }

  /**
   * 作用：按组合计划统一扣除手牌与百搭池牌。
   * 关键输入/输出：输入手牌消耗与池牌消耗，输出合并后的实际消耗牌。
   * 副作用：修改 `playerHands/wildcardPool/generalArea`。
   */
  consumePlanCards(playerId: SeatId, handCards: Card[], poolCards: Card[]): Card[] {
    for (const card of handCards) {
      this.removeFromHand(playerId, card);
    }
    for (const card of poolCards) {
      this.removeFromWildcardPool(playerId, card);
    }
    return [...handCards, ...poolCards];
  }

  /**
   * 作用：写入个人弃牌与公共弃牌堆。
   * 关键输入/输出：输入座位和牌，输出无返回值。
   * 副作用：修改 `player.discardPile/state.publicDiscardPile`。
   */
  pushDiscard(playerId: SeatId, card: Card): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    const schemaCard = this.toSchemaCard(card, false, "upper");
    player.discardPile.push(schemaCard);
    this.state.publicDiscardPile.push(this.toSchemaCard(card, false, "upper"));
  }

  /**
   * 作用：从指定玩家流水区移除一张指定牌，并同步移除公共流水中的对应牌。
   * 关键输入/输出：输入座位和目标牌；输出是否移除成功。
   * 副作用：修改 `player.discardPile/state.publicDiscardPile`。
   */
  consumePendingDiscard(playerId: SeatId, card: Card): boolean {
    const player = this.state.players.get(playerId);
    if (!player) {
      return false;
    }
    const discardIndex = player.discardPile.findIndex((item) => item.id === card.id);
    if (discardIndex < 0) {
      return false;
    }
    player.discardPile.splice(discardIndex, 1);

    const publicIndex = this.state.publicDiscardPile.findIndex((item) => item.id === card.id);
    if (publicIndex >= 0) {
      this.state.publicDiscardPile.splice(publicIndex, 1);
    }
    return true;
  }

  /**
   * 作用：写入明牌组合与组合长度。
   * 关键输入/输出：输入座位与组合牌，输出无返回值。
   * 副作用：修改 `exposedArea/exposedGroupSizes`。
   */
  pushExposedGroup(playerId: SeatId, cards: Card[], highlight: boolean, kind: string): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    if (cards.length > 0) {
      player.exposedGroupSizes.push(cards.length);
      player.exposedGroupKinds.push(kind || "chi");
    }
    for (const card of cards) {
      player.exposedArea.push(this.toSchemaCard(card, highlight, card.source ?? "upper"));
    }
  }

  /**
   * 作用：将明示区中的一个对子组原地升级为三张组（用于对子复用后的碰）。
   * 关键输入/输出：输入目标玩家、对子牌与响应牌；输出是否升级成功。
   * 副作用：修改 `exposedArea/exposedGroupSizes`，不新增单张组。
   */
  upgradeExposedPairToTriplet(
    playerId: SeatId,
    pairCards: Card[],
    pendingCard: Card,
    highlight: boolean,
    nextKind?: string,
  ): boolean {
    const player = this.state.players.get(playerId);
    if (!player || pairCards.length < 2) {
      return false;
    }
    let offset = 0;
    for (let idx = 0; idx < player.exposedGroupSizes.length; idx += 1) {
      const size = player.exposedGroupSizes[idx];
      const end = offset + size;
      if (size === 2) {
        const chunk = player.exposedArea.slice(offset, end);
        const hasAllPairIds = pairCards.every((pair) => chunk.some((card) => card.id === pair.id));
        if (hasAllPairIds) {
          const merged = [...player.exposedArea];
          merged.splice(end, 0, this.toSchemaCard(pendingCard, highlight, pendingCard.source ?? "upper"));
          while (player.exposedArea.length > 0) {
            player.exposedArea.pop();
          }
          for (const card of merged) {
            player.exposedArea.push(card);
          }
          player.exposedGroupSizes[idx] = size + 1;
          if (nextKind) {
            player.exposedGroupKinds[idx] = nextKind;
          }
          return true;
        }
      }
      offset = end;
    }
    return false;
  }

  /**
   * 作用：同步当前响应牌到 `responseCard/targetCard/isMoCard`。
   * 关键输入/输出：输入牌和来源，输出无返回值。
   * 副作用：修改 `state.responseCard/targetCard/isMoCard/currentPlayerId`。
   */
  setResponseCard(card: Card, source: "upper" | "draw"): void {
    this.state.responseCard = this.toSchemaCard(card, false, source);
    this.state.targetCard = this.toSchemaCard(card, false, source);
    this.state.isMoCard = source === "draw";
    this.state.currentPlayerId = this.getPendingOwnerId() ?? this.state.currentPlayerId;
  }

  /**
   * 作用：将业务卡牌转为 Schema 卡牌。
   * 关键输入/输出：输入业务 Card，输出 `CardSchema`。
   * 副作用：无。
   */
  toSchemaCard(card: Card, isResponseCard: boolean, source: "upper" | "draw"): CardSchema {
    const schemaCard = new CardSchema();
    schemaCard.id = card.id;
    schemaCard.color = card.color;
    schemaCard.type = card.type;
    schemaCard.source = source;
    schemaCard.isResponseCard = isResponseCard;
    return schemaCard;
  }

  /**
   * 作用：将 Schema 卡牌转回业务 Card。
   * 关键输入/输出：输入 Schema 结构，输出业务 Card。
   * 副作用：无。
   */
  toPlainCard(card: { id: string; color: string; type: string; source?: string }): Card {
    return {
      id: card.id,
      color: card.color as Card["color"],
      type: card.type as Card["type"],
      source: card.source === "draw" ? "draw" : "upper",
    };
  }

  /**
   * 作用：读取指定玩家百搭池的业务牌视图。
   * 关键输入/输出：输入座位，输出百搭池数组。
   * 副作用：无。
   */
  getWildcardPoolCards(seatId: SeatId): Card[] {
    const player = this.state.players.get(seatId);
    if (!player) {
      return [];
    }
    return player.wildcardPool.map((card) => this.toPlainCard(card));
  }

  /**
   * 作用：向玩家写入一张百搭牌（generalArea + wildcardPool 双写）。
   * 关键输入/输出：输入座位、牌与来源，输出无返回值。
   * 副作用：修改 `generalArea/wildcardPool`。
   */
  addWildcardCardToPlayer(ownerId: SeatId, card: Card, source: "upper" | "draw"): void {
    const player = this.state.players.get(ownerId);
    if (!player) {
      return;
    }
    const schemaCard = this.toSchemaCard(card, true, source);
    player.generalArea.unshift(schemaCard);
    player.wildcardPool.unshift(this.toSchemaCard(card, true, source));
  }

  /**
   * 作用：封装胡牌解释调用，统一注入 seat 级 wildcard 信息。
   * 关键输入/输出：输入 seat/hand/response/wildcardCount，输出胡牌解释结果。
   * 副作用：无。
   */
  explainHuForSeat(seatId: SeatId, hand: Card[], responseCard: Card, wildcardCount: number) {
    void seatId;
    return explainHu(hand, responseCard, { wildcardCount });
  }

  /**
   * 作用：生成动作执行器依赖对象，供 actions/*.ts 复用。
   * 关键输入/输出：无输入，输出规则执行依赖集合。
   * 副作用：无。
   */
  buildOperationExecutorDeps(): OperationExecutorDeps {
    return {
      getHandWithoutPending: (id, card) => this.getHandWithoutPending(id, card),
      getWildcardPoolCards: (id) => this.getWildcardPoolCards(id),
      consumePlanCards: (id, handCards, poolCards) => this.consumePlanCards(id, handCards, poolCards),
      removeFromHand: (id, card) => this.removeFromHand(id, card),
      takeMatchingCards: (id, card, count) => this.takeMatchingCards(id, card, count),
      pushExposedGroup: (id, cards, highlight, kind) => this.pushExposedGroup(id, cards, highlight, kind),
    };
  }
}

export function syncAllPrivateHands(clients: { sessionId: string; send: (event: string, payload: unknown) => void }[], seatBySession: Map<string, string>, playerHands: Map<string, Card[]>): void {
  for (const client of clients) {
    const seatId = seatBySession.get(client.sessionId);
    if (!seatId) {
      continue;
    }
    const hand = playerHands.get(seatId) ?? [];
    client.send("private_hand", {
      cards: hand.map((card) => ({ ...card, isHidden: false })),
    });
  }
}

/**
 * 作用：创建房间状态操作器实例。
 * 关键输入/输出：输入 `GameState/playerHands/getPendingOwnerId`，输出 `RoomStateOps`。
 * 副作用：无。
 */
export function createRoomStateOps(
  state: GameState,
  playerHands: Map<string, Card[]>,
  getPendingOwnerId: () => string | null,
): RoomStateOps {
  return new RoomStateOps(state, playerHands, getPendingOwnerId);
}
