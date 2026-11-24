(function(root){
 'use strict';
 let sdkReady=false,currentUserId=null,queue=Promise.resolve();
 function serialize(task){
  const pending=queue.catch(()=>{}).then(task);
  queue=pending.catch(()=>{});
  return pending;
 }
 function nativePlatform(){
  if(!root.Capacitor?.isNativePlatform?.())return null;
  const platform=root.Capacitor.getPlatform?.();
  return platform==='ios'||platform==='android'?platform:null;
 }
 function apiKey(platform){
  return platform==='ios'?String(root.CollectorConfig?.revenueCatAppleApiKey||'').trim():
   platform==='android'?String(root.CollectorConfig?.revenueCatGoogleApiKey||'').trim():'';
 }
 function bridge(){return root.CollectorPurchasesBundle||null}
 function activePro(info){return Boolean(info?.entitlements?.active?.pro?.isActive)}
 async function customerInfoUnlocked(){
  const sdk=bridge();
  if(!sdkReady||!sdk)throw new Error('RevenueCat nu este inițializat.');
  const result=await sdk.getCustomerInfo();
  return result?.customerInfo||null;
 }
 async function refreshUnlocked(){
  const info=await customerInfoUnlocked(),entitlement=info?.entitlements?.active?.pro||null;
  return {available:true,isPro:activePro(info),expiresAt:entitlement?.expirationDate||null,
   willRenew:entitlement?.willRenew??null,managementUrl:info?.managementURL||null};
 }
 async function offeringsUnlocked(){
  const sdk=bridge();
  if(!sdkReady||!sdk)throw new Error('Abonamentele nu sunt configurate pe acest dispozitiv.');
  const result=await sdk.getOfferings(),current=result?.current;
  return (current?.availablePackages||[]).map(item=>({
   identifier:item.identifier,productIdentifier:item.product?.identifier||'',
   title:item.product?.title||item.product?.identifier||'Collector Pro',
   description:item.product?.description||'',priceString:item.product?.priceString||'',package:item
  }));
 }
 async function initializeUnlocked(userId){
  const platform=nativePlatform(),key=apiKey(platform),sdk=bridge();
  if(!platform)return {available:false,reason:'native_only',isPro:false};
  if(!key||!sdk)return {available:false,reason:'not_configured',isPro:false};
  if(!userId)return {available:false,reason:'no_user',isPro:false};
  if(!sdkReady){
   await sdk.configure({apiKey:key,appUserID:userId});
   sdkReady=true;currentUserId=userId;
  }else if(currentUserId!==userId){
   await sdk.logIn({appUserID:userId});currentUserId=userId;
  }
  return refreshUnlocked();
 }
 function initialize(userId){return serialize(()=>initializeUnlocked(userId))}
 function refresh(){return serialize(refreshUnlocked)}
 function offerings(){return serialize(offeringsUnlocked)}
 function purchase(packageIdentifier){
  return serialize(async()=>{
   const sdk=bridge(),items=await offeringsUnlocked();
   const selected=items.find(item=>item.identifier===packageIdentifier);
   if(!selected)throw new Error('Oferta selectată nu mai este disponibilă. Reîncarcă ofertele.');
   const result=await sdk.purchasePackage({aPackage:selected.package});
   const info=result?.customerInfo||await customerInfoUnlocked();
   return {isPro:activePro(info),customerInfo:info};
  });
 }
 function restore(){
  return serialize(async()=>{
   const sdk=bridge();
   if(!sdkReady||!sdk)throw new Error('Restaurarea achizițiilor nu este disponibilă pe acest dispozitiv.');
   const result=await sdk.restorePurchases(),info=result?.customerInfo||await customerInfoUnlocked();
   return {isPro:activePro(info),customerInfo:info};
  });
 }
 function logOut(){
  return serialize(async()=>{
   const sdk=bridge();
   if(sdkReady&&sdk)await sdk.logOut();
   currentUserId=null;
   return true;
  });
 }
 root.CollectorSubscriptions=Object.freeze({initialize,refresh,offerings,purchase,restore,logOut,isAvailable:()=>Boolean(nativePlatform()&&apiKey(nativePlatform())&&bridge())});
})(typeof window!=='undefined'?window:globalThis);
