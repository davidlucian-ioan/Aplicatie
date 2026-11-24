'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createWebStorageAdapter}=require('./storage-adapter');
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
