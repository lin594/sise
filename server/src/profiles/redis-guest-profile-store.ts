import { createClient, type RedisClientType } from "redis";
import {
  InMemoryGuestProfileStore,
  guestProfileTokenDigest,
  normalizeGuestProfileName,
  normalizeGuestProfileToken,
  type GuestProfile,
  type GuestProfileRoundRecord,
  type GuestProfileStore,
} from "./guest-profile-store.js";

const ROUND_EVENT_TTL_SECONDS = 366 * 24 * 60 * 60;

function boundedInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function parseProfile(raw: Record<string, string>, now: number): GuestProfile {
  const createdAt = Math.max(0, boundedInteger(raw.createdAt)) || now;
  return {
    nickname: normalizeGuestProfileName(raw.nickname),
    roundsPlayed: Math.max(0, boundedInteger(raw.roundsPlayed)),
    huWins: Math.max(0, boundedInteger(raw.huWins)),
    totalScore: boundedInteger(raw.totalScore),
    createdAt,
    updatedAt: Math.max(createdAt, boundedInteger(raw.updatedAt) || createdAt),
  };
}

export class RedisGuestProfileStore implements GuestProfileStore {
  private connectPromise: Promise<void> | null = null;

  constructor(
    private readonly client: RedisClientType,
    private readonly now: () => number = Date.now,
  ) {}

  async connect(): Promise<void> {
    if (this.client.isReady) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    if (this.client.isOpen) {
      // With automatic reconnect disabled, a failed socket can remain open but
      // not ready. Reset it so the next explicit recovery attempt can connect.
      await this.client.disconnect();
    }
    this.connectPromise = this.client.connect()
      .then(() => undefined)
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  async getOrCreate(token: string): Promise<GuestProfile> {
    await this.connect();
    const key = this.profileKey(token);
    const timestamp = this.now();
    await this.client.hSetNX(key, "createdAt", String(timestamp));
    await Promise.all([
      this.client.hSetNX(key, "nickname", "牌友"),
      this.client.hSetNX(key, "roundsPlayed", "0"),
      this.client.hSetNX(key, "huWins", "0"),
      this.client.hSetNX(key, "totalScore", "0"),
      this.client.hSetNX(key, "updatedAt", String(timestamp)),
    ]);
    return parseProfile(await this.client.hGetAll(key), timestamp);
  }

  async updateName(token: string, nickname: string): Promise<GuestProfile> {
    await this.connect();
    const key = this.profileKey(token);
    await this.getOrCreate(token);
    await this.client.hSet(key, {
      nickname: normalizeGuestProfileName(nickname),
      updatedAt: String(this.now()),
    });
    return parseProfile(await this.client.hGetAll(key), this.now());
  }

  async recordRound(record: GuestProfileRoundRecord): Promise<GuestProfile> {
    await this.connect();
    const key = this.profileKey(record.token);
    const eventId = String(record.eventId ?? "").trim();
    if (!eventId) {
      throw new Error("guest profile round event requires an id");
    }
    await this.getOrCreate(record.token);
    const eventKey = `${key}:round:${guestProfileTokenDigest(eventId)}`;
    const score = Number.isFinite(Number(record.score)) ? Math.trunc(Number(record.score)) : 0;
    const timestamp = this.now();
    await this.client.eval(
      `
        if redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[4]) then
          redis.call('HINCRBY', KEYS[1], 'roundsPlayed', 1)
          redis.call('HINCRBY', KEYS[1], 'huWins', ARGV[1])
          redis.call('HINCRBY', KEYS[1], 'totalScore', ARGV[2])
          redis.call('HSET', KEYS[1], 'updatedAt', ARGV[3])
          return 1
        end
        return 0
      `,
      {
        keys: [key, eventKey],
        arguments: [
          record.won ? "1" : "0",
          String(score),
          String(timestamp),
          String(ROUND_EVENT_TTL_SECONDS),
        ],
      },
    );
    return parseProfile(await this.client.hGetAll(key), timestamp);
  }

  async close(): Promise<void> {
    if (this.client.isReady) {
      await this.client.quit();
    } else if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  private profileKey(token: string): string {
    const normalized = normalizeGuestProfileToken(token);
    if (!normalized) {
      throw new Error("invalid guest profile token");
    }
    return `sise:guest-profile:${guestProfileTokenDigest(normalized)}`;
  }
}

type RecoverableGuestProfileStore = GuestProfileStore & { connect?: () => Promise<void> };

type PendingProfileMutation =
  | { kind: "name"; token: string; nickname: string }
  | { kind: "round"; record: GuestProfileRoundRecord };

export interface RecoveringGuestProfileStoreOptions {
  now?: () => number;
  retryDelayMs?: number;
  warn?: (message: string) => void;
  fallback?: InMemoryGuestProfileStore;
}

/**
 * Keeps gameplay independent from Redis while retaining enough information to
 * replay short outages. All operations are serialized so the mirror and the
 * in-memory mutation journal always describe the same order of changes.
 */
export class RecoveringGuestProfileStore implements GuestProfileStore {
  private readonly fallback: InMemoryGuestProfileStore;
  private readonly now: () => number;
  private readonly retryDelayMs: number;
  private readonly warn: (message: string) => void;
  private readonly pendingMutations: PendingProfileMutation[] = [];
  private operationQueue: Promise<void> = Promise.resolve();
  private degraded = false;
  private nextPrimaryAttemptAt = 0;

  constructor(
    private readonly primary: RecoverableGuestProfileStore,
    options: RecoveringGuestProfileStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.retryDelayMs = Math.max(100, Math.trunc(options.retryDelayMs ?? 2_000));
    this.warn = options.warn ?? (() => undefined);
    this.fallback = options.fallback ?? new InMemoryGuestProfileStore(this.now);
  }

  initialize(): Promise<void> {
    return this.serialize(async () => {
      try {
        await this.primary.connect?.();
      } catch {
        this.markPrimaryFailure();
      }
    });
  }

  getOrCreate(token: string): Promise<GuestProfile> {
    return this.serialize(() => this.run(
      token,
      () => this.primary.getOrCreate(token),
      () => this.fallback.getOrCreate(token),
    ));
  }

  updateName(token: string, nickname: string): Promise<GuestProfile> {
    const mutation: PendingProfileMutation = { kind: "name", token, nickname };
    return this.serialize(() => this.run(
      token,
      () => this.primary.updateName(token, nickname),
      () => this.fallback.updateName(token, nickname),
      mutation,
    ));
  }

  recordRound(record: GuestProfileRoundRecord): Promise<GuestProfile> {
    const mutation: PendingProfileMutation = { kind: "round", record: { ...record } };
    return this.serialize(() => this.run(
      record.token,
      () => this.primary.recordRound(record),
      () => this.fallback.recordRound(record),
      mutation,
      record.eventId,
    ));
  }

  close(): Promise<void> {
    return this.serialize(async () => {
      await this.primary.close?.();
    });
  }

  private async run(
    token: string,
    primaryOperation: () => Promise<GuestProfile>,
    fallbackOperation: () => Promise<GuestProfile>,
    mutation?: PendingProfileMutation,
    completedEventId?: string,
  ): Promise<GuestProfile> {
    if (!this.degraded || this.now() >= this.nextPrimaryAttemptAt) {
      try {
        await this.flushPendingMutations();
        const authoritative = await primaryOperation();
        this.fallback.hydrate(token, authoritative, completedEventId ? [completedEventId] : []);
        this.markPrimaryRecovered();
        return authoritative;
      } catch {
        this.markPrimaryFailure();
      }
    }

    const mirrored = await fallbackOperation();
    if (mutation) {
      this.enqueueMutation(mutation);
    }
    return mirrored;
  }

  private async flushPendingMutations(): Promise<void> {
    while (this.pendingMutations.length > 0) {
      const mutation = this.pendingMutations[0];
      if (mutation.kind === "name") {
        const profile = await this.primary.updateName(mutation.token, mutation.nickname);
        this.fallback.hydrate(mutation.token, profile);
      } else {
        const profile = await this.primary.recordRound(mutation.record);
        this.fallback.hydrate(mutation.record.token, profile, [mutation.record.eventId]);
      }
      this.pendingMutations.shift();
    }
  }

  private enqueueMutation(mutation: PendingProfileMutation): void {
    if (mutation.kind === "name") {
      for (let index = this.pendingMutations.length - 1; index >= 0; index -= 1) {
        const pending = this.pendingMutations[index];
        if (pending.kind === "name" && pending.token === mutation.token) {
          this.pendingMutations.splice(index, 1);
        }
      }
      this.pendingMutations.push(mutation);
      return;
    }

    const duplicate = this.pendingMutations.some((pending) =>
      pending.kind === "round" &&
      pending.record.token === mutation.record.token &&
      pending.record.eventId === mutation.record.eventId,
    );
    if (!duplicate) {
      this.pendingMutations.push(mutation);
    }
  }

  private markPrimaryFailure(): void {
    if (!this.degraded) {
      this.warn("Redis 档案暂不可用，已使用内存保护；恢复后会自动补写。牌局不受影响。");
    }
    this.degraded = true;
    this.nextPrimaryAttemptAt = this.now() + this.retryDelayMs;
  }

  private markPrimaryRecovered(): void {
    if (this.degraded) {
      this.warn("Redis 档案已恢复，临时记录已自动补写。");
    }
    this.degraded = false;
    this.nextPrimaryAttemptAt = 0;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

export async function createGuestProfileStore(
  redisUrl: string | undefined,
  warn: (message: string) => void = (message) => console.warn(`[guest-profile] ${message}`),
): Promise<GuestProfileStore> {
  const url = String(redisUrl ?? "").trim();
  if (!url) {
    return new InMemoryGuestProfileStore();
  }

  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1_500,
      reconnectStrategy: false,
    },
  });
  client.on("error", () => {
    // Individual operations perform the fallback. Avoid logging credentials or
    // noisy low-level socket details here.
  });
  const store = new RecoveringGuestProfileStore(new RedisGuestProfileStore(client), { warn });
  await store.initialize();
  return store;
}
