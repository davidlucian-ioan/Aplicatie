# Collector — Voice-first UI foundation

Status: implementation foundation in progress  
Scope: first UI foundation increment  
Product principle: hands-free first, screen-supported, never silent about persistence

## Product intent

Collector should feel closer to a voice recorder and field notebook than a conventional back-office form application. The user should be able to capture observations and operational facts while their hands are occupied. Touch remains available for review, correction, configuration and exceptional cases, but should not be required for every routine capture.

The target is not "add a microphone button". The target is a voice-first interaction model with persistent context, clear acknowledgement, safe interpretation and explicit control over what becomes a durable record.

## Target interaction

1. User starts capture from any screen or a physical/system shortcut in a future native shell.
2. Collector captures speech and transcribes it.
3. The interpreter resolves the utterance into a candidate command using the current entity/context.
4. Core validates the candidate and computes its effects without mutating the event journal.
5. Collector reads back a concise interpretation and asks for confirmation when required.
6. Only an explicit confirmation commits the operation through Core.
7. Collector acknowledges the outcome and retains the event in the append-only journal.

For low-risk observations, a future user-configured policy may allow batch confirmation. Financial operations, stock corrections, destructive actions and ambiguous entity matches must remain confirmation-gated.

## Current increment

- Adds a global voice entry point to the application header.
- Opens the existing assistant view and starts browser speech recognition when the browser exposes the API.
- Uses Romanian (ro-RO) recognition, one utterance per capture.
- Shows listening, stop, unsupported-browser and recognition-error states.
- Keeps text entry as a fallback.
- Does not write to localStorage or append events merely because microphone capture starts or stops.
- The existing deterministic parser, Core Port preview and explicit confirmation remain the only path to command execution.
- Adds a responsive mobile navigation drawer, semantic navigation, keyboard focus styles, reduced-motion support, accessible labels and live status announcements.

## Important limitations and privacy constraints

- The Web Speech API is not consistently available across browsers and platforms.
- The browser/operating-system implementation controls how recognition is processed. It must not be represented as guaranteed offline or local-only.
- This increment is one-shot speech recognition, not continuous background recording, wake-word detection or always-on listening.
- Microphone permission and browser lifecycle behavior remain controlled by the platform.
- No Collector AI provider is connected by this increment.
- Users must have a visible and accessible way to stop capture. No hidden recording is allowed.
- Before enabling continuous recording or cloud transcription, define retention, consent, data minimization, encryption, export/deletion, offline behavior and vendor processing disclosures.

## Architecture boundaries

Microphone / Speech API → Transcript → Intent interpreter → Core Port preview → Core validation → Explicit confirmation → Event journal

- Speech recognition produces text; it does not decide domain truth.
- Intent interpretation may propose entity IDs, attributes, quantities and operations; it cannot commit.
- Core remains the authority for invariants, atomicity, idempotency and event creation.
- UI must never mutate projections or bypass Core.
- Replay and existing event semantics must remain unchanged.

## Impact analysis

### Unchanged
- Core engine and domain rules.
- Event schema, append-only journal and Replay.
- Stock and finance projections.
- Existing page IDs and current assistant parser.
- Local persistence semantics and explicit Core Port confirmation.

### Changed
- Application shell and responsive navigation.
- Voice entry point and speech-recognition lifecycle presentation.
- Accessibility semantics and mobile interaction behavior.
- E2E coverage for navigation, speech activation, unsupported-browser fallback and no-write-on-start behavior.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| Browser does not support speech recognition | Text entry remains available; fallback is announced |
| Browser recognition may not be offline | Do not promise offline speech; select an explicit local STT strategy before offline voice claims |
| Accidental capture | User-initiated start, visible listening state, explicit stop |
| Accidental data mutation | No commit on capture; preview and Core confirmation remain required |
| Mobile navigation traps the user | Backdrop, Escape key, close-on-navigation and accessible expanded state |
| UI changes regress Core | Existing full CI and Core/Replay tests remain required |

## Next product increments

1. Persistent voice session with explicit start/stop and clear recording indicator.
2. Spoken read-back and spoken confirmation, with collision-safe handling between microphone capture and text-to-speech.
3. Conversation context with entity disambiguation and timeout.
4. Batch capture of multiple observations, each represented as a separate validated command/event.
5. Local speech-to-text evaluation for offline use; compare browser API, native OS capabilities and bundled local models.
6. Background capture only where platform permissions and lifecycle support it; otherwise use an explicit foreground recording session.
7. Usability tests measuring time-to-capture and error rate with hands occupied.

## Acceptance criteria for this foundation

- Global voice action is available from every application section.
- Mobile navigation is operable with touch and keyboard and exposes its state to assistive technology.
- Speech API absence or failure does not block text entry.
- Starting/stopping capture creates no domain event and changes no projection.
- No command is committed without Core validation and the existing explicit confirmation.
- Existing Core, generated invariant, Replay and cross-browser tests pass.


## Voice session capture — next increment

- The global voice entry point now starts a foreground, continuous speech-recognition session when supported by the browser.
- Multiple final speech segments are accumulated into one free-form observation transcript. Stopping the session converts that transcript into one event.note preview through the existing deterministic parser and Core Port.
- Capture and stop do not persist an event. The user must still review the preview and explicitly confirm the Core command.
- Short structured commands remain available through the separate one-shot dictation control.
- This is not background recording, wake-word detection, automatic command batching, spoken read-back, or guaranteed offline recognition. Browser implementations may terminate recognition; a session ending early is surfaced and any final transcript is still subject to review.
- E2E coverage verifies multi-segment accumulation, preview-only behavior, explicit commit, and unsupported-browser fallback.


## Local audio recorder — first implementation increment

- The global capture action now starts a real foreground audio recording using `getUserMedia` and `MediaRecorder`.
- Recording supports pause, resume and explicit stop. Microphone tracks are stopped after recording.
- Original audio blobs are stored in a dedicated IndexedDB database, separate from the append-only Core event journal and localStorage projections.
- Recordings can be played back and explicitly deleted from the local recordings list.
- Audio capture does not create Core events or invoke cloud transcription. Live speech recognition remains a separate optional workflow.
- Browser permission denial, unsupported APIs and local storage errors are surfaced. The microphone is requested only after an explicit user action.
- This is foreground browser capture. It does not guarantee background recording, device-lock continuity, offline transcription, encryption at rest, or cross-device sync. Those require separate platform and security work.
- E2E coverage exercises start, pause, resume, stop, local persistence across reload, permission denial and the invariant that audio capture does not append Core events.
