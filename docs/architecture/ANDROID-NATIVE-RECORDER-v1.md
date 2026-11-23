# Android native recorder — architecture and safety gates

Status: **Phase A — architecture baseline; no Android recording capability is claimed yet.**

## Decision

Keep Collector's existing web application and Core unchanged. Add an Android host using Capacitor and a small native Kotlin plugin. The Android implementation is an adapter for the existing recorder workflow; it must not fork or mutate the domain Core.

The native plugin owns microphone capture and durable audio files. The web UI owns presentation and user intent. The web recorder remains the fallback on browsers and platforms without the native plugin.

## Why the web recorder is not enough

The current recorder uses `getUserMedia()`, `MediaRecorder`, in-memory chunks, and IndexedDB. Screen Wake Lock is only a foreground screen-awake hint. It is not an Android background microphone service and it does not make browser-held chunks durable during process termination.

## Native recording lifecycle

1. The user explicitly presses Record while the app is visible and grants microphone permission.
2. The bridge starts a native `microphone` foreground service and immediately posts an ongoing notification.
3. Kotlin captures audio and writes bounded segments to app-private storage. Do not buffer the entire recording in RAM.
4. The service persists a small recording manifest (recording ID, timestamps, segment list, MIME/codec, duration, state, and last durable segment) after each finalized segment.
5. Pause finalizes the current segment and releases the microphone. Resume starts a new segment under the same recording ID.
6. Stop finalizes the active segment, fsyncs/commits metadata, stops foreground mode, and reports the completed recording to the web UI.
7. On app launch, reconciliation lists complete recordings and flags incomplete/interrupted sessions for explicit recovery. Never silently discard or auto-submit them.

## Android platform requirements

- Declare `RECORD_AUDIO`.
- Declare `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` where required by target SDK.
- Declare the service with `android:foregroundServiceType="microphone"`.
- Start the microphone foreground service only from a user-visible, user-initiated flow and comply with current Android foreground-service start restrictions.
- Create a user-visible notification channel and ongoing notification with a stop action.
- Request runtime microphone permission before service start. Request notification permission where applicable; notification permission denial must not be treated as microphone permission.
- Do not claim that a foreground service survives every force-stop, reboot, OEM battery policy, permission revocation, or system resource kill. Surface recoverable partial recordings honestly.
- Keep audio in app-private storage by default. Export/share must be a separate explicit user action.

## Bridge contract (planned)

The Kotlin plugin should expose typed operations:
- `getCapabilities()`
- `startRecording(options)`
- `pauseRecording(recordingId)`
- `resumeRecording(recordingId)`
- `stopRecording(recordingId)`
- `getRecordingState()`
- `listRecordings()`
- `getRecording(recordingId)`
- `deleteRecording(recordingId)`
- `exportRecording(recordingId)`

Events should report state changes, finalized segments, elapsed duration, recoverable interruptions, and actionable errors. The bridge must be idempotent for repeated stop/pause requests and reject invalid state transitions with stable error codes.

## Data and failure model

- Audio files and manifests live outside the Core event journal.
- No audio capture operation creates a domain event.
- Each segment is written to a temporary file and atomically renamed only after the encoder/container is finalized.
- A manifest update follows durable segment completion. On startup, reconcile temporary files, manifests, and orphaned segments without overwriting valid recordings.
- Handle storage exhaustion, encoder failure, permission revocation, service destruction, app process death, and notification stop explicitly.
- Deletion removes the manifest and all owned segments; partial failure must be surfaced and retried safely.
- Do not upload audio or invoke an AI provider.

## Test and release gates

### Static/build
- Android project builds reproducibly in CI with a pinned JDK, Android SDK, Gradle wrapper, and dependency versions.
- Manifest/service declarations are checked for supported target SDK behavior.
- No secrets, network upload endpoints, or provider credentials are introduced.

### Automated
- Unit tests cover the recording state machine, manifest serialization/versioning, segment naming, reconciliation, and invalid transitions.
- Instrumentation tests cover permission grant/deny, service start/stop, notification action, pause/resume, and storage errors.
- Existing Core, property, Replay, and browser E2E suites remain green.

### Device acceptance (required before claiming screen-off support)
- Start recording, lock screen, record for at least 10 minutes, unlock, stop, and verify the entire audio is playable.
- Repeat while switching apps and with screen timeout enabled.
- Test incoming call/audio focus interruption, Bluetooth route changes, low storage, denied/revoked permission, and notification Stop.
- Kill the UI activity (not force-stop the app) and verify the service behavior and recovery path.
- Test at least one physical Android device; emulator-only success is insufficient for the product claim.

## Rollout strategy

Keep the Android implementation behind native capability detection. If the plugin is unavailable, preserve the current web recorder unchanged. Do not switch the default recording path until Android build, automated tests, and physical-device acceptance gates pass.

## Explicit non-goals for this phase

- No change to Core event schema or replay semantics.
- No cloud sync, automatic transcription, wake-word detection, or AI processing.
- No guarantee of recording after force-stop, reboot, or every vendor-specific process-kill scenario.
