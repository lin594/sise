/**
 * Bot Full Game Loop Test
 *
 * Creates a room with 1 "fake human" host + 3 bots, starts the game,
 * and lets the host seat be immediately taken over by bot logic.
 * With botThinkMaxMs=0, the entire game runs synchronously.
 *
 * Verifies the game reaches "ended" phase without deadlock.
 */

import assert from "node:assert/strict";
import { FourColorGameRoom } from "../../rooms/GameRoom.js";
import { buildDefaultDeclarationPayload } from "../../rooms/flow/match-runtime.js";
import { GameState, PlayerState } from "../../schema/game-state.schema.js";

interface FakeClient {
  sessionId: string;
  send: (event: string, payload?: unknown) => void;
}

function createBotGameRoom(): { room: any; hostClient: FakeClient } {
  const room = new FourColorGameRoom() as any;
  const state = new GameState();
  room.state = state;
  room.stateOps = null; // force re-create on access

  // Zero-delay bots for synchronous execution
  room.botThinkMinMs = 0;
  room.botThinkMaxMs = 0;
  room.collectiveTimeoutMs = 1000;
  room.localTimeoutMs = 1000;
  room.operationTimeoutMs = 1000;
  room.declareTimeoutMs = 1000;
  room.minPlayersToStart = 1;

  // Suppress logging noise
  room.logEnabled = false;
  room.traceEnabled = false;
  room.huLogEnabled = false;

  // Create host player (seat_1) as a "human" so we can call handleStartGame
  const hostSeatId = "seat_1";
  const hostPlayer = new PlayerState();
  hostPlayer.clientId = hostSeatId;
  hostPlayer.name = "TestHost";
  state.players.set(hostSeatId, hostPlayer);
  state.hostPlayerId = hostSeatId;
  state.phase = "waiting";

  room.playerOrder = [hostSeatId];
  room.playerHands = new Map<string, any[]>();
  room.playerHands.set(hostSeatId, []);
  room.botIds = new Set<string>();
  room.seatBySession = new Map<string, string>();
  room.seatByToken = new Map<string, string>();
  room.baseNameBySeat = new Map<string, string>();
  room.publicGeneralPool = [];
  room.pendingResponse = null;
  room.awaitingDiscardOwnerId = null;
  room.collectiveQueue = [];
  room.collectiveCursor = 0;
  room.collectiveResponderId = null;
  room.botTimer = null;
  room.declareTimer = null;
  room.collectiveTimer = null;
  room.deck = [];
  room.debugSeq = 0;
  room.roundDealerId = null;
  room.huLogDedup = new Set();
  room.huChecksTotal = 0;
  room.huChecksValid = 0;
  room.huChecksBySeat = new Map();
  room.lastTerminalFingerprint = "";

  // Register host session and token
  const hostSessionId = "sess_host";
  room.seatBySession.set(hostSessionId, hostSeatId);
  room.seatByToken.set("token_host", hostSeatId);
  room.baseNameBySeat.set(hostSeatId, "TestHost");

  const hostClient: FakeClient = {
    sessionId: hostSessionId,
    send: () => {},
  };

  // Override broadcast and client-sending to no-op
  room.broadcast = () => {};
  room.clients = [];

  // No real WebSocket clients in test — no-op all client communication
  room.syncAllPrivateHands = function () {};
  room.broadcastAvailableActions = function () {};

  return { room, hostClient };
}

function runOneGame(): { phase: string; lastAction: string; deckRemaining: number } {
  const { room, hostClient } = createBotGameRoom();

  // Mark the host seat as bot too, so everything auto-plays
  room.botIds.add("seat_1");

  // Start the game - this fills bots for seats 2-4, bootstraps round, and begins play
  room.handleStartGame(hostClient);

  // With botThinkMaxMs=0, the game should have cascaded to completion synchronously.
  // However, some paths use setTimeout even with 0 delay. Let's pump timers.
  let safetyCounter = 0;
  const maxIterations = 50000;

  while (room.state.phase !== "ended" && safetyCounter < maxIterations) {
    safetyCounter++;

    // If there's a pending bot timer, fire it immediately
    if (room.botTimer) {
      const timer = room.botTimer;
      room.botTimer = null;
      clearTimeout(timer);
      room.runBotStepNow();
    }

    // If there's a collective timer (timeout), fire it
    if (room.collectiveTimer && room.state.phase === "playing") {
      const timer = room.collectiveTimer;
      room.collectiveTimer = null;
      room.state.responseEndsAt = 0;
      clearTimeout(timer);
      // Timeout handler logic - force pass/discard
      if (room.awaitingDiscardOwnerId) {
        room.discardFromAndCollective(room.awaitingDiscardOwnerId);
      } else if (room.state.responsePhase === "collective" && room.collectiveResponderId) {
        room.pendingResponse?.collectives.set(room.collectiveResponderId, { action: "pass" as any });
        room.collectiveCursor += 1;
        room.advanceCollectivePolling();
      } else if (room.pendingResponse) {
        room.enterOwnerLocalPhaseAfterNoResponse(room.pendingResponse.ownerId);
      }
    }

    // If the opening declaration intro is still animating, finish it.
    if (room.declareIntroTimer && room.state.phase === "declaring") {
      const timer = room.declareIntroTimer;
      room.declareIntroTimer = null;
      clearTimeout(timer);
      for (const stageTimer of room.declareIntroStageTimers ?? []) {
        clearTimeout(stageTimer);
      }
      room.declareIntroStageTimers = [];
      room.state.responseEndsAt = 0;
      room.state.lastAction = `DECLARING ${room.declareTimeoutMs}ms`;
      room.startDeclaringPhase();
    }

    // If there's a declare timer, fire it
    if (room.declareTimer && room.state.phase === "declaring") {
      const timer = room.declareTimer;
      room.declareTimer = null;
      clearTimeout(timer);
      // Force finish declaring
      for (const seatId of room.playerOrder) {
        const player = room.state.players.get(seatId);
        if (player && !player.declaredReady) {
          room.submitDeclaration(seatId, buildDefaultDeclarationPayload(room.playerHands.get(seatId) ?? []), true);
        }
      }
      if (room.areAllDeclarationsReady()) {
        room.finishDeclaringPhase();
      }
    }

    // If nothing is pending and game isn't ended, something is stuck
    if (!room.botTimer && !room.collectiveTimer && !room.declareTimer && !room.declareIntroTimer && room.state.phase !== "ended") {
      // Try tickBots once more to unstick
      if (room.state.phase === "playing" && room.pendingResponse) {
        room.tickBots();
      } else {
        break; // Truly stuck
      }
    }
  }

  return {
    phase: room.state.phase,
    lastAction: room.state.lastAction,
    deckRemaining: room.state.deckCount,
  };
}

// ===== Test execution =====

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
function t(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

t("bot-game: single full game reaches 'ended' phase", () => {
  const result = runOneGame();
  assert.equal(result.phase, "ended", `Game stuck at phase=${result.phase}, lastAction=${result.lastAction}`);
});

t("bot-game: 20 consecutive games all complete", () => {
  const results: string[] = [];
  for (let i = 0; i < 20; i++) {
    const result = runOneGame();
    results.push(result.phase);
  }
  const stuck = results.filter((p) => p !== "ended");
  assert.equal(stuck.length, 0, `${stuck.length}/20 games did not reach 'ended'. Phases: ${results.join(", ")}`);
});

t("bot-game: 100 games stress test", () => {
  let completed = 0;
  let huWins = 0;
  let drawGames = 0;
  for (let i = 0; i < 100; i++) {
    const result = runOneGame();
    if (result.phase === "ended") {
      completed++;
      if (result.lastAction.includes("HU")) huWins++;
      if (result.lastAction.includes("DRAW")) drawGames++;
    }
  }
  console.log(`  100-game stats: completed=${completed}, hu_wins=${huWins}, draw_games=${drawGames}`);
  assert.equal(completed, 100, `Only ${completed}/100 games completed`);
});

// ===== Runner =====
let failed = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log(`PASS ${item.name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`\n${failed} bot-game test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} bot-game test(s) passed`);
