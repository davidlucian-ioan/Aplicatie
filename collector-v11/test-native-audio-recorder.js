'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const NativeRecorder=require('./native-audio-recorder');

function fixture({permission='granted',request='granted'}={}){
 const calls=[],files=new Map();
 const capacitor={isNativePlatform:()=>true,convertFileSrc:uri=>'capacitor://localhost/_capacitor_file_'+uri};
 const filesystem={
  async mkdir(value){calls.push(['mkdir',value])},
  async getUri(value){calls.push(['getUri',value]);return {uri:'file:///app/'+value.path}},
  async copy(value){calls.push(['copy',value]);files.set(value.to,'saved')},
  async stat(value){calls.push(['stat',value]);return {size:4096}},
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
 NativeRecorder.configure({capacitor,plugin,filesystem});
 return {calls,files,capacitor,filesystem,plugin};
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
