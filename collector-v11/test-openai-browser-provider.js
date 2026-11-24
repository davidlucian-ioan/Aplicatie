'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('./ai/provider-openai-browser');

const previous={config:globalThis.CollectorConfig,capacitor:globalThis.Capacitor,fetch:globalThis.fetch};
test.afterEach(()=>{
 if(previous.config===undefined)delete globalThis.CollectorConfig;else globalThis.CollectorConfig=previous.config;
 if(previous.capacitor===undefined)delete globalThis.Capacitor;else globalThis.Capacitor=previous.capacitor;
 globalThis.fetch=previous.fetch;
});
test('native app fără endpoint cloud dezactivează AI fără cerere relativă invalidă',async()=>{
 globalThis.Capacitor={isNativePlatform:()=>true};
 globalThis.CollectorConfig={apiBaseUrl:''};
 let called=false;globalThis.fetch=async()=>{called=true;throw new Error('unexpected fetch')};
 const result=await globalThis.CollectorOpenAIProvider.status();
 assert.equal(result.configured,false);assert.equal(result.unavailable,true);assert.equal(called,false);
 await assert.rejects(globalThis.CollectorOpenAIProvider.interpret('test',{}),/AI cloud nu este configurat/);
});
test('native app folosește endpoint HTTPS configurat și normalizează slash-ul final',async()=>{
 globalThis.Capacitor={isNativePlatform:()=>true};
 globalThis.CollectorConfig={apiBaseUrl:'https://api.example.test/'};
 let requested='';
 globalThis.fetch=async(url)=>{requested=url;return {ok:true,json:async()=>({provider:'openai',configured:true,model:'test-model'})}};
 const result=await globalThis.CollectorOpenAIProvider.status();
 assert.equal(requested,'https://api.example.test/api/ai/status');assert.equal(result.configured,true);
});
test('interpretarea trimite text și context către backend-ul configurat',async()=>{
 globalThis.Capacitor={isNativePlatform:()=>true};
 globalThis.CollectorConfig={apiBaseUrl:'https://api.example.test'};
 let requested='',payload=null;
 globalThis.fetch=async(url,options)=>{requested=url;payload=JSON.parse(options.body);return {ok:true,json:async()=>({interpretation:{kind:'answer'}})}};
 const result=await globalThis.CollectorOpenAIProvider.interpret('Notează pH 6.2',{entities:[]});
 assert.equal(requested,'https://api.example.test/api/ai/interpret');
 assert.equal(payload.text,'Notează pH 6.2');assert.deepEqual(payload.context,{entities:[]});
 assert.equal(result.interpretation.kind,'answer');
});
test('browser local păstrează endpoint-urile relative pentru serverul de dezvoltare',async()=>{
 delete globalThis.Capacitor;globalThis.CollectorConfig={apiBaseUrl:''};
 let requested='';globalThis.fetch=async(url)=>{requested=url;return {ok:true,json:async()=>({configured:false})}};
 await globalThis.CollectorOpenAIProvider.status();
 assert.equal(requested,'/api/ai/status');
});
