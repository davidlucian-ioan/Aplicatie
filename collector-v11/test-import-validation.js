const assert=require('node:assert/strict');
const E=require('./engine.js');
let db=E.emptyState();
let tick=Date.parse('2026-11-21T16:00:00.000Z');
function add(type,operations,payload={}){
  const event={id:E.uid(),type,timestamp:new Date(tick+=1000).toISOString(),source:'test',actor:'tester',status:'committed',operations,payload};
  db=E.commit(db,event).db;
  return event;
}
const entityId=E.uid();
add('entity.created',[{operation:'entity.create',target:entityId,data:{name:'Test plant',type:'plant'}}]);
const valid=E.validateImport(JSON.parse(JSON.stringify(db)));
assert.equal(valid.entities.length,1);
assert.deepEqual(valid.meta.replayWarnings||[],[]);

const broken=JSON.parse(JSON.stringify(db));
broken.events.push({id:E.uid(),type:'broken',timestamp:new Date(tick+=1000).toISOString(),status:'committed',operations:[{operation:'entity.rename',target:'missing-entity',data:{name:'Broken'}}]});
assert.throws(()=>E.validateImport(broken),/erori la reconstruirea jurnalului/);

const divergent=JSON.parse(JSON.stringify(db));
divergent.entities[0].name='Changed outside journal';
assert.throws(()=>E.validateImport(divergent),/nu corespunde jurnalului/);

const pending=JSON.parse(JSON.stringify(db));
pending.events.push({id:E.uid(),type:'draft',timestamp:new Date(tick+=1000).toISOString(),status:'pending',operations:[]});
assert.throws(()=>E.validateImport(pending),/nu sunt confirmate/);

console.log('PASS: valid import accepted; replay errors, projection drift and uncommitted events rejected.');

// Finance projection row IDs are generated during replay, so they are not stable import identity.
const financeEvent={id:E.uid(),type:'finance.recorded',timestamp:new Date(tick+=1000).toISOString(),status:'committed',operations:[{operation:'finance.record',data:{amount:12,kind:'cost',currency:'RON',description:'Test import'}}]};
let financeDb=E.commit(E.emptyState(),financeEvent).db;
financeDb=E.commit(financeDb,{id:E.uid(),type:'finance.adjusted',timestamp:new Date(tick+=1000).toISOString(),status:'committed',operations:[{operation:'finance.adjust',data:{amount:-2,kind:'cost',currency:'RON',description:'Correction'}}]}).db;
assert.equal(E.validateImport(JSON.parse(JSON.stringify(financeDb))).finance.length,2);
