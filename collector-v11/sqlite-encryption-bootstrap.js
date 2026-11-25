(function(root){
 'use strict';
 const DB='collector',TABLE='collector_kv',BACKUP_KEY='collector_sqlite_encryption_migration_backup_v1';
 function makePassphrase(cryptoImpl){
  if(!cryptoImpl||typeof cryptoImpl.getRandomValues!=='function')throw new Error('Secure random generator unavailable; encryption bootstrap aborted.');
  const bytes=new Uint8Array(32);cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 }
 function normalizedEntries(entries){
  if(!Array.isArray(entries))throw new Error('SQLite migration snapshot is invalid.');
  const seen=new Set();
  const rows=entries.map(row=>{
   if(!row||typeof row.key!=='string'||!row.key.trim()||typeof row.value!=='string')throw new Error('SQLite migration snapshot contains invalid KV rows.');
   if(seen.has(row.key))throw new Error('SQLite migration snapshot contains duplicate KV keys.');
   seen.add(row.key);
   return {key:row.key,value:row.value};
  });
  return rows.sort((a,b)=>a.key.localeCompare(b.key));
 }
 function equalEntries(a,b){const left=normalizedEntries(a),right=normalizedEntries(b);return left.length===right.length&&left.every((row,i)=>row.key===right[i].key&&row.value===right[i].value)}
 function readLegacyEntries(storage){if(!storage||typeof storage.key!=='function'||typeof storage.getItem!=='function')return [];const entries=[];for(let i=0;i<(Number(storage.length)||0);i++){const key=storage.key(i);if(!key||key===BACKUP_KEY||key==='collector_cloud_opt_out'||!(key==='collector'||key.startsWith('collector_')||key.startsWith('collector-')||key.startsWith('collector:')))continue;const value=storage.getItem(key);if(value!==null)entries.push({key,value:String(value)})}return normalizedEntries(entries)}
 function mergeEntries(databaseEntries,legacyEntries){const map=new Map(normalizedEntries(legacyEntries).map(row=>[row.key,row.value]));for(const row of normalizedEntries(databaseEntries))map.set(row.key,row.value);return normalizedEntries([...map].map(([key,value])=>({key,value})))}
 async function createOpen(sqlite,database,encrypted,mode){
  const conn={database,readonly:false};
  if(typeof sqlite.isConnection==='function'&&(await sqlite.isConnection(conn)).result){
   await sqlite.closeConnection(conn);
  }
  await sqlite.createConnection({database,encrypted,mode,version:1,readonly:false});
  await sqlite.open(conn);
  return conn;
 }
 async function close(sqlite,conn){try{await sqlite.closeConnection(conn)}catch(error){}}
 async function readEntries(sqlite,database){
  await sqlite.execute({database,statements:'CREATE TABLE IF NOT EXISTS '+TABLE+' (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'});
  const result=await sqlite.query({database,statement:'SELECT key,value FROM '+TABLE+' ORDER BY key',values:[]});
  return normalizedEntries(result?.values||[]);
 }
 async function restoreEntries(sqlite,database,entries){
  const rows=normalizedEntries(entries);
  if(typeof sqlite.beginTransaction!=='function'||typeof sqlite.commitTransaction!=='function'||typeof sqlite.rollbackTransaction!=='function')throw new Error('SQLite transaction APIs unavailable; migration restore aborted.');
  const options={database};
  await sqlite.beginTransaction(options);
  try{
   await sqlite.run({database,statement:'DELETE FROM '+TABLE,values:[]});
   for(const row of rows)await sqlite.run({database,statement:'INSERT OR REPLACE INTO '+TABLE+' (key,value) VALUES (?,?)',values:[row.key,row.value]});
   await sqlite.commitTransaction(options);
  }catch(error){
   try{await sqlite.rollbackTransaction(options)}catch(rollbackError){}
   throw error;
  }
 }
 function readBackup(storage){
  if(!storage||typeof storage.getItem!=='function')return null;
  const raw=storage.getItem(BACKUP_KEY);if(raw===null)return null;
  let backup;
  try{backup=JSON.parse(raw)}catch(error){throw new Error('SQLite migration recovery backup is unreadable; original data was not modified.')}
  if(backup?.version!==1||!Array.isArray(backup.entries))throw new Error('SQLite migration recovery backup is invalid; original data was not modified.');
  return {raw,backup:{...backup,entries:normalizedEntries(backup.entries),legacyEntries:normalizedEntries(backup.legacyEntries||[])}};
 }
 function writeBackup(storage,entries,legacyEntries=[]){
  if(!storage||typeof storage.setItem!=='function'||typeof storage.getItem!=='function')throw new Error('Verified migration backup storage unavailable; conversion blocked.');
  const payload={version:1,database:DB,phase:'prepared',createdAt:new Date().toISOString(),entries:normalizedEntries(entries),legacyEntries:normalizedEntries(legacyEntries)};
  const raw=JSON.stringify(payload);
  storage.setItem(BACKUP_KEY,raw);
  const reread=storage.getItem(BACKUP_KEY);
  if(reread!==raw)throw new Error('Migration backup read-back verification failed; conversion blocked.');
  return {raw,backup:payload};
 }
 async function verifyAndRecoverEncrypted(sqlite,database,storage,backupRecord){
  let entries=await readEntries(sqlite,database);
  if(!backupRecord){const legacyEntries=readLegacyEntries(storage);if(legacyEntries.length)backupRecord=writeBackup(storage,mergeEntries(entries,legacyEntries),legacyEntries)}
  if(backupRecord&&!equalEntries(entries,backupRecord.backup.entries)){
   await restoreEntries(sqlite,database,backupRecord.backup.entries);
   const restored=await readEntries(sqlite,database);
   if(!equalEntries(restored,backupRecord.backup.entries))throw new Error('Encrypted SQLite recovery verification failed; backup was preserved.');
  }
  return entries;
 }
 async function prepareSQLiteEncryption({sqlite,database=DB,cryptoImpl=root.crypto,backupStorage=root.localStorage}={}){
  const required=['isDatabase','isDatabaseEncrypted','isSecretStored','setEncryptionSecret','createConnection','open','closeConnection','execute','query','run'];
  if(!sqlite||required.some(method=>typeof sqlite[method]!=='function'))throw new Error('SQLite encryption/migration APIs are incomplete; refusing plaintext fallback.');
  if(typeof sqlite.isInConfigEncryption==='function'&&(await sqlite.isInConfigEncryption()).result!==true)throw new Error('Native SQLite encryption is disabled in Capacitor config; encryption bootstrap aborted.');
  const dbExists=(await sqlite.isDatabase({database})).result;
  const secretStored=(await sqlite.isSecretStored()).result;
  if(typeof dbExists!=='boolean'||typeof secretStored!=='boolean')throw new Error('SQLite encryption state is unknown; recovery required.');
  let backupRecord=readBackup(backupStorage);
  if(!dbExists){
   const legacyEntries=readLegacyEntries(backupStorage);
   if(!backupRecord&&legacyEntries.length)backupRecord=writeBackup(backupStorage,legacyEntries,legacyEntries);
   if(!secretStored){
    const passphrase=makePassphrase(cryptoImpl);
    await sqlite.setEncryptionSecret({passphrase});
    if((await sqlite.isSecretStored()).result!==true)throw new Error('Secure secret storage verification failed; database creation aborted.');
   }
   const state=Object.freeze({encrypted:true,mode:'secret',state:backupRecord?'new-encrypted-recovery':'new-encrypted'});
   if(backupRecord){
    const conn=await createOpen(sqlite,database,true,'secret');
    try{
     await restoreEntries(sqlite,database,backupRecord.backup.entries);
     const verify=await readEntries(sqlite,database);
     if(!equalEntries(verify,backupRecord.backup.entries))throw new Error('Recovery of interrupted SQLite migration failed; backup preserved.');
     if((await sqlite.isDatabaseEncrypted({database})).result!==true)throw new Error('New SQLite recovery database encryption verification failed.');
    }finally{await close(sqlite,conn)}
   }
   return state;
  }
  const encryptedResult=(await sqlite.isDatabaseEncrypted({database})).result;
  if(typeof encryptedResult!=='boolean')throw new Error('SQLite encryption state unknown; recovery required.');
  if(encryptedResult){
   if(!secretStored)throw new Error('Collector database is encrypted but its secure key is missing. Recovery is required; data was not modified.');
   const conn=await createOpen(sqlite,database,true,'secret');
   try{
    await verifyAndRecoverEncrypted(sqlite,database,backupStorage,backupRecord);
   }finally{await close(sqlite,conn)}
   return Object.freeze({encrypted:true,mode:'secret',state:backupRecord?'existing-encrypted-recovered':'existing-encrypted'});
  }
  // Plaintext migration: verified snapshot first; conversion only after backup is durable/read-back verified.
  const connPlain=await createOpen(sqlite,database,false,'no-encryption');
  let entries;
  try{entries=await readEntries(sqlite,database)}finally{await close(sqlite,connPlain)}
  const legacyEntries=readLegacyEntries(backupStorage);
  if(!backupRecord)backupRecord=writeBackup(backupStorage,mergeEntries(entries,legacyEntries),legacyEntries);
  if(!secretStored){
   const passphrase=makePassphrase(cryptoImpl);
   await sqlite.setEncryptionSecret({passphrase});
   if((await sqlite.isSecretStored()).result!==true)throw new Error('Secure secret storage verification failed; plaintext database preserved and conversion blocked.');
  }
  const connEncrypted=await createOpen(sqlite,database,true,'encryption');
  try{
   if((await sqlite.isDatabaseEncrypted({database})).result!==true)throw new Error('SQLite conversion did not produce an encrypted database; verified backup preserved.');
   const converted=await readEntries(sqlite,database);
   if(!equalEntries(converted,backupRecord.backup.entries)){
    await restoreEntries(sqlite,database,backupRecord.backup.entries);
    const restored=await readEntries(sqlite,database);
    if(!equalEntries(restored,backupRecord.backup.entries))throw new Error('Converted SQLite database failed data verification; migration backup preserved.');
   }
   if((await sqlite.isDatabaseEncrypted({database})).result!==true)throw new Error('SQLite encryption verification failed after restore.');
  }finally{await close(sqlite,connEncrypted)}
  return Object.freeze({encrypted:true,mode:'secret',state:'converted-existing'});
 }
 function completeSQLiteEncryptionMigration({backupStorage=root.localStorage}={}){
  const record=readBackup(backupStorage);
  if(record&&typeof backupStorage.removeItem==='function'){
   for(const row of record.backup.legacyEntries){if(backupStorage.getItem(row.key)===row.value)backupStorage.removeItem(row.key)}
   backupStorage.removeItem(BACKUP_KEY);
  }
  return !!record;
 }
 const api=Object.freeze({prepareSQLiteEncryption,completeSQLiteEncryptionMigration,makePassphrase,normalizedEntries,equalEntries});
 root.CollectorSQLiteEncryption=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
