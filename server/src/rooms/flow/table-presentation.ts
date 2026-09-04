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
  moves: Array<{ card: Card; from: TableLocation; to: TableLocation }>;
}

export function readTableTransitions(json: string): TableTransition[] {
  try { return JSON.parse(json || "[]") as TableTransition[]; } catch { return []; }
}
