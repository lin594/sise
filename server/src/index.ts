import express from "express";
import http from "http";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { FourColorGameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.PORT ?? 2567);
const app = express();
const server = http.createServer(app);
const gameServer = new Server({ server });

gameServer.define("four-color", FourColorGameRoom);
app.use("/colyseus", monitor());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

server.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[four-color] listening on :${port}`);
});
