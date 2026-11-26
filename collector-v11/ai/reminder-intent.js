'use strict';

/**
 * AI may suggest either an OS reminder or a general task.
 * Only the reminder action schedules a native notification.
 */
const MAX_TITLE=160;
function isRecord(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function validTimezone(value){
 if(typeof value!=='string'||!value.trim())return false;
 try{new Intl.DateTimeFormat('en',{timeZone:value}).format(new Date());return true}catch{return false}
}
function validateTaskDue(due,{timezone:defaultTimezone='UTC'}={}){
 if(due===null||due===undefined)return {dueDate:null,dueTime:null,timezone:validTimezone(defaultTimezone)?defaultTimezone:null};
 if(!isRecord(due))return {action:'clarify',question:'Termenul task-ului nu este într-un format valid. Confirmă data și ora.'};
 const date=typeof due.date==='string'?due.date.trim():'',time=typeof due.time==='string'?due.time.trim():'';
 if(!date&&!time)return {dueDate:null,dueTime:null,timezone:validTimezone(defaultTimezone)?defaultTimezone:null};
 if(!date)return {action:'clarify',question:'Ai specificat o oră fără o dată. Pentru ce zi este task-ul?'} ;
 if(!/^d{4}-d{2}-d{2}$/.test(date))return {action:'clarify',question:'Nu am identificat o dată validă pentru task.'};
 const [y,m,d]=date.split('-').map(Number),check=new Date(Date.UTC(y,m-1,d));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)return {action:'clarify',question:'Data task-ului nu este validă.'};
 if(time&&!/^([01]d|2[0-3]):[0-5]d$/.test(time))return {action:'clarify',question:'Ora task-ului nu este validă. Folosește formatul HH:mm.'};
 const zone=typeof defaultTimezone==='string'&&defaultTimezone.trim()?defaultTimezone.trim():'UTC';
 if(!validTimezone(zone))return {action:'clarify',question:'Fusul orar al task-ului nu este valid.'};
 return {dueDate:date,dueTime:time||null,timezone:zone};
}
function validateReminderSuggestion(input,{now=new Date(),timezone='UTC',defaultHour=9,defaultMinute=0}={}){
 if(!isRecord(input))throw new TypeError('Sugestia task/reminder trebuie să fie un obiect.');
 const intent=String(input.intent||'none'),certainty=String(input.certainty||'uncertain');
 if(!['reminder','task','none','ambiguous'].includes(intent))throw new Error('Intenția task/reminder nu este validă.');
 if(!['certain','uncertain'].includes(certainty))throw new Error('Certitudinea task/reminder nu este validă.');
 const explicit=Boolean(input.explicitIntent),negated=Boolean(input.negated);
 const title=String(input.title||input.action||'').trim();
 if(intent==='none'||negated)return {action:'skip',reason:negated?'negated':'no-task-or-reminder-intent'};
 if(intent==='ambiguous'||certainty!=='certain'||!explicit)return {action:'clarify',question:String(input.clarificationQuestion||'Vrei să creez un task sau să programez un reminder?').trim()};
 if(!title||title.length>MAX_TITLE)throw new Error('Descrierea task-ului/reminderului trebuie să aibă între 1 și 160 de caractere.');
 if(intent==='task'){
  const due=validateTaskDue(input.due,{timezone:input.timezone||timezone});
  if(due.action==='clarify')return due;
  return {action:'create_task',task:{title,dueDate:due.dueDate,dueTime:due.dueTime,timezone:due.timezone,
   sourceId:typeof input.sourceId==='string'&&input.sourceId.trim()?input.sourceId.trim():null,
   idempotencyKey:typeof input.idempotencyKey==='string'&&input.idempotencyKey.trim()?input.idempotencyKey.trim():null}};
 }
 const due=input.due;
 if(!isRecord(due))return {action:'clarify',question:'Pentru când să setez reminderul?'};
 const resolved=resolveDue(due,{now,timezone,defaultHour,defaultMinute});
 if(resolved.action!=='schedule')return resolved;
 return {action:'schedule',reminder:{title,dueAt:resolved.dueAt,timezone,sourceId:typeof input.sourceId==='string'&&input.sourceId.trim()?input.sourceId.trim():null,context:typeof input.context==='string'?input.context.trim().slice(0,500):'',idempotencyKey:typeof input.idempotencyKey==='string'&&input.idempotencyKey.trim()?input.idempotencyKey.trim():null},usedDefaultTime:resolved.usedDefaultTime};
}
function resolveDue(due,{now=new Date(),timezone='UTC',defaultHour=9,defaultMinute=0}={}){
 if(typeof timezone!=='string'||!timezone.trim())return {action:'clarify',question:'Care este fusul orar pentru reminder?'};
 if(!Number.isInteger(defaultHour)||defaultHour<0||defaultHour>23||!Number.isInteger(defaultMinute)||defaultMinute<0||defaultMinute>59)throw new RangeError('Ora implicită pentru reminders este invalidă.');
 const date=due.date;
 if(typeof date!=='string'||!/^d{4}-d{2}-d{2}$/.test(date))return {action:'clarify',question:'Nu am identificat o dată exactă. Pentru când să setez reminderul?'};
 const [y,m,d]=date.split('-').map(Number),utcCheck=new Date(Date.UTC(y,m-1,d));
 if(utcCheck.getUTCFullYear()!==y||utcCheck.getUTCMonth()!==m-1||utcCheck.getUTCDate()!==d)return {action:'clarify',question:'Data identificată nu este validă. Pentru când să setez reminderul?'};
 let hour=defaultHour,minute=defaultMinute;
 if(due.time!==undefined&&due.time!==null&&due.time!==''){
  if(typeof due.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(due.time))return {action:'clarify',question:'Nu am identificat o oră validă. La ce oră să te anunț?'};
  [hour,minute]=due.time.split(':').map(Number);
 }
 let dueAt;
 try{dueAt=localDateTimeToUtc(date,hour,minute,timezone)}catch{return {action:'clarify',question:'Fusul orar identificat nu este valid. Confirmă fusul orar pentru reminder.'}}
 if(!dueAt)return {action:'clarify',question:'Ora locală este ambiguă sau nu există din cauza schimbării fusului orar. Alege o oră clară.'};
 if(dueAt.getTime()<=now.getTime())return {action:'clarify',question:'Data/ora este în trecut. Pentru când să setez reminderul?'};
 return {action:'schedule',dueAt:dueAt.toISOString(),usedDefaultTime:due.time==null||due.time==='',localDate:date,localTime:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')};
}
function localDateTimeToUtc(date,hour,minute,timezone){
 const [y,m,d]=date.split('-').map(Number),target=Date.UTC(y,m-1,d,hour,minute,0,0),formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),offsets=new Set();
 for(let delta=-36;delta<=36;delta+=3){const sample=new Date(target+delta*3600000),parts=Object.fromEntries(formatter.formatToParts(sample).map(p=>[p.type,p.value])),represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));offsets.add(represented-sample.getTime())}
 const matches=[];
 for(const offset of offsets){const candidate=new Date(target-offset),parts=Object.fromEntries(formatter.formatToParts(candidate).map(p=>[p.type,p.value]));if(parts.year===String(y)&&parts.month===String(m).padStart(2,'0')&&parts.day===String(d).padStart(2,'0')&&parts.hour===String(hour).padStart(2,'0')&&parts.minute===String(minute).padStart(2,'0'))matches.push(candidate)}
 return matches.length===1?matches[0]:null;
}
const api={validateReminderSuggestion,validateTaskDue,resolveDue,localDateTimeToUtc};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof window!=='undefined')window.CollectorReminderIntent=api;
