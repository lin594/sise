import { createClient } from "redis";
import { DAY_MS, HISTOGRAM_BOUNDS, dayNumber, type AnonymousEvent } from "./events.js";
import type { ProductEventStore } from "./runtime.js";
export const ANALYTICS_PREFIX = "sise:analytics:v1:";
const ACTOR_TTL = 30 * DAY_MS;
/** Atomic dedupe + counters; only anonymous fixed-dimension data is stored. */
export const RECORD_SCRIPT = `
local e = cjson.decode(ARGV[1])
local day = tonumber(ARGV[2])
local prefix = ARGV[3]
local actorTTL = tonumber(ARGV[4])
local aggregateExpiry = tonumber(ARGV[5])
local daily = prefix .. 'day:' .. day
local function inc(key, field)
  redis.call('HINCRBY', key, field, 1)
end
local seen = prefix .. 'event:' .. e.id
if not redis.call('SET', seen, '1', 'NX', 'PX', actorTTL) then return 0 end
inc(daily, 'events:' .. e.source .. ':' .. e.name .. ':' .. e.mode .. ':' .. e.outcome)
inc(daily, 'humans:' .. e.name .. ':' .. e.humans)
redis.call('PEXPIREAT', daily, aggregateExpiry)
local actorKey = prefix .. 'actor:' .. e.actor
redis.call('HSETNX', actorKey, 'cohort', day)
local cohort = tonumber(redis.call('HGET', actorKey, 'cohort'))
local cohortKey = prefix .. 'day:' .. cohort
local function cohortInc(field)
  inc(cohortKey, field)
  redis.call('PEXPIREAT', cohortKey, (cohort + 90) * 86400000 - 28800000)
end
if e.name == 'app_open' then
  if redis.call('HSETNX', actorKey, 'opened', 1) == 1 then cohortInc('visitors') end
  if e.persistent and redis.call('HSETNX', actorKey, 'persistent', 1) == 1 then cohortInc('retention_eligible') end
  local delta = day - cohort
  if (delta == 1 or delta == 7) and redis.call('HEXISTS', actorKey, 'persistent') == 1 and redis.call('HSETNX', actorKey, 'return' .. delta, 1) == 1 then cohortInc('return' .. delta) end
end
if e.mode ~= 'tutorial' and e.name == 'round_start' then
  local lastCompleted = redis.call('HGET', actorKey, 'lastCompleted')
  if lastCompleted and lastCompleted ~= e.visit and redis.call('HGET', actorKey, 'lastReplayed') ~= lastCompleted then
    local completedDay = tonumber(redis.call('HGET', actorKey, 'completedDay'))
    local completedKey = prefix .. 'day:' .. completedDay
    inc(completedKey, 'replay_started')
    redis.call('PEXPIREAT', completedKey, (completedDay + 90) * 86400000 - 28800000)
    redis.call('HSET', actorKey, 'lastReplayed', lastCompleted)
  end
  redis.call('HSETNX', actorKey, 'firstRound', e.visit)
  redis.call('HSETNX', actorKey, 'started', 1)
end
if e.mode ~= 'tutorial' and e.name == 'round_complete' then
  redis.call('HSET', actorKey, 'lastCompleted', e.visit, 'completedDay', day)
end
if e.mode ~= 'tutorial' and e.name == 'round_complete' and redis.call('HGET', actorKey, 'firstRound') == e.visit then
  redis.call('HSETNX', actorKey, 'completed', 1)
end
if redis.call('HEXISTS', actorKey, 'opened') == 1 and redis.call('HEXISTS', actorKey, 'started') == 1 and redis.call('HSETNX', actorKey, 'activationCounted', 1) == 1 then cohortInc('activated') end
if redis.call('HEXISTS', actorKey, 'activationCounted') == 1 and redis.call('HEXISTS', actorKey, 'completed') == 1 and redis.call('HSETNX', actorKey, 'completionCounted', 1) == 1 then cohortInc('first_completed') end
if redis.call('PTTL', actorKey) < 0 then redis.call('PEXPIRE', actorKey, actorTTL) end
local visitKey = prefix .. 'visit:' .. e.visit
if e.name == 'invite_open' then
  if redis.call('HSETNX', visitKey, 'inviteDay', day) == 1 then inc(daily, 'invite_opened') end
end
if e.name == 'invite_join_success' then redis.call('HSETNX', visitKey, 'joined', 1) end
local inviteDay = redis.call('HGET', visitKey, 'inviteDay')
if inviteDay and redis.call('HEXISTS', visitKey, 'joined') == 1 and redis.call('HSETNX', visitKey, 'joinCounted', 1) == 1 then
  local inviteDaily = prefix .. 'day:' .. inviteDay
  inc(inviteDaily, 'invite_joined')
  redis.call('PEXPIREAT', inviteDaily, (tonumber(inviteDay) + 90) * 86400000 - 28800000)
end
if redis.call('EXISTS', visitKey) == 1 and redis.call('PTTL', visitKey) < 0 then redis.call('PEXPIRE', visitKey, actorTTL) end
if e.durationMs ~= cjson.null and e.outcome == 'ready' then
  inc(daily, 'latency:' .. e.mode .. ':' .. ARGV[6])
end
return 1
`;
export class RedisProductEventStore implements ProductEventStore {
  private client;
  private cooldownUntil = 0;
  constructor(url: string, private timeoutMs = 750) {
    this.client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: timeoutMs, reconnectStrategy: false } });
    this.client.on("error", () => {});
  }
  async record(event: AnonymousEvent): Promise<void> {
    if (Date.now() < this.cooldownUntil) throw new Error("analytics cooldown");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          if (!this.client.isReady) await this.client.connect();
          const day = dayNumber(event.at);
          const expiry = (day + 90) * DAY_MS - 8 * 3_600_000;
          const bucket = HISTOGRAM_BOUNDS.find(value => value >= (event.durationMs ?? 0)) ?? 600000;
          await this.client.eval(RECORD_SCRIPT, { arguments: [JSON.stringify(event), String(day), ANALYTICS_PREFIX, String(ACTOR_TTL), String(expiry), String(bucket)] });
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("analytics timeout")), this.timeoutMs); }),
      ]);
    } catch {
      if (this.client.isOpen) this.client.destroy();
      this.cooldownUntil = Date.now() + 5000;
      throw new Error("analytics unavailable");
    } finally { if (timer) clearTimeout(timer); }
  }
  async close() { if (this.client.isOpen) this.client.destroy(); }
}
