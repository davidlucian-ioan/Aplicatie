(function(root){
 'use strict';
 function validateRecordingId(recordingId){
  if(typeof recordingId!=='string'||!recordingId.trim()||recordingId.length>180)throw new TypeError('Audio recording ID invalid');
  return recordingId;
 }
 function stableIntentKey(recordingId){return 'collector-audio-capture:'+validateRecordingId(recordingId)}
 const STRUCTURED_OPERATIONS=new Set(['entity.create','entity.rename','attribute.set','relation.create','relation.close','relation.move','stock.change','stock.adjust','finance.record','event.attribute.set','relation.attribute.set','create','set_attribute']);
 function hasStructuredOperations(event){return Array.isArray(event?.operations)&&event.operations.some(operation=>operation&&typeof operation.operation==='string'&&STRUCTURED_OPERATIONS.has(operation.operation.trim()))}
 function verifyCheckpointEvent(state,checkpoint){
  if(!state||!Array.isArray(state.events))throw new TypeError('Validated Core state with events is required');
  if(!checkpoint||typeof checkpoint!=='object'||Array.isArray(checkpoint))throw new TypeError('Audio checkpoint is required');
  const recordingId=validateRecordingId(checkpoint.id),sourceId='audio:'+recordingId;
  if(checkpoint.persisted!==true||checkpoint.persistenceVerified!==true)throw new Error('Audio checkpoint persistence proof is incomplete');
  const persist=checkpoint.persistResult;
  if(!persist||typeof persist.eventId!=='string'||!persist.eventId.trim()||typeof persist.intentKey!=='string'||!persist.intentKey.trim())throw new Error('Audio checkpoint commit reference is invalid');
  const allowedIntentKeys=new Set([stableIntentKey(recordingId),'collector-memory-capture:'+sourceId]);
  if(!allowedIntentKeys.has(persist.intentKey))throw new Error('Audio checkpoint idempotency key does not belong to this recording');
  const matches=state.events.filter(event=>event&&event.id===persist.eventId&&event.intentKey===persist.intentKey);
  if(matches.length!==1)throw new Error('Audio checkpoint must identify exactly one persisted Core event');
  const event=matches[0];
  if(event.status!=='committed')throw new Error('Audio checkpoint event is not committed');
  if(event.payload?.sourceId!==sourceId)throw new Error('Audio checkpoint source does not match the recording being deleted');
  if(!hasStructuredOperations(event))throw new Error('Audio checkpoint event contains no supported structured Core operations');
  return event;
 }
 function findCommittedEvent(state,recordingId){
  validateRecordingId(recordingId);
  if(!state||!Array.isArray(state.events))throw new TypeError('Validated Core state with events is required');
  const sourceId='audio:'+recordingId;
  const keys=new Set([stableIntentKey(recordingId),'collector-memory-capture:'+sourceId]);
  const matches=state.events.filter(event=>event&&keys.has(event.intentKey)&&event.status==='committed'&&event.payload?.sourceId===sourceId);
  if(matches.length>1)throw new Error('Multiple committed Core events refer to the same audio capture');
  return matches[0]||null;
 }
 const api=Object.freeze({stableIntentKey,findCommittedEvent,hasStructuredOperations,verifyCheckpointEvent});
 root.CollectorAudioCaptureRecovery=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
