# Robot action presentation validation — 2026-10-17 UTC

This local fix starts from `b64fae6` (latest fetched `origin/main`, PR #92), on the independent branch `fix/action-presentation-queue`. PRs #85, #86, #89, #90 and #91 were already merged; no open PR existed at the final check. No applicable `AGENTS.md` was present in the repository or workspace ancestors. The original `/Users/sheeplin/workspace/lin594/sise` checkout has no working-tree changes and remains on its original `main` commit. No merge, push, deployment, system installation or permission change was performed.

## Reproduction and cause

On iMac, macOS 15.8.1, installed Chrome, build `b64fae6`, open the local production preview with `?e2eDebug=1`, choose 单人练习, finish declaration and use the existing local debug bridge to play the human decision. A deterministic random generator (seed 1, `seed = (seed * 1664525 + 1013904223) >>> 0`) makes the sequence repeatable.

The first human action moved the visible snapshot from revision 4 (`seat_0 OPENING_DISCARD`) directly to revision 11 (`seat_2 DISCARD`). Later inputs jumped 12 → 22, 23 → 34 and 35 → 47. The browser frame sampler and video showed the missing actions; there were no page errors. Raw measurements are in [before-observations.json](action-presentation/before-observations.json).

`useRoom` synchronously applied up to twelve automatic snapshots before yielding. Vue batched these updates into the final frame. The offline adapter also omitted `tableTransitions` and always published `presentationUntil: 0`, bypassing the timeline already used by the network table. Simply yielding every step would still omit the readable action window. Deferred Chi could also synchronously overwrite PASS with CHI inside one core call.

## Change and contract

- Both hosts now append the same table-transition events, including public actor/action metadata, card origins/destinations, round, sequence and start/end times. They render through the same `GameBoard`; the existing deal presentation is retained.
- Draw uses the existing 1,200 ms face-down/reveal sequence. Other actions use 200 ms travel plus 500 ms to read the landed result. These are shared presentation deadlines, rather than sleeps in bot logic. Headless server simulations retain zero display delay.
- Offline automation schedules one unit after the presentation deadline and a browser paint. No-choice internal transitions yield a paint without an invented pause. Input, automation and next-round entry respect the same presentation lock.
- Collective submission, deferred PASS → CHI and winning action → settlement have separate boundaries. Invalid deferred candidates restore human choices; settlement is emitted once. When a Chi/Peng immediately wins with no legal discard, the already melded response keeps its original movement and is not flown into the meld again; explicit Hu retains its winning movement.
- Background visibility pauses automation and opening timers. Recovery shifts the current presentation deadline by hidden time. Stage closures preserve that shifted deadline. Cancellation covers exit, restart, next round and component teardown, with both generation and session-identity checks.
- A small existing offline-entry defect was also found by the cached-shell regression: an empty offline lobby incorrectly showed a room recovery screen. The recovery screen now requires actual room, invitation or starting-mode context; saved-room recovery remains intact.

The game still runs on the browser main thread. The PWA Service Worker continues to cache resources; this change does not migrate game logic to a Worker or replace the shared rules implementation.

## Browser evidence

The final real-time Chrome sampler captured seventeen public states containing every table event from 1 through 16. The sequence includes all three bots: 阿福吃/出牌, 春妹吃/出牌/抓牌, 海叔吃, plus the human's intervening Peng and discard. There are no missing action-event sequence numbers, and the next state is not advanced before the previous presentation deadline. Private collective-choice updates can retain an identical public object; tests therefore check actual table events rather than assuming every private revision needs another public frame.

- [Painted action timeline](action-presentation/painted-action-timeline.json): wall times, event identities, card moves, actual DOM action labels and observed flight counts.
- [阿福 eats](action-presentation/bot-meld.png): name, actor highlight, 吃 label, landing cards and remaining hand count.
- [海叔 eats later in the same chain](action-presentation/third-bot.png): a distinct actor/action/result after intervening moves.
- [Network eat handoff](action-presentation/network-draw.png): the deterministic network fixture after draw/reveal/eat, showing the shared meld presentation and subsequent discard control.

Local videos and complete runner logs remain in `output/playwright/` in this worktree. The before recording is under `before/`; the final Chrome action recording is under `action-final/`; WebKit evidence is under `webkit-regression/`. These large transient recordings are not committed.

## Verification

- Production server/client build and TypeScript checks passed.
- Full server suite: 211 passed, one real-Redis integration test skipped. The legacy harness and 100-game bot stress test also passed. Final targeted core/presentation tests: 14 passed, including automatic and explicit Hu movement/settlement boundaries.
- Chrome shared-table suites (`central-draw`, `flow-stability`, `offline-practice` and the initial action-presentation cases): 16 passed, one WebKit-only case skipped. This includes a genuinely offline cached-shell reopen, a complete local round with no game API/WebSocket traffic, settlement and next round, drawn-general deferred Chi, network meld geometry, draw/flip/eat, outgoing flow, reduced motion and duplicate-snapshot stability.
- Final expanded Chrome action cases: 5 passed, including all three bots in one sampled chain and offline reduced motion. A final serial Chrome rerun of cached-shell offline completion, drawn-general Chi and network draw/flip/eat also passed (3 tests).
- WebKit: all 5 real-time action/visibility/restart/reduced-motion cases passed. The 2 long-flow cases (drawn-general Chi and a Service Worker-controlled complete game/next round) passed after the clock refinement below. The simulated completely-offline reopen case is intentionally skipped on WebKit because Playwright WebKit blocks Service Worker requests in that mode.
- Documentation links, generated-source checks and `git diff --check` passed.

The action-window, reduced-motion and in-action visibility tests use real browser timers. The long full-round tests advance the existing browser clock after checking the opening at real speed; they validate progression and completion, not real-time pacing. An initial WebKit long-flow run timed out while painting every synthetic animation frame; the final tests fast-forward the waiting period and then run 64 ms of rendering, retaining the scheduler's required paint boundaries with less CPU work. Both long-flow cases then passed. An additional concurrent Chrome recording missed the initial 200 ms flight sample; the final serial repeat observed all stages and passed. Background tests dispatch visibility events; they are not physical mobile/PWA background acceptance. Physical iPhone/Android and accessibility acceptance remain outside this local fix.

An independent subagent reviewed semantics, races and the actual action screenshots. Its opening-deadline closure, stale-candidate publication and immediate-win duplicate-movement findings were fixed and covered by regressions. A second agent, explicitly configured as GPT-6.1-sol with xhigh reasoning after the user's model preference update, independently added the automatic/explicit Hu tests in its assigned file. Build and browser processes were coordinated by the primary agent.

To reproduce with the repository's standard isolated test servers:

```sh
npm run build
npm run test:server
PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/offline-action-presentation.spec.ts tests/e2e/offline-practice.spec.ts tests/e2e/central-draw.spec.ts tests/e2e/flow-stability.spec.ts --project=chromium
npx playwright test tests/e2e/offline-action-presentation.spec.ts tests/e2e/offline-practice.spec.ts --project=webkit-responsive
```
