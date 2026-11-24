(function(root){
  'use strict';
  function apiBase(){return String(root.CollectorConfig?.apiBaseUrl||'').trim().replace(/\/+$/,'')}
  function apiUrl(path){return apiBase()+path}
  function isNative(){return typeof root.Capacitor?.isNativePlatform==='function'&&root.Capacitor.isNativePlatform()}
  async function status(){
    if(isNative()&&!apiBase())return {provider:'openai',configured:false,unavailable:true,model:null,error:'Backend-ul cloud Collector nu este încă configurat.'};
    const response=await fetch(apiUrl('/api/ai/status'),{headers:{Accept:'application/json'}});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Nu pot verifica providerul AI.');
    return body;
  }
  async function interpret(text,context){
    if(isNative()&&!apiBase())throw new Error('AI cloud nu este configurat pentru această versiune a aplicației.');
    const response=await fetch(apiUrl('/api/ai/interpret'),{
      method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({text,context})
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||'Cererea AI a eșuat.');
    return body;
  }
  root.CollectorOpenAIProvider={status,interpret};
})(typeof window!=='undefined'?window:globalThis);
