(function(root){
  'use strict';
  function apiBase(){return String(root.CollectorConfig?.apiBaseUrl||'').trim().replace(/\/+$/,'')}
  function apiUrl(path){return apiBase()+path}
  function isNative(){return typeof root.Capacitor?.isNativePlatform==='function'&&root.Capacitor.isNativePlatform()}
  async function accessToken(){return await root.CollectorAuth?.getAccessToken?.()||null}
  async function authHeaders(){
    if(!isNative())return {};
    const token=await accessToken();
    return token?{Authorization:'Bearer '+token}:null;
  }
  async function status(){
    if(isNative()&&!apiBase())return {provider:'openai',configured:false,unavailable:true,model:null,error:'Backend-ul cloud Collector nu este încă configurat.'};
    const auth=await authHeaders();
    if(!auth)return {provider:'openai',configured:false,unauthenticated:true,model:null,error:'Autentificarea cloud nu este configurată.'};
    const response=await fetch(apiUrl('/api/ai/status'),{headers:{Accept:'application/json',...auth}});
    if(response.status===401&&isNative())return {provider:'openai',configured:false,unauthenticated:true,model:null};
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Nu pot verifica providerul AI.');
    return body;
  }
  async function interpret(text,context){
    if(isNative()&&!apiBase())throw new Error('AI cloud nu este configurat pentru această versiune a aplicației.');
    const auth=await authHeaders();
    if(!auth)throw new Error('Autentificarea cloud nu este configurată pentru această versiune.');
    const response=await fetch(apiUrl('/api/ai/interpret'),{
      method:'POST',
      headers:{'Content-Type':'application/json',Accept:'application/json',...auth},
      body:JSON.stringify({text,context})
    });
    const body=await response.json().catch(()=>({}));
    if(response.status===401&&isNative())throw new Error('Sesiunea cloud a expirat. Reconectează-te pentru a folosi AI.');
    if(!response.ok)throw new Error(body.error||'Cererea AI a eșuat.');
    return body;
  }
  root.CollectorOpenAIProvider={status,interpret};
})(typeof window!=='undefined'?window:globalThis);
