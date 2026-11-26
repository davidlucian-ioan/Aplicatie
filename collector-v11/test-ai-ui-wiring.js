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
 assert.ok(app.includes('CollectorReminders?.clearAll?.({discardPendingCoreEvents:true})'));
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
 const start=app.indexOf('async function transcribeAndInterpretAudioRecording');
 const end=app.indexOf('async function renderAudioRecordings',start);
 const flow=app.slice(start,end);
 assert.ok(flow.includes('runAICommand({audioRecordingId:recordingId})'));
 assert.ok(flow.includes('await runAICommand({audioRecordingId:recordingId})'));
 assert.ok(flow.includes('store.get(recordingId)'));
 assert.doesNotMatch(flow,/CollectorAudioStore\.remove/);
 assert.ok(app.includes('stableAudioCaptureTurnId(sourceRecordingId)'));
 assert.ok(app.includes("sourceId=sourceRecordingId?'audio:'+sourceRecordingId"));
 assert.ok(app.includes('audioRecordingId:sourceRecordingId'));
 const confirm=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 assert.ok(confirm.includes('keepAudioAfterCommit'));
 assert.ok(confirm.includes("deleteAudioFromVerifiedCheckpoint(extrasState.audioRecordingId,{confirmBeforeDelete:false})"));
 assert.ok(confirm.includes('audioCheckpointReady&&audioDraftCleared'));
 assert.ok(confirm.includes('data-audio-transcribe-id')===false);
});

test('Stable audio capture identity is deterministic across transcription retries',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const match=app.match(/function stableAudioCaptureTurnId\(recordingId\)\{[^}]+\}/);
 assert.ok(match);
 const keyFactory=Function('return ('+match[0]+')')();
 assert.equal(keyFactory('audio-1'),'audio:audio-1');
 assert.equal(keyFactory('audio-1'),keyFactory('audio-1'));
 assert.notEqual(keyFactory('audio-1'),keyFactory('audio-2'));
});


test('Concurrent audio AI runs are rejected and each interpretation keeps its original source snapshot',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(run.includes("sourceRecordingId=typeof audioRecordingId==='string'"));
 assert.ok(run.includes('if(aiInterpretationPending||pendingCoreCommand||coreCommitPending)'));
 assert.ok(run.includes('aiInterpretationPending=true'));
 assert.ok(run.includes('aiInterpretationPending=false'));
 assert.ok(run.includes('stableAudioCaptureTurnId(sourceRecordingId)'));
 const audio=app.slice(app.indexOf('async function transcribeAndInterpretAudioRecording'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(audio.includes('if(aiInterpretationPending||pendingCoreCommand||coreCommitPending)'));
 assert.ok(audio.includes('runAICommand({audioRecordingId:recordingId})'));
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
 assert.ok(refresh.includes("!['completed','source_retained','captured'].includes(cp.state)"));
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
 const helper=app.slice(app.indexOf('async function writeAudioLifecycleCheckpoint'),app.indexOf('async function clearAudioTranscriptCheckpoint'));
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
 assert.ok(confirm.includes("deleteAudioFromVerifiedCheckpoint(extrasState.audioRecordingId,{confirmBeforeDelete:false})"));
 const deletion=app.slice(app.indexOf('async function deleteAudioFromVerifiedCheckpoint'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(deletion.includes("writeAudioLifecycleCheckpoint(recordingId,'audio_deletion_pending'"));
 assert.ok(deletion.includes("writeAudioLifecycleCheckpoint(recordingId,'completed'"));
});


test('Audio deletion requires its checkpoint event to be found in the independently validated persisted Core journal',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const verify=app.slice(app.indexOf('async function verifyAudioCheckpointEvent'),app.indexOf('async function renderAudioRecordings'));
 const deletion=app.slice(app.indexOf('async function deleteAudioFromVerifiedCheckpoint'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(verify.includes('storageAdapter.readRaw(KEY)'));
 assert.ok(verify.includes('E.validateImport(JSON.parse(raw))'));
 assert.ok(verify.includes('Recovery.verifyCheckpointEvent(state,cp)'));
 const recovery=fs.readFileSync('ai/audio-capture-recovery.js','utf8');
 assert.ok(recovery.includes('event.payload?.sourceId!==sourceId'));
 assert.ok(recovery.includes('allowedIntentKeys.has(persist.intentKey)'));
 assert.ok(recovery.includes("event.status!=='committed'"));
 assert.ok(recovery.includes('verifyCheckpointEvent'));
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


test('The explicit deletion prompt is inside the reusable recovery-safe deletion service',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const deletion=app.slice(app.indexOf('async function deleteAudioFromVerifiedCheckpoint'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(deletion.includes("if(confirmBeforeDelete&&!confirm('Evenimentul structurat a fost verificat independent în jurnal."));
 assert.ok(deletion.includes('await CollectorAudioStore.remove(recordingId)'));
 assert.ok(deletion.includes('await verifyAudioCheckpointEvent(await store.get(recordingId))'));
});


test('Audio capture idempotency is bound to recording ID, not variable transcript output',()=>{
 const app=fs.readFileSync('app.js','utf8');
 assert.match(app,/function stableAudioCaptureTurnId\(recordingId\)\{if\(typeof recordingId!=='string'/);
 assert.ok(app.includes("return 'audio:'+recordingId}"));
 assert.ok(app.includes('stableAudioCaptureTurnId(sourceRecordingId)'));
 assert.ok(fs.readFileSync('ai/structured-memory-browser.js','utf8').includes("idempotencyKey:'collector-memory-capture:'+captureId"));
});

test('Verified audio commit clears the temporary Work transcript draft before offering source deletion',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const draft=app.slice(app.indexOf('function initializeWorkDraft'),app.indexOf('async function clearAllLocalData'));
 assert.ok(draft.includes('window.CollectorClearAudioDraft=async()=>'));
 assert.ok(draft.includes("storageAdapter.removeRaw(WORK_DRAFT_KEY)"));
 assert.ok(draft.includes('const remaining=await storageAdapter.readRaw(WORK_DRAFT_KEY)'));
 const confirm=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 assert.ok(confirm.includes('window.CollectorClearAudioDraft?.()'));
 assert.ok(confirm.includes('audioDraftCleared'));
 assert.ok(confirm.includes('stagedExtras.sourceId===expectedAudioSourceId'));
 assert.ok(confirm.includes('audioCheckpointReady&&audioDraftCleared'));
});


test('audio source deletion uses the storage adapter independent absence verifier',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const deletion=app.slice(app.indexOf('async function deleteAudioFromVerifiedCheckpoint'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(deletion.includes('CollectorAudioStore.verifyRemoved(recordingId)'));
 assert.ok(deletion.includes('AudioStore nu a confirmat independent eliminarea'));
});


test('The generic audio list delete action requires verified Core state after processing begins',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const remove=app.slice(app.indexOf('async function deleteAudioRecording'),app.indexOf('async function writeAudioLifecycleCheckpoint'));
 assert.ok(remove.includes('CollectorAudioLifecycleCheckpointStore'));
 assert.ok(remove.includes("['source_retained','audio_deletion_pending'].includes(checkpoint.state)"));
 assert.ok(remove.includes('deleteAudioFromVerifiedCheckpoint(recordId)'));
 assert.ok(remove.includes('if(checkpoint){'));
 assert.ok(remove.includes("if(!confirm('Această înregistrare nu are niciun checkpoint de procesare."));
 assert.ok(remove.includes('CollectorAudioStore.verifyRemoved(recordId)'));
 const ui=app.slice(app.indexOf('async function renderAudioRecordings'),app.indexOf('function initializeWorkDraft'));
 assert.ok(ui.includes("remove.addEventListener('click',()=>deleteAudioRecording(record.id)"));
});

test('Audio processing stops when its durable start checkpoint cannot be written',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const audio=app.slice(app.indexOf('async function transcribeAndInterpretAudioRecording'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(audio.includes("writeAudioLifecycleCheckpoint(recordingId,'processing',{incrementAttempt:true})"));
 assert.ok(audio.includes('Checkpoint-ul de recovery nu a putut fi salvat. Procesarea a fost oprită'));
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(run.includes("writeAudioLifecycleCheckpoint(sourceRecordingId,'processing')"));
 assert.ok(run.includes('Interpretarea a fost oprită'));
});


test('Browser transcription applies an upload timeout and parses structured cloud errors',()=>{
 const provider=fs.readFileSync('ai/provider-openai-browser.js','utf8');
 assert.ok(provider.includes("new AbortController(),timer=setTimeout(()=>controller.abort(),70_000)"));
 assert.ok(provider.includes("Accept:'application/json'"));
 assert.ok(provider.includes("apiUrl('/api/ai/transcribe')"));
 assert.ok(provider.includes('finally{clearTimeout(timer)}'));
 assert.ok(provider.includes('Înregistrarea originală este păstrată'));
});

test('A checkpoint write failure cannot strand the AI single-flight lock',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 const guardedTry=run.indexOf('try{');
 const checkpoint=run.indexOf("writeAudioLifecycleCheckpoint(sourceRecordingId,'processing')");
 const cleanup=run.indexOf('finally{aiInterpretationPending=false');
 assert.ok(guardedTry>=0&&checkpoint>guardedTry,'processing checkpoint must be inside the guarded try');
 assert.ok(cleanup>checkpoint,'all checkpoint/provider errors must release the interpretation lock');
});
test('Audio retention is opt-out by default, configurable, and fails safe to retention',()=>{
 const app=fs.readFileSync('app.js','utf8');
 assert.match(app,/AUDIO_RETENTION_KEY='collector_audio_retention_policy_v1'/);
 assert.match(app,/keepAudioAfterCommit=false/);
 assert.match(app,/saved==='keep'/);
 assert.match(app,/keepAudioAfterCommit=true/);
 assert.match(app,/initializeAudioRetentionPreference\(\)/);
 for(const html of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
  const source=fs.readFileSync(html,'utf8');
  assert.match(source,/id="retainAudioAfterCommit"/);
  assert.match(source,/Implicit, audio-ul temporar este eliminat numai după commit Core și recitire independentă/);
 }
});
test('Audio deletion is gated on verified Core event, cleared temporary transcript, and retention preference',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const confirm=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 const deletion=app.slice(app.indexOf('async function deleteAudioFromVerifiedCheckpoint'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(confirm.indexOf('audioDraftCleared')<confirm.indexOf("deleteAudioFromVerifiedCheckpoint(extrasState.audioRecordingId,{confirmBeforeDelete:false})"));
 assert.ok(confirm.includes('audioCheckpointReady&&audioDraftCleared'));
 assert.ok(confirm.includes('if(keepAudioAfterCommit)'));
 assert.ok(deletion.includes('await verifyAudioCheckpointEvent(cp)'));
 assert.ok(deletion.includes('await verifyAudioRemoval()'));
 assert.ok(deletion.includes('await verifyAudioCheckpointEvent(await store.get(recordingId))'));
 assert.ok(deletion.includes("writeAudioLifecycleCheckpoint(recordingId,'completed'"));
});

test('audio commit recovery detects existing commits before retranscription and prevents duplicate AI charges',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const flow=app.slice(app.indexOf('async function transcribeAndInterpretAudioRecording'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(flow.indexOf('recoverCommittedAudioCapture(recordingId)')<flow.indexOf('CollectorOpenAIProvider.transcribe(blob)'));
 assert.ok(flow.indexOf('store.get(recordingId)')<flow.indexOf('CollectorOpenAIProvider.transcribe(blob)'));
 assert.ok(app.includes('stableAudioCaptureIntentKey(sourceRecordingId)'));
 assert.ok(app.includes('findCommittedEvent(persisted,recordingId)'));
 assert.ok(fs.readFileSync('ai/audio-capture-recovery.js','utf8').includes('collector-memory-capture:'));
 assert.ok(app.includes('Nu am retranscris și nu am creat duplicate'));
});

test('audio deletion requires at least one structured Core operation beyond an event note',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const verify=app.slice(app.indexOf('async function verifyAudioCheckpointEvent'),app.indexOf('async function deleteAudioFromVerifiedCheckpoint'));
 const recovery=fs.readFileSync('ai/audio-capture-recovery.js','utf8');
 assert.ok(verify.includes('Recovery.verifyCheckpointEvent(state,cp)'));
 assert.ok(recovery.includes('STRUCTURED_OPERATIONS.has(operation.operation.trim())'));
 assert.ok(recovery.includes("event.payload?.sourceId!==sourceId"));
 assert.ok(app.includes('Audio-ul original a fost păstrat.'));
 assert.ok(recovery.includes('Audio checkpoint event contains no supported structured Core operations'));
});

test('audio transcript text is excluded from follow-up memory notes and reminder context',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const memory=app.slice(app.indexOf("const memoryButton=box.querySelector('[data-ai-memory-save]')"),app.indexOf("box.querySelectorAll('[data-ai-reminder-index]')"));
 assert.ok(memory.includes("String(sourceId||'').startsWith('audio:')?'':String(sourceText||'').slice(0,1200)"));
 assert.ok(memory.includes('sourceText:retainedSourceText||null'));
 assert.ok(!memory.includes("'Text original: '+String(sourceText||'').slice(0,1200)"));
 const reminder=app.slice(app.indexOf("box.querySelectorAll('[data-ai-reminder-index]')"),app.indexOf("async function runAICommand"));
 assert.ok(reminder.includes("const isAudioSource=String(sourceId||'').startsWith('audio:')"));
 assert.ok(reminder.includes("String(ai.semanticSummary||suggestion.title||'Audio capture').slice(0,500)"));
 assert.ok(reminder.includes("[suggestion.context,sourceText]"));
});

test('audio commands cannot commit only unstructured event notes or raw transcript text',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(run.includes("sourceRecordingId?ai.command.operations.filter(operation=>operation?.operation!=='event.note'):ai.command.operations"));
 assert.ok(run.includes('if(!commandOperations.length)throw Error'));
 assert.ok(run.includes('nicio notă brută nu a fost salvată'));
 assert.ok(run.includes('operations:commandOperations'));
});


test('AI command confirmation is bound to the exact Core preview snapshot',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const port=fs.readFileSync('ai/core-port-browser.js','utf8');
 assert.ok(port.includes('this.previewSnapshots=new Map()'));
 assert.ok(port.includes("return {status:'stale_preview'"));
 assert.ok(port.includes('expected.state!==JSON.stringify(current)'));
 assert.ok(port.includes('expected.command!==JSON.stringify(command)'));
 assert.ok(port.includes('discardPreview(command)'));
 assert.ok(app.includes('ensureAICorePort().discardPreview?.(cancelled)'));
 assert.ok(app.includes('Datele Collector s-au modificat după preview'));
});


test('Work discards Core preview snapshots when commands are rejected, cancelled or replaced',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const command=app.slice(app.indexOf('async function runCommand'),app.indexOf('async function runStructuredRecall'));
 const voice=app.slice(app.indexOf('function startVoiceSession'),app.indexOf('async function refreshAudioLifecycleRecovery'));
 const clear=app.slice(app.indexOf('async function clearAllLocalData'),app.indexOf('// Conversation context expires'));
 assert.ok(command.includes('discardPreview?.(command)'));
 assert.ok(command.includes('discardPreview?.(cancelled)'));
 assert.ok(voice.includes('discardPreview?.(cancelled)'));
 assert.ok(clear.includes('discardPreview?.(cancelled)'));
});


test('structured-memory clarification blocks Core preview and partial memory save controls',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 const render=app.slice(app.indexOf('function renderAIEnhancements'),app.indexOf('function bindAIEnhancements'));
 assert.ok(run.indexOf('if(sm.clarification)')<run.indexOf('CollectorStructuredMemory.resolveEntities'));
 assert.ok(run.includes("ai.intent='clarify';ai.question=sm.clarification"));
 assert.ok(run.indexOf("if(ai.intent==='clarify'||")<run.indexOf('await ensureAICorePort().preview(command)'));
 assert.ok(run.includes("writeAudioLifecycleCheckpoint(sourceRecordingId,'failed'"));
 assert.ok(render.includes("ai.intent!=='clarify'"));
});


test('audio retry reuses a transcript checkpoint bound to its recording instead of retranscribing',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const retry=app.slice(app.indexOf('async function transcribeAndInterpretAudioRecording'),app.indexOf('async function renderAudioRecordings'));
 const run=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.ok(retry.includes('store.get(recordingId)'));
 assert.ok(retry.includes('if(!transcript)'));
 assert.ok(retry.indexOf('CollectorOpenAIProvider.transcribe(blob)')>retry.indexOf('if(!transcript)'));
 assert.ok(retry.includes('await store.put(recordingId,result.text)'));
 assert.ok(retry.includes('if(savedTranscript?.transcript!==result.text)'));
 assert.ok(retry.includes('Am reutilizat transcriptul salvat'));
 assert.ok(run.includes('await transcriptStore.put(sourceRecordingId,text)'));
 assert.ok(app.includes('clearAudioTranscriptCheckpoint(recordingId)'));
});
test('transcript checkpoint is cleared before source deletion and after a verified Core commit',()=>{
 const app=fs.readFileSync('app.js','utf8');
 const commit=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 const deletion=app.slice(app.indexOf('async function deleteAudioFromVerifiedCheckpoint'),app.indexOf('async function transcribeAndInterpretAudioRecording'));
 assert.ok(commit.includes('clearAudioTranscriptCheckpoint(extrasState.audioRecordingId)'));
 assert.ok(commit.includes('audioTranscriptCheckpointCleared'));
 assert.ok(deletion.indexOf('await clearAudioTranscriptCheckpoint(recordingId)')<deletion.indexOf('await CollectorAudioStore.remove(recordingId)'));
});
