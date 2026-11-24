# Collector — microphone ownership

## Purpose

The WORK recorder and browser speech-capture controls must never intentionally start competing microphone sessions in the same app instance.

## Ownership rules

- A recorder start request owns the microphone immediately, including while the asynchronous Android service start or browser `getUserMedia` request is pending.
- Live transcription and one-shot dictation are refused while recorder state is `starting`, `recording`, `paused`, or `saving`.
- Recorder start is refused while one-shot recognition or live recognition is active.
- A native recorder state reported as `starting`, `recording`, or `paused` also blocks speech capture, even after WebView recreation.
- Speech capture and native recorder startup fail closed until the initial native recorder-state query succeeds. A slow, empty, malformed, or unknown state never defaults to `inactive`.
- The user must explicitly stop the current owner before starting the other operation. The app does not silently stop a recording or discard a transcription session.

## Scope and limitations

- This is same-app UI arbitration. It is not an Android OS-wide microphone lock and does not replace the native service's own lifecycle checks.
- The STT capability probe only queries on-device language support; it does not call `startListening` or capture audio.
- Actual Android on-device STT is not enabled by this change. When implemented, it must use the same ownership contract and release/destroy its recognizer on every completion, error, and cancellation path.
- Browser SpeechRecognition is not advertised as offline.
- Physical Android validation remains required for microphone handoff, app switching, Activity destruction, interruptions, and screen-off recording.

## Automated regression coverage

The Playwright tests verify:
1. Native recording blocks live voice transcription and one-shot dictation.
2. Live voice transcription blocks browser audio recording before `getUserMedia`.
3. A pending asynchronous native recorder start blocks voice transcription before the service reports its final state.
4. Speech capture fails closed while the initial native recorder-state query is unresolved.
5. Native recorder startup fails closed while the initial service-state query is unresolved.
6. An explicit `unknown` native status blocks both STT and recorder startup.
