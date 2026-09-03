import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryGuestProfileStore } from "../../profiles/guest-profile-store.js";
import { recordGuestRoundResults } from "../../profiles/guest-profile-runtime.js";

const WINNER_TOKEN = `gp_${"c".repeat(48)}`;
const LOSER_TOKEN = `gp_${"d".repeat(48)}`;
const BOT_TOKEN = `gp_${"e".repeat(48)}`;

test("authoritative settlement records humans once and ignores configured computers", async () => {
  const store = new InMemoryGuestProfileStore(() => 5000);
  const tokens = new Map([
    ["seat_0", WINNER_TOKEN],
    ["seat_1", LOSER_TOKEN],
    ["seat_2", BOT_TOKEN],
  ]);
  const results = [
    { clientId: "seat_0", isConfiguredBot: false, totalScore: 18 },
    { clientId: "seat_1", isConfiguredBot: false, totalScore: -6 },
    { clientId: "seat_2", isConfiguredBot: true, totalScore: -6 },
    { clientId: "seat_3", isConfiguredBot: false, totalScore: -6 },
  ];

  await recordGuestRoundResults(store, "room-one:1", "seat_0", results, tokens);
  await recordGuestRoundResults(store, "room-one:1", "seat_0", results, tokens);

  assert.deepEqual(await store.getOrCreate(WINNER_TOKEN), {
    nickname: "牌友",
    roundsPlayed: 1,
    huWins: 1,
    totalScore: 18,
    createdAt: 5000,
    updatedAt: 5000,
  });
  assert.equal((await store.getOrCreate(LOSER_TOKEN)).roundsPlayed, 1);
  assert.equal((await store.getOrCreate(LOSER_TOKEN)).huWins, 0);
  assert.equal((await store.getOrCreate(LOSER_TOKEN)).totalScore, -6);
  assert.equal((await store.getOrCreate(BOT_TOKEN)).roundsPlayed, 0);
});

test("profile storage errors never interrupt round settlement", async () => {
  const warnings: string[] = [];
  await assert.doesNotReject(() =>
    recordGuestRoundResults(
      {
        getOrCreate: async () => { throw new Error("storage details must stay private"); },
        updateName: async () => { throw new Error("storage details must stay private"); },
        recordRound: async () => { throw new Error("storage details must stay private"); },
      },
      "room-two:1",
      null,
      [{ clientId: "seat_0", isConfiguredBot: false, totalScore: 0 }],
      new Map([["seat_0", WINNER_TOKEN]]),
      (message) => warnings.push(message),
    ),
  );
  assert.deepEqual(warnings, ["临时档案记账失败，牌局结算不受影响。"]);
});

