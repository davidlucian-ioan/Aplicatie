'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;

test('Android startup diagnostics report script errors, rejected promises and touch delivery', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /addEventListener\('error'/);
  assert.match(html, /addEventListener\('unhandledrejection'/);
  assert.match(html, /addEventListener\('click'/);
  assert.match(html, /__collectorStartupDiagnostics/);
  assert.match(html, /Native Recorder/);
  assert.match(html, /APP_NOT_READY/);
});

test('app readiness is published only after the initial render completes', async () => {
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  const marker = app.lastIndexOf('window.__collectorAppReady = true;');
  const render = app.lastIndexOf('render();');
  assert.notEqual(marker, -1, 'app.js must expose a readiness marker');
  assert.ok(marker > render, 'readiness must be set after the final initial render');
});

test('Android bundle injects the native bridge before app.js', async () => {
  const build = await readFile(path.join(root, 'scripts', 'build-android-web.mjs'), 'utf8');
  assert.match(build, /android-native-entry\.js/);
  assert.match(build, /bundledHtml\.replace\(appScript, '<script src="android-native-entry\.js"><\/script>' \+ appScript\)/);
});
