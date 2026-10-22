# Browser presentation probe — 2026-10-22

The first main CI for merged action-presentation source `654ab761f98f41aa15080d67fef36133927a59aa` failed a WebKit assertion in the new action test. This follow-up changes only the test's measurement, not game pacing, animation duration, application code, dependencies or CI scope.

## Actual failure

[Main CI job](https://github.com/lin594/sise/actions/runs/39831484953/job/120008733794) reported revision 6 where the test still expected revision 5. The [downloadable trace](https://github.com/lin594/sise/actions/runs/39831484953/artifacts/12449915480) shows why: the first and final state-query responses were 757.189ms apart. The flight locator, 253.104ms screenshot, another protocol call and then a further 250ms wait had consumed the entire 700ms presentation.

The next event began **42ms after** the first event's deadline. Thus the observed progression was legal; the assertion used an expired timing assumption. [Extracted trace facts](action-presentation/probe-clock-race.json) retain event IDs/deadlines and call durations without credentials or private production data.

## Measurement fix

One browser evaluation now performs the human action, clones its first snapshot, probes rejection of an immediate duplicate, and samples the revision after the original **real 250ms timer**. It explicitly requires this sample to finish before the original presentation deadline. Screenshot and protocol latency occur after that check.

The existing real requestAnimationFrame sampler still verifies the complete event sequence and forbids advancement before each full deadline. A new assertion requires the first event to appear in a painted sample with its original revision, the 出牌 label and a flight. No timing threshold is reduced, no clock is mocked, and no retry or skip is introduced.

## Local verification

- The original complete case passed **3/3 in installed Chrome and 3/3 in existing WebKit** after the fix (six tests, 2.6 minutes, one worker).
- A separate local driver delayed only the human-discard screenshot return by 400ms, leaving browser/game time real. The original source deterministically failed at the same revision 5→6 assertion; the fixed source passed the unchanged sequence/deadline/label/animation assertions (27.5 seconds).
- The controlled delay exists only in ignored local evidence copies, not in this PR or the application.
- Independent review and `git diff --check` passed. Logs, both traces and videos remain under `output/playwright/release-ci/timing-probe/` and `probe-stress-before/` / `probe-stress-after/` in the isolated iMac checkout.

The `client/` and `server/` trees still match the already validated application source; `server/src` remains `70b4143b5db67bcedfd1c9d6d76c26ab16f3ec6a`. The separate [real-image upgrade/recovery/rollback evidence](RELEASE_RECOVERY_2026-10-22.md) is therefore not replaced with an untested new tree. Final exact-main CI, immutable image publication, production deployment and public-page acceptance remain separate required steps.
