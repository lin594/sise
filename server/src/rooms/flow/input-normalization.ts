import type { ActionType } from "../../rules/types.js";

export function normalizeAction(action: ActionType): ActionType {
  if (action === "open") {
    return "kai";
  }
  if (action === "eat") {
    return "chi";
  }
  if (action === "grab") {
    return "pass";
  }
  return action;
}

export function normalizeName(input: unknown): string {
  const name = String(input ?? "").trim();
  return name.slice(0, 24);
}

export function normalizeToken(input: unknown): string {
  return String(input ?? "").trim().slice(0, 128);
}

export function generateToken(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function pickRandomDealerId(playerOrder: string[]): string {
  if (!playerOrder.length) {
    return "";
  }
  const idx = Math.floor(Math.random() * playerOrder.length);
  return playerOrder[idx];
}
