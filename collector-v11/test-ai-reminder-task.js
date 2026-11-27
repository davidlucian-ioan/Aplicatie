'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCommand,taskEntityId}=require('./ai/reminder-task');
const Engine=require('./engine');
const {CorePort}=require('./ai/core-port');
const entry=(lifecycle,extra={})=>({reminderId:'r-1',idempotencyKey:'idem:'+lifecycle,title:'Verifică pompa',dueAt:'2026-11-27T09:00:00Z',occurredAt:'2026-11-26T18:00:00Z',sourceId:'audio:capture-1',lifecycle,...extra});
const first=()=>buildCommand(entry('scheduled'),{entities:[]});
function taskFrom(command){const create=command.operations.find(op=>op.operation==='entity.create');return {id:create.target,name:create.data.name,type:create.data.type,attributes:Object.fromEntries(command.operations.filter(op=>op.operation==='attribute.set').map(op=>[op.data.name,op.data.value]))}}
test('scheduled reminder creates one canonical replayable Core task without raw transcript',()=>{
 const command=first(),task=taskFrom(command);
 assert.equal(task.id,taskEntityId('r-1'));assert.equal(task.type,'task');assert.equal(task.attributes.taskKind,'reminder');assert.equal(task.attributes.reminderId,'r-1');assert.equal(task.attributes.status,'open');assert.equal(task.attributes.sourceId,'audio:capture-1');
 assert.ok(command.operations.every(op=>op.operation!=='event.note'));
 assert.doesNotMatch(JSON.stringify(command),/sourceContext|transcript|rawTranscript/i);
});
test('schedule uncertainty creates an open task with an uncertain schedule state',()=>{
 const task=taskFrom(buildCommand(entry('schedule_uncertain'),{entities:[]}));
 assert.equal(task.attributes.status,'open');assert.equal(task.attributes.scheduleState,'uncertain');
});
test('completion updates the existing task and refuses invalid source or terminal transitions',()=>{
 const task=taskFrom(first()),done=buildCommand(entry('completed'),{entities:[task]});
 assert.ok(done.operations.some(op=>op.operation==='attribute.set'&&op.data.name==='status'&&op.data.value==='completed'));
 assert.ok(done.operations.some(op=>op.data?.name==='completedAt'));
 assert.throws(()=>buildCommand(entry('cancelled'),{entities:[{...task,attributes:{...task.attributes,status:'completed'}}]}),/Invalid reminder task lifecycle transition/);
 assert.throws(()=>buildCommand(entry('completed',{sourceId:'audio:other'}),{entities:[task]}),/source does not match/);
});
test('snooze stores a successor task reference and requires a valid successor date',()=>{
 const task=taskFrom(first()),command=buildCommand(entry('snoozed',{replacementReminderId:'r-2',replacementAt:'2026-11-26T18:10:00Z'}),{entities:[task]});
 assert.ok(command.operations.some(op=>op.data?.name==='status'&&op.data.value==='snoozed'));
 assert.ok(command.operations.some(op=>op.data?.name==='successorTaskId'&&op.data.value===taskEntityId('r-2')));
 assert.throws(()=>buildCommand(entry('snoozed',{replacementReminderId:'r-2'}),{entities:[task]}),/timezone-aware/);
});
test('canonical task ID collisions and duplicate task projections fail closed',()=>{
 const input=entry('scheduled');
 assert.throws(()=>buildCommand(input,{entities:[{id:taskEntityId('r-1'),type:'person',name:'X',attributes:{}}]}),/ID collision/);
 assert.throws(()=>buildCommand(input,{entities:[{...taskFrom(first()),id:'other'}]}),/non-canonical/);
 assert.throws(()=>buildCommand({...input,dueAt:'2026-02-31T09:00:00Z'},{entities:[]}),/valid ISO timestamp/);
});
test('Core Port commits and replays reminder task status without the reminder side store',async()=>{
 let state=Engine.emptyState(),counter=0;
 const store={getState:()=>state,async persistState(next){state=next;return true}};
 const port=new CorePort({core:Engine,store,idFactory:()=> 'event-'+(++counter),clock:()=> '2026-11-26T18:00:00Z'});
 const scheduled=buildCommand(entry('scheduled'),state);
 assert.equal((await port.preview(scheduled)).status,'preview_ok');
 assert.equal((await port.execute(scheduled,{confirmed:true})).status,'committed');
 const entityId=taskEntityId('r-1');
 assert.equal(state.entities.find(entity=>entity.id===entityId).attributes.status,'open');
 const completed=buildCommand(entry('completed',{idempotencyKey:'idem:completed'}),state);
 assert.equal((await port.execute(completed,{confirmed:true})).status,'committed');
 const replayed=Engine.replay(state.events,[]);
 const task=replayed.entities.find(entity=>entity.id===entityId);
 assert.equal(task.attributes.status,'completed');
 assert.equal(task.attributes.dueAt,'2026-11-27T09:00:00Z');
 assert.equal(task.attributeHistory.status.length,2);
 assert.equal(replayed.meta.replayWarnings.length,0);
});

test('a terminal Core lifecycle can create a task when native schedule recovery was compensated before first sync',()=>{
 const command=buildCommand(entry('cancelled'),{entities:[]}),task=taskFrom(command);
 assert.equal(task.attributes.status,'cancelled');
 assert.equal(task.attributes.scheduleState,'settled');
 assert.equal(task.attributes.cancelledAt,'2026-11-26T18:00:00Z');
});
