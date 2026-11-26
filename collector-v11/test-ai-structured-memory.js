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
