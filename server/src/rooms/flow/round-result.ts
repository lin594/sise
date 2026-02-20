import type { MapSchema } from "@colyseus/schema";
import type { Card } from "../../rules/types.js";
import type { PlayerState } from "../../schema/game-state.schema.js";

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  count: number;
  unit: number;
  total: number;
}

export interface RoundResultPlayer {
  clientId: string;
  name: string;
  hand: Card[];
  exposedArea: Card[];
  exposedGroupSizes: number[];
  generalArea: Card[];
  fishArea: Card[];
  discardCount: number;
  scoreBreakdown: ScoreBreakdownItem[];
  totalScore: number;
}

function getScoreRules(): Record<string, { label: string; unit: number }> {
  return {
    Pair: { label: "瀵瑰瓙", unit: 0 },
    FrameJMP: { label: "杞﹂┈鐐灦", unit: 1 },
    FrameJSX: { label: "灏嗗＋璞℃灦", unit: 1 },
    TripleZu: { label: "涓夊叺缁?", unit: 1 },
    QuadZu: { label: "鍥涘叺缁?", unit: 2 },
    Triplet: { label: "鍧?", unit: 3 },
    GoldTriplet: { label: "閲戞潯鍧?", unit: 9 },
    SingleJiang: { label: "鍗曞皢缁?", unit: 1 },
    SingleGold: { label: "鍗曢噾鏉＄粍", unit: 3 },
  };
}

export function buildScoreBreakdown(groups: string[]): { items: ScoreBreakdownItem[]; total: number } {
  const rules = getScoreRules();
  const counter = new Map<string, number>();
  for (const group of groups) {
    counter.set(group, (counter.get(group) ?? 0) + 1);
  }

  const items: ScoreBreakdownItem[] = [];
  let total = 0;
  for (const [key, count] of counter.entries()) {
    const rule = rules[key];
    const unit = rule?.unit ?? 0;
    const label = rule?.label ?? key;
    const lineTotal = unit * count;
    total += lineTotal;
    items.push({
      key,
      label,
      count,
      unit,
      total: lineTotal,
    });
  }
  items.sort((a, b) => b.total - a.total || b.unit - a.unit || a.key.localeCompare(b.key));
  return { items, total };
}

export function buildRoundResultPlayers(
  playerOrder: string[],
  players: MapSchema<PlayerState>,
  playerHands: Map<string, Card[]>,
  toPlainCard: (card: { id: string; color: string; type: string; source?: string }) => Card,
  winnerId: string | null,
  groups: string[],
): RoundResultPlayer[] {
  const winnerScore = winnerId ? buildScoreBreakdown(groups) : { items: [], total: 0 };
  const result: RoundResultPlayer[] = [];
  for (const seatId of playerOrder) {
    const player = players.get(seatId);
    const hand = playerHands.get(seatId) ?? [];
    const exposedArea = [...(player?.exposedArea ?? [])].map((card) => toPlainCard(card));
    const exposedGroupSizes = [...(player?.exposedGroupSizes ?? [])];
    const generalArea = [...(player?.generalArea ?? [])].map((card) => toPlainCard(card));
    const fishArea = [...(player?.fishArea ?? [])].map((card) => toPlainCard(card));
    const discardCount = player?.discardPile.length ?? 0;
    const isWinner = winnerId === seatId;
    result.push({
      clientId: seatId,
      name: player?.name ?? seatId,
      hand: hand.map((card) => toPlainCard(card)),
      exposedArea,
      exposedGroupSizes,
      generalArea,
      fishArea,
      discardCount,
      scoreBreakdown: isWinner ? winnerScore.items : [],
      totalScore: isWinner ? winnerScore.total : 0,
    });
  }
  return result;
}
