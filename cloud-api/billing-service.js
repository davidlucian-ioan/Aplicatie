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
