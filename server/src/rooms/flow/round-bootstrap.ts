import { PlayerState, type GameState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

export function ensureBotSeatsForStart(
  state: GameState,
  playerOrder: string[],
  playerHands: Map<string, Card[]>,
  botIds: Set<string>,
  targetSeats: number,
): void {
  while (playerOrder.length < targetSeats) {
    const seatId = `bot_${playerOrder.length + 1}`;
    if (state.players.has(seatId)) {
      continue;
    }
    const bot = new PlayerState();
    bot.clientId = seatId;
    bot.name = `BOT_${playerOrder.length + 1}`;
    bot.isBot = true;
    bot.connected = false;
    state.players.set(seatId, bot);
    playerOrder.push(seatId);
    playerHands.set(seatId, []);
    botIds.add(seatId);
  }

  for (const seatId of playerOrder) {
    const player = state.players.get(seatId);
    if (!player) {
      continue;
    }
    if (player.isBot) {
      botIds.add(seatId);
    } else {
      botIds.delete(seatId);
    }
  }
}

export function resetRoundPlayers(
  state: GameState,
  playerOrder: string[],
): void {
  for (const seatId of playerOrder) {
    const player = state.players.get(seatId);
    if (!player) {
      continue;
    }
    player.declaredKongs = 0;
    player.declaredReady = false;
    player.discardPile.clear();
    player.exposedArea.clear();
    player.exposedGroupSizes.clear();
    player.generalArea.clear();
    player.wildcardPool.clear();
    player.fishArea.clear();
  }
  state.publicDiscardPile.clear();
}

export function dealInitialHands(
  playerOrder: string[],
  dealerId: string,
  deck: Card[],
  playerHands: Map<string, Card[]>,
): void {
  for (const seatId of playerOrder) {
    const count = seatId === dealerId ? 21 : 20;
    const hand: Card[] = [];
    for (let i = 0; i < count; i += 1) {
      const card = deck.shift();
      if (card) {
        hand.push(card);
      }
    }
    playerHands.set(seatId, hand);
  }
}
