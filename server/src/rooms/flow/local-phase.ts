type SeatId = string;

export interface LocalPhasePlan {
  localOwnerId: SeatId;
  responsePhase: "local_upper" | "local_draw";
  rebindPendingOwner: boolean;
}

export function planLocalPhaseAfterNoResponse(
  ownerId: SeatId,
  cardSource: "upper" | "draw" | undefined,
  nextPlayerId: SeatId,
): LocalPhasePlan {
  const fromDraw = cardSource === "draw";
  return {
    localOwnerId: fromDraw ? ownerId : nextPlayerId,
    responsePhase: fromDraw ? "local_draw" : "local_upper",
    rebindPendingOwner: !fromDraw,
  };
}

export function shouldEndDrawAfterUpperPass(deckCount: number): boolean {
  return deckCount <= 8;
}
