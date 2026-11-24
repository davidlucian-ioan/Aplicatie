'use strict';
const {randomUUID}=require('node:crypto');

class SupabaseBillingService {
  constructor({supabaseUrl,serviceRoleKey,fetchImpl=global.fetch}={}){
    this.url=String(supabaseUrl||'').replace(/\/+$/,'');
    this.key=String(serviceRoleKey||'');
    this.fetch=fetchImpl;
  }
  get configured(){return Boolean(this.url&&this.key&&typeof this.fetch==='function')}
  async rpc(name,args){
    if(!this.configured)throw Object.assign(new Error('Serviciul de abonamente și buget AI nu este configurat.'),{status:503});
    let response;
    try{
      response=await this.fetch(this.url+'/rest/v1/rpc/'+name,{
        method:'POST',
        headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify(args)
      });
    }catch{throw Object.assign(new Error('Serviciul de buget Collector nu este disponibil.'),{status:503})}
    const body=await response.json().catch(()=>null);
    if(!response.ok)throw Object.assign(new Error('Nu am putut actualiza bugetul AI.'),{status:503});
    return body;
  }
  async getEntitlement(userId){
    if(!this.configured)throw Object.assign(new Error('Serviciul de abonamente nu este configurat.'),{status:503});
    let response;
    try{
      response=await this.fetch(this.url+'/rest/v1/collector_entitlements?select=entitlement,is_active,expires_at,product_id&user_id=eq.'+encodeURIComponent(userId)+'&limit=1',{
        headers:{apikey:this.key,Authorization:'Bearer '+this.key,Accept:'application/json'}
      });
    }catch{throw Object.assign(new Error('Serviciul de abonamente nu este disponibil.'),{status:503})}
    if(!response.ok)throw Object.assign(new Error('Nu am putut verifica abonamentul.'),{status:503});
    const rows=await response.json();
    return Array.isArray(rows)?rows[0]||null:null;
  }
  async getUsage(userId,periodStart){
    if(!this.configured)throw Object.assign(new Error('Serviciul de buget nu este configurat.'),{status:503});
    let response;
    try{
      response=await this.fetch(this.url+'/rest/v1/collector_ai_budgets?select=budget_microusd,used_microusd,reserved_microusd,period_end&user_id=eq.'+encodeURIComponent(userId)+'&period_start=eq.'+encodeURIComponent(periodStart)+'&limit=1',{
        headers:{apikey:this.key,Authorization:'Bearer '+this.key,Accept:'application/json'}
      });
    }catch{throw Object.assign(new Error('Serviciul de buget nu este disponibil.'),{status:503})}
    if(!response.ok)throw Object.assign(new Error('Nu am putut verifica utilizarea AI.'),{status:503});
    const rows=await response.json();return Array.isArray(rows)?rows[0]||null:null;
  }
  async applyRevenueCatEvent({eventId,userId,eventType,productId,store,expiresAt,eventTimestamp,isProProduct}){
    return this.rpc('collector_apply_revenuecat_event',{
      p_event_id:eventId,p_user_id:userId,p_event_type:eventType,p_product_id:productId,
      p_store:store,p_expires_at:expiresAt,p_event_timestamp:eventTimestamp,p_is_pro_product:isProProduct
    });
  }
  async reserve({userId,requestId=randomUUID(),periodStart,periodEnd,budgetMicrousd,reserveMicrousd}){
    const result=await this.rpc('collector_reserve_ai_usage',{
      p_user_id:userId,p_request_id:requestId,p_period_start:periodStart,p_period_end:periodEnd,
      p_budget_microusd:budgetMicrousd,p_reserve_microusd:reserveMicrousd
    });
    return {requestId,...(result||{})};
  }
  async settle({userId,requestId,actualMicrousd,inputTokens,outputTokens,model,failed=false}){
    return this.rpc('collector_settle_ai_usage',{
      p_user_id:userId,p_request_id:requestId,p_actual_microusd:actualMicrousd,
      p_input_tokens:inputTokens,p_output_tokens:outputTokens,p_model:model,p_failed:failed
    });
  }
}
module.exports={SupabaseBillingService};
