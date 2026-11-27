'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('./ai/structured-recall-browser.js');
const {searchStructuredMemory}=globalThis.CollectorStructuredRecall;
const state={entities:[{id:'p1',name:'Mihai',type:'person',attributes:{aliases:['Mike'],role:'supplier'}},{id:'o1',name:'Pompa acvariu',type:'object',attributes:{condition:'needs repair'}}],relations:[{id:'r1',sourceId:'p1',targetId:'o1',type:'promised_to_send'}],events:[{id:'ev1',timestamp:'2026-11-26T12:00:00Z',payload:{summary:'Mihai promised the old pump for testing',entityIds:{person:'p1',object:'o1'}},operations:[],status:'committed',certainty:'certain'}],eventAttributes:[{eventId:'ev1',name:'context',value:'aquarium'}]};
test('browser recall resolves unicode terms, aliases and linked source evidence',()=>{
 const r=searchStructuredMemory(state,'Mihai pompa');
 assert.equal(r.entities.length,2);assert.equal(r.relations.length,1);assert.equal(r.events.length,1);
 assert.ok(r.evidence.some(x=>x.kind==='event'&&x.id==='ev1'));
 assert.ok(r.evidence.some(x=>x.kind==='event_attribute'&&x.value==='aquarium'));
});
test('browser recall respects temporal bounds and returns no evidence for empty query',()=>{
 assert.equal(searchStructuredMemory(state,'Mihai',{from:'2026-11-27'}).events.length,0);
 assert.equal(searchStructuredMemory(state,'').evidence.length,0);
});


test('browser recall returns bounded collections and rejects invalid time ranges',()=>{
 const large=searchStructuredMemory(state,'Mihai pompa',{limit:999});
 for(const key of ['entities','relations','events','attributes','eventAttributes','evidence'])assert.ok(large[key].length<=100,key);
 const small=searchStructuredMemory(state,'Mihai pompa',{limit:-1});
 for(const key of ['entities','relations','events','attributes','eventAttributes','evidence'])assert.ok(small[key].length<=1,key);
 assert.throws(()=>searchStructuredMemory(state,'Mihai',{from:'bad-date'}),/from must be a valid date/);
 assert.throws(()=>searchStructuredMemory(state,'Mihai',{from:'2026-11-28',to:'2026-11-26'}),/earlier than or equal/);
});
test('browser recall includes event attributes only when their event is in the result set',()=>{
 const r=searchStructuredMemory(state,'aquarium');
 assert.equal(r.events[0].id,'ev1');
 assert.deepEqual(r.eventAttributes,[{eventId:'ev1',name:'context',value:'aquarium'}]);
 assert.equal(searchStructuredMemory(state,'unrelated').eventAttributes.length,0);
});

test('browser recall ranks exact direct matches ahead of weaker direct matches and linked context',()=>{
 const graph={entities:[{id:'a',name:'Pump',type:'object',attributes:{}},{id:'b',name:'Pump maintenance notes',type:'document',attributes:{}},{id:'c',name:'Workshop',type:'location',attributes:{}}],relations:[{id:'r',sourceId:'a',targetId:'c',type:'stored_at'}],events:[],eventAttributes:[]};
 const result=searchStructuredMemory(graph,'pump');const direct=result.evidence.filter(row=>row.kind==='entity');assert.equal(result.evidence[0].id,'a');assert.ok(direct[0].relevance>direct[1].relevance);
});

test('browser recall expands relationship context and exposes historical facts as AI evidence',()=>{
 const graph={entities:[{id:'p1',name:'Mihai',type:'person',attributes:{role:'supplier'}},{id:'o1',name:'Pompa',type:'object',attributes:{condition:'broken'},attributeHistory:{condition:[{at:'2026-11-25T10:00:00Z',validAt:'2026-11-25',value:'broken',previous:'working',certainty:'certain',eventId:'ev-h1'}]}},{id:'l1',name:'Atelier',type:'location',attributes:{address:'Sibiu'}}],relations:[{id:'r1',sourceId:'p1',targetId:'o1',type:'brings'},{id:'r2',sourceId:'o1',targetId:'l1',type:'located_at'}],events:[{id:'ev1',timestamp:'2026-11-26T12:00:00Z',payload:{summary:'Mihai brings pump',entityIds:{person:'p1',object:'o1'}},operations:[]}],eventAttributes:[]};
 const result=searchStructuredMemory(graph,'Mihai');
 assert.deepEqual(result.entities.map(e=>e.id),['p1','o1','l1']);assert.equal(result.relations.length,2);
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


test('browser Recall uses bounded multi-hop expansion and provenance paths',()=>{const graph={entities:[{id:'a',name:'Pump',type:'object',attributes:{}},{id:'b',name:'Workshop',type:'location',attributes:{}},{id:'c',name:'Supplier',type:'person',attributes:{}},{id:'d',name:'Remote',type:'object',attributes:{}}],relations:[{id:'r1',sourceId:'a',targetId:'b',type:'stored_at'},{id:'r2',sourceId:'b',targetId:'c',type:'owned_by'},{id:'r3',sourceId:'c',targetId:'b',type:'cycle'}],events:[],eventAttributes:[]};const result=searchStructuredMemory(graph,'Pump');assert.deepEqual(result.entities.map(e=>e.id),['a','b','c']);assert.ok(!result.entities.some(e=>e.id==='d'));assert.deepEqual(result.relations.map(r=>r.id),['r1','r2','r3']);const linked=result.evidence.find(x=>x.kind==='linked_entity'&&x.id==='c');assert.equal(linked.graphDepth,2);assert.deepEqual(linked.graphPath,['r1','r2']);});

test('browser Recall temporal diagnostics distinguish dated change from possible conflict',()=>{const graph={entities:[{id:'x',name:'Pompa',type:'object',attributes:{condition:'repaired'},attributeHistory:{condition:[{value:'broken',validAt:'2026-11-24',eventId:'e1'},{value:'repaired',validAt:'2026-11-26',eventId:'e2'}]}}],relations:[],events:[],eventAttributes:[]};const result=searchStructuredMemory(graph,'Pompa');assert.equal(result.temporalAttributeDiagnostics[0].classification,'temporal_change');assert.equal(result.temporalAttributeDiagnostics[0].values.length,2);});

test('browser Recall ranks relevant event evidence ahead of merely recent linked events',()=>{
 const events=[{id:'old-exact',timestamp:'2026-11-01T00:00:00Z',payload:{summary:'Pump filter was replaced',entityIds:{pump:'p'}},operations:[]},{id:'new-linked',timestamp:'2026-11-27T00:00:00Z',payload:{summary:'General workshop update',entityIds:{pump:'p'}},operations:[]}];
 const fixture={entities:[{id:'p',name:'Pump',type:'object',attributes:{}}],relations:[],events,eventAttributes:[]};
 const result=searchStructuredMemory(fixture,'pump filter replaced',{limit:2});
 assert.deepEqual(result.events.map(event=>event.id),['old-exact','new-linked']);
 assert.ok(result.evidence.find(row=>row.id==='old-exact').relevance>result.evidence.find(row=>row.id==='new-linked').relevance);
});
