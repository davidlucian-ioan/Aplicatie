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

test('stale reservations are charged conservatively instead of being released unmetered',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'migrations','001_billing_and_ai_usage.sql'),'utf8');
 assert.match(sql,/actual_microusd\s*=\s*reserved_microusd/);
 assert.match(sql,/used_microusd\s*=\s*used_microusd\s*\+\s*v_stale_reserved/);
 assert.match(sql,/created_at\s*<\s*now\(\)\s*-\s*interval\s+'10 minutes'/);
});

test('RevenueCat SUBSCRIPTION_PAUSED preserves Pro until expiration',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'migrations','001_billing_and_ai_usage.sql'),'utf8');
 assert.match(sql,/p_event_type in \('CANCELLATION','BILLING_ISSUE','SUBSCRIPTION_PAUSED'\)[\s\S]{0,220}v_active := p_expires_at is not null and p_expires_at > now\(\)/);
 assert.match(sql,/p_event_type in \('EXPIRATION','REFUND'\)[\s\S]{0,60}v_active := false/);
});

test('RevenueCat CUSTOMER_SUPPORT refund revokes entitlement immediately',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'migrations','001_billing_and_ai_usage.sql'),'utf8');
 assert.match(sql,/p_event_type = 'CANCELLATION' and p_cancel_reason = 'CUSTOMER_SUPPORT'[\s\S]{0,140}v_active := false/);
 assert.match(sql,/p_cancel_reason text/);
 assert.match(sql,/collector_apply_revenuecat_event\(text,uuid,text,text,text,timestamptz,timestamptz,boolean,text\)/);
});

test('RevenueCat RPC forwards cancellation reason for refund handling',async()=>{
 let call=null;
 const service=new SupabaseBillingService({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'secret',fetchImpl:async(url,options)=>{
  call={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({processed:true,active:false})};
 }});
 await service.applyRevenueCatEvent({eventId:'evt-refund',userId:'user-uuid',eventType:'CANCELLATION',
  productId:'collector_pro_monthly',cancelReason:'CUSTOMER_SUPPORT',store:'play_store',
  expiresAt:'2030-01-01T00:00:00.000Z',eventTimestamp:'2026-11-25T00:00:00.000Z',isProProduct:true});
 assert.equal(call.url,'https://project.supabase.co/rest/v1/rpc/collector_apply_revenuecat_event');
 assert.equal(call.body.p_cancel_reason,'CUSTOMER_SUPPORT');
});

test('billing migration uses valid PL/pgSQL dollar-quote delimiters',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'migrations','001_billing_and_ai_usage.sql'),'utf8');
 assert.doesNotMatch(sql,/as \$(?!\$)/i);
 assert.equal((sql.match(/as \$\$/g)||[]).length,(sql.match(/^\$\$;$/gm)||[]).length);
});

test('RevenueCat webhook ledger is idempotent and ignores stale events',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'migrations','001_billing_and_ai_usage.sql'),'utf8');
 assert.match(sql,/insert into public\.collector_billing_events[\s\S]{0,350}on conflict\(event_id\) do nothing/i);
 assert.match(sql,/if not found then return jsonb_build_object\('processed',true,'duplicate',true\)/i);
 assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(p_user_id::text,0\)\)/i);
 assert.match(sql,/updated_at > coalesce\(p_event_timestamp,now\(\)\)/i);
});
test('RevenueCat billing RPC is executable only by service_role',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'migrations','001_billing_and_ai_usage.sql'),'utf8');
 assert.match(sql,/revoke all on function public\.collector_apply_revenuecat_event\([\s\S]{0,240}from public, anon, authenticated/i);
 assert.match(sql,/grant execute on function public\.collector_apply_revenuecat_event\([\s\S]{0,240}to service_role/i);
});
