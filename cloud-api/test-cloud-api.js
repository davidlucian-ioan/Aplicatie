'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCloudServer}=require('./server');

async function withServer(options,run){
 const server=createCloudServer(options);
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
  assert.equal(authenticated.status,200);const statusBody=await authenticated.json();assert.equal(statusBody.configured,true);assert.equal(statusBody.accountDeletionEnabled,true);
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
  assert.ok(reserved.reserveMicrousd>0);assert.equal(settled.inputTokens,1200);assert.equal(settled.outputTokens,300);
 });
});
test('AI status indică indisponibilitatea când metering-ul persistent lipsește',async()=>{
 await withServer({env:baseEnv,fetchImpl:authFetch(),billingService:{configured:false}},async base=>{
  const response=await fetch(base+'/api/ai/status',{headers:{Authorization:'Bearer valid-token'}});
  const status=await response.json();assert.equal(status.configured,true);assert.equal(status.billingConfigured,false);assert.equal(status.aiAvailable,false);
 });
});
