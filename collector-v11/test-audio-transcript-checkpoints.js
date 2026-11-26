'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStore}=require('./ai/audio-transcript-checkpoints');
function fixture({failWrite=false,lieReadback=false,failRemove=false,lieRemove=false}={}){
 const values=new Map();
 const storage={
  async readRaw(key){if(lieReadback&&key.startsWith('collector_audio_transcript_v1:'))return null;return values.get(key)??null},
  async writeRaw(key,value){if(failWrite)throw new Error('write failed');values.set(key,String(value));return true},
  async removeRaw(key){if(failRemove)throw new Error('remove failed');if(!lieRemove)values.delete(key);return true}
 };
 return {store:createStore(storage),values,storage};
}
test('transcript checkpoint writes and verifies source-bound text readback',async()=>{
 const x=fixture(),row=await x.store.put('audio:rec-1','B3 pH 6.4');
 assert.equal(row.id,'audio:rec-1');assert.equal(row.transcript,'B3 pH 6.4');
 assert.equal((await x.store.get('audio:rec-1')).transcript,'B3 pH 6.4');
 assert.equal(await x.store.get('audio:rec-2'),null);
});
test('transcript checkpoint storage namespaces and encodes independent recording IDs',async()=>{
 const x=fixture();
 await x.store.put('a/b','first');await x.store.put('a_b','second');
 assert.equal((await x.store.get('a/b')).transcript,'first');
 assert.equal((await x.store.get('a_b')).transcript,'second');
 assert.equal(x.values.size,2);
});
test('transcript checkpoint rejects blank IDs, empty text and oversized transcripts',async()=>{
 const x=fixture();
 await assert.rejects(x.store.put(' ','text'),/ID invalid/);
 await assert.rejects(x.store.put('rec-1','   '),/non-empty/);
 const small=createStore(x.storage,{maxTranscriptChars:4});
 await assert.rejects(small.put('rec-2','12345'),/size limit/);
});
test('transcript checkpoint refuses corrupted JSON and mismatched record identity',async()=>{
 const x=fixture(),key='collector_audio_transcript_v1:rec-1';
 x.values.set(key,'{bad');await assert.rejects(x.store.get('rec-1'),/corrupt/);
 x.values.set(key,JSON.stringify({schemaVersion:1,id:'rec-2',transcript:'wrong',updatedAt:new Date().toISOString()}));
 await assert.rejects(x.store.get('rec-1'),/identity or version mismatch/);
});
test('transcript checkpoint validates timestamp, schema and persisted transcript bounds',async()=>{
 const x=fixture(),key='collector_audio_transcript_v1:rec-1';
 for(const record of [
  {schemaVersion:2,id:'rec-1',transcript:'text',updatedAt:new Date().toISOString()},
  {schemaVersion:1,id:'rec-1',transcript:' ',updatedAt:new Date().toISOString()},
  {schemaVersion:1,id:'rec-1',transcript:'text',updatedAt:'not-a-date'}
 ]){
  x.values.set(key,JSON.stringify(record));await assert.rejects(x.store.get('rec-1'));
 }
});
test('transcript checkpoint fails closed on unacknowledged writes and mismatched readback',async()=>{
 const failed=fixture({failWrite:true});
 await assert.rejects(failed.store.put('rec-1','text'),/write failed/);
 const lying=fixture({lieReadback:true});
 await assert.rejects(lying.store.put('rec-1','text'),/readback verification failed/);
});
test('transcript checkpoint removal verifies key absence',async()=>{
 const x=fixture();await x.store.put('rec-1','text');
 assert.equal(await x.store.remove('rec-1'),true);
 assert.equal(await x.store.get('rec-1'),null);
});
test('transcript checkpoint removal propagates failed or unverified removal',async()=>{
 const x=fixture();await x.store.put('rec-1','text');
 const failing={...x.storage,async removeRaw(){throw new Error('remove failed')}};
 await assert.rejects(createStore(failing).remove('rec-1'),/remove failed/);
 const lying={...x.storage,async removeRaw(){return true}};
 await assert.rejects(createStore(lying).remove('rec-1'),/readback verification failed/);
});
