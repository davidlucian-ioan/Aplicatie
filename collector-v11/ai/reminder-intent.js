'use strict';

/**
 * Collector reminder-intent safety boundary.
 * AI may suggest an intent; this module validates the suggestion before any
 * notification side effect. Scheduling is intentionally a separate step.
 */
const MAX_TITLE=160;
const ALLOWED_STATUS=['suggested','confirmed','scheduled','completed','cancelled'];

function validateReminderSuggestion(input,{now=new Date(),timezone='UTC',defaultHour=9,defaultMinute=0}={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Sugestia reminder trebuie să fie un obiect.');
  const intent=String(input.intent||'none');
  if(!['reminder','task','none','ambiguous'].includes(intent))throw new Error('Intenția reminder nu este validă.');
  const certainty=String(input.certainty||'uncertain');
  if(!['certain','uncertain'].includes(certainty))throw new Error('Certitudinea reminderului nu este validă.');
  const explicit=Boolean(input.explicitIntent);
  const negated=Boolean(input.negated);
  const title=String(input.title||input.action||'').trim();
  if(intent==='none'||negated)return {action:'skip',reason:negated?'negated':'no-reminder-intent'};
  if(intent==='ambiguous'||certainty!=='certain'||!explicit)return {action:'clarify',question:String(input.clarificationQuestion||'Vrei să setez un reminder pentru această acțiune?').trim()};
  if(!title||title.length>MAX_TITLE)throw new Error('Descrierea reminderului trebuie să aibă între 1 și 160 de caractere.');
  const due=input.due;
  if(!due||typeof due!=='object'||Array.isArray(due))return {action:'clarify',question:'Pentru când să setez reminderul?'};
  const resolved=resolveDue(due,{now,timezone,defaultHour,defaultMinute});
  if(resolved.action!=='schedule')return resolved;
  return {action:'schedule',reminder:{title,dueAt:resolved.dueAt,timezone,sourceId:typeof input.sourceId==='string'&&input.sourceId.trim()?input.sourceId.trim():null,context:typeof input.context==='string'?input.context.trim().slice(0,500):'',idempotencyKey:typeof input.idempotencyKey==='string'&&input.idempotencyKey.trim()?input.idempotencyKey.trim():null}};
}

function resolveDue(due,{now=new Date(),timezone='UTC',defaultHour=9,defaultMinute=0}={}) {
  if(typeof timezone!=='string'||!timezone.trim())return {action:'clarify',question:'Care este fusul orar pentru reminder?'};
  if(!Number.isInteger(defaultHour)||defaultHour<0||defaultHour>23||!Number.isInteger(defaultMinute)||defaultMinute<0||defaultMinute>59)throw new RangeError('Ora implicită pentru reminders este invalidă.');
  const date=due.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return {action:'clarify',question:'Nu am identificat o dată exactă. Pentru când să setez reminderul?'};
  const [y,m,d]=date.split('-').map(Number);
  const utcCheck=new Date(Date.UTC(y,m-1,d));
  if(utcCheck.getUTCFullYear()!==y||utcCheck.getUTCMonth()!==m-1||utcCheck.getUTCDate()!==d)return {action:'clarify',question:'Data identificată nu este validă. Pentru când să setez reminderul?'};
  let hour=defaultHour,minute=defaultMinute;
  if(due.time!==undefined&&due.time!==null&&due.time!==''){
    if(typeof due.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(due.time))return {action:'clarify',question:'Nu am identificat o oră validă. La ce oră să te anunț?'};
    [hour,minute]=due.time.split(':').map(Number);
  }
  // Convert the requested local wall-clock time in an IANA timezone to UTC.
  const dueAt=localDateTimeToUtc(date,hour,minute,timezone);
  if(!dueAt)return {action:'clarify',question:'Ora locală este ambiguă sau nu există din cauza schimbării fusului orar. Alege o oră clară.'};
  if(dueAt.getTime()<=now.getTime())return {action:'clarify',question:'Data/ora este în trecut. Pentru când să setez reminderul?'};
  return {action:'schedule',dueAt:dueAt.toISOString(),usedDefaultTime:due.time==null||due.time==='',localDate:date,localTime:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`};
}

function localDateTimeToUtc(date,hour,minute,timezone){
  // Resolve possible timezone offsets around the requested wall-clock time.
  // DST gaps have zero candidates; fall-back overlaps have two and are rejected.
  const [y,m,d]=date.split('-').map(Number);
  const target=Date.UTC(y,m-1,d,hour,minute,0,0);
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const offsets=new Set();
  for(let delta=-36;delta<=36;delta+=3){
    const sample=new Date(target+delta*60*60*1000);
    const parts=Object.fromEntries(formatter.formatToParts(sample).map(p=>[p.type,p.value]));
    const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));
    offsets.add(represented-sample.getTime());
  }
  const matches=[];
  for(const offset of offsets){
    const candidate=new Date(target-offset);
    const parts=Object.fromEntries(formatter.formatToParts(candidate).map(p=>[p.type,p.value]));
    if(parts.year===String(y)&&parts.month===String(m).padStart(2,'0')&&parts.day===String(d).padStart(2,'0')&&parts.hour===String(hour).padStart(2,'0')&&parts.minute===String(minute).padStart(2,'0'))matches.push(candidate);
  }
  return matches.length===1?matches[0]:null;
}

module.exports={validateReminderSuggestion,resolveDue,localDateTimeToUtc};
