import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimitMiddleware, parseBoundedInteger } from "../../http/rate-limit.js";

function responseDouble() {
  const headers = new Map<string, string>();
  return {
    statusCode: 0,
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

test("bounded integer settings reject invalid values and clamp extremes", () => {
  assert.equal(parseBoundedInteger(undefined, 10, 1, 100), 10);
  assert.equal(parseBoundedInteger("not-a-number", 10, 1, 100), 10);
  assert.equal(parseBoundedInteger("0", 10, 1, 100), 1);
  assert.equal(parseBoundedInteger("999", 10, 1, 100), 100);
  assert.equal(parseBoundedInteger("12.8", 10, 1, 100), 12);
});

test("rate limiter allows the configured budget then returns retry metadata", () => {
  let timestamp = 10_000;
  const middleware = createRateLimitMiddleware({
    maxRequests: 2,
    windowMs: 60_000,
    now: () => timestamp,
  });
  const request = { ip: "203.0.113.9", socket: {} } as any;

  for (let index = 0; index < 2; index += 1) {
    const response = responseDouble();
    let routed = false;
    middleware(request, response as any, () => {
      routed = true;
    });
    assert.equal(routed, true);
    assert.equal(response.headers.get("RateLimit-Limit"), "2");
  }

  const rejected = responseDouble();
  let routed = false;
  middleware(request, rejected as any, () => {
    routed = true;
  });
  assert.equal(routed, false);
  assert.equal(rejected.statusCode, 429);
  assert.equal(rejected.headers.get("RateLimit-Remaining"), "0");
  assert.equal(rejected.headers.get("Retry-After"), "60");
  assert.deepEqual(rejected.body, {
    ok: false,
    code: "rate_limited",
    message: "请求过于频繁，请稍后再试。",
  });

  timestamp += 60_000;
  const reset = responseDouble();
  middleware(request, reset as any, () => {
    routed = true;
  });
  assert.equal(routed, true);
  assert.equal(reset.headers.get("RateLimit-Remaining"), "1");
});

test("rate limiter keeps separate budgets for separate client addresses", () => {
  const middleware = createRateLimitMiddleware({ maxRequests: 1, windowMs: 60_000 });
  for (const ip of ["203.0.113.10", "203.0.113.11"]) {
    let routed = false;
    middleware({ ip, socket: {} } as any, responseDouble() as any, () => {
      routed = true;
    });
    assert.equal(routed, true);
  }
});
