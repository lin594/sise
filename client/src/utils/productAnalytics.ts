import { BACKEND_HTTP_URL } from "@/config/backend";
import { ensureGuestProfileToken } from "@/composables/useGuestProfile";
import { hasPersistentBrowserStorage } from "@/utils/safeStorage";

type Mode = "practice" | "match" | "friends" | "tutorial";
type ClientEvent = "app_open" | "lobby_view" | "practice_start" | "quick_match_start" | "friend_room_create" | "invite_open" | "play_again" | "room_exit" | "join_failed" | "reconnect_started" | "reconnect_success" | "reconnect_failed";
let visitId = "";
let activeRequests = 0;
let modeAttempt: { id: string; mode: Mode; at: number } | null = null;
const once = new Set<string>();
const modeEvent = (mode: Mode): ClientEvent => (mode === "practice" || mode === "tutorial") ? "practice_start" : mode === "match" ? "quick_match_start" : "friend_room_create";
export function productVisitId(): string {
  try { return visitId ||= crypto.randomUUID(); } catch { return ""; }
}
export function trackProductEvent(name: ClientEvent, fields: { id?: string; mode?: Mode; outcome?: "started" | "ready" | "failed"; durationMs?: number; persistent?: boolean } = {}): void {
  try {
    if (activeRequests >= 4) return;
    const id = fields.id ?? crypto.randomUUID();
    const key = `${name}:${id}:${fields.outcome ?? "started"}`;
    if (once.has(key)) return;
    once.add(key);
    if (once.size > 256) once.delete(once.values().next().value!);
    const token = ensureGuestProfileToken();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    activeRequests++;
    void fetch(`${BACKEND_HTTP_URL}/product-events`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, id, visitId: productVisitId(), ...fields }),
      signal: controller.signal, cache: "no-store", keepalive: true,
    }).catch(() => {}).finally(() => { clearTimeout(timer); activeRequests--; });
  } catch { /* Optional measurement must never affect entry or gameplay. */ }
}
export function openProductSession(invited: boolean): void {
  trackProductEvent("app_open", { id: productVisitId(), persistent: hasPersistentBrowserStorage() });
  if (invited) trackProductEvent("invite_open", { id: productVisitId(), mode: "friends" });
}
export function beginProductMode(mode: Mode): void {
  try {
    modeAttempt = { id: crypto.randomUUID(), mode, at: performance.now() };
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
