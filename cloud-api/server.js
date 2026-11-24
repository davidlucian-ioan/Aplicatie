'use strict';
const http=require('node:http');
const {OpenAIProvider}=require('../collector-v11/ai/provider-openai');
const {safeContext}=require('../collector-v11/ai/context-sanitizer');

const MAX_BODY=128*1024;
function send(res,status,value,extra={}){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
 res.end(JSON.stringify(value));
}
function createCloudServer({env=process.env,fetchImpl=global.fetch,providerFactory=()=>new OpenAIProvider(),now=()=>Date.now()}={}){
 const hits=new Map();
 const allowedOrigins=new Set(String(env.COLLECTOR_ALLOWED_ORIGINS||'capacitor://localhost,https://localhost,http://localhost').split(',').map(x=>x.trim()).filter(Boolean));
 function cors(req,res){
  const origin=req.headers.origin;
  if(origin&&!allowedOrigins.has(origin))return false;
  if(origin){
   res.setHeader('Access-Control-Allow-Origin',origin);
   res.setHeader('Vary','Origin');
   res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Accept');
   res.setHeader('Access-Control-Max-Age','600');
  }
  return true;
 }
 async function authenticate(req){
  const token=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)throw Object.assign(new Error('Autentificarea este necesară.'),{status:401});
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)throw Object.assign(new Error('Autentificarea cloud nu este configurată.'),{status:503});
  let response;
  try{
   response=await fetchImpl(env.SUPABASE_URL.replace(/\/+$/,'')+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token,Accept:'application/json'}});
  }catch{throw Object.assign(new Error('Serviciul de autentificare nu este disponibil.'),{status:503})}
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
   req.on('end',()=>{
    if(tooLarge){reject(Object.assign(new Error('Cererea este prea mare.'),{status:413}));return}
    try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}
    catch{reject(Object.assign(new Error('JSON invalid.'),{status:400}))}
   });
   req.on('error',reject);
  });
 }
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://collector-api.local');
  if(!cors(req,res)){send(res,403,{error:'Origine nepermisă.'});return}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Cache-Control':'no-store'}).end();return}
  if(req.method==='GET'&&url.pathname==='/health'){send(res,200,{ok:true,service:'collector-api'});return}
  if(!['GET','POST'].includes(req.method)||!['/api/ai/status','/api/ai/interpret'].includes(url.pathname)){send(res,404,{error:'Endpoint inexistent.'});return}
  try{
   const userId=await authenticate(req);
   if(!rateLimit(userId)){send(res,429,{error:'Ai atins limita temporară de cereri. Încearcă din nou peste un minut.'});return}
   if(req.method==='GET'&&url.pathname==='/api/ai/status'){
    send(res,200,{provider:'openai',configured:Boolean(env.OPENAI_API_KEY),model:env.OPENAI_MODEL||'gpt-6.2-sol'});return;
   }
   if(req.method!=='POST'){send(res,405,{error:'Metodă nepermisă.'});return}
   if(!String(req.headers['content-type']||'').toLowerCase().includes('application/json')){send(res,415,{error:'Content-Type trebuie să fie application/json.'});return}
   const body=await readJson(req);
   if(typeof body.text!=='string'||!body.text.trim()||body.text.length>8000){send(res,400,{error:'Textul trebuie să aibă între 1 și 8000 de caractere.'});return}
   if(!env.OPENAI_API_KEY){send(res,503,{error:'Providerul OpenAI nu este configurat pe server.'});return}
   const provider=await providerFactory();
   const interpretation=await provider.interpret({text:body.text,context:safeContext(body.context||{})});
   send(res,200,{provider:'openai',model:provider.model||env.OPENAI_MODEL||'gpt-6.2-sol',interpretation});
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
 server.listen(port,'0.0.0.0',()=>process.stdout.write('Collector cloud API listening on '+port+'\n'));
}
module.exports={createCloudServer,MAX_BODY};
