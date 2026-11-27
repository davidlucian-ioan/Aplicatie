import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';

let storageReady=null;
async function prepareStorage(){
 if(!storageReady)storageReady=(async()=>{
  await SecureStorage.setKeyPrefix('collector-auth');
  if(Capacitor.getPlatform()==='ios'){
   await SecureStorage.setSynchronize(false);
   await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  }
 })().catch(error=>{storageReady=null;throw error});
 return storageReady;
}
function createCollectorSupabaseClient(config){
 const storage={
  async getItem(key){await prepareStorage();return await SecureStorage.getItem(key)},
  async setItem(key,value){await prepareStorage();await SecureStorage.setItem(key,value)},
  async removeItem(key){await prepareStorage();await SecureStorage.removeItem(key)}
 };
 return createClient(config.supabaseUrl,config.supabaseAnonKey,{
  auth:{storage,storageKey:'collector-auth-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
 });
}
if(typeof window!=='undefined')window.CollectorAuthBundle=Object.freeze({createClient:createCollectorSupabaseClient});
