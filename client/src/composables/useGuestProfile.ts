import { onUnmounted, ref } from "vue";
import { BACKEND_HTTP_URL } from "@/config/backend";
import { readStoredValue, writeStoredValue } from "@/utils/safeStorage";

export const GUEST_PROFILE_TOKEN_KEY = "sise_guest_profile_token_v1";

export interface GuestProfile {
  nickname: string;
  roundsPlayed: number;
  huWins: number;
  totalScore: number;
  createdAt: number;
  updatedAt: number;
}

const PROFILE_TOKEN_PATTERN = /^gp_[a-f0-9]{48}$/;
let volatileProfileToken = "";

function readStoredToken(): string {
  const value = readStoredValue(GUEST_PROFILE_TOKEN_KEY).trim();
  return PROFILE_TOKEN_PATTERN.test(value) ? value : "";
}

function createProfileToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return `gp_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function ensureGuestProfileToken(): string {
  const stored = readStoredToken();
  if (stored) {
    volatileProfileToken = stored;
    return stored;
  }
  if (!volatileProfileToken) {
    volatileProfileToken = createProfileToken();
  }
  writeStoredValue(GUEST_PROFILE_TOKEN_KEY, volatileProfileToken);
  return volatileProfileToken;
}

function normalizeProfile(input: unknown): GuestProfile | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<GuestProfile>;
  const nickname = String(raw.nickname ?? "").trim() || "牌友";
  const integer = (value: unknown) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  return {
    nickname,
    roundsPlayed: Math.max(0, integer(raw.roundsPlayed)),
    huWins: Math.max(0, integer(raw.huWins)),
    totalScore: integer(raw.totalScore),
    createdAt: Math.max(0, integer(raw.createdAt)),
    updatedAt: Math.max(0, integer(raw.updatedAt)),
  };
}

export function useGuestProfile() {
  const profile = ref<GuestProfile | null>(null);
  let requestSequence = 0;
  let settlementRefreshSequence = 0;
  const timers = new Set<number>();

  async function request(method: "GET" | "PUT", nickname = ""): Promise<GuestProfile | null> {
    const sequence = ++requestSequence;
    try {
      const response = await fetch(`${BACKEND_HTTP_URL}/guest-profile`, {
        method,
        headers: {
          Authorization: `Bearer ${ensureGuestProfileToken()}`,
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "PUT" ? JSON.stringify({ nickname }) : undefined,
        cache: "no-store",
      });
      if (!response.ok) return null;
      const payload = await response.json() as { ok?: boolean; profile?: unknown };
      const next = payload.ok ? normalizeProfile(payload.profile) : null;
      if (next && sequence === requestSequence) {
        profile.value = next;
      }
      return next;
    } catch {
      // The profile is optional and must never block joining or playing.
      return null;
    }
  }

  function updateNickname(nickname: string): Promise<GuestProfile | null> {
    return request("PUT", nickname);
  }

  function refresh(): Promise<GuestProfile | null> {
    return request("GET");
  }

  function refreshAfterSettlement(): void {
    const refreshSequence = ++settlementRefreshSequence;
    const hadProfile = profile.value !== null;
    const previousRounds = profile.value?.roundsPlayed ?? 0;
    const delays = [180, 650, 1_500];
    for (const delay of delays) {
      const timer = window.setTimeout(async () => {
        timers.delete(timer);
        if (refreshSequence !== settlementRefreshSequence) return;
        const updated = await refresh();
        if (hadProfile && updated && updated.roundsPlayed > previousRounds) {
          settlementRefreshSequence += 1;
        }
      }, delay);
      timers.add(timer);
    }
  }

  onUnmounted(() => {
    settlementRefreshSequence += 1;
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
  });

  return {
    profile,
    profileToken: ensureGuestProfileToken(),
    refresh,
    refreshAfterSettlement,
    updateNickname,
  };
}
