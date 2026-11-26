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
