type SeatId = string;

export function iterateFromNext(playerOrder: SeatId[], startId: SeatId): SeatId[] {
  const idx = playerOrder.indexOf(startId);
  if (idx < 0) {
    return [...playerOrder];
  }
  const ordered: SeatId[] = [];
  for (let i = 1; i <= playerOrder.length; i += 1) {
    ordered.push(playerOrder[(idx + i) % playerOrder.length]);
  }
  return ordered;
}

export function getNextPlayerId(playerOrder: SeatId[], playerId: SeatId): SeatId {
  const idx = playerOrder.indexOf(playerId);
  if (idx < 0) {
    return playerOrder[0];
  }
  return playerOrder[(idx + 1) % playerOrder.length];
}

export function getPreviousPlayerId(playerOrder: SeatId[], playerId: SeatId): SeatId {
  const idx = playerOrder.indexOf(playerId);
  if (idx < 0) {
    return playerOrder[0];
  }
  return playerOrder[(idx - 1 + playerOrder.length) % playerOrder.length];
}
