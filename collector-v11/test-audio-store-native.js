'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createNativeStore}=require('./audio-store');

function fixture({legacyRecords=[],failWrite=false,failIndexWrite=false}={}){
 const files=new Map(),values=new Map(),removed=[];
 const filesystem={
  async mkdir(){},
  async writeFile({path,data}){if(failWrite)throw new Error('disk full');files.set(path,Buffer.from(data,'base64'))},
  async getUri({path}){return {uri:'file:///app/'+path}},
  async stat({path}){const value=files.get(path);if(!value)throw new Error('not found');return {size:value.length}},
  async deleteFile({path}){if(!files.has(path))throw new Error('not found');files.delete(path)},
  async readdir({path}){return {files:[...files.keys()].filter(key=>key.startsWith(path+'/')).map(key=>({name:key.slice(path.length+1),type:'file'}))}}
 };
 const storage={
  async readRaw(key){return values.get(key)??null},
  async writeRaw(key,value){if(failIndexWrite&&key==='collector_audio_index_v1')throw new Error('index unavailable');values.set(key,String(value))},
  async removeRaw(key){values.delete(key)}
 };
 let legacy=legacyRecords.slice();
 const legacyStore={
  async list(){return legacy.slice()},
  async get(id){return legacy.find(row=>row.id===id)||null},
  async remove(id){removed.push(id);legacy=legacy.filter(row=>row.id!==id);return true}
 };
 return {store:createNativeStore({filesystem,storage,legacyStore}),files,values,removed,legacy:()=>legacy};
}
test('native audio adapter migrates IndexedDB blobs to app-private files before deleting legacy records',async()=>{
 const old={id:'audio-old',createdAt:'2026-11-24T10:00:00.000Z',durationMs:1200,mimeType:'audio/webm',size:4,blob:new Blob(['test'])};
 const x=fixture({legacyRecords:[old]});
 await x.store.initialize();
 const rows=await x.store.list();
 assert.equal(rows.length,1);assert.equal(rows[0].id,'audio-old');
 assert.ok(x.files.has('collector-audio/legacy-audio-old.webm'));
 assert.deepEqual(x.removed,['audio-old']);assert.equal(x.legacy().length,0);
});
test('native audio metadata is stored in SQLite and files are removed only with their record',async()=>{
 const x=fixture();await x.store.initialize();
 const record={id:'audio-native',createdAt:'2026-11-24T11:00:00.000Z',durationMs:5000,mimeType:'audio/aac',size:10,filePath:'collector-audio/audio-native.aac',uri:'file:///app/collector-audio/audio-native.aac'};
 x.files.set(record.filePath,Buffer.from('audio'));
 const saved=await x.store.saveNative(record);
 assert.equal(saved.id,record.id);
 assert.equal((await x.store.get(record.id)).uri,record.uri);
 assert.equal((await x.store.list()).length,1);
 assert.equal(await x.store.remove(record.id),true);
 assert.equal(x.files.has(record.filePath),false);
 assert.equal((await x.store.list()).length,0);
});
test('failed legacy file migration keeps the original IndexedDB record',async()=>{
 const old={id:'audio-keep',createdAt:'2026-11-24T10:00:00.000Z',durationMs:1200,mimeType:'audio/webm',size:4,blob:new Blob(['test'])};
 const x=fixture({legacyRecords:[old],failWrite:true});
 await assert.rejects(x.store.initialize(),/disk full/);
 assert.equal(x.legacy().length,1);assert.deepEqual(x.removed,[]);
});
test('native audio adapter rejects a corrupted metadata index without overwriting it',async()=>{
 const x=fixture();x.values.set('collector_audio_index_v1','not-json');
 await assert.rejects(x.store.initialize());
 assert.equal(x.values.get('collector_audio_index_v1'),'not-json');
});

test('native recording metadata can be renamed without changing audio file',async()=>{
 const x=fixture();await x.store.initialize();const record={id:'audio-title',createdAt:'2026-11-24T11:00:00.000Z',durationMs:5000,mimeType:'audio/aac',size:10,filePath:'collector-audio/audio-title.aac',uri:'file:///app/collector-audio/audio-title.aac'};x.files.set(record.filePath,Buffer.from('audio'));await x.store.saveNative(record);const renamed=await x.store.rename(record.id,'B3 verificare pH');assert.equal(renamed.title,'B3 verificare pH');assert.equal((await x.store.get(record.id)).title,'B3 verificare pH');assert.ok(x.files.has(record.filePath));
});

test('failed metadata commit cleans up the newly written audio file',async()=>{
 const x=fixture({failIndexWrite:true});
 await x.store.initialize();
 await assert.rejects(x.store.save({id:'audio-orphan',createdAt:'2026-11-25T10:00:00.000Z',durationMs:1000,mimeType:'audio/webm',blob:new Blob(['audio'])}),/index unavailable/);
 assert.equal(x.files.has('collector-audio/audio-orphan.webm'),false);
 assert.equal(x.values.has('collector_audio_index_v1'),false);
});
test('failed legacy metadata commit cleans destination but preserves the legacy recording',async()=>{
 const old={id:'audio-legacy-commit',createdAt:'2026-11-24T10:00:00.000Z',durationMs:1200,mimeType:'audio/webm',size:4,blob:new Blob(['test'])};
 const x=fixture({legacyRecords:[old],failIndexWrite:true});
 await assert.rejects(x.store.initialize(),/index unavailable/);
 assert.equal(x.files.has('collector-audio/legacy-audio-legacy-commit.webm'),false);
 assert.equal(x.legacy().length,1);
 assert.deepEqual(x.removed,[]);
});

test('native audio adapter preserves web recorder recovery when native plugin is unavailable',async()=>{
 const calls=[];
 const legacyStore={
  async initialize(){},
  async list(){return []},
  async get(){return null},
  async remove(){return true},
  async beginSession(session){calls.push(['begin',session.id]);return session},
  async appendSessionChunk(id,chunk,durationMs){calls.push(['chunk',id,chunk.size,durationMs]);return true},
  async listInterruptedSessions(){calls.push(['list']);return [{id:'web-session',chunkCount:1}]},
  async recoverSession(id){calls.push(['recover',id]);return {id,blob:new Blob(['partial'])}},
  async removeSession(id){calls.push(['remove-session',id]);return true}
 };
 const storage={async readRaw(){return null},async writeRaw(){}};
 const store=createNativeStore({filesystem:{async mkdir(){}},storage,legacyStore});
 await store.initialize();
 await store.beginSession({id:'web-session',mimeType:'audio/webm'});
 await store.appendSessionChunk('web-session',new Blob(['part']),250);
 assert.equal((await store.listInterruptedSessions()).length,1);
 assert.equal((await store.recoverSession('web-session')).id,'web-session');
 assert.equal(await store.removeSession('web-session'),true);
 assert.deepEqual(calls.map(call=>call[0]),['begin','chunk','list','recover','remove-session']);
});

test('native audio clearAll removes indexed files, orphaned files, legacy recordings and the metadata index',async()=>{
 const old={id:'audio-legacy-clear',createdAt:'2026-11-24T10:00:00.000Z',durationMs:1200,mimeType:'audio/webm',size:4,blob:new Blob(['legacy'])};
 const x=fixture({legacyRecords:[old]});
 await x.store.initialize();
 const native={id:'audio-native-clear',createdAt:'2026-11-25T10:00:00.000Z',durationMs:800,mimeType:'audio/aac',size:4,filePath:'collector-audio/audio-native-clear.aac',uri:'file:///app/collector-audio/audio-native-clear.aac'};
 x.files.set(native.filePath,Buffer.from('data'));await x.store.saveNative(native);
 x.files.set('collector-audio/orphaned-audio.webm',Buffer.from('orphan'));
 const result=await x.store.clearAll();
 assert.equal(result.recordings,2);
 assert.equal(x.files.size,0);
 assert.equal(x.values.has('collector_audio_index_v1'),false);
 assert.equal((await x.store.list()).length,0);
});
