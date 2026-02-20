import { isDiscardRestricted, isSameFace } from "../../rules/deck.js";
import { explainHu } from "../../rules/hu.js";
import type { Card } from "../../rules/types.js";
import { CardSchema, type GameState } from "../../schema/game-state.schema.js";

type SeatId = string;

export interface OperationExecutorDeps {
  getHandWithoutPending: (seatId: SeatId, pendingCard: Card) => Card[];
  getWildcardPoolCards: (seatId: SeatId) => Card[];
  consumePlanCards: (seatId: SeatId, handCards: Card[], poolCards: Card[]) => Card[];
  removeFromHand: (seatId: SeatId, card: Card) => void;
  takeMatchingCards: (seatId: SeatId, target: Card, count: number) => Card[];
  pushExposedGroup: (seatId: SeatId, cards: Card[], highlight: boolean) => void;
}

export class RoomStateOps {
  constructor(
    private readonly state: GameState,
    private readonly playerHands: Map<SeatId, Card[]>,
    private readonly getPendingOwnerId: () => SeatId | null,
  ) {}

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

  pickDiscardCard(playerId: SeatId): Card | null {
    const hand = this.playerHands.get(playerId) ?? [];
    const idx = hand.findIndex((card) => !isDiscardRestricted(card));
    if (idx < 0) {
      return null;
    }
    const [discard] = hand.splice(idx, 1);
    this.playerHands.set(playerId, hand);
    return discard;
  }

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

  consumePlanCards(playerId: SeatId, handCards: Card[], poolCards: Card[]): Card[] {
    for (const card of handCards) {
      this.removeFromHand(playerId, card);
    }
    for (const card of poolCards) {
      this.removeFromWildcardPool(playerId, card);
    }
    return [...handCards, ...poolCards];
  }

  pushDiscard(playerId: SeatId, card: Card): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    const schemaCard = this.toSchemaCard(card, false, "upper");
    player.discardPile.unshift(schemaCard);
    this.state.publicDiscardPile.unshift(this.toSchemaCard(card, false, "upper"));
  }

  pushExposedGroup(playerId: SeatId, cards: Card[], highlight: boolean): void {
    const player = this.state.players.get(playerId);
    if (!player) {
      return;
    }
    if (cards.length > 0) {
      player.exposedGroupSizes.push(cards.length);
    }
    for (const card of cards) {
      player.exposedArea.push(this.toSchemaCard(card, highlight, card.source ?? "upper"));
    }
  }

  setResponseCard(card: Card, source: "upper" | "draw"): void {
    this.state.responseCard = this.toSchemaCard(card, false, source);
    this.state.targetCard = this.toSchemaCard(card, false, source);
    this.state.isMoCard = source === "draw";
    this.state.currentPlayerId = this.getPendingOwnerId() ?? this.state.currentPlayerId;
  }

  toSchemaCard(card: Card, isResponseCard: boolean, source: "upper" | "draw"): CardSchema {
    const schemaCard = new CardSchema();
    schemaCard.id = card.id;
    schemaCard.color = card.color;
    schemaCard.type = card.type;
    schemaCard.source = source;
    schemaCard.isResponseCard = isResponseCard;
    return schemaCard;
  }

  toPlainCard(card: { id: string; color: string; type: string; source?: string }): Card {
    return {
      id: card.id,
      color: card.color as Card["color"],
      type: card.type as Card["type"],
      source: card.source === "draw" ? "draw" : "upper",
    };
  }

  getWildcardPoolCards(seatId: SeatId): Card[] {
    const player = this.state.players.get(seatId);
    if (!player) {
      return [];
    }
    return player.wildcardPool.map((card) => this.toPlainCard(card));
  }

  addWildcardCardToPlayer(ownerId: SeatId, card: Card, source: "upper" | "draw"): void {
    const player = this.state.players.get(ownerId);
    if (!player) {
      return;
    }
    const schemaCard = this.toSchemaCard(card, true, source);
    player.generalArea.unshift(schemaCard);
    player.wildcardPool.unshift(this.toSchemaCard(card, true, source));
  }

  explainHuForSeat(seatId: SeatId, hand: Card[], responseCard: Card, wildcardCount: number) {
    return explainHu(hand, responseCard, {
      wildcardCount,
      wildcardPool: this.getWildcardPoolCards(seatId),
    });
  }

  buildOperationExecutorDeps(): OperationExecutorDeps {
    return {
      getHandWithoutPending: (id, card) => this.getHandWithoutPending(id, card),
      getWildcardPoolCards: (id) => this.getWildcardPoolCards(id),
      consumePlanCards: (id, handCards, poolCards) => this.consumePlanCards(id, handCards, poolCards),
      removeFromHand: (id, card) => this.removeFromHand(id, card),
      takeMatchingCards: (id, card, count) => this.takeMatchingCards(id, card, count),
      pushExposedGroup: (id, cards, highlight) => this.pushExposedGroup(id, cards, highlight),
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
    client.send("private_hand", hand.map((card) => ({ ...card, isHidden: false })));
  }
}

export function createRoomStateOps(
  state: GameState,
  playerHands: Map<string, Card[]>,
  getPendingOwnerId: () => string | null,
): RoomStateOps {
  return new RoomStateOps(state, playerHands, getPendingOwnerId);
}
