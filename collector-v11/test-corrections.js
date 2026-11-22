const assert=require('node:assert/strict');
const E=require('./engine.js');
let db=E.emptyState();let tick=Date.parse('2026-11-01T00:00:00Z');
function add(type,operations,payload={}){const ev={id:E.uid(),type,timestamp:new Date(tick++).toISOString(),source:'test',actor:'tester',status:'committed',operations,payload};db=E.commit(db,ev).db;return ev;}
function correction(original,operations){return add('event.correction',operations,{correctsEventId:original.id});}
function balance(pid,lid,disp='active'){return E.balances(db).find(x=>x.populationId===pid&&x.locationId===lid&&x.disposition===disp)?.quantity||0;}

// Stock add correction must preserve subsequent stock activity and replay identically.
const pop=E.uid(),locA=E.uid(),locB=E.uid();
add('create',[{operation:'entity.create',target:pop,data:{name:'Fancy',type:'population'}},{operation:'entity.create',target:locA,data:{name:'A',type:'location'}},{operation:'entity.create',target:locB,data:{name:'B',type:'location'}}]);
const initial=add('stock.add',[{operation:'stock.change',data:{populationId:pop,locationId:locA,quantity:10,action:'add'}}]);
add('sale',[{operation:'stock.change',data:{populationId:pop,locationId:locA,quantity:2,action:'sell',disposition:'sold'}}]);
correction(initial,[{operation:'stock.adjust',data:{correctsEventId:initial.id,changes:[{populationId:pop,locationId:locA,disposition:'active',quantity:-3}]}}]);
assert.equal(balance(pop,locA),5,'stock correction must retain later sale');

// Finance reversal is additive and auditable.
const expense=add('expense',[{operation:'finance.record',data:{entityId:pop,kind:'cost',amount:120,currency:'RON',description:'cost'}}]);
correction(expense,[{operation:'finance.adjust',data:{entityId:pop,kind:'cost',amount:-120,currency:'RON',correctsEventId:expense.id}}]);
assert.equal(E.totalFinance(db)['RON|cost'],0);

// Correcting a population move restores its previous location and stock location.
add('locate',[{operation:'relation.create',data:{sourceId:pop,targetId:locA,type:'located_in'}}]);
const move=add('move',[{operation:'relation.move',data:{sourceId:pop,targetId:locB}}]);
assert.equal(E.activeLocation(db,pop).id,locB);
correction(move,[{operation:'relation.move.correct',data:{correctsEventId:move.id}}]);
assert.equal(E.activeLocation(db,pop).id,locA,'move correction restores prior location');
assert.equal(balance(pop,locA),5,'move correction restores source stock');
assert.equal(balance(pop,locB),0,'move correction removes destination stock');

// Correcting a relation creation closes the exact relation, not an unrelated later relation.
const related=E.uid();add('create-related',[{operation:'entity.create',target:related,data:{name:'Related',type:'generic'}}]);
const rel=add('relation-create',[{operation:'relation.create',data:{sourceId:pop,targetId:related,type:'related_to'}}]);
correction(rel,[{operation:'relation.create.correct',data:{correctsEventId:rel.id}}]);
assert.equal(db.relations.find(r=>(r.history||[]).some(h=>h.eventId===rel.id))?.endedAt!==null,true);

// Relation attribute correction restores prior value only when no later value supersedes it.
const rel2=add('relation-create-2',[{operation:'relation.create',data:{sourceId:pop,targetId:related,type:'custom',customTypeName:'tagged'}}]);
const relation=db.relations.find(r=>(r.history||[]).some(h=>h.eventId===rel2.id));
const attr=add('relation-attribute',[{operation:'relation.attribute.set',data:{relationId:relation.id,name:'score',value:7}}]);
correction(attr,[{operation:'relation.attribute.correct',data:{relationId:relation.id,name:'score',correctsEventId:attr.id}}]);
assert.equal(relation.attributes.score,undefined);

// Correcting a population-membership relation also reverses its automatic identified-member stock projection.
const pop3=E.uid(),member3=E.uid();
add('membership-entities',[{operation:'entity.create',target:pop3,data:{name:'Population 3',type:'population'}},{operation:'entity.create',target:member3,data:{name:'Member 3',type:'individual'}}]);
const membership=add('membership',[{operation:'relation.create',data:{sourceId:pop3,targetId:member3,type:'contains'}}]);
assert.equal(balance(pop3,null),1,'membership creates one identified-member unit');
correction(membership,[{operation:'relation.create.correct',data:{correctsEventId:membership.id}}]);
assert.equal(balance(pop3,null),0,'membership correction reverses its derived stock effect');

// Correcting a relationship closure reopens it only if no later closure superseded it.
const closeEntity=E.uid();add('close-entity',[{operation:'entity.create',target:closeEntity,data:{name:'Close target',type:'generic'}}]);
const closeTarget=add('close-target',[{operation:'relation.create',data:{sourceId:pop,targetId:closeEntity,type:'custom',customTypeName:'closeable'}}]);
const closeRelation=db.relations.find(r=>(r.history||[]).some(h=>h.eventId===closeTarget.id));
const closed=add('relation-close',[{operation:'relation.close',data:{relationId:closeRelation.id}}]);
correction(closed,[{operation:'relation.close.correct',data:{relationId:closeRelation.id,correctsEventId:closed.id}}]);
assert.equal(db.relations.find(r=>r.id===closeRelation.id).endedAt,null,'correction reopens the relation');

// Entity rename correction restores the prior name.
const rename=add('rename',[{operation:'entity.rename',target:related,data:{name:'Renamed'}}]);
correction(rename,[{operation:'entity.rename.correct',target:related,data:{correctsEventId:rename.id}}]);
assert.equal(db.entities.find(e=>e.id===related).name,'Related');

// Correcting an old move after a later real move must preserve the later move and its stock effects.
const pop2=E.uid(),locC=E.uid();
add('create-second-population',[{operation:'entity.create',target:pop2,data:{name:'Tiger',type:'population'}},{operation:'entity.create',target:locC,data:{name:'C',type:'location'}}]);
add('locate-second',[{operation:'relation.create',data:{sourceId:pop2,targetId:locA,type:'located_in'}},{operation:'stock.change',data:{populationId:pop2,locationId:locA,quantity:4,action:'add'}}]);
const firstMove=add('first-move',[{operation:'relation.move',data:{sourceId:pop2,targetId:locB}}]);
add('later-real-move',[{operation:'relation.move',data:{sourceId:pop2,targetId:locC}}]);
correction(firstMove,[{operation:'relation.move.correct',data:{correctsEventId:firstMove.id}}]);
assert.equal(E.activeLocation(db,pop2).id,locC,'correction of old move must not undo later real move');
assert.equal(balance(pop2,locC),4,'later move stock must remain at its destination');
assert.equal(balance(pop2,locA),0);assert.equal(balance(pop2,locB),0);

// Replay must reconstruct the same projections and preserve original events.
const replay=E.replay(db.events,db.attributes);
assert.deepEqual(E.balances(replay),E.balances(db));
assert.equal(replay.relations.length,db.relations.length);
assert.equal(replay.entities.find(e=>e.id===related).name,'Related');
assert.deepEqual(replay.meta.replayWarnings||[],[]);
assert.equal(db.events.find(e=>e.id===initial.id).operations[0].data.quantity,10,'original stock event remains unchanged');
assert.ok(db.events.some(e=>e.payload?.correctsEventId===move.id),'correction links to original move');

// Unsafe/invalid correction must roll back atomically.
const before=JSON.stringify(db);
assert.throws(()=>E.commit(db,{id:E.uid(),type:'bad-correction',timestamp:new Date(tick++*1000).toISOString(),operations:[{operation:'relation.move.correct',data:{correctsEventId:'missing'}}]}),/nu există/);
assert.equal(JSON.stringify(db),before);

// D-044 compound correction: stock + finance + attribute are corrected atomically;
// later valid operations remain in effect and replay matches normal processing.
const compoundPop=E.uid(),compoundLoc=E.uid(),compoundEntity=E.uid();
add('compound-entities',[{operation:'entity.create',target:compoundPop,data:{name:'Compound stock',type:'population'}},{operation:'entity.create',target:compoundLoc,data:{name:'Compound location',type:'location'}},{operation:'entity.create',target:compoundEntity,data:{name:'Compound item',type:'generic'}}]);
const compoundEvent=add('compound-original',[
 {operation:'stock.change',data:{populationId:compoundPop,locationId:compoundLoc,quantity:10,action:'add'}},
 {operation:'finance.record',data:{entityId:compoundEntity,kind:'cost',amount:100,currency:'RON',description:'compound purchase'}},
 {operation:'attribute.set',target:compoundEntity,data:{name:'grade',value:'A'}}
]);
add('compound-later-sale',[{operation:'stock.change',data:{populationId:compoundPop,locationId:compoundLoc,quantity:2,action:'sell',disposition:'sold'}}]);
correction(compoundEvent,[
 {operation:'stock.adjust',data:{correctsEventId:compoundEvent.id,changes:[{populationId:compoundPop,locationId:compoundLoc,disposition:'active',quantity:-2}]}},
 {operation:'finance.adjust',data:{entityId:compoundEntity,kind:'cost',amount:-20,currency:'RON',correctsEventId:compoundEvent.id}},
 {operation:'attribute.correct',target:compoundEntity,data:{name:'grade',value:'B',correctsEventId:compoundEvent.id}},
 {operation:'event.invalidate',data:{correctsEventId:compoundEvent.id}}
]);
assert.equal(balance(compoundPop,compoundLoc),6,'compound stock correction retains later sale');
assert.equal(E.totalFinance(db)['RON|cost'],80,'compound finance correction applies exact delta');
assert.equal(db.entities.find(e=>e.id===compoundEntity).attributes.grade,'B','compound attribute correction updates projection');
const compoundReplay=E.replay(db.events,db.attributes);
assert.deepEqual(E.balances(compoundReplay),E.balances(db),'compound replay stock must match');
assert.deepEqual(E.totalFinance(compoundReplay),E.totalFinance(db),'compound replay finance must match');
assert.equal(compoundReplay.entities.find(e=>e.id===compoundEntity).attributes.grade,'B','compound replay attribute must match');
assert.deepEqual(compoundReplay.meta.replayWarnings||[],[],'compound correction replay must be warning-free');

console.log('PASS: stock correction with later activity, finance reversal, relation create/move/attribute corrections, rename correction, audit linkage, replay equivalence and atomic rollback');
