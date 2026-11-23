# Android native recorder — architecture and safety gates

Status: **Phase A — architecture baseline; no Android recording capability is claimed yet.**

## Decision

Keep Collector's existing web application and Core unchanged. Add an Android host using Capacitor 8. Use the maintained `@capgo/capacitor-audio-recorder` plugin for native microphone capture and `@capawesome-team/capacitor-android-foreground-service` for the Android microphone foreground service and persistent notification. Keep a custom Kotlin plugin as a fallback only if integration tests reveal a lifecycle or recovery gap that the maintained plugins cannot close. The Android implementation is an adapter for the existing recorder workflow; it must not fork or mutate the domain Core.

The native recorder plugin owns microphone capture and native file output; the foreground-service plugin owns the ongoing Android service and notification. The web UI owns presentation and user intent. The web recorder remains the fallback on browsers and platforms without the native plugins.

## Why the web recorder is not enough

The current recorder uses `getUserMedia()`, `MediaRecorder`, in-memory chunks, and IndexedDB. Screen Wake Lock is only a foreground screen-awake hint. It is not an Android background microphone service and it does not make browser-held chunks durable during process termination.

## Selected native components

- Capacitor 8 host (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`) with exact versions pinned together.
- `@capgo/capacitor-audio-recorder` 8.x for native Android AAC capture, pause/resume, status, and file URI output. Use `format: 'aac'` so a process interruption leaves a playable file through the last complete ADTS frame; this is recovery, not a guarantee of a cleanly finalized recording.
- `@capawesome-team/capacitor-android-foreground-service` 8.x for a foreground service declared with the `microphone` type and a persistent notification. Its service must be started while the Activity is visible and before microphone capture begins.
- The recorder plugin does not start a foreground service by itself. The two plugins must be orchestrated as one state machine: start service → start recorder; stop recorder → stop service. On any recorder-start failure, stop the service again.

## Native recording lifecycle

1. The user explicitly presses Record while the app is visible and grants microphone permission.
2. The bridge starts the native `microphone` foreground service and immediately posts an ongoing notification.
3. The native audio recorder writes AAC to an app-private native file. The app records the returned URI and metadata; it does not copy the entire audio into JavaScript memory.
4. Persist a small recording manifest (recording ID, timestamps, native URI, MIME/codec, duration, state, and last known status) independently from the Core journal.
5. Pause/resume follows the native recorder API. If a pause or interruption produces a separate file, keep each URI as a segment under the same recording ID rather than concatenating or overwriting it.
6. Stop finalizes the active native file, commits the manifest, stops foreground mode, and reports the completed recording to the web UI.
7. On app launch, query native recorder status and reconcile manifests with files. Flag incomplete/interrupted AAC sessions for explicit recovery. Never silently discard or auto-submit them.

## Android platform requirements

- Declare `RECORD_AUDIO`.
- Declare `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` where required by target SDK.
- Declare the service with `android:foregroundServiceType="microphone"`.
- Start the microphone foreground service only from a user-visible, user-initiated flow and comply with current Android foreground-service start restrictions.
- Create a user-visible notification channel and ongoing notification with a Stop action. Route the notification action through the same idempotent stop coordinator as the UI.
- Request runtime microphone permission before service start. Request notification permission where applicable; notification permission denial must not be treated as microphone permission.
- Do not claim that a foreground service survives every force-stop, reboot, OEM battery policy, permission revocation, or system resource kill. Surface recoverable partial recordings honestly.
- Keep audio in app-private storage by default. Export/share must be a separate explicit user action.

## Bridge contract (planned)

The JavaScript adapter should expose typed operations:
- `getCapabilities()`
- `startRecording(options)` (start foreground service first, then native recorder)
- `pauseRecording(recordingId)`
- `resumeRecording(recordingId)`
- `stopRecording(recordingId)` (stop native recorder first, then foreground service)
- `getRecordingState()`
- `listRecordings()`
- `getRecording(recordingId)`
- `deleteRecording(recordingId)`
- `exportRecording(recordingId)`

Events should report state changes, finalized segments, elapsed duration, recoverable interruptions, and actionable errors. The bridge must be idempotent for repeated stop/pause requests and reject invalid state transitions with stable error codes.

## Data and failure model

- Audio files and manifests live outside the Core event journal.
- No audio capture operation creates a domain event.
- Native AAC output is crash-tolerant through the last complete frame, but a clean stop is still required for normal finalization.
- A manifest update follows successful native file creation. On startup, reconcile manifests and files without overwriting valid recordings.
- Handle storage exhaustion, encoder failure, permission revocation, service destruction, app process death, and notification stop explicitly.
- Deletion removes the manifest and all owned segments; partial failure must be surfaced and retried safely.
- Do not upload audio or invoke an AI provider.

## Test and release gates

### Static/build
- Android project builds reproducibly in CI with a pinned JDK, Android SDK, Gradle wrapper, and dependency versions.
- Manifest/service declarations are checked for supported target SDK behavior.
- No secrets, network upload endpoints, or provider credentials are introduced.

### Automated
- Unit tests cover the JS recording coordinator state machine, manifest serialization/versioning, native URI handling, reconciliation, and invalid transitions.
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

## Implementation note

The Android platform is generated from the pinned Capacitor config by `npm run android:add`; `scripts/patch-android-manifest.mjs` adds only the required microphone foreground-service declarations and notification icon. The generated `android/` directory is local build output and is intentionally not committed. CI regenerates it from scratch before building the debug APK.
