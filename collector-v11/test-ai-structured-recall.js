'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {searchStructuredMemory}=require('./ai/structured-recall');

const state={
 entities:[{id:'p1',name:'Mihai',type:'person',attributes:{role:'supplier'}},{id:'o1',name:'Pump',type:'object',attributes:{condition:'needs repair'}},{id:'l1',name:'Workshop Sibiu',type:'location',attributes:{}}],
 relations:[{id:'r1',sourceId:'p1',targetId:'o1',type:'brings',startedAt:'2026-11-27'}],
 events:[{id:'ev1',timestamp:'2026-11-26T12:00:00Z',payload:{entityIds:{person:'p1',object:'o1'},summary:'Mihai plans to bring pump Friday'},operations:[{operation:'event.note',data:{description:'Mihai plans to bring pump Friday'}}],certainty:'uncertain',status:'committed'},{id:'ev2',timestamp:'2026-11-20T12:00:00Z',payload:{},operations:[{operation:'event.note',data:{description:'Unrelated meeting'}}]}],
 eventAttributes:[]
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
