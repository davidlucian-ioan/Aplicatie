# Audio Processing Lifecycle & Recovery v0.2

## Current status
The lifecycle engine and durable checkpoint adapter are loaded by both app shells. After the StorageAdapter initializes, the app creates `CollectorAudioLifecycleCheckpointStore` and exposes a read-only recovery diagnostics surface. A Work panel lists non-completed checkpoints and can refresh them.

The user-triggered Work path now connects `Transcrie + AI` to server transcription, AI interpretation, structured-memory extraction/entity resolution, Core preview, explicit user confirmation and an independent persisted-journal readback before the UI reports a successful commit. The source recording remains local while the user reviews and confirms. After a verified commit, the UI offers a separate, explicitly confirmed audio deletion action.

**The checkpoint lifecycle is not yet the production audio-to-memory orchestrator.** It is not wired to recorder completion or unattended/background processing. The current flow begins only when the user taps `Transcrie + AI`; no background retry or automatic audio deletion is enabled.

## Safety invariants
1. Source audio remains the recovery source until a future pipeline independently confirms durable structured-memory persistence.
2. `verifyPersisted` must return literal `true`; truthy values are insufficient.
3. Audio retention is the default lifecycle policy: after verified persistence the checkpoint enters `source_retained` and the original recording remains in AudioStore.
4. Lifecycle deletion is possible only when the constructor receives the explicit `deleteAudioAfterVerified: true` policy, and only after independent persistence readback.
5. The source deletion must be independently confirmed by reading AudioStore after removal.
6. Failures retain the source and create a `failed` recovery checkpoint whenever checkpoint storage remains available.
7. Idempotency key is stable: `audio:<recordingId>`.
8. The app's current Work UI does not instantiate the lifecycle with deletion enabled; audio removal remains a separate, user-confirmed action after verified commit.
9. No background retry or unattended interpretation is performed by the current recovery UI.

## Durable checkpoint adapter
`createStorageCheckpointStore(storage)` stores each checkpoint under a dedicated key and maintains an index key. Writes are serialized in-process. It validates:
- recording ID and matching idempotency key;
- lifecycle state membership;
- attempts as a non-negative integer;
- verified persistence cannot be claimed before persisted commit;
- `source_retained` requires a persisted commit plus literal verified persistence and must not claim deletion;
- completed state requires persistence verification and confirmed audio deletion;
- audio-deleted flag only in the terminal deletion/completion states.

Legacy checkpoints are read with schemaVersion 1. Corrupt data fails closed and is surfaced in the recovery panel.

## Recovery diagnostics
`CollectorAudioLifecycleRecovery.list()` returns the checkpoint rows. The panel shows ID, state, attempt count and error. `refresh()` re-reads durable storage. The user can explicitly resume transcription/AI for a surviving source recording or independently verify/finalize an already-requested deletion. No retry, transcription or deletion runs in the background.

## Next integration gates
Before enabling automatic processing:
- connect recorder IDs/AudioStore records to the lifecycle;
- define provider transcript/interpretation and structured extraction adapters;
- resolve entities and ambiguity without silently merging;
- commit through Core using the stable idempotency key;
- read back committed facts/entities/relations/events independently;
- add end-to-end crash tests for every checkpoint boundary;
- continue hardening the user-visible manual recovery actions and their crash-boundary E2E coverage;
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
- Recovery remains diagnostic/manual: no automatic retry, interpretation, Core mutation or lifecycle-driven audio deletion is enabled. The lifecycle constructor defaults to retention (`deleteAudioAfterVerified: false`); deletion requires an explicit `true` opt-in.


## Current manual Work flow — verified save and retention

1. User taps **Transcrie + AI** for a specific local recording.
2. Collector reads the selected recording and sends the audio to the configured transcription endpoint. The original local source remains untouched.
3. The transcript is placed in Work and the AI interpretation starts for that same recording. The source recording ID is attached to the proposed capture and a deterministic capture key is derived from the recording ID and transcript.
4. Structured extraction is validated, existing entities are resolved, and ambiguous matches are surfaced for clarification rather than merged.
5. Core preview is non-persistent. The user must explicitly confirm the proposed mutation.
6. Core persists the event, independently reads the stored journal back, validates the rebuilt state and confirms the event ID, idempotency key and operations before publishing the new state.
7. Only after a verified committed or idempotent duplicate result does Work offer **Șterge audio original**. The user must confirm again; AudioStore is read after removal to verify the result.

If independent readback is unavailable or does not match the confirmed command, the UI is locked into read-only mode until reload and journal revalidation. This prevents a second write from masking an uncertain first commit.


## Manual checkpoint/recovery integration

The Work UI records metadata-only checkpoints for each selected recording: `processing`, `validated`, `failed`, `captured`, and after a verified Core commit `source_retained`. Checkpoints do not copy transcript text or audio bytes. A failed/interrupted item can be retried only by pressing the recovery action for that recording. A pending deletion can only be finalized after the helper revalidates the referenced event against the persisted Core journal and confirms that the audio source is absent. There is no background retry or deletion.
