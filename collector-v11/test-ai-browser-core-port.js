'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./engine');
const { BrowserCorePort } = require('./ai/core-port-browser');

function setup({ failPersist = false } = {}) {
  let state = Core.emptyState();
  let persisted = null;
  let published = 0;
  const port = new BrowserCorePort({
    core: Core,
    store: {
      getState: () => state,
      persistState: async next => { if (failPersist) return false; persisted = structuredClone(next); return true; },
      publishState: async next => { state = next; published++; }
    }
  });
  return { port, get state(){ return state; }, get persisted(){ return persisted; }, get published(){ return published; } };
}
function cmd() { return { contractVersion:'collector.command.v1', intent:'entity.create', idempotencyKey:'browser-port-1', payload:{name:'Test plant'}, operations:[{operation:'entity.create',target:'plant-1',data:{name:'Test plant',type:'plant'}}] }; }

test('Browser Core Port preview nu persistă și nu publică', async () => {
  const x=setup(); const result=await x.port.preview(cmd());
  assert.equal(result.status,'preview_ok'); assert.equal(x.state.entities.length,0); assert.equal(x.persisted,null); assert.equal(x.published,0);
});
test('Browser Core Port persistă înainte de publicare', async () => {
  const x=setup(); const result=await x.port.execute(cmd());
  assert.equal(result.status,'committed'); assert.equal(x.persisted.entities.length,1); assert.equal(x.state.entities.length,1); assert.equal(x.published,1);
});
test('Browser Core Port nu publică dacă localStorage eșuează', async () => {
  const x=setup({failPersist:true}); const result=await x.port.execute(cmd());
  assert.equal(result.status,'unavailable'); assert.equal(x.state.entities.length,0); assert.equal(x.published,0);
});
test('Browser Core Port cere confirmare pentru modificarea stocului', async () => {
  const x=setup(); const command={...cmd(),operations:[{operation:'stock.change',data:{populationId:'missing',action:'sell',quantity:1}}]};
  const result=await x.port.execute(command); assert.equal(result.status,'rejected'); assert.equal(x.state.events.length,0);
});

test('Browser Core Port respectă requiresConfirmation pentru orice comandă', async () => {
  const x=setup(); const command={...cmd(),requiresConfirmation:true};
  const rejected=await x.port.execute(command);
  assert.equal(rejected.status,'rejected'); assert.equal(x.state.events.length,0); assert.equal(x.published,0);
  const accepted=await x.port.execute(command,{confirmed:true});
  assert.equal(accepted.status,'committed'); assert.equal(x.state.entities.length,1); assert.equal(x.published,1);
});


test('Browser Core Port are aceeași allowlist și politică de risc ca portul Node', async () => {
  const node = require('./ai/core-port');
  const browser = require('./ai/core-port-browser');
  assert.deepEqual([...browser.ALLOWED].sort(), [...node.DEFAULT_ALLOWED_OPERATIONS].sort());
  assert.deepEqual([...browser.HIGH_RISK].sort(), [...node.DEFAULT_HIGH_RISK_OPERATIONS].sort());
});

test('Browser Core Port convertește operațiile invalide în rejected și nu persistă', async () => {
  const x = setup();
  const result = await x.port.execute({ ...cmd(), operations: [{ operation: 'stock.change', data: { populationId: 'missing', action: 'sell', quantity: 1 } }] }, { confirmed: true });
  assert.equal(result.status, 'rejected');
  assert.equal(x.state.events.length, 0);
  assert.equal(x.published, 0);
});

test('Browser Core Port blochează operațiile concurente în timpul persistării', async () => {
  let release;
  let state = Core.emptyState();
  const port = new BrowserCorePort({
    core: Core,
    store: {
      getState: () => state,
      persistState: async next => { await new Promise(resolve => { release = resolve; }); state = next; return true; },
      publishState: async next => { state = next; }
    }
  });
  const first = port.execute(cmd());
  await new Promise(resolve => setImmediate(resolve));
  const second = await port.execute({ ...cmd(), idempotencyKey: 'browser-port-2' });
  assert.equal(second.status, 'conflict');
  release();
  assert.equal((await first).status, 'committed');
  assert.equal(state.entities.length, 1);
});

test('Browser Core Port nu lasă publicarea eșuată să mascheze persistența confirmată', async () => {
  let state = Core.emptyState();
  const port = new BrowserCorePort({
    core: Core,
    store: {
      getState: () => state,
      persistState: async next => { state = next; return true; },
      publishState: async () => { throw new Error('render failed'); }
    }
  });
  const result = await port.execute(cmd());
  assert.equal(result.status, 'committed');
  assert.match(result.warnings[0], /interfața nu a putut fi actualizată/);
  assert.equal(state.entities.length, 1);
});
