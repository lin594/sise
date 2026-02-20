import { CardSchema, GameState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

export interface LobbyResetContext {
  state: GameState;
  playerOrder: string[];
  botIds: Set<string>;
  playerHands: Map<string, Card[]>;
  baseNameBySeat: Map<string, string>;
  seatBySession: Map<string, string>;
  seatByToken: Map<string, string>;
  targetSeats: number;
  resetRuntime: () => void;
  syncAllPrivateHands: () => void;
  broadcastAvailableActions: () => void;
}

export function resetToLobby(context: LobbyResetContext): void {
  context.resetRuntime();

  const humanSeats = context.playerOrder.filter((seatId) => !context.botIds.has(seatId));
  const humanSet = new Set(humanSeats);

  for (const seatId of context.playerOrder) {
    if (humanSet.has(seatId)) {
      continue;
    }
    context.state.players.delete(seatId);
    context.playerHands.delete(seatId);
    context.baseNameBySeat.delete(seatId);
  }

  context.playerOrder.length = 0;
  context.playerOrder.push(...humanSeats);
  context.botIds.clear();

  const onlineSeatSet = new Set([...context.seatBySession.values()]);
  for (const seatId of context.playerOrder) {
    const player = context.state.players.get(seatId);
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
    context.playerHands.set(seatId, []);
    player.connected = onlineSeatSet.has(seatId);
    player.isBot = false;
    player.name = context.baseNameBySeat.get(seatId) ?? player.name;
  }

  if (!context.state.players.has(context.state.hostPlayerId) && context.playerOrder.length > 0) {
    context.state.hostPlayerId = context.playerOrder[0];
  }

  context.state.phase = "waiting";
  context.state.dealerId = "";
  context.state.currentPlayerId = "";
  context.state.responsePhase = "collective";
  context.state.deckCount = 0;
  context.state.declareEndsAt = 0;
  context.state.targetCard = new CardSchema();
  context.state.isMoCard = false;
  context.state.previousPlayerId = "";
  context.state.currentTurnPlayerId = "";
  context.state.loopStage = "";
  context.state.activeResponderId = "";
  context.state.pollOriginPlayerId = "";
  context.state.responseEndsAt = 0;
  context.state.publicDiscardPile.clear();
  context.state.responseCard = new CardSchema();
  context.state.lastAction = `LOBBY ${context.seatByToken.size}/${context.targetSeats}`;
  context.syncAllPrivateHands();
  context.broadcastAvailableActions();
}
