'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;

test('Android capability probe remains non-capturing and checks only on-device support', async () => {
  const source = await readFile(path.join(root, 'native/android/CollectorSpeechPlugin.java'), 'utf8');
  const probe = source.slice(source.indexOf('public void getOfflineSupport'), source.indexOf('public void startListening'));
  assert.match(probe, /SpeechRecognizer\.isOnDeviceRecognitionAvailable/);
  assert.match(probe, /SpeechRecognizer\.createOnDeviceSpeechRecognizer/);
  assert.match(probe, /checkRecognitionSupport/);
  assert.doesNotMatch(probe, /\.startListening\s*\(/);
  assert.match(probe, /audioCaptured", false/);
  assert.match(probe, /audioUploaded", false/);
  assert.match(source, /Build\.VERSION\.SDK_INT < 31/);
  assert.match(source, /Build\.VERSION\.SDK_INT < 33/);
  assert.match(source, /@Permission\(alias = "microphone"/);
});

test('actual Android STT uses only createOnDeviceSpeechRecognizer and emits timestamped segments', async () => {
  const source = await readFile(path.join(root, 'native/android/CollectorSpeechPlugin.java'), 'utf8');
  assert.match(source, /SpeechRecognizer\.createOnDeviceSpeechRecognizer/);
  assert.doesNotMatch(source, /SpeechRecognizer\.createSpeechRecognizer\s*\(/);
  assert.match(source, /activeRecognizer\.startListening\(speechIntent\(speechLanguage\)\)/);
  assert.match(source, /notifyListeners\("speechPartial"/);
  assert.match(source, /notifyListeners\("speechResult"/);
  assert.match(source, /segmentStartAtMs/);
  assert.match(source, /segmentEndAtMs/);
  assert.match(source, /segmentStartElapsedMs/);
  assert.match(source, /segmentEndElapsedMs/);
  assert.match(source, /audioUploaded", false/);
});

test('Android STT and recorder share a fail-closed microphone arbiter', async () => {
  const speech = await readFile(path.join(root, 'native/android/CollectorSpeechPlugin.java'), 'utf8');
  const recorder = await readFile(path.join(root, 'native/android/CollectorRecorderPlugin.java'), 'utf8');
  const service = await readFile(path.join(root, 'native/android/CollectorRecordingService.java'), 'utf8');
  const arbiter = await readFile(path.join(root, 'native/android/CollectorMicrophoneArbiter.java'), 'utf8');
  assert.match(speech, /CollectorMicrophoneArbiter\.isRecorderBusy\(getContext\(\)\)/);
  assert.match(speech, /CollectorMicrophoneArbiter\.tryAcquire\("speech"\)/);
  assert.match(speech, /CollectorMicrophoneArbiter\.release\("speech"\)/);
  assert.match(recorder, /CollectorMicrophoneArbiter\.tryAcquire\("recorder"\)/);
  assert.match(service, /CollectorMicrophoneArbiter\.release\("recorder"\)/);
  assert.match(arbiter, /return true;[\s\S]*catch \(Exception ignored\)[\s\S]*return true/);
});

test('Android native bridge exposes the on-device speech session methods', async () => {
  const source = await readFile(path.join(root, 'android-native-entry.js'), 'utf8');
  assert.match(source, /registerPlugin\('CollectorSpeech'\)/);
  assert.match(source, /window\.CollectorAndroidSpeech/);
  assert.match(source, /getOfflineSpeechSupport/);
  assert.match(source, /startListening/);
  assert.match(source, /stopListening/);
  assert.match(source, /cancelListening/);
  assert.match(source, /addListener/);
  assert.match(source, /window\.CollectorAndroidRecorder/);
  assert.match(source, /startRecording\(options = \{\}\)/);
});
