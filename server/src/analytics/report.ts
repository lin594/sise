import { dayLabel, dayNumber, HISTOGRAM_BOUNDS } from "./events.js";
export function summarizeMetrics(rows: Array<{ day: number; counts: Record<string, string> }>, now = Date.now()) {
  const today = dayNumber(now);
  const sum = (field: string, filter = (_: number) => true) => rows.filter(row => filter(row.day)).reduce((n, row) => n + Number(row.counts[field] ?? 0), 0);
  const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
  const events = (name: string, source: string, outcome = "started") => ["practice", "match", "friends", "unknown"].reduce((n, mode) => n + sum(`events:${source}:${name}:${mode}:${outcome}`), 0);
  const latency = Object.fromEntries(["practice", "match", "friends", "tutorial"].map(mode => {
    const buckets = HISTOGRAM_BOUNDS.map(bound => ({ upperBoundMs: bound, count: sum(`latency:${mode}:${bound}`) }));
    const samples = buckets.reduce((n, b) => n + b.count, 0);
    const quantile = (q: number) => { let count = 0; return samples ? buckets.find(b => { count += b.count; return count >= Math.ceil(samples * q); })?.upperBoundMs ?? null : null; };
    return [mode, { samples, p50UpperBoundMs: quantile(.5), p95UpperBoundMs: quantile(.95) }];
  }));
  return {
    daysWithData: rows.length, through: dayLabel(today), timezone: "Asia/Shanghai",
    tutorialCompletion: ratio(sum("events:server:round_complete:tutorial:started"), sum("events:server:round_start:tutorial:started")),
    firstRoundActivation: ratio(sum("activated"), sum("visitors")),
    firstRoundCompletion: ratio(sum("first_completed"), sum("activated")),
    invitationJoin: ratio(sum("invite_joined"), sum("invite_opened")),
    playAgain: ratio(sum("replay_started"), events("round_complete", "server")),
    playAgainClicks: events("play_again", "client"),
    d1: ratio(sum("return1", day => day + 1 < today), sum("retention_eligible", day => day + 1 < today)),
    d7: ratio(sum("return7", day => day + 7 < today), sum("retention_eligible", day => day + 7 < today)),
    joinFailure: ratio(events("join_failed", "client", "failed"), events("join_failed", "client", "failed") + events("join_success", "server")),
    recoverySuccess: ratio(events("reconnect_success", "client"), events("reconnect_started", "client")),
    latency, note: "仅代表已采集样本；统计故障可能丢数，空分母为 null。耗时为成功样本直方图分位数上界。",
  };
}
