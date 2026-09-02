import assert from "node:assert/strict";
import test from "node:test";
import { readPrivateStateToken } from "../../http/private-state-auth.js";

test("private state token prefers a bearer authorization header", () => {
  assert.equal(readPrivateStateToken("Bearer room-token", "legacy-token"), "room-token");
  assert.equal(readPrivateStateToken("  bearer another-token  ", ""), "another-token");
});

test("private state token keeps the legacy query fallback", () => {
  assert.equal(readPrivateStateToken(undefined, " legacy-token "), "legacy-token");
  assert.equal(readPrivateStateToken("Basic abc", "legacy-token"), "legacy-token");
});

test("private state token rejects malformed or non-string values", () => {
  assert.equal(readPrivateStateToken("Bearer token with spaces", undefined), "");
  assert.equal(readPrivateStateToken(["Bearer first-token", "Bearer second-token"], undefined), "first-token");
  assert.equal(readPrivateStateToken(undefined, 123), "");
});
