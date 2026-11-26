(function(root){
 'use strict';
 const LIFECYCLES=new Set(['scheduled','completed','cancelled','schedule_uncertain','snoozed']);
 const TASK_STATUSES=new Set(['open','completed','cancelled','snoozed']);
 const clone=value=>JSON.parse(JSON.stringify(value));
 function record(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
 function requiredText(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)throw new TypeError(label+' invalid');return value.trim()}
 function iso(value,label){
  const m=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
  if(!m)throw new TypeError(label+' must be a timezone-aware ISO timestamp');
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]),hour=Number(m[4]),minute=Number(m[5]),second=Number(m[6]||0);
  if(year<1||month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59||!Number.isFinite(Date.parse(value)))throw new TypeError(label+' must be a valid ISO timestamp');
  if(m[7]!=='Z'){const z=m[7].match(/^[+-](\d{2}):(\d{2})$/),h=Number(z?.[1]),min=Number(z?.[2]);if(!z||h>14||min>59||(h===14&&min!==0))throw new TypeError(label+' timezone is invalid')}
  return value;
 }
 function taskEntityId(reminderId){return 'task:reminder:'+requiredText(reminderId,'reminderId',180)}
 function buildCommand(entry,state){
  if(!record(entry))throw new TypeError('Reminder lifecycle entry invalid');
  if(!record(state)||!Array.isArray(state.entities))throw new TypeError('Core state with entities is required');
  const reminderId=requiredText(entry.reminderId,'reminderId',180),idempotencyKey=requiredText(entry.idempotencyKey,'idempotencyKey',300),lifecycle=entry.lifecycle;
  if(!LIFECYCLES.has(lifecycle))throw new TypeError('Reminder lifecycle is not supported');
  const title=requiredText(entry.title||'Reminder','title',160),dueAt=iso(entry.dueAt,'dueAt'),occurredAt=iso(entry.occurredAt,'occurredAt');
  const sourceId=entry.sourceId===undefined||entry.sourceId===null||entry.sourceId===''?null:requiredText(entry.sourceId,'sourceId',200);
  const successorReminderId=lifecycle==='snoozed'?requiredText(entry.replacementReminderId,'replacementReminderId',180):null;
  const replacementAt=lifecycle==='snoozed'?iso(entry.replacementAt,'replacementAt'):null;
  if(successorReminderId===reminderId)throw new Error('A snoozed reminder cannot replace itself');
  const entityId=taskEntityId(reminderId),entities=state.entities,byId=entities.find(entity=>entity.id===entityId)||null;
  const byReminder=entities.filter(entity=>entity.type==='task'&&entity.attributes?.taskKind==='reminder'&&entity.attributes?.reminderId===reminderId);
  if(byReminder.length>1)throw new Error('Multiple canonical task entities reference this reminder');
  if(byReminder.length===1&&byReminder[0].id!==entityId)throw new Error('Reminder is linked to a non-canonical task entity');
  if(byId&&(byId.type!=='task'||byId.attributes?.taskKind!=='reminder'||byId.attributes?.reminderId!==reminderId))throw new Error('Canonical task ID collision');
  const task=byId||byReminder[0]||null,operations=[];
  const set=(name,value)=>operations.push({operation:'attribute.set',target:entityId,data:{name,value,forceHistory:true}});
  let scheduleState=lifecycle==='schedule_uncertain'?'uncertain':'scheduled';
  if(!task){
   if(!['scheduled','schedule_uncertain'].includes(lifecycle))throw new Error('Cannot transition a reminder before its canonical task is created');
   operations.push({operation:'entity.create',target:entityId,data:{name:title,type:'task'}});
   set('taskKind','reminder');set('reminderId',reminderId);set('status','open');set('dueAt',dueAt);
   if(sourceId)set('sourceId',sourceId);
   set('scheduleState',scheduleState);set('createdAt',occurredAt);
  }else{
   if(task.name!==title)throw new Error('Reminder title does not match the canonical task');
   const attributes=task.attributes||{},currentStatus=attributes.status||'open';
   if(!TASK_STATUSES.has(currentStatus))throw new Error('Canonical reminder task has an invalid status');
   if(attributes.sourceId&&sourceId&&attributes.sourceId!==sourceId)throw new Error('Reminder source does not match its canonical task');
   if(lifecycle==='scheduled'||lifecycle==='schedule_uncertain'){
    if(currentStatus!=='open')throw new Error('A terminal reminder task cannot be rescheduled');
    scheduleState=lifecycle==='scheduled'?'scheduled':'uncertain';set('scheduleState',scheduleState);
   }else{
    if(currentStatus!=='open'&&currentStatus!==lifecycle)throw new Error('Invalid reminder task lifecycle transition: '+currentStatus+' → '+lifecycle);
    scheduleState='settled';set('status',lifecycle);set('scheduleState','settled');
    if(lifecycle==='completed')set('completedAt',occurredAt);
    if(lifecycle==='cancelled')set('cancelledAt',occurredAt);
    if(lifecycle==='snoozed'){
     set('snoozedAt',occurredAt);set('successorReminderId',successorReminderId);
     set('successorTaskId',taskEntityId(successorReminderId));set('successorDueAt',replacementAt);
    }
   }
  }
  set('lastLifecycle',lifecycle);set('updatedAt',occurredAt);
  const sourceEntity=sourceId?entities.find(entity=>entity.id===sourceId):null;
  if(!task&&sourceEntity&&sourceEntity.id!==entityId)operations.push({operation:'relation.create',target:null,data:{sourceId:sourceEntity.id,targetId:entityId,type:'related_to',attributes:{relationship:'source_for_reminder'}}});
  const summary='Reminder '+lifecycle+': '+title+' · termen: '+dueAt;
  return {contractVersion:'collector.command.v1',intent:'task.reminder.lifecycle',certainty:'certain',idempotencyKey,turnId:reminderId,requiresConfirmation:true,
   payload:{domain:'task',taskKind:'reminder',reminderId,entityId,lifecycle,title,dueAt,sourceId,occurredAt,successorReminderId,replacementAt,linkedEntityIds:sourceEntity?[sourceEntity.id]:[],summary},
   operations:clone(operations)};
 }
 const api={buildCommand,taskEntityId,LIFECYCLES:[...LIFECYCLES],TASK_STATUSES:[...TASK_STATUSES]};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.CollectorReminderTask=api;
})(typeof window!=='undefined'?window:globalThis);
