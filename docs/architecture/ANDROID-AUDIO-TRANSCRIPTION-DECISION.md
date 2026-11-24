# Collector — Android audio and transcript architecture

Updated: 2026-11-24

## Decision boundary

Collector has two different voice workflows:

1. **Live dictation / live transcript:** capture speech from the microphone and emit interim/final text immediately.
2. **Recorded audio with a durable transcript:** preserve the original audio file and later attach transcript segments to that exact file and its timeline.

These are not the same pipeline. The Android platform `SpeechRecognizer` can serve the first workflow through `createOnDeviceSpeechRecognizer`, but it does not expose the raw PCM stream to the app. It therefore cannot, by itself, produce a transcript that is cryptographically or temporally tied to the MediaRecorder file.

The current PR #53 implements workflow 1. Transcript metadata explicitly uses `audioRecordingId: null` and `audioLinkStatus: not-linked`. Do not infer a file link from similar wall-clock timestamps.

## Recommended architecture for workflow 2

Use one canonical audio asset and an offline ASR engine that accepts audio input:

```text
MediaRecorder audio file
  -> MediaExtractor / MediaCodec decode
  -> mono PCM, 16 kHz
  -> Voice Activity Detection / chunking
  -> local ASR engine
  -> word/segment timestamps
  -> TranscriptSession(audioRecordingId = audio.id)
```

Requirements:
- The audio file remains the source of truth; transcription is a derived artifact.
- Keep the original audio unchanged.
- Store sample-rate, channel count, codec, duration, decoder version and model version.
- Every transcript segment references `audioRecordingId`, `startMs`, `endMs`, text and confidence.
- Preserve raw model output and any normalized text separately.
- Transcription failure must not delete or mutate the audio recording.
- Transcription can be retried with another model without recording the microphone again.
- The decoder and ASR run locally; no audio upload or cloud fallback.

## Candidate engines and model evidence

### Android platform SpeechRecognizer

- `createOnDeviceSpeechRecognizer` is a dedicated on-device factory (Android API 31+); the generic `createSpeechRecognizer` factory is a different API.
- Android exposes optional `RecognitionPart` word/character timing and confidence on API 34+ when requested and supported by the recognizer service.
- Useful for low-friction live dictation, but it returns recognition results, not the original PCM stream. It is not the correct engine for attaching transcript output to the saved MediaRecorder file.

References:
- https://developer.android.com/reference/android/speech/SpeechRecognizer
- https://developer.android.com/reference/android/speech/RecognitionPart
- https://developer.android.com/reference/android/speech/RecognizerIntent

### Google ML Kit GenAI Speech Recognition API

- The API documents streaming microphone input and audio-file input, plus word timings for supported streaming sources.
- It is currently alpha.
- The published Basic and Advanced locale tables do not list Romanian (`ro-RO`). Advanced mode also has a limited supported-device list.
- Do not select it for Collector's Romanian workflow unless Google adds explicit Romanian support and the target devices are verified.

Reference:
- https://developers.google.com/ml-kit/genai/speech-recognition/android

### Vosk

- Vosk has an Android runtime and small mobile models.
- The official model catalogue does not currently list a Romanian model.
- Do not select it for the Romanian path without a verified third-party Romanian model, license and benchmark.

References:
- https://alphacephei.com/vosk/android
- https://alphacephei.com/vosk/models

### sherpa-onnx with a Romanian Whisper model

- sherpa-onnx supports Android and both streaming and non-streaming ASR; it can be used as the runtime layer for a local audio-file pipeline.
- `mikr/whisper-small-ro-cv11` is an Apache-2.0 Romanian Whisper Small fine-tune; its model card reports WER 17.57 on Mozilla Common Voice 11.0 Romanian. The repository's model files total about 969 MB, with the safetensors weights about 484 MB before quantization.
- A community conversion catalogue records a Q8 GGML conversion of this Romanian model, but conversion provenance, binary compatibility and license notices must be checked before shipping it.
- `eek/whisper-turbo-ro-en` is a Romanian/English Whisper Large-v3-Turbo fine-tune, MIT-licensed, 809M parameters, with a self-reported average WER of 7.2 across nine public Romanian test sets. It is a higher-accuracy candidate but likely a heavier mobile workload; benchmark memory, latency and thermal behavior on target devices before selection.

References:
- https://github.com/k2-fsa/sherpa-onnx
- https://huggingface.co/mikr/whisper-small-ro-cv11
- https://huggingface.co/eek/whisper-turbo-ro-en
- https://huggingface.co/AladdinChen/trans-local-speech-models

## Proposed implementation sequence

1. Keep PR #53's platform SpeechRecognizer for live dictation while validating real-device availability and Romanian quality.
2. Prototype the file pipeline using sherpa-onnx and the quantized Whisper Small Romanian model.
3. Build a fixed Romanian evaluation set: normal speech, plant/shrimp species names, quantities, units, tank identifiers (B1–B5), Romanian diacritics, mixed Romanian/English product names, background noise and pauses.
4. Measure WER/CER, entity/quantity extraction accuracy, real-time factor, cold-start latency, peak RAM, APK/model download size, thermal throttling and battery.
5. Compare Whisper Small Q8 with the Whisper Turbo Romanian/English candidate. Select only after measured target-device results.
6. Add a transcript-to-audio foreign key only when the file pipeline produces offsets against the decoded audio timeline.
7. Preserve the current live STT path as a fallback for live text entry only; never pretend it is linked to a recording.

## Current status

- Live Android on-device Romanian STT: implemented in PR #53, CI/physical-device validation pending.
- Local transcript session persistence: implemented, separate from audio records.
- Transcript-to-audio association: not implemented.
- File-based offline ASR engine: research and benchmark selection pending.
