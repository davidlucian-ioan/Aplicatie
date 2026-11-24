'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTRACT_VERSION, ContextManager, MockProvider, CoreAdapter, Orchestrator
} = require('./ai');

const command = (key = 'model-controlled-key') => ({
  contractVersion: CONTRACT_VERSION,
  intent: 'stock.transfer',
  source: 'user',
  certainty: 'certain',
  operations: [{ operation: 'stock.transfer', data: { quantity: 2 } }],
  idempotencyKey: key
});

function makeCore(overrides = {}) {
  const calls = { read: 0, preview: 0, execute: 0, lastCommand: null, lastOptions: null };
  const port = {
    async read() { calls.read++; return { items: [] }; },
    async preview(value) { calls.preview++; calls.lastCommand = structuredClone(value); return { status: 'preview_ok' }; },
    async execute(value, options) {
      calls.execute++; calls.lastCommand = structuredClone(value); calls.lastOptions = options;
      return { status: 'committed', eventId: 'evt-1' };
    },
    ...overrides
  };
  return { adapter: new CoreAdapter(port), calls };
}

function makeApp({ responses, core = makeCore(), clock } = {}) {
  const provider = new MockProvider(responses || []);
  const contextManager = new ContextManager(clock ? { clock } : {});
  const app = new Orchestrator({
    provider, contextManager, coreAdapter: core.adapter,
    idFactory: (() => { let n = 0; return () => 'turn-' + (++n); })()
  });
  return { app, provider, contextManager, core };
}

test('o mesaj clar devine propunere; nu scrie fără confirmare explicită', async () => {
  const { app, core } = makeApp({ responses: [{ intent: 'propose', confidence: 0.99, command: command() }] });
  const result = await app.handle({ text: 'Mută două', userId: 'u1' }, { execute: true });
  assert.equal(result.action, 'proposal');
  assert.equal(core.calls.execute, 0);
});

test('o ambiguitate produce clarificare și nu apelează Core', async () => {
  const { app, core } = makeApp({ responses: [{
    intent: 'propose', ambiguities: ['location'], clarificationQuestion: 'În B1 sau B2?', command: command()
  }] });
  const result = await app.handle({ text: 'Mută acolo', userId: 'u1' });
  assert.equal(result.action, 'clarify');
  assert.equal(core.calls.execute, 0);
});

test('confirmarea execută exact comanda în așteptare fără o nouă interpretare', async () => {
  const { app, provider, core } = makeApp({ responses: [{ intent: 'propose', command: command() }] });
  const proposal = await app.handle({ text: 'Înregistrează transferul', userId: 'u1', requestId: 'request-123' });
  assert.equal(proposal.action, 'proposal');
  assert.equal(proposal.command.idempotencyKey, 'ai-turn:request-123');
  assert.equal(proposal.command.turnId, proposal.turnId);
  const result = await app.confirm({ userId: 'u1', turnId: proposal.turnId });
  assert.equal(result.action, 'executed');
  assert.equal(provider.calls, 1);
  assert.equal(core.calls.execute, 1);
  assert.deepEqual(core.calls.lastOptions, { confirmed: true });
  assert.equal(core.calls.lastCommand.idempotencyKey, 'ai-turn:request-123');
});

test('o confirmare expirată sau cu turnId greșit nu execută nimic', async () => {
  const { app, core } = makeApp({ responses: [{ intent: 'propose', command: command() }] });
  const proposal = await app.handle({ text: 'Transferă', userId: 'u1' });
  const result = await app.confirm({ userId: 'u1', turnId: 'another-turn' });
  assert.equal(result.action, 'confirmation_expired');
  assert.equal(core.calls.execute, 0);
  assert.equal(proposal.turnId, 'turn-1');
});

test('anularea elimină propunerea fără să apeleze Core', async () => {
  const { app, core } = makeApp({ responses: [{ intent: 'propose', command: command() }] });
  const proposal = await app.handle({ text: 'Transferă', userId: 'u1' });
  assert.equal(app.cancel({ userId: 'u1', turnId: proposal.turnId }), true);
  assert.equal((await app.confirm({ userId: 'u1', turnId: proposal.turnId })).action, 'confirmation_expired');
  assert.equal(core.calls.execute, 0);
});

test('un rezultat rejected nu este prezentat drept succes', async () => {
  const core = makeCore({ async execute() { return { status: 'rejected', errors: ['sold insuficient'] }; } });
  const { app } = makeApp({ core, responses: [{ intent: 'propose', command: command() }] });
  const proposal = await app.handle({ text: 'Transferă', userId: 'u1' });
  const result = await app.confirm({ userId: 'u1', turnId: proposal.turnId });
  assert.equal(result.action, 'execution_failed');
  assert.equal(result.result.status, 'rejected');
});

test('preview folosește Core fără commit și păstrează propunerea pentru confirmare', async () => {
  const { app, core } = makeApp({ responses: [{ intent: 'propose', command: command() }] });
  const result = await app.handle({ text: 'Simulează transferul', userId: 'u1' }, { preview: true });
  assert.equal(result.action, 'preview');
  assert.equal(core.calls.preview, 1);
  assert.equal(core.calls.execute, 0);
  const confirmed = await app.confirm({ userId: 'u1', turnId: result.turnId });
  assert.equal(confirmed.action, 'executed');
});

test('contextul expiră după 30 de minute de inactivitate', () => {
  let now = 1000;
  const context = new ContextManager({ clock: () => now });
  context.set({ topic: 'plants' }, 'u1');
  now += 30 * 60 * 1000;
  assert.equal(context.get('u1'), null);
});

test('contractul respinge comenzi fără idempotency key', async () => {
  const core = makeCore();
  const bad = command(); delete bad.idempotencyKey;
  const { app } = makeApp({ core, responses: [{ intent: 'propose', command: bad }] });
  await assert.rejects(() => app.handle({ text: 'Transferă', userId: 'u1' }), /idempotencyKey/);
  assert.equal(core.calls.execute, 0);
});


test('răspunsurile despre datele operaționale sunt compuse numai după citirea Core', async () => {
  const core = makeCore({ async read(request) { return { balances: [{ quantity: 7 }], request }; } });
  const { app, provider } = makeApp({ core, responses: [{
    intent: 'answer', answer: 'Am 100 de exemplare.', readRequest: { kind: 'balances', populationId: 'p1' }
  }] });
  let received = null;
  provider.respond = async args => { received = args; return 'Soldul validat este 7.'; };
  const result = await app.handle({ text: 'Câte exemplare am?', userId: 'u1' });
  assert.equal(core.calls.read, 1);
  assert.deepEqual(received.data.balances, [{ quantity: 7 }]);
  assert.equal(result.answer, 'Soldul validat este 7.');
});

test('fără provider.respond, AI nu prezintă răspunsul pre-retrieval drept fapt Core', async () => {
  const core = makeCore({ async read() { return { total: 12 }; } });
  const { app } = makeApp({ core, responses: [{
    intent: 'answer', answer: 'Modelul presupune 999.', readRequest: { kind: 'finance' }
  }] });
  const result = await app.handle({ text: 'Care este totalul?', userId: 'u1' });
  assert.equal(result.answer, null);
  assert.deepEqual(result.data, { total: 12 });
});


test('CoreAdapter nu permite read requests în afara scope-ului declarat', async () => {
  const core = makeCore();
  await assert.rejects(() => core.adapter.read({ kind: 'raw-db' }), /citire AI/);
  assert.equal(core.calls.read, 0);
});

test('CoreAdapter clonează rezultatul read și respinge valori neclonabile', async () => {
  const core = makeCore({ async read() { return { safe: true }; } });
  const result = await core.adapter.read({ kind: 'finance' });
  assert.deepEqual(result, { safe: true });
  const broken = makeCore({ async read() { return () => 'unsafe'; } });
  await assert.rejects(() => broken.adapter.read({ kind: 'finance' }));
});
