# Offline listening recovery acceptance — 2026-11-11

## Exact scope

Read-only production status confirmed current release `caee1e38104330b055b0797df8e6078849400382`, server image `sha256:5fa142e6bc3cda6e1e3373ceb9bf45b34e15bed5bfa4b0e140932eb9cdc7483e`. This is an ancestor of the candidate. Local inspection confirmed the same baseline image ID and revision.

Candidate source `2bf2644837cb257218e9b7867158d1bb777c1f05`, including security dependency lock updates, was built with the production server Dockerfile, `NODE_IMAGE=node:22-bookworm-slim`, `linux/amd64`. Candidate image ID is `sha256:45b55e75444e382094b5bdeb09a64661e0d711a88f5a77bbaa1b936a47114a9b`, with matching OCI revision. The tested server source tree is `8f1d12beb423218149c198691cb765539d48fa3d`. Subsequent metadata-only commits do not change that tree. The local base differs from CI's Alpine base; this is source-pair recovery evidence, not a claim that the unpublished CI image has already been tested.

## Actual results

The existing `scripts/container-recovery-smoke.mjs` passed all four cases: candidate restart in declaring and playing phases, and current baseline → candidate → current baseline in both phases. Every case preserved room, seat, authenticated credential and exact synthetic private hand, then successfully advanced the recovered decision. All six stops exited zero and flushed a fresh graceful snapshot. Snapshot schema remains 2; Redis namespace remains 1. No migration or reset was introduced.

[Machine-readable results](offline-listening/current-baseline-recovery.json) contain synthetic hand hashes/counts, no credentials or raw hands. The candidate tag was unchanged during the run; its image ID was inspected before the test completed. The harness removed its unique test containers/network. Only isolated synthetic rooms and an independent Redis were used, never production Redis or existing local application containers.

The first attempt could not allocate a default Docker subnet. After inspecting Docker and host routes, the supported test subnet option used `10.254.251.0/28`; no existing networks were deleted or modified.

## Boundary

Compatibility now names only the actual current production baseline above. This does not claim recovery against older releases or production deployment. Exact main CI, immutable-image publication, deployment readiness, and online acceptance remain separate gates. Offline UI acceptance previously passed in real Chrome; this recovery test does not substitute for physical-device acceptance.
