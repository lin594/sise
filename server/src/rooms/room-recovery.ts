import type { ActionType, Card } from "../rules/types.js";

export const ROOM_RECOVERY_VERSION = 1;
export const ACTIVE_ROOM_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1_000;
export const ENDED_ROOM_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1_000;

export interface RecoveryPendingResponse {
  ownerId: string;
  card: Card;
  collectives: Array<[string, { action: ActionType; candidateId?: string }]>;
  responsePhaseAfterNoResponse?: "local_upper" | "local_draw";
}

export interface RoomRecoveryPrivateState {
  deck: Card[];
  playerHands: Array<[string, Card[]]>;
  playerOrder: string[];
  botIds: string[];
  configuredBotIds: string[];
  seatByToken: Array<[string, string]>;
  baseNameBySeat: Array<[string, string]>;
  profileTokenBySeat: Array<[string, string]>;
  hostKey: string;
  hostKeyConsumed: boolean;
  pendingResponse: RecoveryPendingResponse | null;
  publicGeneralPool: Card[];
  dealerCard: Card | null;
  dealerPickerId: string | null;
  nextRoundSetup: { mode: "picker"; pickerId: string } | { mode: "fixed"; dealerId: string } | null;
  awaitingDiscardOwnerId: string | null;
  pendingFishDeclarations: Array<[string, Card[]]>;
  declareTimeExtensionUsedBy: string[];
  responseTimeExtensionUsed: boolean;
  declareTimerTotalMs: number;
  responseTimerTotalMs: number;
  declareDecisionWindowId: number;
  responseDecisionWindowId: number;
  collectiveQueue: string[];
  collectiveCursor: number;
  collectiveResponderId: string | null;
  debugSeq: number;
  roundDealerId: string | null;
  lastRoundResult: unknown | null;
}

export interface RoomRecoverySnapshot {
  version: typeof ROOM_RECOVERY_VERSION;
  roomId: string;
  savedAt: number;
  expiresAt: number;
  state: Record<string, unknown>;
  privateState: RoomRecoveryPrivateState;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return Number.isFinite(value) && Number.isInteger(value);
}

function isEntryArray(value: unknown): value is Array<[string, unknown]> {
  return Array.isArray(value) && value.every(
    (entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string",
  );
}

export function isRoomRecoverySnapshot(value: unknown): value is RoomRecoverySnapshot {
  if (!isObject(value) || value.version !== ROOM_RECOVERY_VERSION) {
    return false;
  }
  if (
    typeof value.roomId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.roomId) ||
    !isFiniteInteger(value.savedAt) ||
    !isFiniteInteger(value.expiresAt) ||
    value.expiresAt <= value.savedAt ||
    !isObject(value.state) ||
    !isObject(value.privateState)
  ) {
    return false;
  }
  const state = value.state;
  const privateState = value.privateState;
  if (
    !["waiting", "declaring", "playing", "ended"].includes(String(state.phase ?? "")) ||
    !["practice", "friends", "match"].includes(String(state.roomMode ?? "")) ||
    !isObject(state.players)
  ) {
    return false;
  }
  return (
    Array.isArray(privateState.deck) &&
    isEntryArray(privateState.playerHands) &&
    Array.isArray(privateState.playerOrder) &&
    Array.isArray(privateState.botIds) &&
    Array.isArray(privateState.configuredBotIds) &&
    isEntryArray(privateState.seatByToken) &&
    isEntryArray(privateState.baseNameBySeat) &&
    isEntryArray(privateState.profileTokenBySeat) &&
    typeof privateState.hostKey === "string" &&
    typeof privateState.hostKeyConsumed === "boolean" &&
    Array.isArray(privateState.publicGeneralPool) &&
    isEntryArray(privateState.pendingFishDeclarations) &&
    Array.isArray(privateState.declareTimeExtensionUsedBy) &&
    typeof privateState.responseTimeExtensionUsed === "boolean" &&
    isFiniteInteger(privateState.declareTimerTotalMs) &&
    isFiniteInteger(privateState.responseTimerTotalMs) &&
    isFiniteInteger(privateState.declareDecisionWindowId) &&
    isFiniteInteger(privateState.responseDecisionWindowId) &&
    Array.isArray(privateState.collectiveQueue) &&
    isFiniteInteger(privateState.collectiveCursor) &&
    isFiniteInteger(privateState.debugSeq)
  );
}

export function assertRoomRecoverySnapshot(value: unknown): asserts value is RoomRecoverySnapshot {
  if (!isRoomRecoverySnapshot(value)) {
    throw new Error("invalid or incompatible room recovery snapshot");
  }
}

export function cloneRoomRecoverySnapshot(snapshot: RoomRecoverySnapshot): RoomRecoverySnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as RoomRecoverySnapshot;
}

