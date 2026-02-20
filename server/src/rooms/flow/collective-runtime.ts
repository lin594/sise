import { resolveNextCollectiveResponder } from "./collective-polling.js";
import type { ActionType, Card } from "../../rules/types.js";

type SeatId = string;

export interface PendingCollective {
  ownerId: SeatId;
  card: Card;
  collectives: Map<SeatId, ActionType>;
}

export interface StartCollectiveDeps {
  pending: PendingCollective | null;
  responsePhase: "collective" | "local_upper" | "local_draw";
  pollOriginPlayerId: string;
  setLoopStageGlobal: () => void;
  setPollOriginPlayerId: (id: string) => void;
  clearBotTimer: () => void;
  clearCollectiveTimer: () => void;
  setQueue: (queue: SeatId[]) => void;
  getOrder: (pending: PendingCollective) => SeatId[];
  resetCursorAndResponder: () => void;
  advance: () => void;
  resetAndBroadcast: () => void;
}

export function startCollectiveFlow(deps: StartCollectiveDeps): void {
  if (!deps.pending || deps.responsePhase !== "collective") {
    deps.resetAndBroadcast();
    return;
  }
  deps.setLoopStageGlobal();
  if (!deps.pollOriginPlayerId) {
    deps.setPollOriginPlayerId(deps.pending.ownerId);
  }
  deps.clearBotTimer();
  deps.clearCollectiveTimer();
  deps.setQueue(deps.getOrder(deps.pending));
  deps.resetCursorAndResponder();
  deps.advance();
}

export interface AdvanceCollectiveDeps {
  pending: PendingCollective | null;
  hasResponded: (seatId: SeatId) => boolean;
  responsePhase: "collective" | "local_upper" | "local_draw";
  clearBotTimer: () => void;
  clearCollectiveTimer: () => void;
  queue: SeatId[];
  cursor: number;
  hasActionBeyondPass: (seatId: SeatId) => boolean;
  setCollectivePass: (seatId: SeatId) => void;
  setCursor: (cursor: number) => void;
  setResponder: (responderId: SeatId | null) => void;
  setActiveResponder: (responderId: SeatId | "") => void;
  setCurrentPlayer: (seatId: SeatId) => void;
  setCurrentTurnPlayer: (seatId: SeatId) => void;
  isBot: (seatId: SeatId) => boolean;
  scheduleBotStep: () => void;
  scheduleCollectiveTimeout: () => void;
  broadcastAvailableActions: () => void;
  clearResponseEndsAt: () => void;
  resolveCollectivePhase: () => void;
  resetAndBroadcast: () => void;
}

export function advanceCollectiveFlow(deps: AdvanceCollectiveDeps): void {
  if (!deps.pending || deps.responsePhase !== "collective") {
    deps.resetAndBroadcast();
    return;
  }

  deps.clearBotTimer();
  deps.clearCollectiveTimer();

  const next = resolveNextCollectiveResponder({
    queue: deps.queue,
    cursor: deps.cursor,
    hasResponded: (seatId) => deps.hasResponded(seatId),
    hasActionBeyondPass: (seatId) => deps.hasActionBeyondPass(seatId),
  });
  for (const seatId of next.forcedPassIds) {
    deps.setCollectivePass(seatId);
  }

  if (next.responderId) {
    deps.setCursor(next.nextCursor);
    deps.setResponder(next.responderId);
    deps.setCurrentPlayer(next.responderId);
    deps.setCurrentTurnPlayer(next.responderId);
    deps.setActiveResponder(next.responderId);
    if (deps.isBot(next.responderId)) {
      deps.scheduleBotStep();
    } else {
      deps.scheduleCollectiveTimeout();
    }
    deps.broadcastAvailableActions();
    return;
  }

  deps.setCursor(next.nextCursor);
  deps.setResponder(null);
  deps.setActiveResponder("");
  deps.clearResponseEndsAt();
  deps.resolveCollectivePhase();
}
