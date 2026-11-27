const assert=require('node:assert/strict');const E=require('./engine.js');
let db=E.emptyState();
function add(type,ops,payload={}){const r=E.commit(db,{id:E.uid(),type,timestamp:E.now(),operations:ops,payload});db=r.db;return r.event}
const loc1=E.uid(),loc2=E.uid(),pop=E.uid(),plant=E.uid();
add('setup',[{operation:'entity.create',target:loc1,data:{name:'Sera',type:'location'}},{operation:'entity.create',target:loc2,data:{name:'Raft 2',type:'location'}},{operation:'entity.create',target:pop,data:{name:'Fancy anonimi',type:'population'}},{operation:'entity.create',target:plant,data:{name:'Monstera',type:'plant'}}]);
add('attribute.def',[{operation:'attribute.define',data:{name:'pH',type:'number',nature:'dynamic',role:'measurement',historyEnabled:true,validation:{min:0,max:14}}}]);
add('ph1',[{operation:'attribute.set',target:plant,data:{name:'pH',value:6.4,certainty:'certain'}}],{entityId:plant});
add('ph2',[{operation:'attribute.set',target:plant,data:{name:'pH',value:6.8,certainty:'uncertain',forceHistory:true}}],{entityId:plant});
assert.equal(db.entities.find(e=>e.id===plant).attributes.pH,6.8);assert.equal(db.entities.find(e=>e.id===plant).attributeHistory.pH.length,2);assert.equal(db.entities.find(e=>e.id===plant).attributeHistory.pH[0].value,6.4);
add('loc',[{operation:'relation.create',data:{sourceId:plant,targetId:loc2,type:'located_in'}},{operation:'relation.create',data:{sourceId:loc2,targetId:loc1,type:'located_in'}}]);assert.equal(E.locationPath(db,loc2).join(' > '),'Sera > Raft 2');assert.equal(E.activeLocation(db,plant).id,loc2);assert.throws(()=>E.commit(db,{id:E.uid(),type:'cycle',operations:[{operation:'relation.create',data:{sourceId:loc1,targetId:loc2,type:'located_in'}}]}),/cicluri/);
add('stock.add',[{operation:'stock.change',data:{populationId:pop,locationId:loc1,quantity:7,action:'add',disposition:'active'}}]);assert.equal(E.balances(db).find(x=>x.populationId===pop&&x.disposition==='active').quantity,7);
const before=db.events.length;assert.throws(()=>E.commit(db,{id:E.uid(),type:'bad-sale',operations:[{operation:'stock.change',data:{populationId:pop,locationId:loc1,quantity:8,action:'sell'}},{operation:'finance.record',data:{amount:99,kind:'sale'}}]}),/Cantitate insuficientă/);assert.equal(db.events.length,before);assert.equal(E.balances(db).find(x=>x.populationId===pop&&x.disposition==='active').quantity,7);
const saleEv=add('sale',[{operation:'stock.change',data:{populationId:pop,locationId:loc1,quantity:2,action:'sell',disposition:'sold'}},{operation:'finance.record',data:{entityId:pop,kind:'sale',amount:50,currency:'RON',quantity:2}}]);assert.equal(E.balances(db).find(x=>x.populationId===pop&&x.disposition==='active').quantity,5);assert.equal(db.finance.length,1);add('sale.corrected',[{operation:'stock.adjust',data:{correctsEventId:saleEv.id,changes:[{populationId:pop,locationId:loc1,disposition:'active',quantity:2},{populationId:pop,locationId:loc1,disposition:'sold',quantity:-2}]}},{operation:'finance.adjust',data:{entityId:pop,kind:'sale',amount:-50,currency:'RON',correctsEventId:saleEv.id}}],{correctsEventId:saleEv.id});assert.equal(E.balances(db).find(x=>x.populationId===pop&&x.disposition==='active').quantity,7);assert.equal(E.totalFinance(db)['RON|sale'],0);
const beforeDup=db.events.length;const ev={id:E.uid(),type:'idem',intentKey:'same-intent',operations:[{operation:'event.note',data:{description:'x'}}]};db=E.commit(db,ev).db;const duplicate=E.commit(db,{...ev,id:E.uid()});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.db.events.length,beforeDup+1);
const rel=db.relations.find(r=>r.type==='located_in'&&r.sourceId===plant&&!r.endedAt);add('relation.attr',[{operation:'relation.attribute.set',data:{relationId:rel.id,name:'confidence',value:0.9}}]);const referenced=db.events[0];add('event.attr',[{operation:'event.attribute.set',data:{eventId:referenced.id,name:'sourceNote',value:'manual'}}]);const replay=E.replay(db.events,db.attributes);assert.equal(replay.eventAttributes.length,1);assert.equal(replay.relations.find(r=>r.id===rel.id).attributes.confidence,0.9);assert.equal(replay.entities.find(e=>e.id===plant).attributes.pH,6.8);assert.equal(replay.relations.length,2);assert.equal(E.balances(replay).find(x=>x.populationId===pop&&x.disposition==='active').quantity,7);assert.equal(replay.finance.length,2);
// v7: explicit relationship semantics and stable location containment hierarchy.
const v7=E.emptyState(), rootLoc=E.uid(), childLoc=E.uid(), pop2=E.uid(), item=E.uid();
function add7(type,ops,payload={}){const r=E.commit(v7,{id:E.uid(),type,timestamp:E.now(),operations:ops,payload});Object.assign(v7,r.db);return r.event}
add7('setup-v7',[{operation:'entity.create',target:rootLoc,data:{name:'Sera',type:'location'}},{operation:'entity.create',target:childLoc,data:{name:'Raft 4',type:'location'}},{operation:'entity.create',target:pop2,data:{name:'Fancy Tigers',type:'population'}},{operation:'entity.create',target:item,data:{name:'Etichetă',type:'object'}}]);
add7('location-hierarchy',[{operation:'relation.create',data:{sourceId:rootLoc,targetId:childLoc,type:'contains'}}]);
assert.equal(E.locationPath(v7,childLoc).join(' > '),'Sera > Raft 4');
assert.throws(()=>E.commit(v7,{id:E.uid(),type:'contains-cycle',operations:[{operation:'relation.create',data:{sourceId:childLoc,targetId:rootLoc,type:'contains'}}]}),/cicluri/);
assert.throws(()=>E.commit(v7,{id:E.uid(),type:'custom-no-name',operations:[{operation:'relation.create',data:{sourceId:pop2,targetId:item,type:'custom'}}]}),/numele tipului este obligatoriu/);
add7('custom-named',[{operation:'relation.create',data:{sourceId:pop2,targetId:item,type:'custom',customTypeName:'etichetat_cu'}}]);
assert.equal(v7.relations.find(r=>r.type==='custom').customTypeName,'etichetat_cu');
assert.throws(()=>E.commit(v7,{id:E.uid(),type:'bad-location-target',operations:[{operation:'relation.create',data:{sourceId:pop2,targetId:item,type:'located_in'}}]}),/trebuie să fie o locație/);
assert.throws(()=>E.commit(v7,{id:E.uid(),type:'duplicate-location',operations:[{operation:'relation.create',data:{sourceId:pop2,targetId:rootLoc,type:'located_in'}},{operation:'relation.create',data:{sourceId:pop2,targetId:childLoc,type:'located_in'}}]}),/deja o locație activă/);
console.log('PASS: temporal attributes, relation/location hierarchy and cycle prevention, stock invariants, atomic rollback, compensating corrections, finance, relation/event attributes, idempotency, full replay, v7 relation semantics and custom types');

// v8: linking a known individual shrimp to a population contributes one to its stock.
const v8=E.emptyState(), popFancy=E.uid(), shrimpOne=E.uid();
function add8(type,ops,payload={}){const r=E.commit(v8,{id:E.uid(),type,timestamp:E.now(),operations:ops,payload});Object.assign(v8,r.db);return r.event}
add8('setup-v8',[{operation:'entity.create',target:popFancy,data:{name:'Fancy',type:'population'}},{operation:'entity.create',target:shrimpOne,data:{name:'test individ',type:'crevete'}}]);
add8('population-member',[{operation:'relation.create',data:{sourceId:popFancy,targetId:shrimpOne,type:'contains'}}]);
assert.equal(E.balances(v8).find(x=>x.populationId===popFancy&&x.disposition==='active').quantity,1);
assert.equal(E.replay(v8.events,v8.attributes).stock.filter(x=>x.populationId===popFancy).reduce((a,x)=>a+x.quantity,0),1);
add8('anonymous-stock-existing',[{operation:'stock.change',data:{populationId:popFancy,quantity:9,action:'add',disposition:'active'}}]);
const stockBeforeMembership=E.balances(v8).find(x=>x.populationId===popFancy&&x.disposition==='active').quantity;
const secondShrimp=E.uid();add8('second-shrimp',[{operation:'entity.create',target:secondShrimp,data:{name:'al doilea',type:'crevete'}}]);
add8('second-member',[{operation:'relation.create',data:{sourceId:popFancy,targetId:secondShrimp,type:'contains'}}]);
assert.equal(E.balances(v8).find(x=>x.populationId===popFancy&&x.disposition==='active').quantity,stockBeforeMembership);
assert.throws(()=>E.commit(v8,{id:E.uid(),type:'duplicate-member',operations:[{operation:'relation.create',data:{sourceId:popFancy,targetId:shrimpOne,type:'contains'}}]}),/există deja/);
console.log('PASS: v8 identified individual membership increments population stock by one and survives replay');

// v9: population location propagates to contained entities; moving a population
// updates the derived location and the active stock location without losing history.
const v9=E.emptyState(), locA=E.uid(), locB=E.uid(), popA=E.uid(), memberA=E.uid();
function add9(type,ops,payload={}){const r=E.commit(v9,{id:E.uid(),type,timestamp:E.now(),operations:ops,payload});Object.assign(v9,r.db);return r.event}
add9('setup-v9',[{operation:'entity.create',target:locA,data:{name:'B1',type:'location'}},{operation:'entity.create',target:locB,data:{name:'B2',type:'location'}},{operation:'entity.create',target:popA,data:{name:'Fancy',type:'population'}},{operation:'entity.create',target:memberA,data:{name:'Fancy individ',type:'crevete'}}]);
add9('population-create-v9',[{operation:'relation.create',data:{sourceId:popA,targetId:locA,type:'located_in'}},{operation:'stock.change',data:{populationId:popA,locationId:locA,quantity:12,action:'add',disposition:'active'}}]);
add9('membership-v9',[{operation:'relation.create',data:{sourceId:popA,targetId:memberA,type:'contains'}}]);
assert.equal(E.activeLocation(v9,memberA).id,locA,'member should inherit its population location');
add9('move-population-v9',[{operation:'relation.move',data:{sourceId:popA,targetId:locB}}]);
assert.equal(E.activeLocation(v9,memberA).id,locB,'member location should follow moved population');
assert.equal(E.balances(v9).find(x=>x.populationId===popA&&x.locationId===locA&&x.disposition==='active'),undefined,'old location should have no active balance');
assert.equal(E.balances(v9).find(x=>x.populationId===popA&&x.locationId===locB&&x.disposition==='active').quantity,12,'population stock should move with its location');
const replay9=E.replay(v9.events,v9.attributes);
assert.equal(E.activeLocation(replay9,memberA).id,locB,'propagation should survive replay');
assert.equal(E.balances(replay9).find(x=>x.populationId===popA&&x.locationId===locB&&x.disposition==='active').quantity,12,'moved stock should survive replay');
console.log('PASS: v9 population location propagates to members; moving a population moves active stock and survives replay');


// v10: validAt is durable event metadata and is replayed into the attribute history.
{
 const temporalDb=E.emptyState(),entityId='valid-at-entity';
 const create=E.commit(temporalDb,{id:'valid-at-create',type:'setup',timestamp:E.now(),operations:[{operation:'entity.create',target:entityId,data:{name:'Plant',type:'plant'}}]});
 const dated=E.commit(create.db,{id:'valid-at-date',type:'observation',timestamp:E.now(),operations:[
  {operation:'attribute.set',target:entityId,data:{name:'status',value:'active',validAt:'2026-11-26',certainty:'certain'}},
  {operation:'attribute.set',target:entityId,data:{name:'height',value:42,validAt:'2026-11-26T14:30:00+02:00',certainty:'uncertain',forceHistory:true}}
 ]});
 const history=dated.db.entities.find(e=>e.id===entityId).attributeHistory;
 assert.equal(history.status[0].validAt,'2026-11-26');
 assert.equal(history.height[0].validAt,'2026-11-26T14:30:00+02:00');
 const replayed=E.replay(dated.db.events,dated.db.attributes);
 assert.equal(replayed.entities.find(e=>e.id===entityId).attributeHistory.height[0].validAt,'2026-11-26T14:30:00+02:00');
 const roundTrip=E.validateImport(JSON.parse(JSON.stringify(dated.db)));
 assert.equal(roundTrip.entities.find(e=>e.id===entityId).attributeHistory.status[0].validAt,'2026-11-26');
 assert.equal(roundTrip.entities.find(e=>e.id===entityId).attributeHistory.height[0].validAt,'2026-11-26T14:30:00+02:00');
 // Legacy v7 snapshots without the derived validAt property are backfilled solely from the event journal.
 const legacy=JSON.parse(JSON.stringify(dated.db));
 delete legacy.entities[0].attributeHistory.status[0].validAt;
 delete legacy.entities[0].attributeHistory.height[0].validAt;
 const migrated=E.validateImport(legacy);
 assert.equal(migrated.entities.find(e=>e.id===entityId).attributeHistory.status[0].validAt,'2026-11-26');
 assert.equal(migrated.entities.find(e=>e.id===entityId).attributeHistory.height[0].validAt,'2026-11-26T14:30:00+02:00');
 // A present but tampered validAt value must not be silently backfilled or accepted.
 const tampered=JSON.parse(JSON.stringify(dated.db));
 tampered.entities[0].attributeHistory.status[0].validAt='2026-11-27';
 assert.throws(()=>E.validateImport(tampered),/proiecția „entities” nu corespunde jurnalului/);
 assert.throws(()=>E.commit(dated.db,{id:'valid-at-invalid',type:'bad-time',timestamp:E.now(),operations:[
  {operation:'attribute.set',target:entityId,data:{name:'bad',value:'x',validAt:'2026-02-30'}}
 ]}),/Data validării faptului/);
 assert.equal(dated.db.events.length,2,'failed transaction must not mutate the persisted base state');
 console.log('PASS: v10 validAt is stored in attribute history, replayed, and legacy snapshots safely backfill only missing derived metadata');
}
