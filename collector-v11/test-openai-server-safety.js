'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

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
