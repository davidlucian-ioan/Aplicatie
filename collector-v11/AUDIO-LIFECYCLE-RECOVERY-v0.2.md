# Audio Processing Lifecycle & Recovery v0.2

## Current status
The lifecycle engine and durable checkpoint adapter are loaded by both app shells. After the StorageAdapter initializes, the app creates `CollectorAudioLifecycleCheckpointStore` and exposes a read-only recovery diagnostics surface. A Work panel lists non-completed checkpoints and can refresh them.

**This is not yet the production audio-to-memory pipeline.** The recorder, transcription, user-reviewed Work command and structured Core commit are still separate paths. No background lifecycle processing is wired to recorder completion. This checkpoint integration does not delete or auto-retry audio.

## Safety invariants
1. Source audio remains the recovery source until a future pipeline independently confirms durable structured-memory persistence.
2. `verifyPersisted` must return literal `true`; truthy values are insufficient.
3. Deletion is not allowed before a persisted checkpoint and independent readback.
4. The source deletion must be independently confirmed by reading AudioStore after removal.
5. Failures retain the source and create a `failed` recovery checkpoint whenever checkpoint storage remains available.
6. Idempotency key is stable: `audio:<recordingId>`.
7. No automatic retry, interpretation, or source deletion is performed by the current recovery UI.

## Durable checkpoint adapter
`createStorageCheckpointStore(storage)` stores each checkpoint under a dedicated key and maintains an index key. Writes are serialized in-process. It validates:
- recording ID and matching idempotency key;
- lifecycle state membership;
- attempts as a non-negative integer;
- verified persistence cannot be claimed before persisted commit;
- completed state requires persistence verification and confirmed audio deletion;
- audio-deleted flag only in the terminal deletion/completion states.

Legacy checkpoints are read with schemaVersion 1. Corrupt data fails closed and is surfaced in the recovery panel.

## Recovery diagnostics
`CollectorAudioLifecycleRecovery.list()` returns the checkpoint rows. The panel shows ID, state, attempt count and error. `refresh()` re-reads durable storage. Recovery is manual and read-only in this version.

## Next integration gates
Before enabling automatic processing:
- connect recorder IDs/AudioStore records to the lifecycle;
- define provider transcript/interpretation and structured extraction adapters;
- resolve entities and ambiguity without silently merging;
- commit through Core using the stable idempotency key;
- read back committed facts/entities/relations/events independently;
- add end-to-end crash tests for every checkpoint boundary;
- add a user-visible recovery action with explicit retry and retention behavior;
- keep deletion feature flag off until all native/web E2E paths pass and product/privacy review approves it.

## Recovery hardening batch — 10+ checks

Checkpoint storage now has additional crash-recovery safeguards:

- Storage adapters can enumerate keys by prefix (Web Storage and SQLite).
- Enumeration is serialized against pending storage writes.
- Checkpoint listing unions the persisted index with discovered keys and recovers orphan records created if a crash occurred between checkpoint write and index update.
- Index rebuild is verified by readback; duplicate/corrupt index entries fail closed.
- Checkpoint writes are verified by readback before being acknowledged.
- Index writes are independently verified.
- Checkpoint deletion is verified before the index is updated.
- Checkpoint payload size is bounded on both write and read.
- Schema version, timestamps, error fields and state claims receive stricter validation.
- Recovery diagnostics expose orphan and missing-index IDs; Work UI reports when orphan records were reindexed.
- Recovery remains diagnostic/manual: no automatic retry, interpretation, Core mutation or audio deletion is enabled.
