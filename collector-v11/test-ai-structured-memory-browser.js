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


test('browser resolver flags near-duplicate names without auto-linking them',()=>{
 const state={entities:[{id:'p1',name:'Monstera Deliciosa Variegata',type:'plant'}]};
 const extraction=M.validateExtraction({entities:[{key:'plant',name:'Monstera Deliciosa Variegatta',type:'plant'}],facts:[],relations:[]});
 const result=M.resolveEntities(extraction,state)[0];
 assert.equal(result.match,'ambiguous');
 assert.equal(result.resolvedId,null);
 assert.deepEqual(result.candidateIds,['p1']);
});

test('browser resolver does not confuse a distinct cultivar with a typo',()=>{
 const state={entities:[{id:'p1',name:'Philodendron Micans',type:'plant'}]};
 const extraction=M.validateExtraction({entities:[{key:'plant',name:'Philodendron Micans Pink Mint',type:'plant'}],facts:[],relations:[]});
 assert.equal(M.resolveEntities(extraction,state)[0].match,'new');
});


test('browser structured memory clarification is trimmed without being discarded',()=>{
 const x=M.validateExtraction({entities:[],facts:[],relations:[],clarification:'  Confirm which plant?  '});
 assert.equal(x.clarification,'Confirm which plant?');
});
