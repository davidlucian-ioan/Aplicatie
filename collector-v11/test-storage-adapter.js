'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createWebStorageAdapter,createSQLiteStorageAdapter,createAutoStorageAdapter}=require('./storage-adapter');
function fakeStorage(seed={}){
 const values=new Map(Object.entries(seed));let failWrite=false;
 return {get length(){return values.size},key:index=>[...values.keys()][index]??null,getItem:key=>values.has(key)?values.get(key):null,setItem(key,value){if(failWrite)throw new Error('quota exceeded');values.set(key,String(value))},removeItem:key=>values.delete(key),has:key=>values.has(key),value:key=>values.get(key),fail(value){failWrite=value}};
}
test('adapterul citește datele existente fără să le transforme',async()=>{
 const backing=fakeStorage({'collector_mvp_v2':'{"schemaVersion":7,"events":[]}'});
 const adapter=createWebStorageAdapter(backing);await adapter.initialize();
 assert.equal(await adapter.readRaw('collector_mvp_v2'),'{"schemaVersion":7,"events":[]}');
 assert.equal(await adapter.readRaw('missing'),null);
});
test('adapterul serializează scrierile concurente și păstrează ultima valoare',async()=>{
 const backing=fakeStorage(),adapter=createWebStorageAdapter(backing);
 const writes=await Promise.all([adapter.writeRaw('collector_mvp_v2','{"n":1}'),adapter.writeRaw('collector_mvp_v2','{"n":2}'),adapter.writeRaw('collector_mvp_v2','{"n":3}')]);
 assert.deepEqual(writes,[true,true,true]);assert.equal(await adapter.readRaw('collector_mvp_v2'),'{"n":3}');await adapter.flush();
});
test('eșecul de stocare este propagat și nu este raportat drept succes',async()=>{
 const backing=fakeStorage(),adapter=createWebStorageAdapter(backing);backing.fail(true);
 await assert.rejects(adapter.writeRaw('collector_mvp_v2','{}'),/quota exceeded/);assert.equal(backing.has('collector_mvp_v2'),false);
});
test('ștergerea este serializată după scrierile anterioare',async()=>{
 const backing=fakeStorage(),adapter=createWebStorageAdapter(backing);await adapter.writeRaw('collector_mvp_v2','{"ok":true}');await adapter.removeRaw('collector_mvp_v2');
 assert.equal(await adapter.readRaw('collector_mvp_v2'),null);
});
test('adapterul nu expune direct obiectul de stocare',()=>{
 const adapter=createWebStorageAdapter(fakeStorage());assert.equal(adapter.storage,undefined);assert.equal(adapter.localStorage,undefined);
});

function fakeSQLite(){
 const values=new Map(),calls=[];let open=false;
 const sqlite={
  async isConnection(){calls.push('isConnection');return {result:open}},
  async createConnection(options){calls.push(['createConnection',options]);open=true},
  async open(options){calls.push(['open',options]);open=true},
  async execute(options){calls.push(['execute',options]);return {changes:{changes:0}}},
  async query(options){calls.push(['query',options]);if(options.statement.startsWith('SELECT key'))return {values:[...values.keys()].filter(key=>key.startsWith(options.values[0].slice(0,-1))).map(key=>({key}))};const value=values.get(options.values[0]);return {values:value===undefined?[]:[{value}]}},
  async run(options){calls.push(['run',options]);if(options.statement==='DELETE FROM collector_kv'){values.clear();return {changes:{changes:1}}}const [key,value]=options.values||[];if(options.statement.startsWith('INSERT'))values.set(key,value);else values.delete(key);return {changes:{changes:1}}}
 };
 return {sqlite,values,calls};
}
test('adapterul SQLite inițializează schema o singură dată și persistă snapshot-uri',async()=>{
 const native=fakeSQLite(),legacy=fakeStorage(),adapter=createSQLiteStorageAdapter({sqlite:native.sqlite,legacyStorage:legacy});
 await Promise.all([adapter.initialize(),adapter.initialize()]);
 assert.equal(native.calls.filter(call=>Array.isArray(call)&&call[0]==='createConnection').length,1);
 assert.ok(native.calls.some(call=>Array.isArray(call)&&call[0]==='execute'&&call[1].statements.includes('CREATE TABLE')));
 await adapter.writeRaw('collector_mvp_v2','{"schemaVersion":7}');
 assert.equal(await adapter.readRaw('collector_mvp_v2'),'{"schemaVersion":7}');
});
test('adapterul SQLite serializează scrierile și folosește parametri SQL legați',async()=>{
 const native=fakeSQLite(),adapter=createSQLiteStorageAdapter({sqlite:native.sqlite,legacyStorage:fakeStorage()});
 await Promise.all([adapter.writeRaw('safe-key','1'),adapter.writeRaw('safe-key','2'),adapter.writeRaw('safe-key','3')]);
 assert.equal(await adapter.readRaw('safe-key'),'3');
 const insert=native.calls.find(call=>Array.isArray(call)&&call[0]==='run'&&call[1].statement.startsWith('INSERT'));
 assert.deepEqual(insert[1].values,['safe-key','1']);
});
test('adapterul SQLite păstrează migrarea legacy până la prima scriere validată',async()=>{
 const legacy=fakeStorage({'collector_mvp_v2':'{"schemaVersion":7,"events":[]}'});
 const native=fakeSQLite(),adapter=createSQLiteStorageAdapter({sqlite:native.sqlite,legacyStorage:legacy});
 assert.equal(await adapter.readRaw('collector_mvp_v2'),'{"schemaVersion":7,"events":[]}');
 await adapter.writeRaw('collector_mvp_v2','{"schemaVersion":7,"events":[1]}');
 assert.equal(await adapter.readRaw('collector_mvp_v2'),'{"schemaVersion":7,"events":[1]}');
 assert.equal(legacy.value('collector_mvp_v2'),'{"schemaVersion":7,"events":[]}');
});
test('adapterul automat alege SQLite pe nativ și Web Storage pe browser',async()=>{
 const native=fakeSQLite(),legacy=fakeStorage();
 const mobile=createAutoStorageAdapter({capacitor:{isNativePlatform:()=>true},sqlite:native.sqlite,legacyStorage:legacy});
 const web=createAutoStorageAdapter({capacitor:{isNativePlatform:()=>false},legacyStorage:legacy});
 await mobile.writeRaw('mobile','yes');await web.writeRaw('web','yes');
 assert.equal(await mobile.readRaw('mobile'),'yes');assert.equal(await web.readRaw('web'),'yes');
 assert.throws(()=>createAutoStorageAdapter({capacitor:{isNativePlatform:()=>true},sqlite:null,legacyStorage:legacy}),/SQLite nativ/);
});

test('ștergerea datelor locale elimină doar cheile Collector și păstrează opt-out-ul cloud și stocarea altor aplicații',async()=>{
 const backing=fakeStorage({collector_mvp_v2:'journal',collector_work_command_draft_v1:'draft','collector-intent:one':'pending',collector_cloud_opt_out:'1','sb-project-auth-token':'cloud-session',another_app_setting:'keep'});
 const adapter=createWebStorageAdapter(backing);
 const removed=await adapter.clearCollectorData();
 assert.equal(removed,3);
 assert.equal(backing.has('collector_mvp_v2'),false);
 assert.equal(backing.has('collector_work_command_draft_v1'),false);
 assert.equal(backing.has('collector-intent:one'),false);
 assert.equal(backing.value('collector_cloud_opt_out'),'1');
 assert.equal(backing.value('sb-project-auth-token'),'cloud-session');
 assert.equal(backing.value('another_app_setting'),'keep');
});
test('ștergerea datelor locale golește tabelul SQLite și cheile Collector legacy',async()=>{
 const legacy=fakeStorage({collector_mvp_v2:'legacy',collector_audio_index_v1:'index',collector_cloud_opt_out:'1',unrelated:'keep'});
 const native=fakeSQLite(),adapter=createSQLiteStorageAdapter({sqlite:native.sqlite,legacyStorage:legacy});
 await adapter.writeRaw('collector_mvp_v2','journal');
 await adapter.writeRaw('collector_work_command_draft_v1','draft');
 await adapter.clearCollectorData();
 assert.equal(native.values.size,0);
 assert.equal(legacy.has('collector_mvp_v2'),false);
 assert.equal(legacy.has('collector_audio_index_v1'),false);
 assert.equal(legacy.value('collector_cloud_opt_out'),'1');
 assert.equal(legacy.value('unrelated'),'keep');
});

test('classifierul encryption nu deschide DB criptată fără secret și cere recovery',()=>{
 const classify=require('./storage-adapter').classifySQLiteEncryptionState;
 assert.deepEqual(classify({databaseExists:true,encrypted:true,secretStored:false}),{action:'recovery-required',reason:'encrypted-db-secret-missing'});
});
test('classifierul encryption permite open numai pentru DB criptată cu secret disponibil',()=>{
 const classify=require('./storage-adapter').classifySQLiteEncryptionState;
 assert.deepEqual(classify({databaseExists:true,encrypted:true,secretStored:true}),{action:'open-encrypted',reason:'encrypted-db-and-secret-present'});
});
test('classifierul encryption tratează DB plaintext ca migrare cu backup verificat, nu ca open normal',()=>{
 const classify=require('./storage-adapter').classifySQLiteEncryptionState;
 assert.deepEqual(classify({databaseExists:true,encrypted:false,secretStored:false}),{action:'convert-existing',reason:'plaintext-db-preserve-source',generateSecret:true,requiresVerifiedBackup:true});
 assert.deepEqual(classify({databaseExists:true,encrypted:false,secretStored:true}),{action:'convert-existing',reason:'plaintext-db-preserve-source',generateSecret:false,requiresVerifiedBackup:true});
});
test('classifierul encryption identifică DB nouă și state incomplete ca inspect-required',()=>{
 const classify=require('./storage-adapter').classifySQLiteEncryptionState;
 assert.deepEqual(classify({databaseExists:false,secretStored:false}),{action:'create-encrypted',reason:'new-database',reuseStoredSecret:false});
 assert.deepEqual(classify({databaseExists:true,secretStored:true}),{action:'inspect-required',reason:'state-incomplete'});
 assert.deepEqual(classify({databaseExists:true,encrypted:null,secretStored:false}),{action:'inspect-required',reason:'state-incomplete'});
 assert.deepEqual(classify({databaseExists:'yes',encrypted:false,secretStored:false}),{action:'inspect-required',reason:'state-incomplete'});
});

test('web storage adapter enumerates prefixed keys for crash recovery',async()=>{
 const raw=new Map([['collector_audio_lifecycle_v1:index','[]'],['collector_audio_lifecycle_v1:orphan','cp'],['unrelated','x']]);
 const backing={get length(){return raw.size},key(i){return [...raw.keys()][i]??null},getItem(k){return raw.get(k)??null},setItem(k,v){raw.set(k,String(v))},removeItem(k){raw.delete(k)}};
 const adapter=createWebStorageAdapter(backing);
 assert.deepEqual(await adapter.listRawKeys('collector_audio_lifecycle_v1:'),['collector_audio_lifecycle_v1:index','collector_audio_lifecycle_v1:orphan']);
});

test('SQLite storage enumerates prefixed keys and excludes unrelated records',async()=>{
 const native=fakeSQLite(),adapter=createSQLiteStorageAdapter({sqlite:native.sqlite,legacyStorage:fakeStorage()});
 await adapter.writeRaw('collector_audio_lifecycle_v1:index','[]');
 await adapter.writeRaw('collector_audio_lifecycle_v1:record','{}');
 await adapter.writeRaw('unrelated','x');
 assert.deepEqual(await adapter.listRawKeys('collector_audio_lifecycle_v1:'),['collector_audio_lifecycle_v1:index','collector_audio_lifecycle_v1:record']);
});
