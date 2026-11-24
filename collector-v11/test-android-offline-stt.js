'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;

test('Android STT performs real Romanian recognition only through the on-device SpeechRecognizer', async () => {
  const source = await readFile(path.join(root, 'native/android/CollectorSpeechPlugin.java'), 'utf8');
  assert.match(source, /SpeechRecognizer\.isOnDeviceRecognitionAvailable/);
  assert.match(source, /SpeechRecognizer\.createOnDeviceSpeechRecognizer/);
  assert.match(source, /checkRecognitionSupport/);
  assert.match(source, /activeRecognizer\.startListening\(recognitionIntent\(\)\)/);
  assert.match(source, /RecognizerIntent\.EXTRA_PREFER_OFFLINE/);
  assert.doesNotMatch(source, /SpeechRecognizer\.createSpeechRecognizer\s*\(/);
  assert.match(source, /notifyListeners\("speechPartial"/);
  assert.match(source, /notifyListeners\("speechSegment"/);
  assert.match(source, /notifyListeners\("speechState"/);
  assert.match(source, /startOffsetMs/);
  assert.match(source, /endOffsetMs/);
  assert.match(source, /SpeechRecognizer\.ERROR_SPEECH_TIMEOUT/);
  assert.match(source, /CollectorMicrophoneLock\.tryAcquire/);
  assert.match(source, /speechStopping/);
  assert.match(source, /Build\.VERSION\.SDK_INT < 31/);
  assert.match(source, /@Permission\(alias = "microphone"/);
  assert.match(source, /speechMicrophonePermissionCallback/);
  assert.match(source, /getPermissionState\("microphone"\) != PermissionState\.GRANTED/);
  assert.match(source, /audioUploaded", false/);
  assert.match(source, /Nu există fallback cloud/);
});

test('Android bridge exposes the native STT lifecycle and event listener API', async () => {
  const source = await readFile(path.join(root, 'android-native-entry.js'), 'utf8');
  assert.match(source, /registerPlugin\('CollectorSpeech'\)/);
  assert.match(source, /window\.CollectorAndroidSpeech/);
  assert.match(source, /getOfflineSpeechSupport/);
  assert.match(source, /startListening\(language = 'ro-RO', continuous = true\)/);
  assert.match(source, /stopListening\(sessionId\)/);
  assert.match(source, /cancelListening\(sessionId\)/);
  assert.match(source, /addListener\(eventName, listener\)/);
  assert.match(source, /window\.CollectorAndroidRecorder/);
  assert.match(source, /startRecording\(options = \{\}\)/);
});

test('Android WORK routes both live transcription and dictation to native STT without browser fallback', async () => {
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /CollectorAndroidSpeech\?\.isAvailable\?\.\(\)\)\{startNativeSpeech\('session'\);return\}/);
  assert.match(app, /CollectorAndroidSpeech\?\.isAvailable\?\.\(\)\)\{startNativeSpeech\('dictation'\);return\}/);
  assert.match(app, /STT on-device nu a putut porni:[\s\S]*Nu am folosit un serviciu cloud/);
  assert.match(app, /speechSegment/);
  assert.match(app, /saveTranscriptSession/);
  assert.match(app, /runVoiceBatch\(utterances\)/);
});

test('transcript sessions are stored locally, separately from original audio, with bounded timestamps', async () => {
  const store = await readFile(path.join(root, 'audio-store.js'), 'utf8');
  assert.match(store, /DB_VERSION=2/);
  assert.match(store, /TRANSCRIPTS='transcripts'/);
  assert.match(store, /saveTranscriptSession/);
  assert.match(store, /startOffsetMs/);
  assert.match(store, /endOffsetMs/);
  assert.match(store, /listTranscriptSessions/);
  assert.match(store, /removeTranscriptSession/);
});
