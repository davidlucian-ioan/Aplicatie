(function(root){
 'use strict';
 function validateRecordingId(recordingId){
  if(typeof recordingId!=='string'||!recordingId.trim()||recordingId.length>180)throw new TypeError('Audio recording ID invalid');
  return recordingId;
 }
 function stableIntentKey(recordingId){return 'collector-audio-capture:'+validateRecordingId(recordingId)}
 function hasStructuredOperations(event){return Array.isArray(event?.operations)&&event.operations.some(operation=>operation&&typeof operation.operation==='string'&&operation.operation!=='event.note')}
 function findCommittedEvent(state,recordingId){
  validateRecordingId(recordingId);
  if(!state||!Array.isArray(state.events))throw new TypeError('Validated Core state with events is required');
  const sourceId='audio:'+recordingId;
  const keys=new Set([stableIntentKey(recordingId),'collector-memory-capture:'+sourceId]);
  const matches=state.events.filter(event=>event&&keys.has(event.intentKey)&&event.status==='committed'&&event.payload?.sourceId===sourceId);
  if(matches.length>1)throw new Error('Multiple committed Core events refer to the same audio capture');
  return matches[0]||null;
 }
 const api=Object.freeze({stableIntentKey,findCommittedEvent,hasStructuredOperations});
 root.CollectorAudioCaptureRecovery=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
