import { isGeneral, isGold } from "./deck.js";
import type { Card, HuResult } from "./types.js";

type Counter = Map<string, number>;

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

function take(counter: Counter, keys: string[]): Counter | null {
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

function listCandidates(counter: Counter): Array<{ key: string; remove: string[] }> {
  const candidates: Array<{ key: string; remove: string[] }> = [];
  const dedup = new Set<string>();

  const push = (name: string, remove: string[]) => {
    const dedupKey = `${name}|${[...remove].sort().join(",")}`;
    if (dedup.has(dedupKey)) {
      return;
    }
    dedup.add(dedupKey);
    candidates.push({ key: name, remove });
  };

  for (const [k, c] of counter.entries()) {
    if (k.endsWith(":jiang") && c >= 1) {
      push("单将组", [k]);
    }
    if (k === "gold" && c >= 1) {
      push("单金条组", [k]);
    }
    if (c >= 2) {
      push("对子", [k, k]);
    }
    if (c >= 3 && k !== "gold" && !k.endsWith(":jiang")) {
      push("普通坎", [k, k, k]);
    }
  }

  if ((counter.get("gold") ?? 0) >= 3) {
    push("金条坎", ["gold", "gold", "gold"]);
  }

  const colors = ["yellow", "red", "green", "white"];
  for (const color of colors) {
    const frameA = [`${color}:ju`, `${color}:ma`, `${color}:pao`];
    if (frameA.every((k) => (counter.get(k) ?? 0) > 0)) {
      push("车马炮架", frameA);
    }
    const frameB = [`${color}:jiang`, `${color}:shi`, `${color}:xiang`];
    if (frameB.every((k) => (counter.get(k) ?? 0) > 0)) {
      push("将士象架", frameB);
    }
  }

  const zuColors = colors.filter((color) => (counter.get(`${color}:zu`) ?? 0) > 0);
  if (zuColors.length >= 3) {
    for (let i = 0; i < zuColors.length; i += 1) {
      for (let j = i + 1; j < zuColors.length; j += 1) {
        for (let k = j + 1; k < zuColors.length; k += 1) {
          const remove = [`${zuColors[i]}:zu`, `${zuColors[j]}:zu`, `${zuColors[k]}:zu`];
          push("三异色卒", remove);
        }
      }
    }
  }
  if (zuColors.length === 4) {
    push("四异色卒", colors.map((color) => `${color}:zu`));
  }

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

  for (const candidate of listCandidates(counter)) {
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

export function validateHu(hand: Card[], responseCard: Card): boolean {
  return explainHu(hand, responseCard).valid;
}

export function explainHu(hand: Card[], responseCard: Card): HuResult {
  const allCards = [...hand, responseCard];
  const groups = dfs(makeCounter(allCards), new Map());
  return {
    valid: Boolean(groups),
    groups: groups ?? [],
  };
}

