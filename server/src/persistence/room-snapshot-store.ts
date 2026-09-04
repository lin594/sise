import { createClient, type RedisClientType } from "redis";
import {
  assertRoomRecoverySnapshot,
  cloneRoomRecoverySnapshot,
  isRoomRecoverySnapshot,
  type RoomRecoverySnapshot,
} from "../rooms/room-recovery.js";

const SNAPSHOT_INDEX_KEY = "sise:room-snapshots:v1";
const SNAPSHOT_KEY_PREFIX = "sise:room-snapshot:v1:";

export interface RoomSnapshotStore {
  loadAll(): Promise<RoomRecoverySnapshot[]>;
  save(snapshot: RoomRecoverySnapshot): Promise<void>;
  remove(roomId: string): Promise<void>;
  close(): Promise<void>;
}

export class NoopRoomSnapshotStore implements RoomSnapshotStore {
  async loadAll(): Promise<RoomRecoverySnapshot[]> {
    return [];
  }

  async save(_snapshot: RoomRecoverySnapshot): Promise<void> {}

  async remove(_roomId: string): Promise<void> {}

  async close(): Promise<void> {}
}

export class InMemoryRoomSnapshotStore implements RoomSnapshotStore {
  private readonly snapshots = new Map<string, RoomRecoverySnapshot>();

  constructor(private readonly now: () => number = Date.now) {}

  async loadAll(): Promise<RoomRecoverySnapshot[]> {
    const current = this.now();
    for (const [roomId, snapshot] of this.snapshots) {
      if (snapshot.expiresAt <= current || !isRoomRecoverySnapshot(snapshot)) {
        this.snapshots.delete(roomId);
      }
    }
    return [...this.snapshots.values()]
      .sort((left, right) => left.roomId.localeCompare(right.roomId))
      .map(cloneRoomRecoverySnapshot);
  }

  async save(snapshot: RoomRecoverySnapshot): Promise<void> {
    assertRoomRecoverySnapshot(snapshot);
    this.snapshots.set(snapshot.roomId, cloneRoomRecoverySnapshot(snapshot));
  }

  async remove(roomId: string): Promise<void> {
    this.snapshots.delete(roomId);
  }

  async close(): Promise<void> {}
}

export class RedisRoomSnapshotStore implements RoomSnapshotStore {
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly client: RedisClientType, private readonly now: () => number = Date.now) {}

  async loadAll(): Promise<RoomRecoverySnapshot[]> {
    await this.connect();
    const roomIds = await this.client.sMembers(SNAPSHOT_INDEX_KEY);
    const snapshots: RoomRecoverySnapshot[] = [];
    for (const roomId of roomIds) {
      const raw = await this.client.get(this.key(roomId));
      if (!raw) {
        await this.client.sRem(SNAPSHOT_INDEX_KEY, roomId);
        continue;
      }
      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
      } catch {
        candidate = null;
      }
      if (!isRoomRecoverySnapshot(candidate) || candidate.roomId !== roomId || candidate.expiresAt <= this.now()) {
        await this.remove(roomId);
        continue;
      }
      snapshots.push(candidate);
    }
    return snapshots.sort((left, right) => left.roomId.localeCompare(right.roomId));
  }

  async save(snapshot: RoomRecoverySnapshot): Promise<void> {
    assertRoomRecoverySnapshot(snapshot);
    await this.connect();
    const ttlSeconds = Math.max(1, Math.ceil((snapshot.expiresAt - this.now()) / 1_000));
    await this.client.multi()
      .set(this.key(snapshot.roomId), JSON.stringify(snapshot), { EX: ttlSeconds })
      .sAdd(SNAPSHOT_INDEX_KEY, snapshot.roomId)
      .exec();
  }

  async remove(roomId: string): Promise<void> {
    await this.connect();
    await this.client.multi()
      .del(this.key(roomId))
      .sRem(SNAPSHOT_INDEX_KEY, roomId)
      .exec();
  }

  async close(): Promise<void> {
    if (this.client.isReady) {
      await this.client.quit();
    } else if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  private async connect(): Promise<void> {
    if (this.client.isReady) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
    this.connectPromise = this.client.connect()
      .then(() => undefined)
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  private key(roomId: string): string {
    return `${SNAPSHOT_KEY_PREFIX}${roomId}`;
  }
}

export function createRoomSnapshotStore(redisUrl: string | undefined): RoomSnapshotStore {
  const url = String(redisUrl ?? "").trim();
  if (!url) {
    return new NoopRoomSnapshotStore();
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
    // Operations surface one sanitized warning at the runtime boundary.
  });
  return new RedisRoomSnapshotStore(client);
}

