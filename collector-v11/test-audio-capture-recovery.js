'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Recovery=require('./ai/audio-capture-recovery');

test('stable intent key binds every audio capture to one deterministic Core identity',()=>{
 assert.equal(Recovery.stableIntentKey('rec-1'),'collector-audio-capture:rec-1');
 assert.equal(Recovery.stableIntentKey('rec-1'),Recovery.stableIntentKey('rec-1'));
 assert.notEqual(Recovery.stableIntentKey('rec-1'),Recovery.stableIntentKey('rec-2'));
 assert.throws(()=>Recovery.stableIntentKey(' '),/invalid/);
});
test('recovery finds a committed capture by the current stable key and exact source ID',()=>{
 const event={id:'event-1',intentKey:'collector-audio-capture:rec-1',status:'committed',payload:{sourceId:'audio:rec-1'}};
 assert.equal(Recovery.findCommittedEvent({events:[event]},'rec-1'),event);
});
test('recovery recognizes the legacy structured-memory idempotency key',()=>{
 const event={id:'event-1',intentKey:'collector-memory-capture:audio:rec-1',status:'committed',payload:{sourceId:'audio:rec-1'}};
 assert.equal(Recovery.findCommittedEvent({events:[event]},'rec-1'),event);
});
test('recovery rejects duplicate or mismatched source events and ignores uncommitted events',()=>{
 const first={id:'event-1',intentKey:'collector-audio-capture:rec-1',status:'committed',payload:{sourceId:'audio:rec-1'}};
 const second={...first,id:'event-2'};
 assert.throws(()=>Recovery.findCommittedEvent({events:[first,second]},'rec-1'),/Multiple committed/);
 assert.equal(Recovery.findCommittedEvent({events:[{...first,payload:{sourceId:'audio:other'}}]},'rec-1'),null);
 assert.equal(Recovery.findCommittedEvent({events:[{...first,status:'pending'}]},'rec-1'),null);
});
test('recovery refuses malformed Core state or recording identity',()=>{
 assert.throws(()=>Recovery.findCommittedEvent({},'rec-1'),/events/);
 assert.throws(()=>Recovery.findCommittedEvent({events:[]},''),/invalid/);
});

test('a note-only Core commit is not considered sufficient structured memory for deletion',()=>{
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'event.note',target:null,data:{description:'just a note'}}]}),false);
});
test('entity and attribute operations qualify as structured persistence',()=>{
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'entity.create',target:'e1',data:{name:'Plant',type:'plant'}}]}),true);
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'event.note',data:{}},{operation:'attribute.set',target:'e1',data:{name:'height',value:20}}]}),true);
 assert.equal(Recovery.hasStructuredOperations({operations:[]}),false);
});


function checkpoint(recordingId='rec-1',eventId='event-1',intentKey=Recovery.stableIntentKey(recordingId)){
 return {id:recordingId,persisted:true,persistenceVerified:true,persistResult:{eventId,intentKey}};
}
function committedEvent(recordingId='rec-1',intentKey=Recovery.stableIntentKey(recordingId),operations=[{operation:'entity.create',target:'e1',data:{name:'Plant',type:'plant'}}]){
 return {id:'event-1',intentKey,status:'committed',payload:{sourceId:'audio:'+recordingId},operations};
}
test('checkpoint verifier accepts only the committed structured event belonging to its exact recording',()=>{
 const event=committedEvent(),cp=checkpoint();
 assert.equal(Recovery.verifyCheckpointEvent({events:[event]},cp),event);
});
test('checkpoint verifier rejects a valid Core event that belongs to another audio recording',()=>{
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[committedEvent('rec-2')]},checkpoint('rec-1')),/source does not match/);
});
test('checkpoint verifier rejects forged checkpoint recording IDs and unrelated idempotency keys',()=>{
 const event=committedEvent();
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[event]},checkpoint('rec-2')),/idempotency key/);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[event]},checkpoint('rec-1','event-1','other-intent')),/idempotency key/);
});
test('checkpoint verifier requires durable persistence flags and a committed event',()=>{
 const event=committedEvent();
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[event]},{...checkpoint(),persisted:false}),/proof is incomplete/);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[event]},{...checkpoint(),persistenceVerified:false}),/proof is incomplete/);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[{...event,status:'pending'}]},checkpoint()),/not committed/);
});
test('checkpoint verifier rejects ambiguous, missing or duplicate event references',()=>{
 const event=committedEvent();
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[]},checkpoint()),/exactly one/);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[event,{...event}]},checkpoint()),/exactly one/);
 assert.throws(()=>Recovery.verifyCheckpointEvent({events:[event]},{}),/ID invalid/);
});
test('only known structured Core mutations qualify for source deletion',()=>{
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'event.note'}]}),false);
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'unsupported.write'}]}),false);
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'   ' }]}),false);
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'attribute.set'}]}),true);
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'relation.create'}]}),true);
 assert.equal(Recovery.hasStructuredOperations({operations:[{operation:'event.attribute.set'}]}),true);
});
test('checkpoint verifier supports the legacy structured-memory idempotency key when source matches',()=>{
 const recordingId='rec-legacy',sourceId='audio:'+recordingId;
 const event=committedEvent(recordingId,'collector-memory-capture:'+sourceId);
 const cp=checkpoint(recordingId,'event-1','collector-memory-capture:'+sourceId);
 assert.equal(Recovery.verifyCheckpointEvent({events:[event]},cp),event);
});
