# Action presentation PR validation — 2026-10-22

The existing fix commit `1e8879f9855cbfe270c2300f34a546625f2b6ef2` was checked in a fresh detached iMac worktree. Remote `main` remained `b64fae642433285de50baac2226772c2104a7dfc`, its direct parent, so no reimplementation or rebase was required. The original checkout and its historical evidence were preserved. The existing 17 changed files were reviewed for scope and credentials; no unrelated files or credential findings were identified.

## Review follow-up

Independent review found one additional visibility gap in the shared board. Explicit Hu creates a move to the winning meld, but that meld may only become public in the settlement. The renderer discarded a flight with no real destination while still hiding its source cards, producing a short empty-card window. This was reproduced with the existing `draw_peng_settlement` browser fixture: the Hu label was visible and settlement had not started, yet `pending-card` was missing.

The shared board now hides Hu source cards only when a measurable destination exists. Otherwise it retains the actual response card and private hand alongside the Hu label until settlement takes over. This does not invent a winning group, change rules or scoring, or claim to animate a Hu flight without a real landing. The same behavior applies to local and network sessions, including reduced motion. The browser regression now verifies one visible instance of each of the three winning cards before settlement, then verifies the Peng scoring result.

[Hu window after the visibility fix](action-presentation/hu-before-settlement.png)

## Fresh verification

- Production build, TypeScript, documentation and generated-source checks passed using the installed dependencies; tracked build inputs remained unchanged.
- Full server regression: 211 passed, one real-Redis integration case skipped; the 85-check legacy rule harness and 100-game bot stress test passed.
- Targeted offline session and shared presentation regression: 14 passed, including deferred Chi, invalid intent recovery, automatic Hu single movement, explicit Hu and exactly-once settlement.
- Chrome: 18 passed, one WebKit-only case skipped. This includes the new normal/reduced-motion Hu visibility assertions, shared network draw/meld geometry, action sequence/actor labels, hidden-time recovery, exit/restart cancellation, genuinely offline cached-shell completion, and next round.
- WebKit: 9 passed, one simulated-offline reopening case skipped due to Playwright WebKit's Service Worker limitation. The passing cases include normal/reduced-motion Hu visibility, action sequencing and labels, background recovery, exit/restart, drawn-general Chi, and a Service Worker-controlled complete round/next round.

Local logs, videos, screenshots, the failing reproduction and isolated server configuration are under `output/playwright/pr-20261022/` in the validation checkout. They remain local; only the scoped code, tests and this documentation are part of the GitHub delivery. The earlier reproduction and event timeline remain in [the original report](ACTION_PRESENTATION_2026-10-17.md).

Physical iPhone/Android, WeChat, screen readers and local-player acceptance have not been performed. Visibility regressions dispatch browser visibility events; long-round regressions fast-forward the browser clock after the real-time opening. These do not replace physical-device or real-time whole-round acceptance. The verification above did not include merge, production deployment, permission changes or system installation.

## Responsive CI follow-up

CI at `b56cc6b740f47365d253277f63141b33878915f8` passed the dependency audit, source/build, server regression and six browser shards. Chromium 3/4 exposed a stale test snapshot: it captured range 1–12, then separately waited for the label to equal those old values after layout had already converged to 1–10. The received text and label both described 1–10.

A controlled real-page resize from 568×320 to 680×320 reproduced the mechanism in the opposite direction: 1–10 became 1–12 while each atomic text/label pair remained consistent. Independent geometry found all 20 cards, 12 fully visible cards and minimum card size 44×52. The [recorded samples](action-presentation/responsive-range-race.json) contain no credentials or private production data. The screenshots and video remain under local `output/playwright/release-ci/race-witness/`.

The test now reads the current text and ARIA label together in one browser evaluation and compares the same snapshot. Strict range parsing, label equality, card/font dimensions, eight-card minimum, controls, selection preservation and forward/backward paging assertions remain unchanged. No product code, timing delay, retry policy or CI browser scope changed.

The original complete legacy-small-landscape case passed three times in installed Chrome before the fix and three times after it; the natural CI scheduling race was not reproduced spontaneously on the iMac. The controlled reflow witness passed once. Additional checks passed in Chrome for both the legacy and adjacent compact cases, and in WebKit for the legacy case. An extra locally enabled WebKit compact case timed out waiting for the synthetic visibility-triggered private-state request (`await privateStateCaptured`), after its declaration/paging checks; this case is outside the existing WebKit project match and is not counted as a pass. Its trace is retained under `output/playwright/release-ci/after-related/`. Required GitHub CI remains the Linux/browser release gate.

Independent review confirmed that the snapshot change preserves the helper return contract and all original acceptance thresholds. The server source tree remains `70b4143b5db67bcedfd1c9d6d76c26ab16f3ec6a`, so the separate [current-baseline recovery evidence](RELEASE_RECOVERY_2026-10-22.md) still covers the application source.
