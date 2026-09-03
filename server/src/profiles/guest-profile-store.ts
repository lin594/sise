import { createHash } from "node:crypto";

export interface GuestProfile {
  nickname: string;
  roundsPlayed: number;
  huWins: number;
  totalScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface GuestProfileRoundRecord {
  token: string;
  eventId: string;
  won: boolean;
  score: number;
}

export interface GuestProfileStore {
  getOrCreate(token: string): Promise<GuestProfile>;
  updateName(token: string, nickname: string): Promise<GuestProfile>;
  recordRound(record: GuestProfileRoundRecord): Promise<GuestProfile>;
  close?(): Promise<void>;
}

const PROFILE_TOKEN_PATTERN = /^gp_[a-f0-9]{48}$/;
const MAX_NICKNAME_CHARACTERS = 16;

export function normalizeGuestProfileToken(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const token = value.trim();
  return PROFILE_TOKEN_PATTERN.test(token) ? token : "";
}

export function normalizeGuestProfileName(value: unknown): string {
  if (typeof value !== "string") {
    return "牌友";
  }
  const visible = value
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return Array.from(visible || "牌友").slice(0, MAX_NICKNAME_CHARACTERS).join("");
}

export function guestProfileTokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(parsed)));
}

function copyProfile(profile: GuestProfile): GuestProfile {
  return { ...profile };
}

export class InMemoryGuestProfileStore implements GuestProfileStore {
  private readonly profiles = new Map<string, GuestProfile>();
  private readonly recordedEvents = new Set<string>();

  constructor(private readonly now: () => number = Date.now) {}

  async getOrCreate(token: string): Promise<GuestProfile> {
    const digest = this.requireDigest(token);
    const existing = this.profiles.get(digest);
    if (existing) {
      return copyProfile(existing);
    }
    const timestamp = this.now();
    const created: GuestProfile = {
      nickname: "牌友",
      roundsPlayed: 0,
      huWins: 0,
      totalScore: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.profiles.set(digest, created);
    return copyProfile(created);
  }

  async updateName(token: string, nickname: string): Promise<GuestProfile> {
    const digest = this.requireDigest(token);
    const current = await this.getOrCreate(token);
    const updated: GuestProfile = {
      ...current,
      nickname: normalizeGuestProfileName(nickname),
      updatedAt: this.now(),
    };
    this.profiles.set(digest, updated);
    return copyProfile(updated);
  }

  async recordRound(record: GuestProfileRoundRecord): Promise<GuestProfile> {
    const digest = this.requireDigest(record.token);
    const eventId = String(record.eventId ?? "").trim();
    if (!eventId) {
      throw new Error("guest profile round event requires an id");
    }
    const eventKey = `${digest}:${guestProfileTokenDigest(eventId)}`;
    if (this.recordedEvents.has(eventKey)) {
      return this.getOrCreate(record.token);
    }
    const current = await this.getOrCreate(record.token);
    const updated: GuestProfile = {
      ...current,
      roundsPlayed: current.roundsPlayed + 1,
      huWins: current.huWins + (record.won ? 1 : 0),
      totalScore: current.totalScore + safeInteger(record.score),
      updatedAt: this.now(),
    };
    this.recordedEvents.add(eventKey);
    this.profiles.set(digest, updated);
    return copyProfile(updated);
  }

  private requireDigest(token: string): string {
    const normalized = normalizeGuestProfileToken(token);
    if (!normalized) {
      throw new Error("invalid guest profile token");
    }
    return guestProfileTokenDigest(normalized);
  }
}

