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
  async getEntitlement(userId){\n    if(!this.configured)throw Object.assign(new Error('Serviciul de abonamente nu este configurat.'),{status:503});\n    const response=await this.fetch(this.url+'/rest/v1/collector_entitlements?select=entitlement,is_active,expires_at,product_id&user_id=eq.'+encodeURIComponent(userId)+'&limit=1',{\n      headers:{apikey:this.key,Authorization:'Bearer '+this.key,Accept:'application/json'}\n    });\n    if(!response.ok)throw Object.assign(new Error('Nu am putut verifica abonamentul.'),{status:503});\n    const rows=await response.json();return Array.isArray(rows)?rows[0]||null:null;\n  }\n  async applyRevenueCatEvent({eventId,userId,eventType,productId,store,expiresAt,isProProduct}){\n    return this.rpc('collector_apply_revenuecat_event',{p_event_id:eventId,p_user_id:userId,p_event_type:eventType,\n      p_product_id:productId,p_store:store,p_expires_at:expiresAt,p_is_pro_product:isProProduct});\n  }\n  async reserve({userId,requestId=randomUUID(),periodStart,periodEnd,budgetMicrousd,reserveMicrousd}){
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
