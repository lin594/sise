export type StartGameDecision =
  | { ok: true }
  | { ok: false; reason: "not_waiting" | "not_host" | "not_enough_players" };

export function decideStartGame(
  seatId: string | undefined,
  phase: string,
  hostPlayerId: string,
  humanCount: number,
  minPlayersToStart: number,
): StartGameDecision {
  if (!seatId) {
    return { ok: false, reason: "not_host" };
  }
  if (phase !== "waiting") {
    return { ok: false, reason: "not_waiting" };
  }
  if (seatId !== hostPlayerId) {
    return { ok: false, reason: "not_host" };
  }
  if (humanCount < minPlayersToStart) {
    return { ok: false, reason: "not_enough_players" };
  }
  return { ok: true };
}

export function canStartNextRound(seatId: string | undefined, phase: string, hostPlayerId: string): boolean {
  if (!seatId || phase !== "ended") {
    return false;
  }
  return seatId === hostPlayerId;
}

export function canReturnLobby(seatId: string | undefined, phase: string): boolean {
  return Boolean(seatId && phase === "ended");
}
