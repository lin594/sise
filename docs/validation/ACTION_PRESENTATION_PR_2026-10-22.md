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

Physical iPhone/Android, WeChat, screen readers and local-player acceptance have not been performed. Visibility regressions dispatch browser visibility events; long-round regressions fast-forward the browser clock after the real-time opening. These do not replace physical-device or real-time whole-round acceptance. No merge, production deployment, permission change or system installation is included.
