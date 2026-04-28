import { isGold } from "./deck.js";
import type { Card, HuResult } from "./types.js";

type Counter = Map<string, number>;

type Candidate = {
  key: string;
  remove: string[];
  priority: number;
};

type ResolvedCandidate = {
  key: string;
  remove: string[];
};

type ResolvedSolution = {
  items: ResolvedCandidate[];
  score: number;
  groupedCount: number;
};

export interface HuExplainOptions {
  wildcardCount?: number;
  wildcardPool?: Card[];
}

export interface GroupingAnalysis {
  groupedCount: number;
  leftoverCount: number;
  score: number;
}

type GroupingCandidate = {
  groupedCount: number;
  leftoverCount: number;
  score: number;
};

const COLORS = ["yellow", "red", "green", "white"] as const;

function token(card: Card): string {
  if (isGold(card)) {
    return "gold";
  }
  return `${card.color}:${card.type}`;
}

function splitKey(key: string): { color: string; type: string } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) {
    return null;
  }
  return {
    color: key.slice(0, idx),
    type: key.slice(idx + 1),
  };
}

function makeCounter(cards: Card[]): Counter {
  const counter = new Map<string, number>();
  for (const card of cards) {
    const key = token(card);
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return counter;
}

function serialize(counter: Counter): string {
  return [...counter.entries()]
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}

function countPresent(counter: Counter, keys: string[]): number {
  const need = new Map<string, number>();
  for (const key of keys) {
    need.set(key, (need.get(key) ?? 0) + 1);
  }
  let present = 0;
  for (const [key, required] of need.entries()) {
    present += Math.min(counter.get(key) ?? 0, required);
  }
  return present;
}

function take(counter: Counter, keys: string[]): Counter | null {
  const present = countPresent(counter, keys);
  if (present !== keys.length) {
    return null;
  }
  const next = new Map(counter);
  for (const key of keys) {
    const value = next.get(key) ?? 0;
    if (value <= 0) {
      return null;
    }
    if (value === 1) {
      next.delete(key);
    } else {
      next.set(key, value - 1);
    }
  }
  return next;
}

function pickPivot(counter: Counter): string {
  let best = "";
  let bestCount = -1;
  for (const [key, count] of counter.entries()) {
    if (count > bestCount || (count === bestCount && key < best)) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function pushCandidate(candidates: Candidate[], key: string, remove: string[], priority: number, pivot: string): void {
  if (!remove.includes(pivot)) {
    return;
  }
  candidates.push({ key, remove, priority });
}

function listCandidatesForPivot(counter: Counter, pivot: string): Candidate[] {
  const candidates: Candidate[] = [];
  const pivotCount = counter.get(pivot) ?? 0;
  if (pivotCount <= 0) {
    return candidates;
  }

  if (pivot === "gold") {
    pushCandidate(candidates, "GoldQuad", ["gold", "gold", "gold", "gold"], 100, pivot);
    pushCandidate(candidates, "GoldTriplet", ["gold", "gold", "gold"], 90, pivot);
    pushCandidate(candidates, "SingleGold", ["gold"], 10, pivot);
    return candidates;
  }

  const parsed = splitKey(pivot);
  if (!parsed) {
    return candidates;
  }
  const { color, type } = parsed;

  if (type === "jiang") {
    pushCandidate(candidates, "JiangQuad", [pivot, pivot, pivot, pivot], 100, pivot);
    pushCandidate(candidates, "JiangTriplet", [pivot, pivot, pivot], 90, pivot);
    pushCandidate(candidates, "FrameJSX", [`${color}:jiang`, `${color}:shi`, `${color}:xiang`], 30, pivot);
    pushCandidate(candidates, "SingleJiang", [pivot], 10, pivot);
  } else {
    pushCandidate(candidates, "Quad", [pivot, pivot, pivot, pivot], 100, pivot);
    pushCandidate(candidates, "Triplet", [pivot, pivot, pivot], 90, pivot);
    pushCandidate(candidates, "Pair", [pivot, pivot], 20, pivot);

    if (type === "ju" || type === "ma" || type === "pao") {
      pushCandidate(candidates, "FrameJMP", [`${color}:ju`, `${color}:ma`, `${color}:pao`], 30, pivot);
    }

    if (type === "shi" || type === "xiang") {
      pushCandidate(candidates, "FrameJSX", [`${color}:jiang`, `${color}:shi`, `${color}:xiang`], 30, pivot);
    }

    if (type === "zu") {
      const others = COLORS.filter((c) => c !== color);
      for (let i = 0; i < others.length; i += 1) {
        for (let j = i + 1; j < others.length; j += 1) {
          pushCandidate(candidates, "TripleZu", [`${color}:zu`, `${others[i]}:zu`, `${others[j]}:zu`], 30, pivot);
        }
      }
      pushCandidate(candidates, "QuadZu", COLORS.map((c) => `${c}:zu`), 40, pivot);
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || b.remove.length - a.remove.length || a.key.localeCompare(b.key));
  return candidates;
}

function groupingScore(key: string): number {
  switch (key) {
    case "SingleGold":
      return 3;
    case "SingleJiang":
      return 1;
    case "FrameJMP":
    case "FrameJSX":
    case "TripleZu":
      return 1;
    case "QuadZu":
      return 2;
    case "Pair":
      return 0;
    case "Triplet":
    case "JiangTriplet":
      return 3;
    case "Quad":
    case "JiangQuad":
      return 6;
    case "GoldTriplet":
      return 9;
    case "GoldQuad":
      return 18;
    default:
      return 0;
  }
}

function consumeOne(counter: Counter, key: string): Counter | null {
  const value = counter.get(key) ?? 0;
  if (value <= 0) {
    return null;
  }
  const next = new Map(counter);
  if (value === 1) {
    next.delete(key);
  } else {
    next.set(key, value - 1);
  }
  return next;
}

function pickBetterGrouping(current: GroupingCandidate | null, next: GroupingCandidate): GroupingCandidate {
  if (!current) {
    return next;
  }
  if (next.leftoverCount !== current.leftoverCount) {
    return next.leftoverCount < current.leftoverCount ? next : current;
  }
  if (next.score !== current.score) {
    return next.score > current.score ? next : current;
  }
  if (next.groupedCount !== current.groupedCount) {
    return next.groupedCount > current.groupedCount ? next : current;
  }
  return current;
}

function analyzeGroupingDfs(counter: Counter, memo: Map<string, GroupingCandidate>): GroupingCandidate {
  if (counter.size === 0) {
    return {
      groupedCount: 0,
      leftoverCount: 0,
      score: 0,
    };
  }

  const key = serialize(counter);
  const cached = memo.get(key);
  if (cached) {
    return cached;
  }

  const pivot = pickPivot(counter);
  let best: GroupingCandidate | null = null;
  for (const candidate of listCandidatesForPivot(counter, pivot)) {
    const next = take(counter, candidate.remove);
    if (!next) {
      continue;
    }
    const child = analyzeGroupingDfs(next, memo);
    best = pickBetterGrouping(best, {
      groupedCount: child.groupedCount + candidate.remove.length,
      leftoverCount: child.leftoverCount,
      score: child.score + groupingScore(candidate.key),
    });
  }

  const leftoverNext = consumeOne(counter, pivot);
  if (leftoverNext) {
    const child = analyzeGroupingDfs(leftoverNext, memo);
    best = pickBetterGrouping(best, {
      groupedCount: child.groupedCount,
      leftoverCount: child.leftoverCount + 1,
      score: child.score,
    });
  }

  const resolved =
    best ??
    ({
      groupedCount: 0,
      leftoverCount: [...counter.values()].reduce((sum, count) => sum + count, 0),
      score: 0,
    } satisfies GroupingCandidate);
  memo.set(key, resolved);
  return resolved;
}

function pickBetterResolved(current: ResolvedSolution | null, next: ResolvedSolution): ResolvedSolution {
  if (!current) {
    return next;
  }
  if (next.score !== current.score) {
    return next.score > current.score ? next : current;
  }
  if (next.groupedCount !== current.groupedCount) {
    return next.groupedCount > current.groupedCount ? next : current;
  }
  return current;
}

function dfs(counter: Counter, memo: Map<string, ResolvedSolution | null>): ResolvedSolution | null {
  if (counter.size === 0) {
    return {
      items: [],
      score: 0,
      groupedCount: 0,
    };
  }

  const key = serialize(counter);
  if (memo.has(key)) {
    return memo.get(key) ?? null;
  }

  const pivot = pickPivot(counter);
  if (!pivot) {
    memo.set(key, null);
    return null;
  }

  let best: ResolvedSolution | null = null;
  for (const candidate of listCandidatesForPivot(counter, pivot)) {
    const next = take(counter, candidate.remove);
    if (!next) {
      continue;
    }
    const child = dfs(next, memo);
    if (child) {
      best = pickBetterResolved(best, {
        items: [{ key: candidate.key, remove: candidate.remove }, ...child.items],
        score: groupingScore(candidate.key) + child.score,
        groupedCount: candidate.remove.length + child.groupedCount,
      });
    }
  }

  memo.set(key, best);
  return best;
}

function resolveOptions(arg?: number | HuExplainOptions): Required<HuExplainOptions> {
  if (typeof arg === "number") {
    return {
      wildcardCount: Math.max(0, arg),
      wildcardPool: [],
    };
  }
  return {
    wildcardCount: Math.max(0, Number(arg?.wildcardCount ?? 0)),
    wildcardPool: Array.isArray(arg?.wildcardPool) ? arg.wildcardPool : [],
  };
}

export function validateHu(hand: Card[], responseCard: Card, options?: number | HuExplainOptions): boolean {
  return explainHu(hand, responseCard, options).valid;
}

export function explainHu(hand: Card[], responseCard: Card, options?: number | HuExplainOptions): HuResult {
  resolveOptions(options); // compatibility only: wildcard options are intentionally ignored.
  const allCards = [...hand, responseCard];
  const resolved = dfs(makeCounter(allCards), new Map());
  const cardBuckets = new Map<string, Card[]>();
  for (const card of allCards) {
    const key = token(card);
    const list = cardBuckets.get(key) ?? [];
    list.push(card);
    cardBuckets.set(key, list);
  }
  const details =
    resolved?.items.map(({ key, remove }) => {
      const cards: Card[] = [];
      for (const removeKey of remove) {
        const bucket = cardBuckets.get(removeKey) ?? [];
        const picked = bucket.shift();
        if (picked) {
          cards.push(picked);
        }
      }
      return { key, cards };
    }) ?? [];
  return {
    valid: Boolean(resolved),
    groups: resolved?.items.map((item) => item.key) ?? [],
    details,
  };
}

export function analyzeCardGrouping(cards: Card[]): GroupingAnalysis {
  const resolved = analyzeGroupingDfs(makeCounter(cards), new Map());
  return {
    groupedCount: resolved.groupedCount,
    leftoverCount: resolved.leftoverCount,
    score: resolved.score,
  };
}
