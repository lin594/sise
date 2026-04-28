import express from "express";
import http from "http";
import { Server, matchMaker } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { FourColorGameRoom } from "./rooms/GameRoom.js";
import { getRegisteredRoom } from "./rooms/room-registry.js";

const port = Number(process.env.PORT ?? 2567);
const app = express();
const server = http.createServer(app);
const gameServer = new Server({ server });

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

gameServer.define("four-color", FourColorGameRoom);
app.use("/colyseus", monitor());

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
    const created = await matchMaker.createRoom("four-color", {});
    singletonRoomId = created.roomId;
    return singletonRoomId;
  })();

  try {
    return await creatingSingletonRoom;
  } finally {
    creatingSingletonRoom = null;
  }
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

app.post("/reset-room", async (_req, res) => {
  try {
    const created = await matchMaker.createRoom("four-color", {});
    singletonRoomId = created.roomId;
    res.json({ ok: true, roomId: singletonRoomId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to reset room";
    res.status(500).json({ ok: false, message });
  }
});

app.get("/private-state", async (req, res) => {
  try {
    const roomId = String(req.query.roomId ?? "").trim();
    const playerToken = String(req.query.playerToken ?? "").trim();
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
