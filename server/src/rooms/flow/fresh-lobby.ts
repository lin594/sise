import { CardSchema, type GameState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

export interface FreshLobbyContext {
  state: GameState;
  targetSeats: number;
  clearBotTimer: () => void;
  clearDeclareTimer: () => void;
  resetCollectivePolling: () => void;
  setDeck: (deck: Card[]) => void;
  setPendingResponseNull: () => void;
  setPublicGeneralPool: (cards: Card[]) => void;
  setAwaitingDiscardOwnerNull: () => void;
  setRoundDealerNull: () => void;
  clearPlayerHands: () => void;
  setPlayerOrder: (order: string[]) => void;
  clearBotIds: () => void;
  clearSeatBySession: () => void;
  clearSeatByToken: () => void;
  clearBaseNameBySeat: () => void;
  broadcastAvailableActions: () => void;
}

export function resetToFreshLobbyFlow(ctx: FreshLobbyContext): void {
  ctx.clearBotTimer();
  ctx.clearDeclareTimer();
  ctx.resetCollectivePolling();
  ctx.setDeck([]);
  ctx.setPendingResponseNull();
  ctx.setPublicGeneralPool([]);
  ctx.setAwaitingDiscardOwnerNull();
  ctx.setRoundDealerNull();

  ctx.clearPlayerHands();
  ctx.setPlayerOrder([]);
  ctx.clearBotIds();
  ctx.clearSeatBySession();
  ctx.clearSeatByToken();
  ctx.clearBaseNameBySeat();

  ctx.state.players.clear();
  ctx.state.publicDiscardPile.clear();
  ctx.state.phase = "waiting";
  ctx.state.responsePhase = "collective";
  ctx.state.currentPlayerId = "";
  ctx.state.hostPlayerId = "";
  ctx.state.dealerId = "";
  ctx.state.deckCount = 0;
  ctx.state.declareEndsAt = 0;
  ctx.state.targetCard = new CardSchema();
  ctx.state.isMoCard = false;
  ctx.state.previousPlayerId = "";
  ctx.state.currentTurnPlayerId = "";
  ctx.state.loopStage = "";
  ctx.state.activeResponderId = "";
  ctx.state.pollOriginPlayerId = "";
  ctx.state.responseEndsAt = 0;
  ctx.state.responseCard = new CardSchema();
  ctx.state.lastAction = `LOBBY 0/${ctx.targetSeats}`;
  ctx.broadcastAvailableActions();
}
