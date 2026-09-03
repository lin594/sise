import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

type FakeClient = {
  sessionId: string;
  send: (event: string, payload: unknown) => void;
  leave: (code?: number) => void;
};

function createMatchRoom() {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.roomMode = "match";
  room.state.phase = "waiting";
  room.playerOrder = [];
  room.playerHands = new Map();
  room.botIds = new Set();
  room.configuredBotIds = new Set();
  room.seatBySession = new Map();
  room.seatByToken = new Map();
  room.baseNameBySeat = new Map();
  room.pendingNameBySession = new Map();
  room.pendingTokenBySession = new Map();
  room.seatDisconnectTimers = new Map();
  room.takeoverTimers = new Map();
  room.clearRoomIdleTimer = () => undefined;
  room.broadcastAvailableActions = () => undefined;
  room.clients = [];
  const metadata: Array<{
    phase?: string;
    roomMode: string;
    matchOpen: boolean;
    hostPlayerId?: string;
    occupiedSeats?: number;
  }> = [];
  room.setMetadata = async (value: {
    phase?: string;
    roomMode: string;
    matchOpen: boolean;
    hostPlayerId?: string;
    occupiedSeats?: number;
  }) => {
    metadata.push(value);
  };
  return { room, metadata };
}

function addHuman(room: any, seatIndex: number, connected = true): void {
  const seatId = `seat_${seatIndex}`;
  const player = new PlayerState();
  player.clientId = seatId;
  player.seatIndex = seatIndex;
  player.name = `牌友${seatIndex + 1}`;
  player.connected = connected;
  player.isBot = false;
  player.isConfiguredBot = false;
  room.state.players.set(seatId, player);
  room.playerOrder.push(seatId);
  room.playerHands.set(seatId, []);
  room.baseNameBySeat.set(seatId, player.name);
  room.seatByToken.set(`token-${seatId}`, seatId);
  if (connected) {
    room.seatBySession.set(`session-${seatId}`, seatId);
  }
}

test("quick-match players are assigned the first free fixed seat", () => {
  const { room } = createMatchRoom();
  let rosterChanges = 0;
  room.onMatchRosterChanged = () => {
    rosterChanges += 1;
  };
  const sent: Array<{ event: string; payload: unknown }> = [];
  const client: FakeClient = {
    sessionId: "match-session",
    send: (event, payload) => sent.push({ event, payload }),
    leave: () => assert.fail("the first match player should be admitted"),
  };

  room.onJoin(client, { name: "阿青", playerToken: "pt_match" });

  assert.equal(room.seatBySession.get(client.sessionId), "seat_0");
  assert.equal(room.state.players.get("seat_0")?.name, "阿青");
  assert.equal(room.state.players.get("seat_0")?.seatIndex, 0);
  assert.equal(sent.some(({ event }) => event === "session_token"), true);
  assert.equal(rosterChanges, 1);
});

test("quick-match countdown starts once and accelerates when four humans arrive", () => {
  const { room } = createMatchRoom();
  room.matchWaitMs = 12_000;
  room.matchFullStartMs = 900;
  addHuman(room, 0);

  const firstNow = Date.now();
  room.onMatchRosterChanged();
  const firstDeadline = room.state.matchStartsAt;
  assert.ok(firstDeadline >= firstNow + 11_500);
  assert.ok(firstDeadline <= firstNow + 12_500);

  addHuman(room, 1);
  room.onMatchRosterChanged();
  assert.equal(room.state.matchStartsAt, firstDeadline, "ordinary joins must not restart the wait");

  addHuman(room, 2);
  addHuman(room, 3);
  const fullNow = Date.now();
  room.onMatchRosterChanged();
  assert.ok(room.state.matchStartsAt >= fullNow + 700);
  assert.ok(room.state.matchStartsAt <= fullNow + 1_300);
  room.clearMatchStartTimer();
});

test("quick-match countdown snapshots pair the deadline with server time", () => {
  const { room } = createMatchRoom();
  room.matchWaitMs = 12_000;
  addHuman(room, 0);
  const snapshots: Array<{ matchStartsAt: number; serverNow: number }> = [];
  room.broadcastAvailableActions = () => {
    snapshots.push(room.buildRoomSnapshot());
  };

  const before = Date.now();
  room.onMatchRosterChanged();
  const snapshot = snapshots.at(-1);
  const after = Date.now();

  assert.ok(snapshot);
  assert.equal(snapshot.matchStartsAt, room.state.matchStartsAt);
  assert.ok(snapshot.serverNow >= before && snapshot.serverNow <= after);
  room.clearMatchStartTimer();
});

test("quick-match deadline fills standard bots and closes only matchmaking", () => {
  const { room, metadata } = createMatchRoom();
  addHuman(room, 0);
  let bootstrapped = 0;
  room.bootstrapRound = () => {
    bootstrapped += 1;
    room.state.phase = "declaring";
  };

  room.attemptMatchStart();

  assert.equal(bootstrapped, 1);
  assert.equal(room.state.players.size, 4);
  const bots = [...room.state.players.values()].filter((player: PlayerState) => player.isConfiguredBot);
  assert.equal(bots.length, 3);
  assert.equal(bots.every((bot: PlayerState) => bot.botStrength === 50), true);
  assert.equal(room.state.matchStartsAt, 0);
  assert.equal(metadata.at(-1)?.roomMode, "match");
  assert.equal(metadata.at(-1)?.matchOpen, false);
  assert.equal(metadata.at(-1)?.phase, "waiting");
  assert.equal(metadata.at(-1)?.occupiedSeats, 1);
});

test("quick-match auto-start pauses for a disconnected reserved human", () => {
  const { room, metadata } = createMatchRoom();
  addHuman(room, 0);
  addHuman(room, 1, false);
  let bootstrapped = 0;
  room.bootstrapRound = () => {
    bootstrapped += 1;
  };

  room.attemptMatchStart();

  assert.equal(bootstrapped, 0);
  assert.equal(room.state.players.size, 2);
  assert.equal(room.state.matchStartsAt, 0);
  assert.equal(metadata.at(-1)?.matchOpen, false);
});

test("quick-match reconnect keeps the original authoritative deadline", () => {
  const { room } = createMatchRoom();
  room.matchWaitMs = 12_000;
  addHuman(room, 0);
  room.onMatchRosterChanged();
  const originalDeadline = room.state.matchStartsAt;

  room.state.players.get("seat_0").connected = false;
  room.onMatchRosterChanged();
  assert.equal(room.state.matchStartsAt, originalDeadline);

  room.state.players.get("seat_0").connected = true;
  room.onMatchRosterChanged();
  assert.equal(room.state.matchStartsAt, originalDeadline);
  room.clearMatchStartTimer();
});

test("a full reserved quick-match table is removed from new matchmaking", () => {
  const { room, metadata } = createMatchRoom();
  addHuman(room, 0);
  addHuman(room, 1);
  addHuman(room, 2);
  addHuman(room, 3, false);

  room.onMatchRosterChanged();

  assert.equal(metadata.at(-1)?.matchOpen, false);
  assert.equal(room.state.players.size, 4);
  room.clearMatchStartTimer();
});

test("quick-match lobby does not expose friend-room seat administration", () => {
  const { room } = createMatchRoom();
  addHuman(room, 0);
  room.state.hostPlayerId = "seat_0";
  const errors: Array<{ code?: string }> = [];
  const host: FakeClient = {
    sessionId: "session-seat_0",
    send: (event, payload) => {
      if (event === "lobby_error") errors.push(payload as { code?: string });
    },
    leave: () => undefined,
  };

  room.handleAddBot(host, { seatIndex: 1, strength: 85 });
  room.handleClaimSeat(host, { seatIndex: 2 });
  room.handleSetScoringMode(host, { mode: "cumulative" });

  assert.equal(room.state.players.size, 1);
  assert.equal(room.state.scoringMode, "single");
  assert.deepEqual(errors.map((error) => error.code), [
    "not_friend_waiting",
    "fixed_match_seat",
    "cannot_set_scoring",
  ]);
});
