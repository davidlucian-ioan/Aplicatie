'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const Core=require('./engine');
const {BrowserCorePort}=require('./ai/core-port-browser');
require('./ai/structured-memory-browser.js');
const Memory=globalThis.CollectorStructuredMemory;
const Recovery=require('./ai/audio-capture-recovery');
const {createStore:createTranscriptStore}=require('./ai/audio-transcript-checkpoints');

function pipeline({readbackMode='normal'}={}){
 let state=Core.emptyState(),disk=null,published=0,reads=0;
 const port=new BrowserCorePort({core:Core,store:{
  getState:()=>state,
  persistState:async next=>{disk=JSON.stringify(next);return true},
  readPersistedState:async()=>{reads++;if(readbackMode==='missing')return Core.emptyState();if(readbackMode==='corrupt')return {...JSON.parse(disk),events:[]};return JSON.parse(disk)},
  publishState:async next=>{state=next;published++}
 }});
 return {port,get state(){return state},get persisted(){return disk?Core.validateImport(JSON.parse(disk)):null},get published(){return published},get reads(){return reads}};
}
function extract(){
 return Memory.validateExtraction({
  summary:'Mihai va aduce pompa la atelier; pompa necesită reparație.',
  entities:[
   {key:'person',name:'Mihai',type:'person',aliases:['Mike']},
   {key:'pump',name:'Pompa atelier',type:'object',aliases:['pompa']}
  ],
  facts:[{subject:'pump',name:'status',value:'necesită reparație',certainty:'certain'}],
  relations:[{source:'person',target:'pump',type:'plans_to_bring',certainty:'certain'}],
  confidence:0.94
 });
}
function audioCommand(extraction,db,recordingId){
 const resolutions=Memory.resolveEntities(extraction,db);
 assert.equal(resolutions.some(row=>row.match==='ambiguous'),false);
 const command=Memory.createCommand(extraction,resolutions,{captureId:'audio:'+recordingId,turnId:'audio:'+recordingId});
 return {...command,operations:command.operations.filter(op=>op.operation!=='event.note'),
  idempotencyKey:Recovery.stableIntentKey(recordingId),
  payload:{...command.payload,sourceId:'audio:'+recordingId},source:'ai-openai'};
}
function checkpoint(recordingId,event){
 return {id:recordingId,persisted:true,persistenceVerified:true,
  persistResult:{eventId:event.id,intentKey:event.intentKey}};
}

test('audio transcript is source-bound and must be read back before interpretation',async()=>{
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true}};
 const transcripts=createTranscriptStore(storage),saved=await transcripts.put('rec-1','Mihai va aduce pompa vineri.');
 assert.equal((await transcripts.get('rec-1')).transcript,saved.transcript);
 assert.equal(await transcripts.get('rec-2'),null);
});

test('structured audio proposal previews without writes, requires confirmation, then commits multiple linked records',async()=>{
 const x=pipeline(),recordingId='rec-structured',sm=extract(),command=audioCommand(sm,x.state,recordingId);
 const preview=await x.port.preview(command);
 assert.equal(preview.status,'preview_ok');assert.equal(x.persisted,null);assert.equal(x.published,0);
 const denied=await x.port.execute(command);
 assert.equal(denied.status,'rejected');assert.equal(x.persisted,null);
 const result=await x.port.execute(command,{confirmed:true});
 assert.equal(result.status,'committed');assert.equal(x.published,1);
 const persisted=x.persisted,event=persisted.events.find(row=>row.id===result.eventId);
 assert.ok(persisted.entities.some(row=>row.name==='Mihai'));
 assert.ok(persisted.entities.some(row=>row.name==='Pompa atelier'));
 assert.ok(persisted.relations.some(row=>row.type==='plans_to_bring'));
 assert.equal(event.payload.sourceId,'audio:'+recordingId);
 assert.equal(Recovery.verifyCheckpointEvent(persisted,checkpoint(recordingId,event)),event);
});

test('same audio capture retry resolves to the prior committed event without duplication',async()=>{
 const x=pipeline(),recordingId='rec-idempotent',command=audioCommand(extract(),x.state,recordingId);
 const first=await x.port.preview(command);assert.equal(first.status,'preview_ok');
 const committed=await x.port.execute(command,{confirmed:true});assert.equal(committed.status,'committed');
 const second=await x.port.execute(command,{confirmed:true});
 assert.equal(second.status,'duplicate');assert.equal(second.eventId,committed.eventId);
 assert.equal(x.state.events.length,1);assert.equal(x.published,2);
 assert.equal(Recovery.findCommittedEvent(x.persisted,recordingId).id,committed.eventId);
});

test('a transcript-only note cannot authorize deletion of its original audio',async()=>{
 const x=pipeline(),recordingId='rec-note-only';
 const note={contractVersion:'collector.command.v1',intent:'audio.note',idempotencyKey:Recovery.stableIntentKey(recordingId),
  payload:{sourceId:'audio:'+recordingId},operations:[{operation:'event.note',data:{description:'raw transcript'}}]};
 const preview=await x.port.preview(note);assert.equal(preview.status,'preview_ok');
 const result=await x.port.execute(note,{confirmed:true});assert.equal(result.status,'committed');
 const event=x.persisted.events.find(row=>row.id===result.eventId);
 assert.equal(Recovery.hasStructuredOperations(event),false);
 assert.throws(()=>Recovery.verifyCheckpointEvent(x.persisted,checkpoint(recordingId,event)),/no supported structured Core operations/);
});

test('ambiguous entity resolution refuses to create or silently merge a memory proposal',()=>{
 const state={entities:[{id:'p1',name:'Monstera Deliciosa Variegata',type:'plant'}]};
 const proposed=Memory.validateExtraction({entities:[{key:'plant',name:'Monstera Deliciosa Variegatta',type:'plant'}],facts:[],relations:[]});
 const resolutions=Memory.resolveEntities(proposed,state);
 assert.equal(resolutions[0].match,'ambiguous');assert.equal(resolutions[0].resolvedId,null);
});

test('failed or mismatched independent readback blocks publication of a Core mutation',async()=>{
 for(const mode of ['missing','corrupt']){
  const x=pipeline({readbackMode:mode}),recordingId='rec-readback-'+mode,command=audioCommand(extract(),x.state,recordingId);
  await x.port.preview(command);
  const result=await x.port.execute(command,{confirmed:true});
  assert.equal(result.status,'verification_failed',mode);
  assert.equal(x.published,0,mode);
  assert.equal(x.state.events.length,0,mode);
 }
});

test('audio deletion verifier requires the exact source, event, idempotency key and committed state',()=>{
 const event={id:'evt-1',intentKey:Recovery.stableIntentKey('rec-exact'),status:'committed',
  payload:{sourceId:'audio:rec-exact'},operations:[{operation:'entity.create',target:'e1',data:{name:'Pump',type:'object'}}]};
 assert.equal(Recovery.verifyCheckpointEvent({events:[event]},checkpoint('rec-exact',event)),event);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[event]},{id:'rec-other',persisted:true,persistenceVerified:true,persistResult:{eventId:event.id,intentKey:Recovery.stableIntentKey('rec-other')}}),/exactly one/);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[{...event,status:'pending'}]},checkpoint('rec-exact',event)),/not committed/);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[{...event,payload:{sourceId:'audio:other'}}]},checkpoint('rec-exact',event)),/source does not match/);
});

test('the app checkpoints before provider calls and retains audio on processing errors',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const process=app.slice(app.indexOf('async function transcribeAndInterpretAudioRecording'),app.indexOf('async function renderAudioRecordings'));
 assert.ok(process.indexOf("writeAudioLifecycleCheckpoint(recordingId,'processing'")<process.indexOf('CollectorOpenAIProvider.transcribe'));
 assert.ok(process.indexOf('store.put(recordingId,result.text)')<process.indexOf('await runAICommand({audioRecordingId:recordingId})'));
 assert.match(process,/Audio-ul original este păstrat/);
 const ai=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.match(ai,/writeAudioLifecycleCheckpoint\(sourceRecordingId,'failed'/);
 assert.match(ai,/pendingCoreCommand=null;pendingAIEnhancements=null/);
});

test('local and AI commands cannot inherit stale proposal metadata or replace an active preview',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const local=app.slice(app.indexOf('async function runCommand'),app.indexOf('async function runStructuredRecall'));
 const ai=app.slice(app.indexOf('async function runAICommand'),app.indexOf('async function refreshSubscriptionStatus'));
 assert.match(local,/aiInterpretationPending\|\|pendingCoreCommand\|\|coreCommitPending/);
 assert.match(local,/pendingAIEnhancements=null/);
 assert.match(ai,/pendingAIEnhancements=null/);
 assert.match(ai,/pendingAIEnhancements=null;\s*if\(sourceRecordingId\)/);
});

test('Core confirmation binds audio cleanup to the command source and stable capture key',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const confirm=app.slice(app.indexOf('async function confirmCoreCommand'),app.indexOf('function renderAIEnhancements'));
 assert.match(confirm,/stagedExtras\.sourceId===expectedAudioSourceId/);
 assert.match(confirm,/command\.payload\?\.sourceId===expectedAudioSourceId/);
 assert.match(confirm,/command\.idempotencyKey===stableAudioCaptureIntentKey\(stagedAudioId\)/);
 assert.match(confirm,/audioContextMismatch/);
});

test('audio source identity is passed to exactly one AI invocation and is never kept as global state',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 assert.doesNotMatch(app,/activeAudioRecordingId/);
 assert.match(app,/async function runAICommand\(\{audioRecordingId=null\}=\{\}\)/);
 assert.match(app,/runAICommand\(\{audioRecordingId:recordingId\}\)/);
 assert.match(app,/sourceRecordingId=typeof audioRecordingId==='string'/);
});
