(function(root){
 'use strict';
 let client=null,initialization=null,configured=false,lastError=null;
 async function initialize(config={}){
  if(!config.supabaseUrl||!config.supabaseAnonKey||!root.CollectorAuthBundle?.createClient){configured=false;return {configured:false}}
  if(initialization)return initialization;
  initialization=(async()=>{
   try{
    client=root.CollectorAuthBundle.createClient(config);
    const current=await client.auth.getSession();
    if(current.error)throw current.error;
    if(!current.data.session){
     const created=await client.auth.signInAnonymously();
     if(created.error)throw created.error;
    }
    configured=true;lastError=null;
    const session=(await client.auth.getSession()).data.session;
    return {configured:true,userId:session?.user?.id||null,isAnonymous:!!session?.user?.is_anonymous};
   }catch(error){client=null;configured=false;lastError=String(error?.message||error);return {configured:false,error:lastError}}
   finally{initialization=null}
  })();
  return initialization;
 }
 async function getAccessToken(){
  if(!client||!configured)return null;
  try{
   let result=await client.auth.getSession();
   if(result.error)throw result.error;
   if(!result.data.session){
    result=await client.auth.signInAnonymously();
    if(result.error)throw result.error;
    return result.data.session?.access_token||null;
   }
   return result.data.session.access_token||null;
  }catch(error){lastError=String(error?.message||error);return null}
 }
 async function getUser(){
  if(!client||!configured)return null;
  const result=await client.auth.getUser();
  if(result.error)throw result.error;
  return result.data.user||null;
 }
 async function deleteAccount(){
  if(!client||!configured)throw new Error('Nu există un cont cloud activ.');
  const token=await getAccessToken(),base=String(root.CollectorConfig?.apiBaseUrl||'').replace(/\/+$/,'');
  if(!base||!token)throw new Error('Backend-ul cloud sau sesiunea nu este disponibilă.');
  const response=await fetch(base+'/api/account',{method:'DELETE',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Nu am putut șterge contul cloud.')}
  await signOut();client=null;return true;
 }
 async function signOut(){
  if(!client)return true;
  const result=await client.auth.signOut({scope:'local'});
  if(result.error)throw result.error;
  configured=false;return true;
 }
 root.CollectorAuth=Object.freeze({initialize,getAccessToken,getUser,deleteAccount,signOut,isConfigured:()=>configured,getLastError:()=>lastError});
})(typeof window!=='undefined'?window:globalThis);
