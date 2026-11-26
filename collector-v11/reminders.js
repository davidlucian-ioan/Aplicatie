(function(root){
 'use strict';
 const KEY='collector_reminders_v1';
 const ALLOWED_STATUSES=new Set(['suggested','confirmed','scheduled','completed','cancelled']);
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
 function createService({storage,plugin,now=()=>new Date(),random=Math.random,onCoreEvent=null}={}){
  if(!storage||typeof storage.readRaw!=='function'||typeof storage.writeRaw!=='function')throw new TypeError('Stocarea pentru alarme nu este disponibilă.');
  if(!plugin||typeof plugin.schedule!=='function'||typeof plugin.cancel!=='function')throw new TypeError('Notificările native nu sunt disponibile pe acest dispozitiv.');
  let mutationQueue=Promise.resolve();
  let coreEventHandler=typeof onCoreEvent==='function'?onCoreEvent:null;
  function serialized(task){const next=mutationQueue.then(task,task);mutationQueue=next.catch(()=>{});return next}
  function validateRows(parsed){
   if(!Array.isArray(parsed))throw new Error('Lista alarmelor este invalidă. Datele nu au fost suprascrise.');
   const ids=new Set(),notificationIds=new Set(),idempotencyKeys=new Set();
   for(const row of parsed){
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim()||row.id.length>180||
      !Number.isInteger(row.notificationId)||row.notificationId<1||row.notificationId>2147483647||
      typeof row.title!=='string'||!row.title.trim()||row.title.length>160||
      typeof row.at!=='string'||!Number.isFinite(Date.parse(row.at)))throw new Error('Lista alarmelor este invalidă. Datele nu au fost suprascrise.');
    const status=row.status||'scheduled';
    if(!ALLOWED_STATUSES.has(status))throw new Error('Lista alarmelor conține o stare necunoscută. Datele nu au fost suprascrise.');
    if(ids.has(row.id)||notificationIds.has(row.notificationId))throw new Error('Lista alarmelor conține identificatori duplicați. Datele nu au fost suprascrise.');
    if(row.idempotencyKey&&idempotencyKeys.has(row.idempotencyKey))throw new Error('Lista alarmelor conține chei idempotente duplicate. Datele nu au fost suprascrise.');
    const outbox=Array.isArray(row.coreOutbox)?row.coreOutbox:[];
    if(outbox.length>500||outbox.some(item=>!item||typeof item!=='object'||typeof item.idempotencyKey!=='string'||!item.idempotencyKey.trim()||typeof item.lifecycle!=='string'||!['scheduled','completed','cancelled','schedule_uncertain'].includes(item.lifecycle)||typeof item.occurredAt!=='string'||!Number.isFinite(Date.parse(item.occurredAt))))throw new Error('Coada de sincronizare Core a unui reminder este invalidă. Datele nu au fost suprascrise.');
    const outboxKeys=new Set();for(const item of outbox){if(outboxKeys.has(item.idempotencyKey))throw new Error('Coada de sincronizare Core conține evenimente duplicate. Datele nu au fost suprascrise.');outboxKeys.add(item.idempotencyKey)}
    ids.add(row.id);notificationIds.add(row.notificationId);if(row.idempotencyKey)idempotencyKeys.add(row.idempotencyKey);
   }
   return parsed.map(row=>({...row,status:row.status||'scheduled',coreOutbox:Array.isArray(row.coreOutbox)?row.coreOutbox:[]}));
  }
  async function list(){
   const raw=await storage.readRaw(KEY);
   if(raw===null||raw===undefined)return [];
   let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error('Lista alarmelor este coruptă. Datele nu au fost suprascrise.')}
   return validateRows(parsed);
  }
  async function persistRows(rows){
   const serialized=JSON.stringify(rows);
   if(await storage.writeRaw(KEY,serialized)!==true)throw new Error('Stocarea alarmelor nu a confirmat scrierea.');
   if(await storage.readRaw(KEY)!==serialized)throw new Error('Verificarea independentă (readback) a stocării alarmelor a eșuat.');
   return true;
  }
  function makeCoreLifecycleEvent(reminder,lifecycle,occurredAt=now().toISOString()){
   return {
    idempotencyKey:'collector-reminder-lifecycle:'+reminder.id+':'+lifecycle+':'+occurredAt,
    reminderId:reminder.id,lifecycle,title:reminder.title,dueAt:reminder.at,
    occurredAt,sourceId:reminder.sourceId||null
   };
  }
  function pendingCoreCount(rows){return rows.reduce((sum,row)=>sum+(Array.isArray(row.coreOutbox)?row.coreOutbox.length:0),0)}
  async function syncCoreOutboxInternal(){
   if(typeof coreEventHandler!=='function'){const rows=await list();return {synced:0,pending:pendingCoreCount(rows),error:null}}
   let synced=0,error=null;
   const initial=await list();
   for(const row of initial){
    for(const item of row.coreOutbox||[]){
     try{
      const result=await coreEventHandler({...item});
      if(!result||!['committed','duplicate'].includes(result.status)||typeof result.eventId!=='string'||!result.eventId)throw new Error('Core nu a confirmat înregistrarea evenimentului reminder.');
      const current=await list(),target=current.find(candidate=>candidate.id===row.id);
      if(!target)throw new Error('Reminderul a dispărut înainte de confirmarea sincronizării Core.');
      const outbox=(target.coreOutbox||[]).filter(candidate=>candidate.idempotencyKey!==item.idempotencyKey);
      const refs=[...(target.coreEventRefs||[]),{idempotencyKey:item.idempotencyKey,eventId:result.eventId,lifecycle:item.lifecycle,occurredAt:item.occurredAt}].slice(-50);
      await persistRows(current.map(candidate=>candidate.id===row.id?{...candidate,coreOutbox:outbox,coreEventRefs:refs,coreSyncError:null}:candidate));
      synced++;
     }catch(failure){
      error=failure;
      try{
       const current=await list();
       await persistRows(current.map(candidate=>candidate.id===row.id?{...candidate,coreSyncError:String(failure?.message||failure).slice(0,300)}:candidate));
      }catch(_){}
      break;
     }
    }
    if(error)break;
   }
   const remaining=await list();
   return {synced,pending:pendingCoreCount(remaining),error:error?String(error.message||error):null};
  }
  async function createInternal({title,at,sourceId=null,context='',idempotencyKey=null}={}){
   const name=String(title||'').trim();
   if(!name||name.length>160)throw new Error('Descrierea alarmei trebuie să aibă între 1 și 160 de caractere.');
   const date=new Date(at);
   if(!Number.isFinite(date.getTime())||date.getTime()<=now().getTime())throw new Error('Alege o dată și o oră din viitor.');
   const key=typeof idempotencyKey==='string'?idempotencyKey.trim().slice(0,200):'';
   const source=typeof sourceId==='string'?sourceId.trim().slice(0,200):'';
   const sourceContext=typeof context==='string'?context.trim().slice(0,500):'';
   const rows=await list();
   if(key){
    const existing=rows.find(row=>row.idempotencyKey===key);
    if(existing){
     if((existing.status||'scheduled')==='scheduled'&&existing.scheduleUncertain===true)throw new Error('Programarea acestei notificări are o stare incertă. Verifică sau anulează reminderul existent înainte de a crea altul.');
     if((existing.status||'scheduled')==='scheduled'){await syncCoreOutboxInternal();const current=(await list()).find(row=>row.id===existing.id)||existing;return {...current,alreadyScheduled:true,coreSyncPending:(current.coreOutbox||[]).length>0}}
     throw new Error('Această intenție de reminder este deja în starea '+existing.status+'; creează o intenție nouă doar după o decizie explicită.');
    }
   }
   const used=new Set(rows.map(row=>row.notificationId));
   let notificationId=0;
   for(let attempt=0;attempt<20&&!notificationId;attempt++){const candidate=Math.floor(random()*2147483646)+1;if(!used.has(candidate))notificationId=candidate}
   if(!notificationId)throw new Error('Nu am putut genera un identificator unic pentru alarmă.');
   const createdAt=now().toISOString(),reminderId='reminder-'+Date.now().toString(36)+'-'+notificationId.toString(36);
   const reminder={id:reminderId,notificationId,title:name,at:date.toISOString(),createdAt,status:'scheduled',sourceId:source||null,sourceContext:sourceContext||null,idempotencyKey:key||null,coreOutbox:coreEventHandler?[makeCoreLifecycleEvent({id:reminderId,title:name,at:date.toISOString(),sourceId:source||null},'scheduled',createdAt)]:[]};
   const next=[...rows,reminder];
   // Persist and read back before scheduling a native side effect.
   await persistRows(next);
   let scheduleAttempted=false;
   try{
    if(typeof plugin.checkPermissions==='function'){
     let permission=await plugin.checkPermissions();
     if(permission?.display!=='granted'&&typeof plugin.requestPermissions==='function')permission=await plugin.requestPermissions();
     if(permission?.display!=='granted')throw new Error('Permisiunea pentru notificări nu a fost acordată.');
    }
    scheduleAttempted=true;
    await plugin.schedule({notifications:[{id:notificationId,title:'Collector',body:name,schedule:{at:date},extra:{reminderId:reminder.id,sourceId:reminder.sourceId,idempotencyKey:reminder.idempotencyKey},isExactNotification:false}]});
    await syncCoreOutboxInternal();
    const persisted=(await list()).find(row=>row.id===reminder.id)||reminder;
    return {...persisted,coreSyncPending:(persisted.coreOutbox||[]).length>0};
   }catch(error){
    let cancelError=null;
    if(scheduleAttempted){
     try{await plugin.cancel({notifications:[{id:notificationId}]})}
     catch(failure){cancelError=failure}
    }
    // If compensation cannot be confirmed, retain the metadata row so a possibly
    // scheduled native notification is still represented and can be managed.
    if(cancelError){
     const uncertain={...reminder,scheduleUncertain:true,coreOutbox:coreEventHandler?[makeCoreLifecycleEvent(reminder,'schedule_uncertain',now().toISOString())]:[]};
     try{await persistRows(next.map(row=>row.id===reminder.id?uncertain:row))}
     catch(readbackError){throw new Error('Starea notificării este incertă; reminderul inițial a fost păstrat, dar indicatorul de recovery nu a putut fi confirmat: '+error.message+'; '+cancelError.message+'; '+readbackError.message)}
     throw new Error('Starea notificării este incertă după eșecul programării. Am păstrat reminderul și l-am marcat pentru recovery; verifică-l înainte de a crea altul: '+error.message+'; '+cancelError.message);
    }
    try{await persistRows(rows)}catch(rollbackError){throw new Error('Alarma nu a putut fi programată, iar rollback-ul listei locale nu a putut fi verificat: '+error.message+'; '+rollbackError.message)}
    throw error;
   }
  }
  function create(input){return serialized(()=>createInternal(input))}
  async function snoozeInternal(id,minutes){
   if(![5,10,30,60].includes(minutes))throw new Error('Durata amânării nu este acceptată.');
   const rows=await list(),target=rows.find(row=>row.id===id);
   if(!target||target.status==='cancelled'||target.status==='completed')throw new Error('Alarma nu mai există.');
   const replacement=await createInternal({title:target.title,at:new Date(now().getTime()+minutes*60_000).toISOString(),sourceId:target.sourceId,context:target.sourceContext,idempotencyKey:'snooze:'+target.id+':'+minutes+':'+now().getTime()});
   try{
    const cancelled=await updateStatusInternal(id,'cancelled');
    if(!cancelled)throw new Error('Alarma originală nu a mai putut fi anulată.');
    return replacement;
   }catch(error){
    try{await updateStatusInternal(replacement.id,'cancelled')}catch(rollbackError){throw new Error('Amânarea a eșuat, iar alarma nouă nu a putut fi anulată: '+error.message+'; '+rollbackError.message)}
    throw error;
   }
  }
  function snooze(id,minutes){return serialized(()=>snoozeInternal(id,minutes))}
  async function updateStatusInternal(id,status){
   if(!['completed','cancelled'].includes(status))throw new Error('Starea reminderului nu este permisă.');
   const rows=await list(),target=rows.find(row=>row.id===id);
   if(!target)return false;
   if(target.status==='completed'||target.status==='cancelled')return false;
   await plugin.cancel({notifications:[{id:target.notificationId}]});
   const occurredAt=now().toISOString();
   const lifecycleEvent=coreEventHandler?makeCoreLifecycleEvent(target,status,occurredAt):null;
   const updated={...target,status,scheduleUncertain:false,[status==='completed'?'completedAt':'cancelledAt']:occurredAt,coreOutbox:lifecycleEvent?[...(target.coreOutbox||[]),lifecycleEvent]:[...(target.coreOutbox||[])]};
   try{await persistRows(rows.map(row=>row.id===id?updated:row))}
   catch(error){
    let restoreError=null;
    try{await persistRows(rows)}catch(failure){restoreError=failure}
    try{await plugin.schedule({notifications:[{id:target.notificationId,title:'Collector',body:target.title,schedule:{at:new Date(target.at)},extra:{reminderId:target.id,sourceId:target.sourceId,idempotencyKey:target.idempotencyKey},isExactNotification:false}]})}
    catch(rollbackError){
     throw new Error('Notificarea a fost anulată, iar restaurarea stocării/notificării a eșuat: '+error.message+'; '+(restoreError?.message||'')+'; '+rollbackError.message);
    }
    if(restoreError)throw new Error('Notificarea a fost reprogramată, dar restaurarea metadatelor nu a putut fi verificată: '+error.message+'; '+restoreError.message);
    throw new Error('Schimbarea stării a fost rollback-uită: notificarea și metadatele au fost restaurate după verificare: '+error.message);
   }
   await syncCoreOutboxInternal();
   const current=(await list()).find(row=>row.id===id)||updated;
   return {...current,coreSyncPending:(current.coreOutbox||[]).length>0};
  }
  function updateStatus(id,status){return serialized(()=>updateStatusInternal(id,status))}
  async function cancel(id){return Boolean(await updateStatus(id,'cancelled'))}
  async function complete(id){return await updateStatus(id,'completed')}
  async function clearAllInternal(){
   await syncCoreOutboxInternal();
   const rows=await list();
   if(pendingCoreCount(rows)>0)throw new Error('Există evenimente reminder nesincronizate cu jurnalul Core. Reîncearcă sincronizarea înainte de a șterge istoricul.');
   if(!rows.length){
    if(typeof storage.removeRaw==='function'){
     if(await storage.removeRaw(KEY)!==true||((await storage.readRaw(KEY))!==null&&(await storage.readRaw(KEY))!==undefined))throw new Error('Stocarea alarmelor nu a confirmat eliminarea listei goale.');
    }
    return 0;
   }
   const notifications=rows.filter(row=>row.status!=='cancelled'&&row.status!=='completed').map(row=>({id:row.notificationId,title:'Collector',body:row.title,schedule:{at:new Date(row.at)},extra:{reminderId:row.id,sourceId:row.sourceId,idempotencyKey:row.idempotencyKey},isExactNotification:false}));
   if(notifications.length)await plugin.cancel({notifications});
   try{
    if(typeof storage.removeRaw!=='function')throw new Error('Stocarea nu poate elimina metadatele alarmelor.');
    if(await storage.removeRaw(KEY)!==true)throw new Error('Stocarea nu a confirmat eliminarea alarmelor.');
    const remaining=await storage.readRaw(KEY);
    if(remaining!==null&&remaining!==undefined)throw new Error('Lista alarmelor este încă prezentă după ștergere.');
   }catch(error){
    let restoreError=null;
    try{await persistRows(rows)}catch(failure){restoreError=failure}
    try{if(notifications.length)await plugin.schedule({notifications})}
    catch(rollbackError){throw new Error('Alarmele au fost anulate, dar restaurarea metadatelor/notificărilor a eșuat: '+error.message+'; '+(restoreError?.message||'')+'; '+rollbackError.message)}
    if(restoreError)throw new Error('Ștergerea alarmelor a fost rollback-uită parțial; notificările au fost reprogramate, dar metadatele nu au putut fi verificate: '+error.message+'; '+restoreError.message);
    throw new Error('Ștergerea alarmelor a fost rollback-uită; notificările au fost reprogramate: '+error.message);
   }
   return rows.length;
  }
  function clearAll(){return serialized(clearAllInternal)}
  function setCoreEventHandler(handler){if(typeof handler!=='function')throw new TypeError('Core event handler invalid.');coreEventHandler=handler;return true}
  function syncCoreOutbox(){return serialized(syncCoreOutboxInternal)}
  return Object.freeze({list,create,cancel,snooze,complete,clearAll,setCoreEventHandler,syncCoreOutbox});
 }
 let service=null,initialized=false,coreEventHandler=null;
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
   const all=await service.list(),pendingCount=pendingCoreCount(all),rows=all.filter(row=>(row.status||'scheduled')==='scheduled'&&new Date(row.at).getTime()>Date.now()).sort((a,b)=>a.at.localeCompare(b.at));
   const completed=all.filter(row=>row.status==='completed').sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||'')).slice(0,5);
   const activeHtml=rows.map(row=>'<div class="row reminder-row"><div><b>'+esc(row.title)+'</b><div class="muted">'+esc(new Date(row.at).toLocaleString('ro-RO'))+'</div>'+(row.scheduleUncertain?'<div class="note">Starea notificării este incertă. Verifică notificările acestui telefon înainte de a crea un duplicat.</div>':'')+(row.sourceContext?'<div class="muted">Sursă Work: '+esc(row.sourceContext.slice(0,140))+'</div>':'')+'</div><div class="row-actions"><button class="secondary" type="button" data-reminder-complete="'+esc(row.id)+'">✓ Gata</button><button class="secondary" type="button" data-reminder-snooze="'+esc(row.id)+'" data-minutes="10">+10 min</button><button class="secondary" type="button" data-reminder-snooze="'+esc(row.id)+'" data-minutes="60">+1 h</button><button class="secondary" type="button" data-reminder-cancel="'+esc(row.id)+'">Anulează</button></div></div>').join();
   const historyHtml=completed.length?'<h3>Finalizate recent</h3>'+completed.map(row=>'<div class="row reminder-row"><div><b>'+esc(row.title)+'</b><div class="muted">Finalizat · '+esc(new Date(row.completedAt||row.at).toLocaleString('ro-RO'))+'</div>'+(row.sourceContext?'<div class="muted">Sursă Work: '+esc(row.sourceContext.slice(0,140))+'</div>':'')+'</div></div>').join():'';
   const syncHtml=pendingCount?'<div class="note" role="status"><b>Istoric Core în așteptare</b><p>'+pendingCount+' schimbare/schimbări de reminder nu au fost încă înregistrate în memoria permanentă. Datele locale sunt păstrate.</p><button class="secondary" type="button" data-reminder-core-sync>Reîncearcă sincronizarea</button></div>':'';
   listElement.innerHTML=syncHtml+(activeHtml||'<p class="muted">Nu ai alarme programate.</p>')+historyHtml;
  }catch(error){listElement.textContent='Nu pot încărca alarmele: '+error.message}
 }
 async function initialize({onCoreEvent:handler}={}){
  if(typeof handler==='function'){
   coreEventHandler=handler;
   if(service)service.setCoreEventHandler(handler);
  }
  if(initialized){if(service){await service.syncCoreOutbox();await render()}return;}
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
  try{service=createService({storage,plugin,onCoreEvent:coreEventHandler})}
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
    const created=await service.list();
    if(status)status.textContent='Alarma a fost programată pe acest telefon.';
    await render();
   }catch(error){if(status)status.textContent='Nu am putut programa alarma: '+error.message}
   finally{if(submit)submit.disabled=false}
  });
  listElement?.addEventListener('click',async event=>{
   const sync=event.target.closest('[data-reminder-core-sync]');
   if(sync){sync.disabled=true;try{const result=await service.syncCoreOutbox();if(status)status.textContent=result.pending?'Sincronizare incompletă: '+result.pending+' eveniment(e) încă în așteptare.':'Istoricul reminderelor este sincronizat cu memoria Core.';await render()}catch(error){if(status)status.textContent='Sincronizarea Core a eșuat: '+error.message}finally{sync.disabled=false}return}
   const complete=event.target.closest('[data-reminder-complete]');if(complete){complete.disabled=true;try{await service.complete(complete.dataset.reminderComplete);if(status)status.textContent='Reminder marcat ca finalizat.';await render()}catch(error){complete.disabled=false;if(status)status.textContent='Nu am putut finaliza reminderul: '+error.message}return}
   const snooze=event.target.closest('[data-reminder-snooze]');if(snooze){snooze.disabled=true;try{await service.snooze(snooze.dataset.reminderSnooze,Number(snooze.dataset.minutes));if(status)status.textContent='Alarma a fost amânată.';await render()}catch(error){snooze.disabled=false;if(status)status.textContent='Nu am putut amâna alarma: '+error.message}return}
   const button=event.target.closest('[data-reminder-cancel]');if(!button)return;button.disabled=true;
   try{await service.cancel(button.dataset.reminderCancel);if(status)status.textContent='Alarma a fost anulată.';await render()}
   catch(error){button.disabled=false;if(status)status.textContent='Nu am putut anula alarma: '+error.message}
  });
  const syncResult=await service.syncCoreOutbox();
  if(status&&syncResult.pending)status.textContent='Alarmele sunt active; '+syncResult.pending+' eveniment(e) așteaptă sincronizarea cu jurnalul Core.';
  await render();
 }
 async function schedule(input){if(!service)await initialize();if(!service)throw new Error('Serviciul de notificări native nu este disponibil.');return service.create(input)}
 root.CollectorReminders=Object.freeze({createService,initialize,render,schedule,clearAll});
 if(typeof module!=='undefined'&&module.exports)module.exports={createService};
})(typeof window!=='undefined'?window:globalThis);
