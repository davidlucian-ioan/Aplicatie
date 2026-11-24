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
