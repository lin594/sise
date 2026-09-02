import express from "express";
import http from "http";
import { randomBytes } from "node:crypto";
import { Server, matchMaker } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { readPrivateStateToken } from "./http/private-state-auth.js";
import {
  buildCorsOriginHeaders,
  createCorsMiddleware,
  createOriginPolicy,
  isOriginAllowed,
  shouldEnableMonitor,
} from "./http/origin-policy.js";
import { FourColorGameRoom } from "./rooms/GameRoom.js";
import { getRegisteredRoom } from "./rooms/room-registry.js";

const port = Number(process.env.PORT ?? 2567);
const runtimeEnv = process.env.NODE_ENV;
const originPolicy = createOriginPolicy(process.env.CORS_ALLOWED_ORIGINS, runtimeEnv);
const app = express();
const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    verifyClient: ({ origin }: { origin?: string }) => isOriginAllowed(origin, originPolicy),
  }),
});

matchMaker.controller.DEFAULT_CORS_HEADERS["Access-Control-Allow-Origin"] = "null";
matchMaker.controller.getCorsHeaders = (req) => {
  const rawOrigin = req.headers.origin;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  return buildCorsOriginHeaders(origin, originPolicy);
};

app.use(express.json());
app.use(createCorsMiddleware(originPolicy));

gameServer.define("four-color", FourColorGameRoom);
if (shouldEnableMonitor(runtimeEnv, process.env.ENABLE_MONITOR)) {
  app.use("/colyseus", monitor());
}

let creatingSingletonRoom: Promise<string> | null = null;
let singletonRoomId = "";

async function listFourColorRooms() {
  return await matchMaker.query({ name: "four-color" });
}

function roomPhase(room: any): string {
  return String(room?.metadata?.phase ?? "");
}

function isWaitingLobbyRoom(room: any): boolean {
  return roomPhase(room) === "waiting";
}

async function isRoomAlive(roomId: string): Promise<boolean> {
  if (!roomId) {
    return false;
  }
  const rooms = await listFourColorRooms();
  return rooms.some((room) => room.roomId === roomId);
}

async function getOrCreateSingletonRoomId(): Promise<string> {
  if (creatingSingletonRoom) {
    return creatingSingletonRoom;
  }

  creatingSingletonRoom = (async () => {
    const rooms = await listFourColorRooms();
    if (singletonRoomId) {
      const current = rooms.find((room) => room.roomId === singletonRoomId);
      if (current && isWaitingLobbyRoom(current)) {
        return singletonRoomId;
      }
    }
    const reusableWaitingRoom = rooms.find((room) => isWaitingLobbyRoom(room));
    if (reusableWaitingRoom) {
      singletonRoomId = reusableWaitingRoom.roomId;
      return singletonRoomId;
    }
    const created = await matchMaker.createRoom("four-color", { roomMode: "practice" });
    singletonRoomId = created.roomId;
    return singletonRoomId;
  })();

  try {
    return await creatingSingletonRoom;
  } finally {
    creatingSingletonRoom = null;
  }
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

app.get("/room-id", async (_req, res) => {
  try {
    const roomId = await getOrCreateSingletonRoomId();
    res.json({ ok: true, roomId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to get room id";
    res.status(500).json({ ok: false, message });
  }
});

app.post("/rooms", async (req, res) => {
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

app.post("/reset-room", async (_req, res) => {
  try {
    const created = await createGameRoom("practice");
    singletonRoomId = created.roomId;
    res.json({ ok: true, ...created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to reset room";
    res.status(500).json({ ok: false, message });
  }
});

app.get("/private-state", async (req, res) => {
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

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[four-color] listening on :${port}`);
});
