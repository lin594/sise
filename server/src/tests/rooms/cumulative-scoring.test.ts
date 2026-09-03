import assert from "node:assert/strict";
import test from "node:test";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { finalizeRoomScores, type RoundResultPlayer } from "../../rooms/flow/match-runtime.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

function addPlayers(state: GameState, seatIds = ["A", "B", "C", "D"]): void {
  seatIds.forEach((seatId, seatIndex) => {
    const player = new PlayerState();
    player.clientId = seatId;
    player.seatIndex = seatIndex;
    player.name = seatId;
    state.players.set(seatId, player);
  });
}

function resultPlayer(clientId: string, totalScore: number): RoundResultPlayer {
  return {
    clientId,
    name: clientId,
    isConfiguredBot: false,
    hand: [],
    declaredKongs: 0,
    huType: null,
    winningGroups: [],
    resolvedHandGroups: [],
    exposedArea: [],
    exposedGroupSizes: [],
    exposedGroupKinds: [],
    generalArea: [],
    fishArea: [],
    discardCount: 0,
    scoreBreakdown: [],
    totalScore,
  };
}

test("cumulative scoring adds every completed round and remains zero-sum", () => {
  const state = new GameState();
  state.scoringMode = "cumulative";
  addPlayers(state);

  finalizeRoomScores(state, [
    resultPlayer("A", 6),
    resultPlayer("B", -2),
    resultPlayer("C", -2),
    resultPlayer("D", -2),
  ]);
  const second = finalizeRoomScores(state, [
    resultPlayer("A", -3),
    resultPlayer("B", 9),
    resultPlayer("C", -3),
    resultPlayer("D", -3),
  ]);

  assert.equal(state.completedRounds, 2);
  assert.deepEqual(
    second.map((player) => [player.clientId, player.cumulativeScore]),
    [["A", 3], ["B", 7], ["C", -5], ["D", -5]],
  );
  assert.equal([...state.players.values()].reduce((sum, player) => sum + player.cumulativeScore, 0), 0);
});

test("single-round mode counts rounds without carrying scores forward", () => {
  const state = new GameState();
  state.scoringMode = "single";
  addPlayers(state);

  const result = finalizeRoomScores(state, [resultPlayer("A", 3), resultPlayer("B", -3)]);

  assert.equal(state.completedRounds, 1);
  assert.deepEqual(result.map((player) => player.cumulativeScore), [0, 0]);
  assert.equal(state.players.get("A")?.cumulativeScore, 0);
});

test("only a waiting friend-room host can select scoring before the first round", () => {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.roomMode = "friends";
  room.state.phase = "waiting";
  room.state.hostPlayerId = "seat_0";
  room.seatBySession = new Map([
    ["host-session", "seat_0"],
    ["guest-session", "seat_1"],
  ]);
  room.broadcastAvailableActions = () => undefined;
  const sent: Array<{ event: string; payload: unknown }> = [];
  const guest = { sessionId: "guest-session", send: (event: string, payload: unknown) => sent.push({ event, payload }) };
  const host = { sessionId: "host-session", send: (event: string, payload: unknown) => sent.push({ event, payload }) };

  addPlayers(room.state, ["seat_0", "seat_1"]);
  room.state.players.get("seat_1")!.lobbyReady = true;

  room.handleSetScoringMode(guest, { mode: "cumulative" });
  assert.equal(room.state.scoringMode, "single");

  room.handleSetScoringMode(host, { mode: "cumulative" });
  assert.equal(room.state.scoringMode, "cumulative");
  assert.equal(room.state.players.get("seat_1")?.lobbyReady, false);

  room.state.completedRounds = 1;
  room.handleSetScoringMode(host, { mode: "single" });
  assert.equal(room.state.scoringMode, "cumulative");
});
