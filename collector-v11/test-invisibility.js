const assert=require('node:assert/strict');
const E=require('./engine.js');
let db=E.emptyState();
function add(id,type,operations,payload={}){db=E.commit(db,{id,type,timestamp:new Date(Date.parse('2026-11-21T10:00:00Z')+db.events.length*1000).toISOString(),operations,payload}).db;}
add('create','create',[{operation:'entity.create',target:'tank',data:{name:'Tank',type:'location'}},{operation:'attribute.define',data:{name:'pH',type:'number',nature:'dynamic',historyEnabled:true}}]);
add('measure','measurement',[{operation:'attribute.set',target:'tank',data:{name:'pH',value:6.4}}],{entityId:'tank'});
add('correct','attribute.value_corrected',[{operation:'attribute.correct',target:'tank',data:{name:'pH',value:6.7,correctsEventId:'measure'}},{operation:'event.invalidate',data:{correctsEventId:'measure'}}],{entityId:'tank',correctsEventId:'measure',summary:'Corecție pH: 6.4 → 6.7'});
assert.equal(db.events.find(e=>e.id==='measure').hiddenFromHistory,true);
assert.equal(db.events.find(e=>e.id==='measure').invalidatedByEventId,'correct');
assert.equal(db.events.find(e=>e.id==='correct').hiddenFromHistory,undefined);
const rebuilt=E.replay(db.events,db.attributes);
assert.equal(rebuilt.entities.find(e=>e.id==='tank').attributes.pH,6.7);
assert.equal(rebuilt.events.find(e=>e.id==='measure').hiddenFromHistory,true);
assert.equal(rebuilt.meta.replayWarnings?.length||0,0);
console.log('PASS: corrected source event is hidden from user-facing history metadata while audit journal and replay remain intact');
