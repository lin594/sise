import {
  InMemoryGuestProfileStore,
  normalizeGuestProfileToken,
  type GuestProfileStore,
} from "./guest-profile-store.js";

let activeStore: GuestProfileStore = new InMemoryGuestProfileStore();

export function configureGuestProfileStore(store: GuestProfileStore): void {
  activeStore = store;
}

export async function touchGuestProfile(
  token: string,
  nickname: string,
  warn: (message: string) => void = (message) => console.warn(`[guest-profile] ${message}`),
): Promise<void> {
  const normalized = normalizeGuestProfileToken(token);
  if (!normalized) {
    return;
  }
  try {
    await activeStore.updateName(normalized, nickname);
  } catch {
    warn("临时档案昵称保存失败，牌局不受影响。");
  }
}

export interface GuestProfileSettlementResult {
  clientId: string;
  isConfiguredBot: boolean;
  totalScore: number;
}

export async function recordGuestRoundResults(
  store: GuestProfileStore,
  eventId: string,
  winnerId: string | null,
  results: GuestProfileSettlementResult[],
  profileTokensBySeat: ReadonlyMap<string, string>,
  warn: (message: string) => void = (message) => console.warn(`[guest-profile] ${message}`),
): Promise<void> {
  const writes = results.flatMap((result) => {
    if (result.isConfiguredBot) {
      return [];
    }
    const token = normalizeGuestProfileToken(profileTokensBySeat.get(result.clientId));
    if (!token) {
      return [];
    }
    return [store.recordRound({
      token,
      eventId,
      won: result.clientId === winnerId,
      score: result.totalScore,
    })];
  });
  if (!writes.length) {
    return;
  }
  const settled = await Promise.allSettled(writes);
  if (settled.some((result) => result.status === "rejected")) {
    warn("临时档案记账失败，牌局结算不受影响。");
  }
}

export function recordActiveGuestRoundResults(
  eventId: string,
  winnerId: string | null,
  results: GuestProfileSettlementResult[],
  profileTokensBySeat: ReadonlyMap<string, string>,
): void {
  void recordGuestRoundResults(activeStore, eventId, winnerId, results, profileTokensBySeat);
}
