import { dayLabel, dayNumber, HISTOGRAM_BOUNDS } from "./events.js";
export function summarizeMetrics(rows: Array<{ day: number; counts: Record<string, string> }>, now = Date.now()) {
  const today = dayNumber(now);
  const sum = (field: string, filter = (_: number) => true) => rows.filter(row => filter(row.day)).reduce((n, row) => n + Number(row.counts[field] ?? 0), 0);
  const ratio = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
  const events = (name: string, source: string, outcome = "started") => ["practice", "match", "friends", "unknown"].reduce((n, mode) => n + sum(`events:${source}:${name}:${mode}:${outcome}`), 0);
  // Backfilled cohort counters alone do not prove collection on that target day.
  const observedDays = new Set(rows.filter(row => Object.keys(row.counts).some(key => key.startsWith("events:"))).map(row => row.day));
  const retention = (offset: number) => {
    const mature = rows.filter(row => row.day + offset < today && Number(row.counts.retention_eligible ?? 0) > 0);
    const measured = mature.filter(row => observedDays.has(row.day + offset));
    const missing = mature.filter(row => !observedDays.has(row.day + offset));
    return {
      metric: ratio(measured.reduce((n, row) => n + Number(row.counts[`return${offset}`] ?? 0), 0), measured.reduce((n, row) => n + Number(row.counts.retention_eligible), 0)),
      coverage: {
        matureCohorts: mature.length,
        measuredCohorts: measured.length,
        excludedParticipants: missing.reduce((n, row) => n + Number(row.counts.retention_eligible), 0),
        missingTargetDays: [...new Set(missing.map(row => dayLabel(row.day + offset)))].sort(),
      },
    };
  };
  const d1 = retention(1), d7 = retention(7);
  const latency = Object.fromEntries(["practice", "match", "friends", "tutorial"].map(mode => {
    const buckets = HISTOGRAM_BOUNDS.map(bound => ({ upperBoundMs: bound, count: sum(`latency:${mode}:${bound}`) }));
    const samples = buckets.reduce((n, b) => n + b.count, 0);
    const quantile = (q: number) => { let count = 0; return samples ? buckets.find(b => { count += b.count; return count >= Math.ceil(samples * q); })?.upperBoundMs ?? null : null; };
    return [mode, { samples, p50UpperBoundMs: quantile(.5), p95UpperBoundMs: quantile(.95) }];
  }));
  return {
    daysWithData: rows.length, through: dayLabel(today), timezone: "Asia/Shanghai",
    contextHints: { shown: events("context_hint_shown", "client"), disabled: events("context_hint_disabled", "client") },
    tutorialCompletion: ratio(sum("events:server:round_complete:tutorial:started"), sum("events:server:round_start:tutorial:started")),
    firstRoundActivation: ratio(sum("activated"), sum("visitors")),
    firstRoundCompletion: ratio(sum("first_completed"), sum("activated")),
    invitationJoin: ratio(sum("invite_joined"), sum("invite_opened")),
    playAgain: ratio(sum("replay_started"), events("round_complete", "server")),
    playAgainClicks: events("play_again", "client"),
    d1: d1.metric, d7: d7.metric,
    retentionCoverage: { d1: d1.coverage, d7: d7.coverage },
    joinFailure: ratio(events("join_failed", "client", "failed"), events("join_failed", "client", "failed") + events("join_success", "server")),
    recoverySuccess: ratio(events("reconnect_success", "client"), events("reconnect_started", "client")),
    latency, note: "仅代表已采集样本；统计故障可能丢数，空分母为 null。耗时为成功样本直方图分位数上界。",
  };
}
