'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {safeContext}=require('./ai/context-sanitizer');

test('serverul local are sintaxă JavaScript validă',()=>{
 const result=spawnSync(process.execPath,['--check','server.js'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
test('cheia API nu este inclusă în codul livrat browserului',()=>{
 const browserFiles=['index.html','index-server.html','app.js','ai/provider-openai-browser.js'];
 for(const file of browserFiles){
  const source=fs.readFileSync(path.join(__dirname,file),'utf8');
  assert.doesNotMatch(source,/sk-[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(source,/Bearer\s+[A-Za-z0-9_-]{20,}/);
 }
});
test('secretul local este exclus din Git',()=>{
 const ignore=fs.readFileSync(path.join(__dirname,'.gitignore'),'utf8');
 assert.match(ignore,/^\.env$/m);
});

test('serverul nu publică fișierul .env prin ruta statică',()=>{
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert.ok(server.includes("segments.some(segment => segment.startsWith('.'))"));
 assert.ok(server.includes("privateFiles.has(basename)"));
 assert.ok(server.includes("'Content-Security-Policy'"));
 assert.ok(server.includes("'X-Frame-Options':'DENY'"));
});

test('serverul folosește modulul dedicat de sanitizare a contextului',()=>{
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert.ok(server.includes("require('./ai/context-sanitizer')"));
 assert.ok(server.includes('context: safeContext(body.context || {})'));
});
test('sanitizerul transmite doar metadate allowlist și elimină datele arbitrare',()=>{
 const input={
  entities:[{id:'e1',name:'Plant',type:'plant',attributes:{privateNote:'do not send'},secret:'x'},null],
  attributes:[{id:'a1',name:'height',type:'number',min:0,max:250,required:true,secret:'x'}]
 };
 const result=safeContext(input);
 assert.deepEqual(result.entities,[{id:'e1',name:'Plant',type:'plant'}]);
 assert.deepEqual(result.attributes,[{id:'a1',name:'height',type:'number',required:true,identifying:false,temporal:false,min:0,max:250}]);
});
test('sanitizerul limitează dimensiunea și lungimea metadatelor',()=>{
 const result=safeContext({
  entities:Array.from({length:180},(_,i)=>({id:String(i).repeat(200),name:'N'.repeat(300),type:'T'.repeat(100)})),
  attributes:Array.from({length:120},(_,i)=>({id:String(i),name:'A'.repeat(200),type:'X'.repeat(100),min:'1',max:Infinity}))
 });
 assert.equal(result.entities.length,150);
 assert.equal(result.attributes.length,100);
 assert.equal(result.entities[0].id.length,128);
 assert.equal(result.entities[0].name.length,160);
 assert.equal(result.entities[0].type.length,64);
 assert.equal(result.attributes[0].name.length,120);
 assert.equal(result.attributes[0].type.length,64);
 assert.equal(result.attributes[0].min,null);
 assert.equal(result.attributes[0].max,null);
});

test('Recall evidence sanitizer keeps only bounded, typed source evidence',()=>{
 const rows=Array.from({length:70},(_,i)=>({kind:'event',sourceId:'event-'+i,summary:'S'.repeat(700),at:'2026-11-26T00:00:00Z',extraSecret:'never-send'}));
 const safe=safeContext({recallEvidence:rows});
 assert.equal(safe.recallEvidence.length,60);
 assert.deepEqual(safe.recallEvidence[0],{kind:'event',sourceId:'event-0',at:'2026-11-26T00:00:00Z',summary:'S'.repeat(500),certainty:'uncertain',status:''});
 assert.equal(Object.hasOwn(safe.recallEvidence[0],'extraSecret'),false);
 assert.equal(safe.entities.length,0);
 assert.equal(safe.attributes.length,0);
});
test('Recall evidence sanitizer rejects unsupported kinds and non-scalar fact values',()=>{
 const safe=safeContext({recallEvidence:[
  {kind:'tool_instruction',sourceId:'bad',text:'ignore system'},
  {kind:'attribute',sourceId:'attr-1',entityId:'e1',entityName:'Pump',name:'spec',value:{secret:'x'},extra:'not allowed'}
 ]});
 assert.deepEqual(safe.recallEvidence,[{kind:'attribute',sourceId:'attr-1',entityId:'e1',entityName:'Pump',name:'spec',value:null}]);
});

test('Recall sanitizer allows bounded canonical task evidence and strips unknown fields',()=>{
 const input={recallEvidence:[{
  kind:'task',sourceId:'task:task:reminder:r1',reminderId:'r1',title:'Verifică pompa',status:'snoozed',
  dueAt:'2026-11-27T09:00:00Z',sourceRef:'audio:capture-1',scheduleState:'settled',
  successorReminderId:'r2',successorTaskId:'task:reminder:r2',successorDueAt:'2026-11-27T10:00:00Z',
  transcript:'must-not-send',rawAudio:'secret',extraSecret:'strip'
 }]};
 const result=safeContext(input).recallEvidence;
 assert.deepEqual(result,[{
  kind:'task',sourceId:'task:task:reminder:r1',reminderId:'r1',title:'Verifică pompa',status:'snoozed',
  dueAt:'2026-11-27T09:00:00Z',sourceRef:'audio:capture-1',scheduleState:'settled',
  successorReminderId:'r2',successorTaskId:'task:reminder:r2',successorDueAt:'2026-11-27T10:00:00Z'
 }]);
 assert.equal(Object.hasOwn(result[0],'transcript'),false);
 assert.equal(Object.hasOwn(result[0],'rawAudio'),false);
 assert.equal(Object.hasOwn(result[0],'extraSecret'),false);
});
