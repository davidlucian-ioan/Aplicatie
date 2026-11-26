(function(root){
 'use strict';
 const PRIORITIES=new Set(['low','normal','high','urgent']);
 const STATUSES=new Set(['open','in_progress','completed','cancelled']);
 const clone=value=>JSON.parse(JSON.stringify(value));
 function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)throw new TypeError(label+' invalid');return value.trim()}
 function isoDate(value,label='dueDate'){
  if(typeof value!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(value))throw new TypeError(label+' must use YYYY-MM-DD');
  const [y,m,d]=value.split('-').map(Number),check=new Date(Date.UTC(y,m-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)throw new TypeError(label+' is not a valid calendar date');
  return value;
 }
 function isoTime(value,label='dueTime'){
  if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new TypeError(label+' must use HH:mm');
  return value;
 }
 function timezone(value){
  if(value===null||value===undefined||value==='')return null;
  const zone=text(value,'timezone',80);
  try{new Intl.DateTimeFormat('en',{timeZone:zone}).format(new Date())}catch{throw new TypeError('timezone must be a valid IANA timezone')}
  return zone;
 }
 function entityIdForTask(taskId){
  const id=text(taskId,'taskId',180);
  return id.startsWith('task:user:')||id.startsWith('task:reminder:')?id:'task:user:'+id;
 }
 function findTask(state,taskId,{userOnly=false}={}){
  if(!state||!Array.isArray(state.entities))throw new TypeError('Core state with entities is required');
  const id=entityIdForTask(taskId),task=state.entities.find(entity=>entity.id===id)||null;
  if(!task||task.type!=='task'||!['user','reminder'].includes(task.attributes?.taskKind))throw new Error('Task-ul canonic nu există în Core.');
  if(userOnly&&task.attributes.taskKind!=='user')throw new Error('Acțiunea este permisă doar pentru task-uri generale, nu pentru reminders.');
  return task;
 }
 function command(intent,idempotencyKey,turnId,payload,operations){
  return {contractVersion:'collector.command.v1',intent,source:'work-task',certainty:'certain',
   idempotencyKey:text(idempotencyKey,'idempotencyKey',300),turnId:String(turnId||''),requiresConfirmation:true,
   payload:clone(payload),operations:clone(operations)};
 }
 function createTaskCommand(input,state){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Task input invalid');
  if(!state||!Array.isArray(state.entities))throw new TypeError('Core state with entities is required');
  const taskId=text(input.taskId,'taskId',180),id=entityIdForTask(taskId);
  const title=text(input.title,'title',160);
  const occurredAt=input.occurredAt||new Date().toISOString();
  if(typeof occurredAt!=='string'||!Number.isFinite(Date.parse(occurredAt))||!/(Z|[+-]\d{2}:\d{2})$/i.test(occurredAt))throw new TypeError('occurredAt must be timezone-aware ISO');
  const dueDate=input.dueDate===null||input.dueDate===undefined||input.dueDate===''?null:isoDate(input.dueDate);
  const dueTime=input.dueTime===null||input.dueTime===undefined||input.dueTime===''?null:isoTime(input.dueTime);
  if(dueTime&&!dueDate)throw new Error('dueTime requires dueDate');
  const zone=timezone(input.timezone);
  if(dueDate&&dueTime&&!zone)throw new Error('A timed task requires an IANA timezone');
  const priority=input.priority===undefined?'normal':text(input.priority,'priority',16);
  if(!PRIORITIES.has(priority))throw new Error('Task priority is not supported');
  const sourceId=input.sourceId===null||input.sourceId===undefined||input.sourceId===''?null:text(input.sourceId,'sourceId',220);
  const existing=state.entities.find(entity=>entity.id===id);
  if(existing&&(existing.type!=='task'||existing.attributes?.taskKind!=='user'||existing.attributes?.taskId!==taskId))throw new Error('Canonical task ID collision');
  const operations=[];
  if(!existing){
   operations.push({operation:'entity.create',target:id,data:{name:title,type:'task'}});
   const set=(name,value)=>operations.push({operation:'attribute.set',target:id,data:{name,value,forceHistory:true}});
   set('taskKind','user');set('taskId',taskId);set('status','open');set('priority',priority);
   if(dueDate)set('dueDate',dueDate);
   if(dueTime)set('dueTime',dueTime);
   if(zone)set('timezone',zone);
   if(sourceId)set('sourceId',sourceId);
   set('createdAt',occurredAt);set('updatedAt',occurredAt);
  }else if(existing.name!==title)throw new Error('An existing task ID cannot be reused with a different title');
  const idempotencyKey=text(input.idempotencyKey,'idempotencyKey',300);
  return command('task.create',idempotencyKey,taskId,
   {domain:'task',taskKind:'user',taskId,entityId:id,title,dueDate,dueTime,timezone:zone,priority,sourceId,occurredAt},
   operations.length?operations:[{operation:'attribute.set',target:id,data:{name:'lastCreateIntent',value:idempotencyKey,forceHistory:true}}]);
 }
 function transitionTaskCommand(input,state){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Task transition input invalid');
  const task=findTask(state,input.taskId,{userOnly:true}),id=task.id,a=task.attributes||{};
  const next=text(input.status,'status',24),previous=a.status||'open';
  if(!STATUSES.has(next))throw new Error('Task status is not supported');
  const allowed={open:['in_progress','completed','cancelled'],in_progress:['open','completed','cancelled'],completed:['open'],cancelled:['open']};
  if(!(allowed[previous]||[]).includes(next))throw new Error('Invalid task transition: '+previous+' → '+next);
  const occurredAt=input.occurredAt||new Date().toISOString();
  if(typeof occurredAt!=='string'||!Number.isFinite(Date.parse(occurredAt))||!/(Z|[+-]\d{2}:\d{2})$/i.test(occurredAt))throw new TypeError('occurredAt must be timezone-aware ISO');
  if(next==='completed'){
   const blocked=(state.relations||[]).filter(relation=>relation.type==='depends_on'&&relation.sourceId===id&&!relation.endedAt)
    .map(relation=>state.entities.find(entity=>entity.id===relation.targetId))
    .filter(dependency=>!dependency||dependency.attributes?.status!=='completed');
   if(blocked.length)throw new Error('Task-ul este blocat de '+blocked.map(item=>item?.name||'o dependență lipsă').join(', ')+'.');
  }
  const operations=[{operation:'attribute.set',target:id,data:{name:'status',value:next,forceHistory:true}},
   {operation:'attribute.set',target:id,data:{name:'updatedAt',value:occurredAt,forceHistory:true}}];
  if(next==='completed')operations.push({operation:'attribute.set',target:id,data:{name:'completedAt',value:occurredAt,forceHistory:true}});
  if(next==='cancelled')operations.push({operation:'attribute.set',target:id,data:{name:'cancelledAt',value:occurredAt,forceHistory:true}});
  if(next==='open'&&['completed','cancelled'].includes(previous))operations.push({operation:'attribute.set',target:id,data:{name:'reopenedAt',value:occurredAt,forceHistory:true}});
  return command('task.transition',input.idempotencyKey,a.taskId,
   {domain:'task',taskKind:'user',taskId:a.taskId,entityId:id,previousStatus:previous,status:next,occurredAt},operations);
 }
 function reachesDependency(state,startId,targetId){
  const relations=Array.isArray(state.relations)?state.relations:[];
  const pending=[startId],visited=new Set();
  while(pending.length){
   const current=pending.pop();if(current===targetId)return true;
   if(visited.has(current))continue;visited.add(current);
   for(const relation of relations)if(relation.type==='depends_on'&&relation.sourceId===current&&!relation.endedAt)pending.push(relation.targetId);
  }
  return false;
 }
 function addDependencyCommand(input,state){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Task dependency input invalid');
  const task=findTask(state,input.taskId,{userOnly:true}),dependency=findTask(state,input.dependsOnTaskId,{userOnly:true});
  if(task.id===dependency.id)throw new Error('Un task nu poate depinde de el însuși.');
  const existing=(state.relations||[]).find(relation=>relation.type==='depends_on'&&relation.sourceId===task.id&&relation.targetId===dependency.id&&!relation.endedAt);
  if(existing)throw new Error('Dependența există deja.');
  if(reachesDependency(state,dependency.id,task.id))throw new Error('Dependența ar crea un ciclu în graful de task-uri.');
  const occurredAt=input.occurredAt||new Date().toISOString();
  if(typeof occurredAt!=='string'||!Number.isFinite(Date.parse(occurredAt))||!/(Z|[+-]\d{2}:\d{2})$/i.test(occurredAt))throw new TypeError('occurredAt must be timezone-aware ISO');
  return command('task.dependency.add',input.idempotencyKey,task.attributes.taskId,
   {domain:'task',taskKind:'user',taskId:task.attributes.taskId,entityId:task.id,dependsOnTaskId:dependency.id,dependencyName:dependency.name,occurredAt},
   [{operation:'relation.create',target:null,data:{sourceId:task.id,targetId:dependency.id,type:'depends_on',attributes:{relationship:'task_dependency'}}}]);
 }
 const api={PRIORITIES:[...PRIORITIES],STATUSES:[...STATUSES],entityIdForTask,createTaskCommand,editTaskCommand,transitionTaskCommand,addDependencyCommand};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.CollectorTaskCommand=api;
})(typeof window!=='undefined'?window:globalThis);
