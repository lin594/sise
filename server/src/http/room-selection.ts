export interface ListedRoom {
  roomId?: unknown;
  metadata?: {
    phase?: unknown;
    roomMode?: unknown;
  } | null;
}

export function isReusablePracticeLobbyRoom(room: ListedRoom | null | undefined): boolean {
  return room?.metadata?.phase === "waiting" && room.metadata.roomMode === "practice";
}
