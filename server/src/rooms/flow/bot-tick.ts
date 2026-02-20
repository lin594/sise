export type TickBotPlan =
  | "clear_and_broadcast"
  | "start_collective"
  | "schedule_bot_collective"
  | "schedule_collective_timeout"
  | "schedule_bot_owner"
  | "broadcast_only";

export interface TickBotInput {
  hasPending: boolean;
  phase: string;
  responsePhase: "collective" | "local_upper" | "local_draw";
  collectiveResponderId: string | null;
  pendingOwnerId: string;
  hasCollectiveTimer: boolean;
  isBot: (seatId: string) => boolean;
}

export function planTickBots(input: TickBotInput): TickBotPlan {
  if (!input.hasPending || input.phase !== "playing") {
    return "clear_and_broadcast";
  }

  if (input.responsePhase === "collective") {
    if (!input.collectiveResponderId) {
      return "start_collective";
    }
    if (input.isBot(input.collectiveResponderId)) {
      return "schedule_bot_collective";
    }
    if (!input.hasCollectiveTimer) {
      return "schedule_collective_timeout";
    }
    return "broadcast_only";
  }

  if (input.isBot(input.pendingOwnerId)) {
    return "schedule_bot_owner";
  }

  return "broadcast_only";
}
