import type { MapSchema } from "@colyseus/schema";
import type { Card } from "../../rules/types.js";
import type { PlayerState } from "../../schema/game-state.schema.js";

export function getStateActionKeyword(action: string): string {
  const parts = action.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  if (parts[0].startsWith("seat_") || parts[0].startsWith("bot_")) {
    return parts[1] ?? "";
  }
  return parts[0];
}

export function shouldLogStateSnapshot(
  stateLogMode: "off" | "all" | "compact",
  lastAction: string,
  compactActions: Set<string>,
): boolean {
  if (stateLogMode === "off") {
    return false;
  }
  if (stateLogMode === "all") {
    return true;
  }
  return compactActions.has(getStateActionKeyword(lastAction));
}

export function summarizeCards(cards: Card[]): string {
  if (!cards.length) {
    return "-";
  }
  const counter = new Map<string, number>();
  for (const c of cards) {
    const key = `${c.color}:${c.type}`;
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return [...counter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join(",");
}

export function summarizeSchemaCards(cards: Iterable<{ color: string; type: string }>): string {
  const list = [...cards];
  if (!list.length) {
    return "-";
  }
  const counter = new Map<string, number>();
  for (const c of list) {
    const key = `${c.color}:${c.type}`;
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return [...counter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join(",");
}

export function summarizeAllPlayersCards(
  playerOrder: string[],
  playerHands: Map<string, Card[]>,
  players: MapSchema<PlayerState>,
): string {
  const parts: string[] = [];
  for (const seatId of playerOrder) {
    const hand = playerHands.get(seatId) ?? [];
    const p = players.get(seatId);
    const exposed = p?.exposedArea ?? [];
    const discard = p?.discardPile ?? [];
    const generals = p?.generalArea ?? [];
    const fish = p?.fishArea ?? [];
    parts.push(
      `${seatId}{h=${summarizeCards(hand)}|e=${summarizeSchemaCards(exposed)}|g=${summarizeSchemaCards(generals)}|d=${summarizeSchemaCards(discard)}|f=${summarizeSchemaCards(fish)}}`,
    );
  }
  return parts.join(" ; ");
}

export function buildHuSummaryBySeat(
  playerOrder: string[],
  huChecksBySeat: Map<string, { total: number; valid: number }>,
): string {
  return playerOrder
    .map((seatId) => {
      const s = huChecksBySeat.get(seatId) ?? { total: 0, valid: 0 };
      return `${seatId}:${s.valid}/${s.total}`;
    })
    .join(",");
}
