'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./engine');
const { CorePort } = require('./ai/core-port');

function setup(overrides = {}) {
  let state = Core.emptyState();
  let published = 0;
  const store = {
    getState: () => state,
    persistState: async next => { if (overrides.persist) return overrides.persist(next, value => { state = value; }); state = next; return true; },
    publishState: async next => { published++; if (overrides.publish) overrides.publish(next); }
  };
  let seq = 0;
  const port = new CorePort({ core: Core, store, idFactory: () => `ai-event-${++seq}`, clock: () => '2026-11-21T18:00:00.000Z' });
  return { port, store, getState: () => state, getPublished: () => published };
}
function command(operations, extra = {}) {
  return { contractVersion: 'collector.command.v1', intent: 'create', idempotencyKey: 'intent-1', operations, ...extra };
}

test('preview simulează fără să persiste sau să publice starea', async () => {
  const x = setup();
  const result = await x.port.preview(command([{ operation: 'entity.create', target: 'plant-1', data: { name: 'Monstera', type: 'plant' } }]));
  assert.equal(result.status, 'preview_ok');
  assert.equal(x.getState().entities.length, 0);
  assert.equal(x.getPublished(), 0);
});

test('execute persistă înainte de publicarea stării', async () => {
  let persisted = false;
  const x = setup({ persist: async (next, set) => { persisted = true; set(next); return true; }, publish: () => assert.equal(persisted, true) });
  const result = await x.port.execute(command([{ operation: 'entity.create', target: 'plant-1', data: { name: 'Monstera', type: 'plant' } }]));
  assert.equal(result.status, 'committed');
  assert.equal(x.getState().entities.length, 1);
  assert.equal(x.getPublished(), 1);
});

test('eșecul persistenței nu publică noua stare', async () => {
  const x = setup({ persist: async () => false });
  const result = await x.port.execute(command([{ operation: 'entity.create', target: 'plant-1', data: { name: 'Monstera', type: 'plant' } }]));
  assert.equal(result.status, 'unavailable');
  assert.equal(x.getState().entities.length, 0);
  assert.equal(x.getPublished(), 0);
});

test('operațiile din afara allowlist-ului sunt respinse', async () => {
  const x = setup();
  await assert.rejects(() => x.port.preview(command([{ operation: 'event.invalidate', data: { eventId: 'old' } }])), /nu este permisă/);
});

test('operațiile cu risc ridicat cer confirmare explicită', async () => {
  const x = setup();
  const cmd = command([{ operation: 'stock.adjust', data: { populationId: 'missing', quantity: 1 } }]);
  const blocked = await x.port.execute(cmd);
  assert.equal(blocked.status, 'rejected');
  assert.match(blocked.errors[0], /confirmarea explicită/);
});

test('idempotencyKey este aplicat de Core la retry', async () => {
  const x = setup();
  const cmd = command([{ operation: 'entity.create', target: 'plant-1', data: { name: 'Monstera', type: 'plant' } }]);
  assert.equal((await x.port.execute(cmd)).status, 'committed');
  assert.equal((await x.port.execute(cmd)).status, 'duplicate');
  assert.equal(x.getState().entities.length, 1);
});
