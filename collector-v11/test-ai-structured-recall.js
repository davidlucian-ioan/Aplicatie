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

test('Recall ranks direct exact/name matches ahead of linked context and exposes relevance',()=>{
 const graph={entities:[{id:'a',name:'Pump',type:'object',attributes:{}},{id:'b',name:'Pump maintenance notes',type:'document',attributes:{}},{id:'c',name:'Workshop',type:'location',attributes:{}}],relations:[{id:'r',sourceId:'a',targetId:'c',type:'stored_at'}],events:[],eventAttributes:[]};
 const result=searchStructuredMemory(graph,'pump');const direct=result.evidence.filter(row=>row.kind==='entity');
 assert.equal(direct[0].id,'a');assert.ok(direct[0].relevance>direct[1].relevance);assert.equal(result.evidence[0].id,'a');
 require('./ai/structured-recall-browser.js');assert.deepEqual(globalThis.CollectorStructuredRecall.searchStructuredMemory(graph,'pump'),result);
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

test('Recall exposes general user tasks with deadlines, priorities and incomplete dependencies',()=>{
 const task={id:'task:user:substrate',name:'Pregătește substratul',type:'task',attributes:{taskKind:'user',taskId:'substrate',status:'open',dueDate:'2026-11-27',priority:'high',sourceId:'work:turn-9'}};
 const prerequisite={id:'task:user:stock',name:'Verifică stocul',type:'task',attributes:{taskKind:'user',taskId:'stock',status:'open',priority:'normal'}};
 const relation={id:'dep-stock',sourceId:task.id,targetId:prerequisite.id,type:'depends_on',endedAt:null};
 const fixture={...state,entities:[...state.entities,task,prerequisite],relations:[...state.relations,relation]};
 const result=searchStructuredMemory(fixture,'pregătește substratul');
 assert.equal(result.tasks.length,1);
 assert.equal(result.tasks[0].taskKind,'user');
 assert.equal(result.tasks[0].taskId,'substrate');
 assert.equal(result.tasks[0].dueDate,'2026-11-27');
 assert.equal(result.tasks[0].priority,'high');
 assert.equal(result.tasks[0].blockedBy[0].title,'Verifică stocul');
 assert.equal(result.entities.some(entity=>entity.id===task.id),false);
 assert.equal(result.evidence[0].kind,'task');
 assert.equal(result.evidence[0].blockedBy[0].taskId,prerequisite.id);
 require('./ai/structured-recall-browser.js');
 const browser=globalThis.CollectorStructuredRecall.searchStructuredMemory(fixture,'pregătește substratul');
 assert.deepEqual(browser,result);
});

test('recall expands one-hop relationship context and includes historical attribute evidence for AI reconstruction',()=>{
 const graph={entities:[{id:'p1',name:'Mihai',type:'person',attributes:{role:'supplier'}},{id:'o1',name:'Pompa',type:'object',attributes:{condition:'broken'},attributeHistory:{condition:[{at:'2026-11-25T10:00:00Z',validAt:'2026-11-25',value:'broken',previous:'working',certainty:'certain',eventId:'ev-h1'}]}},{id:'l1',name:'Atelier',type:'location',attributes:{address:'Sibiu'}}],relations:[{id:'r1',sourceId:'p1',targetId:'o1',type:'brings'},{id:'r2',sourceId:'o1',targetId:'l1',type:'located_at'}],events:[{id:'ev1',timestamp:'2026-11-26T12:00:00Z',payload:{summary:'Mihai brings pump',entityIds:{person:'p1',object:'o1'}},operations:[]}],eventAttributes:[]};
 const result=searchStructuredMemory(graph,'Mihai');
 assert.deepEqual(result.entities.map(e=>e.id),['p1','o1','l1']);
 assert.equal(result.relations.length,2);
 assert.ok(result.attributes.some(row=>row.entityId==='o1'&&row.name==='condition'));
 assert.ok(result.historicalAttributes.some(row=>row.eventId==='ev-h1'&&row.validAt==='2026-11-25'));
 assert.ok(result.evidence.some(row=>row.kind==='linked_entity'&&row.id==='l1'));
 assert.ok(result.evidence.some(row=>row.kind==='historical_attribute'&&row.sourceId==='attribute-history:o1:condition:ev-h1'));
});

test('recall graph expansion obeys requested temporal window',()=>{
 const graph={entities:[{id:'p1',name:'Mihai',type:'person',attributes:{}},{id:'o1',name:'Pump',type:'object',attributes:{}},{id:'x1',name:'Old unrelated linked entity',type:'object',attributes:{}}],relations:[{id:'r1',sourceId:'p1',targetId:'o1',type:'brings'},{id:'r-old',sourceId:'p1',targetId:'x1',type:'mentioned_with',startedAt:'2026-11-10T00:00:00Z',endedAt:'2026-11-11T00:00:00Z'}],events:[{id:'ev-new',timestamp:'2026-11-26T12:00:00Z',payload:{summary:'Mihai brings Pump',entityIds:{p:'p1',o:'o1'}},operations:[]},{id:'ev-old',timestamp:'2026-11-10T12:00:00Z',payload:{summary:'Mihai mentioned old entity',entityIds:{p:'p1',x:'x1'}},operations:[]}],eventAttributes:[]};
 const result=searchStructuredMemory(graph,'Mihai',{from:'2026-11-25T00:00:00Z'});
 assert.ok(!result.entities.some(entity=>entity.id==='x1'));
 assert.ok(!result.relations.some(relation=>relation.id==='r-old'));
});

test('recall exposes relation lifecycle, certainty and current attribute provenance',()=>{
 const graph={entities:[{id:'p1',name:'Mihai',type:'person',attributes:{}},{id:'o1',name:'Pump',type:'object',attributes:{condition:'repaired'},attributeHistory:{condition:[{at:'2026-11-26T10:00:00Z',validAt:'2026-11-26',value:'repaired',certainty:'certain',eventId:'evt-2'}]}}],relations:[{id:'r1',sourceId:'p1',targetId:'o1',type:'brings',startedAt:'2026-11-25',attributes:{certainty:'uncertain',method:'verbal'},attributeHistory:{method:[{at:'2026-11-26',value:'verbal',previous:'written',certainty:'certain',eventId:'evt-r'}]}}],events:[],eventAttributes:[]};
 const result=searchStructuredMemory(graph,'Mihai');const rel=result.evidence.find(row=>row.kind==='relation');const attr=result.evidence.find(row=>row.kind==='attribute'&&row.name==='condition');
 assert.equal(rel.certainty,'uncertain');assert.equal(rel.startedAt,'2026-11-25');assert.equal(rel.attributes.method,'verbal');assert.equal(rel.history.method[0].eventId,'evt-r');assert.equal(attr.certainty,'certain');assert.equal(attr.validAt,'2026-11-26');assert.equal(attr.eventId,'evt-2');
});


test('Recall performs bounded two-hop graph expansion with stable provenance and cycle protection',()=>{const graph={entities:[{id:'a',name:'Pump',type:'object',attributes:{}},{id:'b',name:'Workshop',type:'location',attributes:{}},{id:'c',name:'Supplier',type:'person',attributes:{}},{id:'d',name:'Remote',type:'object',attributes:{}}],relations:[{id:'r1',sourceId:'a',targetId:'b',type:'stored_at'},{id:'r2',sourceId:'b',targetId:'c',type:'owned_by'},{id:'r3',sourceId:'c',targetId:'b',type:'cycle'}],events:[],eventAttributes:[]};const result=searchStructuredMemory(graph,'Pump');assert.deepEqual(result.entities.map(e=>e.id),['a','b','c']);assert.ok(!result.entities.some(e=>e.id==='d'));assert.deepEqual(result.relations.map(r=>r.id),['r1','r2','r3']);const linked=result.evidence.find(x=>x.kind==='linked_entity'&&x.id==='c');assert.equal(linked.graphDepth,2);assert.deepEqual(linked.graphPath,['r1','r2']);const relation=result.evidence.find(x=>x.kind==='relation'&&x.id==='r2');assert.equal(relation.graphDepth,2);assert.deepEqual(relation.graphPath,['r1','r2']);});

test('Recall flags possible attribute conflicts but separates dated changes and excludes corrected history',()=>{
 const graph={entities:[{id:'x',name:'Pompa',type:'object',attributes:{condition:'repaired'},attributeHistory:{condition:[{value:'broken',validAt:'2026-11-24',at:'2026-11-24',certainty:'certain',eventId:'e1'},{value:'repaired',validAt:'2026-11-26',at:'2026-11-26',certainty:'certain',eventId:'e2'},{value:'cracked',validAt:'2026-11-23',eventId:'e0',correctedByEventId:'e3'}]}}],relations:[],events:[],eventAttributes:[]};
 const result=searchStructuredMemory(graph,'Pompa');const diagnostic=result.temporalAttributeDiagnostics[0];assert.equal(diagnostic.classification,'temporal_change');assert.equal(diagnostic.currentValue,'repaired');assert.equal(diagnostic.correctedRecordsExcluded,1);assert.equal(diagnostic.values.length,2);assert.ok(result.evidence.some(row=>row.kind==='temporal_attribute_diagnostic'&&row.sourceId===diagnostic.sourceId));require('./ai/structured-recall-browser.js');assert.deepEqual(globalThis.CollectorStructuredRecall.searchStructuredMemory(graph,'Pompa'),result);
 const conflictGraph={...graph,entities:[{...graph.entities[0],attributeHistory:{condition:[{value:'broken',eventId:'a'},{value:'repaired',eventId:'b'}]}}]};assert.equal(searchStructuredMemory(conflictGraph,'Pompa').temporalAttributeDiagnostics[0].classification,'potential_conflict');
 const {safeRecallEvidence}=require('./ai/context-sanitizer');const safe=safeRecallEvidence([diagnostic,{...diagnostic,rawTranscript:'secret',values:[{value:'broken',validAt:'2026-11-24',eventId:'e1',rawAudio:'secret'}]}]);assert.equal(safe.length,2);assert.ok(!JSON.stringify(safe).includes('secret'));
});

test('Recall ranks event evidence by semantic match and entity anchoring instead of selecting only the newest tail',()=>{
 const events=[{id:'old-exact',timestamp:'2026-11-01T00:00:00Z',payload:{summary:'Pump filter was replaced',entityIds:{pump:'p'}},operations:[]},{id:'new-linked',timestamp:'2026-11-27T00:00:00Z',payload:{summary:'General workshop update',entityIds:{pump:'p'}},operations:[]}];
 const fixture={entities:[{id:'p',name:'Pump',type:'object',attributes:{}}],relations:[],events,eventAttributes:[]};
 const result=searchStructuredMemory(fixture,'pump filter replaced',{limit:1});
 assert.deepEqual(result.events.map(event=>event.id),['old-exact']);
 assert.ok(result.evidence.find(row=>row.id==='old-exact').relevance>result.evidence.find(row=>row.id==='new-linked').relevance);
});
