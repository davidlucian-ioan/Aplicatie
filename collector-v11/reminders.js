(function(root){
 'use strict';
 const KEY='collector_reminders_v1';
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
 function createService({storage,plugin,now=()=>new Date(),random=Math.random}={}){
  if(!storage||typeof storage.readRaw!=='function'||typeof storage.writeRaw!=='function')throw new TypeError('Stocarea pentru alarme nu este disponibilă.');
  if(!plugin||typeof plugin.schedule!=='function'||typeof plugin.cancel!=='function')throw new TypeError('Notificările native nu sunt disponibile pe acest dispozitiv.');
  async function list(){
   const raw=await storage.readRaw(KEY);
   if(raw===null)return [];
   const parsed=JSON.parse(raw);
   if(!Array.isArray(parsed)||parsed.some(row=>!row||typeof row.id!=='string'||!Number.isInteger(row.notificationId)||typeof row.title!=='string'||typeof row.at!=='string'))throw new Error('Lista alarmelor este invalidă. Datele nu au fost suprascrise.');
   return parsed;
  }
  async function create({title,at,sourceId=null,context='',idempotencyKey=null}={}){
   const name=String(title||'').trim();
   if(!name||name.length>160)throw new Error('Descrierea alarmei trebuie să aibă între 1 și 160 de caractere.');
   const date=new Date(at);
   if(!Number.isFinite(date.getTime())||date.getTime()<=now().getTime())throw new Error('Alege o dată și o oră din viitor.');
   const key=typeof idempotencyKey==='string'?idempotencyKey.trim().slice(0,200):'';
   const source=typeof sourceId==='string'?sourceId.trim().slice(0,200):'';
   const sourceContext=typeof context==='string'?context.trim().slice(0,500):'';
   const rows=await list();
   if(key){const existing=rows.find(row=>row.idempotencyKey===key);if(existing)return {...existing,alreadyScheduled:true}}
   const used=new Set(rows.map(row=>row.notificationId));
   let notificationId=0;
   for(let attempt=0;attempt<20&&!notificationId;attempt++){const candidate=Math.floor(random()*2147483646)+1;if(!used.has(candidate))notificationId=candidate}
   if(!notificationId)throw new Error('Nu am putut genera un identificator unic pentru alarmă.');
   const reminder={id:'reminder-'+Date.now().toString(36)+'-'+notificationId.toString(36),notificationId,title:name,at:date.toISOString(),createdAt:now().toISOString(),status:'scheduled',sourceId:source||null,sourceContext:sourceContext||null,idempotencyKey:key||null};
   const next=[...rows,reminder];
   await storage.writeRaw(KEY,JSON.stringify(next));
   try{
    if(typeof plugin.checkPermissions==='function'){
     let permission=await plugin.checkPermissions();
     if(permission?.display!=='granted'&&typeof plugin.requestPermissions==='function')permission=await plugin.requestPermissions();
     if(permission?.display!=='granted')throw new Error('Permisiunea pentru notificări nu a fost acordată.');
    }
    await plugin.schedule({notifications:[{id:notificationId,title:'Collector',body:name,schedule:{at:date},extra:{reminderId:reminder.id,sourceId:reminder.sourceId,idempotencyKey:reminder.idempotencyKey},isExactNotification:false}]});
    return reminder;
   }catch(error){
    try{await storage.writeRaw(KEY,JSON.stringify(rows))}catch(rollbackError){throw new Error('Alarma nu a putut fi programată, iar lista locală necesită verificare: '+error.message+'; '+rollbackError.message)}
    throw error;
   }
  }
  async function snooze(id,minutes){
   if(![5,10,30,60].includes(minutes))throw new Error('Durata amânării nu este acceptată.');
   const rows=await list(),target=rows.find(row=>row.id===id);
   if(!target||target.status==='cancelled'||target.status==='completed')throw new Error('Alarma nu mai există.');
   const replacement=await create({title:target.title,at:new Date(now().getTime()+minutes*60_000).toISOString(),sourceId:target.sourceId,context:target.sourceContext,idempotencyKey:'snooze:'+target.id+':'+minutes+':'+now().getTime()});
   try{await cancel(id);return replacement}catch(error){try{await cancel(replacement.id)}catch(rollbackError){throw new Error('Amânarea a eșuat, iar alarma nouă nu a putut fi anulată: '+error.message+'; '+rollbackError.message)}throw error}
  }
  async function updateStatus(id,status){
   const rows=await list(),target=rows.find(row=>row.id===id);
   if(!target)return false;
   if(target.status==='completed'||target.status==='cancelled')return false;
   await plugin.cancel({notifications:[{id:target.notificationId}]});
   const updated={...target,status,[status==='completed'?'completedAt':'cancelledAt']:now().toISOString()};
   try{await storage.writeRaw(KEY,JSON.stringify(rows.map(row=>row.id===id?updated:row)))}
   catch(error){
    try{await plugin.schedule({notifications:[{id:target.notificationId,title:'Collector',body:target.title,schedule:{at:new Date(target.at)},extra:{reminderId:target.id,sourceId:target.sourceId,idempotencyKey:target.idempotencyKey},isExactNotification:false}]})}
    catch(rollbackError){throw new Error('Notificarea a fost anulată, dar starea locală nu a putut fi actualizată și notificarea nu a putut fi restaurată: '+error.message+'; '+rollbackError.message)}
    throw new Error('Schimbarea stării a fost rollback-uită: notificarea a fost reprogramată, dar stocarea nu a putut fi actualizată: '+error.message);
   }
   return updated;
  }
  async function cancel(id){return Boolean(await updateStatus(id,'cancelled'))}
  async function complete(id){return await updateStatus(id,'completed')}
  async function clearAll(){
   const rows=await list();
   if(!rows.length){if(typeof storage.removeRaw==='function')await storage.removeRaw(KEY);return 0}
   const notifications=rows.filter(row=>row.status!=='cancelled'&&row.status!=='completed').map(row=>({id:row.notificationId,title:'Collector',body:row.title,schedule:{at:new Date(row.at)},extra:{reminderId:row.id,sourceId:row.sourceId,idempotencyKey:row.idempotencyKey},isExactNotification:false}));
   await plugin.cancel({notifications});
   try{
    if(typeof storage.removeRaw!=='function')throw new Error('Stocarea nu poate elimina metadatele alarmelor.');
    await storage.removeRaw(KEY);
   }catch(error){
    try{await plugin.schedule({notifications})}
    catch(rollbackError){throw new Error('Alarmele au fost anulate, dar metadatele nu au putut fi șterse și notificările nu au putut fi restaurate: '+error.message+'; '+rollbackError.message)}
    throw new Error('Ștergerea alarmelor a fost rollback-uită; notificările au fost reprogramate: '+error.message);
   }
   return rows.length;
  }
  return Object.freeze({list,create,cancel,snooze,complete,clearAll});
 }
 let service=null,initialized=false;
 async function clearAll(){
  if(service)return service.clearAll();
  const storage=root.CollectorStorage;
  if(!storage||typeof storage.readRaw!=='function')return 0;
  const raw=await storage.readRaw(KEY);
  if(raw===null){if(typeof storage.removeRaw==='function')await storage.removeRaw(KEY);return 0}
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.id!=='string'||!Number.isInteger(row.notificationId)||typeof row.title!=='string'||typeof row.at!=='string'))throw new Error('Lista alarmelor este invalidă. Datele nu au fost șterse.');
  const native=typeof root.Capacitor?.isNativePlatform==='function'&&root.Capacitor.isNativePlatform();
  if(native&&rows.length)throw new Error('Serviciul de notificări nu este disponibil; alarmele nu au fost șterse ca să nu rămână notificări active.');
  await storage.removeRaw(KEY);return rows.length;
 }
 async function render(){
  const listElement=root.document?.getElementById('reminderList');
  if(!listElement||!service)return;
  try{
   const all=await service.list(),rows=all.filter(row=>(row.status||'scheduled')==='scheduled'&&new Date(row.at).getTime()>Date.now()).sort((a,b)=>a.at.localeCompare(b.at));
   const completed=all.filter(row=>row.status==='completed').sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||'')).slice(0,5);
   const activeHtml=rows.map(row=>'<div class="row reminder-row"><div><b>'+esc(row.title)+'</b><div class="muted">'+esc(new Date(row.at).toLocaleString('ro-RO'))+'</div>'+(row.sourceContext?'<div class="muted">Sursă Work: '+esc(row.sourceContext.slice(0,140))+'</div>':'')+'</div><div class="row-actions"><button class="secondary" type="button" data-reminder-complete="'+esc(row.id)+'">✓ Gata</button><button class="secondary" type="button" data-reminder-snooze="'+esc(row.id)+'" data-minutes="10">+10 min</button><button class="secondary" type="button" data-reminder-snooze="'+esc(row.id)+'" data-minutes="60">+1 h</button><button class="secondary" type="button" data-reminder-cancel="'+esc(row.id)+'">Anulează</button></div></div>').join();
   const historyHtml=completed.length?'<h3>Finalizate recent</h3>'+completed.map(row=>'<div class="row reminder-row"><div><b>'+esc(row.title)+'</b><div class="muted">Finalizat · '+esc(new Date(row.completedAt||row.at).toLocaleString('ro-RO'))+'</div>'+(row.sourceContext?'<div class="muted">Sursă Work: '+esc(row.sourceContext.slice(0,140))+'</div>':'')+'</div></div>').join():'';
   listElement.innerHTML=(activeHtml||'<p class="muted">Nu ai alarme programate.</p>')+historyHtml;
  }catch(error){listElement.textContent='Nu pot încărca alarmele: '+error.message}
 }
 async function initialize(){
  if(initialized)return;
  const form=root.document?.getElementById('reminderForm');
  if(!form)return;
  const status=root.document.getElementById('reminderStatus'),listElement=root.document.getElementById('reminderList');
  const capacitor=root.Capacitor,plugin=capacitor?.Plugins?.LocalNotifications;
  const native=typeof capacitor?.isNativePlatform==='function'&&capacitor.isNativePlatform()&&['android','ios'].includes(capacitor.getPlatform?.());
  if(!native||!plugin){
   initialized=true;
   form.querySelectorAll('input,button').forEach(control=>control.disabled=true);
   if(status)status.textContent='Alarmele native vor fi disponibile după instalarea aplicației Collector pe Android sau iPhone.';
   if(listElement)listElement.textContent='Nu există încă alarme pe acest dispozitiv.';
   return;
  }
  const storage=root.CollectorStorage||root.CollectorStorageAdapter?.createWebStorageAdapter();
  try{service=createService({storage,plugin})}
  catch(error){if(status)status.textContent=error.message;return}
  initialized=true;
  const dateInput=root.document.getElementById('reminderAt');
  if(dateInput){const min=new Date(Date.now()+60_000);dateInput.min=new Date(min.getTime()-min.getTimezoneOffset()*60_000).toISOString().slice(0,16)}
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   const title=root.document.getElementById('reminderTitle').value.trim(),at=dateInput?.value;
   const submit=form.querySelector('button[type="submit"]');
   if(submit)submit.disabled=true;
   try{
    await service.create({title,at});
    form.reset();
    if(dateInput){const min=new Date(Date.now()+60_000);dateInput.min=new Date(min.getTime()-min.getTimezoneOffset()*60_000).toISOString().slice(0,16)}
    if(status)status.textContent='Alarma a fost programată pe acest telefon.';
    await render();
   }catch(error){if(status)status.textContent='Nu am putut programa alarma: '+error.message}
   finally{if(submit)submit.disabled=false}
  });
  listElement?.addEventListener('click',async event=>{
   const complete=event.target.closest('[data-reminder-complete]');if(complete){complete.disabled=true;try{await service.complete(complete.dataset.reminderComplete);if(status)status.textContent='Reminder marcat ca finalizat.';await render()}catch(error){complete.disabled=false;if(status)status.textContent='Nu am putut finaliza reminderul: '+error.message}return}
   const snooze=event.target.closest('[data-reminder-snooze]');if(snooze){snooze.disabled=true;try{await service.snooze(snooze.dataset.reminderSnooze,Number(snooze.dataset.minutes));if(status)status.textContent='Alarma a fost amânată.';await render()}catch(error){snooze.disabled=false;if(status)status.textContent='Nu am putut amâna alarma: '+error.message}return}
   const button=event.target.closest('[data-reminder-cancel]');if(!button)return;button.disabled=true;
   try{await service.cancel(button.dataset.reminderCancel);if(status)status.textContent='Alarma a fost anulată.';await render()}
   catch(error){button.disabled=false;if(status)status.textContent='Nu am putut anula alarma: '+error.message}
  });
  await render();
 }
 root.CollectorReminders=Object.freeze({createService,initialize,render,clearAll});
 if(typeof module!=='undefined'&&module.exports)module.exports={createService};
})(typeof window!=='undefined'?window:globalThis);
