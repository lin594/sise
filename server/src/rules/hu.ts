import { isGold } from "./deck.js";
import type { Card, HuResult } from "./types.js";

type Counter = Map<string, number>;

type Candidate = {
  key: string;
  remove: string[];
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

function countWildcardTokens(counter: Counter): number {
  let total = 0;
  for (const [key, value] of counter.entries()) {
    if (value <= 0 || !isWildcardToken(key)) {
      continue;
    }
    total += value;
  }
  return total;
}

function takeWithWild(counter: Counter, keys: string[], wild: number): { next: Counter; wildLeft: number } | null {
  const next = new Map(counter);
  let wildLeft = wild;
  let wildcardUsedInGroup = 0;
  for (const key of keys) {
    const value = next.get(key) ?? 0;
    if (value > 0) {
      if (value === 1) {
        next.delete(key);
      } else {
        next.set(key, value - 1);
      }
      continue;
    }
    // 规则约束：单个牌组最多使用 1 张万能牌进行替代。
    if (wildcardUsedInGroup >= 1) {
      return null;
    }
    if (consumeWildcardToken(next)) {
      wildcardUsedInGroup += 1;
      continue;
    }
    if (wildLeft <= 0) {
      return null;
    }
    wildLeft -= 1;
    wildcardUsedInGroup += 1;
  }
  return { next, wildLeft };
}

function isWildcardToken(key: string): boolean {
  if (key === "gold") {
    return true;
  }
  return key.endsWith(":jiang");
}

function consumeWildcardToken(counter: Counter): boolean {
  for (const [key, value] of counter.entries()) {
    if (!isWildcardToken(key) || value <= 0) {
      continue;
    }
    if (value === 1) {
      counter.delete(key);
    } else {
      counter.set(key, value - 1);
    }
    return true;
  }
  return false;
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

function pickPivot(counter: Counter): string {
  let best = "";
  let bestCount = -1;
  let bestIsZu = 1;

  for (const [key, count] of counter.entries()) {
    const parsed = splitKey(key);
    const isZu = parsed?.type === "zu" ? 1 : 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
      bestIsZu = isZu;
      continue;
    }
    if (count === bestCount && isZu < bestIsZu) {
      best = key;
      bestIsZu = isZu;
      continue;
    }
    if (count === bestCount && isZu === bestIsZu && key < best) {
      best = key;
    }
  }

  return best;
}

function candidatePriority(name: string): number {
  switch (name) {
    case "GoldTriplet":
      return 7;
    case "Triplet":
      return 6;
    case "QuadZu":
      return 5;
    case "TripleZu":
      return 4;
    case "FrameJMP":
    case "FrameJSX":
      return 3;
    case "Pair":
      return 2;
    case "SingleGold":
    case "SingleJiang":
      return 1;
    default:
      return 0;
  }
}

function listCandidatesForPivot(counter: Counter, pivot: string, wild: number): Candidate[] {
  const candidates: Candidate[] = [];
  const dedup = new Set<string>();

  const push = (name: string, remove: string[]) => {
    if (!remove.includes(pivot)) {
      return;
    }
    const need = remove.length;
    const present = countPresent(counter, remove);
    if (present <= 0) {
      return;
    }
    const missing = need - present;
    // 规则约束：同一牌组最多补 1 张万能牌。
    if (missing > 1) {
      return;
    }
    if (missing > wild + countWildcardTokens(counter)) {
      return;
    }

    const dedupKey = `${name}|${[...remove].sort().join(",")}`;
    if (dedup.has(dedupKey)) {
      return;
    }
    dedup.add(dedupKey);
    candidates.push({ key: name, remove });
  };

  const pivotCount = counter.get(pivot) ?? 0;
  if (pivotCount <= 0) {
    return candidates;
  }

  if (pivot === "gold") {
    push("GoldTriplet", ["gold", "gold", "gold"]);
    push("Pair", ["gold", "gold"]);
    push("SingleGold", ["gold"]);
  } else {
    const parsed = splitKey(pivot);
    if (!parsed) {
      return candidates;
    }
    const { color, type } = parsed;

    push("Pair", [pivot, pivot]);
    if (type !== "jiang") {
      push("Triplet", [pivot, pivot, pivot]);
    }
    if (type === "jiang") {
      push("SingleJiang", [pivot]);
    }

    if (type === "ju" || type === "ma" || type === "pao") {
      push("FrameJMP", [`${color}:ju`, `${color}:ma`, `${color}:pao`]);
    }
    if (type === "jiang" || type === "shi" || type === "xiang") {
      push("FrameJSX", [`${color}:jiang`, `${color}:shi`, `${color}:xiang`]);
    }

    if (type === "zu") {
      const others = COLORS.filter((c) => c !== color);
      for (let i = 0; i < others.length; i += 1) {
        for (let j = i + 1; j < others.length; j += 1) {
          push("TripleZu", [`${color}:zu`, `${others[i]}:zu`, `${others[j]}:zu`]);
        }
      }
      push("QuadZu", COLORS.map((c) => `${c}:zu`));
    }
  }

  candidates.sort((a, b) => {
    const lenDiff = b.remove.length - a.remove.length;
    if (lenDiff !== 0) {
      return lenDiff;
    }
    return candidatePriority(b.key) - candidatePriority(a.key);
  });
  return candidates;
}

function dfs(counter: Counter, wild: number, memo: Map<string, string[] | null>): string[] | null {
  if (counter.size === 0) {
    return [];
  }

  const key = `${serialize(counter)}|w=${wild}`;
  if (memo.has(key)) {
    return memo.get(key) ?? null;
  }

  const pivot = pickPivot(counter);
  if (!pivot) {
    memo.set(key, null);
    return null;
  }

  for (const candidate of listCandidatesForPivot(counter, pivot, wild)) {
    const taken = takeWithWild(counter, candidate.remove, wild);
    if (!taken) {
      continue;
    }
    const child = dfs(taken.next, taken.wildLeft, memo);
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
    wildcardPool: Array.isArray(arg?.wildcardPool) ? arg!.wildcardPool : [],
  };
}

export function validateHu(hand: Card[], responseCard: Card, options?: number | HuExplainOptions): boolean {
  return explainHu(hand, responseCard, options).valid;
}

export function explainHu(hand: Card[], responseCard: Card, options?: number | HuExplainOptions): HuResult {
  const resolved = resolveOptions(options);
  const allCards = [...hand, ...resolved.wildcardPool, responseCard];
  const groups = dfs(makeCounter(allCards), resolved.wildcardCount, new Map());
  return {
    valid: Boolean(groups),
    groups: groups ?? [],
  };
}
