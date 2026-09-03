import type { RoomStateSnapshot } from "@/types/game";

export function isPrivateHandSynchronized(
  snapshot: RoomStateSnapshot | null | undefined,
  seatId: string,
  privateHandCount: number,
): boolean {
  if (!snapshot || !seatId || !Number.isFinite(privateHandCount)) {
    return false;
  }

  const player = snapshot.players.find((candidate) => candidate.clientId === seatId);
  if (!player) {
    return false;
  }

  const publicHandCount = Number(player.handCount);
  if (!Number.isFinite(publicHandCount)) {
    return false;
  }

  return Math.max(0, Math.trunc(publicHandCount)) === Math.max(0, Math.trunc(privateHandCount));
}
