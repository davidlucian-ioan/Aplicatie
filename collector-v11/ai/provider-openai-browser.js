(function(root){
  'use strict';
  async function status(){
    const response=await fetch('/api/ai/status',{headers:{Accept:'application/json'}});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Nu pot verifica providerul AI.');
    return body;
  }
  async function interpret(text,context){
    const response=await fetch('/api/ai/interpret',{
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
