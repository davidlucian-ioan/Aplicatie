'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('./ai/provider-openai-browser');

const root=globalThis.window||globalThis;
const previous={config:root.CollectorConfig,capacitor:root.Capacitor,auth:root.CollectorAuth,fetch:globalThis.fetch};
test.afterEach(()=>{
 if(previous.config===undefined)delete root.CollectorConfig;else root.CollectorConfig=previous.config;
 if(previous.capacitor===undefined)delete root.Capacitor;else root.Capacitor=previous.capacitor;
 if(previous.auth===undefined)delete root.CollectorAuth;else root.CollectorAuth=previous.auth;
 globalThis.fetch=previous.fetch;
});
test('native app fără endpoint cloud dezactivează AI fără cerere relativă invalidă',async()=>{
 root.Capacitor={isNativePlatform:()=>true};
 root.CollectorConfig={apiBaseUrl:''};
 let called=false;globalThis.fetch=async()=>{called=true;throw new Error('unexpected fetch')};
 const result=await root.CollectorOpenAIProvider.status();
 assert.equal(result.configured,false);assert.equal(result.unavailable,true);assert.equal(called,false);
 await assert.rejects(root.CollectorOpenAIProvider.interpret('test',{}),/AI cloud nu este configurat/);
});
test('native app cu endpoint dar fără token rămâne blocată până la autentificare',async()=>{
 root.Capacitor={isNativePlatform:()=>true};
 root.CollectorConfig={apiBaseUrl:'https://api.example.test'};
 let called=false;globalThis.fetch=async()=>{called=true;throw new Error('unexpected fetch')};
 const result=await root.CollectorOpenAIProvider.status();
 assert.equal(result.unauthenticated,true);assert.equal(called,false);
 await assert.rejects(root.CollectorOpenAIProvider.interpret('test',{}),/Autentificarea cloud nu este configurată/);
});
test('native app folosește endpoint HTTPS configurat și normalizează slash-ul final',async()=>{
 root.Capacitor={isNativePlatform:()=>true};
 root.CollectorConfig={apiBaseUrl:'https://api.example.test/'};
 root.CollectorAuth={getAccessToken:async()=> 'test-access-token'};
 let requested='',headers=null;
 globalThis.fetch=async(url,options)=>{requested=url;headers=options.headers;return {ok:true,json:async()=>({provider:'openai',configured:true,model:'test-model'})}};
 const result=await root.CollectorOpenAIProvider.status();
 assert.equal(requested,'https://api.example.test/api/ai/status');assert.equal(result.configured,true);assert.equal(headers.Authorization,'Bearer test-access-token');
});
test('interpretarea trimite text și context către backend-ul configurat',async()=>{
 root.Capacitor={isNativePlatform:()=>true};
 root.CollectorConfig={apiBaseUrl:'https://api.example.test'};
 globalThis.CollectorAuth={getAccessToken:async()=> 'test-access-token'};
 let requested='',payload=null,headers=null;
 globalThis.fetch=async(url,options)=>{requested=url;headers=options.headers;payload=JSON.parse(options.body);return {ok:true,json:async()=>({interpretation:{kind:'answer'}})}};
 const result=await root.CollectorOpenAIProvider.interpret('Notează pH 6.2',{entities:[]});
 assert.equal(requested,'https://api.example.test/api/ai/interpret');
 assert.equal(payload.text,'Notează pH 6.2');assert.deepEqual(payload.context,{entities:[]});assert.equal(headers.Authorization,'Bearer test-access-token');
 assert.equal(result.interpretation.kind,'answer');
});
test('browser local păstrează endpoint-urile relative pentru serverul de dezvoltare',async()=>{
 delete root.Capacitor;root.CollectorConfig={apiBaseUrl:''};
 let requested='';globalThis.fetch=async(url)=>{requested=url;return {ok:true,json:async()=>({configured:false})}};
 await root.CollectorOpenAIProvider.status();
 assert.equal(requested,'/api/ai/status');
});
