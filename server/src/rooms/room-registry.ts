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
  decisionTimer: {
    untimed: boolean;
    canRequestMoreTime: boolean;
    extensionSeconds: number;
    totalMs: number;
    endsAt: number;
    decisionKey: string;
  };
  roundResult?: unknown;
};

export interface RegisteredRoom {
  getPrivateStateByToken(token: string): PrivateStateSnapshot | null;
  exportRecoverySnapshot(now?: number): import("./room-recovery.js").RoomRecoverySnapshot;
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

export function getRegisteredRooms(): RegisteredRoom[] {
  return [...activeRooms.values()];
}
