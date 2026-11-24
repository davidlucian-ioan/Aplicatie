'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SupabaseBillingService}=require('./billing-service');

test('Supabase billing RPC folosește service role numai server-side',async()=>{
 let call=null;
 const service=new SupabaseBillingService({supabaseUrl:'https://project.supabase.co/',serviceRoleKey:'server-secret',fetchImpl:async(url,options)=>{
  call={url,options};return {ok:true,json:async()=>({allowed:true})};
 }});
 const result=await service.reserve({userId:'user-uuid',requestId:'request-uuid',periodStart:'2026-11-01',periodEnd:'2026-12-01',budgetMicrousd:1000000,reserveMicrousd:20000});
 assert.equal(result.allowed,true);
 assert.equal(call.url,'https://project.supabase.co/rest/v1/rpc/collector_reserve_ai_usage');
 assert.equal(call.options.headers.apikey,'server-secret');
 assert.equal(call.options.headers.Authorization,'Bearer server-secret');
 assert.equal(JSON.parse(call.options.body).p_reserve_microusd,20000);
});
test('entitlement lookup is scoped to the authenticated user',async()=>{
 let url='';
 const service=new SupabaseBillingService({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'secret',fetchImpl:async(value,options)=>{
  url=value;assert.equal(options.headers.Authorization,'Bearer secret');
  return {ok:true,json:async()=>[{entitlement:'pro',is_active:true}]};
 }});
 const result=await service.getEntitlement('user-uuid');
 assert.equal(result.entitlement,'pro');
 assert.match(url,/user_id=eq\.user-uuid/);
});
test('billing service fails closed without server-side service role key',async()=>{
 const service=new SupabaseBillingService({supabaseUrl:'https://project.supabase.co',serviceRoleKey:''});
 assert.equal(service.configured,false);
 await assert.rejects(()=>service.reserve({userId:'u',periodStart:'2026-11-01',periodEnd:'2026-12-01',budgetMicrousd:1,reserveMicrousd:1}),{status:503});
});
