'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('./reminders');
function fixture({permission='granted',scheduleError=null,cancelError=null,failStorageWriteAt=0,failStorageRemove=false,random=Math.random}={}){
 let raw=null,writeCount=0;const calls=[];
 const storage={async readRaw(key){assert.equal(key,'collector_reminders_v1');return raw},async writeRaw(key,value){assert.equal(key,'collector_reminders_v1');writeCount++;if(writeCount===failStorageWriteAt)throw new Error('storage write failed');raw=value},async removeRaw(key){assert.equal(key,'collector_reminders_v1');if(failStorageRemove)throw new Error('storage remove failed');raw=null}};
 const plugin={
  async checkPermissions(){return {display:permission}},
  async requestPermissions(){return {display:permission}},
  async schedule(value){calls.push({type:'schedule',value});if(scheduleError)throw new Error(scheduleError)},
  async cancel(value){calls.push({type:'cancel',value});if(cancelError)throw new Error(cancelError)}
 };
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:00:00.000Z'),random});
 return {service,calls,raw:()=>raw};
}
test('concurrent reminder creation with same idempotency key schedules only once',async()=>{\n const x=fixture({random:()=>0.4});\n const input={title:'Cumpără materiale',at:'2026-11-24T12:00:00.000Z',sourceId:'work:turn-1',context:'Proiect',idempotencyKey:'ai-reminder:turn-1:0'};\n const [first,second]=await Promise.all([x.service.create(input),x.service.create(input)]);\n assert.equal(first.id,second.id);assert.equal(second.alreadyScheduled,true);\n assert.equal(JSON.parse(x.raw()).length,1);assert.equal(x.calls.filter(call=>call.type==='schedule').length,1);\n});\ntest('alarma se persistă și se programează prin notificare locală',async()=>{
 const x=fixture({random:()=>0.25});
 const item=await x.service.create({title:'Verifică B3',at:'2026-11-24T12:00:00.000Z'});
 assert.equal(item.title,'Verifică B3');assert.equal(JSON.parse(x.raw()).length,1);
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
 const x=fixture({failStorageWriteAt:2});
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
