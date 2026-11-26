'use strict';

const LIVE_RECALL_SOURCE_ID='task:task:reminder:collector-live-recall-acceptance';
const LIVE_RECALL_TASK=Object.freeze({
 kind:'task',
 sourceId:LIVE_RECALL_SOURCE_ID,
 reminderId:'collector-live-recall-acceptance',
 title:'Verifică pompa de test',
 status:'snoozed',
 dueAt:'2026-11-27T08:00:00+02:00',
 sourceRef:'audio:collector-live-recall-acceptance',
 scheduleState:'settled',
 successorReminderId:'collector-live-recall-acceptance-next',
 successorTaskId:'task:reminder:collector-live-recall-acceptance-next',
 successorDueAt:'2026-11-27T09:15:00+02:00'
});
const LIVE_RECALL_QUESTION='La ce oră trebuie verificată pompa după amânare? Răspunde doar pe baza termenului successorDueAt și citează sursa task-ului.';

function parseLiveConfig(env=process.env){
 if(env.COLLECTOR_RUN_BILLABLE_RECALL_TEST!=='true'){
  throw new Error('Testul live este dezactivat. Setează explicit COLLECTOR_RUN_BILLABLE_RECALL_TEST=true pentru a autoriza un singur apel AI facturabil.');
 }
 const rawUrl=String(env.COLLECTOR_API_BASE_URL||'').trim();
 const accessToken=String(env.COLLECTOR_ACCESS_TOKEN||'').trim();
 if(!rawUrl)throw new Error('Lipsește COLLECTOR_API_BASE_URL.');
 if(!accessToken)throw new Error('Lipsește COLLECTOR_ACCESS_TOKEN.');
 let parsed;
 try{parsed=new URL(rawUrl)}catch{throw new Error('COLLECTOR_API_BASE_URL trebuie să fie un URL valid.')}
 const localHosts=new Set(['localhost','127.0.0.1','::1']);
 if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&localHosts.has(parsed.hostname))){
  throw new Error('URL-ul API trebuie să folosească HTTPS; HTTP este permis numai pentru localhost.');
 }
 if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'){
  throw new Error('COLLECTOR_API_BASE_URL trebuie să fie doar origin-ul API, fără credentiale, path, query sau fragment.');
 }
 const minimumRemainingUsd=Number(env.COLLECTOR_LIVE_RECALL_MIN_REMAINING_USD||0.10);
 if(!Number.isFinite(minimumRemainingUsd)||minimumRemainingUsd<=0||minimumRemainingUsd>100){
  throw new Error('COLLECTOR_LIVE_RECALL_MIN_REMAINING_USD trebuie să fie între 0 și 100 USD.');
 }
 return {baseUrl:parsed.origin,accessToken,minimumRemainingUsd};
}

function assertAiStatus(status,minimumRemainingUsd){
 if(!status||status.configured!==true||status.aiAvailable!==true||
    status.providerConfigured!==true||status.billingConfigured!==true||
    status.entitlement!=='pro'){
  throw new Error('Preflight blocat: Cloud API nu raportează OpenAI, billing și entitlement Pro active.');
 }
 const remaining=Number(status.aiUsage?.remainingUsd);
 if(!Number.isFinite(remaining)||remaining<minimumRemainingUsd){
  throw new Error('Preflight blocat: bugetul rămas este absent sau sub pragul de siguranță configurat.');
 }
 return {model:String(status.model||'unknown'),remainingUsd:remaining};
}

function assertRecallResponse(body){
 const interpretation=body?.interpretation;
 if(interpretation?.intent!=='answer'||typeof interpretation.answer!=='string'||!interpretation.answer.trim()){
  throw new Error('Recall live nu a returnat un răspuns bazat pe dovezi.');
 }
 const sources=Array.isArray(interpretation.answerSources)?[...new Set(interpretation.answerSources.map(String))]:[];
 if(!sources.length||sources.some(source=>source!==LIVE_RECALL_SOURCE_ID)){
  throw new Error('Recall live a omis sursa task-ului sau a citat o sursă care nu a fost furnizată.');
 }
 return {answer:interpretation.answer.trim(),answerSources:sources};
}

async function runLiveRecallAcceptance(env=process.env,fetchImpl=global.fetch){
 if(typeof fetchImpl!=='function')throw new TypeError('Fetch API indisponibil.');
 const config=parseLiveConfig(env);
 const headers={Authorization:'Bearer '+config.accessToken,Accept:'application/json'};
 const statusResponse=await fetchImpl(config.baseUrl+'/api/ai/status',{method:'GET',headers,signal:AbortSignal.timeout(30_000)});
 if(!statusResponse.ok)throw new Error('Preflight /api/ai/status a eșuat cu HTTP '+statusResponse.status+'.');
 const status=await statusResponse.json();
 const modelAndBudget=assertAiStatus(status,config.minimumRemainingUsd);

 const response=await fetchImpl(config.baseUrl+'/api/ai/interpret',{
  method:'POST',
  headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({text:LIVE_RECALL_QUESTION,context:{recallEvidence:[LIVE_RECALL_TASK]}}),
  signal:AbortSignal.timeout(60_000)
 });
 if(!response.ok){
  let code='';
  try{code=String((await response.json())?.code||'')}catch{}
  throw new Error('Recall live a fost respins cu HTTP '+response.status+(code?' ('+code+')':'')+'. Verifică entitlement-ul, bugetul și logurile serverului.');
 }
 const payload=await response.json();
 const result=assertRecallResponse(payload);
 return {
  model:String(payload.model||modelAndBudget.model),
  remainingBeforeUsd:modelAndBudget.remainingUsd,
  estimatedCostUsd:Number.isFinite(Number(payload.usage?.estimatedCostUsd))?Number(payload.usage.estimatedCostUsd):null,
  answer:result.answer,
  answerSources:result.answerSources
 };
}

if(require.main===module){
 runLiveRecallAcceptance().then(result=>{
  process.stdout.write('LIVE RECALL ACCEPTANCE: PASS\n');
  process.stdout.write('Model: '+result.model+'\n');
  process.stdout.write('Buget disponibil înainte de test: '+result.remainingBeforeUsd.toFixed(4)+' USD\n');
  if(result.estimatedCostUsd!==null)process.stdout.write('Cost raportat: '+result.estimatedCostUsd.toFixed(6)+' USD\n');
  process.stdout.write('Răspuns: '+result.answer+'\n');
  process.stdout.write('Surse validate: '+result.answerSources.join(', ')+'\n');
 }).catch(error=>{
  process.stderr.write('LIVE RECALL ACCEPTANCE: BLOCKED/FAILED — '+error.message+'\n');
  process.exitCode=1;
 });
}

module.exports={
 LIVE_RECALL_SOURCE_ID,LIVE_RECALL_TASK,LIVE_RECALL_QUESTION,
 parseLiveConfig,assertAiStatus,assertRecallResponse,runLiveRecallAcceptance
};
