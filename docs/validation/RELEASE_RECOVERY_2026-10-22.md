# Current-baseline recovery acceptance — 2026-10-22

This records fresh recovery evidence for the action-presentation fix's `server/src` tree `70b4143b5db67bcedfd1c9d6d76c26ab16f3ec6a`. It does not reuse the older source tree's compatibility declaration.

## Exact images and scope

The documented deployment tool's read-only `status sise` confirmed production release `b64fae642433285de50baac2226772c2104a7dfc` and actual server image `sha256:8650c4178ac39b34ce4bb5e8906738ce72188e4565c7bc0a76473b59f210d32b`. Exact local image inspection matched that image ID, `linux/amd64` and OCI revision. Production identity was read directly, not inferred from the main branch.

Candidate source `2dab7fb8062c0a2a4b7dbb31cb82049a93fde341` was built using the production server Dockerfile with `NODE_IMAGE=node:22-alpine`. Candidate image `sha256:53210d9aed869e4839f3bdf9b646ba591cabc7241510f5fe764ac912d97499bd` has the same source revision label and `linux/amd64` platform. The exact tested server tree is frozen above; later release metadata/documentation commits must not change it without a new test.

Only freshly created synthetic local rooms were used. An independent Redis image `sha256:aa189b5a1954929c393585e6dc5717a75b18f75a931df8bdcc00a3d3bd546be6` ran in the test network. No production Redis, real player credentials or private hands were read or modified; existing local application containers were not restarted.

## Actual acceptance

The existing [container harness](../../scripts/container-recovery-smoke.mjs) used immutable image IDs for candidate and baseline. Four cases passed:

| Phase | Image sequence | Verified |
| --- | --- | --- |
| declaring | candidate → candidate | graceful restart; room, seat, credential and exact synthetic hand preserved; declaration resumed |
| declaring | current production image → candidate → current production image | upgrade and rollback preserved the same state; declaration resumed |
| playing | candidate → candidate | graceful restart; exact synthetic hand preserved; recovered discard accepted |
| playing | current production image → candidate → current production image | upgrade and rollback preserved the same state; recovered discard accepted |

All six intervening container stops exited 0. Candidate stops also asserted a fresh Redis snapshot written after SIGTERM began. Each restore checked room/seat identity, authenticated private-state access and equality of every synthetic private card before advancing the recovered decision. The [machine-readable evidence](action-presentation/current-baseline-recovery.json) records only synthetic hand hashes/counts, not credentials or raw private cards. The harness cleaned its uniquely named containers and network on completion.

The first attempt stopped before room testing because Docker's default address pool was exhausted. The documented `RECOVERY_TEST_SUBNET` mechanism then used `198.18.250.0/28`, after checking 34 Docker networks and 68 Docker/host IPv4 prefixes for overlap. No existing network was deleted or changed. Full build, identity, first-attempt and successful logs remain local under `output/playwright/recovery-20261022/`.

## Release compatibility boundary

Room snapshot schema 2 and Redis namespace 1 remain unchanged. No database migration or data reset is introduced. `release-compatibility.json` now binds the new server tree to the actually tested current baseline SHA and image ID. The historical `86c58ba`/legacy `5cbb...` pair is not carried forward as an untested promise for this new tree; its earlier evidence remains in [the original publication record](../RELEASE_PUBLICATION.md). Direct rollback to that older legacy image is not claimed here. The verified rollback target is the actual current production image above.

This is isolated upgrade/restart/rollback acceptance. It does not claim production deployment, physical-device, WeChat, screen-reader or local-player acceptance. The final main SHA must still pass required CI and immutable-image publication before the separate authorized deployment and online verification.
