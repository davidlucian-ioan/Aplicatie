'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('./reminders');
function fixture({permission='granted',scheduleError=null,cancelError=null,failStorageWriteAt=0,random=Math.random}={}){
 let raw=null,writeCount=0;const calls=[];
 const storage={async readRaw(key){assert.equal(key,'collector_reminders_v1');return raw},async writeRaw(key,value){assert.equal(key,'collector_reminders_v1');writeCount++;if(writeCount===failStorageWriteAt)throw new Error('storage write failed');raw=value}};
 const plugin={
  async checkPermissions(){return {display:permission}},
  async requestPermissions(){return {display:permission}},
  async schedule(value){calls.push({type:'schedule',value});if(scheduleError)throw new Error(scheduleError)},
  async cancel(value){calls.push({type:'cancel',value});if(cancelError)throw new Error(cancelError)}
 };
 const service=createService({storage,plugin,now:()=>new Date('2026-11-24T10:00:00.000Z'),random});
 return {service,calls,raw:()=>raw};
}
test('alarma se persistă și se programează prin notificare locală',async()=>{
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
 assert.equal(await x.service.cancel(item.id),true);assert.deepEqual(JSON.parse(x.raw()),[]);
 assert.equal(x.calls.at(-1).type,'cancel');assert.equal(x.calls.at(-1).value.notifications[0].id,item.notificationId);
});

test('cancel failure keeps reminder persisted',async()=>{
 const x=fixture({cancelError:'notification plugin offline'});const item=await x.service.create({title:'Reminder',at:'2026-11-24T12:00:00.000Z'});
 await assert.rejects(x.service.cancel(item.id),/notification plugin offline/);assert.equal(JSON.parse(x.raw()).length,1);
});

test('snooze replaces the original alarm and schedules a new notification',async()=>{
 const x=fixture({random:(()=>{let n=0;return()=>0.25+n++/100})()});const item=await x.service.create({title:'Verifică sera',at:'2026-11-24T12:00:00.000Z'});const snoozed=await x.service.snooze(item.id,10);assert.notEqual(snoozed.id,item.id);assert.equal(snoozed.title,item.title);assert.equal(new Date(snoozed.at).getTime(),new Date('2026-11-24T10:10:00.000Z').getTime());assert.equal(JSON.parse(x.raw()).length,1);assert.equal(JSON.parse(x.raw())[0].id,snoozed.id);
});

test('snooze rejects unsupported delay and leaves original alarm unchanged',async()=>{
 const x=fixture();const item=await x.service.create({title:'Reminder',at:'2026-11-24T12:00:00.000Z'});await assert.rejects(x.service.snooze(item.id,7),/Durata/);assert.equal(JSON.parse(x.raw())[0].id,item.id);
});

test('cancel rolls back native notification when local metadata write fails',async()=>{
 const x=fixture({failStorageWriteAt:2});
 const item=await x.service.create({title:'Reminder',at:'2026-11-24T12:00:00.000Z'});
 await assert.rejects(x.service.cancel(item.id),/Anularea a fost rollback-uită/);
 assert.equal(JSON.parse(x.raw()).length,1);
 assert.equal(x.calls.at(-1).type,'schedule');
 assert.equal(x.calls.at(-1).value.notifications[0].id,item.notificationId);
});
