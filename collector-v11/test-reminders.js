'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('./reminders');
function fixture({permission='granted',scheduleError=null,cancelError=null,failStorageWriteAt=0,failStorageRemove=false,cancelErrorCount=Infinity,onCoreEvent=null,onSchedule=null,random=Math.random}={}){
 let raw=null,writeCount=0,cancelFailuresRemaining=cancelError?cancelErrorCount:0;const calls=[],coreCalls=[];
 const storage={async readRaw(key){assert.equal(key,'collector_reminders_v1');return raw},async writeRaw(key,value){assert.equal(key,'collector_reminders_v1');writeCount++;if(writeCount===failStorageWriteAt)throw new Error('storage write failed');raw=value;return true},async removeRaw(key){assert.equal(key,'collector_reminders_v1');if(failStorageRemove)throw new Error('storage remove failed');raw=null;return true}};
 const plugin={
  async checkPermissions(){return {display:permission}},
  async requestPermissions(){return {display:permission}},
  async schedule(value){calls.push({type:'schedule',value});if(onSchedule)await onSchedule(value,raw);if(scheduleError)throw new Error(scheduleError)},
  async cancel(value){calls.push({type:'cancel',value});if(cancelError&&cancelFailuresRemaining>0){cancelFailuresRemaining--;throw new Error(cancelError)}}
 };
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:00:00.000Z'),random,onCoreEvent:async event=>{
  coreCalls.push({...event});
  if(onCoreEvent)return onCoreEvent(event);
  return {status:'committed',eventId:'core-event-'+coreCalls.length};
 }});
 return {service,calls,coreCalls,raw:()=>raw};
}
test('concurrent reminder creation with same idempotency key schedules only once',async()=>{
 const x=fixture({random:()=>0.4});
 const input={title:'Cumpără materiale',at:'2026-11-24T12:00:00.000Z',sourceId:'work:turn-1',context:'Proiect',idempotencyKey:'ai-reminder:turn-1:0'};
 const [first,second]=await Promise.all([x.service.create(input),x.service.create(input)]);
 assert.equal(first.id,second.id);assert.equal(second.alreadyScheduled,true);
 assert.equal(JSON.parse(x.raw()).length,1);assert.equal(x.calls.filter(call=>call.type==='schedule').length,1);
});
test('alarma se persistă și se programează prin notificare locală',async()=>{
 const x=fixture({random:()=>0.25});
 const item=await x.service.create({title:'Verifică B3',at:'2026-11-24T12:00:00.000Z'});
 assert.equal(item.title,'Verifică B3');assert.equal(JSON.parse(x.raw()).length,1);assert.equal(JSON.parse(x.raw())[0].scheduleState,'scheduled');
 assert.equal(x.calls[0].type,'schedule');assert.equal(x.calls[0].value.notifications[0].body,'Verifică B3');
 assert.equal(x.calls[0].value.notifications[0].isExactNotification,false);
});
test('alarma nu se salvează dacă permisiunea este refuzată',async()=>{
 const x=fixture({permission:'denied'});
 await assert.rejects(x.service.create({title:'Alarmă',at:'2026-11-24T12:00:00.000Z'}),/Permisiunea/);
 assert.equal(x.raw(),'[]');
});
test('alarma din trecut sau cu titlu invalid este respinsă',async()=>{
 const x=fixture();
 await assert.rejects(x.service.create({title:'Alarmă',at:'2026-11-24T09:00:00.000Z'}),/viitor/);
 await assert.rejects(x.service.create({title:' ',at:'2026-11-24T12:00:00.000Z'}),/160 de caractere/);
 assert.equal(x.raw(),null);
});
test('eroarea notificării face rollback la lista locală',async()=>{
 const x=fixture({scheduleError:'plugin offline'});
 await assert.rejects(x.service.create({title:'Alarmă',at:'2026-11-24T12:00:00.000Z'}),/plugin offline/);
 assert.equal(x.raw(),'[]');
});
test('anularea notificării elimină alarma doar după confirmarea pluginului',async()=>{
 const x=fixture();const item=await x.service.create({title:'Verifică sera',at:'2026-11-24T12:00:00.000Z'});
 assert.equal(await x.service.cancel(item.id),true);const rows=JSON.parse(x.raw());assert.equal(rows.length,1);assert.equal(rows[0].status,'cancelled');
 assert.equal(x.calls.at(-1).type,'cancel');assert.equal(x.calls.at(-1).value.notifications[0].id,item.notificationId);
});

test('cancel failure keeps reminder persisted',async()=>{
 const x=fixture({cancelError:'notification plugin offline'});const item=await x.service.create({title:'Reminder',at:'2026-11-24T12:00:00.000Z'});
 await assert.rejects(x.service.cancel(item.id),/notification plugin offline/);assert.equal(JSON.parse(x.raw()).length,1);
});

test('snooze replaces the original alarm and schedules a new notification',async()=>{
 const x=fixture({random:(()=>{let n=0;return()=>0.25+n++/100})()});const item=await x.service.create({title:'Verifică sera',at:'2026-11-24T12:00:00.000Z'});const snoozed=await x.service.snooze(item.id,10);assert.notEqual(snoozed.id,item.id);assert.equal(snoozed.title,item.title);assert.equal(new Date(snoozed.at).getTime(),new Date('2026-11-24T10:10:00.000Z').getTime());const rows=JSON.parse(x.raw());assert.equal(rows.length,2);assert.equal(rows.find(row=>row.id===item.id).status,'cancelled');assert.equal(rows.find(row=>row.id===snoozed.id).status,'scheduled');
});

test('snooze rejects unsupported delay and leaves original alarm unchanged',async()=>{
 const x=fixture();const item=await x.service.create({title:'Reminder',at:'2026-11-24T12:00:00.000Z'});await assert.rejects(x.service.snooze(item.id,7),/Durata/);assert.equal(JSON.parse(x.raw())[0].id,item.id);
});

test('cancel rolls back native notification when local metadata write fails',async()=>{
 const x=fixture({failStorageWriteAt:4});
 const item=await x.service.create({title:'Reminder',at:'2026-11-24T12:00:00.000Z'});
 await assert.rejects(x.service.cancel(item.id),/Schimbarea stării a fost rollback-uită/);
 assert.equal(JSON.parse(x.raw()).length,1);
 assert.equal(x.calls.at(-1).type,'schedule');
 assert.equal(x.calls.at(-1).value.notifications[0].id,item.notificationId);
});

test('clearAll cancels every Collector notification before deleting local reminder metadata',async()=>{
 const x=fixture({random:(()=>{let n=0;return()=>0.1+n++/10})()});
 const first=await x.service.create({title:'Alarmă unu',at:'2026-11-24T12:00:00.000Z'});
 const second=await x.service.create({title:'Alarmă doi',at:'2026-11-24T13:00:00.000Z'});
 assert.equal(await x.service.clearAll(),2);assert.equal(x.raw(),null);
 const cancel=x.calls.filter(call=>call.type==='cancel').at(-1);
 assert.deepEqual(cancel.value.notifications.map(item=>item.id),[first.notificationId,second.notificationId]);
});
test('clearAll keeps reminder metadata when the notification plugin refuses cancellation',async()=>{
 const x=fixture({cancelError:'notification service unavailable'});
 const item=await x.service.create({title:'Alarmă păstrată',at:'2026-11-24T12:00:00.000Z'});
 await assert.rejects(x.service.clearAll(),/notification service unavailable/);
 assert.equal(JSON.parse(x.raw())[0].id,item.id);
});
test('clearAll restores notifications when local metadata cannot be removed',async()=>{
 const x=fixture({failStorageRemove:true});
 const item=await x.service.create({title:'Alarmă rollback',at:'2026-11-24T12:00:00.000Z'});
 await assert.rejects(x.service.clearAll(),/rollback-uită/);
 assert.equal(JSON.parse(x.raw())[0].id,item.id);
 const last=x.calls.at(-1);assert.equal(last.type,'schedule');
 assert.equal(last.value.notifications[0].id,item.notificationId);
});

test('AI reminder idempotency stores source context and avoids duplicate native notification',async()=>{
 const x=fixture({random:()=>0.25});
 const payload={title:'Cumpără materialele',at:'2026-11-24T12:00:00.000Z',sourceId:'work-turn-1',context:'Vineri trebuie să cumpăr materialele.',idempotencyKey:'collector-ai-turn-1-0'};
 const first=await x.service.create(payload),second=await x.service.create(payload);
 assert.equal(first.id,second.id);assert.equal(second.alreadyScheduled,true);
 assert.equal(first.sourceId,payload.sourceId);assert.equal(first.sourceContext,payload.context);assert.equal(first.idempotencyKey,payload.idempotencyKey);
 assert.equal(x.calls.filter(call=>call.type==='schedule').length,1);
});

test('complete cancels native alarm and keeps completed lifecycle in local history',async()=>{
 const x=fixture();const item=await x.service.create({title:'Task',at:'2026-11-24T12:00:00.000Z',sourceId:'work-1',context:'Task original'});
 const completed=await x.service.complete(item.id);
 assert.equal(completed.status,'completed');assert.ok(completed.completedAt);
 const stored=JSON.parse(x.raw());assert.equal(stored.length,1);assert.equal(stored[0].sourceContext,'Task original');
 assert.equal(x.calls.at(-1).type,'cancel');
 assert.equal(await x.service.complete(item.id),false,'completed task must be idempotent');
});

test('clearAll safely removes completed-only history without sending empty native cancel batch',async()=>{
 const x=fixture();const item=await x.service.create({title:'Task completat',at:'2026-11-24T12:00:00.000Z'});await x.service.complete(item.id);
 assert.equal(await x.service.clearAll(),1);assert.equal(x.raw(),null);
 assert.equal(x.calls.filter(call=>call.type==='cancel').length,1,'clearAll must not call plugin.cancel with an empty notifications array');
});


test('create refuses to schedule a native notification when storage does not acknowledge the write',async()=>{
 let scheduled=0;
 const storage={async readRaw(){return null},async writeRaw(){return false}};
 const plugin={async schedule(){scheduled++},async cancel(){}};
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:00:00Z')});
 await assert.rejects(service.create({title:'Reminder',at:'2026-11-24T12:00:00Z'}),/nu a confirmat scrierea/);
 assert.equal(scheduled,0);
});

test('create requires independent readback before scheduling',async()=>{
 let scheduled=0;
 const storage={async readRaw(){return null},async writeRaw(){return true}};
 const plugin={async schedule(){scheduled++},async cancel(){}};
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:00:00Z')});
 await assert.rejects(service.create({title:'Reminder',at:'2026-11-24T12:00:00Z'}),/readback/);
 assert.equal(scheduled,0);
});

test('reminder list rejects unknown states and duplicate notification identifiers without overwriting data',async()=>{
 for(const rows of [
  [{id:'a',notificationId:1,title:'A',at:'2026-11-24T12:00:00Z',status:'mystery'}],
  [{id:'a',notificationId:1,title:'A',at:'2026-11-24T12:00:00Z'},{id:'b',notificationId:1,title:'B',at:'2026-11-24T13:00:00Z'}]
 ]){
  const raw=JSON.stringify(rows),storage={async readRaw(){return raw},async writeRaw(){throw new Error('must not overwrite')}};
  const service=createService({storage,plugin:{async schedule(){},async cancel(){}}});
  await assert.rejects(service.list(),/stare necunoscută|identificatori duplicați/);
 }
});

test('same AI idempotency key cannot report a cancelled reminder as still scheduled',async()=>{
 const x=fixture({random:()=>0.25});
 const input={title:'Cumpără substrat',at:'2026-11-24T12:00:00Z',idempotencyKey:'ai-reminder:turn-9'};
 const first=await x.service.create(input);
 assert.equal(await x.service.cancel(first.id),true);
 await assert.rejects(x.service.create(input),/starea cancelled/);
 assert.equal(JSON.parse(x.raw()).length,1);
 assert.equal(JSON.parse(x.raw())[0].status,'cancelled');
 assert.equal(x.calls.filter(call=>call.type==='schedule').length,1);
});

test('concurrent snooze requests for one reminder are serialized and create at most one replacement',async()=>{
 const x=fixture({random:(()=>{let n=0;return()=>0.2+n++/100})()});
 const item=await x.service.create({title:'Verifică pompa',at:'2026-11-24T12:00:00Z'});
 const results=await Promise.allSettled([x.service.snooze(item.id,10),x.service.snooze(item.id,10)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.filter(result=>result.status==='rejected').length,1);
 const rows=JSON.parse(x.raw());
 assert.equal(rows.filter(row=>row.status==='scheduled').length,1);
 assert.equal(rows.filter(row=>row.status==='cancelled').length,1);
 assert.equal(x.calls.filter(call=>call.type==='schedule').length,2);
});

test('clearAll refuses success when storage claims deletion but the list remains',async()=>{
 let raw=null;
 const calls=[];
 const storage={async readRaw(){return raw},async writeRaw(_key,value){raw=value;return true},async removeRaw(){return true}};
 const plugin={async schedule(value){calls.push({type:'schedule',value})},async cancel(value){calls.push({type:'cancel',value})}};
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:00:00Z'),random:()=>0.3});
 await service.create({title:'Alarmă păstrată',at:'2026-11-24T12:00:00Z'});
 const before=raw;
 await assert.rejects(service.clearAll(),/încă prezentă/);
 assert.equal(raw,before);
 assert.equal(calls.at(-1).type,'schedule','rollback must restore the cancelled notification');
});


test('uncertain native scheduling retains a recoverable reminder instead of erasing a possibly active notification',async()=>{
 const x=fixture({scheduleError:'response lost after native schedule',cancelError:'native cancel unavailable'});
 await assert.rejects(x.service.create({title:'Verifică pompa',at:'2026-11-24T12:00:00Z',idempotencyKey:'capture:1'}),/marcat pentru recovery/);
 const rows=JSON.parse(x.raw());
 assert.equal(rows.length,1);
 assert.equal(rows[0].status,'scheduled');
 assert.equal(rows[0].scheduleUncertain,true);
 assert.equal(x.calls.filter(call=>call.type==='schedule').length,1);
 assert.equal(x.calls.filter(call=>call.type==='cancel').length,1);
 await assert.rejects(x.service.create({title:'Verifică pompa',at:'2026-11-24T12:00:00Z',idempotencyKey:'capture:1'}),/stare incertă/);
});

test('successful reminder cancellation clears the uncertain scheduling marker',async()=>{
 const x=fixture({scheduleError:'transient scheduler error',cancelError:'native cancel unavailable',cancelErrorCount:1});
 await assert.rejects(x.service.create({title:'Reminder',at:'2026-11-24T12:00:00Z'}),/marcat pentru recovery/);
 const item=JSON.parse(x.raw())[0];
 assert.equal(item.scheduleUncertain,true);
 await x.service.cancel(item.id);
 const updated=JSON.parse(x.raw())[0];
 assert.equal(updated.status,'cancelled');
 assert.equal(updated.scheduleUncertain,false);
});


test('create journals a source-linked reminder lifecycle event in Core after native scheduling',async()=>{
 const x=fixture({random:()=>0.24});
 const item=await x.service.create({title:'Verifică pompa',at:'2026-11-24T12:00:00Z',sourceId:'audio:capture-7',context:'contextul privat nu se copiază în jurnal',idempotencyKey:'work:turn-7'});
 assert.equal(item.coreSyncPending,false);
 assert.equal(x.coreCalls.length,1);
 assert.equal(x.coreCalls[0].lifecycle,'scheduled');
 assert.equal(x.coreCalls[0].reminderId,item.id);
 assert.equal(x.coreCalls[0].sourceId,'audio:capture-7');
 assert.equal(Object.hasOwn(x.coreCalls[0],'sourceContext'),false,'raw reminder context must not be copied into the Core event');
 assert.equal(JSON.parse(x.raw())[0].coreOutbox.length,0,'outbox is removed only after Core confirms the event');
});

test('failed Core journaling keeps a durable outbox and retry drains it idempotently',async()=>{
 let fail=true;
 const x=fixture({onCoreEvent:async event=>{
  if(fail)throw new Error('Core offline');
  return {status:'committed',eventId:'core-retry-'+event.lifecycle};
 }});
 const created=await x.service.create({title:'Cumpără substrat',at:'2026-11-24T12:00:00Z',sourceId:'work:turn-8'});
 assert.equal(created.coreSyncPending,true);
 let rows=JSON.parse(x.raw());
 assert.equal(rows[0].coreOutbox.length,1);
 assert.equal(rows[0].coreOutbox[0].lifecycle,'scheduled');
 const key=rows[0].coreOutbox[0].idempotencyKey;
 fail=false;
 const result=await x.service.syncCoreOutbox();
 assert.equal(result.synced,1);assert.equal(result.pending,0);assert.equal(result.error,null);
 rows=JSON.parse(x.raw());
 assert.equal(rows[0].coreOutbox.length,0);
 assert.equal(rows[0].coreEventRefs[0].idempotencyKey,key);
 assert.equal(rows[0].coreEventRefs[0].eventId,'core-retry-scheduled');
});

test('schedule, snooze and completion are each appended to Core as distinct lifecycle events',async()=>{
 const x=fixture({random:(()=>{let n=0;return()=>0.2+n++/100})()});
 const first=await x.service.create({title:'Verifică filtrul',at:'2026-11-24T12:00:00Z',sourceId:'work:turn-9'});
 const replacement=await x.service.snooze(first.id,10);
 await x.service.complete(replacement.id);
 assert.deepEqual(x.coreCalls.map(event=>event.lifecycle),['scheduled','scheduled','cancelled','completed']);
 assert.ok(x.coreCalls.every(event=>typeof event.idempotencyKey==='string'&&event.idempotencyKey.startsWith('collector-reminder-lifecycle:')));
 const completed=JSON.parse(x.raw()).find(row=>row.id===replacement.id);
 assert.equal(completed.status,'completed');
 assert.equal(completed.coreOutbox.length,0);
});

test('clearAll refuses to erase reminders while Core lifecycle events remain unsynchronized',async()=>{
 const x=fixture({onCoreEvent:async()=>{throw new Error('Core unavailable')}});
 const item=await x.service.create({title:'Păstrează istoricul',at:'2026-11-24T12:00:00Z'});
 assert.equal(item.coreSyncPending,true);
 await assert.rejects(x.service.clearAll(),/evenimente reminder nesincronizate/);
 assert.equal(JSON.parse(x.raw()).length,1);
 assert.equal(x.calls.filter(call=>call.type==='cancel').length,0);
});

test('uncertain native scheduling writes an uncertainty lifecycle event to the Core outbox',async()=>{
 const x=fixture({scheduleError:'native schedule outcome unknown',cancelError:'native cancel unavailable'});
 await assert.rejects(x.service.create({title:'Verifică sera',at:'2026-11-24T12:00:00Z'}),/este incertă/);
 const row=JSON.parse(x.raw())[0];
 assert.equal(row.scheduleUncertain,true);
 assert.equal(row.scheduleState,'uncertain');
 assert.equal(row.coreOutbox.length,1);
 assert.equal(row.coreOutbox[0].lifecycle,'schedule_uncertain');
 const sync=await x.service.syncCoreOutbox();
 assert.equal(sync.pending,0);
 assert.equal(x.coreCalls[0].lifecycle,'schedule_uncertain');
});


test('native scheduling sees a durable pending intent and Core only receives a confirmed schedule',async()=>{
 let rawAtSchedule=null;
 const x=fixture({onSchedule:async(_value,raw)=>{rawAtSchedule=raw}});
 const item=await x.service.create({title:'Verifică temperatura',at:'2026-11-24T12:00:00Z'});
 const before=JSON.parse(rawAtSchedule)[0];
 assert.equal(before.scheduleState,'pending');
 assert.equal(before.coreOutbox.length,0,'Core must not see a schedule event before native schedule succeeds');
 const after=JSON.parse(x.raw())[0];
 assert.equal(after.scheduleState,'scheduled');
 assert.equal(x.coreCalls.length,1);
 assert.equal(x.coreCalls[0].lifecycle,'scheduled');
 assert.equal(item.coreSyncPending,false);
});

test('startup recovery replays a persisted pending schedule using the same native ID before Core journaling',async()=>{
 const pending={id:'reminder-recovered',notificationId:4242,title:'Verifică filtrul',at:'2026-11-24T12:00:00.000Z',createdAt:'2026-11-24T10:00:00.000Z',status:'scheduled',scheduleState:'pending',sourceId:'work:turn-recovery',idempotencyKey:'recovery-key',coreOutbox:[]};
 let raw=JSON.stringify([pending]);const native=[],core=[];
 const storage={async readRaw(){return raw},async writeRaw(_key,value){raw=value;return true}};
 const plugin={async schedule(value){native.push(value)},async cancel(){throw new Error('not expected')}};
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:01:00.000Z'),onCoreEvent:async event=>{core.push(event);return {status:'committed',eventId:'core-recovered-1'}}});
 const recovered=await service.recoverPendingSchedules();
 assert.deepEqual(recovered,{recovered:1,failed:0,uncertain:0});
 assert.equal(native.length,1);
 assert.equal(native[0].notifications[0].id,4242);
 let rows=JSON.parse(raw);
 assert.equal(rows[0].scheduleState,'scheduled');
 assert.equal(rows[0].coreOutbox[0].lifecycle,'scheduled');
 const synced=await service.syncCoreOutbox();
 assert.equal(synced.pending,0);
 rows=JSON.parse(raw);
 assert.equal(rows[0].coreOutbox.length,0);
 assert.equal(core[0].lifecycle,'scheduled');
});

test('recovery does not publish a false scheduled Core event when native rescheduling remains uncertain',async()=>{
 const pending={id:'reminder-uncertain-recovery',notificationId:5151,title:'Verifică filtrul',at:'2026-11-24T12:00:00.000Z',createdAt:'2026-11-24T10:00:00.000Z',status:'scheduled',scheduleState:'pending',coreOutbox:[]};
 let raw=JSON.stringify([pending]),scheduled=0,cancelled=0,core=[];
 const storage={async readRaw(){return raw},async writeRaw(_key,value){raw=value;return true}};
 const plugin={async schedule(){scheduled++;throw new Error('native result unknown')},async cancel(){cancelled++;throw new Error('cancel result unknown')}};
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:01:00.000Z'),onCoreEvent:async event=>{core.push(event);return {status:'committed',eventId:'core-uncertain'}}});
 const result=await service.recoverPendingSchedules();
 assert.deepEqual(result,{recovered:0,failed:0,uncertain:1});
 const row=JSON.parse(raw)[0];
 assert.equal(row.scheduleState,'uncertain');
 assert.equal(row.scheduleUncertain,true);
 assert.equal(row.coreOutbox[0].lifecycle,'schedule_uncertain');
 await service.syncCoreOutbox();
 assert.deepEqual(core.map(event=>event.lifecycle),['schedule_uncertain']);
 assert.equal(scheduled,1);assert.equal(cancelled,1);
});
