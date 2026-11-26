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
 assert.match(app,/CollectorReminderIntent/);
 assert.match(app,/validateReminderSuggestion/);
 assert.match(app,/if\(!confirm\(/);
 assert.ok(app.includes("idempotencyKey:'collector-ai-reminder:'+turnId+':'+index"));
 assert.match(app,/CollectorReminders\?\.schedule/);
 assert.match(reminders,/async function schedule\(input\)/);
 assert.match(reminders,/row\.idempotencyKey===key/);
 assert.match(reminders,/sourceContext/);
});

test('reminder source context and completion status are visible in the local activity list',async()=>{
 const reminders=await fs.readFile(path.join(__dirname,'reminders.js'),'utf8');
 assert.match(reminders,/Sursă Work/);
 assert.match(reminders,/data-reminder-complete/);
 assert.match(reminders,/completedAt/);
 assert.match(reminders,/status:'scheduled'/);
});

test('Recall AI synthesis receives only retrieved evidence and displays validated source citations',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const provider=await fs.readFile(path.join(__dirname,'ai','provider-openai.js'),'utf8');
 const sanitizer=await fs.readFile(path.join(__dirname,'ai','context-sanitizer.js'),'utf8');
 assert.match(app,/CollectorOpenAIProvider\.interpret\(q,\{recallEvidence:result\.evidence\}\)/);
 assert.match(app,/ai\?\.intent!=='answer'/);
 assert.match(app,/sourceMap\.has\(id\)/);
 assert.match(app,/data-recall-open-event/);
 assert.match(provider,/answer_sources/);
 assert.match(provider,/allowedRecallSources\.has\(value\)/);
 assert.match(sanitizer,/function safeRecallEvidence/);
});


test('native reminder lifecycle uses the verified Core Port and a stable idempotent event journal',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const reminders=await fs.readFile(path.join(__dirname,'reminders.js'),'utf8');
 assert.match(app,/function recordReminderLifecycleInCore/);
 assert.match(app,/intent:'reminder\.lifecycle'/);
 assert.match(app,/operation:'event\.note'/);
 assert.match(app,/idempotencyKey:entry\.idempotencyKey/);
 assert.match(app,/port\.preview\(command\)/);
 assert.match(app,/port\.execute\(command,\{confirmed:true\}\)/);
 assert.match(app,/CollectorReminders\?\.initialize\(\{onCoreEvent:recordReminderLifecycleInCore\}\)/);
 assert.match(reminders,/coreOutbox/);
 assert.match(reminders,/async function syncCoreOutboxInternal/);
 assert.match(reminders,/async function recoverPendingSchedulesInternal/);
 assert.match(reminders,/scheduleState:'pending'/);
 assert.match(reminders,/scheduleState:'uncertain'/);
 assert.match(reminders,/data-reminder-core-sync/);
 assert.match(reminders,/pendingCoreCount\(rows\)>0/);
});

test('reminder Core outbox does not copy source transcript context into permanent Core evidence',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const handler=app.slice(app.indexOf('async function recordReminderLifecycleInCore'),app.indexOf('function ensureAICorePort'));
 assert.match(handler,/sourceId:entry\.sourceId\|\|null/);
 assert.doesNotMatch(handler,/sourceContext/);
 assert.match(handler,/Reminder '\+labels\[entry\.lifecycle\]/);
});
