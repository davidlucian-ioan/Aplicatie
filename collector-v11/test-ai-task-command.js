'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTaskCommand,editTaskCommand,transitionTaskCommand,addDependencyCommand,entityIdForTask}=require('./ai/task-command');
const Engine=require('./engine');
const {CorePort}=require('./ai/core-port');
const input=(taskId,extra={})=>({taskId,idempotencyKey:'task-create:'+taskId,title:'Pregătește substratul',occurredAt:'2026-11-26T18:00:00Z',sourceId:'audio:capture-1',...extra});
const create=(taskId,extra={})=>createTaskCommand(input(taskId,extra),{entities:[]});
const taskFrom=command=>{const op=command.operations.find(x=>x.operation==='entity.create');return {id:op.target,name:op.data.name,type:'task',attributes:Object.fromEntries(command.operations.filter(x=>x.operation==='attribute.set').map(x=>[x.data.name,x.data.value]))}};
test('task edit validates title, deadline and priority and journals changes',()=>{
 const base=taskFrom(create('edit-task',{dueDate:'2026-11-27',dueTime:'09:00',timezone:'Europe/Bucharest',priority:'high'})),state={entities:[base],relations:[]};
 const edited=editTaskCommand({taskId:'edit-task',title:'Titlu nou',dueDate:'2026-11-28',dueTime:'10:30',timezone:'Europe/Bucharest',priority:'urgent',assignedTo:'Mihai',recurrence:'weekly',idempotencyKey:'edit-1',occurredAt:'2026-11-26T18:10:00Z'},state);
 assert.equal(edited.intent,'task.edit');assert.equal(edited.requiresConfirmation,true);
 assert.ok(edited.operations.some(op=>op.operation==='entity.rename'&&op.data.name==='Titlu nou'));
 assert.ok(edited.operations.some(op=>op.operation==='attribute.set'&&op.data.name==='dueDate'&&op.data.value==='2026-11-28'));
 assert.ok(edited.operations.some(op=>op.operation==='attribute.set'&&op.data.name==='priority'&&op.data.value==='urgent'));assert.ok(edited.operations.some(op=>op.operation==='attribute.set'&&op.data.name==='assignedTo'&&op.data.value==='Mihai'));assert.ok(edited.operations.some(op=>op.operation==='attribute.set'&&op.data.name==='recurrence'&&op.data.value==='weekly'));
 assert.throws(()=>editTaskCommand({taskId:'edit-task',title:'',idempotencyKey:'bad'},state),/title invalid/);
 assert.throws(()=>editTaskCommand({taskId:'edit-task',dueDate:null,dueTime:'11:00',idempotencyKey:'bad-time'},state),/requires dueDate/);
 assert.throws(()=>editTaskCommand({taskId:'edit-task',dueDate:'2026-11-28',dueTime:'11:00',timezone:null,idempotencyKey:'bad-zone'},state),/requires an IANA timezone/);
 assert.throws(()=>editTaskCommand({taskId:'edit-task',priority:'critical',idempotencyKey:'bad-priority'},state),/priority is not supported/);assert.throws(()=>editTaskCommand({taskId:'edit-task',recurrence:'yearly',idempotencyKey:'bad-recurrence'},state),/recurrence is not supported/);assert.throws(()=>editTaskCommand({taskId:'edit-task',assignedTo:'x'.repeat(121),idempotencyKey:'bad-assignee'},state),/assignedTo invalid/);
});
test('task edit clears optional deadline values',()=>{
 const base=taskFrom(create('clear-edit',{dueDate:'2026-11-27'})),state={entities:[base],relations:[]};
 const edited=editTaskCommand({taskId:'clear-edit',dueDate:null,dueTime:null,timezone:null,idempotencyKey:'clear-edit-1',occurredAt:'2026-11-26T18:11:00Z'},state);
 assert.ok(edited.operations.some(op=>op.operation==='attribute.set'&&op.data.name==='dueDate'&&op.data.value===null));
 assert.ok(edited.operations.some(op=>op.operation==='attribute.set'&&op.data.name==='dueTime'&&op.data.value===null));
});

test('general task is created as a canonical Core task with optional due date and no native reminder side effect',()=>{
 const command=create('turn-1:0'),task=taskFrom(command);
 assert.equal(command.intent,'task.create');assert.equal(command.requiresConfirmation,true);
 assert.equal(task.id,entityIdForTask('turn-1:0'));assert.equal(task.attributes.taskKind,'user');
 assert.equal(task.attributes.status,'open');assert.equal(task.attributes.priority,'normal');
 assert.equal(task.attributes.sourceId,'audio:capture-1');assert.equal(task.attributes.dueDate,undefined);
 assert.ok(command.operations.every(operation=>operation.operation!=='event.note'&&operation.operation!=='notification.schedule'));
});
test('general task stores a date-only deadline without inventing a time',()=>{
 const task=taskFrom(create('turn-2:0',{dueDate:'2026-11-27'}));
 assert.equal(task.attributes.dueDate,'2026-11-27');assert.equal(task.attributes.dueTime,undefined);
 assert.equal(task.attributes.timezone,undefined);
});
test('timed task requires explicit valid date, time and IANA timezone',()=>{
 assert.throws(()=>create('turn-3:0',{dueTime:'09:00'}),/requires dueDate/);
 assert.throws(()=>create('turn-3:1',{dueDate:'2026-11-27',dueTime:'09:00'}),/requires an IANA timezone/);
 assert.throws(()=>create('turn-3:2',{dueDate:'2026-02-30'}),/valid calendar date/);
 assert.throws(()=>create('turn-3:3',{dueDate:'2026-11-27',dueTime:'25:00',timezone:'Europe/Bucharest'}),/HH:mm/);
 assert.throws(()=>create('turn-3:4',{dueDate:'2026-11-27',timezone:'Invalid/Zone'}),/IANA timezone/);
 const task=taskFrom(create('turn-3:5',{dueDate:'2026-11-27',dueTime:'09:15',timezone:'Europe/Bucharest'}));
 assert.equal(task.attributes.dueTime,'09:15');assert.equal(task.attributes.timezone,'Europe/Bucharest');
});
test('create task rejects invalid priority, title and canonical ID collisions',()=>{
 assert.throws(()=>create('turn-4:0',{priority:'critical'}),/priority is not supported/);
 assert.throws(()=>create('turn-4:1',{title:' '}),/title invalid/);
 assert.throws(()=>createTaskCommand(input('collision'),{entities:[{id:entityIdForTask('collision'),type:'person',name:'Wrong',attributes:{}}]}),/ID collision/);
});
test('task transitions are validated and completion is blocked by unfinished prerequisites',()=>{
 const a=taskFrom(create('task-a')),b=taskFrom(create('task-b'));
 const state={entities:[a,b],relations:[{id:'dep',sourceId:a.id,targetId:b.id,type:'depends_on',endedAt:null}]};
 assert.throws(()=>transitionTaskCommand({taskId:'task-a',status:'completed',idempotencyKey:'done-a',occurredAt:'2026-11-26T18:05:00Z'},state),/blocat/);
 const started=transitionTaskCommand({taskId:'task-a',status:'in_progress',idempotencyKey:'start-a',occurredAt:'2026-11-26T18:05:00Z'},state);
 assert.ok(started.operations.some(op=>op.data?.name==='status'&&op.data.value==='in_progress'));
 const completedB=transitionTaskCommand({taskId:'task-b',status:'completed',idempotencyKey:'done-b',occurredAt:'2026-11-26T18:06:00Z'},state);
 b.attributes.status='completed';
 const doneA=transitionTaskCommand({taskId:'task-a',status:'completed',idempotencyKey:'done-a',occurredAt:'2026-11-26T18:07:00Z'},state);
 assert.ok(doneA.operations.some(op=>op.data?.name==='status'&&op.data.value==='completed'));
 assert.ok(completedB.operations.length);
 assert.throws(()=>transitionTaskCommand({taskId:'task-a',status:'nonsense',idempotencyKey:'bad'},state),/status is not supported/);
});
test('dependencies cannot self-reference, duplicate or create a cycle',()=>{
 const a=taskFrom(create('a')),b=taskFrom(create('b')),c=taskFrom(create('c'));
 const state={entities:[a,b,c],relations:[{id:'a-b',sourceId:a.id,targetId:b.id,type:'depends_on',endedAt:null}]};
 assert.throws(()=>addDependencyCommand({taskId:'a',dependsOnTaskId:'a',idempotencyKey:'self'},state),/însuși/);
 assert.throws(()=>addDependencyCommand({taskId:'a',dependsOnTaskId:'b',idempotencyKey:'duplicate'},state),/există deja/);
 assert.throws(()=>addDependencyCommand({taskId:'b',dependsOnTaskId:'a',idempotencyKey:'cycle'},state),/ciclu/);
 const cmd=addDependencyCommand({taskId:'a',dependsOnTaskId:'c',idempotencyKey:'a-c'},state);
 assert.equal(cmd.operations[0].data.type,'depends_on');assert.equal(cmd.operations[0].data.sourceId,a.id);assert.equal(cmd.operations[0].data.targetId,c.id);
});
test('CorePort persists, projects and replays a general task and its dependency lifecycle',async()=>{
 let state=Engine.emptyState(),counter=0;
 const port=new CorePort({core:Engine,store:{getState:()=>state,async persistState(next){state=next;return true}},idFactory:()=> 'task-event-'+(++counter),clock:()=> '2026-11-26T18:00:00Z'});
 const a=createTaskCommand(input('replay-a'),state),b=createTaskCommand(input('replay-b'),state);
 assert.equal((await port.preview(a)).status,'preview_ok');
 assert.equal((await port.execute(a,{confirmed:true})).status,'committed');
 assert.equal((await port.execute(b,{confirmed:true})).status,'committed');
 const dependency=addDependencyCommand({taskId:'replay-a',dependsOnTaskId:'replay-b',idempotencyKey:'replay-dep',occurredAt:'2026-11-26T18:01:00Z'},state);
 assert.equal((await port.execute(dependency,{confirmed:true})).status,'committed');
 const prerequisite=transitionTaskCommand({taskId:'replay-b',status:'completed',idempotencyKey:'replay-b-done',occurredAt:'2026-11-26T18:02:00Z'},state);
 assert.equal((await port.execute(prerequisite,{confirmed:true})).status,'committed');
 const dependent=transitionTaskCommand({taskId:'replay-a',status:'completed',idempotencyKey:'replay-a-done',occurredAt:'2026-11-26T18:03:00Z'},state);
 assert.equal((await port.execute(dependent,{confirmed:true})).status,'committed');
 const replay=Engine.replay(state.events,[]);
 assert.equal(replay.entities.find(e=>e.id===entityIdForTask('replay-a')).attributes.status,'completed');
 assert.equal(replay.relations.filter(r=>r.type==='depends_on').length,1);
 assert.equal(replay.meta.replayWarnings.length,0);
});

test('general tasks cannot depend on reminder-only task records',()=>{
 const a=taskFrom(create('general-a'));
 const reminder={id:'task:reminder:r1',name:'Trimite notificare',type:'task',attributes:{taskKind:'reminder',reminderId:'r1',status:'open'}};
 assert.throws(()=>addDependencyCommand({taskId:'general-a',dependsOnTaskId:reminder.id,idempotencyKey:'bad-dep'}, {entities:[a,reminder],relations:[]}),/doar pentru task-uri generale/);
});
