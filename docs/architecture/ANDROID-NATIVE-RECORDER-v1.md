# Android native recorder — architecture and safety gates

Status: **Phase B — native service and bridge implementation in progress; physical-device acceptance is still required.**

## Decision

Keep Collector's existing web application and Core unchanged. Add an Android host using Capacitor 8 and a small app-owned Java Capacitor plugin. The plugin controls an app-owned Android microphone foreground service. The service runs in a separate Android process (:collector_recorder) so microphone capture and file writing do not depend on the WebView or Activity lifecycle.

The native service owns microphone capture, notification, wake lock, audio files, and recovery metadata. The web UI owns presentation and user intent. The existing browser recorder remains the fallback on browsers and platforms without the native bridge.

## Why the web recorder is not enough

The current browser recorder uses getUserMedia(), MediaRecorder, in-memory chunks, and IndexedDB. Screen Wake Lock is only a foreground screen-awake hint. It is not an Android background microphone service and it does not make browser-held chunks durable during process termination.

A third-party recorder plugin was evaluated and rejected for the core capture path: its Android implementation is tied to the Capacitor plugin lifecycle and writes into the app cache directory. That is not a strong enough durability boundary for a reportofon that must continue independently of the WebView.

## Native components

- Capacitor 8 host (@capacitor/core, @capacitor/android) with exact versions pinned together.
- CollectorRecorderPlugin.java: typed Capacitor bridge for start, pause, resume, stop, status, listing, lookup, and deletion.
- CollectorRecordingService.java: Android microphone foreground service running in its own process.
- filesDir/recordings/: app-private persistent audio files and atomic JSON manifests; never the Core journal.
- scripts/patch-android-manifest.mjs: generates the service declaration, permissions, notification icon, and MainActivity plugin registration into the generated Capacitor project.

## Native recording lifecycle

1. The user explicitly presses Record while the app is visible.
2. The bridge requests microphone permission and, on Android 13+, notification permission. A denied permission prevents recording.
3. The bridge starts the microphone foreground service from the visible Activity.
4. The service calls startForeground() immediately with an ongoing notification and a direct Stop action, then starts MediaRecorder.
5. Audio is written directly to app-private filesDir/recordings/, not to JavaScript memory, IndexedDB, or the cache directory.
6. On Android API 26+, use AAC ADTS (.aac) so a process interruption leaves a readable stream through its last complete frame. On API 24–25, fall back to MPEG-4/AAC (.m4a); an unclean process death may make that file unreadable.
7. The service atomically persists recording metadata after each state transition. Pause releases the partial wake lock; resume reacquires it.
8. Stop finalizes the recorder, commits the final manifest, releases the wake lock, removes the notification, and stops the service.
9. On app launch, the bridge checks whether the separate service process still exists. Stale recording or paused manifests become interrupted; existing partial files are retained and surfaced to the user.

## Android platform requirements

- Declare RECORD_AUDIO.
- Declare FOREGROUND_SERVICE and FOREGROUND_SERVICE_MICROPHONE.
- Declare the service with android:foregroundServiceType="microphone", android:exported="false", and android:stopWithTask="false".
- Start the microphone foreground service only from a user-visible, user-initiated flow and comply with current Android foreground-service start restrictions.
- Create a user-visible notification channel and ongoing notification with a direct Stop action.
- Request runtime microphone permission before service start. Request notification permission on Android 13+; notification permission denial is handled separately from microphone permission.
- Hold a partial wake lock only while actively recording; release it on pause, stop, or failure. Do not keep the screen awake for native recording.
- Do not claim that a foreground service survives every force-stop, reboot, OEM battery policy, permission revocation, or system resource kill. Surface recoverable partial recordings honestly.
- Keep audio in app-private persistent storage by default. Export/share must be a separate explicit user action.

## Bridge contract

The current JavaScript adapter exposes:
- startRecording(options) — returns a recording ID after dispatching the start command.
- pauseRecording(recordingId)
- resumeRecording(recordingId)
- stopRecording(recordingId)
- getRecordingState()
- listRecordings()
- getRecording(recordingId)
- deleteRecording(recordingId)
- toPlaybackUrl(uri) — converts the native file URI for WebView playback.

The UI polls the durable native state manifest; the service does not depend on JavaScript timers to keep recording. Notification Stop is handled directly by the service, even if the WebView is no longer active.

## Local WORK alarms

The WORK reminder module uses a separate app-owned Capacitor plugin and Android AlarmManager path; it does not depend on WebView timers.

- `CollectorAlarmPlugin` persists reminder metadata in app-private SharedPreferences and schedules RTC_WAKEUP alarms with `setAndAllowWhileIdle`.
- `CollectorAlarmReceiver` posts a high-importance local notification and supports a 10-minute snooze action.
- `CollectorAlarmBootReceiver` restores future alarms after device boot, app replacement, and system clock/time-zone changes.
- Alarm metadata stays local and is separate from the Core event journal.
- Android 13+ notification permission is required to schedule reminders through the app UI.
- These are **inexact, best-effort alarms**. Android Doze and vendor battery policies may delay delivery. The implementation deliberately does not request exact-alarm special access or claim clock-exact delivery.
- The browser build does not simulate background alarms; it clearly reports that scheduling requires the Android app.

## Data and failure model

- Audio files and manifests live outside the Core event journal. No audio capture operation creates a domain event.
- The service writes each manifest through a temporary file, fsync, and atomic rename.
- A stale active manifest is reconciled as interrupted when the service process is no longer running.
- AAC ADTS output is crash-tolerant through the last complete frame on API 26+; a clean stop is still required for normal finalization.
- M4A fallback on API 24–25 is not guaranteed recoverable after abrupt process death.
- Handle storage exhaustion, encoder failure, permission revocation, service destruction, app process death, and notification Stop explicitly.
- Deletion removes both the audio file and its manifest; partial failure is surfaced.
- Do not upload audio or invoke an AI provider.

## Test and release gates

### Static/build
- Android project builds reproducibly in CI with pinned Capacitor versions, JDK 21, Android SDK, and generated Gradle project.
- Manifest/service declarations and notification icon are checked by automated tests.
- No secrets, network upload endpoints, or provider credentials are introduced.

### Automated
- Node tests cover the Android web bundle and manifest patcher.
- Android build CI compiles the Java bridge and foreground service into a debug APK.
- Add Android unit/instrumentation tests for state reconciliation, service start/stop, notification Stop, pause/resume, and storage errors.
- Existing Core, property, Replay, and browser E2E suites remain green.

### Device acceptance (required before claiming screen-off support)
- Start recording, lock screen, record for at least 10 minutes, unlock, stop, and verify the entire audio is playable.
- Repeat while switching apps and with screen timeout enabled.
- Test incoming call/audio focus interruption, Bluetooth route changes, low storage, denied/revoked permission, and notification Stop.
- Destroy the UI Activity while recording and verify the separate service continues.
- Test process death and verify the AAC partial file is listed as interrupted and playable through its last complete frame.
- Test at least one physical Android device; emulator-only success is insufficient for the product claim.

## Rollout strategy

Keep the Android implementation behind native capability detection. If the native bridge is unavailable, preserve the current web recorder unchanged. Do not claim screen-off recording support until Android build, automated tests, and physical-device acceptance gates pass.

## Explicit non-goals

- No change to Core event schema or replay semantics.
- No cloud sync, automatic transcription, wake-word detection, or AI processing.
- No guarantee of recording after force-stop, reboot, or every vendor-specific process-kill scenario.

## Implementation note

The Android platform is generated from the pinned Capacitor config by npm run android:add; scripts/patch-android-manifest.mjs copies the app-owned Java bridge/service and adds the microphone foreground-service declarations and notification icon. The generated android/ directory is local build output and is intentionally not committed. CI regenerates it from scratch before building the debug APK.
