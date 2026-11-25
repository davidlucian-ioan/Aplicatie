(function(root){
 'use strict';
 const DB='collector',TABLE='collector_kv';
 function classifySQLiteEncryptionState({databaseExists,encrypted,secretStored}={}){
  if(typeof databaseExists!=='boolean'||typeof secretStored!=='boolean'||(databaseExists&&typeof encrypted!=='boolean'))return Object.freeze({action:'inspect-required',reason:'state-incomplete'});
  if(!databaseExists)return Object.freeze({action:'create-encrypted',reason:'new-database',reuseStoredSecret:secretStored});
  if(encrypted===true){
   if(secretStored)return Object.freeze({action:'open-encrypted',reason:'encrypted-db-and-secret-present'});
   return Object.freeze({action:'recovery-required',reason:'encrypted-db-secret-missing'});
  }
  if(encrypted===false)return Object.freeze({action:'convert-existing',reason:'plaintext-db-preserve-source',generateSecret:!secretStored,requiresVerifiedBackup:true});
  return Object.freeze({action:'inspect-required',reason:'encryption-state-unknown'});
 }

 function removeCollectorKeys(backing){
  if(!backing||typeof backing.key!=='function'||typeof backing.removeItem!=='function')return 0;
  const keys=[];
  for(let index=backing.length-1;index>=0;index--){
   const key=backing.key(index);
   if(!key||key==='collector_cloud_opt_out')continue;
   if(key==='collector'||key.startsWith('collector_')||key.startsWith('collector-')||key.startsWith('collector:'))keys.push(key);
  }
  for(const key of keys)backing.removeItem(key);
  return keys.length;
 }
 function createWebStorageAdapter(storage){
  const backing=storage||root.localStorage;
  if(!backing)throw new Error('Web Storage nu este disponibil.');
  let queue=Promise.resolve(),initialization=null;
  return Object.freeze({
   async initialize(){if(!initialization)initialization=Promise.resolve().then(()=>true);return initialization},
   async readRaw(key){await this.initialize();return backing.getItem(String(key))},
   async writeRaw(key,value){
    await this.initialize();
    const name=String(key),serialized=String(value);
    const operation=queue.then(()=>{backing.setItem(name,serialized);return true});
    queue=operation.catch(()=>false);
    return operation;
   },
   async removeRaw(key){
    await this.initialize();
    const name=String(key);
    const operation=queue.then(()=>{backing.removeItem(name);return true});
    queue=operation.catch(()=>false);
    return operation;
   },
   async clearCollectorData(){
    await this.initialize();
    const operation=queue.then(()=>removeCollectorKeys(backing));
    queue=operation.catch(()=>0);
    return operation;
   },
   async flush(){await queue;return true}
  });
 }
 function createSQLiteStorageAdapter({sqlite,legacyStorage=root.localStorage,database=DB,encryptionBootstrap=null,requireEncryption=false}={}){
  if(!sqlite||typeof sqlite.createConnection!=='function'||typeof sqlite.query!=='function'||typeof sqlite.run!=='function')throw new TypeError('Pluginul Capacitor SQLite nu este disponibil.');
  let queue=Promise.resolve(),initialization=null;
  const legacy=legacyStorage;
  const connection={database,readonly:false};
  async function initialize(){
   if(!initialization)initialization=(async()=>{
    if(typeof sqlite.isConnection==='function'){
     const state=await sqlite.isConnection(connection);
     if(!state?.result)await sqlite.createConnection({database,encrypted:encryptionState?.encrypted===true,mode:encryptionState?.mode||'no-encryption',version:1,readonly:false});
    }else{
     await sqlite.createConnection({database,encrypted:encryptionState?.encrypted===true,mode:encryptionState?.mode||'no-encryption',version:1,readonly:false});
    }
    if(typeof sqlite.isDBOpen==='function'){
     const openState=await sqlite.isDBOpen(connection);
     if(!openState?.result)await sqlite.open(connection);
    }else await sqlite.open(connection);
    await sqlite.execute({database,statements:'CREATE TABLE IF NOT EXISTS '+TABLE+' (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'});
    return true;
   })().catch(error=>{initialization=null;throw error});
   return initialization;
  }
  function enqueue(action){
   const operation=queue.then(action);
   queue=operation.catch(()=>undefined);
   return operation;
  }
  return Object.freeze({
   initialize,
   async readRaw(key){
    await initialize();
    const result=await sqlite.query({database,statement:'SELECT value FROM '+TABLE+' WHERE key = ?',values:[String(key)],readonly:false});
    const value=result?.values?.[0]?.value;
    if(value!==undefined&&value!==null)return String(value);
    // First-run migration path: keep legacy browser data readable until Core validates and rewrites it.
    return legacy?.getItem?legacy.getItem(String(key)):null;
   },
   async writeRaw(key,value){
    await initialize();
    const name=String(key),serialized=String(value);
    return enqueue(async()=>{
     await sqlite.run({database,statement:'INSERT OR REPLACE INTO '+TABLE+' (key,value) VALUES (?,?)',values:[name,serialized]});
     return true;
    });
   },
   async removeRaw(key){
    await initialize();
    const name=String(key);
    return enqueue(async()=>{
     await sqlite.run({database,statement:'DELETE FROM '+TABLE+' WHERE key = ?',values:[name]});
     if(legacy?.removeItem)legacy.removeItem(name);
     return true;
    });
   },
   async clearCollectorData(){
    await initialize();
    return enqueue(async()=>{
     await sqlite.run({database,statement:'DELETE FROM '+TABLE,values:[]});
     removeCollectorKeys(legacy);
     return true;
    });
   },
   async flush(){await queue;return true}
  });
 }
 function createAutoStorageAdapter({capacitor=root.Capacitor,sqlite=capacitor?.Plugins?.CapacitorSQLite,legacyStorage=root.localStorage,encryptionBootstrap=null,requireEncryption=false}={}){
  const native=typeof capacitor?.isNativePlatform==='function'&&capacitor.isNativePlatform();
  if(!native)return createWebStorageAdapter(legacyStorage);
  if(!sqlite)throw new Error('Collector mobil necesită pluginul SQLite nativ. Build-ul nu este configurat corect.');
  return createSQLiteStorageAdapter({sqlite,legacyStorage,encryptionBootstrap,requireEncryption});
 }
 const api=Object.freeze({classifySQLiteEncryptionState,createWebStorageAdapter,createSQLiteStorageAdapter,createAutoStorageAdapter});
 root.CollectorStorageAdapter=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
