(function(root){
 'use strict';
 let sdkReady=false,currentUserId=null,initializing=null;
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
 function activePro(info){
  return Boolean(info?.entitlements?.active?.pro?.isActive);
 }
 async function initialize(userId){
  const platform=nativePlatform(),key=apiKey(platform),sdk=bridge();
  if(!platform)return {available:false,reason:'native_only',isPro:false};
  if(!key||!sdk)return {available:false,reason:'not_configured',isPro:false};
  if(!userId)return {available:false,reason:'no_user',isPro:false};
  // Serialize identity changes. Concurrent screen refreshes or account switches
  // must not let a stale configure/logIn finish after a newer user was selected.
  const run=async()=>{
   if(!sdkReady){
    await sdk.configure({apiKey:key,appUserID:userId});
    sdkReady=true;currentUserId=userId;
   }else if(currentUserId!==userId){
    await sdk.logIn({appUserID:userId});currentUserId=userId;
   }
   return refresh();
  };
  const pending=(initializing||Promise.resolve()).catch(()=>{}).then(run);
  initializing=pending;
  try{return await pending}finally{if(initializing===pending)initializing=null}
 }
 async function customerInfo(){
  const sdk=bridge();
  if(!sdkReady||!sdk)throw new Error('RevenueCat nu este inițializat.');
  const result=await sdk.getCustomerInfo();
  return result?.customerInfo||null;
 }
 async function refresh(){
  const info=await customerInfo();
  const entitlement=info?.entitlements?.active?.pro||null;
  return {available:true,isPro:activePro(info),expiresAt:entitlement?.expirationDate||null,
   willRenew:entitlement?.willRenew??null,managementUrl:info?.managementURL||null};
 }
 async function offerings(){
  const sdk=bridge();
  if(!sdkReady||!sdk)throw new Error('Abonamentele nu sunt configurate pe acest dispozitiv.');
  const result=await sdk.getOfferings(),current=result?.current;
  return (current?.availablePackages||[]).map(item=>({
   identifier:item.identifier,productIdentifier:item.product?.identifier||'',
   title:item.product?.title||item.product?.identifier||'Collector Pro',
   description:item.product?.description||'',priceString:item.product?.priceString||'',
   package:item
  }));
 }
 async function purchase(packageIdentifier){
  const sdk=bridge(),items=await offerings();
  const selected=items.find(item=>item.identifier===packageIdentifier);
  if(!selected)throw new Error('Oferta selectată nu mai este disponibilă. Reîncarcă ofertele.');
  const result=await sdk.purchasePackage({aPackage:selected.package});
  const info=result?.customerInfo||await customerInfo();
  return {isPro:activePro(info),customerInfo:info};
 }
 async function restore(){
  const sdk=bridge();
  if(!sdkReady||!sdk)throw new Error('Restaurarea achizițiilor nu este disponibilă pe acest dispozitiv.');
  const result=await sdk.restorePurchases(),info=result?.customerInfo||await customerInfo();
  return {isPro:activePro(info),customerInfo:info};
 }
 async function logOut(){
  const sdk=bridge();
  if(sdkReady&&sdk)await sdk.logOut();
  currentUserId=null;
  return true;
 }
 root.CollectorSubscriptions=Object.freeze({initialize,refresh,offerings,purchase,restore,logOut,isAvailable:()=>Boolean(nativePlatform()&&apiKey(nativePlatform())&&bridge())});
})(typeof window!=='undefined'?window:globalThis);
