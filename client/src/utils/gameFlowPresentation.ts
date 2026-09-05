export type CardPlacement = "center" | "flow" | "meld" | "hidden";

export interface ResponseCardPlacementInput {
  phase: string;
  responsePhase: string;
  hasResponseCard: boolean;
  currentPlayerId: string;
  viewerPlayerId: string;
  viewerHasLegalChi: boolean;
}

export function getRoundKey(
  roomId: string | undefined,
  completedRounds: number | undefined,
  phase: string | undefined,
): string {
  const completed = Math.max(0, Number(completedRounds ?? 0));
  const roundNumber = phase === "ended" ? Math.max(1, completed) : completed + 1;
  return `${roomId || "room"}:${roundNumber}`;
}

export function projectResponseCardPlacement(input: ResponseCardPlacementInput): CardPlacement {
  if (!input.hasResponseCard || input.phase !== "playing") {
    return "hidden";
  }
  if (input.responsePhase !== "local_upper") {
    return "center";
  }
  const isReceiver = Boolean(input.viewerPlayerId) && input.currentPlayerId === input.viewerPlayerId;
  return isReceiver && input.viewerHasLegalChi ? "center" : "flow";
}

export function isQuietSelfDiscardWait(input: {
  responsePhase: string;
  responseSource?: string;
  originPlayerId?: string;
  viewerPlayerId?: string;
}): boolean {
  return input.responsePhase === "collective" &&
    input.responseSource === "upper" &&
    Boolean(input.viewerPlayerId) &&
    input.originPlayerId === input.viewerPlayerId;
}
