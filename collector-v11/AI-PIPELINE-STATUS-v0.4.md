# Collector — AI & Audio Pipeline Status v0.4

**Status date:** 26 November 2026  
**Branch:** `feature/openai-provider-integration`  
**Purpose:** implementation checkpoint, not a launch-readiness declaration.

## Implemented in the branch

1. **Audio capture:** browser/native recording, local AudioStore, periodic/interrupted-session recovery and playback controls.
2. **Transcription:** explicit user-triggered upload through the Collector Cloud API to the OpenAI transcription provider. Client has upload timeout and structured error handling. Source audio remains local during processing.
3. **Interpretation:** OpenAI Responses API with strict JSON schema for Core proposals, semantic summary, structured memory and reminder suggestions. Provider calls are server-side; no client OpenAI key.
4. **Structured extraction:** bounded entities/facts/relations, typed values, temporal-value validation, certainty validation and confidence validation.
5. **Entity resolution:** exact names/aliases and explicit IDs only; ambiguous identities are not silently merged. Existing canonical aliases are merged rather than overwritten.
6. **Core boundary:** allowlisted operations, preview, explicit confirmation, serialized mutation, idempotency, persistence before UI publication and independent persisted-journal readback.
7. **Recovery and retention:** deterministic audio capture idempotency; before retranscription, recovery looks for an already committed Core event. After confirmed Core commit and independent readback, temporary transcript draft is cleared and original audio is deleted by default; Work exposes an explicit retain-original-audio preference. Any uncertain state, failed commit, failed draft clearing or failed deletion verification retains the original source. Audio-derived memory notes and reminders do not retain the raw transcript; they carry only summary/extracted facts, source ID and reminder data. Audio commands remove unstructured `event.note` operations before Core preview; a note-only extraction is rejected and keeps the original. A note-only Core event is insufficient to authorize source deletion.
8. **Recall MVP:** local structured retrieval across entities, attributes, relations, event records and evidence identifiers. It does not yet synthesize a generative natural-language answer from those results.

## Safety invariants

- OpenAI never mutates Core or storage directly.
- No Core write happens before preview and explicit user confirmation.
- No audio deletion happens before the committed event and operations are independently read back from persisted Core state.
- Failure or uncertainty preserves the audio source and leaves a recoverable checkpoint.
- Retrying an already committed audio capture is checked before a new transcription request; stable capture identity is independent of transcript wording.
- Durable recall is based on Core entities, attributes, relations and events, not on the raw recording.

## Remaining acceptance work

- Add generative recall synthesis grounded only in retrieved evidence, with source IDs and uncertainty behavior.
- Add natural-language voice playback/TTS and source navigation.
- Finish a robust task lifecycle (open, completed, snoozed, cancelled) tied to reminders and source events.
- Add controlled offline processing/retry and queue UX without silent or destructive background behavior.
- Complete authoritative subscription tiers, trial, quota, usage metering, cost ceilings and store sandbox tests.
- Validate auth/data isolation, export/deletion semantics, privacy disclosures, encryption and monitoring for production.
- Run the quality suite, cloud API and mobile builds against the final PR HEAD; perform physical-device tests for microphone permission, background/foreground interruptions, audio recovery, notifications and battery behavior.

## Release boundary

PR remains unmerged. No production deployment, live billing activation or store release is authorized by this checkpoint.

## Batch 2026-11-26 — command-context isolation and end-to-end regression

- A new local/deterministic command is blocked while another AI interpretation, Core preview or Core commit is pending. It cannot silently replace a reviewable AI proposal.
- Starting a fresh local or AI turn clears any orphaned AI enhancement context. A rejected preview and an interrupted AI turn also discard their stale command metadata.
- The Core confirmation handler now binds audio cleanup metadata to all three identifiers: the staged recording ID, the exact `audio:<recordingId>` source ID and the stable `collector-audio-capture:<recordingId>` idempotency key. A mismatch disables the audio cleanup path and is surfaced in Work.
- Added `test-audio-ai-core-pipeline.js` to exercise the integrated contracts: source-bound transcript persistence, multi-entity/fact/relation preview, explicit confirmation, independent readback, idempotent retry, ambiguity rejection, note-only deletion denial, source-bound deletion verification and failure retention.
- This batch does not turn on background AI processing. Audio and transcript are still temporary and are removed only after a confirmed structured Core commit and independent verification, unless the user selects retention. Any uncertainty preserves the original recording.
- CI is running against the new branch head; this note is not a claim of final launch readiness or device validation.


## Batch 2026-11-26 — deletion cancellation/recovery and CI deduplication

- Fixed a destructive-action ordering issue: when the separate audio-delete action is cancelled, the temporary transcript checkpoint is no longer cleared before cancellation.
- Recovery now clears a transcript checkpoint when audio is already absent (possible lost deletion response), after the Core event has been independently verified.
- Added a regression in `test-audio-processing-lifecycle-integration.js` for confirmation-before-transcript-clear/deletion checkpoint ordering and absent-source recovery cleanup.
- CI workflow triggers were adjusted to avoid duplicate feature-branch push and PR runs: feature PRs run on `pull_request`, main runs on `push`; Quality also supports `workflow_dispatch`. The latest HEAD must validate these workflow changes.
- Last fully verified HEAD before this batch: `88c08475` — Cloud API, Quality Suite and Android/iOS simulator builds all passed. New code/workflow commits after it are pending validation; do not claim green until the latest HEAD completes.


## Batch 2026-11-26 — Recall synthesis and reminder transaction hardening

- Reminder service now validates persisted rows and rejects invalid/duplicate identifiers and unknown states before use.
- Local reminder writes are acknowledged and read back before native scheduling. Completion/cancellation and clear-all verify persistence; failure paths attempt compensation and retain metadata where notification state is uncertain.
- Snooze is serialized as one transaction. An uncertain native schedule/cancel outcome is exposed on the reminder row and blocks an idempotent duplicate until the user resolves the existing reminder.
- Structured Recall evidence now includes namespaced, stable source IDs for entities, relations, events, attributes and event attributes.
- Cloud context sanitizer accepts only bounded Recall evidence kinds and scalar evidence values. Recall provider mode is read-only, grounded only in retrieved evidence, and requires answer source IDs filtered against the provided evidence list.
- Think/Recall now includes explicit AI synthesis action. The UI only displays citations that match the local evidence set and supports navigation to cited Core events.
- This is code-level implementation, not a claim of real-provider, WebKit, physical-device or store acceptance. Recall does not receive raw audio or the full event journal.

### Remaining
- Real OpenAI Recall validation and browser/native E2E coverage.
- Canonical Core task/reminder ledger and Activity/Memory linkage.
- Offline retry queue and controlled recovery UX.
- TTS/voice playback.
- Tiered plans, store sandbox cases, external Supabase/RevenueCat setup, encryption/privacy and physical-device acceptance.


## Batch 26 Nov 2026 — durable reminder Core lifecycle

- Added durable `pending → scheduled` native notification scheduling lifecycle and startup recovery with stable notification IDs.
- Added `uncertain` state when a native schedule/cancel outcome cannot be proven; no false scheduled state is emitted.
- Added Core lifecycle outbox for `scheduled`, `completed`, `cancelled`, `schedule_uncertain`, synced using a stable idempotency key through BrowserCorePort preview/execute with durable readback.
- Outbox is retained on Core/storage failures, shown in Work, and supports manual retry and retry at initialization.
- Core receives only reminder identity/lifecycle/title/due/source ID/summary. The Work transcript or reminder sourceContext is not copied into the permanent journal.
- Recall tests cover reminder lifecycle events as source-linked event evidence.
- Ordinary reminder clear-all requires outbox sync. Explicit full local data erase cancels notifications and intentionally discards the local outbox because the corresponding local Core journal is also being erased.

### CI snapshot at runtime HEAD `a09f47d9`
Cloud API PASS; Node/Core/property/Replay PASS; Chromium and Firefox E2E PASS; iOS Simulator PASS. WebKit E2E and Android debug APK were still running at the last check; verify current Actions before final sign-off.

### Remaining
- Canonical Core task/reminder projection and richer Activity/Memory linkage.
- Full failure-injection coverage for uncertain native cancellation, real-device push/local notification behavior, and actual provider-driven E2E.
- Offline user-facing queue refinements, TTS, pricing/tier entitlements, store sandbox, production service isolation, privacy/security review and signed release.
