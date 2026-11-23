import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
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
  assert.match(html, /audio-store\.js/);
  assert.match(html, /ai\/core-port-browser\.js/);
});
