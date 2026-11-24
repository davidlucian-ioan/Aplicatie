'use strict';
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {OpenAIProvider}=require('../collector-v11/ai/provider-openai');
const {safeContext}=require('../collector-v11/ai/context-sanitizer');
const {SupabaseBillingService}=require('./billing-service');

const MAX_BODY=128*1024;
const MAX_OUTPUT_TOKENS=1800;
function send(res,status,value,extra={}){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
 res.end(JSON.stringify(value));
}
function monthWindow(now){
 const date=new Date(now),start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));
 const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
 return {periodStart:start.toISOString().slice(0,10),periodEnd:end.toISOString().slice(0,10)};
}
function positiveNumber(value,fallback){const n=Number(value);return Number.isFinite(n)&&n>0?n:fallback}
function createCloudServer({env=process.env,fetchImpl=global.fetch,providerFactory=()=>new OpenAIProvider(),billingService=null,now=()=>Date.now()}={}){
 const hits=new Map();
 const billing=billingService||new SupabaseBillingService({supabaseUrl:env.SUPABASE_URL,serviceRoleKey:env.SUPABASE_SERVICE_ROLE_KEY,fetchImpl});
 const allowedOrigins=new Set(String(env.COLLECTOR_ALLOWED_ORIGINS||'capacitor://localhost,https://localhost,http://localhost').split(',').map(x=>x.trim()).filter(Boolean));
 function cors(req,res){
  const origin=req.headers.origin;
  if(origin&&!allowedOrigins.has(origin))return false;
  if(origin){
   res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
   res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Accept');
   res.setHeader('Access-Control-Max-Age','600');
  }
  return true;
 }
 async function authenticate(req){
  const token=String(req.headers.authorization||'').match(/^Bearer\\s+(.+)$/i)?.[1];
  if(!token)throw Object.assign(new Error('Autentificarea este necesară.'),{status:401});
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)throw Object.assign(new Error('Autentificarea cloud nu este configurată.'),{status:503});
  let response;
  try{response=await fetchImpl(env.SUPABASE_URL.replace(/\/+$/,'')+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token,Accept:'application/json'}})}
  catch{throw Object.assign(new Error('Serviciul de autentificare nu este disponibil.'),{status:503})}
  if(!response.ok)throw Object.assign(new Error('Sesiunea nu este validă sau a expirat.'),{status:401});
  const user=await response.json();
  if(!user?.id)throw Object.assign(new Error('Sesiunea nu conține un utilizator valid.'),{status:401});
  return String(user.id);
 }
 function rateLimit(userId){
  const timestamp=now(),windowMs=60_000,state=hits.get(userId);
  if(!state||timestamp-state.start>=windowMs){hits.set(userId,{start:timestamp,count:1});return true}
  state.count+=1;return state.count<=20;
 }
 function readJson(req){
  return new Promise((resolve,reject)=>{
   let size=0,tooLarge=false;const chunks=[];
   req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){tooLarge=true;return}chunks.push(chunk)});
   req.on('end',()=>{if(tooLarge){reject(Object.assign(new Error('Cererea este prea mare.'),{status:413}));return}
    try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Object.assign(new Error('JSON invalid.'),{status:400}))}});
   req.on('error',reject);
  });
 }
 function rates(){
  return {input:positiveNumber(env.OPENAI_INPUT_USD_PER_MILLION,2),output:positiveNumber(env.OPENAI_OUTPUT_USD_PER_MILLION,10)};
 }
 function costMicrousd(inputTokens,outputTokens){
  const rate=rates();return Math.ceil(inputTokens*rate.input+outputTokens*rate.output);
 }
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://collector-api.local');
  if(!cors(req,res)){send(res,403,{error:'Origine nepermisă.'});return}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Cache-Control':'no-store'}).end();return}
  if(req.method==='GET'&&url.pathname==='/health'){send(res,200,{ok:true,service:'collector-api'});return}
  if(!['GET','POST','DELETE'].includes(req.method)||!['/api/ai/status','/api/ai/interpret','/api/account'].includes(url.pathname)){send(res,404,{error:'Endpoint inexistent.'});return}
  try{
   const userId=await authenticate(req);
   if(!rateLimit(userId)){send(res,429,{error:'Ai atins limita temporară de cereri. Încearcă din nou peste un minut.'});return}
   if(req.method==='DELETE'&&url.pathname==='/api/account'){
    if(!env.SUPABASE_SERVICE_ROLE_KEY){send(res,503,{error:'Ștergerea contului cloud nu este configurată pe server.'});return}
    let deleted;
    try{deleted=await fetchImpl(env.SUPABASE_URL.replace(/\\/+$/,'')+'/auth/v1/admin/users/'+encodeURIComponent(userId),{method:'DELETE',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,Accept:'application/json'}})}
    catch{send(res,502,{error:'Nu am putut contacta serviciul de ștergere a contului.'});return}
    if(!deleted.ok){send(res,502,{error:'Serviciul cloud nu a putut șterge contul.'});return}
    res.writeHead(204,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end();return;
   }
   if(req.method==='GET'&&url.pathname==='/api/ai/status'){
    const configured=Boolean(env.OPENAI_API_KEY);
    const billingConfigured=Boolean(billing.configured);
    send(res,200,{provider:'openai',configured,aiAvailable:configured&&billingConfigured, billingConfigured,
      accountDeletionEnabled:Boolean(env.SUPABASE_SERVICE_ROLE_KEY),model:env.OPENAI_MODEL||'gpt-6.2-sol'});return;
   }
   if(req.method!=='POST'){send(res,405,{error:'Metodă nepermisă.'});return}
   if(!String(req.headers['content-type']||'').toLowerCase().includes('application/json')){send(res,415,{error:'Content-Type trebuie să fie application/json.'});return}
   const body=await readJson(req);
   if(typeof body.text!=='string'||!body.text.trim()||body.text.length>8000){send(res,400,{error:'Textul trebuie să aibă între 1 și 8000 de caractere.'});return}
   if(!env.OPENAI_API_KEY){send(res,503,{error:'Providerul OpenAI nu este configurat pe server.'});return}
   if(!billing.configured){send(res,503,{error:'Verificarea abonamentului și bugetului AI nu este configurată.'});return}

   const context=safeContext(body.context||{});
   const inputEstimate=Math.max(1,Math.ceil((body.text.length+JSON.stringify(context).length)/4));
   const reserveMicrousd=costMicrousd(inputEstimate,MAX_OUTPUT_TOKENS);
   const budgetMicrousd=Math.floor(positiveNumber(env.AI_MONTHLY_BUDGET_USD,1)*1_000_000);
   const {periodStart,periodEnd}=monthWindow(now());
   const requestId=randomUUID();
   const reservation=await billing.reserve({userId,requestId,periodStart,periodEnd,budgetMicrousd,reserveMicrousd});
   if(!reservation?.allowed){
    const reason=reservation?.reason;
    if(reason==='subscription_required'){send(res,403,{error:'Collector Pro este necesar pentru interpretarea AI.',code:'subscription_required'});return}
    if(reason==='monthly_budget_exceeded'){send(res,429,{error:'Ai atins bugetul AI inclus în abonament pentru această lună.',code:'monthly_budget_exceeded'});return}
    send(res,409,{error:'Cererea AI nu a putut fi rezervată în siguranță.',code:reason||'reservation_rejected'});return;
   }
   const provider=await providerFactory();
   try{
    const interpretation=await provider.interpret({text:body.text,context});
    const usage=interpretation?.usage||{};
    const inputTokens=Number.isInteger(usage.inputTokens)&&usage.inputTokens>0?usage.inputTokens:inputEstimate;
    const outputTokens=Number.isInteger(usage.outputTokens)&&usage.outputTokens>0?usage.outputTokens:MAX_OUTPUT_TOKENS;
    const actualMicrousd=costMicrousd(inputTokens,outputTokens);
    const settled=await billing.settle({userId,requestId,actualMicrousd,inputTokens,outputTokens,
      model:provider.model||env.OPENAI_MODEL||'gpt-6.2-sol'});
    send(res,200,{provider:'openai',model:provider.model||env.OPENAI_MODEL||'gpt-6.2-sol',
      interpretation,usage:{inputTokens,outputTokens,estimatedCostUsd:actualMicrousd/1_000_000,
      monthlyBudgetUsd:budgetMicrousd/1_000_000,usedUsd:Number(settled?.used_microusd||0)/1_000_000}});
   }catch(error){
    try{await billing.settle({userId,requestId,actualMicrousd:0,inputTokens:0,outputTokens:0,
      model:provider.model||env.OPENAI_MODEL||'gpt-6.2-sol',failed:true})}catch{}
    throw error;
   }
  }catch(error){
   const status=Number(error?.status)||502;
   send(res,status,{error:status>=500?'Serviciul Collector AI nu a putut procesa cererea. Încearcă din nou mai târziu.':error.message});
  }
 });
 return server;
}
if(require.main===module){
 const server=createCloudServer();
 const port=Number(process.env.PORT||8080);
 server.listen(port,'0.0.0.0',()=>process.stdout.write('Collector cloud API listening on '+port+'\\n'));
}
module.exports={createCloudServer,MAX_BODY,monthWindow};
