import type { GameState } from "../../schema/game-state.schema.js";

export interface RoundEndContext<RoundResultPlayer> {
  state: GameState;
  resetCollectivePolling: () => void;
  clearBotTimer: () => void;
  setPendingResponseNull: () => void;
  setAwaitingDiscardOwnerNull: () => void;
  broadcast: (event: string, payload: unknown) => void;
  buildRoundResultPlayers: (winnerId: string | null, groups: string[]) => RoundResultPlayer[];
  broadcastAvailableActions: () => void;
}

export function endRoundFlow<RoundResultPlayer>(
  context: RoundEndContext<RoundResultPlayer>,
  lastAction: string,
  winnerId: string | null = null,
  groups: string[] = [],
): void {
  context.state.phase = "ended";
  context.state.lastAction = lastAction;
  context.setPendingResponseNull();
  context.setAwaitingDiscardOwnerNull();
  context.resetCollectivePolling();
  context.clearBotTimer();
  context.state.loopStage = "";
  context.state.activeResponderId = "";
  context.state.pollOriginPlayerId = "";
  context.state.responseEndsAt = 0;

  if (winnerId) {
    context.broadcast("hu_result", { winnerId, groups });
  }

  context.broadcast("round_result", {
    winnerId,
    groups,
    players: context.buildRoundResultPlayers(winnerId, groups),
  });

  context.broadcastAvailableActions();
}
