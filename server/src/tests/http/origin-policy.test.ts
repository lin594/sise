import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorsOriginHeaders,
  createCorsMiddleware,
  createOriginPolicy,
  isOriginAllowed,
  shouldEnableMonitor,
} from "../../http/origin-policy.js";

test("production denies browser origins unless explicitly configured", () => {
  const policy = createOriginPolicy(undefined, "production");

  assert.equal(isOriginAllowed(undefined, policy), true);
  assert.equal(isOriginAllowed("https://cards.example.com", policy), false);
});

test("configured origins are normalized and matched exactly", () => {
  const policy = createOriginPolicy(
    " https://cards.example.com/, http://127.0.0.1:3000, invalid-origin ",
    "production",
  );

  assert.equal(isOriginAllowed("https://cards.example.com", policy), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:3000", policy), true);
  assert.equal(isOriginAllowed("https://evil.example.com", policy), false);
  assert.equal(isOriginAllowed("https://cards.example.com.evil.test", policy), false);
});

test("development and an explicit wildcard allow browser origins", () => {
  assert.equal(isOriginAllowed("http://192.168.1.8:5173", createOriginPolicy(undefined, "development")), true);
  assert.equal(isOriginAllowed("https://cards.example.com", createOriginPolicy("*", "production")), true);
});

test("matchmaking CORS headers reflect only an allowed browser origin", () => {
  const policy = createOriginPolicy("https://cards.example.com", "production");

  assert.deepEqual(buildCorsOriginHeaders("https://cards.example.com", policy), {
    "Access-Control-Allow-Origin": "https://cards.example.com",
    Vary: "Origin",
  });
  assert.deepEqual(buildCorsOriginHeaders("https://evil.example.com", policy), {
    "Access-Control-Allow-Origin": "null",
    Vary: "Origin",
  });
  assert.deepEqual(buildCorsOriginHeaders(undefined, policy), { "Access-Control-Allow-Origin": "*" });
});

test("the monitor defaults off in production and can be opted in", () => {
  assert.equal(shouldEnableMonitor("production", undefined), false);
  assert.equal(shouldEnableMonitor("development", undefined), true);
  assert.equal(shouldEnableMonitor("production", "true"), true);
  assert.equal(shouldEnableMonitor("development", "0"), false);
});

test("the HTTP middleware rejects an unknown browser origin before routing", () => {
  const middleware = createCorsMiddleware(createOriginPolicy("https://cards.example.com", "production"));
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  let routed = false;

  middleware(
    { headers: { origin: "https://evil.example.com" }, method: "GET" } as any,
    response as any,
    () => {
      routed = true;
    },
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { ok: false, message: "origin not allowed" });
  assert.equal(routed, false);
});

test("the HTTP middleware answers an allowed preflight without entering a route", () => {
  const middleware = createCorsMiddleware(createOriginPolicy("https://cards.example.com", "production"));
  const headers = new Map<string, string>();
  const response = {
    statusCode: 0,
    header(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    sendStatus(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  let routed = false;

  middleware(
    { headers: { origin: "https://cards.example.com" }, method: "OPTIONS" } as any,
    response as any,
    () => {
      routed = true;
    },
  );

  assert.equal(response.statusCode, 204);
  assert.equal(headers.get("Access-Control-Allow-Origin"), "https://cards.example.com");
  assert.equal(headers.get("Vary"), "Origin");
  assert.equal(headers.get("Access-Control-Allow-Methods"), "GET,POST,PUT,OPTIONS");
  assert.equal(
    headers.get("Access-Control-Expose-Headers"),
    "Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset",
  );
  assert.equal(routed, false);
});
