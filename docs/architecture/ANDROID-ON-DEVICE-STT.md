# Android on-device STT capability probe

Status: **Capability probe implemented; actual recognition is not enabled yet.**

## Objective

Determine whether the Android device exposes a genuine on-device speech recognizer and whether Romanian (ro-RO) is installed, pending, downloadable, or unsupported. The probe must not capture microphone audio, start a model download, or fall back to an online recognizer.

## Platform contract

- Android API 31+: SpeechRecognizer.isOnDeviceRecognitionAvailable() reports whether an on-device recognition service exists. createOnDeviceSpeechRecognizer() explicitly creates that recognizer; Collector must not substitute the generic createSpeechRecognizer() factory for an offline claim.
- Android API 33+: checkRecognitionSupport() can report installed, supported-but-not-installed, and pending on-device language models. Collector uses this to classify Romanian support.
- Android API 31–32: the platform can report that an on-device service exists, but this API surface does not expose the installed language list. Collector reports the language as unverified instead of guessing.
- Microphone permission is checked before querying the recognition support service. The Android permission prompt is shown only after the user explicitly taps **Verifică suportul STT offline**; there is no background or automatic prompt. If permission is denied, the probe returns `permission-required` and does not start listening.
- Model downloads are not started by this implementation. A future download action must be explicit and separately confirmed.
- Android's SpeechRecognizer API requires RECORD_AUDIO for actual recognition. The current probe does not start listening or produce a transcript.

## Implemented surface

- Native plugin: CollectorSpeechPlugin.getOfflineSupport(language).
- JavaScript bridge: window.CollectorAndroidSpeech.getOfflineSpeechSupport('ro-RO').
- WORK diagnostic: **Verifică suportul STT offline**.
- Manifest package-visibility query for android.speech.RecognitionService.
- The response identifies provider, Android API level, requested language, service availability, language status, and whether audio was captured/uploaded. Both audio flags remain false.
- Permission flow uses Capacitor's microphone permission alias and callback; granting permission only enables the support query and never starts recognition or recording.

## Safety and product constraints

1. Do not claim that Romanian STT is offline merely because an on-device service exists.
2. Do not use generic Android speech recognition as a fallback: that may route recognition to a remote provider.
3. Do not run speech recognition while the native audio recorder service is holding the microphone. A future recognizer must gate against active/paused recorder states and expose the conflict to the user.
4. Do not auto-download language models. Show model size/source and require explicit user approval if a download flow is added.
5. Keep recognition output in the existing preview → explicit confirmation → Core Port path. Transcription itself must never create or commit domain events.
6. Physical-device validation is mandatory: airplane mode, Romanian language pack installed/missing, microphone permission denied, and interaction with the native recorder.

## Next engineering gate

Implement the actual on-device recognition session only after a physical device confirms Romanian model availability. The session should use createOnDeviceSpeechRecognizer() exclusively, return partial/final utterances to the existing batch preview, destroy the recognizer on stop/error/lifecycle teardown, and never silently fall back to browser/cloud recognition.

## References

- Android SpeechRecognizer API: https://developer.android.com/reference/android/speech/SpeechRecognizer
- RecognitionSupport API: https://developer.android.com/reference/android/speech/RecognitionSupport
- RecognitionSupportCallback API: https://developer.android.com/reference/android/speech/RecognitionSupportCallback
