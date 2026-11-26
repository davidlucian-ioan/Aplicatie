(function(root){
 'use strict';
 const STATES=['captured','processing','interpreted','validated','persisted','persistence_verified','audio_deletion_pending','audio_deleted','completed'];
 const TERMINAL=['completed'];
 function fail(msg){throw new Error(msg)}
 function createAudioProcessingLifecycle({audioStore,checkpointStore,interpret,extract,validate,persist,verifyPersisted}={}){
  for(const [name,fn] of Object.entries({interpret,extract,validate,persist,verifyPersisted}))if(typeof fn!=='function')fail('Audio lifecycle dependency missing: '+name);
  if(!audioStore||typeof audioStore.get!=='function'||typeof audioStore.remove!=='function')fail('Audio store must support get/remove');
  const checkpoints=checkpointStore||{async get(){return null},async put(){},async remove(){}};
  async function saveCheckpoint(cp){cp.updatedAt=new Date().toISOString();await checkpoints.put(cp);return cp}
  async function processUnlocked(id,{retry=false}={}){
   if(!id)fail('Recording ID required');
   let cp=await checkpoints.get(id);
   if(cp&&(cp.id!==id||cp.idempotencyKey!=='audio:'+id))fail('Checkpoint identity/idempotency mismatch; refusing to process');
   if(cp&&TERMINAL.includes(cp.state))return cp;
   if(cp&&cp.state==='audio_deleted'){cp.state='completed';cp.completedAt=cp.completedAt||new Date().toISOString();await saveCheckpoint(cp);return cp;}
   if(cp&&!retry&&cp.state==='failed')fail('Processing previously failed; call retry explicitly');
   const record=await audioStore.get(id);
   if(!record){
    // The delete may have succeeded while its response/checkpoint was lost.
    // Re-verify persisted structured memory before declaring recovery complete.
    if(cp&&cp.persistenceVerified===true&&(cp.state==='audio_deletion_pending'||cp.state==='failed')){
     const verified=await verifyPersisted(cp.persistResult,cp.validated,{id,idempotencyKey:cp.idempotencyKey});
     if(verified===true){cp.audioDeleted=true;cp.state='audio_deleted';await saveCheckpoint(cp);cp.state='completed';cp.completedAt=new Date().toISOString();await saveCheckpoint(cp);return cp;}
    }
    fail('Audio source missing; cannot recover processing without verified persistence and deletion checkpoint');
   }
   cp=cp||{id,state:'captured',attempts:0,idempotencyKey:'audio:'+id,createdAt:new Date().toISOString()};
   cp.attempts=(cp.attempts||0)+1;cp.error=null;cp.recoveryRequired=false;
   try{
    if(cp.state==='captured'||cp.state==='failed'){cp.state='processing';await saveCheckpoint(cp)}
    if(!cp.interpretation){cp.interpretation=await interpret(record,{id,idempotencyKey:cp.idempotencyKey});cp.state='interpreted';await saveCheckpoint(cp)}
    if(!cp.extraction){cp.extraction=await extract(cp.interpretation,record,{id,idempotencyKey:cp.idempotencyKey});cp.state='interpreted';await saveCheckpoint(cp)}
    if(!cp.validated){cp.validated=await validate(cp.extraction,cp.interpretation);cp.state='validated';await saveCheckpoint(cp)}
    if(!cp.persisted){cp.persistResult=await persist(cp.validated,{id,idempotencyKey:cp.idempotencyKey});cp.persisted=true;cp.state='persisted';await saveCheckpoint(cp)}
    const verified=await verifyPersisted(cp.persistResult,cp.validated,{id,idempotencyKey:cp.idempotencyKey});
    if(verified!==true)fail('Persistence verification did not return true; audio retained');
    cp.persistenceVerified=true;cp.state='persistence_verified';await saveCheckpoint(cp);
    // Remove only after independently verifying the structured data commit.
    cp.state='audio_deletion_pending';await saveCheckpoint(cp);
    const removed=await audioStore.remove(id);
    const remaining=await audioStore.get(id);
    if(remaining!==null&&remaining!==undefined)fail('Audio deletion verification failed; source retained');
    if(removed!==true&&remaining!==null&&remaining!==undefined)fail('Audio deletion was not confirmed; source retained for recovery');
    cp.audioDeleted=true;cp.state='audio_deleted';await saveCheckpoint(cp);
    cp.state='completed';cp.completedAt=new Date().toISOString();await saveCheckpoint(cp);
    return cp;
   }catch(error){
    cp.state='failed';cp.error=String(error?.message||error).slice(0,500);cp.recoveryRequired=true;
    // Never remove the source on any processing/persistence uncertainty.
    await saveCheckpoint(cp).catch(()=>{});
    throw error;
   }
  }
  const inFlight=new Map();
  async function process(id,options={}){
   if(!id)fail('Recording ID required');
   if(inFlight.has(id))return inFlight.get(id);
   const task=processUnlocked(id,options);
   inFlight.set(id,task);
   try{return await task}finally{if(inFlight.get(id)===task)inFlight.delete(id)}
  }
  async function recoverDetails(){const rows=await checkpoints.list?.()||[];return rows.filter(cp=>!TERMINAL.includes(cp.state)).map(cp=>({id:cp.id,state:cp.state,attempts:Number(cp.attempts)||0,recoveryRequired:!!cp.recoveryRequired,error:cp.error||null,updatedAt:cp.updatedAt||null,audioDeleted:!!cp.audioDeleted,persistenceVerified:!!cp.persistenceVerified})).sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')))}
  async function recover(){return (await recoverDetails()).map(cp=>cp.id)}
  return Object.freeze({process,recover,recoverDetails,states:STATES.slice()});
 }
 function validateCheckpoint(cp,expectedId=null){
  if(!cp||typeof cp!=='object'||Array.isArray(cp))fail('Audio lifecycle checkpoint invalid');
  if(typeof cp.id!=='string'||!cp.id.trim()||(expectedId!==null&&cp.id!==expectedId))fail('Audio lifecycle checkpoint identity mismatch');
  if(cp.idempotencyKey!=='audio:'+cp.id)fail('Audio lifecycle checkpoint idempotency mismatch');
  if(!STATES.includes(cp.state)&&cp.state!=='failed')fail('Audio lifecycle checkpoint state invalid');
  if(cp.attempts!==undefined&&(!Number.isInteger(cp.attempts)||cp.attempts<0))fail('Audio lifecycle checkpoint attempts invalid');
  if(cp.persistenceVerified===true&&cp.persisted!==true)fail('Checkpoint claims verified persistence without persisted commit');
  if(cp.audioDeleted===true&&!['audio_deleted','completed'].includes(cp.state))fail('Checkpoint claims audio deletion in an invalid state');
  if(cp.state==='completed'&&cp.audioDeleted!==true)fail('Completed checkpoint missing audioDeleted confirmation');
  if(cp.state==='completed'&&cp.persistenceVerified!==true)fail('Completed checkpoint missing persistence verification');
  return {...cp,schemaVersion:Number(cp.schemaVersion)||1};
 }
 function createStorageCheckpointStore(storage,{prefix='collector_audio_lifecycle_v1'}={}){
  if(!storage||typeof storage.readRaw!=='function'||typeof storage.writeRaw!=='function'||typeof storage.removeRaw!=='function')fail('Checkpoint storage must support readRaw/writeRaw/removeRaw');
  const indexKey=prefix+':index',keyFor=id=>prefix+':'+encodeURIComponent(String(id));
  let queue=Promise.resolve();
  function enqueue(fn){const task=queue.then(fn);queue=task.catch(()=>{});return task}
  async function readIndex(){const raw=await storage.readRaw(indexKey);if(raw===null||raw===undefined)return [];let ids;try{ids=JSON.parse(raw)}catch{fail('Audio lifecycle checkpoint index is corrupt')}if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id.trim()))fail('Audio lifecycle checkpoint index is invalid');return [...new Set(ids)]}
  return Object.freeze({
   async get(id){if(typeof id!=='string'||!id.trim())fail('Checkpoint ID required');const raw=await storage.readRaw(keyFor(id));if(raw===null||raw===undefined)return null;let cp;try{cp=JSON.parse(raw)}catch{fail('Audio lifecycle checkpoint is corrupt: '+id)}return validateCheckpoint(cp,id)},
   put(cp){return enqueue(async()=>{const normalized=validateCheckpoint(cp);const ids=await readIndex();await storage.writeRaw(keyFor(normalized.id),JSON.stringify(normalized));if(!ids.includes(normalized.id)){ids.push(normalized.id);await storage.writeRaw(indexKey,JSON.stringify(ids))}return true})},
   remove(id){return enqueue(async()=>{const ids=await readIndex();await storage.removeRaw(keyFor(id));await storage.writeRaw(indexKey,JSON.stringify(ids.filter(x=>x!==id)));return true})},
   list(){return enqueue(async()=>{const ids=await readIndex(),rows=[];for(const id of ids){const cp=await this.get(id);if(cp)rows.push(cp)}return rows})}
  });
 }
 const api={STATES,createAudioProcessingLifecycle,createStorageCheckpointStore};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.CollectorAudioProcessingLifecycle=api;
})(typeof globalThis!=='undefined'?globalThis:this);
