'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('./ai/structured-memory');

test('validator bounds arrays and validates local entity references',()=>{
 assert.throws(()=>M.validateExtraction({entities:[],facts:[{subject:'missing',name:'x',value:'y'}]}),/subject/);
 assert.throws(()=>M.validateExtraction({entities:Array(31).fill({key:'x',name:'x'})}),/limits/);
});
test('extraction normalizes facts, aliases and uncertainty',()=>{
 const x=M.validateExtraction({summary:'Met Mihai',entities:[{key:'person',name:'Mihai',type:'person',aliases:['Mike']}],facts:[{subject:'person',name:'context',value:'supplier',certainty:'uncertain'}],relations:[],confidence:.8});
 assert.equal(x.facts[0].certainty,'uncertain');
 assert.equal(x.entities[0].aliases[0],'Mike');
});
test('entity resolution exact normalized name only; no fuzzy silent merge',()=>{
 const state={entities:[{id:'e1',name:'Mihai Pop',type:'person'},{id:'e2',name:'Mihai',type:'person'}]};
 const x=M.validateExtraction({entities:[{key:'p',name:'Mihai',type:'person'}],facts:[],relations:[]});
 assert.equal(M.resolveEntities(x,state)[0].match,'exact');
 const y=M.validateExtraction({entities:[{key:'p',name:'Mihai P',type:'person'}],facts:[],relations:[]});
 assert.equal(M.resolveEntities(y,state)[0].match,'new');
});
test('ambiguous exact aliases are flagged rather than auto-merged',()=>{
 const state={entities:[{id:'e1',name:'Mike',type:'person'},{id:'e2',name:'Michael',type:'person'}]};
 const x=M.validateExtraction({entities:[{key:'p',name:'Mihai',type:'person',aliases:['Mike','Michael']}],facts:[],relations:[]});
 const r=M.resolveEntities(x,state)[0];
 assert.equal(r.match,'ambiguous');
 assert.equal(r.resolvedId,null);
 assert.equal(r.candidateIds.length,2);
});
test('builder creates entity, attribute, relation and note operations with stable IDs',()=>{
 const x=M.validateExtraction({summary:'Mihai brings pump Friday',entities:[{key:'p',name:'Mihai',type:'person'},{key:'o',name:'Pump',type:'object'}],facts:[{subject:'o',name:'condition',value:'needs repair'}],relations:[{source:'p',target:'o',type:'brings'}]});
 const r=M.resolveEntities(x,{entities:[]});
 const c=M.createCommand(x,r,{captureId:'capture-123'});
 assert.deepEqual(c.operations.map(o=>o.operation),['entity.create','entity.create','attribute.set','relation.create','event.note']);
 assert.equal(c.operations[3].data.sourceId,c.operations[0].target);
 assert.equal(c.operations[3].data.targetId,c.operations[1].target);
 assert.equal(c.idempotencyKey,'collector-memory-capture:capture-123');
 assert.equal(c.requiresConfirmation,true);
});
test('invalid capture id cannot produce a command',()=>{
 const x=M.validateExtraction({summary:'ok',entities:[],facts:[],relations:[]});
 assert.throws(()=>M.createCommand(x,[],{}),/captureId/);
});

test('exact entity match merges aliases without discarding existing canonical aliases',()=>{
 const state={entities:[{id:'p1',name:'Mihai',type:'person',attributes:{aliases:['Mike','M. Pop']}}]};
 const extraction=M.validateExtraction({entities:[{key:'p',name:'Mihai',type:'person',aliases:['Michael',' mike ']}],facts:[],relations:[]});
 const resolutions=M.resolveEntities(extraction,state);
 assert.deepEqual(resolutions[0].aliases,['Mike','M. Pop','Michael']);
 const command=M.createCommand(extraction,resolutions,{captureId:'alias-preserve'});
 const aliasWrite=command.operations.find(op=>op.operation==='attribute.set'&&op.data.name==='aliases');
 assert.deepEqual(aliasWrite.data.value,['Mike','M. Pop','Michael']);
});
test('explicit entity ID also preserves aliases and de-duplicates normalized spelling',()=>{
 const state={entities:[{id:'p1',name:'Mihai',type:'person',attributes:{aliases:['Mike','M. Pop']}}]};
 const extraction=M.validateExtraction({entities:[{key:'p',name:'Mihai',type:'person',existingId:'p1',aliases:['MIKE','Mihai P']}],facts:[],relations:[]});
 const result=M.resolveEntities(extraction,state)[0];
 assert.deepEqual(result.aliases,['Mike','M. Pop','Mihai P']);
});

test('validator rejects malformed certainty, confidence and temporal facts instead of promoting them',()=>{
 assert.throws(()=>M.validateExtraction({entities:[{key:'p',name:'Mihai'}],facts:[{subject:'p',name:'status',value:'x',certainty:'maybe'}],relations:[]}),/certainty/);
 assert.throws(()=>M.validateExtraction({entities:[],facts:[],relations:[],confidence:1.2}),/confidence/);
 assert.throws(()=>M.validateExtraction({entities:[{key:'p',name:'Mihai'}],facts:[{subject:'p',name:'status',value:'x',validAt:'2026-02-30'}],relations:[]}),/ISO date/);
 assert.throws(()=>M.validateExtraction({entities:[{key:'p',name:'Mihai'}],facts:[{subject:'p',name:'status',value:'x',validAt:'2026-11-26T15:00:00'}],relations:[]}),/ISO date/);
});
test('validator accepts date-only and timezone-aware temporal facts without losing the value',()=>{
 const x=M.validateExtraction({entities:[{key:'p',name:'Mihai'}],facts:[{subject:'p',name:'status',value:'active',validAt:'2026-11-26'},{subject:'p',name:'checked_at',value:'15:00',validAt:'2026-11-26T15:00:00+02:00'}],relations:[]});
 assert.equal(x.facts[0].validAt,'2026-11-26');
 assert.equal(x.facts[1].validAt,'2026-11-26T15:00:00+02:00');
});


test('near-duplicate entity names require clarification instead of silently creating a second entity',()=>{
 const state={entities:[{id:'p1',name:'Monstera Deliciosa Variegata',type:'plant'}]};
 const extraction=M.validateExtraction({entities:[{key:'plant',name:'Monstera Deliciosa Variegatta',type:'plant'}],facts:[],relations:[]});
 const result=M.resolveEntities(extraction,state)[0];
 assert.equal(result.match,'ambiguous');
 assert.equal(result.resolvedId,null);
 assert.deepEqual(result.candidateIds,['p1']);
 assert.ok(result.candidateMatches[0].similarity>=.92);
});

test('similar but legitimate cultivar names remain new entities',()=>{
 const state={entities:[{id:'p1',name:'Philodendron Micans',type:'plant'}]};
 const extraction=M.validateExtraction({entities:[{key:'plant',name:'Philodendron Micans Pink Mint',type:'plant'}],facts:[],relations:[]});
 assert.equal(M.resolveEntities(extraction,state)[0].match,'new');
});

test('fuzzy candidates are limited to the same entity type and threshold is configurable',()=>{
 const state={entities:[{id:'p1',name:'Monstera Deliciosa Variegata',type:'plant'},{id:'person-1',name:'Monstera Deliciosa Variegata',type:'person'}]};
 const extraction=M.validateExtraction({entities:[{key:'x',name:'Monstera Deliciosa Variegatta',type:'plant'}],facts:[],relations:[]});
 const defaultMatch=M.resolveEntities(extraction,state)[0];
 assert.deepEqual(defaultMatch.candidateIds,['p1']);
 assert.equal(M.resolveEntities(extraction,state,{threshold:.999})[0].match,'new');
 assert.throws(()=>M.resolveEntities(extraction,state,{threshold:1.5}),/threshold/);
});
