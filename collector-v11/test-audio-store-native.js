'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createNativeStore}=require('./audio-store');

function fixture({legacyRecords=[],failWrite=false,failIndexWrite=false}={}){
 const files=new Map(),values=new Map(),removed=[];
 const filesystem={
  async mkdir(){},
  async writeFile({path,data}){if(failWrite)throw new Error('disk full');files.set(path,Buffer.from(data,'base64'))},
  async readFile({path}){const value=files.get(path);if(!value)throw Error('not found');return {data:value.toString('base64')}},
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
test('native audio deletion refuses a corrupted index path and preserves the file',async()=>{
 const x=fixture();await x.store.initialize();
 const row={id:'audio-path-guard',createdAt:'2026-11-25T10:00:00.000Z',durationMs:100,mimeType:'audio/aac',size:4,filePath:'../private/secret.aac',uri:'file:///app/private/secret.aac'};
 x.values.set('collector_audio_index_v1',JSON.stringify([row]));
 x.files.set('../private/secret.aac',Buffer.from('secret'));
 await assert.rejects(x.store.remove(row.id),/Indexul audio nativ este invalid/);
 assert.equal(x.files.has('../private/secret.aac'),true,'must not delete a file outside the managed audio folder');
 assert.deepEqual(JSON.parse(x.values.get('collector_audio_index_v1')),[row],'must preserve corrupted metadata for recovery');
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
test('native audio index fails closed for unsafe paths and duplicate IDs',async()=>{
 const x=fixture();await x.store.initialize();
 const unsafe={id:'bad',createdAt:'2026-11-25T10:00:00.000Z',durationMs:1,mimeType:'audio/aac',size:1,filePath:'../outside.aac',uri:'file:///outside.aac'};
 x.values.set('collector_audio_index_v1',JSON.stringify([unsafe]));
 await assert.rejects(x.store.list(),/Indexul audio nativ este invalid/);
 assert.equal(x.values.get('collector_audio_index_v1'),JSON.stringify([unsafe]),'invalid index is preserved verbatim');
 const valid={...unsafe,id:'same',filePath:'collector-audio/same.aac',uri:'file:///app/collector-audio/same.aac'};
 x.values.set('collector_audio_index_v1',JSON.stringify([valid,{...valid,uri:'file:///duplicate.aac'}]));
 await assert.rejects(x.store.get('same'),/Indexul audio nativ este invalid/);
});

test('native audio adapter rejects a corrupted metadata index without overwriting it',async()=>{
 const x=fixture();x.values.set('collector_audio_index_v1','not-json');
 await assert.rejects(x.store.initialize());
 assert.equal(x.values.get('collector_audio_index_v1'),'not-json');
});

test('native recording metadata can be renamed without changing audio file',async()=>{
 const x=fixture();await x.store.initialize();const record={id:'audio-title',createdAt:'2026-11-24T11:00:00.000Z',durationMs:5000,mimeType:'audio/aac',size:10,filePath:'collector-audio/audio-title.aac',uri:'file:///app/collector-audio/audio-title.aac'};x.files.set(record.filePath,Buffer.from('audio'));await x.store.saveNative(record);const renamed=await x.store.rename(record.id,'B3 verificare pH');assert.equal(renamed.title,'B3 verificare pH');assert.equal((await x.store.get(record.id)).title,'B3 verificare pH');assert.ok(x.files.has(record.filePath));
});

test('native audio adapter rejects unsafe file paths before indexing',async()=>{
 const x=fixture();await x.store.initialize();
 await assert.rejects(x.store.saveNative({id:'bad-path',filePath:'../outside.aac',uri:'file:///app/outside.aac'}),/Referința fișierului audio nativ este invalidă/);
 assert.equal(x.values.has('collector_audio_index_v1'),false);
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

test('audio backup exports file contents and imports only new recordings',async()=>{
 const x=fixture();await x.store.initialize();
 const existing={id:'existing',createdAt:'2026-11-25T10:00:00.000Z',durationMs:1,mimeType:'audio/aac',size:4,filePath:'collector-audio/existing.aac',uri:'file:///existing.aac'};
 x.files.set(existing.filePath,Buffer.from('data'));await x.store.saveNative(existing);
 const backup=await x.store.exportBackup();
 assert.equal(backup.format,'collector-audio-backup.v1');
 assert.equal(backup.recordings.length,1);
 assert.equal(Buffer.from(backup.recordings[0].data,'base64').toString(),'data');
 const second=fixture();await second.store.initialize();
 const result=await second.store.importBackup(backup);
 assert.deepEqual(result,{imported:1,skipped:0});
 const rows=await second.store.list();
 assert.equal(rows[0].id,'existing');
 assert.equal(Buffer.from(second.files.get(rows[0].filePath)).toString(),'data');
 const duplicate=await second.store.importBackup(backup);
 assert.deepEqual(duplicate,{imported:0,skipped:1});
 assert.equal((await second.store.list()).length,1,'duplicate ID must not overwrite');
});

test('audio backup import rejects malformed records rather than silently skipping them',async()=>{
 const x=fixture();await x.store.initialize();
 await assert.rejects(x.store.importBackup({format:'collector-audio-backup.v1',recordings:[{id:'invalid-record',createdAt:'2026-11-25T10:00:00.000Z',data:'YQ==',durationMs:1,mimeType:'audio/aac'}]}),/element invalid/);
 assert.equal(x.files.size,0);
});

test('audio backup import rejects malformed base64 and rolls back written files when index commit fails',async()=>{
 const x=fixture({failIndexWrite:true});await x.store.initialize();
 const malformed={format:'collector-audio-backup.v1',recordings:[{id:'bad',createdAt:'2026-11-25T10:00:00.000Z',durationMs:1,mimeType:'audio/aac',data:'!invalid!'}]};
 await assert.rejects(x.store.importBackup(malformed),/base64 invalide/);
 const valid={format:'collector-audio-backup.v1',recordings:[{id:'new',createdAt:'2026-11-25T10:00:00.000Z',durationMs:10,mimeType:'audio/aac',size:3,data:Buffer.from('abc').toString('base64')}]};
 await assert.rejects(x.store.importBackup(valid),/index unavailable/);
 assert.equal(x.files.size,0,'files written before failed metadata commit are removed');
 assert.equal(x.values.has('collector_audio_index_v1'),false);
});

test('audio backup import enforces recording count and aggregate size limits',async()=>{
 const x=fixture();await x.store.initialize();
 const tooMany={format:'collector-audio-backup.v1',recordings:Array.from({length:101},(_,i)=>({id:'id'+i,createdAt:'2026-11-25T10:00:00.000Z',durationMs:1,mimeType:'audio/aac',data:'YQ=='}))};
 await assert.rejects(x.store.importBackup(tooMany),/Format backup audio invalid/);
 const tooLarge={format:'collector-audio-backup.v1',recordings:[{id:'big',createdAt:'2026-11-25T10:00:00.000Z',durationMs:1,mimeType:'audio/aac',data:'A'.repeat(70*1024*1024)}]};
 await assert.rejects(x.store.importBackup(tooLarge),/limita totală|metadata sau fișier invalid/);
});

test('clearAll refuses an unsafe index before deleting any managed audio file',async()=>{
 const x=fixture();await x.store.initialize();
 const safe={id:'safe-audio',createdAt:'2026-11-25T10:00:00.000Z',durationMs:1,mimeType:'audio/aac',size:4,filePath:'collector-audio/safe-audio.aac',uri:'file:///app/collector-audio/safe-audio.aac'};
 x.files.set(safe.filePath,Buffer.from('audio'));
 x.values.set('collector_audio_index_v1',JSON.stringify([safe,{...safe,id:'unsafe',filePath:'collector-audio/../secret.aac'}]));
 await assert.rejects(x.store.clearAll(),/Indexul audio nativ este invalid|Indexul audio conține o cale locală invalidă/);
 assert.equal(x.files.has(safe.filePath),true,'validation must happen before deletion starts');
 assert.equal(x.values.has('collector_audio_index_v1'),true,'metadata must be preserved for recovery');
});

test('failed interrupted audio recovery leaves original session checkpoints available',async()=>{
 const sessions=[{id:'interrupted',chunkCount:2}];
 const legacyStore={
  async initialize(){},async list(){return []},async get(){return null},async remove(){return true},
  async beginSession(){return true},async appendSessionChunk(){return true},
  async listInterruptedSessions(){return sessions.slice()},
  async recoverSession(){throw new Error('recovery write failed')},
  async removeSession(){sessions.splice(0,1);return true}
 };
 const storage={async readRaw(){return null},async writeRaw(){},async removeRaw(){}};
 const x=createNativeStore({filesystem:{async mkdir(){}},storage,legacyStore});
 await x.initialize();
 await assert.rejects(x.recoverSession('interrupted'),/recovery write failed/);
 assert.deepEqual(await x.listInterruptedSessions(),sessions,'failed recovery must not erase the source session');
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
