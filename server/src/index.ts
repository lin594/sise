import express from "express";
import http from "http";
import { Server, matchMaker } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { FourColorGameRoom } from "./rooms/GameRoom.js";

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

async function isRoomAlive(roomId: string): Promise<boolean> {
  if (!roomId) {
    return false;
  }
  const rooms = await listFourColorRooms();
  return rooms.some((room) => room.roomId === roomId);
}

async function getOrCreateSingletonRoomId(): Promise<string> {
  if (singletonRoomId && (await isRoomAlive(singletonRoomId))) {
    return singletonRoomId;
  }

  if (creatingSingletonRoom) {
    return creatingSingletonRoom;
  }

  creatingSingletonRoom = (async () => {
    const rooms = await listFourColorRooms();
    if (rooms.length > 0) {
      singletonRoomId = rooms[0].roomId;
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

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[four-color] listening on :${port}`);
});
