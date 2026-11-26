'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('./ai/structured-memory-browser.js');
const M=globalThis.CollectorStructuredMemory;
test('browser entity resolution preserves existing aliases when extraction proposes new ones',()=>{
 const state={entities:[{id:'e1',name:'Mihai',type:'person',attributes:{aliases:['Mike','M. Pop']}}]};
 const extraction=M.validateExtraction({entities:[{key:'p',name:'Mihai',type:'person',aliases:['Michael',' mike ']}],facts:[],relations:[]});
 const resolved=M.resolveEntities(extraction,state);
 assert.deepEqual(resolved[0].aliases,['Mike','M. Pop','Michael']);
 const command=M.createCommand(extraction,resolved,{captureId:'browser-alias-test'});
 const write=command.operations.find(op=>op.operation==='attribute.set'&&op.data.name==='aliases');
 assert.deepEqual(write.data.value,['Mike','M. Pop','Michael']);
});
test('browser entity resolution retains aliases for explicit ID links',()=>{
 const state={entities:[{id:'e1',name:'Mihai',type:'person',attributes:{aliases:['Mike']}}]};
 const extraction=M.validateExtraction({entities:[{key:'p',name:'Mihai',type:'person',existingId:'e1',aliases:['Michael']}],facts:[],relations:[]});
 assert.deepEqual(M.resolveEntities(extraction,state)[0].aliases,['Mike','Michael']);
});

test('browser validator rejects invalid certainty and invalid temporal data',()=>{
 assert.throws(()=>M.validateExtraction({entities:[{key:'p',name:'Mihai'}],facts:[{subject:'p',name:'x',value:1,certainty:'probably'}],relations:[]}),/certainty/);
 assert.throws(()=>M.validateExtraction({entities:[{key:'p',name:'Mihai'}],facts:[{subject:'p',name:'x',value:1,validAt:'2026-11-26T12:30:00'}],relations:[]}),/ISO date/);
});
