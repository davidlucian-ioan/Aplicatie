'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareSQLiteEncryption}=require('./sqlite-encryption-bootstrap');
const {createSQLiteStorageAdapter}=require('./storage-adapter');
const BACKUP_KEY='collector_sqlite_encryption_migration_backup_v1';
function mockStorage(initial={}){const map=new Map(Object.entries(initial));return {getItem(k){return map.has(k)?map.get(k):null},setItem(k,v){map.set(k,String(v))},removeItem(k){map.delete(k)},dump(){return Object.fromEntries(map)}}}
function mockSQLite({exists=false,encrypted=false,secret=false,verifySecret=true,configEncryption=true,conversionSucceeds=true}={}){
 const calls=[];let stored=secret,opened=false,dbEncrypted=encrypted;const rows=new Map();
 return {calls,rows,sqlite:{
  async isDatabase(o){calls.push(['isDatabase',o]);return {result:exists}},
  async isDatabaseEncrypted(o){calls.push(['isDatabaseEncrypted',o]);return {result:dbEncrypted}},
  async isSecretStored(){calls.push(['isSecretStored']);return {result:stored}},
  async setEncryptionSecret(o){calls.push(['setEncryptionSecret',o]);stored=verifySecret},
  async isInConfigEncryption(){calls.push(['isInConfigEncryption']);return {result:configEncryption}},
  async isConnection(){return {result:opened}},
  async closeConnection(o){calls.push(['closeConnection',o]);opened=false},
  async createConnection(o){calls.push(['createConnection',o]);opened=true;if(o.mode==='secret')dbEncrypted=true;if(o.mode==='encryption'&&conversionSucceeds)dbEncrypted=true},
  async open(o){calls.push(['open',o]);opened=true},
  async execute(o){calls.push(['execute',o]);return {changes:{changes:0}}},
  async query(o){if(o.statement.includes('WHERE key')){const v=rows.get(o.values[0]);return {values:v===undefined?[]:[{value:v}]}}return {values:[...rows].map(([key,value])=>({key,value}))}},
  async run(o){calls.push(['run',o]);if(o.statement.startsWith('DELETE'))rows.clear();else if(o.statement.startsWith('INSERT')){const [k,v]=o.values||[];rows.set(k,v)}return {changes:{changes:1}}},
  async beginTransaction(o){calls.push(['beginTransaction',o])},
  async commitTransaction(o){calls.push(['commitTransaction',o])},
  async rollbackTransaction(o){calls.push(['rollbackTransaction',o])}
 }};
}
function fakeCrypto(){return {getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes}}}
test('bootstrap pentru DB nou generează secret random, verifică secure store și selectează secret mode',async()=>{
 const m=mockSQLite({verifySecret:true});
 const state=await prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:fakeCrypto(),backupStorage:mockStorage()});
 assert.deepEqual(state,{encrypted:true,mode:'secret',state:'new-encrypted'});
 const secretCall=m.calls.find(c=>c[0]==='setEncryptionSecret');
 assert.equal(secretCall[1].passphrase.length,64);
 assert.notEqual(secretCall[1].passphrase,'collector');
 assert.ok(m.calls.some(c=>c[0]==='isSecretStored'));
});
test('DB nouă nu se creează dacă verificarea stocării secretului eșuează',async()=>{
 const m=mockSQLite({verifySecret:false});
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:fakeCrypto(),backupStorage:mockStorage()}),/verification failed/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'),false);
});
test('DB criptată existentă se deschide doar cu secret secure store disponibil',async()=>{
 const m=mockSQLite({exists:true,encrypted:true,secret:true});
 const state=await prepareSQLiteEncryption({sqlite:m.sqlite,backupStorage:mockStorage()});
 assert.deepEqual(state,{encrypted:true,mode:'secret',state:'existing-encrypted'});
});
test('DB criptată cu secret lipsă intră în recovery fără mutații',async()=>{
 const m=mockSQLite({exists:true,encrypted:true,secret:false});
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite,backupStorage:mockStorage()}),/secret is missing/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'||c[0]==='setEncryptionSecret'),false);
});
test('migrarea plaintext face backup read-back, convertește și verifică toate KV rows',async()=>{
 const m=mockSQLite({exists:true,encrypted:false,secret:false});m.rows.set('collector_mvp_v2','{"schemaVersion":7}');m.rows.set('workDraft','draft');
 const backup=mockStorage();
 const state=await prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:fakeCrypto(),backupStorage:backup});
 assert.deepEqual(state,{encrypted:true,mode:'secret',state:'converted-existing'});
 assert.equal(m.rows.get('collector_mvp_v2'),'{"schemaVersion":7}');
 assert.equal(m.rows.get('workDraft'),'draft');
 assert.equal(backup.getItem(BACKUP_KEY),null);
 assert.ok(m.calls.some(c=>c[0]==='createConnection'&&c[1].mode==='encryption'));
 assert.ok(m.calls.some(c=>c[0]==='isDatabaseEncrypted'));
});
test('migrarea plaintext este blocată dacă backup verificat nu poate fi scris',async()=>{
 const m=mockSQLite({exists:true,encrypted:false,secret:false});
 const backup={getItem(){return null},setItem(){throw Error('quota')},removeItem(){}};
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:fakeCrypto(),backupStorage:backup}),/quota/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'&&c[1].mode==='encryption'),false);
});
test('migrarea păstrează backup la conversie eșuată',async()=>{
 const m=mockSQLite({exists:true,encrypted:false,secret:false,conversionSucceeds:false});m.rows.set('k','v');
 const backup=mockStorage();
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:fakeCrypto(),backupStorage:backup}),/did not produce an encrypted database/);
 const stored=JSON.parse(backup.getItem(BACKUP_KEY));
 assert.deepEqual(stored.entries,[{key:'k',value:'v'}]);
});
test('recuperarea unei migrări întrerupte restaurează snapshotul verificat în DB criptată',async()=>{
 const m=mockSQLite({exists:true,encrypted:true,secret:true});m.rows.set('partial','bad');
 const backup=mockStorage({[BACKUP_KEY]:JSON.stringify({version:1,database:'collector',phase:'prepared',createdAt:'x',entries:[{key:'good',value:'restored'}]})});
 const state=await prepareSQLiteEncryption({sqlite:m.sqlite,backupStorage:backup});
 assert.deepEqual(state,{encrypted:true,mode:'secret',state:'existing-encrypted-recovered'});
 assert.deepEqual([...m.rows],[['good','restored']]);
 assert.equal(backup.getItem(BACKUP_KEY),null);
});
test('bootstrap fail-closed dacă secure random nu este disponibil',async()=>{
 const m=mockSQLite();
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:null,backupStorage:mockStorage()}),/Secure random generator unavailable/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'),false);
});
test('adapterul requireEncryption creează DB encrypted și verifică encryption după open',async()=>{
 const m=mockSQLite({verifySecret:true});
 const bootstrap={prepareSQLiteEncryption:args=>prepareSQLiteEncryption({...args,cryptoImpl:fakeCrypto()})};
 const adapter=createSQLiteStorageAdapter({sqlite:m.sqlite,legacyStorage:mockStorage(),encryptionBootstrap:bootstrap,requireEncryption:true});
 await adapter.writeRaw('test','secure');
 const create=m.calls.find(c=>c[0]==='createConnection');
 assert.equal(create[1].encrypted,true);
 assert.equal(create[1].mode,'secret');
 assert.equal(await adapter.readRaw('test'),'secure');
 assert.equal(adapter.getEncryptionState().state,'new-encrypted');
 assert.ok(m.calls.some(c=>c[0]==='isDatabaseEncrypted'));
});
test('adapterul migrează plaintext în encrypted mode înainte să expună read/write',async()=>{
 const m=mockSQLite({exists:true,encrypted:false});m.rows.set('old','preserved');
 const legacy=mockStorage();
 const adapter=createSQLiteStorageAdapter({sqlite:m.sqlite,legacyStorage:legacy,encryptionBootstrap:{prepareSQLiteEncryption:args=>prepareSQLiteEncryption({...args,cryptoImpl:fakeCrypto()})},requireEncryption:true});
 await adapter.initialize();
 assert.equal(adapter.getEncryptionState().state,'converted-existing');
 assert.equal(await adapter.readRaw('old'),'preserved');
 assert.ok(m.calls.some(c=>c[0]==='createConnection'&&c[1].mode==='encryption'));
 assert.ok(m.calls.some(c=>c[0]==='createConnection'&&c[1].mode==='secret'));
});
test('adapterul refuză acces dacă native config nu are encryption activ',async()=>{
 const m=mockSQLite({configEncryption:false});
 const adapter=createSQLiteStorageAdapter({sqlite:m.sqlite,legacyStorage:mockStorage(),encryptionBootstrap:{prepareSQLiteEncryption:args=>prepareSQLiteEncryption(args)},requireEncryption:true});
 await assert.rejects(adapter.initialize(),/disabled in Capacitor config/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'),false);
});
test('adapterul refuză DB dacă verificarea encryption post-open e falsă',async()=>{
 const m=mockSQLite({verifyEncryption:false});
 const adapter=createSQLiteStorageAdapter({sqlite:m.sqlite,legacyStorage:mockStorage(),encryptionBootstrap:{prepareSQLiteEncryption:args=>prepareSQLiteEncryption({...args,cryptoImpl:fakeCrypto()})},requireEncryption:true});
 await assert.rejects(adapter.initialize(),/verification failed/);
});

test('auto adapter refuză web storage plaintext când encryption este obligatorie',()=>{
 const backing=mockStorage();
 assert.throws(()=>createSQLiteStorageAdapter({sqlite:null,legacyStorage:backing,requireEncryption:true}),/SQLite encryption\/migration APIs are incomplete/);
 const {createAutoStorageAdapter}=require('./storage-adapter');
 assert.throws(()=>createAutoStorageAdapter({capacitor:{isNativePlatform:()=>false},legacyStorage:backing,requireEncryption:true}),/unavailable on the web platform/);
});
