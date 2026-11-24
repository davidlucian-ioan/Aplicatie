'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiGateway } = require('./server/ai-gateway');

const TOKEN = 'collector-ai-gateway-test-token-123456';

async function withGateway(options, callback) {
  const server = createAiGateway(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try { return await callback('http://127.0.0.1:' + address.port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function fakeProvider(calls = {}) {
  return {
    async interpret(args) { calls.interpret = args; return { intent: 'clarify', question: 'În ce locație?' }; },
    async respond(args) { calls.respond = args; return 'Soldul confirmat este 7.'; }
  };
}

test('gateway exposes health and requires bearer authentication for model calls', async () => {
  const calls = {};
  await withGateway({ provider: fakeProvider(calls), bearerToken: TOKEN }, async base => {
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', providerReady: true });
    const denied = await fetch(base + '/v1/interpret', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { text: 'test' }, turnId: 'turn-1' })
    });
    assert.equal(denied.status, 401);
    assert.equal(calls.interpret, undefined);
  });
});

test('gateway validates and forwards only bounded input, context and turnId', async () => {
  const calls = {};
  await withGateway({ provider: fakeProvider(calls), bearerToken: TOKEN }, async base => {
    const response = await fetch(base + '/v1/interpret', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: 'Mută acolo', source: 'text', metadata: {} },
        context: { lastTopic: 'plants' },
        turnId: 'turn-42'
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { interpretation: { intent: 'clarify', question: 'În ce locație?' } });
    assert.equal(calls.interpret.input.text, 'Mută acolo');
    assert.equal(calls.interpret.turnId, 'turn-42');
    assert.equal(calls.interpret.input.userId, undefined);
  });
});

test('gateway rejects user identifiers, invalid read scope and non-JSON bodies', async () => {
  await withGateway({ provider: fakeProvider(), bearerToken: TOKEN }, async base => {
    const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
    const identity = await fetch(base + '/v1/interpret', {
      method: 'POST', headers,
      body: JSON.stringify({ input: { text: 'test', userId: 'private-user' }, turnId: 'turn-1' })
    });
    assert.equal(identity.status, 400);
    const read = await fetch(base + '/v1/respond', {
      method: 'POST', headers,
      body: JSON.stringify({
        input: { text: 'Cât am?' }, turnId: 'turn-2',
        readRequest: { kind: 'raw-db' }, data: {}
      })
    });
    assert.equal(read.status, 400);
    const contentType = await fetch(base + '/v1/interpret', {
      method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'text/plain' }, body: '{}'
    });
    assert.equal(contentType.status, 415);
  });
});

test('gateway passes only the requested Core result into the answer provider', async () => {
  const calls = {};
  await withGateway({ provider: fakeProvider(calls), bearerToken: TOKEN }, async base => {
    const response = await fetch(base + '/v1/respond', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: 'Câte exemplare?' }, context: null, turnId: 'turn-7',
        readRequest: { kind: 'balances', populationId: 'p1' },
        data: [{ quantity: 7 }]
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: 'Soldul confirmat este 7.' });
    assert.deepEqual(calls.respond.data, [{ quantity: 7 }]);
    assert.equal(calls.respond.readRequest.kind, 'balances');
  });
});

test('gateway enforces allowed origins and a per-IP rate limit', async () => {
  await withGateway({
    provider: fakeProvider(),
    bearerToken: TOKEN,
    allowedOrigins: ['https://collector.example'],
    rateLimit: 1
  }, async base => {
    const blockedOrigin = await fetch(base + '/v1/interpret', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { text: 'test' }, turnId: 'turn-1' })
    });
    assert.equal(blockedOrigin.status, 403);
    const headers = { Origin: 'https://collector.example', Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
    const body = JSON.stringify({ input: { text: 'test' }, turnId: 'turn-2' });
    const first = await fetch(base + '/v1/interpret', { method: 'POST', headers, body });
    assert.equal(first.status, 200);
    const second = await fetch(base + '/v1/interpret', { method: 'POST', headers, body });
    assert.equal(second.status, 429);
  });
});

test('gateway rejects invalid or short server bearer secrets at construction', () => {
  assert.throws(() => createAiGateway({ provider: fakeProvider(), bearerToken: 'short' }), /minimum 24/);
  assert.throws(() => createAiGateway({ bearerToken: TOKEN }), /provider/);
});
