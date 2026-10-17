import type { Card } from "../../rules/types.js";

export interface TableLocation {
  zone: "deck" | "center" | "hand" | "flow" | "meld";
  playerId?: string;
}
export interface TableTransition {
  id: number;
  round: number;
  kind: "draw" | "discard" | "flow" | "meld" | "hu";
  startsAt: number;
  endsAt: number;
  /** Public action being presented; independent of a later state cursor. */
  action?: string;
  moves: Array<{ card: Card; from: TableLocation; to: TableLocation }>;
}

/** One timeline for both hosts and every table viewer: travel, then readable landing. */
export function appendTableTransition(
  state: { tableEventSeq: number; completedRounds: number; presentationUntil: number; tableTransitionsJson: string },
  kind: TableTransition["kind"],
  moves: TableTransition["moves"],
  action: string,
  now = Date.now(),
  animated = true,
): TableTransition {
  const startsAt = Math.max(now, state.presentationUntil);
  // Draw includes the face-down pause and flip. Other actions share the
  // board's 200ms travel plus 500ms to read the action at its landing.
  const duration = animated ? (kind === "draw" ? 1200 : 700) : 0;
  const event: TableTransition = { id: ++state.tableEventSeq, round: state.completedRounds + 1,
    kind, action, startsAt, endsAt: startsAt + duration, moves };
  const previous = readTableTransitions(state.tableTransitionsJson).filter(item => item.round === event.round);
  state.tableTransitionsJson = JSON.stringify([...previous, event].slice(-32));
  state.presentationUntil = event.endsAt;
  return event;
}

export function readTableTransitions(json: string): TableTransition[] {
  try { return JSON.parse(json || "[]") as TableTransition[]; } catch { return []; }
}
