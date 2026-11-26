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
 assert.match(s,/persistState:async next=>!integrityBlocked&&!localDataErasing&&await persistRaw\(next\)/);
 assert.match(s,/\.preview\(command\)/);
 assert.match(s,/\.execute\(command,\{confirmed:true\}\)/);
 assert.match(s,/publishState:async next=>\{if\(localDataErasing\)throw Error\('Datele locale sunt în curs de ștergere\.'\);db=next;render\(\)\}/);
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
 const clearSection=app.slice(clearHandler,app.indexOf("input.addEventListener('input'",clearHandler));
 const invalidate=clearSection.indexOf('const version=++writeVersion;');
 const emptyBranch=clearSection.indexOf('if(!input.value.trim())');
 assert.ok(invalidate>=0&&invalidate<emptyBranch,'clear invalidates pending draft restore before the empty-input branch');
 assert.ok(clearSection.includes("await enqueueDraftWrite('',version)"),'clear must serialize removal after pending autosaves');
});
test('sesiunea vocală continuă trimite transcriptul către AI, nu parserul local',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const start=app.indexOf('function startVoiceSession()');
 const end=app.indexOf('function startVoiceCapture()',start);
 const section=app.slice(start,end);
 assert.ok(section.includes('runAICommand()'),'voice-session final transcript must go through AI interpretation');
 assert.ok(section.includes('value=transcript'),'do not force transcript into a deterministic observation template');
 assert.ok(!section.includes('runCommand()'),'avoid local parser fallback that bypasses AI semantics');
});
test('AI memory candidates are only persisted through explicit Core preview and confirmation',()=>{
 const app=fs.readFileSync('app.js','utf8');
 assert.ok(app.includes('data-ai-memory-save'),'AI summary/facts expose a save-to-memory action');
 assert.ok(app.includes("operation:'event.note'"),'memory is persisted as an append-only Core note');
 assert.ok(app.includes('ensureAICorePort().preview(command)'),'memory save must preview through Core');
 assert.ok(app.includes('execute(command,{confirmed:true})'),'memory save must require explicit confirmation');
 assert.ok(app.includes("collector-ai-memory:'+turnId"),'memory idempotency is scoped to AI turn');
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

test('UI disclose explicit datele trimise cloud înainte de folosirea AI',()=>{
 for(const html of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
  const source=fs.readFileSync(html,'utf8');
  assert.ok(source.includes('textul și contextul limitat'),html+' trebuie să explice ce trimite AI');
  assert.ok(source.includes('jurnalul complet și fișierele audio nu sunt trimise'),html+' trebuie să precizeze limitele datelor');
  assert.ok(source.includes('salvarea cere confirmarea ta'),html+' trebuie să păstreze confirmarea explicită');
 }
});

test('structured memory pipeline loads before app in all entry points and routes extraction through Core preview',()=>{
 for(const html of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
  const source=fs.readFileSync(html,'utf8');
  assert.ok(source.includes('ai/structured-memory-browser.js'));
  assert.ok(source.indexOf('ai/structured-memory-browser.js')<source.indexOf('app.js'));
 }
 const app=fs.readFileSync('app.js','utf8');
 assert.ok(app.includes('CollectorStructuredMemory.validateExtraction'));
 assert.ok(app.includes('CollectorStructuredMemory.resolveEntities(sm,db)'));
 assert.ok(app.includes('CollectorStructuredMemory.createCommand(sm,resolutions'));
 assert.ok(app.includes('Am găsit identități ambigue'));
});


test('Core Port reads persisted storage independently and validates it before publishing',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const port=fs.readFileSync('ai/core-port-browser.js','utf8');
 assert.ok(app.includes('readPersistedState:async()=>'));
 assert.ok(app.includes('storageAdapter.readRaw(KEY)'));
 assert.ok(app.includes('return E.validateImport(JSON.parse(raw))'));
 assert.ok(port.includes('this.store.readPersistedState()'));
 assert.ok(port.includes("status:'verification_failed'"));
 assert.ok(port.includes('item.intentKey === command.idempotencyKey'));
});


test('A failed independent readback locks further writes until journal revalidation',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const handler=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 assert.ok(handler.includes("result.status==='verification_failed'"));
 assert.ok(handler.includes('integrityBlocked=true'));
 assert.ok(handler.includes('Reîncarcă aplicația'));
 assert.ok(handler.includes('setAppStatus('));
});


test('Audio Transcrie + AI continues into AI interpretation and retains source until confirmed Core save',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const start=app.indexOf("const transcribe=document.createElement('button')");
 const end=app.indexOf("const rename=document.createElement('button')",start);
 const flow=app.slice(start,end);
 assert.ok(flow.includes('activeAudioRecordingId=record.id'));
 assert.ok(flow.includes('await runAICommand()'));
 assert.doesNotMatch(flow,/CollectorAudioStore\.remove/);
 assert.ok(app.includes('stableAudioCaptureTurnId(sourceRecordingId,text)'));
 assert.ok(app.includes("sourceId=sourceRecordingId?'audio:'+sourceRecordingId"));
 assert.ok(app.includes('audioRecordingId:sourceRecordingId'));
 const confirm=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 assert.ok(confirm.includes('Șterge audio original'));
 assert.ok(confirm.includes("confirm('Datele structurate sunt salvate și verificate în jurnal."));
 assert.ok(confirm.includes('await CollectorAudioStore.remove(extrasState.audioRecordingId)'));
});

test('Stable audio capture key changes with transcript and is deterministic for retries',()=>{
 const app=fs.readFileSync('app.js','utf8');
 assert.match(app,/function stableAudioCaptureTurnId\(recordingId,transcript\)/);
 assert.ok(app.includes('primary=Math.imul(primary^code,16777619)'));
 assert.ok(app.includes('secondary=Math.imul(secondary^(code+index),2246822519)'));
 assert.ok(app.includes("return 'audio:'+String(recordingId)+':'+value.length+':'+fingerprint"));
});


test('Concurrent audio AI runs are rejected and each interpretation keeps its original source snapshot',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(run.includes('sourceRecordingId=activeAudioRecordingId'));
 assert.ok(run.includes('if(aiInterpretationPending||pendingCoreCommand||coreCommitPending)'));
 assert.ok(run.includes('aiInterpretationPending=true'));
 assert.ok(run.includes('aiInterpretationPending=false'));
 assert.ok(run.includes('stableAudioCaptureTurnId(sourceRecordingId,text)'));
 const audio=app.slice(app.indexOf("const transcribe=document.createElement('button')"),app.indexOf("const rename=document.createElement('button')"));
 assert.ok(audio.includes('if(aiInterpretationPending||pendingCoreCommand||coreCommitPending)'));
 assert.ok(audio.includes('activeAudioRecordingId=null'));
});


test('AI and Core confirmation have a single-flight guard until the command resolves',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const confirm=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(confirm.includes('if(!pendingCoreCommand||coreCommitPending)return'));
 assert.ok(confirm.includes('coreCommitPending=true'));
 assert.ok(confirm.includes('finally{coreCommitPending=false}'));
 assert.ok(run.includes('pendingCoreCommand||coreCommitPending'));
});


test('Work recovery diagnostics omit successfully retained audio checkpoints',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const refresh=app.slice(app.indexOf('async function refreshAudioLifecycleRecovery'),app.indexOf('async function initializeCollectorApp'));
 assert.ok(refresh.includes("!['completed','source_retained'].includes(cp.state)"));
 assert.ok(refresh.includes('Nu există procesări AI audio întrerupte'));
});


test('Work recovery lists only actionable interrupted checkpoints and offers an explicit manual retry',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const recovery=app.slice(app.indexOf('async function refreshAudioLifecycleRecovery'),app.indexOf('async function initializeCollectorApp'));
 assert.ok(recovery.includes("!['completed','source_retained','captured'].includes(cp.state)"));
 assert.ok(recovery.includes('data-audio-lifecycle-retry'));
 assert.ok(recovery.includes('data-audio-transcribe-id'));
 assert.ok(recovery.includes('await renderAudioRecordings()'));
 assert.ok(recovery.includes('target.click()'));
 assert.ok(recovery.includes('if(!target)throw Error'));
 assert.ok(recovery.includes('nimic nu este retranscris sau șters automat'));
});

test('audio checkpoint records manual stages without persisting transcript or audio payload',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const helper=app.slice(app.indexOf('async function writeAudioLifecycleCheckpoint'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(helper.includes("idempotencyKey:'audio:'+String(recordingId)"));
 assert.ok(helper.includes("state==='source_retained'"));
 assert.ok(helper.includes('persistenceVerified:verified'));
 assert.ok(helper.includes('sourceRetained:state===\'source_retained\''));
 assert.ok(helper.includes('persistResult={eventId:String(eventId),intentKey:String(intentKey||\'\')}'));
 assert.doesNotMatch(helper,/transcript|audioData|blob:/i);
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(run.includes("writeAudioLifecycleCheckpoint(sourceRecordingId,'validated'"));
 assert.ok(run.includes("writeAudioLifecycleCheckpoint(sourceRecordingId,'failed'"));
 const confirm=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 assert.ok(confirm.includes("writeAudioLifecycleCheckpoint(extrasState.audioRecordingId,'source_retained'"));
 assert.ok(confirm.includes("writeAudioLifecycleCheckpoint(extrasState.audioRecordingId,'audio_deletion_pending'"));
 assert.ok(confirm.includes("writeAudioLifecycleCheckpoint(extrasState.audioRecordingId,'completed'"));
});


test('Audio deletion requires its checkpoint event to be found in the independently validated persisted Core journal',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const verify=app.slice(app.indexOf('async function verifyAudioCheckpointEvent'),app.indexOf('async function renderAudioRecordings'));
 const deletion=app.slice(app.indexOf('async function deleteAudioFromVerifiedCheckpoint'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(verify.includes('storageAdapter.readRaw(KEY)'));
 assert.ok(verify.includes('E.validateImport(JSON.parse(raw))'));
 assert.ok(verify.includes('item.id===cp.persistResult.eventId&&item.intentKey===cp.persistResult.intentKey'));
 assert.ok(deletion.includes("['source_retained','audio_deletion_pending'].includes(cp.state)"));
 assert.ok(deletion.includes('await verifyAudioCheckpointEvent(cp)'));
 assert.ok(deletion.includes("writeAudioLifecycleCheckpoint(recordingId,'audio_deletion_pending'"));
 assert.ok(deletion.includes('await CollectorAudioStore.remove(recordingId)'));
 assert.ok(deletion.includes('await verifyAudioCheckpointEvent(await store.get(recordingId))'));
 assert.ok(deletion.includes("writeAudioLifecycleCheckpoint(recordingId,'completed'"));
});

test('A Core preview duplicate from an audio recording is verified instead of discarded',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(run.includes("preview.status==='duplicate'&&sourceRecordingId"));
 assert.ok(run.includes('pendingCoreCommand=command;'));
 assert.ok(run.includes('await confirmCoreCommand()'));
});
