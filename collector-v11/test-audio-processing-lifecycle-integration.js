'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
test('both app shells load lifecycle module before app entrypoint',()=>{
 for(const file of ['index.html','index-server.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const lifecycle=html.indexOf('audio-processing-lifecycle.js');
  const app=html.indexOf('app.js');
  assert.notEqual(lifecycle,-1,file+' missing lifecycle module');
  assert.ok(lifecycle<app,file+' lifecycle module must load before app.js');
 }
});
test('app initializes durable checkpoint store only after StorageAdapter initialization',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const storageInit=app.indexOf('await storageAdapter.initialize();');
 const checkpointInit=app.indexOf('CollectorAudioLifecycleCheckpointStore=window.CollectorAudioProcessingLifecycle?.createStorageCheckpointStore(storageAdapter)');
 assert.notEqual(storageInit,-1);assert.notEqual(checkpointInit,-1);assert.ok(storageInit<checkpointInit);
 assert.match(app,/CollectorAudioLifecycleRecovery=\{list:/);
 assert.match(app,/refreshAudioLifecycleRecovery/);
});
test('recovery UI is diagnostics-only and does not trigger automatic processing or deletion',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/audioLifecycleRecoveryRefresh/);
 assert.match(html,/audioLifecycleRecovery/);
 assert.match(app,/recovery manual, fără auto-retry\/ștergere/);
});

test('recovery API exposes diagnostics and Work UI reports repaired orphan checkpoints',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.match(app,/diagnostics:\(\)=>window\.CollectorAudioLifecycleCheckpointStore\?\.diagnostics/);
 assert.match(app,/orphanIds/);
 assert.match(app,/reindexat checkpoint-uri orfane/);
});
test('storage adapters provide key enumeration required for orphan checkpoint recovery',()=>{
 const adapter=fs.readFileSync(path.join(root,'storage-adapter.js'),'utf8');
 assert.match(adapter,/async listRawKeys\(prefix=''/);
 assert.match(adapter,/SELECT key FROM collector_kv WHERE key LIKE/);
});
