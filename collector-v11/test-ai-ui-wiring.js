'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
for(const html of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
 test(html+' încarcă Browser Core Port înainte de app.js',()=>{
  const s=fs.readFileSync(html,'utf8');
  assert.ok(s.indexOf('ai/core-port-browser.js')>s.indexOf('engine.js'));
  assert.ok(s.indexOf('ai/core-port-browser.js')<s.indexOf('app.js'));
  assert.ok(s.indexOf('storage-adapter.js')<s.indexOf('app.js'));
 });
}
test('UI folosește preview și execute prin Core Port, cu StorageAdapter asincron',()=>{
 const s=fs.readFileSync('app.js','utf8');
 assert.match(s,/new Port\(\{core:E,store:/);
 assert.match(s,/storageAdapter\.writeRaw\(KEY,JSON\.stringify\(x\)\)/);
 assert.doesNotMatch(s,/localStorage\.(?:getItem|setItem|removeItem)/);
 assert.match(s,/storageAdapter\.readRaw\(WORK_DRAFT_KEY\)/);
 assert.match(s,/storageAdapter\[\(value\.trim\(\)\?'writeRaw':'removeRaw'\)\]/);
 assert.match(s,/persistState:async next=>!integrityBlocked&&await persistRaw\(next\)/);
 assert.match(s,/\.preview\(command\)/);
 assert.match(s,/\.execute\(command,\{confirmed:true\}\)/);
 assert.match(s,/publishState:async next=>\{db=next;render\(\)\}/);
});
test('UI expune providerul OpenAI separat de interpretarea locală',()=>{
 const html=fs.readFileSync('index-server.html','utf8');
 const app=fs.readFileSync('app.js','utf8');
 assert.ok(html.includes('id="parseWithAI"'));
 assert.ok(html.includes('ai/provider-openai-browser.js'));
 assert.ok(app.includes('CollectorOpenAIProvider.interpret'));
 assert.ok(app.includes('ensureAICorePort().preview(command)'));
 assert.ok(app.includes('confirmCoreCommand'));
});
test('contextul trimis providerului conține doar metadate, fără jurnal',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const start=app.indexOf('const context={',app.indexOf('async function runAICommand'));
 const end=app.indexOf('};',start)+2;
 const context=app.slice(start,end);
 assert.match(context,/entities:db\.entities\.slice\(0,150\)\.map/);
 assert.match(context,/attributes:db\.attributes\.slice\(0,100\)\.map/);
 assert.doesNotMatch(context,/events/);
});
