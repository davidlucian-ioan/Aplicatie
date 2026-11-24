'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;

test('Android offline STT probe uses only the on-device recognizer and does not capture audio', async () => {
  const source = await readFile(path.join(root, 'native/android/CollectorSpeechPlugin.java'), 'utf8');
  assert.match(source, /SpeechRecognizer\.isOnDeviceRecognitionAvailable/);
  assert.match(source, /SpeechRecognizer\.createOnDeviceSpeechRecognizer/);
  assert.match(source, /checkRecognitionSupport/);
  assert.doesNotMatch(source, /SpeechRecognizer\.createSpeechRecognizer\s*\(/);
  assert.doesNotMatch(source, /\.startListening\s*\(/);
  assert.match(source, /audioCaptured", false/);
  assert.match(source, /audioUploaded", false/);
  assert.match(source, /Build\.VERSION\.SDK_INT < 31/);
  assert.match(source, /Build\.VERSION\.SDK_INT < 33/);
});

test('Android native bridge exposes the offline speech capability probe without replacing recorder APIs', async () => {
  const source = await readFile(path.join(root, 'android-native-entry.js'), 'utf8');
  assert.match(source, /registerPlugin\('CollectorSpeech'\)/);
  assert.match(source, /window\.CollectorAndroidSpeech/);
  assert.match(source, /getOfflineSpeechSupport/);
  assert.match(source, /window\.CollectorAndroidRecorder/);
  assert.match(source, /startRecording\(options = \{\}\)/);
});
