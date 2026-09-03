# Guest Player Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a passwordless device-bound guest profile whose server-authoritative round statistics survive room changes and production restarts.

**Architecture:** A dedicated profile store exposes an in-memory implementation and an optional Redis implementation. The client owns one high-entropy profile token, sends it separately from room credentials, and renders only non-sensitive aggregate statistics in the mode lobby.

**Tech Stack:** Node.js 22, TypeScript, Express, Redis, Colyseus, Vue 3, Playwright.

---

### Task 1: Profile domain and persistence

**Files:**
- Create: `server/src/profiles/guest-profile-store.ts`
- Create: `server/src/tests/http/guest-profile-store.test.ts`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`

1. Write tests for token validation, zero-value creation, nickname normalization, score increments and idempotent round events.
2. Run the focused Node test and confirm it fails before the module exists.
3. Implement `GuestProfileStore`, an in-memory store, and a Redis-backed store using hashed keys.
4. Make Redis connection failure fall back to memory without failing server startup.
5. Run the focused test and server build.
6. Commit as `feat(server): persist anonymous guest profiles`.

### Task 2: HTTP and room settlement integration

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/rooms/GameRoom.ts`
- Create: `server/src/tests/http/guest-profile-api.test.ts`
- Create: `server/src/tests/rooms/guest-profile-settlement.test.ts`
- Modify: `docker-compose.yml`

1. Add failing tests for Bearer-only profile reads/writes, rate limiting and no-store responses.
2. Add failing room tests for human win/loss stats, configured bot exclusion, temporary auto-play ownership and duplicate settlement protection.
3. Register `GET/PUT /guest-profile`, configure the shared store before accepting traffic, and pass a profile recorder into rooms.
4. Bind valid profile tokens to human seats without adding them to Schema or logs.
5. Record each completed round asynchronously and idempotently after final scores are known.
6. Add bounded profile rate-limit configuration to Compose and documentation.
7. Run all server tests and commit as `feat(server): record authoritative guest results`.

### Task 3: Client identity and lobby summary

**Files:**
- Create: `client/src/composables/useGuestProfile.ts`
- Modify: `client/src/composables/useRoom.ts`
- Modify: `client/src/App.vue`
- Modify: `client/src/components/LobbyPage.vue`
- Modify generated `.js` and `.d.ts` files produced by the client build
- Create: `tests/e2e/guest-profile.spec.ts`

1. Add browser tests that assert profile tokens never enter URLs and that the mode lobby renders zero and completed-round states.
2. Generate and persist the profile token with `crypto.getRandomValues`; never reuse a room token.
3. Include `profileToken` in all room joins and recoveries.
4. Update the profile nickname without blocking entry; refresh aggregate stats after `round_result`.
5. Add the compact “本机临时档案” summary to the mode lobby with clear zero/error behavior and accessible status text.
6. Verify 568×320, 320×568 and 1280×720 layouts and commit as `feat(client): show passwordless player profile`.

### Task 4: Canonical documentation and final verification

**Files:**
- Modify: `docs/PRODUCT_UX.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/DEPLOYMENT.md`
- Move both plan files to `docs/archive/plans/` after completion

1. Document the temporary profile boundary, Redis fallback, endpoint authentication, privacy and future account migration.
2. Add automated and manual acceptance cases, including restart persistence and token-leak checks.
3. Run Markdown relative-link validation.
4. Run root build, all server tests and all Playwright tests.
5. Push the commits, deploy with `git pull --ff-only && docker compose up --build -d`, and verify health plus an online profile round trip.
6. Commit docs as `docs: document temporary guest profiles`.

