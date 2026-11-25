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
  async function create({title,at}={}){
   const name=String(title||'').trim();
   if(!name||name.length>160)throw new Error('Descrierea alarmei trebuie să aibă între 1 și 160 de caractere.');
   const date=new Date(at);
   if(!Number.isFinite(date.getTime())||date.getTime()<=now().getTime())throw new Error('Alege o dată și o oră din viitor.');
   const rows=await list(),used=new Set(rows.map(row=>row.notificationId));
   let notificationId=0;
   for(let attempt=0;attempt<20&&!notificationId;attempt++){const candidate=Math.floor(random()*2147483646)+1;if(!used.has(candidate))notificationId=candidate}
   if(!notificationId)throw new Error('Nu am putut genera un identificator unic pentru alarmă.');
   const reminder={id:'reminder-'+Date.now().toString(36)+'-'+notificationId.toString(36),notificationId,title:name,at:date.toISOString(),createdAt:now().toISOString()};
   const next=[...rows,reminder];
   await storage.writeRaw(KEY,JSON.stringify(next));
   try{
    if(typeof plugin.checkPermissions==='function'){
     let permission=await plugin.checkPermissions();
     if(permission?.display!=='granted'&&typeof plugin.requestPermissions==='function')permission=await plugin.requestPermissions();
     if(permission?.display!=='granted')throw new Error('Permisiunea pentru notificări nu a fost acordată.');
    }
    await plugin.schedule({notifications:[{id:notificationId,title:'Collector',body:name,schedule:{at:date},extra:{reminderId:reminder.id},isExactNotification:false}]});
    return reminder;
   }catch(error){
    try{await storage.writeRaw(KEY,JSON.stringify(rows))}catch(rollbackError){throw new Error('Alarma nu a putut fi programată, iar lista locală necesită verificare: '+error.message+'; '+rollbackError.message)}
    throw error;
   }
  }
  async function snooze(id,minutes){\n   if(![5,10,30,60].includes(minutes))throw new Error('Durata amânării nu este acceptată.');const rows=await list(),target=rows.find(row=>row.id===id);if(!target)throw new Error('Alarma nu mai există.');const replacement=await create({title:target.title,at:new Date(now().getTime()+minutes*60_000).toISOString()});try{await cancel(id);return replacement}catch(error){try{await cancel(replacement.id)}catch(rollbackError){throw new Error('Amânarea a eșuat, iar alarma nouă nu a putut fi anulată: '+error.message+'; '+rollbackError.message)}throw error}\n  }\n  async function cancel(id){
   const rows=await list(),target=rows.find(row=>row.id===id);
   if(!target)return false;
   await plugin.cancel({notifications:[{id:target.notificationId}]});
   await storage.writeRaw(KEY,JSON.stringify(rows.filter(row=>row.id!==id)));
   return true;
  }
  return Object.freeze({list,create,cancel,snooze});
 }
 let service=null,initialized=false;
 async function render(){
  const listElement=root.document?.getElementById('reminderList');
  if(!listElement||!service)return;
  try{
   const rows=(await service.list()).filter(row=>new Date(row.at).getTime()>Date.now()).sort((a,b)=>a.at.localeCompare(b.at));
   listElement.innerHTML=rows.length?rows.map(row=>'<div class="row reminder-row"><div><b>'+esc(row.title)+'</b><div class="muted">'+esc(new Date(row.at).toLocaleString('ro-RO'))+'</div></div><div class="row-actions"><button class="secondary" type="button" data-reminder-snooze="'+esc(row.id)+'" data-minutes="10">+10 min</button><button class="secondary" type="button" data-reminder-snooze="'+esc(row.id)+'" data-minutes="60">+1 h</button><button class="secondary" type="button" data-reminder-cancel="'+esc(row.id)+'">Anulează</button></div></div>').join():'<p class="muted">Nu ai alarme programate.</p>';
  }catch(error){listElement.textContent='Nu pot încărca alarmele: '+error.message}
 }
 async function initialize(){
  if(initialized)return;
  initialized=true;
  const form=root.document?.getElementById('reminderForm');
  if(!form)return;
  const status=root.document.getElementById('reminderStatus'),listElement=root.document.getElementById('reminderList');
  const capacitor=root.Capacitor,plugin=capacitor?.Plugins?.LocalNotifications;
  const native=typeof capacitor?.isNativePlatform==='function'&&capacitor.isNativePlatform()&&['android','ios'].includes(capacitor.getPlatform?.());
  if(!native||!plugin){
   form.querySelectorAll('input,button').forEach(control=>control.disabled=true);
   if(status)status.textContent='Alarmele native vor fi disponibile după instalarea aplicației Collector pe Android sau iPhone.';
   if(listElement)listElement.textContent='Nu există încă alarme pe acest dispozitiv.';
   return;
  }
  const storage=root.CollectorStorage||root.CollectorStorageAdapter?.createWebStorageAdapter();
  try{service=createService({storage,plugin})}
  catch(error){if(status)status.textContent=error.message;return}
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
   const button=event.target.closest('[data-reminder-cancel]');
   if(!button)return;
   button.disabled=true;
   try{await service.cancel(button.dataset.reminderCancel);if(status)status.textContent='Alarma a fost anulată.';await render()}
   catch(error){button.disabled=false;if(status)status.textContent='Nu am putut anula alarma: '+error.message}
  });
  await render();
 }
 root.CollectorReminders=Object.freeze({createService,initialize,render});
 if(typeof module!=='undefined'&&module.exports)module.exports={createService};
})(typeof window!=='undefined'?window:globalThis);
