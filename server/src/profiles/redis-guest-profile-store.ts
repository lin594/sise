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
  constructor(
    private readonly client: RedisClientType,
    private readonly now: () => number = Date.now,
  ) {}

  async getOrCreate(token: string): Promise<GuestProfile> {
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
    const key = this.profileKey(token);
    await this.getOrCreate(token);
    await this.client.hSet(key, {
      nickname: normalizeGuestProfileName(nickname),
      updatedAt: String(this.now()),
    });
    return parseProfile(await this.client.hGetAll(key), this.now());
  }

  async recordRound(record: GuestProfileRoundRecord): Promise<GuestProfile> {
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
    if (this.client.isOpen) {
      await this.client.quit();
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

class ResilientGuestProfileStore implements GuestProfileStore {
  private readonly fallback = new InMemoryGuestProfileStore();
  private fallbackActive = false;

  constructor(
    private readonly primary: GuestProfileStore,
    private readonly warn: (message: string) => void,
  ) {}

  getOrCreate(token: string): Promise<GuestProfile> {
    return this.run((store) => store.getOrCreate(token));
  }

  updateName(token: string, nickname: string): Promise<GuestProfile> {
    return this.run((store) => store.updateName(token, nickname));
  }

  recordRound(record: GuestProfileRoundRecord): Promise<GuestProfile> {
    return this.run((store) => store.recordRound(record));
  }

  async close(): Promise<void> {
    await this.primary.close?.();
  }

  private async run<T>(operation: (store: GuestProfileStore) => Promise<T>): Promise<T> {
    if (!this.fallbackActive) {
      try {
        return await operation(this.primary);
      } catch {
        this.fallbackActive = true;
        this.warn("Redis 档案暂不可用，已切换到进程内临时档案。牌局不受影响。");
      }
    }
    return operation(this.fallback);
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
    socket: {
      connectTimeout: 1_500,
      reconnectStrategy: false,
    },
  });
  client.on("error", () => {
    // Individual operations perform the fallback. Avoid logging credentials or
    // noisy low-level socket details here.
  });
  try {
    await client.connect();
    return new ResilientGuestProfileStore(new RedisGuestProfileStore(client), warn);
  } catch {
    if (client.isOpen) {
      await client.disconnect();
    }
    warn("Redis 连接失败，已使用进程内临时档案。牌局不受影响。");
    return new InMemoryGuestProfileStore();
  }
}

