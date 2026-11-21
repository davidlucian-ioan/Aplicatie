const assert=require('node:assert/strict');
const E=require('./engine.js');
let db=E.emptyState();
let tick=Date.parse('2026-11-21T16:00:00.000Z');
function add(type,operations,payload={}){
  const event={id:E.uid(),type,timestamp:new Date(tick+=1000).toISOString(),source:'test',actor:'tester',status:'committed',operations,payload};
  db=E.commit(db,event).db;
  return event;
}
function activeBalance(pop,loc){return E.balances(db).find(x=>x.populationId===pop&&x.locationId===loc&&x.disposition==='active')?.quantity||0;}
const pop=E.uid(),loc=E.uid();
add('setup',[
  {operation:'entity.create',target:pop,data:{name:'Fancy',type:'population'}},
  {operation:'entity.create',target:loc,data:{name:'B1',type:'location'}}
]);
const original=add('stock.add',[{operation:'stock.change',data:{populationId:pop,locationId:loc,quantity:10,action:'add'}}]);
assert.equal(activeBalance(pop,loc),10);
const firstDelta=E.correctionDelta(10,null,8);
assert.equal(firstDelta,-2);
add('event.correction',[
  {operation:'stock.adjust',data:{correctsEventId:original.id,changes:[{populationId:pop,locationId:loc,disposition:'active',quantity:firstDelta}]}},
  {operation:'event.invalidate',data:{correctsEventId:original.id}},
  {operation:'event.note',data:{description:'first correction'}}
],{correctsEventId:original.id,correctedQuantity:8});
assert.equal(activeBalance(pop,loc),8);
const secondDelta=E.correctionDelta(10,8,7);
assert.equal(secondDelta,-1);
add('event.correction',[
  {operation:'stock.adjust',data:{correctsEventId:original.id,changes:[{populationId:pop,locationId:loc,disposition:'active',quantity:secondDelta}]}},
  {operation:'event.invalidate',data:{correctsEventId:original.id}},
  {operation:'event.note',data:{description:'second correction'}}
],{correctsEventId:original.id,correctedQuantity:7});
assert.equal(activeBalance(pop,loc),7);
const replay=E.replay(db.events,db.attributes);
assert.equal(E.balances(replay).find(x=>x.populationId===pop&&x.locationId===loc&&x.disposition==='active').quantity,7);
assert.deepEqual(replay.meta.replayWarnings||[],[]);
console.log('PASS: repeated correction 10 -> 8 -> 7 applies -2 then -1; balance and replay = 7');
