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

async function getOrCreateSingletonRoomId(): Promise<string> {
  const rooms = await matchMaker.query({ name: "four-color" });
  if (rooms.length > 0) {
    return rooms[0].roomId;
  }

  if (creatingSingletonRoom) {
    return creatingSingletonRoom;
  }

  creatingSingletonRoom = (async () => {
    const created = await matchMaker.createRoom("four-color", {});
    return created.roomId;
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

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[four-color] listening on :${port}`);
});
