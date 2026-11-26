'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
 LIVE_RECALL_SOURCE_ID,LIVE_RECALL_TASK,parseLiveConfig,assertAiStatus,assertRecallResponse,runLiveRecallAcceptance
}=require('./live-recall-acceptance');

const optedIn={
 COLLECTOR_RUN_BILLABLE_RECALL_TEST:'true',
 COLLECTOR_API_BASE_URL:'https://collector.example.test',
 COLLECTOR_ACCESS_TOKEN:'test-access-token',
 COLLECTOR_LIVE_RECALL_MIN_REMAINING_USD:'0.10'
};
const status={configured:true,aiAvailable:true,providerConfigured:true,billingConfigured:true,entitlement:'pro',model:'test-model',aiUsage:{remainingUsd:0.5}};

test('live test is opt-in and requires explicit endpoint plus authenticated session',()=>{
 assert.throws(()=>parseLiveConfig({...optedIn,COLLECTOR_RUN_BILLABLE_RECALL_TEST:'false'}),/dezactivat/);
 assert.throws(()=>parseLiveConfig({...optedIn,COLLECTOR_ACCESS_TOKEN:''}),/COLLECTOR_ACCESS_TOKEN/);
 assert.equal(parseLiveConfig(optedIn).baseUrl,'https://collector.example.test');
});
test('live test accepts HTTPS and local-only HTTP; rejects insecure remote origins and embedded credentials',()=>{
 assert.equal(parseLiveConfig({...optedIn,COLLECTOR_API_BASE_URL:'http://127.0.0.1:8080'}).baseUrl,'http://127.0.0.1:8080');
 assert.throws(()=>parseLiveConfig({...optedIn,COLLECTOR_API_BASE_URL:'http://collector.example.test'}),/HTTPS/);
 assert.throws(()=>parseLiveConfig({...optedIn,COLLECTOR_API_BASE_URL:'https://user:pass@collector.example.test'}),/fără credentiale/);
});
test('live test refuses non-Pro, unconfigured billing/provider and insufficient budget before POST',()=>{
 assert.throws(()=>assertAiStatus({...status,entitlement:'free'},0.1),/entitlement Pro/);
 assert.throws(()=>assertAiStatus({...status,aiAvailable:false},0.1),/entitlement Pro/);
 assert.throws(()=>assertAiStatus({...status,aiUsage:{remainingUsd:0.01}},0.1),/bugetul rămas/);
 assert.equal(assertAiStatus(status,0.1).model,'test-model');
});
test('live response must answer and cite only the exact injected task evidence ID',()=>{
 assert.throws(()=>assertRecallResponse({interpretation:{intent:'propose',answer:'',answerSources:[]}}),/nu a returnat/);
 assert.throws(()=>assertRecallResponse({interpretation:{intent:'answer',answer:'La 09:15.',answerSources:['invented']}}),/sursă/);
 const result=assertRecallResponse({interpretation:{intent:'answer',answer:'La 09:15.',answerSources:[LIVE_RECALL_SOURCE_ID,LIVE_RECALL_SOURCE_ID]}});
 assert.deepEqual(result.answerSources,[LIVE_RECALL_SOURCE_ID]);
});
test('mocked acceptance proves status preflight precedes one authenticated, read-only Recall request',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/api/ai/status'))return {ok:true,status:200,json:async()=>status};
  return {ok:true,status:200,json:async()=>({model:'test-model',usage:{estimatedCostUsd:0.002},interpretation:{intent:'answer',answer:'Verificarea este la 09:15.',answerSources:[LIVE_RECALL_SOURCE_ID]}})};
 };
 const result=await runLiveRecallAcceptance(optedIn,fetchImpl);
 assert.equal(calls.length,2);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[1].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer test-access-token');
 assert.equal(calls[1].options.headers.Authorization,'Bearer test-access-token');
 const sent=JSON.parse(calls[1].options.body);
 assert.ok(sent.text.includes('după amânare'));
 assert.equal(sent.context.recallEvidence[0].successorDueAt,LIVE_RECALL_TASK.successorDueAt);
 assert.deepEqual(sent.context.recallEvidence,[LIVE_RECALL_TASK]);
 assert.equal(result.answer,'Verificarea este la 09:15.');
 assert.deepEqual(result.answerSources,[LIVE_RECALL_SOURCE_ID]);
});
