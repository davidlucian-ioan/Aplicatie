'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('./subscriptions');

test('RevenueCat initialize uses platform public key and stable Collector user id',async()=>{
 let configured=null,loggedIn=null,purchased=null,restored=0;
 let info={entitlements:{active:{pro:{isActive:true,expirationDate:'2027-01-01T00:00:00Z'}}},managementURL:'https://store.example/manage'};
 globalThis.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android'};
 globalThis.CollectorConfig={revenueCatAppleApiKey:'appl_test',revenueCatGoogleApiKey:'goog_test'};
 globalThis.CollectorPurchasesBundle={
  async configure(value){configured=value},
  async logIn(value){loggedIn=value},
  async getCustomerInfo(){return {customerInfo:info}},
  async getOfferings(){return {current:{availablePackages:[{identifier:'monthly',product:{identifier:'collector.pro.monthly',title:'Collector Pro Monthly',priceString:'4,99 €'}}]}}},
  async purchasePackage(value){purchased=value;return {customerInfo:info}},
  async restorePurchases(){restored++;return {customerInfo:info}},
  async logOut(){return {}}
 };
 const status=await globalThis.CollectorSubscriptions.initialize('stable-supabase-user-id');
 assert.deepEqual(configured,{apiKey:'goog_test',appUserID:'stable-supabase-user-id'});
 assert.equal(status.isPro,true);
 const packages=await globalThis.CollectorSubscriptions.offerings();
 assert.equal(packages[0].priceString,'4,99 €');
 const bought=await globalThis.CollectorSubscriptions.purchase('monthly');
 assert.equal(bought.isPro,true);assert.equal(purchased.aPackage.identifier,'monthly');
 const restoredResult=await globalThis.CollectorSubscriptions.restore();
 assert.equal(restoredResult.isPro,true);assert.equal(restored,1);
 await globalThis.CollectorSubscriptions.initialize('another-stable-user-id');
 assert.deepEqual(loggedIn,{appUserID:'another-stable-user-id'});
});

test('concurrent account switches are serialized and the last requested user remains active',async()=>{
 const logins=[];
 globalThis.CollectorPurchasesBundle.logIn=async({appUserID})=>{
  await new Promise(resolve=>setTimeout(resolve,appUserID==='user-A'?15:0));
  logins.push(appUserID);
 };
 const [first,second]=await Promise.all([
  globalThis.CollectorSubscriptions.initialize('user-A'),
  globalThis.CollectorSubscriptions.initialize('user-B')
 ]);
 assert.equal(first.available,true);assert.equal(second.available,true);
 assert.deepEqual(logins,['user-A','user-B']);
});

test('purchase este serializat înaintea schimbării contului RevenueCat',async()=>{
 const events=[];
 globalThis.CollectorPurchasesBundle.getOfferings=async()=>({current:{availablePackages:[{identifier:'monthly',product:{identifier:'collector.pro.monthly'}}]}});
 globalThis.CollectorPurchasesBundle.purchasePackage=async()=>{
  events.push('purchase:start');
  await new Promise(resolve=>setTimeout(resolve,20));
  events.push('purchase:end');
  return {customerInfo:{entitlements:{active:{pro:{isActive:true}}}}};
 };
 globalThis.CollectorPurchasesBundle.logIn=async({appUserID})=>{events.push('login:'+appUserID)};
 await globalThis.CollectorSubscriptions.initialize('purchase-user-A');
 events.length=0;
 const purchase=globalThis.CollectorSubscriptions.purchase('monthly');
 const switchUser=globalThis.CollectorSubscriptions.initialize('purchase-user-B');
 await Promise.all([purchase,switchUser]);
 assert.deepEqual(events,['purchase:start','purchase:end','login:purchase-user-B']);
});

test('restore este serializat înaintea schimbării contului RevenueCat',async()=>{
 const events=[];
 globalThis.CollectorPurchasesBundle.restorePurchases=async()=>{
  events.push('restore:start');
  await new Promise(resolve=>setTimeout(resolve,20));
  events.push('restore:end');
  return {customerInfo:{entitlements:{active:{pro:{isActive:true}}}}};
 };
 globalThis.CollectorPurchasesBundle.logIn=async({appUserID})=>{events.push('login:'+appUserID)};
 await globalThis.CollectorSubscriptions.initialize('restore-user-A');
 events.length=0;
 const restore=globalThis.CollectorSubscriptions.restore();
 const switchUser=globalThis.CollectorSubscriptions.initialize('restore-user-B');
 await Promise.all([restore,switchUser]);
 assert.deepEqual(events,['restore:start','restore:end','login:restore-user-B']);
});


test('trial entitlement is exposed distinctly from paid Pro',async()=>{
 globalThis.CollectorPurchasesBundle.getCustomerInfo=async()=>({customerInfo:{entitlements:{active:{pro:{isActive:true,periodType:'TRIAL',expirationDate:'2026-12-26T00:00:00Z',willRenew:true}}}}});
 const state=await globalThis.CollectorSubscriptions.refresh();
 assert.equal(state.isPro,true);assert.equal(state.isTrial,true);assert.equal(state.periodType,'TRIAL');
 assert.equal(state.expiresAt,'2026-12-26T00:00:00Z');
});

test('paid Pro entitlement is not incorrectly labeled trial',async()=>{
 globalThis.CollectorPurchasesBundle.getCustomerInfo=async()=>({customerInfo:{entitlements:{active:{pro:{isActive:true,periodType:'NORMAL',expirationDate:'2027-01-26T00:00:00Z'}}}}});
 const state=await globalThis.CollectorSubscriptions.refresh();
 assert.equal(state.isPro,true);assert.equal(state.isTrial,false);assert.equal(state.periodType,'NORMAL');
});


test('missing or unknown periodType does not falsely identify a trial',async()=>{
 globalThis.CollectorPurchasesBundle.getCustomerInfo=async()=>({customerInfo:{entitlements:{active:{pro:{isActive:true,expirationDate:'2027-02-01T00:00:00Z'}}}}});
 const missing=await globalThis.CollectorSubscriptions.refresh();
 assert.equal(missing.isPro,true);assert.equal(missing.isTrial,false);assert.equal(missing.periodType,null);
 globalThis.CollectorPurchasesBundle.getCustomerInfo=async()=>({customerInfo:{entitlements:{active:{pro:{isActive:true,periodType:'INTRO'}}}}});
 const unknown=await globalThis.CollectorSubscriptions.refresh();
 assert.equal(unknown.isPro,true);assert.equal(unknown.isTrial,false);assert.equal(unknown.periodType,'INTRO');
});

test('inactive entitlement is never reported as an active trial',async()=>{
 globalThis.CollectorPurchasesBundle.getCustomerInfo=async()=>({customerInfo:{entitlements:{active:{pro:{isActive:false,periodType:'TRIAL'}}}}});
 const state=await globalThis.CollectorSubscriptions.refresh();
 assert.equal(state.isPro,false);assert.equal(state.isTrial,false);assert.equal(state.periodType,'TRIAL');
});
