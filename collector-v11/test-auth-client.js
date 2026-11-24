'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('./auth-client');

const root=globalThis;
const previous={config:root.CollectorConfig,bundle:root.CollectorAuthBundle,localStorage:root.localStorage,fetch:root.fetch};
let values=new Map(),created=0,signedOut=0;
function setup(){
 values=new Map();created=0;signedOut=0;
 root.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 root.CollectorConfig={supabaseUrl:'https://project.supabase.co',supabaseAnonKey:'anon-public',apiBaseUrl:'https://api.example.test'};
 root.CollectorAuthBundle={createClient:()=>{created++;let session=null;return {auth:{
  async getSession(){return {data:{session},error:null}},
  async signInAnonymously(){session={access_token:'access-token',user:{id:'user-1',is_anonymous:true}};return {data:{session},error:null}},
  async getUser(){return {data:{user:{id:'user-1'}},error:null}},
  async signOut(){signedOut++;session=null;return {error:null}}
 }}}};
}
test.afterEach(()=>{
 for(const [key,value] of Object.entries({CollectorConfig:previous.config,CollectorAuthBundle:previous.bundle,localStorage:previous.localStorage,fetch:previous.fetch})){
  if(value===undefined)delete root[key];else root[key]=value;
 }
});
test('anonymous Supabase session is created and access token is exposed only on request',async()=>{
 setup();
 const result=await root.CollectorAuth.initialize(root.CollectorConfig);
 assert.equal(result.configured,true);assert.equal(result.userId,'user-1');assert.equal(result.isAnonymous,true);
 assert.equal(await root.CollectorAuth.getAccessToken(),'access-token');
});
test('cloud opt-out prevents a new anonymous account until explicit reactivation',async()=>{
 setup();values.set('collector_cloud_opt_out','1');
 const result=await root.CollectorAuth.initialize(root.CollectorConfig);
 assert.equal(result.optedOut,true);assert.equal(created,0);
 const enabled=await root.CollectorAuth.enableCloud();
 assert.equal(enabled.configured,true);assert.equal(created,1);assert.equal(root.CollectorAuth.isOptedOut(),false);
});
test('account deletion calls authenticated backend and persists opt-out',async()=>{
 setup();await root.CollectorAuth.initialize(root.CollectorConfig);
 let request=null;root.fetch=async(url,options)=>{request={url,options};return {ok:true,status:204}};
 assert.equal(await root.CollectorAuth.deleteAccount(),true);
 assert.equal(request.url,'https://api.example.test/api/account');
 assert.equal(request.options.method,'DELETE');assert.equal(request.options.headers.Authorization,'Bearer access-token');
 assert.equal(root.CollectorAuth.isOptedOut(),true);assert.equal(signedOut,1);
});
