import { PlayerState, type GameState } from "../../schema/game-state.schema.js";
import type { Card } from "../../rules/types.js";

export interface SeatCreateContext {
  state: GameState;
  seatByTokenSize: number;
  playerOrder: string[];
  playerHands: Map<string, Card[]>;
  baseNameBySeat: Map<string, string>;
  seatByToken: Map<string, string>;
  seatBySession: Map<string, string>;
  botIds: Set<string>;
}

export function createHumanSeatFlow(
  ctx: SeatCreateContext,
  sessionId: string,
  token: string,
  rawName: string,
): string {
  const seatId = `seat_${ctx.seatByTokenSize + 1}`;
  const name = rawName || `玩家${ctx.seatByTokenSize + 1}`;

  const player = new PlayerState();
  player.clientId = seatId;
  player.name = name;
  player.isBot = false;
  player.connected = true;
  ctx.state.players.set(seatId, player);

  ctx.playerOrder.push(seatId);
  ctx.playerHands.set(seatId, []);
  ctx.baseNameBySeat.set(seatId, name);
  ctx.seatByToken.set(token, seatId);
  ctx.seatBySession.set(sessionId, seatId);
  ctx.botIds.delete(seatId);

  if (!ctx.state.hostPlayerId) {
    ctx.state.hostPlayerId = seatId;
  }

  return seatId;
}

export interface SeatReclaimContext {
  state: GameState;
  baseNameBySeat: Map<string, string>;
  botIds: Set<string>;
  seatBySession: Map<string, string>;
  seatByToken: Map<string, string>;
}

export function reclaimSeatStateFlow(
  ctx: SeatReclaimContext,
  sessionId: string,
  seatId: string,
  token: string,
  rawName: string,
): boolean {
  const player = ctx.state.players.get(seatId);
  if (!player) {
    return false;
  }

  const name = rawName || ctx.baseNameBySeat.get(seatId) || player.name;
  ctx.baseNameBySeat.set(seatId, name);
  player.name = name;
  player.connected = true;
  player.isBot = false;
  ctx.botIds.delete(seatId);
  ctx.seatBySession.set(sessionId, seatId);
  ctx.seatByToken.set(token, seatId);
  return true;
}
