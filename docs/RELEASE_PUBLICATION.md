# Production image publication and recovery

`release.yml` publishes `ghcr.io/lin594/sise-server:sha-<full SHA>` and
`ghcr.io/lin594/sise-web:sha-<full SHA>` for `linux/amd64`. It runs after
`Validate contributions` succeeds on main, or by manual dispatch with both the
full current main SHA and that SHA's successful CI run ID. GitHub's run and job
records must show a main push/manual CI run from this repository and a successful
`CI gate`. Pull requests and forks cannot enter the package-writing job.

The publication builds the web client with `wss://api.sise.tajuren.cn` and
`https://api.sise.tajuren.cn`. An existing full-SHA tag causes publication to
fail closed; it is never intentionally overwritten. A failed partial publication
requires investigation before a new source commit is released. There is no
`latest` tag. Deploy by the manifest's digest, since registry administrators can
still alter registry state outside this workflow.

The `release-manifest` artifact contains `release-manifest.json` with both
registry digests, image config digests (Docker image IDs), OCI source revisions,
architecture, build parameters and the successful CI run ID. The workflow
inspects the published registry objects before writing the manifest. Both images
must pass inspection before the artifact exists. Publication does not deploy.

## Recovery compatibility

`release-compatibility.json` records the tested source revisions, actual baseline
server image ID, and the Git tree of `server/src`. Manifest generation fails if
that tree changes without updating the compatibility evidence. New gameplay or
snapshot changes require a fresh upgrade and rollback test. Matching version
numbers alone do not establish safe rollback. Current room snapshots use schema
2 in Redis namespace 1 and do not contain their originating source SHA.

The historical 2026-10-14 source set included
`86c58bac13d79e0ff154f2cdd4cb359187e497c1` and its verified server source tree.
The then-production checkout `a4a2f7714011382082285e531d0498fabaf1f6b5`
was not treated as proof of the running image's source. That legacy image had no
OCI revision label and was recorded independently as
`sha256:5cbb1fac7b87fd05c84488649167a14f3d045caaeaabcb0cd265357edbd14c1a`.
A source checkout alone does not attest the contents of that old image.

On 2026-10-22, read-only production status confirmed managed release
`b64fae642433285de50baac2226772c2104a7dfc`, whose actual server image
`sha256:8650c4178ac39b34ce4bb5e8906738ce72188e4565c7bc0a76473b59f210d32b`
has a matching OCI revision. [Fresh current-baseline acceptance](validation/RELEASE_RECOVERY_2026-10-22.md)
binds the action-presentation server tree to that exact baseline through real
synthetic-room upgrade and rollback tests. Its compatibility declaration does not
carry the older legacy image forward as an untested promise for the new tree.

The reusable smoke harness creates its own Docker network, Redis container and
server container, exposes only a random loopback port, and removes only those
resources. It exercises declaring and playing rooms, preserving room ID, seat,
credential and the exact private hand, then advances the recovered decision. It
also checks that SIGTERM causes the candidate to flush a fresh Redis snapshot and
exit with code 0. CI runs this test as part of `Production containers`, so the
existing required `CI gate` includes it.

```sh
# Build the candidate locally, never on the production server.
docker build --target production -t sise-recovery-candidate ./server
RECOVERY_TEST_IMAGE=sise-recovery-candidate \
RECOVERY_BASELINE_IMAGE=<locally imported exact production image> \
node scripts/container-recovery-smoke.mjs
```

When OrbStack's automatic address pools are exhausted, set
`RECOVERY_TEST_SUBNET` to a verified unused subnet. No network pruning is needed.
The current production Dockerfile runs Node directly so Docker SIGTERM reaches
the snapshot hooks; Compose allows 30 seconds for shutdown and checks `/health`.
Real device, accessibility and player acceptance remain tracked separately in
[the release checklist](RELEASE_CHECKLIST.md).

## Recorded isolated acceptance (2026-10-14)

The actual imported production server image above was tested against candidate
image `sha256:12cd278848fc41c177cab56999db69702b5492dcc4b214bd4b40d2eccbd15576`
(`server/src` tree `87098d9600ce21e96f0576aa3d6f7103186b64ca`). The
candidate was built locally with cached `node:22-bookworm-slim`; CI repeats the
candidate test with the release Dockerfile's Alpine base.

| Scenario | Phase | Result |
| --- | --- | --- |
| Candidate → candidate restart | declaring | room, seat, credential and private hand preserved; declaration resumed |
| Actual production → candidate → actual production | declaring | upgrade and rollback preserved the room; declaration resumed |
| Candidate → candidate restart | playing | private hand preserved; resumed discard accepted |
| Actual production → candidate → actual production | playing | upgrade and rollback preserved the room; resumed discard accepted |

All six intervening stops exited 0 and wrote snapshots with `savedAt` at or
after SIGTERM initiation. Test evidence records only private-hand hashes and
counts, never player credentials or private card arrays. All test containers and
their network were removed. This is controlled recovery acceptance; it does not
replace the real-device and player requirements in the release checklist.
