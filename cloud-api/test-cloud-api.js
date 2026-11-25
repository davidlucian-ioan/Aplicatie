'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCloudServer}=require('./server');

const defaultBilling={configured:true,getEntitlement:async()=>({entitlement:'pro',is_active:true,expires_at:null}),getUsage:async()=>({budget_microusd:1000000,used_microusd:125000,reserved_microusd:25000,period_end:'2026-12-01'}),reserve:async()=>({allowed:true}),settle:async()=>({settled:true,used_microusd:13000})};
async function withServer(options,run){
 const server=createCloudServer({...options,billingService:options.billingService||defaultBilling});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address(),base='http://127.0.0.1:'+address.port;
 try{return await run(base)}finally{await new Promise(resolve=>server.close(resolve))}
}
function authFetch(userId='user-1'){
 return async(url,options)=>{
  assert.ok(url.endsWith('/auth/v1/user'));
  assert.equal(options.headers.apikey,'anon-test');
  assert.equal(options.headers.Authorization,'Bearer valid-token');
  return {ok:true,json:async()=>({id:userId})};
 };
}
const baseEnv={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon-test',OPENAI_API_KEY:'sk-server-only',OPENAI_MODEL:'test-model',SUPABASE_SERVICE_ROLE_KEY:'service-role-test',COLLECTOR_ALLOWED_ORIGINS:'capacitor://localhost,https://app.example.test'};
test('health este public, dar endpoint-urile AI cer sesiune autentificată',async()=>{
 await withServer({env:baseEnv,fetchImpl:authFetch(),providerFactory:()=>({model:'test-model',interpret:async()=>({kind:'answer'})})},async base=>{
  const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
  const status=await fetch(base+'/api/ai/status');assert.equal(status.status,401);
  const authenticated=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer valid-token',Origin:'capacitor://localhost'}});
  assert.equal(authenticated.status,200);const statusBody=await authenticated.json();assert.equal(statusBody.configured,true);assert.equal(statusBody.accountDeletionEnabled,true);assert.equal(statusBody.aiUsage.usedUsd,0.125);assert.equal(statusBody.aiUsage.remainingUsd,0.85);
  assert.equal(authenticated.headers.get('access-control-allow-origin'),'capacitor://localhost');
 });
});
test('utilizatorul autentificat își poate șterge contul cloud',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user-1'})};
  if(url.endsWith('/auth/v1/admin/users/user-1'))return {ok:true};
  throw new Error('unexpected URL');
 };
 await withServer({env:baseEnv,fetchImpl},async base=>{
  const response=await fetch(base+'/api/account',{method:'DELETE',headers:{Authorization:'Bearer valid-token',Origin:'capacitor://localhost'}});
  assert.equal(response.status,204);
  const deletion=calls.find(call=>call.options.method==='DELETE');
  assert.ok(deletion);assert.equal(deletion.options.headers.apikey,'service-role-test');
  assert.equal(deletion.options.headers.Authorization,'Bearer service-role-test');
 });
});
test('ștergerea contului este dezactivată dacă lipsește cheia administrativă',async()=>{
 const env={...baseEnv};delete env.SUPABASE_SERVICE_ROLE_KEY;
 await withServer({env,fetchImpl:authFetch()},async base=>{
  const response=await fetch(base+'/api/account',{method:'DELETE',headers:{Authorization:'Bearer valid-token'}});
  assert.equal(response.status,503);
 });
});
test('interpretarea folosește providerul și contextul sanitizat',async()=>{
 let received=null;
 await withServer({env:baseEnv,fetchImpl:authFetch(),providerFactory:()=>({model:'test-model',interpret:async value=>{received=value;return {kind:'answer'}}})},async base=>{
  const response=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'application/json',Origin:'https://app.example.test'},body:JSON.stringify({text:'Notează pH 6.2',context:{entities:[{id:'e1',name:'B3',secret:'do-not-send'}],privateField:'remove'}})});
  assert.equal(response.status,200);assert.equal((await response.json()).interpretation.kind,'answer');
  assert.equal(received.text,'Notează pH 6.2');assert.deepEqual(received.context,{entities:[{id:'e1',name:'B3',type:'generic'}],attributes:[]});
 });
});
test('originea nepermisă este respinsă înainte de autentificare',async()=>{
 let authCalls=0;
 await withServer({env:baseEnv,fetchImpl:async()=>{authCalls++;return {ok:true,json:async()=>({id:'u'})}}},async base=>{
  const response=await fetch(base+'/api/ai/status',{headers:{Origin:'https://evil.example'}});
  assert.equal(response.status,403);assert.equal(authCalls,0);
 });
});
test('cererea AI refuză text invalid și content type incorect',async()=>{
 await withServer({env:baseEnv,fetchImpl:authFetch(),providerFactory:()=>({interpret:async()=>({})})},async base=>{
  const wrongType=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'text/plain'},body:'x'});
  assert.equal(wrongType.status,415);
  const invalid=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'application/json'},body:JSON.stringify({text:' '})});
  assert.equal(invalid.status,400);
 });
});
test('fără cheia OpenAI endpoint-ul nu apelează providerul',async()=>{
 let called=false;
 await withServer({env:{...baseEnv,OPENAI_API_KEY:''},fetchImpl:authFetch(),providerFactory:()=>{called=true;return {interpret:async()=>({})}}},async base=>{
  const response=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'application/json'},body:JSON.stringify({text:'test'})});
  assert.equal(response.status,503);assert.equal(called,false);
 });
});
test('rate limit este aplicat per utilizator autentificat',async()=>{
 await withServer({env:baseEnv,fetchImpl:authFetch(),providerFactory:()=>({model:'test-model',interpret:async()=>({})})},async base=>{
  let last;
  for(let i=0;i<21;i++)last=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer valid-token'}});
  assert.equal(last.status,429);
 });
});

test('AI refuză utilizatorii fără entitlement Pro înainte să apeleze providerul',async()=>{
 let providerCalled=false;
 const billingService={configured:true,reserve:async()=>({allowed:false,reason:'subscription_required'}),settle:async()=>({})};
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService,providerFactory:()=>{providerCalled=true;return {interpret:async()=>({})}}},async base=>{
  const response=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'application/json'},body:JSON.stringify({text:'test'})});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'subscription_required');assert.equal(providerCalled,false);
 });
});
test('AI oprește solicitările când bugetul lunar este epuizat',async()=>{
 let providerCalled=false;
 const billingService={configured:true,reserve:async()=>({allowed:false,reason:'monthly_budget_exceeded'}),settle:async()=>({})};
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService,providerFactory:()=>{providerCalled=true;return {interpret:async()=>({})}}},async base=>{
  const response=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'application/json'},body:JSON.stringify({text:'test'})});
  assert.equal(response.status,429);assert.equal((await response.json()).code,'monthly_budget_exceeded');assert.equal(providerCalled,false);
 });
});
test('AI înregistrează usage după răspuns și returnează costul estimat',async()=>{
 let reserved=null,settled=null;
 const billingService={configured:true,reserve:async value=>{reserved=value;return {allowed:true}},settle:async value=>{settled=value;return {settled:true,used_microusd:value.actualMicrousd}}};
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService,providerFactory:()=>({model:'test-model',interpret:async()=>({kind:'answer',usage:{inputTokens:1200,outputTokens:300}})})},async base=>{
  const response=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'application/json'},body:JSON.stringify({text:'test'})});
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.usage.inputTokens,1200);assert.equal(result.usage.outputTokens,300);
  assert.equal(result.usage.estimatedCostUsd,0.0054);
  assert.ok(reserved.reserveMicrousd>=58_000); // 20k fixed prompt/schema bytes at $2/M + 1,800 output tokens at $10/M
  assert.equal(settled.inputTokens,1200);assert.equal(settled.outputTokens,300);
 });
});
test('AI status indică indisponibilitatea când metering-ul persistent lipsește',async()=>{
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService:{configured:false}},async base=>{
  const response=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer valid-token'}});
  const status=await response.json();assert.equal(status.configured,false);assert.equal(status.providerConfigured,true);assert.equal(status.billingConfigured,false);assert.equal(status.aiAvailable,false);
 });
});

test('webhook RevenueCat autentificat mapează achiziția la utilizatorul Collector',async()=>{
 let received=null;
 const billingService={configured:true,reserve:async()=>({allowed:true}),settle:async()=>({}),
  applyRevenueCatEvent:async value=>{received=value;return {processed:true,active:true}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly,collector_pro_yearly'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
   body:JSON.stringify({event:{id:'evt-1',type:'RENEWAL',app_user_id:'$RCAnonymousID:temporary',original_app_user_id:'$RCAnonymousID:temporary',aliases:['123e4567-e89b-42d3-a456-426614174000'],
    product_id:'collector_pro_monthly',entitlement_ids:['pro'],store:'PLAY_STORE',expiration_at_ms:1893456000000}})});
  assert.equal(response.status,200);assert.equal((await response.json()).processed,true);
  assert.equal(received.userId,'123e4567-e89b-42d3-a456-426614174000');
  assert.equal(received.isProProduct,true);assert.equal(received.store,'play_store');
  assert.equal(received.eventType,'RENEWAL');assert.ok(received.expiresAt);assert.ok(received.eventTimestamp);
 });
});
test('webhook RevenueCat respinge sem secret corect',async()=>{
 let called=false;
 const billingService={configured:true,applyRevenueCatEvent:async()=>{called=true}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer expected'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer wrong','Content-Type':'application/json'},body:JSON.stringify({event:{id:'x',type:'RENEWAL'}})});
  assert.equal(response.status,401);assert.equal(called,false);
 });
});

test('status-ul AI nu expune Pro pentru un utilizator fără abonament activ',async()=>{
 const billingService={configured:true,getEntitlement:async()=>({entitlement:'free',is_active:false}),reserve:async()=>({allowed:false,reason:'subscription_required'}),settle:async()=>({})};
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer valid-token'}});
  const status=await response.json();assert.equal(status.entitlement,'free');assert.equal(status.configured,false);assert.equal(status.aiAvailable,false);
 });
});

test('RevenueCat billing issue păstrează Pro până la sfârșitul grace period',async()=>{
 let received=null;
 const billingService={configured:true,applyRevenueCatEvent:async value=>{received=value;return {processed:true,active:true}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
   body:JSON.stringify({event:{id:'evt-grace',type:'BILLING_ISSUE',app_user_id:'123e4567-e89b-42d3-a456-426614174000',
    product_id:'collector_pro_monthly',expiration_at_ms:1600000000000,grace_period_expiration_at_ms:1893456000000,
    event_timestamp_ms:1800000000000}})});
  assert.equal(response.status,200);assert.equal(received.expiresAt,new Date(1893456000000).toISOString());
 });
});

test('rate-limit state has a bounded user cache',async()=>{
 const env={...baseEnv,COLLECTOR_RATE_LIMIT_MAX_USERS:'2'};
 const fetchImpl=async(url,options)=>{
  const token=options.headers.Authorization;
  return {ok:true,json:async()=>({id:token.slice('Bearer '.length)})};
 };
 await withServer({env,fetchImpl},async base=>{
  for(let i=0;i<20;i++){
   const response=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer user-1'}});
   assert.equal(response.status,200);
  }
  for(const user of ['user-2','user-3']){
   const response=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer '+user}});
   assert.equal(response.status,200);
  }
  // user-1 was evicted; without bounded-cache eviction this request would be rate-limited.
  const firstAgain=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer user-1'}});
  assert.equal(firstAgain.status,200);
 });
});

test('webhook RevenueCat nu acordă Pro unui produs în afara allowlist chiar dacă entitlement-ul este pro',async()=>{
 let received=null;
 const billingService={configured:true,applyRevenueCatEvent:async value=>{received=value;return {processed:true,ignored:true}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
   body:JSON.stringify({event:{id:'evt-unlisted',type:'INITIAL_PURCHASE',app_user_id:'123e4567-e89b-42d3-a456-426614174000',
    product_id:'unlisted_product',entitlement_ids:['pro'],store:'PLAY_STORE',expiration_at_ms:1893456000000}})});
  assert.equal(response.status,200);assert.equal(received.isProProduct,false);
 });
});
test('webhook RevenueCat nu acordă Pro fără entitlement-ul configurat chiar pentru produs allowlisted',async()=>{
 let received=null;
 const billingService={configured:true,applyRevenueCatEvent:async value=>{received=value;return {processed:true,ignored:true}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly',REVENUECAT_PRO_ENTITLEMENT_ID:'pro'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
   body:JSON.stringify({event:{id:'evt-no-entitlement',type:'INITIAL_PURCHASE',app_user_id:'123e4567-e89b-42d3-a456-426614174000',
    product_id:'collector_pro_monthly',entitlement_ids:['other'],store:'PLAY_STORE',expiration_at_ms:1893456000000}})});
  assert.equal(response.status,200);assert.equal(received.isProProduct,false);
 });
});

test('RevenueCat revocation events reach billing ledger without entitlement_ids when product is allowlisted',async()=>{
 const received=[];
 const billingService={configured:true,applyRevenueCatEvent:async value=>{received.push(value);return {processed:true,active:false}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  for(const type of ['CANCELLATION','BILLING_ISSUE','EXPIRATION','REFUND','SUBSCRIPTION_PAUSED']){
   const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
    headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
    body:JSON.stringify({event:{id:'evt-'+type,type,app_user_id:'123e4567-e89b-42d3-a456-426614174000',
     product_id:'collector_pro_monthly',store:'PLAY_STORE',expiration_at_ms:1600000000000,
     grace_period_expiration_at_ms:1600000000000,event_timestamp_ms:1800000000000}})});
   assert.equal(response.status,200);
  }
  assert.equal(received.length,5);
  assert.ok(received.every(event=>event.isProProduct===true));
 });
});
test('RevenueCat revocation for non-allowlisted product remains ignored',async()=>{
 let received=null;
 const billingService={configured:true,applyRevenueCatEvent:async value=>{received=value;return {processed:true,ignored:true}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
   body:JSON.stringify({event:{id:'evt-refund-unlisted',type:'REFUND',app_user_id:'123e4567-e89b-42d3-a456-426614174000',
    product_id:'other_product',store:'PLAY_STORE',event_timestamp_ms:1800000000000}})});
  assert.equal(response.status,200);assert.equal(received.isProProduct,false);
 });
});

test('RevenueCat CUSTOMER_SUPPORT cancellation reason is passed to billing for immediate refund revocation',async()=>{
 let received=null;
 const billingService={configured:true,applyRevenueCatEvent:async value=>{received=value;return {processed:true,active:false}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly'};
 await withServer({env,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
   body:JSON.stringify({event:{id:'evt-refund-customer-support',type:'CANCELLATION',
    cancel_reason:'CUSTOMER_SUPPORT',app_user_id:'123e4567-e89b-42d3-a456-426614174000',
    product_id:'collector_pro_monthly',entitlement_ids:['pro'],store:'PLAY_STORE',
    expiration_at_ms:1893456000000,event_timestamp_ms:1800000000000}})});
  assert.equal(response.status,200);
  assert.equal(received.cancelReason,'CUSTOMER_SUPPORT');
  assert.equal(received.isProProduct,true);
 });
});


test('RevenueCat webhook safely ignores out-of-range timestamps instead of retrying forever',async()=>{
 let received=null;
 const billingService={configured:true,applyRevenueCatEvent:async value=>{received=value;return {processed:true}}};
 const env={...baseEnv,REVENUECAT_WEBHOOK_AUTHORIZATION:'Bearer webhook-secret',REVENUECAT_PRO_PRODUCT_IDS:'collector_pro_monthly'};
 await withServer({env,fetchImpl:authFetch(),billingService,now:()=>1800000000000},async base=>{
  const response=await fetch(base+'/api/billing/revenuecat-webhook',{method:'POST',
   headers:{Authorization:'Bearer webhook-secret','Content-Type':'application/json'},
   body:JSON.stringify({event:{id:'evt-invalid-dates',type:'RENEWAL',app_user_id:'123e4567-e89b-42d3-a456-426614174000',
    product_id:'collector_pro_monthly',entitlement_ids:['pro'],expiration_at_ms:9e99,event_timestamp_ms:9e99}})});
  assert.equal(response.status,200);
  assert.equal(received.expiresAt,null);
  assert.equal(received.eventTimestamp,new Date(1800000000000).toISOString());
 });
});


test('expired Pro entitlement is downgraded to Basic in AI status and usage is not exposed',async()=>{
 let usageCalled=false;
 const billingService={configured:true,getEntitlement:async()=>({entitlement:'pro',is_active:true,expires_at:'2020-01-01T00:00:00.000Z'}),getUsage:async()=>{usageCalled=true;return {budget_microusd:1000000,used_microusd:0,reserved_microusd:0}},reserve:async()=>({allowed:false,reason:'subscription_required'}),settle:async()=>({})};
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService},async base=>{
  const response=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer valid-token'}});
  assert.equal(response.status,200);const status=await response.json();
  assert.equal(status.entitlement,'free');assert.equal(status.configured,false);assert.equal(status.aiAvailable,false);
  assert.equal(status.subscriptionExpiresAt,null);assert.equal(status.aiUsage,null);assert.equal(usageCalled,false);
 });
});

test('expired Pro entitlement cannot reach the AI provider even if is_active remains true',async()=>{
 let providerCalled=false;
 const billingService={configured:true,getEntitlement:async()=>({entitlement:'pro',is_active:true,expires_at:'2020-01-01T00:00:00.000Z'}),reserve:async()=>({allowed:false,reason:'subscription_required'}),settle:async()=>({})};
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService,providerFactory:()=>{providerCalled=true;return {interpret:async()=>({})}}},async base=>{
  const response=await fetch(base+'/api/ai/interpret',{method:'POST',headers:{Authorization:'Bearer valid-token','Content-Type':'application/json'},body:JSON.stringify({text:'test'})});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'subscription_required');assert.equal(providerCalled,false);
 });
});
