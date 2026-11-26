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
