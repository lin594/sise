import { NoopRoomSnapshotStore, type RoomSnapshotStore } from "./room-snapshot-store.js";
import type { RoomRecoverySnapshot } from "../rooms/room-recovery.js";

const WRITE_WARNING = "牌局快照暂时无法写入；游戏继续运行，后续状态变化会再次尝试。";
const DELETE_WARNING = "牌局快照暂时无法清理；过期校验会阻止旧牌局被错误恢复。";

export interface RoomSnapshotRuntimeOptions {
  debounceMs?: number;
  warn?: (message: string) => void;
}

/**
 * Decouples synchronous room mutations from Redis latency. At most one save is
 * in flight per room, and a burst of broadcasts is reduced to its newest full
 * snapshot.
 */
export class RoomSnapshotRuntime {
  private readonly debounceMs: number;
  private readonly warn: (message: string) => void;
  private readonly pending = new Map<string, RoomRecoverySnapshot>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly writes = new Map<string, Promise<void>>();
  private shuttingDown = false;
  private writeWarningActive = false;
  private deleteWarningActive = false;

  constructor(private readonly store: RoomSnapshotStore, options: RoomSnapshotRuntimeOptions = {}) {
    this.debounceMs = Math.max(0, Math.trunc(options.debounceMs ?? 150));
    this.warn = options.warn ?? ((message) => console.warn(`[room-recovery] ${message}`));
  }

  schedule(snapshot: RoomRecoverySnapshot): void {
    if (this.shuttingDown) {
      return;
    }
    this.pending.set(snapshot.roomId, snapshot);
    const existing = this.timers.get(snapshot.roomId);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(snapshot.roomId, setTimeout(() => {
      this.timers.delete(snapshot.roomId);
      void this.flushRoom(snapshot.roomId);
    }, this.debounceMs));
  }

  async loadAll(): Promise<RoomRecoverySnapshot[]> {
    return this.store.loadAll();
  }

  async flushAll(snapshots: RoomRecoverySnapshot[] = []): Promise<void> {
    for (const snapshot of snapshots) {
      this.pending.set(snapshot.roomId, snapshot);
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    while (this.pending.size > 0) {
      await Promise.all([...this.pending.keys()].map((roomId) => this.flushRoom(roomId)));
    }
    await Promise.all([...this.writes.values()].map((write) => write.catch(() => undefined)));
  }

  async beginShutdown(snapshots: RoomRecoverySnapshot[]): Promise<void> {
    this.shuttingDown = true;
    await this.flushAll(snapshots);
  }

  async remove(roomId: string): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    const timer = this.timers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(roomId);
    }
    this.pending.delete(roomId);
    await this.enqueue(roomId, async () => {
      try {
        await this.store.remove(roomId);
        this.deleteWarningActive = false;
      } catch {
        if (!this.deleteWarningActive) {
          this.warn(DELETE_WARNING);
          this.deleteWarningActive = true;
        }
      }
    });
  }

  async close(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    await this.store.close();
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  private async flushRoom(roomId: string): Promise<void> {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(roomId);
    }
    const snapshot = this.pending.get(roomId);
    if (!snapshot) {
      await this.writes.get(roomId)?.catch(() => undefined);
      return;
    }
    this.pending.delete(roomId);
    await this.enqueue(roomId, async () => {
      try {
        await this.store.save(snapshot);
        this.writeWarningActive = false;
      } catch {
        if (!this.writeWarningActive) {
          this.warn(WRITE_WARNING);
          this.writeWarningActive = true;
        }
      }
    });
    if (this.pending.has(roomId)) {
      await this.flushRoom(roomId);
    }
  }

  private enqueue(roomId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.writes.get(roomId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.writes.set(roomId, current);
    const clearCurrent = () => {
      if (this.writes.get(roomId) === current) {
        this.writes.delete(roomId);
      }
    };
    void current.then(clearCurrent, clearCurrent);
    return current;
  }
}

let activeRuntime = new RoomSnapshotRuntime(new NoopRoomSnapshotStore());

export function configureRoomSnapshotRuntime(runtime: RoomSnapshotRuntime): void {
  activeRuntime = runtime;
}

export function scheduleRoomSnapshot(snapshot: RoomRecoverySnapshot): void {
  activeRuntime.schedule(snapshot);
}

export function removeRoomSnapshot(roomId: string): Promise<void> {
  return activeRuntime.remove(roomId);
}

export function loadRoomSnapshots(): Promise<RoomRecoverySnapshot[]> {
  return activeRuntime.loadAll();
}

export function beginRoomSnapshotShutdown(snapshots: RoomRecoverySnapshot[]): Promise<void> {
  return activeRuntime.beginShutdown(snapshots);
}

export function closeRoomSnapshotRuntime(): Promise<void> {
  return activeRuntime.close();
}
