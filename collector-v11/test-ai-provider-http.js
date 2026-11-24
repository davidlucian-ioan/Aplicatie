'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpProvider } = require('./ai/provider-http');

test('HTTP provider sends an ephemeral access token and returns structured interpretation', async () => {
  let request = null;
  const provider = new HttpProvider({
    endpoint: 'https://gateway.example.test/collector/',
    getAccessToken: async () => 'ephemeral-session-token',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options, body: JSON.parse(options.body) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ interpretation: { intent: 'clarify', question: 'În ce locație?' } }) };
    }
  });
  const result = await provider.interpret({
    input: { text: 'Mută acolo', source: 'text', metadata: {} },
    context: null,
    turnId: 'turn-1'
  });
  assert.equal(result.intent, 'clarify');
  assert.equal(request.url, 'https://gateway.example.test/collector/v1/interpret');
  assert.equal(request.options.headers.Authorization, 'Bearer ephemeral-session-token');
  assert.equal(request.body.input.text, 'Mută acolo');
  assert.equal(request.body.turnId, 'turn-1');
});

test('HTTP provider returns Core-grounded answers from the gateway', async () => {
  const provider = new HttpProvider({
    endpoint: 'https://gateway.example.test',
    getAccessToken: async () => 'token',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ answer: 'Soldul este 7.' }) })
  });
  const result = await provider.respond({
    input: { text: 'Cât am?' }, context: null, turnId: 'turn-2',
    readRequest: { kind: 'balances', populationId: 'p1' }, data: [{ quantity: 7 }]
  });
  assert.equal(result, 'Soldul este 7.');
});

test('HTTP provider requires injected auth and HTTPS outside localhost', () => {
  assert.throws(() => new HttpProvider({ endpoint: 'https://gateway.example.test' }), /getAccessToken/);
  assert.throws(() => new HttpProvider({ endpoint: 'http://gateway.example.test', getAccessToken: async () => 'token' }), /HTTPS/);
  assert.doesNotThrow(() => new HttpProvider({ endpoint: 'http://localhost:8787', getAccessToken: async () => 'token' }));
});

test('HTTP provider fails closed for expired tokens, invalid responses and oversized payloads', async () => {
  const noToken = new HttpProvider({ endpoint: 'https://gateway.example.test', getAccessToken: async () => null });
  await assert.rejects(() => noToken.interpret({ input: { text: 'test' } }), /autentificare/);

  const invalid = new HttpProvider({
    endpoint: 'https://gateway.example.test',
    getAccessToken: async () => 'token',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'not-json' })
  });
  await assert.rejects(() => invalid.interpret({ input: { text: 'test' } }), /JSON invalid/);

  const oversized = new HttpProvider({
    endpoint: 'https://gateway.example.test',
    getAccessToken: async () => 'token',
    maxResponseBytes: 10,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ interpretation: {} }) })
  });
  await assert.rejects(() => oversized.interpret({ input: { text: 'test' } }), /depășește limita/);
});
