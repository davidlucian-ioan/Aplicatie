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
 assert.ok(server.includes("pathname === '/.env'"));
 assert.ok(server.includes("pathname !== '/.env.example'"));
});

test('serverul transmite către provider doar câmpurile explicite din context',()=>{
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert.match(server,/name: String\(e\.name \|\| ''\)\.slice\(0, 160\)/);
 assert.match(server,/type: String\(e\.type \|\| 'generic'\)\.slice\(0, 64\)/);
 assert.doesNotMatch(server,/attributes: e\.attributes/);
 assert.match(server,/Number\.isFinite\(a\.min\)/);
 assert.match(server,/Number\.isFinite\(a\.max\)/);
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
