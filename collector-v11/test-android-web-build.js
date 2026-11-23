'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { access, readFile } = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const output = path.join(root, 'www');

test('Android web bundle is deterministic and includes every local runtime asset', async () => {
  const result = spawnSync(process.execPath, ['scripts/build-android-web.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  for (const file of [
    'index.html',
    'style.css',
    'engine.js',
    'audio-store.js',
    'app.js',
    'ai/core-port-browser.js',
  ]) {
    await access(path.join(output, file));
  }

  const html = await readFile(path.join(output, 'index.html'), 'utf8');
  assert.ok(html.includes('audio-store.js'));
  assert.match(html, /ai\\/core-port-browser\\.js/);
});
