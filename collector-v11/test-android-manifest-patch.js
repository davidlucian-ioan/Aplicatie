'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { access, mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;

test('Android manifest patch is idempotent and declares microphone foreground service', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'collector-android-manifest-'));
  t.after(() => rm(temp, { recursive: true, force: true }));

  const manifestPath = path.join(temp, 'AndroidManifest.xml');
  const resourcePath = path.join(temp, 'res');
  const javaPath = path.join(temp, 'java');
  await mkdir(resourcePath, { recursive: true });
  await writeFile(manifestPath, `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="Collector">
    <activity android:name=".MainActivity" />
  </application>
</manifest>
`);

  const env = {
    ...process.env,
    COLLECTOR_ANDROID_MANIFEST: manifestPath,
    COLLECTOR_ANDROID_RES: resourcePath,
    COLLECTOR_ANDROID_JAVA: javaPath,
  };
  const run = () => spawnSync(process.execPath, ['scripts/patch-android-manifest.mjs'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });

  const first = run();
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const second = run();
  assert.equal(second.status, 0, second.stderr || second.stdout);

  const manifest = await readFile(manifestPath, 'utf8');
  for (const permission of [
    'RECORD_AUDIO',
    'FOREGROUND_SERVICE',
    'FOREGROUND_SERVICE_MICROPHONE',
    'POST_NOTIFICATIONS',
    'WAKE_LOCK',
    'RECEIVE_BOOT_COMPLETED',
  ]) {
    const declaration = 'android:name="android.permission.' + permission + '"';
    assert.equal(manifest.split(declaration).length - 1, 1);
  }
  assert.equal((manifest.match(/CollectorRecordingService/g) || []).length, 1);
  assert.match(manifest, /android:foregroundServiceType="microphone"/);
  assert.match(manifest, /android:process=":collector_recorder"/);
  assert.match(manifest, /android:stopWithTask="false"/);
  assert.match(manifest, /CollectorAlarmReceiver/);
  assert.match(manifest, /CollectorAlarmBootReceiver/);
  assert.match(manifest, /android.intent.action.BOOT_COMPLETED/);
  assert.match(manifest, /android.speech.RecognitionService/);

  const icon = await readFile(path.join(resourcePath, 'drawable', 'ic_stat_collector.xml'), 'utf8');
  assert.match(icon, /<vector/);
  assert.match(icon, /fillColor="#FFFFFFFF"/);
  for (const file of ['MainActivity.java', 'CollectorRecorderPlugin.java', 'CollectorRecordingService.java', 'CollectorAlarmPlugin.java', 'CollectorAlarmReceiver.java', 'CollectorAlarmBootReceiver.java', 'CollectorSpeechPlugin.java', 'CollectorMicrophoneLock.java']) {
    await access(path.join(javaPath, file));
  }
});

test('Android manifest patch refuses an unknown manifest template', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'collector-android-manifest-invalid-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const manifestPath = path.join(temp, 'AndroidManifest.xml');
  await writeFile(manifestPath, '<manifest><application /></manifest>');
  const result = spawnSync(process.execPath, ['scripts/patch-android-manifest.mjs'], {
    cwd: root,
    env: { ...process.env, COLLECTOR_ANDROID_MANIFEST: manifestPath, COLLECTOR_ANDROID_RES: path.join(temp, 'res') },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /android namespace/);
});


test('Android speech recognition query merges into an existing queries block', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'collector-android-speech-query-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const manifestPath = path.join(temp, 'AndroidManifest.xml');
  const resourcePath = path.join(temp, 'res');
  const javaPath = path.join(temp, 'java');
  await mkdir(resourcePath, { recursive: true });
  await writeFile(manifestPath, `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <queries>
    <package android:name="com.example.existing" />
  </queries>
  <application android:label="Collector">
    <activity android:name=".MainActivity" />
  </application>
</manifest>
`);
  const result = spawnSync(process.execPath, ['scripts/patch-android-manifest.mjs'], {
    cwd: root,
    env: { ...process.env, COLLECTOR_ANDROID_MANIFEST: manifestPath, COLLECTOR_ANDROID_RES: resourcePath, COLLECTOR_ANDROID_JAVA: javaPath },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = await readFile(manifestPath, 'utf8');
  assert.equal((manifest.match(/<queries>/g) || []).length, 1);
  assert.match(manifest, /com.example.existing/);
  assert.match(manifest, /android.speech.RecognitionService/);
});
