import { BACKEND_HTTP_URL } from "@/config/backend";
import { ensureGuestProfileToken } from "@/composables/useGuestProfile";
import { hasPersistentBrowserStorage } from "@/utils/safeStorage";

type Mode = "practice" | "match" | "friends" | "tutorial";
type ClientEvent = "context_hint_shown" | "context_hint_disabled" | "app_open" | "lobby_view" | "practice_start" | "quick_match_start" | "friend_room_create" | "invite_open" | "play_again" | "room_exit" | "join_failed" | "reconnect_started" | "reconnect_success" | "reconnect_failed";
let visitId = "";
let activeRequests = 0;
let modeAttempt: { id: string; mode: Mode; at: number } | null = null;
let networkDisabledForOfflinePractice = false;
const once = new Set<string>();
const modeEvent = (mode: Mode): ClientEvent => (mode === "practice" || mode === "tutorial") ? "practice_start" : mode === "match" ? "quick_match_start" : "friend_room_create";
function randomProductId(): string {
  try {
    if (typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}
export function productVisitId(): string {
  return visitId ||= randomProductId();
}
export function trackProductEvent(name: ClientEvent, fields: { id?: string; mode?: Mode; outcome?: "started" | "ready" | "failed"; durationMs?: number; persistent?: boolean } = {}): void {
  try {
    if (networkDisabledForOfflinePractice) return;
    if (!navigator.onLine) return;
    if (activeRequests >= 4) return;
    const { id: requestedId, ...eventFields } = fields;
    const id = requestedId || randomProductId();
    if (!id) return;
    const key = `${name}:${id}:${fields.outcome ?? "started"}`;
    if (once.has(key)) return;
    once.add(key);
    if (once.size > 256) once.delete(once.values().next().value!);
    const token = ensureGuestProfileToken();
    const currentVisitId = productVisitId();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    activeRequests++;
    void fetch(`${BACKEND_HTTP_URL}/product-events`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, id, ...(currentVisitId ? { visitId: currentVisitId } : {}), ...eventFields }),
      signal: controller.signal, cache: "no-store", keepalive: true,
    }).catch(() => {}).finally(() => { clearTimeout(timer); activeRequests--; });
  } catch { /* Optional measurement must never affect entry or gameplay. */ }
}
export function setOfflinePracticeAnalyticsDisabled(disabled: boolean): void {
  networkDisabledForOfflinePractice = disabled;
  if (disabled) modeAttempt = null;
}
export function openProductSession(invited: boolean): void {
  trackProductEvent("app_open", { id: productVisitId(), persistent: hasPersistentBrowserStorage() });
  if (invited) trackProductEvent("invite_open", { id: productVisitId(), mode: "friends" });
}
export function beginProductMode(mode: Mode): void {
  try {
    const id = randomProductId();
    if (!id) {
      modeAttempt = null;
      return;
    }
    modeAttempt = { id, mode, at: performance.now() };
    trackProductEvent(modeEvent(mode), { id: modeAttempt.id, mode });
  } catch { modeAttempt = null; }
}
export function readyProductMode(): void {
  if (!modeAttempt) return;
  const attempt = modeAttempt;
  modeAttempt = null;
  const durationMs = Math.round(performance.now() - attempt.at);
  if (durationMs >= 0 && durationMs <= 600000) trackProductEvent(modeEvent(attempt.mode), { id: attempt.id, mode: attempt.mode, outcome: "ready", durationMs });
}
export function failProductMode(): void {
  if (!modeAttempt) return;
  const attempt = modeAttempt;
  modeAttempt = null;
  trackProductEvent("join_failed", { id: attempt.id, mode: attempt.mode, outcome: "failed" });
}
