import express from "express";
import http from "http";
import { randomBytes } from "node:crypto";
import { Server, matchMaker } from "@colyseus/core";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createIsolatedPracticeRoomId } from "./http/practice-room-creation.js";
import { createGuestProfileHandlers } from "./http/guest-profile-api.js";
import { readPrivateStateToken } from "./http/private-state-auth.js";
import { createRateLimitMiddleware, parseBoundedInteger } from "./http/rate-limit.js";
import {
  buildCorsOriginHeaders,
  createCorsMiddleware,
  createOriginPolicy,
  isOriginAllowed,
  shouldEnableMonitor,
} from "./http/origin-policy.js";
import { FourColorGameRoom } from "./rooms/GameRoom.js";
import { getRegisteredRoom } from "./rooms/room-registry.js";
import { createGuestProfileStore } from "./profiles/redis-guest-profile-store.js";
import { configureGuestProfileStore } from "./profiles/guest-profile-runtime.js";

const port = Number(process.env.PORT ?? 2567);
const runtimeEnv = process.env.NODE_ENV;
const originPolicy = createOriginPolicy(process.env.CORS_ALLOWED_ORIGINS, runtimeEnv);
const app = express();
app.disable("x-powered-by");
const trustedProxyHops = parseBoundedInteger(process.env.TRUST_PROXY_HOPS, 0, 0, 5);
if (trustedProxyHops > 0) {
  app.set("trust proxy", trustedProxyHops);
}
const server = http.createServer(app);
const guestProfileStore = await createGuestProfileStore(process.env.REDIS_URL);
configureGuestProfileStore(guestProfileStore);
const guestProfileHandlers = createGuestProfileHandlers(guestProfileStore);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    verifyClient: ({ origin }: { origin?: string }) => isOriginAllowed(origin, originPolicy),
  }),
});

matchMaker.controller.DEFAULT_CORS_HEADERS["Access-Control-Allow-Origin"] = "null";
matchMaker.controller.getCorsHeaders = (headers) => {
  const origin = headers.get("origin") ?? undefined;
  return buildCorsOriginHeaders(origin, originPolicy);
};

app.use(express.json());
app.use(createCorsMiddleware(originPolicy));

const rateLimitWindowMs = parseBoundedInteger(
  process.env.HTTP_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  3_600_000,
);
const roomCreationLimit = createRateLimitMiddleware({
  maxRequests: parseBoundedInteger(process.env.ROOM_CREATE_RATE_LIMIT, 10, 1, 10_000),
  windowMs: rateLimitWindowMs,
  message: "创建房间过于频繁，请稍后再试。",
});
const privateStateLimit = createRateLimitMiddleware({
  maxRequests: parseBoundedInteger(process.env.PRIVATE_STATE_RATE_LIMIT, 180, 1, 100_000),
  windowMs: rateLimitWindowMs,
  message: "恢复牌局请求过于频繁，请稍后再试。",
});
const guestProfileLimit = createRateLimitMiddleware({
  maxRequests: parseBoundedInteger(process.env.GUEST_PROFILE_RATE_LIMIT, 60, 1, 10_000),
  windowMs: rateLimitWindowMs,
  message: "本机档案请求过于频繁，请稍后再试。",
});

gameServer
  .define("four-color", FourColorGameRoom)
  .filterBy(["roomMode", "matchOpen"])
  .sortBy({ clients: -1 });
if (shouldEnableMonitor(runtimeEnv, process.env.ENABLE_MONITOR)) {
  app.use("/colyseus", monitor());
}

function createHostKey(): string {
  return randomBytes(24).toString("base64url");
}

async function createGameRoom(mode: "friends" | "practice") {
  const hostKey = createHostKey();
  const created = await matchMaker.createRoom("four-color", { roomMode: mode, hostKey });
  return { roomId: created.roomId, hostKey };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get("/guest-profile", guestProfileLimit, guestProfileHandlers.get);
app.put("/guest-profile", guestProfileLimit, guestProfileHandlers.put);

app.get("/room-id", roomCreationLimit, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const roomId = await createIsolatedPracticeRoomId((roomName, options) =>
      matchMaker.createRoom(roomName, options),
    );
    res.json({ ok: true, roomId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to get room id";
    res.status(500).json({ ok: false, message });
  }
});

app.post("/rooms", roomCreationLimit, async (req, res) => {
  try {
    const mode = req.body?.mode === "friends" ? "friends" : req.body?.mode === "practice" ? "practice" : null;
    if (!mode) {
      res.status(400).json({ ok: false, message: "mode must be friends or practice" });
      return;
    }
    const created = await createGameRoom(mode);
    res.json({ ok: true, ...created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to create room";
    res.status(500).json({ ok: false, message });
  }
});

app.post("/reset-room", roomCreationLimit, async (_req, res) => {
  try {
    const created = await createGameRoom("practice");
    res.json({ ok: true, ...created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to reset room";
    res.status(500).json({ ok: false, message });
  }
});

app.get("/private-state", privateStateLimit, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const roomId = String(req.query.roomId ?? "").trim();
    const playerToken = readPrivateStateToken(req.headers.authorization, req.query.playerToken);
    if (!roomId || !playerToken) {
      res.status(400).json({ ok: false, message: "roomId and playerToken are required" });
      return;
    }
    const room = getRegisteredRoom(roomId);
    if (!room) {
      res.status(404).json({ ok: false, message: "room not found" });
      return;
    }
    const snapshot = room.getPrivateStateByToken(playerToken);
    if (!snapshot) {
      res.status(404).json({ ok: false, message: "seat not found" });
      return;
    }
    res.json({ ok: true, ...snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to get private state";
    res.status(500).json({ ok: false, message });
  }
});

await gameServer.listen(port, "0.0.0.0", undefined, () => {
  // eslint-disable-next-line no-console
  console.log(`[four-color] listening on :${port}`);
});
