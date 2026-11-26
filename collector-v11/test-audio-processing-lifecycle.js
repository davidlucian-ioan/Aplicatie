'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createAudioProcessingLifecycle}=require('./audio-processing-lifecycle');
function fixture({verify=true,deleteOk=true,failAt=null}={}){
 const audio=new Map([['a1',{id:'a1',blob:new Blob(['audio'])}]]),cps=new Map(),calls=[];
 const store={async get(id){return audio.get(id)||null},async remove(id){calls.push('delete');if(!deleteOk)return false;audio.delete(id);return true}};
 const cpStore={async get(id){return cps.get(id)||null},async put(cp){cps.set(cp.id,structuredClone(cp))},async list(){return [...cps.values()]}};
 const maybe=(stage)=>{calls.push(stage);if(failAt===stage)throw Error(stage+' failure')};
 const lifecycle=createAudioProcessingLifecycle({audioStore:store,checkpointStore:cpStore,
 interpret:async()=>{maybe('interpret');return {text:'pump'}},
 extract:async()=>{maybe('extract');return {entities:[{name:'pump'}]}},
 validate:async x=>{maybe('validate');return x},
 persist:async(x)=>{maybe('persist');return {commitId:'c1'}},
 verifyPersisted:async()=>{maybe('verify');return verify}});
 return {lifecycle,audio,cps,calls};
}
test('audio deleted only after persistence verification and deletion verification',async()=>{const x=fixture();const cp=await x.lifecycle.process('a1');assert.equal(cp.state,'completed');assert.equal(x.audio.has('a1'),false);assert.deepEqual(x.calls,['interpret','extract','validate','persist','verify','delete'])});
test('failed persistence retains original audio and recovery checkpoint',async()=>{const x=fixture({failAt:'persist'});await assert.rejects(x.lifecycle.process('a1'),/persist failure/);assert.equal(x.audio.has('a1'),true);assert.equal(x.cps.get('a1').state,'failed');assert.equal(x.cps.get('a1').recoveryRequired,true);assert.ok(!x.calls.includes('delete'))});
test('verification false blocks deletion',async()=>{const x=fixture({verify:false});await assert.rejects(x.lifecycle.process('a1'),/verification did not return true/);assert.equal(x.audio.has('a1'),true);assert.ok(!x.calls.includes('delete'))});
test('delete not confirmed or source still present blocks completion',async()=>{const x=fixture({deleteOk:false});await assert.rejects(x.lifecycle.process('a1'),/deletion was not confirmed/);assert.equal(x.audio.has('a1'),true)});
test('retry uses stable idempotency key and does not repeat completed processing',async()=>{const x=fixture({failAt:'persist'});await assert.rejects(x.lifecycle.process('a1'));const key=x.cps.get('a1').idempotencyKey;x.calls.length=0;const cp=await x.lifecycle.process('a1',{retry:true});assert.equal(cp.idempotencyKey,key);assert.equal(cp.state,'completed')});
test('recovery lists incomplete failed sessions',async()=>{const x=fixture({failAt:'verify'});await assert.rejects(x.lifecycle.process('a1'));assert.deepEqual(await x.lifecycle.recover(),['a1'])});
