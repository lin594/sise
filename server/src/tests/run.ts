import assert from "node:assert/strict";
import { canChi, canKai, canPeng, findKaiPlan, getChiPlans } from "../rules/actions.js";
import { explainHu, validateHu } from "../rules/hu.js";
import type { Card } from "../rules/types.js";
import {
  BOT_DISPLAY_NAMES,
  buildDeclarationSelection,
  buildDefaultDeclarationPayload,
  buildRoundResultPlayers,
  canReturnLobby,
  chooseBotDisplayName,
  dealInitialHands,
  makeUniqueHumanName,
} from "../rooms/flow/match-runtime.js";
import { createRoomStateOps } from "../rooms/flow/room-state-ops.js";
import { resolveLocalDrawIdleAction } from "../rooms/flow/playing-flow.js";
import { generateToken, normalizeName, normalizeToken, resolveDealerFromAnchorAndCard } from "../rooms/flow/support.js";
import {
  DEFAULT_DECLARE_TIMEOUT_MS,
  DEFAULT_OPERATION_TIMEOUT_MS,
  DEFAULT_RECONNECT_GRACE_MS,
  DEFAULT_TIME_EXTENSION_MS,
  FourColorGameRoom,
  canUseDebugScenario,
  isDebugScenarioFeatureEnabled,
} from "../rooms/GameRoom.js";
import { GameState, PlayerState } from "../schema/game-state.schema.js";
import { chooseBotAction, chooseBotDiscard, createSeededRandom } from "../rooms/bot-strategy.js";

type TestFn = () => void;

const tests: Array<{ name: string; fn: TestFn }> = [];

function t(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

function c(id: string, color: Card["color"], type: Card["type"], source?: "upper" | "draw"): Card {
  return source ? { id, color, type, source } : { id, color, type };
}

t("identity: generated room tokens use cryptographically random 192-bit values", () => {
  const tokens = Array.from({ length: 256 }, () => generateToken());

  assert.equal(new Set(tokens).size, tokens.length);
  assert.equal(tokens.every((token) => /^pt_[0-9a-f]{48}$/.test(token)), true);
});

t("security: debug scenarios are disabled in production and limited to the host", () => {
  assert.equal(isDebugScenarioFeatureEnabled("production", "1"), false);
  assert.equal(isDebugScenarioFeatureEnabled(" Production ", "1"), false);
  assert.equal(isDebugScenarioFeatureEnabled("development", "0"), false);
  assert.equal(isDebugScenarioFeatureEnabled("development", "true"), false);
  assert.equal(isDebugScenarioFeatureEnabled("development", "1"), true);
  assert.equal(canUseDebugScenario(false, "seat_0", "seat_0"), false);
  assert.equal(canUseDebugScenario(true, undefined, "seat_0"), false);
  assert.equal(canUseDebugScenario(true, "seat_1", "seat_0"), false);
  assert.equal(canUseDebugScenario(true, "seat_0", "seat_0"), true);
});

t("accessibility: default human decisions allow extra reading and touch time", () => {
  assert.equal(DEFAULT_OPERATION_TIMEOUT_MS, 30_000);
  assert.equal(DEFAULT_DECLARE_TIMEOUT_MS, 45_000);
  assert.equal(DEFAULT_RECONNECT_GRACE_MS, 5_000);
  assert.equal(DEFAULT_TIME_EXTENSION_MS, 20_000);
});

t("identity: legacy room tokens remain accepted during migration", () => {
  assert.equal(normalizeToken(" old_timestamp_random_token "), "old_timestamp_random_token");
});

t("identity: player names remove invisible controls and preserve whole Unicode characters", () => {
  assert.equal(normalizeName("  张\u200b　阿姨\n "), "张 阿姨");
  const emojiName = normalizeName("牌友" + "🙂".repeat(30));
  assert.equal(Array.from(emojiName).length, 24);
  assert.equal(emojiName.endsWith("🙂"), true);
});

t("identity: duplicate humans and legacy bot-style names receive readable suffixes", () => {
  assert.equal(makeUniqueHumanName("张阿姨", ["张阿姨", "张阿姨（2）"]), "张阿姨（3）");
  assert.equal(makeUniqueHumanName("Ａlice", ["alice"]), "Alice（2）");
  assert.equal(makeUniqueHumanName("机器人2", []), "机器人2（玩家）");
});

t("identity: bot display names are friendly, randomizable, and unique within a table", () => {
  assert.equal(chooseBotDisplayName([], () => 0), BOT_DISPLAY_NAMES[0]);
  assert.equal(chooseBotDisplayName([], () => 0.999999), BOT_DISPLAY_NAMES.at(-1));
  assert.equal(
    chooseBotDisplayName([BOT_DISPLAY_NAMES[0], BOT_DISPLAY_NAMES[1]], () => 0),
    BOT_DISPLAY_NAMES[2],
  );
  assert.equal(
    chooseBotDisplayName(BOT_DISPLAY_NAMES, () => Number.NaN),
    "牌友1",
  );
  assert.equal(
    chooseBotDisplayName([...BOT_DISPLAY_NAMES, "牌友1"], () => 0.5),
    "牌友2",
  );
});

t("identity: a legacy token still reclaims its active seat", () => {
  const legacyToken = "old_timestamp_random_token";
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "playing";
  room.seatByToken = new Map([[legacyToken, "seat_0"]]);
  room.seatBySession = new Map();
  room.baseNameBySeat = new Map([["seat_0", "张阿姨"]]);
  room.botIds = new Set(["seat_0"]);
  room.clients = [];
  room.clearRoomIdleTimer = () => {};
  room.syncAllPrivateHands = () => {};
  room.broadcastAvailableActions = () => {};
  room.tickBots = () => {};

  const player = new PlayerState();
  player.clientId = "seat_0";
  player.name = "张阿姨";
  player.connected = false;
  player.isBot = true;
  room.state.players.set("seat_0", player);

  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "restored-session",
    send: (event: string, payload: any) => sent.push({ event, payload }),
    leave: () => {},
  };

  room.onJoin(client, { name: "冒名者", playerToken: ` ${legacyToken} ` });

  assert.equal(room.seatBySession.get("restored-session"), "seat_0");
  assert.equal(player.connected, true);
  assert.equal(player.isBot, false);
  assert.equal(player.name, "张阿姨");
  assert.equal(room.botIds.has("seat_0"), false);
  assert.equal(
    sent.some(
      (message) =>
        message.event === "session_token" &&
        message.payload.playerToken === legacyToken &&
        message.payload.reclaimed === true,
    ),
    true,
  );
});

t("actions: kai requires 3 exact cards", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const pool = [c("wj", "white", "jiang")];
  assert.equal(canKai(hand, response, pool), false);
});

t("actions: kai exact triplet is valid", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju")];
  assert.equal(canKai(hand, response, []), true);
  const plan = findKaiPlan(hand, response, []);
  assert.ok(plan);
  assert.equal(plan!.handCards.length, 3);
  assert.equal(plan!.poolCards.length, 0);
});

t("actions: peng does not consume wildcard", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("wj", "white", "jiang")];
  assert.equal(canPeng(hand, response), false);
});

t("room-state-ops: upgrade pair group to triplet in-place", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const ops = createRoomStateOps(state, new Map(), () => null);
  const p1 = c("rj1", "red", "ju");
  const p2 = c("rj2", "red", "ju");
  const pending = c("rj3", "red", "ju", "upper");
  player.exposedArea.push(ops.toSchemaCard(p1, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(p2, false, "upper"));
  player.exposedGroupSizes.push(2);

  const ok = ops.upgradeExposedPairToTriplet("B", [p1, p2], pending, true);

  assert.equal(ok, true);
  assert.deepEqual([...player.exposedGroupSizes], [3]);
  assert.equal(player.exposedArea.length, 3);
  assert.equal(player.exposedArea[2].id, "rj3");
});

t("room-state-ops: auto discard prefers preserving complete groups over first available card", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const hands = new Map<string, Card[]>([
    ["B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju"), c("ym1", "yellow", "ma")]],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);

  const discard = ops.pickDiscardCard("B");

  assert.ok(discard);
  assert.equal(discard!.id, "ym1");
});

t("room-state-ops: meld consumption is atomic when a requested card is missing", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const shi = c("green_shi_01", "green", "shi");
  const ma = c("yellow_ma_01", "yellow", "ma");
  const hands = new Map<string, Card[]>([["B", [shi, ma]]]);
  const ops = createRoomStateOps(state, hands, () => null);

  const consumed = ops.consumePlanCards("B", [shi, c("green_xiang_missing", "green", "xiang")], []);

  assert.equal(consumed, null);
  assert.deepEqual(hands.get("B")?.map((card) => card.id), [shi.id, ma.id]);
});

t("room-state-ops: peng matching removal does not partially mutate the hand", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const ju = c("red_ju_01", "red", "ju");
  const ma = c("yellow_ma_01", "yellow", "ma");
  const hands = new Map<string, Card[]>([["B", [ju, ma]]]);
  const ops = createRoomStateOps(state, hands, () => null);

  const consumed = ops.takeMatchingCards("B", c("red_ju_target", "red", "ju"), 2);

  assert.deepEqual(consumed, []);
  assert.deepEqual(hands.get("B")?.map((card) => card.id), [ju.id, ma.id]);
});

t("playing-flow: local draw timeout retains special cards instead of passing", () => {
  assert.equal(resolveLocalDrawIdleAction(false, c("green_jiang", "green", "jiang")), "retain_special");
  assert.equal(resolveLocalDrawIdleAction(false, c("gold_hou", "gold", "hou")), "retain_special");
  assert.equal(resolveLocalDrawIdleAction(false, c("red_ju", "red", "ju")), "pass_to_next");
  assert.equal(resolveLocalDrawIdleAction(true, c("green_jiang", "green", "jiang")), "discard");
});

t("bot-strategy: hu is mandatory at every strength", () => {
  for (const strength of [0, 25, 50, 75, 100]) {
    const decision = chooseBotAction({
      hand: [],
      pendingCard: c("rj", "red", "jiang", "upper"),
      visibleCards: [],
      strength,
      random: createSeededRandom(strength + 1),
      actions: [
        { action: "hu", enabled: true },
        { action: "pass", enabled: true },
      ],
    });
    assert.equal(decision.action, "hu");
  }
});

t("bot-strategy: grabbed generals and gold cannot be passed when chi is legal", () => {
  const specialCards: Card[] = [
    c("yellow_jiang", "yellow", "jiang", "draw"),
    c("red_jiang", "red", "jiang", "draw"),
    c("green_jiang", "green", "jiang", "draw"),
    c("white_jiang", "white", "jiang", "draw"),
    c("gold_gong", "gold", "gong", "draw"),
    c("gold_hou", "gold", "hou", "draw"),
    c("gold_bo", "gold", "bo", "draw"),
    c("gold_zi", "gold", "zi", "draw"),
    c("gold_nan", "gold", "nan", "draw"),
  ];

  for (const strength of [0, 50, 100]) {
    for (const pendingCard of specialCards) {
      const decision = chooseBotAction({
        hand: [],
        pendingCard,
        visibleCards: [],
        strength,
        random: () => 0.999999,
        actions: [
          {
            action: "chi",
            enabled: true,
            candidates: [
              {
                id: `chi-${pendingCard.id}`,
                action: "chi",
                kind: "single",
                cardIds: [],
                source: "hand",
                title: "吃下",
              },
            ],
          },
          { action: "pass", enabled: true },
        ],
      });
      assert.deepEqual(decision, { action: "chi", candidateId: `chi-${pendingCard.id}` });
    }
  }
});

t("bot-strategy: hu still outranks mandatory special-card chi", () => {
  const decision = chooseBotAction({
    hand: [],
    pendingCard: c("yellow_jiang", "yellow", "jiang", "draw"),
    visibleCards: [],
    strength: 0,
    random: () => 0.999999,
    actions: [
      { action: "hu", enabled: true },
      {
        action: "chi",
        enabled: true,
        candidates: [
          { id: "chi-yellow", action: "chi", kind: "single", cardIds: [], source: "hand", title: "吃下" },
        ],
      },
      { action: "pass", enabled: true },
    ],
  });
  assert.equal(decision.action, "hu");
});

t("bot-strategy: seeded discard decisions are reproducible", () => {
  const hand = [
    c("rj1", "red", "ju"),
    c("rj2", "red", "ju"),
    c("rj3", "red", "ju"),
    c("ym1", "yellow", "ma"),
  ];
  const first = chooseBotDiscard({ hand, visibleCards: [], strength: 45, random: createSeededRandom(2026) });
  const second = chooseBotDiscard({ hand, visibleCards: [], strength: 45, random: createSeededRandom(2026) });
  assert.equal(first?.id, second?.id);
});

t("bot-strategy: high strength preserves a completed group more often", () => {
  const hand = [
    c("rj1", "red", "ju"),
    c("rj2", "red", "ju"),
    c("rj3", "red", "ju"),
    c("ym1", "yellow", "ma"),
  ];
  let lowBest = 0;
  let highBest = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    if (chooseBotDiscard({ hand, visibleCards: [], strength: 0, random: createSeededRandom(seed) })?.id === "ym1") {
      lowBest += 1;
    }
    if (chooseBotDiscard({ hand, visibleCards: [], strength: 100, random: createSeededRandom(seed) })?.id === "ym1") {
      highBest += 1;
    }
  }
  assert.equal(highBest > lowBest + 100, true, `low=${lowBest}, high=${highBest}`);
});

t("lobby: fixed seats support host bots and atomic occupancy", () => {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.roomMode = "friends";
  room.stateOps = null;
  room.playerOrder = [];
  room.playerHands = new Map();
  room.botIds = new Set();
  room.configuredBotIds = new Set();
  room.seatBySession = new Map();
  room.seatByToken = new Map();
  room.baseNameBySeat = new Map();
  room.pendingNameBySession = new Map();
  room.pendingTokenBySession = new Map();
  room.clients = [];
  room.broadcastAvailableActions = () => {};
  const sent: Array<{ event: string; payload: any }> = [];
  const host = { sessionId: "host", send: (event: string, payload: any) => sent.push({ event, payload }) };
  const guest = { sessionId: "guest", send: (event: string, payload: any) => sent.push({ event, payload }) };
  room.pendingNameBySession.set("host", "房主");
  room.pendingNameBySession.set("guest", "朋友");

  assert.equal(room.claimSeatForClient(host, 0, "token-host"), true);
  assert.equal(room.claimSeatForClient(guest, 0, "token-guest"), false);
  assert.equal(room.state.hostPlayerId, "seat_0");
  room.pendingTokenBySession.set("guest", "token-guest");
  room.handleClaimSeat(guest, { seatIndex: 1 });
  assert.equal(room.seatByToken.get("token-guest"), "seat_1");
  room.handleAddBot(host, { seatIndex: 2, strength: 83 });
  const bot = room.state.players.get("seat_2");
  assert.equal(BOT_DISPLAY_NAMES.some((name) => name === bot?.name), true);
  assert.equal(bot?.name.startsWith("机器人"), false);
  assert.equal(new Set([...room.state.players.values()].map((player) => player.name)).size, 3);
  assert.equal(bot?.isConfiguredBot, true);
  assert.equal(bot?.botStrength, 83);
  assert.deepEqual(room.playerOrder, ["seat_0", "seat_1", "seat_2"]);
  assert.equal(room.claimSeatForClient(host, 3, "token-host"), true);
  assert.equal(room.state.hostPlayerId, "seat_3");
  assert.equal(room.state.players.get("seat_3")?.name, "房主");
  assert.equal(room.state.players.has("seat_0"), false);
  assert.deepEqual(room.playerOrder, ["seat_1", "seat_2", "seat_3"]);
  assert.equal(sent.some((item) => item.event === "lobby_error" && item.payload.code === "seat_occupied"), true);
});

t("lobby: practice auto-fill uses unique friendly bot names", () => {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.targetSeats = 4;
  room.playerOrder = ["seat_0"];
  room.playerHands = new Map([["seat_0", []]]);
  room.botIds = new Set();
  room.configuredBotIds = new Set();
  const human = new PlayerState();
  human.clientId = "seat_0";
  human.seatIndex = 0;
  human.name = "玩家";
  room.state.players.set("seat_0", human);

  room.ensureBotSeatsForStart();

  const names = room.playerOrder.map((seatId: string) => room.state.players.get(seatId)?.name ?? "");
  assert.equal(names[0], "玩家");
  assert.equal(new Set(names).size, 4);
  assert.equal(names.slice(1).every((botName: string) => BOT_DISPLAY_NAMES.some((name) => name === botName)), true);
  assert.equal(names.slice(1).every((name: string) => !/^机器人\d+$/u.test(name)), true);
  assert.equal(room.playerOrder.slice(1).every((seatId: string) => room.state.players.get(seatId)?.isConfiguredBot), true);
});

t("lobby: active disconnect keeps the human name while enabling temporary bot control", () => {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = "playing";
  room.playerOrder = ["seat_0"];
  room.seatBySession = new Map([["session-human", "seat_0"]]);
  room.pendingNameBySession = new Map();
  room.pendingTokenBySession = new Map();
  room.baseNameBySeat = new Map([["seat_0", "张阿姨"]]);
  room.botIds = new Set();
  room.reconnectGraceMs = 0;
  room.tickBots = () => {};
  room.scheduleRoomIdleIfEmpty = () => {};

  const human = new PlayerState();
  human.clientId = "seat_0";
  human.name = "张阿姨";
  human.connected = true;
  human.isBot = false;
  human.isConfiguredBot = false;
  room.state.players.set("seat_0", human);

  room.onLeave({ sessionId: "session-human" });

  assert.equal(human.name, "张阿姨");
  assert.equal(human.connected, false);
  assert.equal(human.isBot, true);
  assert.equal(human.isConfiguredBot, false);
  assert.equal(room.botIds.has("seat_0"), true);
  assert.equal(room.state.lastAction, "TAKEOVER seat_0");
});

t("lobby: a seated player may return the table from any active phase", () => {
  assert.equal(canReturnLobby("seat_0", "declaring"), true);
  assert.equal(canReturnLobby("seat_0", "playing"), true);
  assert.equal(canReturnLobby("seat_0", "ended"), true);
  assert.equal(canReturnLobby("seat_0", "waiting"), false);
  assert.equal(canReturnLobby(undefined, "playing"), false);
});

t("privacy: public lobby snapshots never include any private hand", () => {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.roomMode = "friends";
  room.stateOps = null;
  room.playerOrder = ["seat_0", "seat_1"];
  room.playerHands = new Map([
    ["seat_0", [c("host-card", "red", "ju")]],
    ["seat_1", [c("guest-card", "yellow", "ma")]],
  ]);
  for (const [seatIndex, name] of ["房主", "朋友"].entries()) {
    const player = new PlayerState();
    player.clientId = `seat_${seatIndex}`;
    player.seatIndex = seatIndex;
    player.name = name;
    room.state.players.set(player.clientId, player);
  }

  const publicSnapshot = room.buildRoomSnapshot();
  assert.equal("privateHand" in publicSnapshot, false);
  assert.deepEqual(room.buildClientRoomSnapshot("seat_0").privateHand.map((card: Card) => card.id), ["host-card"]);
  assert.deepEqual(room.buildClientRoomSnapshot("seat_1").privateHand.map((card: Card) => card.id), ["guest-card"]);
});

t("room-state-ops: upgrade targets matching pair when multiple groups exist", () => {
  const state = new GameState();
  const player = new PlayerState();
  player.clientId = "B";
  player.name = "B";
  state.players.set("B", player);
  const ops = createRoomStateOps(state, new Map(), () => null);
  const a1 = c("rj1", "red", "ju");
  const a2 = c("rj2", "red", "ju");
  const b1 = c("gm1", "green", "ma");
  const b2 = c("gm2", "green", "ma");
  const pending = c("gm3", "green", "ma", "upper");
  player.exposedArea.push(ops.toSchemaCard(a1, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(a2, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(b1, false, "upper"));
  player.exposedArea.push(ops.toSchemaCard(b2, false, "upper"));
  player.exposedGroupSizes.push(2);
  player.exposedGroupSizes.push(2);

  const ok = ops.upgradeExposedPairToTriplet("B", [b1, b2], pending, true);

  assert.equal(ok, true);
  assert.deepEqual([...player.exposedGroupSizes], [2, 3]);
  assert.equal(player.exposedArea[0].id, "rj1");
  assert.equal(player.exposedArea[1].id, "rj2");
  assert.equal(player.exposedArea[2].id, "gm1");
  assert.equal(player.exposedArea[3].id, "gm2");
  assert.equal(player.exposedArea[4].id, "gm3");
});

t("actions: chi no longer supports wildcard completion", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rm", "red", "ma")];
  const pool = [c("g1", "gold", "gong")];
  assert.equal(canChi(hand, response, pool), false);
});

t("actions: chi frame cannot consume two wildcards in one group", () => {
  const response = c("rj", "red", "ju");
  const hand: Card[] = [];
  const pool = [c("w1", "white", "jiang"), c("g1", "gold", "gong")];
  assert.equal(canChi(hand, response, pool), false);
});

t("actions: kai still rejects one exact + two wildcards", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("w1", "white", "jiang"), c("g1", "gold", "gong")];
  assert.equal(canKai(hand, response, []), false);
});

t("actions: chi pair rejects jiang response", () => {
  const response = c("rj", "red", "jiang");
  const hand = [c("rj2", "red", "jiang")];
  const plans = getChiPlans(hand, response, []);
  assert.equal(plans.some((x) => x.kind === "pair"), false);
});

t("actions: chi single supports jiang response", () => {
  const response = c("rj", "red", "jiang");
  const plans = getChiPlans([], response, []);
  assert.equal(plans.some((x) => x.kind === "single"), true);
});

t("actions: chi single supports gold response", () => {
  const response = c("g1", "gold", "gong");
  const plans = getChiPlans([], response, []);
  assert.equal(plans.some((x) => x.kind === "single"), true);
});

t("actions: chi jsx supports jiang response with shi-xiang in hand", () => {
  const response = c("rj", "red", "jiang");
  const hand = [c("rs1", "red", "shi"), c("rx1", "red", "xiang")];
  const plans = getChiPlans(hand, response, []);
  const jsx = plans.find((x) => x.kind === "jsx");
  assert.ok(jsx);
  assert.equal(jsx!.handCards.length, 2);
});

t("actions: chi pair rejects wildcard substitution from hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("wj", "white", "jiang")];
  const plans = getChiPlans(hand, response, []);
  assert.equal(plans.some((x) => x.kind === "pair"), false);
});

t("actions: chi pair rejects wildcard substitution from pool", () => {
  const response = c("rj", "red", "ju");
  const hand: Card[] = [];
  const pool = [c("gold1", "gold", "gong")];
  const plans = getChiPlans(hand, response, pool);
  assert.equal(plans.some((x) => x.kind === "pair"), false);
});

t("actions: chi pair with two exact cards consumes two from hand", () => {
  const response = c("rj", "red", "ju");
  const hand = [c("rj1", "red", "ju"), c("rj2", "red", "ju")];
  const plans = getChiPlans(hand, response, []);
  const pair = plans.find((x) => x.kind === "pair");
  assert.ok(pair);
  assert.equal(pair!.handCards.length, 2);
  assert.equal(pair!.poolCards.length, 0);
});

t("hu: single jiang is valid", () => {
  const result = explainHu([], c("rj", "red", "jiang"));
  assert.equal(result.valid, true);
});

t("hu: jiang+shi+xiang frame is valid (将士象架)", () => {
  const hand = [c("rs", "red", "shi"), c("rx", "red", "xiang")];
  const response = c("rj", "red", "jiang");
  const result = explainHu(hand, response);
  assert.equal(result.valid, true);
  assert.ok(result.groups.includes("FrameJSX"));
});

t("hu: mixed-color jiang+shi+xiang is invalid", () => {
  const hand = [c("rs", "red", "shi"), c("gx", "green", "xiang")];
  const response = c("rj", "red", "jiang");
  const result = explainHu(hand, response);
  assert.equal(result.valid, false);
});

t("hu: wildcard pool no longer participates in substitution", () => {
  const hand = [c("rju", "red", "ju"), c("rma", "red", "ma")];
  const response = c("yzu", "yellow", "zu");
  const wildcardPool = [c("wj", "white", "jiang")];
  const result = explainHu(hand, response, { wildcardPool });
  assert.equal(result.valid, false);
});

t("hu: numeric wildcard option kept but ignored", () => {
  const hand = [c("rju", "red", "ju")];
  const response = c("rma", "red", "ma");
  assert.equal(validateHu(hand, response, 1), false);
});

t("hu: multiple single jiang groups are allowed", () => {
  const result = explainHu([c("rj1", "red", "jiang")], c("rj2", "red", "jiang"));
  assert.equal(result.valid, true);
  assert.equal(result.groups.filter((x) => x === "SingleJiang").length, 2);
});

t("hu: chooses highest scoring decomposition when several hu strategies exist", () => {
  const result = explainHu(
    [c("rp1", "red", "pao"), c("rp2", "red", "pao"), c("rp3", "red", "pao")],
    c("rp4", "red", "pao"),
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.groups, ["Quad"]);
});

t("dealer: public card determines dealer seat and enters dealer hand", () => {
  const order = ["A", "B", "C", "D"];
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dy", "yellow", "ju")), "A");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dr", "red", "ju")), "B");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dg", "green", "ju")), "C");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dw", "white", "ju")), "D");
  assert.equal(resolveDealerFromAnchorAndCard(order, "A", c("dgold", "gold", "zi")), "B");

  const hands = new Map<string, Card[]>();
  const deck = Array.from({ length: 80 }, (_, index) => c(`c${index}`, "red", "ju"));
  dealInitialHands(order, deck, hands);
  for (const seatId of order) {
    assert.equal(hands.get(seatId)?.length ?? 0, 20);
  }
  const dealerCard = c("marker", "white", "ju");
  const dealerId = resolveDealerFromAnchorAndCard(order, "A", dealerCard);
  const dealerHand = hands.get(dealerId) ?? [];
  dealerHand.unshift(dealerCard);
  hands.set(dealerId, dealerHand);
  assert.equal(hands.get("D")?.[0]?.id, "marker");
  assert.equal(hands.get("D")?.length ?? 0, 21);
});

t("declaration: default declares fish and only non-overlapping hidden kans", () => {
  const hand = [
    c("wp1", "white", "pao"),
    c("wp2", "white", "pao"),
    c("wp3", "white", "pao"),
    c("wp4", "white", "pao"),
    c("rj1", "red", "ju"),
    c("rj2", "red", "ju"),
    c("rj3", "red", "ju"),
    c("gs1", "green", "shi"),
    c("gs2", "green", "shi"),
    c("gs3", "green", "shi"),
  ];
  const payload = buildDefaultDeclarationPayload(hand);
  assert.deepEqual(payload.fishCardIds.sort(), ["wp1", "wp2", "wp3", "wp4"]);
  assert.equal(payload.declaredKongs, 2);
});

t("declaration: four identical cards cannot count as both fish and hidden kan", () => {
  const hand = [
    c("wp1", "white", "pao"),
    c("wp2", "white", "pao"),
    c("wp3", "white", "pao"),
    c("wp4", "white", "pao"),
  ];
  const result = buildDeclarationSelection(hand, {
    declaredKongs: 1,
    fishCardIds: ["wp1", "wp2", "wp3", "wp4"],
  });
  assert.equal(result.fishValid, true);
  assert.equal(result.declaredKongs, 0);
});

t("round_result: hu winner collects from all three opponents", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", []],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    ["GoldTriplet"],
  );
  const seatA = players.find((item) => item.clientId === "A");
  const seatB = players.find((item) => item.clientId === "B");
  const seatC = players.find((item) => item.clientId === "C");
  const seatD = players.find((item) => item.clientId === "D");
  assert.ok(seatA);
  assert.ok(seatB);
  assert.ok(seatC);
  assert.ok(seatD);
  assert.equal(seatA!.totalScore, 36);
  assert.equal(seatB!.totalScore, -12);
  assert.equal(seatC!.totalScore, -12);
  assert.equal(seatD!.totalScore, -12);
  assert.equal(seatA!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:GoldTriplet") && item.total === 27), true);
  assert.equal(seatA!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:GoldTriplet") && item.label === "金条坎"), true);
  assert.equal(seatB!.scoreBreakdown.some((item) => item.key.startsWith("HuLose:GoldTriplet") && item.label === "A 金条坎"), true);
});

t("round_result: exposed peng no longer counts as kan in mutual settlement", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", []],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const seatBPlayer = state.players.get("B");
  assert.ok(seatBPlayer);
  seatBPlayer!.exposedArea.push(ops.toSchemaCard(c("rj1", "red", "ju"), false, "upper"));
  seatBPlayer!.exposedArea.push(ops.toSchemaCard(c("rj2", "red", "ju"), false, "upper"));
  seatBPlayer!.exposedArea.push(ops.toSchemaCard(c("rj3", "red", "ju"), false, "upper"));
  seatBPlayer!.exposedGroupSizes.push(3);

  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    ["SingleJiang"],
  );
  const seatA = players.find((item) => item.clientId === "A");
  const seatB = players.find((item) => item.clientId === "B");
  const seatC = players.find((item) => item.clientId === "C");
  const seatD = players.find((item) => item.clientId === "D");
  assert.ok(seatA);
  assert.ok(seatB);
  assert.ok(seatC);
  assert.ok(seatD);
  assert.equal(seatA!.totalScore, 12);
  assert.equal(seatB!.totalScore, -4);
  assert.equal(seatC!.totalScore, -4);
  assert.equal(seatD!.totalScore, -4);
  assert.equal(seatB!.scoreBreakdown.filter((item) => item.key.startsWith("MutualGain:")).reduce((sum, item) => sum + item.total, 0), 0);
  assert.equal(seatB!.scoreBreakdown.some((item) => item.key.startsWith("HuLose:SingleJiang") && item.total === -1), true);
});

t("round_result: mutual payment label separates payer name from payment", () => {
  const state = new GameState();
  for (const [seat, name] of [
    ["A", "玩家1"],
    ["B", "阿福"],
    ["C", "小满"],
    ["D", "平安"],
  ]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = name;
    player.isConfiguredBot = seat !== "A";
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", []],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const owner = state.players.get("A");
  assert.ok(owner);
  for (const card of [
    c("gold_gong", "gold", "gong"),
    c("gold_hou", "gold", "hou"),
    c("gold_bo", "gold", "bo"),
    c("gold_zi", "gold", "zi"),
  ]) {
    owner!.exposedArea.push(ops.toSchemaCard(card, false, "upper"));
  }
  owner!.exposedGroupSizes.push(4);
  owner!.exposedGroupKinds.push("kai");

  const result = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    null,
    [],
  );
  const ownerResult = result.find((player) => player.clientId === "A");
  assert.ok(ownerResult);
  assert.equal(
    ownerResult!.scoreBreakdown.some(
      (item) => item.label === "阿福（机器人） 付 金条开" && item.total === 18,
    ),
    true,
  );
  assert.equal(result.find((player) => player.clientId === "B")?.isConfiguredBot, true);
});

t("round_result: undeclared identical triplets settle as peng after declared hidden kans", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const owner = state.players.get("A");
  assert.ok(owner);
  owner!.declaredKongs = 2;
  const hands = new Map<string, Card[]>([
    [
      "A",
      [
        c("rj1", "red", "ju"),
        c("rj2", "red", "ju"),
        c("rj3", "red", "ju"),
        c("rj4", "red", "ju"),
        c("rj5", "red", "ju"),
        c("rj6", "red", "ju"),
        c("rj7", "red", "ju"),
        c("rj8", "red", "ju"),
        c("rj9", "red", "ju"),
      ],
    ],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    null,
    [],
  );
  const seatA = players.find((item) => item.clientId === "A");
  assert.ok(seatA);
  const gains = seatA!.scoreBreakdown.filter((item) => item.key.startsWith("MutualGain:A:"));
  assert.equal(gains.filter((item) => item.label.includes("坎") && item.unit === 3).length, 6);
  assert.equal(gains.filter((item) => item.label.includes("碰") && item.unit === 1).length, 3);
  assert.equal(seatA!.totalScore, 21);
});

t("round_result: winner response gold is shown as winning group and hand leftovers do not inflate hu score", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    [
      "A",
      [
        c("yj1", "yellow", "jiang"),
        c("yj2", "yellow", "jiang"),
        c("gj1", "green", "jiang"),
        c("wj2", "white", "jiang"),
        c("rz1", "red", "zu"),
        c("gz1", "green", "zu"),
        c("yz1", "yellow", "zu"),
        c("wj1", "white", "jiang"),
        c("ws1", "white", "shi"),
        c("wx1", "white", "xiang"),
      ],
    ],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const seatAPlayer = state.players.get("A");
  assert.ok(seatAPlayer);
  seatAPlayer!.generalArea.push(ops.toSchemaCard(c("rj_open", "red", "jiang"), false, "upper"));
  [
    [c("rs1", "red", "shi"), c("rs2", "red", "shi"), c("rs3", "red", "shi")],
    [c("gx1", "green", "xiang"), c("gx2", "green", "xiang"), c("gx3", "green", "xiang")],
    [c("yj3", "yellow", "ju"), c("yj4", "yellow", "ju"), c("yj5", "yellow", "ju")],
  ].forEach((group) => {
    group.forEach((card) => seatAPlayer!.exposedArea.push(ops.toSchemaCard(card, false, "upper")));
    seatAPlayer!.exposedGroupSizes.push(group.length);
    seatAPlayer!.exposedGroupKinds.push("peng");
  });

  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    [],
    c("gold_zi_01", "gold", "zi", "upper"),
  );
  const winner = players.find((item) => item.clientId === "A");
  const loser = players.find((item) => item.clientId === "B");
  assert.ok(winner);
  assert.ok(loser);
  assert.equal(winner!.winningGroups.length, 1);
  assert.equal(winner!.winningGroups[0]?.cards[0]?.type, "zi");
  assert.equal(winner!.resolvedHandGroups.some((group) => group.cards.some((card) => card.type === "zi")), false);
  assert.equal(winner!.totalScore, 48);
  assert.equal(loser!.totalScore, -16);
});

t("round_result: winner response quad scores as kai without double-counting hidden kan", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", [c("rp1", "red", "pao"), c("rp2", "red", "pao"), c("rp3", "red", "pao")]],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    [],
    c("rp4", "red", "pao"),
  );
  const winner = players.find((item) => item.clientId === "A");
  assert.ok(winner);
  assert.equal(winner!.winningGroups.some((group) => group.key === "Quad"), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Quad") && item.label === "红炮开"), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Triplet")), false);
  assert.equal(winner!.totalScore, 54);
});

t("round_result: winner response triplet from two hand cards scores as peng not hidden kan", () => {
  const state = new GameState();
  for (const seat of ["A", "B", "C", "D"]) {
    const player = new PlayerState();
    player.clientId = seat;
    player.name = seat;
    state.players.set(seat, player);
  }
  const hands = new Map<string, Card[]>([
    ["A", [c("wx1", "white", "xiang"), c("wx2", "white", "xiang")]],
    ["B", []],
    ["C", []],
    ["D", []],
  ]);
  const ops = createRoomStateOps(state, hands, () => null);
  const players = buildRoundResultPlayers(
    ["A", "B", "C", "D"],
    state.players,
    hands,
    (card) => ops.toPlainCard(card),
    "A",
    [],
    c("wx3", "white", "xiang"),
  );
  const winner = players.find((item) => item.clientId === "A");
  const loser = players.find((item) => item.clientId === "B");
  assert.ok(winner);
  assert.ok(loser);
  assert.equal(winner!.winningGroups.some((group) => group.key === "Peng"), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Peng") && item.label === "白象碰" && item.unit === 1), true);
  assert.equal(winner!.scoreBreakdown.some((item) => item.key.startsWith("HuWin:Triplet")), false);
  assert.equal(winner!.totalScore, 12);
  assert.equal(loser!.totalScore, -4);
});

function mkRoom(seats: string[]) {
  const room = new FourColorGameRoom() as any;
  const state = new GameState();
  for (const seat of seats) {
    const p = new PlayerState();
    p.clientId = seat;
    p.name = seat;
    state.players.set(seat, p);
  }
  room.state = state;
  room.playerOrder = [...seats];
  room.state.phase = "playing";
  room.collectiveTimeoutMs = 5;
  room.localTimeoutMs = 5;
  room.operationTimeoutMs = 5;
  return room;
}

t("room: collective draw order starts from owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const order = room.getCollectiveOrder({
    ownerId: "A",
    card: c("x", "red", "ju", "draw"),
    collectives: new Map(),
  });
  assert.deepEqual(order, ["A", "B", "C", "D"]);
});

t("room: collective upper order starts from next and includes owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const order = room.getCollectiveOrder({
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map(),
  });
  assert.deepEqual(order, ["B", "C", "D", "A"]);
});

t("room: no-response on upper enters local_upper for next player", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.enterOwnerLocalPhaseAfterNoResponse("A");
  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentPlayerId, "B");
});

t("room: collective action probing no longer depends on current responder", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = null;
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  assert.equal(room.hasCollectiveActionBeyondPass("B"), true);
});

t("room: collective conflict resolves by polling order for same priority", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map<string, { action: string }>([
      ["B", { action: "kai" }],
      ["C", { action: "kai" }],
      ["D", { action: "pass" }],
      ["A", { action: "pass" }],
    ]),
  };
  let resolved: { id: string; action: string } | null = null;
  room.executeResponseWinner = (id: string, choice: { action: string }) => {
    resolved = { id, action: choice.action };
  };
  room.resolveCollectivePhase();
  assert.deepEqual(resolved, { id: "B", action: "kai" });
});

t("room: collective priority uses hu over kai/peng", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("x", "red", "ju", "upper"),
    collectives: new Map<string, { action: string }>([
      ["B", { action: "kai" }],
      ["C", { action: "hu" }],
      ["D", { action: "peng" }],
      ["A", { action: "pass" }],
    ]),
  };
  let resolved: { id: string; action: string } | null = null;
  room.executeResponseWinner = (id: string, choice: { action: string }) => {
    resolved = { id, action: choice.action };
  };
  room.resolveCollectivePhase();
  assert.deepEqual(resolved, { id: "C", action: "hu" });
});

t("room: force-take draw wildcard can directly win when no legal discard", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("A", []);
  room.pendingResponse = {
    ownerId: "A",
    card: c("w1", "white", "jiang", "draw"),
    collectives: new Map(),
  };
  room.enterOwnerLocalPhaseAfterNoResponse("A");
  const candidateId = room
    .getAvailableActions("A")
    .find((item: any) => item.action === "chi")
    ?.candidates?.find((candidate: any) => candidate.kind === "single")?.id;
  assert.ok(candidateId);
  room.executeEat("A", candidateId);
  assert.equal(room.state.phase, "ended");
  assert.match(String(room.state.lastAction), /^A HU$/);
});

t("room: declaring finish immediately enters dealer discard stage after declarations", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.state.phase = "declaring";
  room.roundDealerId = "A";
  room.playerHands.set("A", [c("m1", "red", "ma")]);
  room.finishDeclaringPhase();
  assert.equal(room.state.phase, "playing");
  assert.equal(room.state.lastAction, "A OPENING_DISCARD");
  assert.equal(room.awaitingDiscardOwnerId, "A");
  assert.equal(room.pendingResponse?.ownerId, "A");
  assert.equal(room.state.responseEndsAt > 0, true);
  room.onDispose();
});

t("room: local chi enters manual discard stage instead of auto discard", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.state.currentPlayerId = "B";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("ym1", "yellow", "ma")]);
  room.seatBySession.set("sessB", "B");
  const client = { sessionId: "sessB", send: () => {} };
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "chi")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.handleAction(client, { action: "chi", candidateId });

  assert.equal(room.awaitingDiscardOwnerId, "B");
  assert.equal(room.state.responsePhase, "local_draw");
  assert.equal(room.state.phase, "playing");
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
});

t("room: local upper pass draws new target without adding to hand", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.playerHands.set("B", [c("ym1", "yellow", "ma")]);
  room.deck = [
    c("draw1", "green", "pao", "draw"),
    c("draw2", "white", "zu", "draw"),
    c("draw3", "red", "ma", "draw"),
    c("draw4", "yellow", "ju", "draw"),
    c("draw5", "green", "zu", "draw"),
    c("draw6", "white", "ju", "draw"),
    c("draw7", "red", "pao", "draw"),
    c("draw8", "yellow", "zu", "draw"),
    c("draw9", "green", "ma", "draw"),
    c("draw10", "white", "ma", "draw"),
  ];
  const before = (room.playerHands.get("B") ?? []).length;

  room.executeGrab("B");

  assert.equal((room.playerHands.get("B") ?? []).length, before);
  assert.equal(room.pendingResponse?.card.id, "draw1");
  assert.equal(room.pendingResponse?.card.source, "upper");
  assert.equal(room.pendingResponse?.ownerId, "B");
  assert.equal(room.pendingResponse?.responsePhaseAfterNoResponse, "local_draw");
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
  assert.equal(room.state.currentPlayerId, "B");
  assert.equal(room.state.responsePhase, "local_draw");
});

t("room: bots force-take every grabbed general and gold card", () => {
  const specialCards: Card[] = [
    c("yellow_jiang", "yellow", "jiang", "upper"),
    c("red_jiang", "red", "jiang", "upper"),
    c("green_jiang", "green", "jiang", "upper"),
    c("white_jiang", "white", "jiang", "upper"),
    c("gold_gong", "gold", "gong", "upper"),
    c("gold_hou", "gold", "hou", "upper"),
    c("gold_bo", "gold", "bo", "upper"),
    c("gold_zi", "gold", "zi", "upper"),
    c("gold_nan", "gold", "nan", "upper"),
  ];

  for (const strength of [0, 50, 100]) {
    for (const specialCard of specialCards) {
      const room = mkRoom(["A", "B", "C", "D"]);
      const bot = room.state.players.get("B");
      bot.botStrength = strength;
      room.botIds.add("B");
      room.botThinkMinMs = 60_000;
      room.botThinkMaxMs = 60_000;
      room.pendingResponse = {
        ownerId: "A",
        card: specialCard,
        collectives: new Map(),
        responsePhaseAfterNoResponse: "local_draw",
      };
      room.state.responsePhase = "collective";
      room.playerHands.set("B", [c(`discard-${strength}-${specialCard.id}`, "yellow", "ma")]);

      room.enterOwnerLocalPhaseAfterNoResponse("A");
      const localActions = room.getAvailableActions("B");
      assert.equal(localActions.find((item: any) => item.action === "pass")?.enabled, false);
      assert.equal(localActions.find((item: any) => item.action === "chi")?.enabled, true);
      room.runBotStepNow();

      const player = room.state.players.get("B");
      assert.equal(player?.exposedArea.some((card: Card) => card.id === specialCard.id), true);
      assert.equal(player?.generalArea.some((card: Card) => card.id === specialCard.id), false);
      assert.equal(player?.wildcardPool.some((card: Card) => card.id === specialCard.id), false);
      assert.equal(player?.discardPile.some((card: Card) => card.id === specialCard.id), false);
      assert.equal(room.state.publicDiscardPile.some((card: Card) => card.id === specialCard.id), false);
      assert.equal(room.awaitingDiscardOwnerId, "B");
      assert.equal(room.pendingResponse?.card.id.startsWith("discard-"), true);
      assert.equal(room.state.lastAction, "B FORCE_TAKE");
      room.onDispose();
    }
  }
});

t("room: deferred grabbed general chi consumes shi-xiang before discard", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("green_jiang_01", "green", "jiang", "upper"),
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_draw",
  };
  room.state.responsePhase = "collective";
  room.playerHands.set("B", [
    c("green_shi_01", "green", "shi"),
    c("green_xiang_01", "green", "xiang"),
    c("yellow_ma_01", "yellow", "ma"),
  ]);
  const deferredCandidateId = room
    .getAvailableActions("B", true)
    .find((item: any) => item.action === "chi")
    ?.candidates?.find((candidate: any) => candidate.kind === "jsx")?.id;
  assert.ok(deferredCandidateId);

  room.enterOwnerLocalPhaseAfterNoResponse("A");
  const localActions = room.getAvailableActions("B");
  assert.equal(room.state.responsePhase, "local_draw");
  assert.equal(room.pendingResponse?.ownerId, "B");
  assert.equal(localActions.find((item: any) => item.action === "pass")?.enabled, false);
  assert.equal(
    localActions
      .find((item: any) => item.action === "chi")
      ?.candidates?.some((candidate: any) => candidate.id === deferredCandidateId),
    true,
  );

  room.seatBySession.set("sessB", "B");
  room.handleAction({ sessionId: "sessB", send: () => {} }, { action: "chi", candidateId: deferredCandidateId });

  assert.deepEqual(room.playerHands.get("B")?.map((card: Card) => card.id), ["yellow_ma_01"]);
  assert.deepEqual(
    [...(room.state.players.get("B")?.exposedArea ?? [])].map((card: Card) => card.id),
    ["green_jiang_01", "green_shi_01", "green_xiang_01"],
  );
  assert.deepEqual([...(room.state.players.get("B")?.exposedGroupSizes ?? [])], [3]);
  assert.deepEqual([...(room.state.players.get("B")?.exposedGroupKinds ?? [])], ["chi"]);
  assert.equal(room.state.players.get("B")?.generalArea.length ?? 0, 0);
  assert.equal(room.state.players.get("B")?.wildcardPool.length ?? 0, 0);
  assert.equal(room.awaitingDiscardOwnerId, "B");
  assert.equal(room.state.lastAction, "B CHI");
  room.onDispose();
});

t("room: local draw pass_to_next keeps recipient as next local upper owner", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("pass1", "white", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";

  room.executePassToNext("B");

  assert.equal(room.pendingResponse?.ownerId, "B");
  assert.equal(room.state.responsePhase, "collective");
  assert.equal(room.state.currentPlayerId, "C");
  assert.equal(room.getAvailableActions("C").find((item: any) => item.action === "pass")?.deferred, true);

  room.seatBySession.set("sessC", "C");
  room.handleAction({ sessionId: "sessC", send: () => {} }, "pass");

  assert.equal(room.pendingResponse?.ownerId, "C");
  assert.equal(room.state.responsePhase, "local_upper");
  assert.equal(room.state.currentPlayerId, "C");
});

t("room: collective kai enters discard stage instead of kong draw", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("rj3", "red", "ju"), c("ym1", "yellow", "ma")]);
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "kai")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.executeResponseWinner("B", { action: "kai", candidateId });

  assert.equal(room.awaitingDiscardOwnerId, "B");
  assert.equal(room.state.responsePhase, "local_draw");
  assert.equal(room.state.currentPlayerId, "B");
  assert.equal(room.state.lastAction, "B KAI");
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
});

t("room: entering discard stage with no legal card ends with winner instead of draw", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("w1", "white", "jiang"), c("rj1", "red", "jiang")]);
  room.enterDiscardStage("B", "CHI");
  assert.equal(room.state.phase, "ended");
  assert.match(String(room.state.lastAction), /^B HU$/);
});

t("room: human discard rejects gold cards", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.awaitingDiscardOwnerId = "B";
  room.playerHands.set("B", [c("g1", "gold", "gong"), c("m1", "red", "ma")]);
  room.seatBySession.set("sessB", "B");
  const client = { sessionId: "sessB", send: () => {} };

  room.handleDiscardCard(client, { cardId: "g1" });

  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
  assert.equal((room.playerHands.get("B") ?? []).some((card: Card) => card.id === "g1"), true);
});

t("room: bot auto-discard skips gold cards", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "draw"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_draw";
  room.awaitingDiscardOwnerId = "B";
  room.playerHands.set("B", [c("g1", "gold", "gong"), c("m1", "red", "ma")]);
  room.botIds.add("B");

  room.runBotStepNow();

  const discard = room.state.players.get("B")?.discardPile ?? [];
  const top = discard[discard.length - 1];
  assert.ok(top);
  assert.equal(top!.color, "red");
  assert.equal(top!.id, "m1");
});

t("room: bot local special candidate retains the card instead of passing", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "jiang", "draw"),
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_draw",
  };
  room.state.responsePhase = "local_draw";
  room.state.currentPlayerId = "B";
  room.state.currentTurnPlayerId = "B";
  room.botIds.add("B");
  room.playerHands.set("B", [c("m1", "yellow", "ma")]);

  room.runBotStepNow();

  assert.equal(room.state.players.get("B")?.generalArea.length ?? 0, 0);
  assert.equal(room.state.players.get("B")?.wildcardPool.length ?? 0, 0);
  assert.equal(room.state.players.get("B")?.exposedArea.length ?? 0, 1);
  assert.deepEqual([...(room.state.players.get("B")?.exposedGroupSizes ?? [])], [1]);
  assert.equal(room.state.players.get("B")?.discardPile.length ?? 0, 0);
  assert.equal(room.awaitingDiscardOwnerId, "B");
});

t("room: collective peng consumes source discard from flow", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const discard = c("resp", "red", "ju", "upper");
  room.ops.pushDiscard("A", discard);
  room.pendingResponse = {
    ownerId: "A",
    card: discard,
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("m1", "yellow", "ma")]);
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "peng")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.executeResponseWinner("B", { action: "peng", candidateId });

  assert.equal(room.state.players.get("A")?.discardPile.length ?? 0, 0);
  assert.equal(room.state.publicDiscardPile.length, 0);
});

t("room: local chi consumes source discard from original flow after owner rebind", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  const discard = c("resp", "red", "ju", "upper");
  room.ops.pushDiscard("A", discard);
  room.pendingResponse = {
    ownerId: "B",
    card: discard,
    collectives: new Map(),
    responsePhaseAfterNoResponse: "local_upper",
  };
  room.state.responsePhase = "local_upper";
  room.state.currentPlayerId = "B";
  room.state.currentTurnPlayerId = "B";
  room.state.pollOriginPlayerId = "A";
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju"), c("m1", "yellow", "ma")]);

  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "chi")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  const ok = room.executeEat("B", candidateId);

  assert.equal(ok, true);
  assert.equal(room.state.players.get("A")?.discardPile.length ?? 0, 0);
  assert.equal(room.state.publicDiscardPile.length, 0);
});

t("room: local human phase schedules response timeout", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "B",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "local_upper";
  room.state.currentPlayerId = "B";

  room.tickBots();

  assert.equal(room.state.responseEndsAt > Date.now(), true);
  assert.equal(Boolean(room.collectiveTimer), true);
  room.clearCollectiveTimer();
});

t("room: human collective peng without candidateId is rejected", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.advanceCollectivePolling = () => {};
  room.seatBySession.set("sessB", "B");
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "sessB",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleAction(client, "peng");

  assert.equal(room.pendingResponse.collectives.has("B"), false);
  assert.equal(sent.some((x) => x.event === "action_rejected" && x.payload?.reason === "candidate_required"), true);
});

t("room: human collective peng with candidateId is accepted", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.advanceCollectivePolling = () => {};
  room.seatBySession.set("sessB", "B");
  const client = { sessionId: "sessB", send: () => {} };
  const candidateId = room
    .getAvailableActions("B")
    .find((item: any) => item.action === "peng")
    ?.candidates?.[0]?.id;
  assert.ok(candidateId);

  room.handleAction(client, { action: "peng", candidateId });

  assert.deepEqual(room.pendingResponse.collectives.get("B"), { action: "peng", candidateId });
});

t("room: human collective peng with invalid candidateId is rejected", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.playerHands.set("B", [c("rj1", "red", "ju"), c("rj2", "red", "ju")]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.advanceCollectivePolling = () => {};
  room.seatBySession.set("sessB", "B");
  const sent: Array<{ event: string; payload: any }> = [];
  const client = {
    sessionId: "sessB",
    send: (event: string, payload: any) => sent.push({ event, payload }),
  };

  room.handleAction(client, { action: "peng", candidateId: "bad-id" });

  assert.equal(room.pendingResponse.collectives.has("B"), false);
  assert.equal(sent.some((x) => x.event === "action_rejected" && x.payload?.reason === "invalid_candidate"), true);
});

t("room: bot collective returns the candidate id for a sampled meld", () => {
  const room = mkRoom(["A", "B", "C", "D"]);
  room.pendingResponse = {
    ownerId: "A",
    card: c("resp", "red", "ju", "upper"),
    collectives: new Map(),
  };
  room.state.responsePhase = "collective";
  room.collectiveResponderId = "B";
  room.botIds.add("B");
  room.advanceCollectivePolling = () => {};
  room.getAvailableActions = () => [
    { action: "hu", enabled: false },
    { action: "kai", enabled: false },
    { action: "peng", enabled: true, candidates: [{ id: "bot-peng-1" }] },
    { action: "chi", enabled: false },
    { action: "pass", enabled: true },
  ];

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    room.runBotStepNow();
  } finally {
    Math.random = originalRandom;
  }

  const choice = room.pendingResponse.collectives.get("B");
  assert.equal(choice?.action, "peng");
  assert.equal(choice?.candidateId, "bot-peng-1");
});

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
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} test(s) passed`);
