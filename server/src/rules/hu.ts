import { isGold } from "./deck.js";
import type { Card, HuResult } from "./types.js";

type Counter = Map<string, number>;

type Candidate = {
  key: string;
  remove: string[];
  priority: number;
};

export interface HuExplainOptions {
  wildcardCount?: number;
  wildcardPool?: Card[];
}

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
    pushCandidate(candidates, "SingleJiang", [pivot], 10, pivot);
  } else {
    pushCandidate(candidates, "Triplet", [pivot, pivot, pivot], 90, pivot);
    pushCandidate(candidates, "Pair", [pivot, pivot], 20, pivot);

    if (type === "ju" || type === "ma" || type === "pao") {
      pushCandidate(candidates, "FrameJMP", [`${color}:ju`, `${color}:ma`, `${color}:pao`], 30, pivot);
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

function dfs(counter: Counter, memo: Map<string, string[] | null>): string[] | null {
  if (counter.size === 0) {
    return [];
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

  for (const candidate of listCandidatesForPivot(counter, pivot)) {
    const next = take(counter, candidate.remove);
    if (!next) {
      continue;
    }
    const child = dfs(next, memo);
    if (child) {
      const solved = [candidate.key, ...child];
      memo.set(key, solved);
      return solved;
    }
  }

  memo.set(key, null);
  return null;
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
  const groups = dfs(makeCounter(allCards), new Map());
  return {
    valid: Boolean(groups),
    groups: groups ?? [],
  };
}
