type SeatId = string;

export interface CollectiveCursorInput {
  queue: SeatId[];
  cursor: number;
  hasResponded: (seatId: SeatId) => boolean;
  hasActionBeyondPass: (seatId: SeatId) => boolean;
}

export interface CollectiveCursorResult {
  nextCursor: number;
  responderId: SeatId | null;
  forcedPassIds: SeatId[];
}

export function resolveNextCollectiveResponder(input: CollectiveCursorInput): CollectiveCursorResult {
  let cursor = input.cursor;
  const forcedPassIds: SeatId[] = [];

  while (cursor < input.queue.length) {
    const seatId = input.queue[cursor];
    if (input.hasResponded(seatId)) {
      cursor += 1;
      continue;
    }
    if (!input.hasActionBeyondPass(seatId)) {
      forcedPassIds.push(seatId);
      cursor += 1;
      continue;
    }
    return {
      nextCursor: cursor,
      responderId: seatId,
      forcedPassIds,
    };
  }

  return {
    nextCursor: cursor,
    responderId: null,
    forcedPassIds,
  };
}
