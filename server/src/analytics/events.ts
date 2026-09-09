import { createHmac } from "node:crypto";
import { normalizeGuestProfileToken } from "../profiles/guest-profile-store.js";

export const EVENT_NAMES = ["context_hint_shown", "context_hint_disabled", "app_open", "lobby_view", "practice_start", "quick_match_start", "friend_room_create", "invite_open", "invite_join_success", "round_start", "round_complete", "play_again", "room_exit", "join_failed", "reconnect_started", "reconnect_success", "reconnect_failed", "action_rejected", "join_success"] as const;
export type EventName = typeof EVENT_NAMES[number];
export type RoomMode = "practice" | "match" | "friends" | "tutorial";
export const AUTHORITY_EVENTS = new Set<EventName>(["round_start", "round_complete", "invite_join_success", "action_rejected", "join_success"]);
export interface ProductEventInput {
  name: EventName;
  id: string;
  visitId?: string;
  mode?: RoomMode;
  humans?: number;
  outcome?: "started" | "ready" | "failed";
  durationMs?: number;
  persistent?: boolean;
}
export interface AnonymousEvent {
  name: EventName;
  id: string;
  actor: string;
  visit: string;
  source: "client" | "server";
  mode: RoomMode | "unknown";
  humans: number;
  outcome: "started" | "ready" | "failed";
  durationMs: number | null;
  persistent: boolean;
  at: number;
}
const INPUT_FIELDS = new Set(["name", "id", "visitId", "mode", "humans", "outcome", "durationMs", "persistent"]);
export function validateProductEvent(value: unknown, source: "client" | "server"): value is ProductEventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !INPUT_FIELDS.has(key))) return false;
  if (!EVENT_NAMES.includes(v.name as EventName) || typeof v.id !== "string" || !/^[a-zA-Z0-9:_-]{1,160}$/.test(v.id)) return false;
  if (source === "client" && AUTHORITY_EVENTS.has(v.name as EventName)) return false;
  if (v.visitId !== undefined && (typeof v.visitId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.visitId))) return false;
  if (v.mode !== undefined && !["practice", "match", "friends", "tutorial"].includes(String(v.mode))) return false;
  if (v.humans !== undefined && (!Number.isInteger(v.humans) || Number(v.humans) < 0 || Number(v.humans) > 4 || source === "client")) return false;
  if (v.outcome !== undefined && !["started", "ready", "failed"].includes(String(v.outcome))) return false;
  if (v.durationMs !== undefined && (!Number.isInteger(v.durationMs) || Number(v.durationMs) < 0 || Number(v.durationMs) > 600_000)) return false;
  return v.persistent === undefined || typeof v.persistent === "boolean";
}
export function anonymizeEvent(input: unknown, token: string, secret: string, source: "client" | "server", at = Date.now()): AnonymousEvent | null {
  const normalizedToken = normalizeGuestProfileToken(token);
  if (secret.length < 32 || !normalizedToken || !validateProductEvent(input, source)) return null;
  const digest = (purpose: string, value: string) => createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
  const actor = digest("actor", normalizedToken);
  return {
    name: input.name, id: digest("event", `${actor}:${input.name}:${input.id}:${input.outcome ?? "started"}`), actor,
    visit: digest("visit", `${actor}:${input.visitId ?? input.id}`), source,
    mode: input.mode ?? "unknown", humans: input.humans ?? 0, outcome: input.outcome ?? "started",
    durationMs: input.durationMs ?? null, persistent: input.persistent === true, at,
  };
}
export const DAY_MS = 86_400_000;
export const dayNumber = (at: number) => Math.floor((at + 8 * 3_600_000) / DAY_MS);
export const dayLabel = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const HISTOGRAM_BOUNDS = [100, 250, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 60000, 120000, 300000, 600000];
