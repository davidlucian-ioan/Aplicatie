'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function unusedPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

test('serverul local expune doar interfața și protejează endpoint-urile AI', async t => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port), COLLECTOR_HOST: '127.0.0.1', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  t.after(() => { if (!child.killed) child.kill(); });

  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(base + '/api/ai/status');
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `serverul nu a pornit. Output: ${output}`);

  const status = await fetch(base + '/api/ai/status').then(response => response.json());
  assert.equal(status.provider, 'openai');
  assert.equal(status.configured, false);

  const app = await fetch(base + '/index-server.html');
  assert.equal(app.status, 200);
  assert.equal(app.headers.get('content-security-policy')?.includes("connect-src 'self'"), true);
  assert.equal(app.headers.get('x-frame-options'), 'DENY');

  for (const route of ['/.env', '/.env.example', '/.git/config', '/server.js', '/package.json', '/ai/provider-openai.js', '/ai/context-sanitizer.js']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, `Ruta privată expusă: ${route}`);
  }

  const rejectedOrigin = await fetch(base + '/api/ai/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ text: 'test', context: {} })
  });
  assert.equal(rejectedOrigin.status, 403);

  const noKey = await fetch(base + '/api/ai/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ text: 'Notează o observație', context: {} })
  });
  assert.equal(noKey.status, 503);
  const error = await noKey.json();
  assert.match(error.error, /OPENAI_API_KEY/);

  const badAudioOrigin = await fetch(base + '/api/ai/transcribe', {
    method: 'POST', headers: { 'Content-Type': 'audio/webm', Origin: 'https://attacker.example' }, body: new Blob(['audio'])
  });
  assert.equal(badAudioOrigin.status, 403);
  const unsupportedAudio = await fetch(base + '/api/ai/transcribe', {
    method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: base }, body: 'not audio'
  });
  assert.equal(unsupportedAudio.status, 415);
  const transcribeNoKey = await fetch(base + '/api/ai/transcribe', {
    method: 'POST', headers: { 'Content-Type': 'audio/webm', Origin: base }, body: new Blob(['audio'])
  });
  assert.equal(transcribeNoKey.status, 503);
  assert.match((await transcribeNoKey.json()).error, /OPENAI_API_KEY/);

});
