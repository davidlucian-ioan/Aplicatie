(function(root){
 'use strict';
 const DEFAULT_PREFIX='collector_audio_transcript_v1:';
 function validateId(id){
  if(typeof id!=='string'||!id.trim()||id.length>180||id!==id.trim())throw new TypeError('Audio transcript recording ID invalid');
  return id;
 }
 function createStore(storage,{prefix=DEFAULT_PREFIX,maxTranscriptChars=120000,maxRecordBytes=512*1024}={}){
  if(!storage||typeof storage.readRaw!=='function'||typeof storage.writeRaw!=='function'||typeof storage.removeRaw!=='function')throw new TypeError('Transcript checkpoint storage is unavailable');
  if(typeof prefix!=='string'||!prefix.trim()||!Number.isInteger(maxTranscriptChars)||maxTranscriptChars<1||!Number.isInteger(maxRecordBytes)||maxRecordBytes<1024)throw new TypeError('Transcript checkpoint limits are invalid');
  const keyFor=id=>prefix+encodeURIComponent(validateId(id));
  function validateRecord(record,id){
   if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Audio transcript checkpoint is invalid');
   if(record.schemaVersion!==1||record.id!==id)throw new Error('Audio transcript checkpoint identity or version mismatch');
   if(typeof record.transcript!=='string'||!record.transcript.trim()||record.transcript.length>maxTranscriptChars)throw new Error('Audio transcript checkpoint content is invalid');
   if(typeof record.updatedAt!=='string'||!Number.isFinite(Date.parse(record.updatedAt)))throw new Error('Audio transcript checkpoint timestamp is invalid');
   return Object.freeze({schemaVersion:1,id,transcript:record.transcript,updatedAt:record.updatedAt});
  }
  return Object.freeze({
   async get(id){
    const key=keyFor(id),raw=await storage.readRaw(key);
    if(raw===null||raw===undefined)return null;
    if(typeof raw!=='string'||raw.length>maxRecordBytes)throw new Error('Audio transcript checkpoint exceeds the storage limit');
    let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error('Audio transcript checkpoint is corrupt')}
    return validateRecord(parsed,id);
   },
   async put(id,transcript){
    validateId(id);
    if(typeof transcript!=='string'||!transcript.trim()||transcript.length>maxTranscriptChars)throw new TypeError('Audio transcript must be non-empty and within the size limit');
    const key=keyFor(id),record={schemaVersion:1,id,transcript,updatedAt:new Date().toISOString()},serialized=JSON.stringify(record);
    if(serialized.length>maxRecordBytes)throw new Error('Audio transcript checkpoint exceeds the storage limit');
    if(await storage.writeRaw(key,serialized)!==true)throw new Error('Audio transcript checkpoint write was not acknowledged');
    if(await storage.readRaw(key)!==serialized)throw new Error('Audio transcript checkpoint readback verification failed');
    return validateRecord(JSON.parse(serialized),id);
   },
   async remove(id){
    const key=keyFor(id);
    if(await storage.removeRaw(key)!==true)throw new Error('Audio transcript checkpoint removal was not acknowledged');
    const remaining=await storage.readRaw(key);
    if(remaining!==null&&remaining!==undefined)throw new Error('Audio transcript checkpoint removal readback verification failed');
    return true;
   },
   keyFor
  });
 }
 const api=Object.freeze({createStore,validateId,DEFAULT_PREFIX});
 root.CollectorAudioTranscriptCheckpoints=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
