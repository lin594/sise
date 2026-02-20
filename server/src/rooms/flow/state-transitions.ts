import type { GameState } from "../../schema/game-state.schema.js";

export function applyTurnTransitionState(state: GameState, ownerId: string): void {
  state.currentPlayerId = ownerId;
  state.currentTurnPlayerId = ownerId;
  state.loopStage = "transition";
}

export function applyCollectivePollState(
  state: GameState,
  ownerId: string,
  previousPlayerId: string,
  pollOriginPlayerId: string,
  lastAction: string,
): void {
  state.responsePhase = "collective";
  state.currentPlayerId = ownerId;
  state.currentTurnPlayerId = ownerId;
  state.previousPlayerId = previousPlayerId;
  state.loopStage = "global_poll";
  state.activeResponderId = "";
  state.pollOriginPlayerId = pollOriginPlayerId;
  state.responseEndsAt = 0;
  state.lastAction = lastAction;
}

export function applyPlayingStartAfterDeclaring(
  state: GameState,
  dealerId: string,
  previousPlayerId: string,
): void {
  state.dealerId = dealerId;
  state.declareEndsAt = 0;
  state.phase = "playing";
  state.responsePhase = "local_draw";
  state.currentPlayerId = dealerId;
  state.currentTurnPlayerId = dealerId;
  state.previousPlayerId = previousPlayerId;
  state.loopStage = "transition";
  state.activeResponderId = "";
  state.pollOriginPlayerId = "";
  state.responseEndsAt = 0;
  state.lastAction = `DEALER ${dealerId}`;
}

export function applyEnterDiscardStageState(state: GameState, ownerId: string, tag: string): void {
  state.responsePhase = "local_draw";
  state.currentPlayerId = ownerId;
  state.lastAction = `${ownerId} ${tag}`;
}
