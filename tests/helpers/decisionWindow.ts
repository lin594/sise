export interface DecisionObservation {
  responsePhase?: string;
  responseCardId: string;
  currentTurnPlayerId?: string;
  responseEndsAt?: number;
  decisionTimer: { decisionKey?: string; endsAt?: number; totalMs?: number };
}
export interface DecisionTarget {
  phase: string;
  cardId: string;
  ownerId: string;
  previousKey: string;
}
/** A phase can precede its new decision during a visible table transition.
 * Readiness deliberately does not check totalMs: a genuinely short new window
 * must reach the caller's unchanged duration assertion and fail there.
 */
export function isPublishedDecision(clock: DecisionObservation, target: DecisionTarget): boolean {
  const timer = clock.decisionTimer;
  return clock.responsePhase === target.phase
    && Boolean(target.cardId) && clock.responseCardId === target.cardId
    && Boolean(target.ownerId) && clock.currentTurnPlayerId === target.ownerId
    && /^play:\d+$/.test(timer.decisionKey ?? "") && timer.decisionKey !== target.previousKey
    && Number.isFinite(timer.endsAt) && Number(timer.endsAt) > 0
    && timer.endsAt === clock.responseEndsAt;
}
