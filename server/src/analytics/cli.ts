import { createClient } from "redis";
import { ANALYTICS_PREFIX } from "./redis-store.js";
import { dayNumber } from "./events.js";
import { summarizeMetrics } from "./report.js";
const [command = "report", argument = "7"] = process.argv.slice(2);
if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
if (command !== "report" && !(command === "purge" && argument === "--all")) throw new Error("usage: report [1..90] | purge --all");
const days = Number(argument);
if (command === "report" && (!Number.isInteger(days) || days < 1 || days > 90)) throw new Error("days must be 1..90");
const client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 1500, reconnectStrategy: false } });
client.on("error", () => {});
try {
  await client.connect();
  if (command === "purge") {
    let removed = 0;
    for await (const keys of client.scanIterator({ MATCH: `${ANALYTICS_PREFIX}*`, COUNT: 100 })) {
      if (keys.length) removed += await client.unlink(keys);
    }
    console.log(JSON.stringify({ removed, namespace: ANALYTICS_PREFIX }));
  } else {
    const rows = [];
    for (let day = dayNumber(Date.now()) - days + 1; day <= dayNumber(Date.now()); day++) {
      const counts = await client.hGetAll(`${ANALYTICS_PREFIX}day:${day}`);
      if (Object.keys(counts).length) rows.push({ day, counts });
    }
    console.log(JSON.stringify(summarizeMetrics(rows), null, 2));
  }
} catch { process.exitCode = 1; console.error("Anonymous metrics store unavailable; no credentials or data dumped."); }
finally { if (client.isOpen) client.destroy(); }
