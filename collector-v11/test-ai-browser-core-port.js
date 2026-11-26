'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./engine');
const { BrowserCorePort } = require('./ai/core-port-browser');

function setup({ failPersist = false, failReadback = false, corruptReadback = false, persistThenThrow = false, persistThenFalse = false } = {}) {
  let state = Core.emptyState();
  let persisted = null;
  let published = 0;
  let failNextReadback = false;
  let verificationFailure = null;
  const port = new BrowserCorePort({
    core: Core,
    store: {
      getState: () => state,
      persistState: async next => { if (failPersist) return false; persisted = structuredClone(next); if (persistThenThrow) throw new Error('commit response lost'); if (persistThenFalse) return false; return true; },
      readPersistedState: async () => { if (failReadback || failNextReadback) { failNextReadback = false; throw new Error('readback unavailable'); } return corruptReadback ? Core.emptyState() : structuredClone(persisted || Core.emptyState()); },
      onVerificationFailure: error => { verificationFailure = String(error?.message || error); },
      publishState: async next => { state = next; published++; }
    }
  });
  return { port, get state(){ return state; }, get persisted(){ return persisted; }, get published(){ return published; }, get verificationFailure(){ return verificationFailure; }, failNextReadback(){ failNextReadback=true; } };
}
function cmd(name='Test plant') { return { contractVersion:'collector.command.v1', intent:'entity.create', idempotencyKey:'browser-port-1', payload:{name}, operations:[{operation:'entity.create',target:'plant-1',data:{name,type:'plant'}}] }; }

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


test('Browser Core Port independently reads and validates persisted event before publishing', async () => {
  const x=setup(); const result=await x.port.execute(cmd());
  assert.equal(result.status,'committed');
  assert.equal(x.persisted.events.some(event=>event.id===result.eventId&&event.intentKey==='browser-port-1'),true);
  assert.equal(x.state.events.some(event=>event.id===result.eventId),true);
  assert.equal(x.published,1);
});

test('Browser Core Port refuses to publish when readback omits the committed event', async () => {
  const x=setup({corruptReadback:true}); const result=await x.port.execute(cmd());
  assert.equal(result.status,'verification_failed');
  assert.equal(x.persisted.entities.length,1);
  assert.equal(x.state.entities.length,0);
  assert.equal(x.published,0);
});

test('Browser Core Port keeps UI unpublished when independent readback is unavailable', async () => {
  const x=setup({failReadback:true}); const result=await x.port.execute(cmd());
  assert.equal(result.status,'verification_failed');
  assert.equal(x.state.events.length,0);
  assert.equal(x.published,0);
});


test('Browser Core Port recovers a lost persistence response from verified durable readback', async () => {
  const x=setup({persistThenThrow:true}); const result=await x.port.execute(cmd());
  assert.equal(result.status,'committed');
  assert.equal(x.state.events.length,1);
  assert.equal(x.published,1);
  assert.equal(x.verificationFailure,null);
});

test('Browser Core Port trusts verified readback over a false persistence response', async () => {
  const x=setup({persistThenFalse:true}); const result=await x.port.execute(cmd());
  assert.equal(result.status,'committed');
  assert.equal(x.state.entities.length,1);
  assert.equal(x.published,1);
});

test('Browser Core Port invokes the integrity lock when readback is ambiguous', async () => {
  const x=setup({failReadback:true}); const result=await x.port.execute(cmd());
  assert.equal(result.status,'verification_failed');
  assert.match(x.verificationFailure,/readback unavailable/);
});


test('Browser Core Port independently verifies an existing idempotent commit before returning duplicate', async () => {
  const x=setup(); const first=await x.port.execute(cmd());
  assert.equal(first.status,'committed');
  const duplicate=await x.port.execute(cmd());
  assert.equal(duplicate.status,'duplicate');
  assert.equal(duplicate.persistenceVerified,true);
  assert.equal(duplicate.eventId,first.eventId);
  assert.equal(x.state.events.length,1);
});

test('Browser Core Port does not treat an in-memory duplicate as durable when readback fails', async () => {
  const x=setup(); await x.port.execute(cmd()); x.failNextReadback();
  const duplicate=await x.port.execute(cmd());
  assert.equal(duplicate.status,'verification_failed');
  assert.equal(x.state.events.length,1);
  assert.equal(x.published,1);
  assert.match(x.verificationFailure,/readback unavailable/);
});


test('Browser Core Port rejects reuse of an idempotency key with changed operations', async () => {
  const x=setup(); const first=await x.port.execute(cmd('Test plant'));
  assert.equal(first.status,'committed');
  const before=structuredClone(x.persisted);
  const changed=await x.port.execute(cmd('Corrected plant name'));
  assert.equal(changed.status,'conflict');
  assert.match(changed.errors[0],/different set of Core operations/);
  assert.deepEqual(x.persisted,before);
  assert.equal(x.state.events.length,1);
  assert.equal(x.published,1);
});
