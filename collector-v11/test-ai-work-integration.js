'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

test('Work renders semantic summaries, memory candidates and reminder previews from structured AI',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const html=await fs.readFile(path.join(__dirname,'index.html'),'utf8');
 const provider=await fs.readFile(path.join(__dirname,'ai','provider-openai.js'),'utf8');
 assert.match(provider,/semantic_summary/);
 assert.match(provider,/memory_facts/);
 assert.match(provider,/reminder_suggestions/);
 assert.match(app,/ai\.semanticSummary/);
 assert.match(app,/ai\.memoryFacts/);
 assert.match(app,/ai\.reminderSuggestions/);
 assert.match(app,/data-ai-reminder-index/);
 assert.match(html,/ai\/reminder-intent\.js/);
});

test('AI reminder scheduling validates intent and date, requires confirmation, and is idempotent',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const reminders=await fs.readFile(path.join(__dirname,'reminders.js'),'utf8');
 assert.match(app,/CollectorReminderIntent\.validateReminderSuggestion/);
 assert.match(app,/if\(!confirm\(/);
 assert.match(app,/idempotencyKey:'collector-ai-reminder:'\+turnId\+': '\+index/);
 assert.match(app,/CollectorReminders\?\.schedule/);
 assert.match(reminders,/async function schedule\(input\)/);
 assert.match(reminders,/existing\.idempotencyKey===key/);
 assert.match(reminders,/sourceContext/);
});

test('reminder source context and completion status are visible in the local activity list',async()=>{
 const reminders=await fs.readFile(path.join(__dirname,'reminders.js'),'utf8');
 assert.match(reminders,/Sursă Work/);
 assert.match(reminders,/data-reminder-complete/);
 assert.match(reminders,/completedAt/);
 assert.match(reminders,/status:'scheduled'/);
});
