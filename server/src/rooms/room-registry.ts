export type PrivateStateSnapshot = {
  seatId: string;
  roomId: string;
  privateHand: Array<{
    id: string;
    color: string;
    type: string;
    source?: "upper" | "draw";
    isResponseCard?: boolean;
  }>;
  availableActions: unknown[];
  roundResult?: unknown;
};

export interface RegisteredRoom {
  getPrivateStateByToken(token: string): PrivateStateSnapshot | null;
}

const activeRooms = new Map<string, RegisteredRoom>();

export function registerRoom(roomId: string, room: RegisteredRoom): void {
  activeRooms.set(roomId, room);
}

export function unregisterRoom(roomId: string): void {
  activeRooms.delete(roomId);
}

export function getRegisteredRoom(roomId: string): RegisteredRoom | null {
  return activeRooms.get(roomId) ?? null;
}
