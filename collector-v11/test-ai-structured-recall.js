'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {searchStructuredMemory}=require('./ai/structured-recall');

const state={
 entities:[{id:'p1',name:'Mihai',type:'person',attributes:{role:'supplier',aliases:['Mike']}},{id:'o1',name:'Pump',type:'object',attributes:{condition:'needs repair'}},{id:'l1',name:'Workshop Sibiu',type:'location',attributes:{}}],
 relations:[{id:'r1',sourceId:'p1',targetId:'o1',type:'brings',startedAt:'2026-11-27'}],
 events:[{id:'ev1',timestamp:'2026-11-26T12:00:00Z',payload:{entityIds:{person:'p1',object:'o1'},summary:'Mihai plans to bring pump Friday'},operations:[{operation:'event.note',data:{description:'Mihai plans to bring pump Friday'}}],certainty:'uncertain',status:'committed'},{id:'ev2',timestamp:'2026-11-20T12:00:00Z',payload:{},operations:[{operation:'event.note',data:{description:'Unrelated meeting'}}]}],
 eventAttributes:[{eventId:'ev1',name:'context',value:'aquarium'}]
};
test('recall returns matching entities, linked relations, events and attribute evidence',()=>{
 const result=searchStructuredMemory(state,'Mihai pump');
 assert.equal(result.entities.length,2);
 assert.equal(result.relations.length,1);
 assert.equal(result.events.length,1);
 assert.ok(result.evidence.some(x=>x.kind==='event'&&x.id==='ev1'));
 assert.ok(result.attributes.some(x=>x.name==='condition'&&x.value==='needs repair'));
});
test('recall supports temporal bounds and clamps result limit',()=>{
 const result=searchStructuredMemory(state,'Mihai',{from:'2026-11-25T00:00:00Z',to:'2026-11-27T00:00:00Z',limit:999});
 assert.equal(result.events.length,1);
 assert.ok(result.evidence.length<=100);
});
test('empty query returns no results and does not scan broadly',()=>{
 assert.deepEqual(searchStructuredMemory(state,'').evidence,[]);
});


test('Node recall includes alias and event-attribute evidence from structured tables',()=>{
 const alias=searchStructuredMemory(state,'Mike');
 assert.equal(alias.entities[0].id,'p1');
 const eventAttribute=searchStructuredMemory(state,'aquarium');
 assert.equal(eventAttribute.events[0].id,'ev1');
 assert.ok(eventAttribute.evidence.some(row=>row.kind==='event_attribute'&&row.value==='aquarium'));
});
test('recall applies one consistent bounded limit to every returned collection',()=>{
 const large=searchStructuredMemory(state,'Mihai pump',{limit:999});
 for(const key of ['entities','tasks','relations','events','attributes','eventAttributes','evidence'])assert.ok(large[key].length<=100,key);
 const small=searchStructuredMemory(state,'Mihai pump',{limit:-5});
 for(const key of ['entities','relations','events','attributes','eventAttributes','evidence'])assert.ok(small[key].length<=1,key);
 assert.throws(()=>searchStructuredMemory(state,'Mihai',{limit:Infinity}),/finite number/);
 assert.throws(()=>searchStructuredMemory(state,'Mihai',{limit:'abc'}),/finite number/);
});
test('recall rejects invalid and inverted temporal bounds instead of silently broadening the search',()=>{
 assert.throws(()=>searchStructuredMemory(state,'Mihai',{from:'not-a-date'}),/from must be a valid date/);
 assert.throws(()=>searchStructuredMemory(state,'Mihai',{to:'not-a-date'}),/to must be a valid date/);
 assert.throws(()=>searchStructuredMemory(state,'Mihai',{from:'2026-11-27',to:'2026-11-25'}),/earlier than or equal/);
});
test('Node and browser structured recall return identical projections and evidence',()=>{
 require('./ai/structured-recall-browser.js');
 const browser=globalThis.CollectorStructuredRecall;
 for(const [query,options] of [['Mihai pump',{}],['Mike',{}],['aquarium',{}],['Mihai',{limit:1}],['Pump',{from:'2026-11-20T00:00:00Z',to:'2026-11-27T23:59:59Z'}]]){
  assert.deepEqual(browser.searchStructuredMemory(state,query,options),searchStructuredMemory(state,query,options),query);
 }
});

test('Recall evidence exposes stable source identifiers for every evidence kind',()=>{
 const r=searchStructuredMemory(state,'Mihai pump');
 for(const evidence of r.evidence)assert.equal(typeof evidence.sourceId,'string');
 assert.ok(r.evidence.some(row=>row.kind==='entity'&&row.sourceId==='entity:p1'));
 assert.ok(r.evidence.some(row=>row.kind==='relation'&&row.sourceId==='relation:r1'));
 assert.ok(r.evidence.some(row=>row.kind==='event'&&row.sourceId==='event:ev1'));
 assert.ok(r.evidence.some(row=>row.kind==='attribute'&&row.sourceId==='attribute:o1:condition'));
 assert.ok(r.evidence.some(row=>row.kind==='event_attribute'&&row.sourceId==='event-attribute:ev1:context'));
});


test('reminder lifecycle Core notes are searchable and returned as source-linked Recall evidence',()=>{
 const reminderEvent={
  id:'reminder-core-1',type:'ai.command',timestamp:'2026-11-26T18:30:00Z',source:'reminder-service',actor:'local-user',certainty:'certain',status:'committed',
  intentKey:'collector-reminder-lifecycle:reminder-1:scheduled:2026-11-26T18:30:00.000Z',
  payload:{domain:'reminder',reminderId:'reminder-1',reminderLifecycle:'scheduled',reminderTitle:'Verifică pompa',dueAt:'2026-11-27T09:00:00Z',sourceId:'audio:capture-1',summary:'Reminder programat: Verifică pompa'},
  operations:[{operation:'event.note',target:null,data:{description:'Reminder programat: Verifică pompa · termen: 2026-11-27T09:00:00Z · sursă: audio:capture-1'}}]
 };
 const result=searchStructuredMemory({...state,events:[...state.events,reminderEvent]},'reminder pompa');
 assert.ok(result.events.some(event=>event.id==='reminder-core-1'));
 const evidence=result.evidence.find(row=>row.kind==='event'&&row.id==='reminder-core-1');
 assert.equal(evidence.sourceId,'event:reminder-core-1');
 assert.match(evidence.summary,/Reminder programat: Verifică pompa/);
});

test('Recall returns canonical reminder tasks with lifecycle, due date and source reference',()=>{
 const task={id:'task:reminder:r1',name:'Verifică pompa',type:'task',attributes:{taskKind:'reminder',reminderId:'r1',status:'open',dueAt:'2026-11-27T09:00:00Z',sourceId:'audio:capture-1',scheduleState:'scheduled'}};
 const fixture={...state,entities:[...state.entities,task]};
 const result=searchStructuredMemory(fixture,'reminder pompa');
 assert.equal(result.tasks.length,1);
 assert.equal(result.tasks[0].status,'open');
 assert.equal(result.tasks[0].sourceId,'audio:capture-1');
 assert.ok(result.evidence.some(row=>row.kind==='task'&&row.sourceId==='task:task:reminder:r1'&&row.status==='open'));
 require('./ai/structured-recall-browser.js');
 const browser=globalThis.CollectorStructuredRecall.searchStructuredMemory(fixture,'reminder pompa');
 assert.deepEqual(browser,result);
});

test('reminder task Recall evidence is prioritized and not duplicated as a generic entity',()=>{
 const task={id:'task:reminder:priority',name:'Prioritate pompă',type:'task',attributes:{taskKind:'reminder',reminderId:'priority',status:'open',dueAt:'2026-11-27T09:00:00Z'}};
 const result=searchStructuredMemory({...state,entities:[...state.entities,task]},'prioritate pompa');
 assert.equal(result.tasks.length,1);
 assert.equal(result.entities.some(entity=>entity.id===task.id),false);
 assert.equal(result.evidence[0].kind,'task');
 assert.equal(result.evidence[0].sourceId,'task:task:reminder:priority');
});
