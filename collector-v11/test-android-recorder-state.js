'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;

test('native recorder distinguishes a clean inactive state from a missing or corrupt manifest', async () => {
  const source = await readFile(path.join(root, 'native/android/CollectorRecorderPlugin.java'), 'utf8');
  assert.match(source, /File activeStateFile = new File\(recordingsDirectory\(\), "active-state\.json"\)/);
  assert.match(source, /if \(state\.length\(\) == 0\)/);
  assert.match(source, /activeStateFile\.exists\(\) \|\| isRecorderServiceRunning\(\)/);
  assert.match(source, /unknown\.put\("status", "unknown"\)/);
  assert.match(source, /unknown\.put\("status", "inactive"\)/);
  assert.match(source, /boolean knownInactive = "inactive"\.equals\(status\)[\s\S]*"complete"\.equals\(status\)[\s\S]*"interrupted"\.equals\(status\)/);
  assert.match(source, /if \(!knownInactive && \(existing\.length\(\) > 0 \|\| activeStateFile\.exists\(\)\)\)/);
  assert.match(source, /Nu pot confirma în siguranță starea reportofonului/);
  assert.match(source, /boolean serviceRunning = isRecorderServiceRunning\(\)/);
  assert.match(source, /if \(serviceRunning\) \{[\s\S]*Serviciul reportofonului încă rulează/);
});

test('web bridge rejects missing or unrecognized native recorder statuses', async () => {
  const source = await readFile(path.join(root, 'app.js'), 'utf8');
  assert.match(source, /nativeAudioStateReady=false;const state=await window\.CollectorAndroidRecorder\.getRecordingState\(\)/);
  assert.match(source, /validStatuses=\['inactive','complete','interrupted','starting','recording','paused'\]/);
  assert.match(source, /if\(!state\|\|!validStatuses\.includes\(state\.status\)\)throw new Error/);
});


test('native recorder and on-device STT share one exclusive OS microphone lock', async () => {
  const [lock, recorder, speech] = await Promise.all([
    readFile(path.join(root, 'native/android/CollectorMicrophoneLock.java'), 'utf8'),
    readFile(path.join(root, 'native/android/CollectorRecordingService.java'), 'utf8'),
    readFile(path.join(root, 'native/android/CollectorSpeechPlugin.java'), 'utf8'),
  ]);
  assert.match(lock, /FileChannel/);
  assert.match(lock, /channel\.tryLock\(\)/);
  assert.match(lock, /lock\.release\(\)/);
  assert.match(recorder, /CollectorMicrophoneLock\.tryAcquire\(this, "recorder:/);
  assert.match(recorder, /releaseMicrophoneLock\(\)/);
  assert.match(speech, /CollectorMicrophoneLock\.tryAcquire\(getContext\(\), "speech:/);
  assert.match(speech, /lock\.close\(\)/);
});
