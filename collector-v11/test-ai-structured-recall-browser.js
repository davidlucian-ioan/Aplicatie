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
