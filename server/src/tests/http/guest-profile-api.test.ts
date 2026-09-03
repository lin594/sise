import assert from "node:assert/strict";
import test from "node:test";
import { createGuestProfileHandlers } from "../../http/guest-profile-api.js";
import { InMemoryGuestProfileStore } from "../../profiles/guest-profile-store.js";

const TOKEN = `gp_${"b".repeat(48)}`;

function responseDouble() {
  const headers = new Map<string, string>();
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers,
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

test("guest profile API accepts only its dedicated bearer credential", async () => {
  const handlers = createGuestProfileHandlers(new InMemoryGuestProfileStore());
  for (const authorization of [undefined, "Basic abc", "Bearer room-token"]) {
    const response = responseDouble();
    await handlers.get({ headers: { authorization } } as any, response as any);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      ok: false,
      message: "本机档案凭证无效，请刷新页面后重试。",
    });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("guest profile API creates, renames and reads a no-store profile", async () => {
  const handlers = createGuestProfileHandlers(new InMemoryGuestProfileStore(() => 1234));
  const request = { headers: { authorization: `Bearer ${TOKEN}` } } as any;

  const initial = responseDouble();
  await handlers.get(request, initial as any);
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(initial.body, {
    ok: true,
    profile: {
      nickname: "牌友",
      roundsPlayed: 0,
      huWins: 0,
      totalScore: 0,
      createdAt: 1234,
      updatedAt: 1234,
    },
  });

  const renamed = responseDouble();
  await handlers.put({ ...request, body: { nickname: " 林阿姨 " } } as any, renamed as any);
  assert.equal(renamed.statusCode, 200);
  assert.equal((renamed.body as any).profile.nickname, "林阿姨");

  const readBack = responseDouble();
  await handlers.get(request, readBack as any);
  assert.equal((readBack.body as any).profile.nickname, "林阿姨");
});

test("guest profile API rejects an empty nickname without changing play state", async () => {
  const handlers = createGuestProfileHandlers(new InMemoryGuestProfileStore());
  const response = responseDouble();
  await handlers.put(
    { headers: { authorization: `Bearer ${TOKEN}` }, body: { nickname: "   " } } as any,
    response as any,
  );
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { ok: false, message: "请先填写牌桌昵称。" });
});

