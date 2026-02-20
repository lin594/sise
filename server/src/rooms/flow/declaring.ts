import type { PlayerState } from "../../schema/game-state.schema.js";

type SeatId = string;

export interface StartDeclaringDeps {
  playerOrder: SeatId[];
  getPlayer: (seatId: SeatId) => PlayerState | undefined;
  submitDeclaration: (seatId: SeatId, force: boolean) => void;
  syncAllPrivateHands: () => void;
  broadcastAvailableActions: () => void;
  allReady: () => boolean;
  finishDeclaringPhase: () => void;
  scheduleDeclareTimeout: () => void;
}

export function startDeclaringFlow(deps: StartDeclaringDeps): void {
  for (const seatId of deps.playerOrder) {
    const player = deps.getPlayer(seatId);
    if (!player || player.declaredReady) {
      continue;
    }
    if (player.isBot) {
      deps.submitDeclaration(seatId, true);
    }
  }

  deps.syncAllPrivateHands();
  deps.broadcastAvailableActions();
  if (deps.allReady()) {
    deps.finishDeclaringPhase();
    return;
  }
  deps.scheduleDeclareTimeout();
}

export interface TimeoutDeclaringDeps {
  playerOrder: SeatId[];
  getPlayer: (seatId: SeatId) => PlayerState | undefined;
  submitDeclaration: (seatId: SeatId, force: boolean) => void;
  allReady: () => boolean;
  finishDeclaringPhase: () => void;
}

export function runDeclaringTimeoutFlow(deps: TimeoutDeclaringDeps): void {
  for (const seatId of deps.playerOrder) {
    const player = deps.getPlayer(seatId);
    if (!player || player.declaredReady) {
      continue;
    }
    deps.submitDeclaration(seatId, true);
  }
  if (deps.allReady()) {
    deps.finishDeclaringPhase();
  }
}
