'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;

test('Android manifest patch is idempotent and declares microphone foreground service', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'collector-android-manifest-'));
  t.after(() => rm(temp, { recursive: true, force: true }));

  const manifestPath = path.join(temp, 'AndroidManifest.xml');
  const resourcePath = path.join(temp, 'res');
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
  ]) {
    assert.equal((manifest.match(new RegExp(permission, 'g')) || []).length, 1);
  }
  assert.equal((manifest.match(/AndroidForegroundService/g) || []).length, 1);
  assert.match(manifest, /android:foregroundServiceType="microphone"/);
  assert.match(manifest, /android:stopWithTask="false"/);

  const icon = await readFile(path.join(resourcePath, 'drawable', 'ic_stat_collector.xml'), 'utf8');
  assert.match(icon, /<vector/);
  assert.match(icon, /fillColor="#FFFFFFFF"/);
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
