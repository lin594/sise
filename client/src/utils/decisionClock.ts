/** Public collective countdown is three seconds; authority may keep accepting for ten. */
export function visibleDecisionEndsAt(phase: string, endsAt: number, totalMs: number): number {
  return phase === "collective" && endsAt > 0 && totalMs > 3_000 ? endsAt - totalMs + 3_000 : endsAt;
}
