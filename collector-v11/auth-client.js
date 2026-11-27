(function(root){
 'use strict';
 let client=null,initialization=null,configured=false,lastError=null;
 function isOptedOut(){try{return root.localStorage?.getItem('collector_cloud_opt_out')==='1'}catch{return false}}
 async function initialize(config={}){
  if(isOptedOut()){configured=false;return {configured:false,optedOut:true}}
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
 async function linkEmailPassword(email,password){
  if(!client||!configured)throw new Error('Activează mai întâi contul cloud.');
  const result=await client.auth.updateUser({email:String(email||'').trim(),password:String(password||'')});
  if(result.error)throw result.error;
  return {userId:result.data.user?.id||null,email:result.data.user?.email||null,isAnonymous:!!result.data.user?.is_anonymous,emailConfirmedAt:result.data.user?.email_confirmed_at||null};
 }
 async function signInWithPassword(email,password){
  if(!client||!configured){
   const initialized=await initialize(root.CollectorConfig||{});
   if(!initialized.configured)throw new Error(initialized.error||'Serviciile cloud nu sunt configurate.');
  }
  const result=await client.auth.signInWithPassword({email:String(email||'').trim(),password:String(password||'')});
  if(result.error)throw result.error;
  configured=true;lastError=null;
  return {userId:result.data.user?.id||null,email:result.data.user?.email||null,isAnonymous:!!result.data.user?.is_anonymous};
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
  try{root.localStorage?.setItem('collector_cloud_opt_out','1')}catch{}
  await signOut();client=null;return true;
 }
 async function enableCloud(){try{root.localStorage?.removeItem('collector_cloud_opt_out')}catch{}return initialize(root.CollectorConfig||{})}
 async function signOut(){
  if(!client)return true;
  const result=await client.auth.signOut({scope:'local'});
  if(result.error)throw result.error;
  configured=false;return true;
 }
 root.CollectorAuth=Object.freeze({initialize,getAccessToken,getUser,linkEmailPassword,signInWithPassword,deleteAccount,enableCloud,signOut,isConfigured:()=>configured,isOptedOut,getLastError:()=>lastError});
})(typeof window!=='undefined'?window:globalThis);
