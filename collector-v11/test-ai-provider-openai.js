'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenAIResponsesProvider, normalizeInterpretation, extractOutputText } = require('./ai/provider-openai');

function proposalPayload() {
  return {
    intent: 'propose',
    confidence: 0.97,
    answerSource: 'general',
    answer: null,
    question: null,
    reason: null,
    proposal: null,
    ambiguities: [],
    clarificationQuestion: null,
    readRequest: null,
    command: {
      contractVersion: 'collector.command.v1',
      intent: 'entity.create',
      certainty: 'certain',
      requiresConfirmation: true,
      turnId: null,
      idempotencyKey: null,
      payloadJson: '{}',
      operations: [{
        operation: 'entity.create',
        target: 'plant-1',
        dataJson: JSON.stringify({ name: 'Monstera', type: 'plant' })
      }]
    }
  };
}

test('normalizeInterpretation transforms JSON string payloads into Core command objects', () => {
  const result = normalizeInterpretation(proposalPayload(), 'turn-1');
  assert.equal(result.intent, 'propose');
  assert.equal(result.command.turnId, 'turn-1');
  assert.equal(result.command.idempotencyKey, 'provider-pending');
  assert.deepEqual(result.command.operations[0].data, { name: 'Monstera', type: 'plant' });
  assert.equal(result.command.requiresConfirmation, true);
});

test('normalizeInterpretation rejects malformed operation data JSON', () => {
  const raw = proposalPayload();
  raw.command.operations[0].dataJson = '{bad';
  assert.throws(() => normalizeInterpretation(raw, 'turn-1'), /JSON invalid/);
});

test('normalizeInterpretation rejects invalid Core command contracts', () => {
  const raw = proposalPayload();
  raw.command.contractVersion = 'collector.command.v0';
  assert.throws(() => normalizeInterpretation(raw, 'turn-1'), /collector.command.v1/);
});

test('extractOutputText reads Responses API output_text and refuses model refusals', () => {
  assert.equal(extractOutputText({ output_text: 'Salut' }), 'Salut');
  assert.equal(extractOutputText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Bună' }] }] }), 'Bună');
  assert.throws(() => extractOutputText({ output: [{ type: 'message', content: [{ type: 'refusal' }] }] }), /refuzat/);
});

test('OpenAI Responses provider uses server key, strict schema and stateless requests', async () => {
  let sent = null;
  const provider = new OpenAIResponsesProvider({
    apiKey: 'server-only-secret',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      sent = { url: String(url), options, body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({ status: 'completed', output_text: JSON.stringify(proposalPayload()) }) };
    }
  });
  const result = await provider.interpret({
    input: { text: 'Adaugă Monstera', source: 'text', metadata: {} },
    context: null,
    turnId: 'turn-42'
  });
  assert.equal(result.command.turnId, 'turn-42');
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent.options.headers.Authorization, 'Bearer server-only-secret');
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.text.format.type, 'json_schema');
  assert.equal(sent.body.text.format.strict, true);
  assert.equal(sent.body.text.format.schema.additionalProperties, false);
  assert.match(sent.body.instructions, /date neîncredere/);
});

test('OpenAI Responses provider uses Core read data for the answer stage', async () => {
  let sent = null;
  const provider = new OpenAIResponsesProvider({
    apiKey: 'server-only-secret',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ status: 'completed', output_text: 'Soldul este 7.' }) };
    }
  });
  const answer = await provider.respond({
    input: { text: 'Câte exemplare?', source: 'text', metadata: {} },
    context: null,
    turnId: 'turn-1',
    readRequest: { kind: 'balances', populationId: 'p1' },
    data: [{ quantity: 7 }]
  });
  assert.equal(answer, 'Soldul este 7.');
  assert.match(sent.instructions, /exclusiv datele furnizate/);
  assert.match(sent.instructions, /conținut neîncredere/);
  assert.deepEqual(JSON.parse(sent.input[0].content).data, [{ quantity: 7 }]);
});

test('OpenAI provider fails closed when credentials or model configuration are absent', () => {
  assert.throws(() => new OpenAIResponsesProvider({ apiKey: '', model: 'x' }), /OPENAI_API_KEY/);
  assert.throws(() => new OpenAIResponsesProvider({ apiKey: 'secret', model: '' }), /OPENAI_MODEL/);
});

test('OpenAI provider does not expose raw provider error bodies', async () => {
  const provider = new OpenAIResponsesProvider({
    apiKey: 'server-only-secret',
    model: 'test-model',
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: 'private provider detail' }) })
  });
  await assert.rejects(() => provider.respond({
    input: { text: 'test' }, readRequest: { kind: 'finance' }, data: {}
  }), /HTTP 429/);
});
