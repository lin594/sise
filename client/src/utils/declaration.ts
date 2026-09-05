import type { Card } from "../types/game";

export interface FishOption {
  id: string;
  title: string;
  cards: Card[];
  kind: "regular" | "gold-4" | "gold-5";
}

export interface HiddenKongAnalysis {
  count: number;
  cardIds: Set<string>;
}

export function buildFishOptions(hand: Card[]): FishOption[] {
  const options: FishOption[] = [];
  const grouped = new Map<string, Card[]>();
  const goldCards: Card[] = [];

  for (const card of hand) {
    if (card.color === "gold") {
      goldCards.push(card);
      continue;
    }
    const key = `${card.color}:${card.type}`;
    const cards = grouped.get(key) ?? [];
    cards.push(card);
    grouped.set(key, cards);
  }

  for (const [key, cards] of grouped.entries()) {
    if (cards.length < 4) {
      continue;
    }
    options.push({
      id: `fish:${key}`,
      title: "普通鱼",
      cards: cards.slice(0, 4),
      kind: "regular",
    });
  }

  if (goldCards.length >= 4) {
    options.push({
      id: "fish:gold:4",
      title: "金条鱼（4张）",
      cards: goldCards.slice(0, 4),
      kind: "gold-4",
    });
  }
  if (goldCards.length >= 5) {
    options.push({
      id: "fish:gold:5",
      title: "金条鱼（5张）",
      cards: goldCards.slice(0, 5),
      kind: "gold-5",
    });
  }

  return options;
}

export function getRecommendedFishOptionIds(options: FishOption[]): Set<string> {
  const selected = new Set(
    options.filter((option) => option.kind === "regular").map((option) => option.id),
  );
  const preferredGold = options.find((option) => option.kind === "gold-5")
    ?? options.find((option) => option.kind === "gold-4");
  if (preferredGold) {
    selected.add(preferredGold.id);
  }
  return selected;
}

export function toggleFishOptionId(selectedIds: Set<string>, option: FishOption): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(option.id)) {
    next.delete(option.id);
    return next;
  }
  if (option.kind === "gold-4" || option.kind === "gold-5") {
    next.delete("fish:gold:4");
    next.delete("fish:gold:5");
  }
  next.add(option.id);
  return next;
}

export function getSelectedFishCardIds(options: FishOption[], selectedIds: Set<string>): Set<string> {
  const cardIds = new Set<string>();
  for (const option of options) {
    if (!selectedIds.has(option.id)) {
      continue;
    }
    for (const card of option.cards) {
      cardIds.add(card.id);
    }
  }
  return cardIds;
}

export function analyzeHiddenKongs(hand: Card[], excludedCardIds: Set<string>): HiddenKongAnalysis {
  const grouped = new Map<string, Card[]>();
  const goldCards: Card[] = [];

  for (const card of hand) {
    if (excludedCardIds.has(card.id)) {
      continue;
    }
    if (card.color === "gold") {
      goldCards.push(card);
      continue;
    }
    const key = `${card.color}:${card.type}`;
    const cards = grouped.get(key) ?? [];
    cards.push(card);
    grouped.set(key, cards);
  }

  const cardIds = new Set<string>();
  let count = 0;
  for (const cards of grouped.values()) {
    const groupCount = Math.floor(cards.length / 3);
    count += groupCount;
    cards.slice(0, groupCount * 3).forEach((card) => cardIds.add(card.id));
  }
  const goldGroupCount = Math.floor(goldCards.length / 3);
  count += goldGroupCount;
  goldCards.slice(0, goldGroupCount * 3).forEach((card) => cardIds.add(card.id));

  return { count, cardIds };
}

export function reconcileDeclaredKongs(current: number, nextMaximum: number, wasTouched: boolean): number {
  const maximum = Math.max(0, Math.floor(nextMaximum));
  if (!wasTouched) {
    return maximum;
  }
  return Math.min(maximum, Math.max(0, Math.floor(current)));
}

export function getDeclarationStartLabel(fishCount: number, kongCount: number): string {
  const fish = Math.max(0, Math.trunc(fishCount));
  const kongs = Math.max(0, Math.trunc(kongCount));
  if (fish === 0 && kongs === 0) {
    return "开始游戏";
  }
  if (fish > 0 && kongs > 0) return `开始游戏 · 鱼 ${fish} · 坎 ${kongs}`;
  if (fish > 0) return `开始游戏 · 鱼 ${fish}`;
  return `开始游戏 · 坎 ${kongs}`;
}
