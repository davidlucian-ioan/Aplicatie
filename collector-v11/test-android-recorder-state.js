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
});

test('web bridge rejects missing or unrecognized native recorder statuses', async () => {
  const source = await readFile(path.join(root, 'app.js'), 'utf8');
  assert.match(source, /nativeAudioStateReady=false;const state=await window\.CollectorAndroidRecorder\.getRecordingState\(\)/);
  assert.match(source, /validStatuses=\['inactive','complete','interrupted','starting','recording','paused'\]/);
  assert.match(source, /if\(!state\|\|!validStatuses\.includes\(state\.status\)\)throw new Error/);
});
