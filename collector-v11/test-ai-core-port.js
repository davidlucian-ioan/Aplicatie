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


test('Core Port convertește erorile de validare Core în rejected fără persistare', async () => {
  const x = setup();
  const result = await x.port.execute(command([{ operation: 'stock.adjust', data: { populationId: 'missing', quantity: 1 } }]), { confirmed: true });
  assert.equal(result.status, 'rejected');
  assert.equal(x.getState().events.length, 0);
  assert.equal(x.getPublished(), 0);
});

test('Core Port raportează committed dacă publicarea UI eșuează după persistența durabilă', async () => {
  const x = setup({ publish: () => { throw new Error('render failed'); } });
  const result = await x.port.execute(command([{ operation: 'entity.create', target: 'plant-1', data: { name: 'Monstera', type: 'plant' } }]));
  assert.equal(result.status, 'committed');
  assert.match(result.warnings[0], /interfața nu a putut fi actualizată/);
  assert.equal(x.getState().entities.length, 1);
});

test('Core Port blochează execuțiile concurente care ar putea suprascrie snapshot-uri', async () => {
  let release;
  const x = setup({ persist: async (next, set) => {
    await new Promise(resolve => { release = resolve; });
    set(next);
    return true;
  } });
  const first = x.port.execute(command([{ operation: 'entity.create', target: 'plant-1', data: { name: 'A', type: 'plant' } }]));
  await new Promise(resolve => setImmediate(resolve));
  const second = await x.port.execute({ ...command([{ operation: 'entity.create', target: 'plant-2', data: { name: 'B', type: 'plant' } }]), idempotencyKey: 'intent-2' });
  assert.equal(second.status, 'conflict');
  release();
  assert.equal((await first).status, 'committed');
  assert.equal(x.getState().entities.length, 1);
});

test('Core Port respinge forma incorectă a data și operațiile nepermise înainte de Core', async () => {
  const x = setup();
  await assert.rejects(() => x.port.preview(command([{ operation: 'entity.create', data: [] }])), /Datele operației/);
  await assert.rejects(() => x.port.preview(command([{ operation: 'event.invalidate', data: { eventId: 'old' } }])), /nu este permisă/);
});


test('Core Read Port caută entități cu rezultate minimizate și detalii doar după ID', async () => {
  const x = setup();
  const cmd = command([
    { operation: 'entity.create', target: 'plant-1', data: { name: 'Monstera', type: 'plant' } },
    { operation: 'attribute.set', target: 'plant-1', data: { name: 'pH', value: 5.8 } }
  ]);
  assert.equal((await x.port.execute(cmd)).status, 'committed');
  const matches = await x.port.read({ kind: 'entities', name: 'Monstera' });
  assert.deepEqual(matches, [{ id: 'plant-1', name: 'Monstera', type: 'plant', status: 'active' }]);
  const detail = await x.port.read({ kind: 'entityAttributes', id: 'plant-1', attributeNames: ['pH'] });
  assert.equal(detail.attributes.pH, 5.8);
  assert.equal(detail.attributeHistory, undefined);
  await assert.rejects(() => x.port.read({ kind: 'entities' }), /nu este permisă citirea întregului registru/);
});
