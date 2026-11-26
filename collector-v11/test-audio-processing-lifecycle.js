'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createAudioProcessingLifecycle}=require('./audio-processing-lifecycle');
function fixture({verify=true,deleteOk=true,failAt=null}={}){
 const audio=new Map([['a1',{id:'a1',blob:new Blob(['audio'])}]]),cps=new Map(),calls=[];
 const store={async get(id){return audio.get(id)||null},async remove(id){calls.push('delete');if(!deleteOk)return false;audio.delete(id);return true}};
 const cpStore={async get(id){return cps.get(id)||null},async put(cp){cps.set(cp.id,structuredClone(cp))},async list(){return [...cps.values()]}};
 let currentFail=failAt;const maybe=(stage)=>{calls.push(stage);if(currentFail===stage)throw Error(stage+' failure')};
 const lifecycle=createAudioProcessingLifecycle({audioStore:store,checkpointStore:cpStore,
 interpret:async()=>{maybe('interpret');return {text:'pump'}},
 extract:async()=>{maybe('extract');return {entities:[{name:'pump'}]}},
 validate:async x=>{maybe('validate');return x},
 persist:async(x)=>{maybe('persist');return {commitId:'c1'}},
 verifyPersisted:async()=>{maybe('verify');return verify}});
 return {lifecycle,audio,cps,calls,setFailAt(value){currentFail=value}};
}
test('audio deleted only after persistence verification and deletion verification',async()=>{const x=fixture();const cp=await x.lifecycle.process('a1');assert.equal(cp.state,'completed');assert.equal(x.audio.has('a1'),false);assert.deepEqual(x.calls,['interpret','extract','validate','persist','verify','delete'])});
test('failed persistence retains original audio and recovery checkpoint',async()=>{const x=fixture({failAt:'persist'});await assert.rejects(x.lifecycle.process('a1'),/persist failure/);assert.equal(x.audio.has('a1'),true);assert.equal(x.cps.get('a1').state,'failed');assert.equal(x.cps.get('a1').recoveryRequired,true);assert.ok(!x.calls.includes('delete'))});
test('verification false blocks deletion',async()=>{const x=fixture({verify:false});await assert.rejects(x.lifecycle.process('a1'),/verification did not return true/);assert.equal(x.audio.has('a1'),true);assert.ok(!x.calls.includes('delete'))});
test('delete not confirmed or source still present blocks completion',async()=>{const x=fixture({deleteOk:false});await assert.rejects(x.lifecycle.process('a1'),/Audio deletion verification failed/);assert.equal(x.audio.has('a1'),true)});
test('retry uses stable idempotency key and does not repeat completed processing',async()=>{const x=fixture({failAt:'persist'});await assert.rejects(x.lifecycle.process('a1'));const key=x.cps.get('a1').idempotencyKey;x.calls.length=0;x.setFailAt(null);const cp=await x.lifecycle.process('a1',{retry:true});assert.equal(cp.idempotencyKey,key);assert.equal(cp.state,'completed')});
test('recovery lists incomplete failed sessions',async()=>{const x=fixture({failAt:'verify'});await assert.rejects(x.lifecycle.process('a1'));assert.deepEqual(await x.lifecycle.recover(),['a1'])});

test('recovery discovers nonterminal checkpoints after process crash',async()=>{const x=fixture();x.cps.set('a1',{id:'a1',state:'processing',attempts:1,idempotencyKey:'audio:a1'});assert.deepEqual(await x.lifecycle.recover(),['a1'])});
test('crash after audio deletion but before completion checkpoint recovers without source audio',async()=>{const x=fixture();x.audio.delete('a1');x.cps.set('a1',{id:'a1',state:'audio_deletion_pending',attempts:1,idempotencyKey:'audio:a1',persistenceVerified:true});const cp=await x.lifecycle.process('a1');assert.equal(cp.state,'completed');assert.equal(cp.audioDeleted,true);assert.equal(x.audio.has('a1'),false)});

test('concurrent duplicate requests for one recording share a single processing run',async()=>{const x=fixture();const [a,b]=await Promise.all([x.lifecycle.process('a1'),x.lifecycle.process('a1')]);assert.equal(a.state,'completed');assert.equal(b.state,'completed');assert.equal(x.calls.filter(v=>v==='interpret').length,1);assert.equal(x.calls.filter(v=>v==='delete').length,1)});

test('recovery handles delete succeeding before a thrown response by re-verifying persistence',async()=>{
 const x=fixture();const originalRemove=x.audio.get.bind(x.audio);let first=true;
 x.audio.remove=async id=>{if(first){first=false;x.audio.delete(id);throw Error('lost delete response')}return originalRemove(id)};
 await assert.rejects(x.lifecycle.process('a1'),/lost delete response/);
 assert.equal(x.audio.has('a1'),false);
 assert.equal(x.cps.get('a1').state,'failed');
 const cp=await x.lifecycle.process('a1',{retry:true});
 assert.equal(cp.state,'completed');assert.equal(cp.audioDeleted,true);
 assert.equal(x.calls.filter(v=>v==='verify').length,2);
});
test('checkpoint identity mismatch fails closed without touching audio or provider',async()=>{
 const x=fixture();x.cps.set('a1',{id:'different',state:'captured',idempotencyKey:'audio:different'});
 await assert.rejects(x.lifecycle.process('a1'),/identity\/idempotency mismatch/);
 assert.equal(x.audio.has('a1'),true);assert.equal(x.calls.length,0);
});
test('missing audio without independently verified persistence cannot be marked complete',async()=>{
 const x=fixture();x.audio.delete('a1');x.cps.set('a1',{id:'a1',state:'failed',idempotencyKey:'audio:a1',persistenceVerified:false});
 await assert.rejects(x.lifecycle.process('a1'),/cannot recover processing/);
 assert.notEqual(x.cps.get('a1').state,'completed');
});
