'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('./reminders');
function fixture({permission='granted',scheduleError=null,random=Math.random}={}){
 let raw=null;const calls=[];
 const storage={async readRaw(key){assert.equal(key,'collector_reminders_v1');return raw},async writeRaw(key,value){assert.equal(key,'collector_reminders_v1');raw=value}};
 const plugin={
  async checkPermissions(){return {display:permission}},
  async requestPermissions(){return {display:permission}},
  async schedule(value){calls.push({type:'schedule',value});if(scheduleError)throw new Error(scheduleError)},
  async cancel(value){calls.push({type:'cancel',value})}
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
