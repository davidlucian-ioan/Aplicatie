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
test('Work draft controls and quick templates exist in every UI entry point',()=>{
 for(const html of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
  const source=fs.readFileSync(html,'utf8');
  assert.match(source,/<textarea id=\"commandInput\"/);
  assert.match(source,/id=\"workDraftStatus\"[^>]*role=\"status\"/);
  assert.match(source,/id=\"clearWorkDraft\"/);
  assert.match(source,/data-command-template=\"Observație: \"/);
  assert.ok(source.includes('data-command-template="Înregistrează [atribut] pentru [entitate] = [valoare]"'));
 }
 const app=fs.readFileSync('app.js','utf8');
 const clearHandler=app.indexOf("clear?.addEventListener('click',async()=>{");
 assert.ok(clearHandler>=0);
 assert.ok(app.indexOf('++writeVersion;',clearHandler)<app.indexOf('if(!input.value.trim())',clearHandler),'clear invalidates pending draft restore before the empty-input branch');
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

test('ștergerea integrală locală este disponibilă în toate entry point-urile și păstrează separat cloud/billing',()=>{
 for(const html of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
  const source=fs.readFileSync(html,'utf8');
  assert.ok(source.includes('id="clearLocalData"'),html+' trebuie să expună ștergerea locală');
  assert.ok(source.includes('id="localDataClearStatus"'),html+' trebuie să expună statusul ștergerii');
  assert.ok(source.includes('rămân active'),html+' trebuie să explice separarea cloud și billing');
 }
 const app=fs.readFileSync('app.js','utf8');
 assert.ok(app.includes('CollectorAudioStore.clearAll()'));
 assert.ok(app.includes('CollectorReminders?.clearAll?.()'));
 assert.ok(app.includes('storageAdapter.clearCollectorData()'));
 assert.ok(app.includes('CollectorNativeAudioRecorder?.discardPending?.()'));
 assert.match(app,/audioStartPending\|\|audioRecorder\|\|nativeAudioSession/);
 assert.ok(app.includes('if(localDataErasing)return Promise.reject'));
});
