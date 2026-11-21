'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTRACT_VERSION, ContextManager, MockProvider, CoreAdapter, Orchestrator
} = require('./ai');

const command = (key = 'intent-1') => ({
  contractVersion: CONTRACT_VERSION,
  intent: 'stock.transfer',
  source: 'user',
  certainty: 'certain',
  operations: [{ operation: 'stock.transfer', quantity: 2 }],
  idempotencyKey: key
});

function makeCore(overrides = {}) {
  const calls = { read: 0, preview: 0, execute: 0 };
  const port = {
    async read() { calls.read++; return { items: [] }; },
    async preview() { calls.preview++; return { status: 'preview_ok' }; },
    async execute() { calls.execute++; return { status: 'committed', eventId: 'evt-1' }; },
    ...overrides
  };
  return { adapter: new CoreAdapter(port), calls };
}

test('o mesaj clar devine propunere; fără execute nu scrie în Core', async () => {
  const core = makeCore();
  const provider = new MockProvider([{ intent: 'propose', confidence: 0.99, command: command() }]);
  const app = new Orchestrator({ provider, contextManager: new ContextManager(), coreAdapter: core.adapter, idFactory: () => 't1' });
  const result = await app.handle({ text: 'Mută două', userId: 'u1' });
  assert.equal(result.action, 'proposal');
  assert.equal(core.calls.execute, 0);
});

test('o ambiguitate produce clarificare și nu apelează Core', async () => {
  const core = makeCore();
  const provider = new MockProvider([{ intent: 'propose', ambiguities: ['location'], clarificationQuestion: 'În B1 sau B2?', command: command() }]);
  const app = new Orchestrator({ provider, contextManager: new ContextManager(), coreAdapter: core.adapter });
  const result = await app.handle({ text: 'Mută acolo', userId: 'u1' }, { execute: true });
  assert.equal(result.action, 'clarify');
  assert.equal(core.calls.execute, 0);
});

test('execuția raportează succes numai după confirmarea Core', async () => {
  const core = makeCore();
  const provider = new MockProvider([{ intent: 'propose', command: command() }]);
  const app = new Orchestrator({ provider, contextManager: new ContextManager(), coreAdapter: core.adapter });
  const result = await app.handle({ text: 'Înregistrează transferul', userId: 'u1' }, { execute: true });
  assert.equal(result.action, 'executed');
  assert.equal(core.calls.execute, 1);
});

test('un rezultat rejected nu este prezentat drept succes', async () => {
  const core = makeCore({ async execute() { return { status: 'rejected', errors: ['sold insuficient'] }; } });
  const provider = new MockProvider([{ intent: 'propose', command: command() }]);
  const app = new Orchestrator({ provider, contextManager: new ContextManager(), coreAdapter: core.adapter });
  const result = await app.handle({ text: 'Transferă', userId: 'u1' }, { execute: true });
  assert.equal(result.action, 'execution_failed');
});

test('preview folosește Core fără commit', async () => {
  const core = makeCore();
  const provider = new MockProvider([{ intent: 'propose', command: command() }]);
  const app = new Orchestrator({ provider, contextManager: new ContextManager(), coreAdapter: core.adapter });
  const result = await app.handle({ text: 'Simulează transferul', userId: 'u1' }, { preview: true });
  assert.equal(result.action, 'preview');
  assert.equal(core.calls.preview, 1);
  assert.equal(core.calls.execute, 0);
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
  const provider = new MockProvider([{ intent: 'propose', command: bad }]);
  const app = new Orchestrator({ provider, contextManager: new ContextManager(), coreAdapter: core.adapter });
  await assert.rejects(() => app.handle({ text: 'Transferă', userId: 'u1' }), /idempotencyKey/);
  assert.equal(core.calls.execute, 0);
});
