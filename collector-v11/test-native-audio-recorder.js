'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const NativeRecorder=require('./native-audio-recorder');

function fixture({permission='granted',request='granted'}={}){
 const calls=[],files=new Map(),storageValues=new Map();
 const storage={async readRaw(key){return storageValues.get(key)??null},async writeRaw(key,value){storageValues.set(key,String(value))},async removeRaw(key){storageValues.delete(key)}};
 const capacitor={isNativePlatform:()=>true,convertFileSrc:uri=>'capacitor://localhost/_capacitor_file_'+uri};
 const filesystem={
  async mkdir(value){calls.push(['mkdir',value])},
  async getUri(value){calls.push(['getUri',value]);return {uri:'file:///app/'+value.path}},
  async copy(value){calls.push(['copy',value]);files.set(value.to,Buffer.alloc(4096))},
  async stat(value){calls.push(['stat',value]);const file=files.get(value.path);if(!file)throw new Error('not found');return {size:file.length}},
  async deleteFile(value){calls.push(['deleteFile',value]);files.delete(value.path)}
 };
 const plugin={
  async checkPermissions(){calls.push(['checkPermissions']);return {recordAudio:permission}},
  async requestPermissions(){calls.push(['requestPermissions']);return {recordAudio:request}},
  async startRecording(value){calls.push(['startRecording',value])},
  async pauseRecording(){calls.push(['pauseRecording'])},
  async resumeRecording(){calls.push(['resumeRecording'])},
  async stopRecording(){calls.push(['stopRecording']);return {duration:2500,uri:'file:///cache/recording-note.aac'}},
  async cancelRecording(){calls.push(['cancelRecording'])}
 };
 NativeRecorder.configure({capacitor,plugin,filesystem,storage});
 return {calls,files,capacitor,filesystem,plugin,storageValues,storage};
}
test('native recorder requests mic permission and starts AAC in app-private storage',async()=>{
 const x=fixture({permission:'prompt'});
 const session=await NativeRecorder.start({id:'note-1'});
 assert.equal(session.filePath,'collector-audio/note-1.aac');
 assert.equal(session.filePath,'collector-audio/note-1.aac');
 assert.ok(x.calls.some(call=>call[0]==='requestPermissions'));
 const start=x.calls.find(call=>call[0]==='startRecording');
 assert.equal(start[1].format,'aac');assert.equal(start[1].uri,undefined);
 await NativeRecorder.cancel();
});
test('native recorder pauses, resumes and returns file metadata on stop',async()=>{
 const x=fixture();await NativeRecorder.start({id:'note-2'});
 await NativeRecorder.pause();await NativeRecorder.resume();
 const result=await NativeRecorder.stop();
 assert.equal(result.id,'note-2');assert.equal(result.durationMs,2500);assert.equal(result.size,4096);assert.equal(result.uri,'file:///app/collector-audio/note-2.aac');
 assert.equal(result.mimeType,'audio/aac');
 assert.ok(x.calls.some(call=>call[0]==='copy'&&call[1].from==='file:///cache/recording-note.aac'));
 assert.ok(x.calls.some(call=>call[0]==='deleteFile'&&call[1].path==='file:///cache/recording-note.aac'));
 assert.equal(NativeRecorder.toPlayableUrl(result.uri),x.capacitor.convertFileSrc(result.uri));
});
test('native recorder cancels and deletes partial audio',async()=>{
 const x=fixture();await NativeRecorder.start({id:'note-3'});
 assert.equal(await NativeRecorder.cancel(),true);
 assert.ok(x.calls.some(call=>call[0]==='cancelRecording'));
 assert.ok(x.calls.some(call=>call[0]==='deleteFile'));
 assert.equal(await NativeRecorder.cancel(),false);
});
test('native recorder refuses to start when microphone permission is denied',async()=>{
 fixture({permission:'denied',request:'denied'});
 await assert.rejects(NativeRecorder.start({id:'note-4'}),/Permisiunea pentru microfon nu a fost acordată/);
});

test('session checkpoint is persisted before native recording starts',async()=>{
 const x=fixture();await NativeRecorder.start({id:'checkpoint-1'});
 const pending=JSON.parse(x.storageValues.get('collector_audio_pending_session_v1'));
 assert.equal(pending.id,'checkpoint-1');assert.ok(pending.startedAt>0);
 assert.ok(x.calls.some(call=>call[0]==='startRecording'));
});
test('interrupted session is restored and can be recovered after recorder reinitialization',async()=>{
 const x=fixture();await NativeRecorder.start({id:'interrupted-1'});
 const saved=x.storageValues.get('collector_audio_pending_session_v1');
 NativeRecorder.configure({capacitor:x.capacitor,plugin:x.plugin,filesystem:x.filesystem,storage:x.storage});
 x.storageValues.set('collector_audio_pending_session_v1',saved);
 await NativeRecorder.initialize();
 const pending=await NativeRecorder.getPending();assert.equal(pending.id,'interrupted-1');
 const result=await NativeRecorder.stop();
 assert.equal(result.id,'interrupted-1');assert.equal(result.recovered,true);
 assert.match(result.warning,/Sesiunea întreruptă/);
 await NativeRecorder.complete(result.id);
 assert.equal(await NativeRecorder.getPending(),null);
});
test('failed recovery keeps checkpoint for another attempt',async()=>{
 const x=fixture();await NativeRecorder.start({id:'retry-recovery'});
 x.plugin.stopRecording=async()=>{throw new Error('native session unavailable')};
 await assert.rejects(NativeRecorder.stop(),/native session unavailable/);
 assert.equal((await NativeRecorder.getPending()).id,'retry-recovery');
});

test('recovery prefers an already copied app-private audio file after metadata failure',async()=>{
 const x=fixture();const session=await NativeRecorder.start({id:'already-copied'});
 x.files.set(session.filePath,Buffer.from('saved-audio'));
 const stopCallsBefore=x.calls.filter(call=>call[0]==='stopRecording').length;
 const result=await NativeRecorder.stop();
 assert.equal(result.filePath,session.filePath);assert.equal(result.size,12);
 assert.equal(x.calls.filter(call=>call[0]==='stopRecording').length,stopCallsBefore);
 assert.equal(x.files.has(session.filePath),true);
 await NativeRecorder.complete(result.id);
});
