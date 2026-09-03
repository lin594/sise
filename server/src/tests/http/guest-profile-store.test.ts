import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryGuestProfileStore,
  normalizeGuestProfileName,
  normalizeGuestProfileToken,
} from "../../profiles/guest-profile-store.js";

const TOKEN = `gp_${"a".repeat(48)}`;

test("guest profile tokens accept only the dedicated high-entropy format", () => {
  assert.equal(normalizeGuestProfileToken(`  ${TOKEN}  `), TOKEN);
  assert.equal(normalizeGuestProfileToken(`pt_${"a".repeat(48)}`), "");
  assert.equal(normalizeGuestProfileToken("gp_short"), "");
  assert.equal(normalizeGuestProfileToken(`gp_${"A".repeat(48)}`), "");
  assert.equal(normalizeGuestProfileToken(123), "");
});

test("guest profile names remove invisible controls and stay readable", () => {
  assert.equal(normalizeGuestProfileName("  阿\u200b姨\n  "), "阿姨");
  assert.equal(normalizeGuestProfileName(""), "牌友");
  assert.equal(normalizeGuestProfileName("一二三四五六七八九十一二三四五六七"), "一二三四五六七八九十一二三四五六");
});

test("new guest profiles start at zero and retain their latest nickname", async () => {
  let timestamp = 1_700_000_000_000;
  const store = new InMemoryGuestProfileStore(() => timestamp);

  const initial = await store.getOrCreate(TOKEN);
  assert.deepEqual(initial, {
    nickname: "牌友",
    roundsPlayed: 0,
    huWins: 0,
    totalScore: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  timestamp += 1_000;
  const renamed = await store.updateName(TOKEN, " 陈叔叔 ");
  assert.equal(renamed.nickname, "陈叔叔");
  assert.equal(renamed.createdAt, 1_700_000_000_000);
  assert.equal(renamed.updatedAt, timestamp);
});

test("authoritative round events update once and keep losses separate from hu wins", async () => {
  let timestamp = 1_700_000_000_000;
  const store = new InMemoryGuestProfileStore(() => timestamp);
  await store.updateName(TOKEN, "周伯");

  timestamp += 1_000;
  const won = await store.recordRound({
    token: TOKEN,
    eventId: "room-a:1",
    won: true,
    score: 18,
  });
  assert.deepEqual(won, {
    nickname: "周伯",
    roundsPlayed: 1,
    huWins: 1,
    totalScore: 18,
    createdAt: 1_700_000_000_000,
    updatedAt: timestamp,
  });

  timestamp += 1_000;
  const duplicate = await store.recordRound({
    token: TOKEN,
    eventId: "room-a:1",
    won: true,
    score: 18,
  });
  assert.deepEqual(duplicate, won);

  timestamp += 1_000;
  const lost = await store.recordRound({
    token: TOKEN,
    eventId: "room-b:1",
    won: false,
    score: -6,
  });
  assert.equal(lost.roundsPlayed, 2);
  assert.equal(lost.huWins, 1);
  assert.equal(lost.totalScore, 12);
  assert.equal(lost.updatedAt, timestamp);
});

