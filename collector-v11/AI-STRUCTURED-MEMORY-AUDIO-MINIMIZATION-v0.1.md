# Collector — AI Structured Memory & Audio-Minimization Architecture v0.1

Status: accepted product direction; first implementation slice present on 2026-11-26.
This document does not supersede Core invariants, decisions D-001–D-044, privacy, or explicit confirmation rules.

## Product principle
Audio is an input transport, not the permanent memory. Collector should transform speech/text into durable, structured, source-grounded knowledge. By default, raw audio is temporary and may be deleted after successful processing and durable commit; users can explicitly opt into retaining recordings. No audio upload occurs without an explicit user action and clear disclosure.

## Pipeline
1. Capture speech (hands-free Work flow) or text. Audio capture stays local until the user starts/authorizes processing.
2. Transcribe (on-device when available, otherwise a disclosed provider path). Preserve transcript temporarily for interpretation and validation.
3. AI semantic extraction returns a strict structured proposal: entities, aliases, entity types, attributes, relations, events, temporal values, tasks/reminders, confidence, ambiguity/clarification needs, and source span references.
4. Resolve entities against the user's existing graph. Prefer stable IDs; use aliases and fuzzy candidates only to propose matches. Ambiguous identity must ask the user, never silently merge.
5. Build Core command(s), preview, validate operation allowlist/invariants and risk policy. Low-risk memory capture may use an explicit capture consent setting; consequential actions (finance, inventory changes, reminders, relation closure/moves, corrections) require confirmation as appropriate. AI must not directly write storage.
6. Commit via Core/event-sourced journal. Preserve provenance metadata: source type, capture time, event time, transcript/source excerpt (optional configurable retention), AI model/version, confidence, and processing status. Avoid retaining full transcript by default if compact structured data and provenance are sufficient.
7. Verify durable commit. Only then delete temporary audio/transcript according to retention policy. If processing, validation, or commit fails, retain temporary audio until retry or user decision; never claim success.
8. Recall: resolve query entities and temporal intent; retrieve structured entities/relations/events/attributes/reminders, then bounded source context; AI synthesizes answer only from retrieved evidence. Include uncertainty and source/event references, with UI jump to records.

## Core knowledge model
- Entities: person, place, object, organization, project, plant, animal, device, concept, and user-defined types.
- Relations: typed directed edges with validity intervals, provenance, confidence and optional attributes (e.g. owns, works_with, located_in, brought, needs, part_of, discussed_with).
- Events: what happened/was said/decided, with happenedAt, recordedAt, participants, location, linked entities, status, source/provenance.
- Attributes: typed facts, with history and validity (current vs historical).
- Tasks/reminders: action, assignee, due time/date, status, linked entities/event, reminder scheduling state. A plan is not a completed event.
- Entity aliases/name history support resolution without destructive rename/merge.
- Provenance: every extracted fact should trace to a capture/session/event or explicit user edit. Use confidence for candidate extraction, not as an excuse to commit ambiguous identity.

## Temporal semantics
Store exact ISO timestamp for capture and explicit temporal values separately. Resolve relative expressions using capture timezone and reference time. Preserve date-only/time-unknown semantics instead of inventing a clock time. If "Friday" is ambiguous due to past/future or timezone context, ask. Distinguish fact, plan, prediction, and completed action.

## Storage and privacy
- Default: no permanent audio. Temporary audio is removed only after successful commit and verified extraction; failure leaves recoverable state.
- Offer an explicit “keep original audio” setting per user/session, with storage quota and delete controls.
- Prefer compact normalized records and event journal; transcript retention configurable and off by default where source evidence can be represented with short source excerpts.
- User can delete a memory and its source/provenance, subject to event-log integrity policy. Use tombstone/redaction semantics or privacy-preserving deletion design; do not pretend append-only history means deletion is impossible.
- Encryption at rest, access isolation, retention, export and deletion need production review before launch.

## Recall strategy (MVP, no vector DB dependency)
1. Parse question into entities, aliases, time range, relation/event intent.
2. Query exact and normalized entity names/aliases first.
3. Filter structured events/relations by entity IDs, event type, temporal window and status.
4. Rank evidence by exact entity match, recency where relevant, explicitness, confidence and source.
5. Return bounded evidence to the AI and require answer citations/record IDs. If evidence is insufficient, say so.
6. Optional later: embeddings for semantic retrieval, but they complement graph/event filtering and never replace structured truth or provenance.

## Example
Input: “Azi am vorbit cu Mihai. Aduce pompa vineri la atelier. Pompa trebuie reparată și trebuie să comand furtun de 12 mm.”
Expected proposal (illustrative, not a fixed schema):
- entity/person: Mihai (resolve existing ID or create)
- entity/object: pump (resolve/create; name/alias)
- entity/location: workshop (resolve/create)
- event: conversation, capturedAt, participants Mihai + user
- relation/event: Mihai plans to bring pump to workshop on Friday (planned, not completed)
- fact/event: pump requires repair
- task: order 12 mm hose, due date only if explicitly inferred/confirmed, linked to pump
- relation edges linking participants, object, location and task
- reminder suggestion only after date/time policy and confirmation
Question later: “Ce trebuie să fac pentru pompa lui Mihai?” retrieves pump, planned delivery, repair requirement and hose-order task; answer shows evidence/source links and task status.

## Implementation sequence
A. Define a versioned structured extraction contract + validator and safe entity-resolution rules.
B. Add a Core command builder that emits existing supported operations (entity.create, attribute.set/define, relation.create, event.note, event.attribute.set, relation.attribute.set) and never bypasses preview/commit.
C. Add bounded structured-memory retrieval to AI context, with exact entity/time filters and source IDs.
D. Add audio/transcript retention state machine and deletion-after-commit logic with failure recovery tests.
E. Add recall answer contract with evidence IDs and UI source navigation.
F. Test ambiguous names, alias collisions, date/time parsing, duplicate capture/idempotency, failed persistence, offline retries, deletion, permission and privacy boundaries.

## Acceptance criteria
- One natural capture can create/link multiple entities, relations, event facts and a reminder/task proposal.
- No duplicate entities/events on retries (idempotency).
- Ambiguous entity match is clarified.
- Audio is not deleted until durable structured commit succeeds; after success deletion is verified and user policy honored.
- Recall answers only from retrieved evidence, distinguish plans from completed actions and expose source links.
- Full original audio is not required for recall.


## MVP implementation progress (26 Nov)
- First implementation increment now exists in the branch: strict extraction validation, entity resolution, command generation, structured recall evidence, provider schema output and Work UI preview wiring.
- This remains proposal-first: no silent Core auto-commit; user confirmation is still required. Ambiguous identity is a hard clarification.
- After a confirmed Core commit and independent journal readback, the temporary transcript draft is cleared and source audio is deleted by default, with an explicit Work preference to retain recordings. Failed or uncertain processing always retains the source.
- The browser flow now uses OpenAI transcription/interpretation, strict structured-memory validation, entity resolution, Core preview, explicit confirmation and independent persisted-journal readback. Structured entities, attributes, relations and events are the durable memory; original audio is not required for reconstruction.
- Rich source-linked playback/recall, natural-language playback/TTS, automatic background queueing and physical-device validation remain follow-up work.
