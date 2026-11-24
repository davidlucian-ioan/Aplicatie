'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createWebStorageAdapter,createSQLiteStorageAdapter,createAutoStorageAdapter}=require('./storage-adapter');
function fakeStorage(seed={}){
 const values=new Map(Object.entries(seed));let failWrite=false;
 return {getItem:key=>values.has(key)?values.get(key):null,setItem(key,value){if(failWrite)throw new Error('quota exceeded');values.set(key,String(value))},removeItem:key=>values.delete(key),has:key=>values.has(key),value:key=>values.get(key),fail(value){failWrite=value}};
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
  async query(options){calls.push(['query',options]);const value=values.get(options.values[0]);return {values:value===undefined?[]:[{value}]}},
  async run(options){calls.push(['run',options]);const [key,value]=options.values;if(options.statement.startsWith('INSERT'))values.set(key,value);else values.delete(key);return {changes:{changes:1}}}
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
