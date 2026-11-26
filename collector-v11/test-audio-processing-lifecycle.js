'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createAudioProcessingLifecycle}=require('./audio-processing-lifecycle');
function fixture({verify=true,deleteOk=true,failAt=null,deleteAudioAfterVerified=false}={}){
 const audio=new Map([['a1',{id:'a1',blob:new Blob(['audio'])}]]),cps=new Map(),calls=[];
 const store={async get(id){return audio.get(id)||null},async remove(id){calls.push('delete');if(!deleteOk)return false;audio.delete(id);return true}};
 const cpStore={async get(id){return cps.get(id)||null},async put(cp){cps.set(cp.id,structuredClone(cp))},async list(){return [...cps.values()]}};
 let currentFail=failAt;const maybe=(stage)=>{calls.push(stage);if(currentFail===stage)throw Error(stage+' failure')};
 const lifecycle=createAudioProcessingLifecycle({audioStore:store,checkpointStore:cpStore,
 interpret:async()=>{maybe('interpret');return {text:'pump'}},
 extract:async()=>{maybe('extract');return {entities:[{name:'pump'}]}},
 validate:async x=>{maybe('validate');return x},
 persist:async(x)=>{maybe('persist');return {commitId:'c1'}},
 verifyPersisted:async()=>{maybe('verify');return verify},deleteAudioAfterVerified});
 return {lifecycle,audio,store,cps,calls,setFailAt(value){currentFail=value}};
}
test('audio deleted only after persistence verification and deletion verification when explicitly enabled',async()=>{const x=fixture({deleteAudioAfterVerified:true});const cp=await x.lifecycle.process('a1');assert.equal(cp.state,'completed');assert.equal(x.audio.has('a1'),false);assert.deepEqual(x.calls,['interpret','extract','validate','persist','verify','delete'])});
test('failed persistence retains original audio and recovery checkpoint',async()=>{const x=fixture({failAt:'persist'});await assert.rejects(x.lifecycle.process('a1'),/persist failure/);assert.equal(x.audio.has('a1'),true);assert.equal(x.cps.get('a1').state,'failed');assert.equal(x.cps.get('a1').recoveryRequired,true);assert.ok(!x.calls.includes('delete'))});
test('verification false blocks deletion',async()=>{const x=fixture({verify:false});await assert.rejects(x.lifecycle.process('a1'),/verification did not return true/);assert.equal(x.audio.has('a1'),true);assert.ok(!x.calls.includes('delete'))});
test('delete not confirmed or source still present blocks completion',async()=>{const x=fixture({deleteOk:false,deleteAudioAfterVerified:true});await assert.rejects(x.lifecycle.process('a1'),/Audio deletion verification failed/);assert.equal(x.audio.has('a1'),true)});
test('retry uses stable idempotency key and does not repeat completed processing',async()=>{const x=fixture({failAt:'persist',deleteAudioAfterVerified:true});await assert.rejects(x.lifecycle.process('a1'));const key=x.cps.get('a1').idempotencyKey;x.calls.length=0;x.setFailAt(null);const cp=await x.lifecycle.process('a1',{retry:true});assert.equal(cp.idempotencyKey,key);assert.equal(cp.state,'completed')});
test('recovery lists incomplete failed sessions',async()=>{const x=fixture({failAt:'verify'});await assert.rejects(x.lifecycle.process('a1'));assert.deepEqual(await x.lifecycle.recover(),['a1'])});

test('recovery discovers nonterminal checkpoints after process crash',async()=>{const x=fixture();x.cps.set('a1',{id:'a1',state:'processing',attempts:1,idempotencyKey:'audio:a1'});assert.deepEqual(await x.lifecycle.recover(),['a1'])});
test('crash after audio deletion but before completion checkpoint recovers without source audio',async()=>{const x=fixture();x.audio.delete('a1');x.cps.set('a1',{id:'a1',state:'audio_deletion_pending',attempts:1,idempotencyKey:'audio:a1',persisted:true,persistenceVerified:true});const cp=await x.lifecycle.process('a1');assert.equal(cp.state,'completed');assert.equal(cp.audioDeleted,true);assert.equal(x.audio.has('a1'),false)});

test('concurrent duplicate requests for one recording share a single processing run',async()=>{const x=fixture({deleteAudioAfterVerified:true});const [a,b]=await Promise.all([x.lifecycle.process('a1'),x.lifecycle.process('a1')]);assert.equal(a.state,'completed');assert.equal(b.state,'completed');assert.equal(x.calls.filter(v=>v==='interpret').length,1);assert.equal(x.calls.filter(v=>v==='delete').length,1)});

test('recovery handles delete succeeding before a thrown response by re-verifying persistence',async()=>{
 const x=fixture({deleteAudioAfterVerified:true});const originalRemove=x.store.remove.bind(x.store);let first=true;
 x.store.remove=async id=>{if(first){first=false;x.audio.delete(id);throw Error('lost delete response')}return originalRemove(id)};
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
 await assert.rejects(x.lifecycle.process('a1',{retry:true}),/cannot recover processing/);
 assert.notEqual(x.cps.get('a1').state,'completed');
});

test('storage checkpoint adapter persists across instances and enumerates recoverable states',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true}};
 const a=createStorageCheckpointStore(storage),b=createStorageCheckpointStore(storage);
 await a.put({id:'r1',state:'processing',idempotencyKey:'audio:r1'});
 await a.put({id:'r2',state:'failed',idempotencyKey:'audio:r2'});
 assert.deepEqual((await b.list()).map(x=>x.id).sort(),['r1','r2']);
 assert.equal((await b.get('r1')).state,'processing');
 await b.remove('r1');assert.equal(await a.get('r1'),null);assert.deepEqual((await a.list()).map(x=>x.id),['r2']);
});
test('checkpoint adapter rejects malformed persisted checkpoint JSON',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const storage={async readRaw(k){return k.endsWith(encodeURIComponent('bad'))?'not-json':null},async writeRaw(){},async removeRaw(){}};
 const cp=createStorageCheckpointStore(storage);await assert.rejects(cp.get('bad'),/checkpoint is corrupt/);
});
test('checkpoint adapter refuses identity corruption from storage',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k)}};
 const cp=createStorageCheckpointStore(storage);raw.set('collector_audio_lifecycle_v1:'+encodeURIComponent('x'),JSON.stringify({id:'y',state:'failed'}));
 await assert.rejects(cp.get('x'),/identity mismatch/);
});
test('validation failure keeps audio and never reaches persistence or deletion',async()=>{
 const x=fixture({failAt:'validate'});await assert.rejects(x.lifecycle.process('a1'),/validate failure/);
 assert.equal(x.audio.has('a1'),true);assert.ok(!x.calls.includes('persist'));assert.ok(!x.calls.includes('delete'));
});
test('checkpoint failure after persistence verification still retains source audio',async()=>{
 const x=fixture();let count=0;const originalPut=x.cps.set.bind(x.cps);
 const cpStore={async get(id){return x.cps.get(id)||null},async put(cp){count++;if(count===7)throw Error('checkpoint disk full');originalPut(cp)},async list(){return [...x.cps.values()]}};
 const lifecycle=createAudioProcessingLifecycle({audioStore:x.store,checkpointStore:cpStore,interpret:async()=>({}),extract:async()=>({}),validate:async v=>v,persist:async()=>({ok:true}),verifyPersisted:async()=>true});
 await assert.rejects(lifecycle.process('a1'),/checkpoint disk full/);assert.equal(x.audio.has('a1'),true);assert.ok(!x.calls.includes('delete'));
});

test('recovery diagnostics return actionable checkpoint details but omit completed jobs',async()=>{
 const x=fixture();x.cps.set('stuck',{id:'stuck',state:'failed',attempts:3,idempotencyKey:'audio:stuck',recoveryRequired:true,error:'provider timeout',updatedAt:'2026-01-01'});
 x.cps.set('done',{id:'done',state:'completed',attempts:1,idempotencyKey:'audio:done',updatedAt:'2026-01-02'});
 const details=await x.lifecycle.recoverDetails();
 assert.deepEqual(details,[{id:'stuck',state:'failed',attempts:3,recoveryRequired:true,error:'provider timeout',updatedAt:'2026-01-01',audioDeleted:false,persistenceVerified:false}]);
 assert.deepEqual(await x.lifecycle.recover(),['stuck']);
});
test('checkpoint adapter serializes concurrent writes and maintains a consistent index',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){await new Promise(r=>setTimeout(r,1));raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k)}};
 const cp=createStorageCheckpointStore(storage);
 await Promise.all(Array.from({length:12},(_,i)=>cp.put({id:'id'+i,state:'captured',idempotencyKey:'audio:id'+i})));
 const rows=await cp.list();assert.equal(rows.length,12);assert.equal(new Set(rows.map(x=>x.id)).size,12);
});

test('persist response loss retries with same idempotency key while source is retained',async()=>{
 const x=fixture();let commits=0,keys=[];
 const lifecycle=createAudioProcessingLifecycle({audioStore:x.store,checkpointStore:{get:async id=>x.cps.get(id)||null,put:async cp=>x.cps.set(cp.id,structuredClone(cp)),list:async()=>[...x.cps.values()]},
 interpret:async()=>({text:'x'}),extract:async()=>({entities:[]}),validate:async v=>v,
 persist:async(_v,{idempotencyKey})=>{keys.push(idempotencyKey);commits++;if(commits===1)throw Error('response lost after commit');return {commitId:'same'}},
 verifyPersisted:async()=>true,deleteAudioAfterVerified:true});
 await assert.rejects(lifecycle.process('a1'),/response lost/);assert.equal(x.audio.has('a1'),true);
 const done=await lifecycle.process('a1',{retry:true});assert.equal(done.state,'completed');assert.deepEqual(keys,['audio:a1','audio:a1']);assert.equal(x.audio.has('a1'),false);
});

test('checkpoint schema rejects invalid states, idempotency keys and impossible completion claims',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k)}};
 const cp=createStorageCheckpointStore(storage);
 await assert.rejects(cp.put({id:'bad',state:'invented',idempotencyKey:'audio:bad'}),/state invalid/);
 await assert.rejects(cp.put({id:'bad',state:'captured',idempotencyKey:'wrong'}),/idempotency mismatch/);
 await assert.rejects(cp.put({id:'bad',state:'completed',idempotencyKey:'audio:bad',persistenceVerified:true}),/persisted commit/);
 await assert.rejects(cp.put({id:'bad',state:'completed',idempotencyKey:'audio:bad',persisted:true,persistenceVerified:true}),/audioDeleted confirmation/);
 await cp.put({id:'bad',state:'completed',idempotencyKey:'audio:bad',persisted:true,persistenceVerified:true,audioDeleted:true});
 await assert.rejects(cp.put({id:'bad2',state:'persisted',idempotencyKey:'audio:bad2',persisted:true,persistenceVerified:true,audioDeleted:true}),/invalid state/);
});
test('checkpoint adapter adds schemaVersion during legacy-compatible reads',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k)}};
 const cp=createStorageCheckpointStore(storage);raw.set('collector_audio_lifecycle_v1:'+encodeURIComponent('legacy'),JSON.stringify({id:'legacy',state:'failed',idempotencyKey:'audio:legacy'}));
 const got=await cp.get('legacy');assert.equal(got.schemaVersion,1);
});

test('checkpoint index self-heals orphan checkpoints after crash between record and index writes',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true},async listRawKeys(prefix){return [...raw.keys()].filter(k=>k.startsWith(prefix))}};
 const cp=createStorageCheckpointStore(storage);const orphan={id:'orphan/1',state:'processing',attempts:2,idempotencyKey:'audio:orphan/1'};
 raw.set('collector_audio_lifecycle_v1:'+encodeURIComponent(orphan.id),JSON.stringify(orphan));
 const rows=await cp.list();assert.equal(rows.length,1);assert.equal(rows[0].id,orphan.id);
 assert.deepEqual(JSON.parse(raw.get('collector_audio_lifecycle_v1:index')),[orphan.id]);
 assert.deepEqual(await cp.diagnostics(),{indexCount:1,keyEnumerationAvailable:true,orphanIds:[],missingIds:[],indexCorrupt:false});
});
test('checkpoint index reports orphan and missing keys before reconciliation',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true},async listRawKeys(prefix){return [...raw.keys()].filter(k=>k.startsWith(prefix))}};
 const cp=createStorageCheckpointStore(storage);
 raw.set('collector_audio_lifecycle_v1:index',JSON.stringify(['missing']));
 raw.set('collector_audio_lifecycle_v1:'+encodeURIComponent('orphan'),JSON.stringify({id:'orphan',state:'failed',idempotencyKey:'audio:orphan'}));
 const d=await cp.diagnostics();assert.deepEqual(d.orphanIds,['orphan']);assert.deepEqual(d.missingIds,['missing']);
 const rows=await cp.list();assert.deepEqual(rows.map(x=>x.id),['orphan']);assert.deepEqual(JSON.parse(raw.get('collector_audio_lifecycle_v1:index')),['orphan']);
});
test('checkpoint write and index are independently readback verified',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){if(k.endsWith(':index'))return true;raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true}};
 const cp=createStorageCheckpointStore(storage);await assert.rejects(cp.put({id:'x',state:'captured',idempotencyKey:'audio:x'}),/index readback verification/);
});
test('checkpoint payload size is bounded to avoid storage exhaustion',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true}};
 const cp=createStorageCheckpointStore(storage,{maxCheckpointBytes:100});
 await assert.rejects(cp.put({id:'large',state:'failed',idempotencyKey:'audio:large',error:'x'.repeat(200)}),/exceeds storage limit/);
});
test('checkpoint deletion requires key and index readback to confirm',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){return true}};
 const cp=createStorageCheckpointStore(storage);await cp.put({id:'keep',state:'captured',idempotencyKey:'audio:keep'});
 await assert.rejects(cp.remove('keep'),/removal readback verification/);
 assert.equal((await cp.list()).length,1);
});
test('checkpoint schema rejects invalid timestamp and unsupported future version',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true}};
 const cp=createStorageCheckpointStore(storage);
 await assert.rejects(cp.put({id:'t',state:'captured',idempotencyKey:'audio:t',createdAt:3}),/createdAt invalid/);
 await assert.rejects(cp.put({id:'v',state:'captured',idempotencyKey:'audio:v',schemaVersion:99}),/schema version invalid/);
});
test('checkpoint index rejects duplicate ids rather than silently masking corruption',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map([['collector_audio_lifecycle_v1:index',JSON.stringify(['dup','dup'])]]);
 const storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true}};
 const cp=createStorageCheckpointStore(storage);await assert.rejects(cp.list(),/index is invalid/);
});


test('source audio is retained by default after verified structured persistence',async()=>{
 const x=fixture();const cp=await x.lifecycle.process('a1');
 assert.equal(cp.state,'source_retained');assert.equal(cp.persistenceVerified,true);assert.equal(cp.persisted,true);
 assert.equal(cp.sourceRetained,true);assert.equal(cp.audioDeleted,false);assert.equal(x.audio.has('a1'),true);
 assert.equal(x.calls.filter(value=>value==='delete').length,0);
 assert.equal(x.lifecycle.states.includes('source_retained'),true);
 assert.deepEqual(await x.lifecycle.recover(),[]);
});

test('source deletion requires an explicit true constructor policy',async()=>{
 assert.throws(()=>createAudioProcessingLifecycle({audioStore:{get:async()=>null,remove:async()=>true},interpret:async()=>({}),extract:async()=>({}),validate:async x=>x,persist:async()=>({}),verifyPersisted:async()=>true,deleteAudioAfterVerified:'yes'}),/explicit boolean policy/);
 const x=fixture({deleteAudioAfterVerified:true});const cp=await x.lifecycle.process('a1');
 assert.equal(cp.state,'completed');assert.equal(cp.audioDeleted,true);assert.equal(x.audio.has('a1'),false);
});

test('source-retained checkpoint schema requires a durable verified commit and retained source',async()=>{
 const {createStorageCheckpointStore}=require('./audio-processing-lifecycle');
 const raw=new Map(),storage={async readRaw(k){return raw.get(k)??null},async writeRaw(k,v){raw.set(k,String(v));return true},async removeRaw(k){raw.delete(k);return true}};
 const cp=createStorageCheckpointStore(storage);
 await assert.rejects(cp.put({id:'invalid',state:'source_retained',idempotencyKey:'audio:invalid',persisted:true}),/requires verified persistence/);
 await assert.rejects(cp.put({id:'deleted',state:'source_retained',idempotencyKey:'audio:deleted',persisted:true,persistenceVerified:true,audioDeleted:true}),/invalid state/);
 await cp.put({id:'retained',state:'source_retained',idempotencyKey:'audio:retained',persisted:true,persistenceVerified:true,sourceRetained:true,audioDeleted:false});
 assert.equal((await cp.get('retained')).state,'source_retained');
});
