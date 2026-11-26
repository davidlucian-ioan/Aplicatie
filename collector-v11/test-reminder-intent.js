'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateReminderSuggestion,resolveDue}=require('./ai/reminder-intent');
const now=new Date('2026-11-26T08:00:00.000Z');
const base={intent:'reminder',certainty:'certain',explicitIntent:true,negated:false,title:'Cumpără materialele pentru proiect',due:{date:'2026-11-27'},sourceId:'audio-1'};
test('reminder explicit date-only resolves configurable default time in timezone',()=>{
 const result=validateReminderSuggestion(base,{now,timezone:'Europe/Bucharest',defaultHour:9});
 assert.equal(result.action,'schedule');assert.equal(result.reminder.title,base.title);assert.equal(result.reminder.sourceId,'audio-1');
 assert.equal(result.reminder.dueAt,'2026-11-27T07:00:00.000Z');
});
test('explicit time uses timezone conversion',()=>{
 const result=validateReminderSuggestion({...base,due:{date:'2026-11-27',time:'18:30'}},{now,timezone:'Europe/Bucharest'});
 assert.equal(result.reminder.dueAt,'2026-11-27T16:30:00.000Z');
});
test('uncertain or non-explicit intent asks instead of scheduling',()=>{
 assert.equal(validateReminderSuggestion({...base,certainty:'uncertain'}).action,'clarify');
 assert.equal(validateReminderSuggestion({...base,explicitIntent:false}).action,'clarify');
});
test('negated and no-reminder intents skip side effect',()=>{
 assert.equal(validateReminderSuggestion({...base,negated:true}).action,'skip');
 assert.equal(validateReminderSuggestion({...base,intent:'none'}).action,'skip');
});
test('ambiguous due date asks and does not schedule',()=>{
 assert.equal(validateReminderSuggestion({...base,due:{date:'vineri'}}).action,'clarify');
});
test('past reminder never schedules',()=>{
 assert.equal(validateReminderSuggestion({...base,due:{date:'2026-11-25'}},{now,timezone:'Europe/Bucharest'}).action,'clarify');
});
test('invalid date and invalid time rejected or clarified',()=>{
 assert.equal(resolveDue({date:'2026-02-30'},{now,timezone:'UTC'}).action,'clarify');
 assert.equal(resolveDue({date:'2026-11-27',time:'25:00'},{now,timezone:'UTC'}).action,'clarify');
});
test('invalid title is rejected',()=>{
 assert.throws(()=>validateReminderSuggestion({...base,title:' '.repeat(2)}),/Descrierea reminder/);
});
test('timezone IANA invalid is clarified instead of crashing scheduling flow',()=>{
 const result=resolveDue({date:'2026-11-27',time:'09:00'},{now,timezone:'Romania/Invalid'});
 assert.equal(result.action,'clarify');assert.match(result.question,/fusul orar/i);
});
test('DST gap is rejected instead of silently changing time',()=>{
 const result=resolveDue({date:'2027-03-28',time:'03:30'},{now:new Date('2027-03-01'),timezone:'Europe/Bucharest'});
 assert.equal(result.action,'clarify');
});
test('ora locală ambiguă în DST fall-back este clarificată',()=>{
 const result=resolveDue({date:'2026-11-01',time:'01:30'},{now:new Date('2026-10-01T00:00:00Z'),timezone:'America/New_York'});
 assert.equal(result.action,'clarify');
 assert.match(result.question,/ambiguă|nu există/i);
});
