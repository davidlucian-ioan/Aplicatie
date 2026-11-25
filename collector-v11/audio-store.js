(function(global){
 'use strict';
 const DB_NAME='collector-audio-assets',DB_VERSION=3,STORE='recordings',SESSIONS='recording_sessions',CHUNKS='recording_chunks',INDEX_KEY='collector_audio_index_v1';
 let opening=null;
 function openDb(){
  if(!('indexedDB' in global))return Promise.reject(new Error('IndexedDB nu este disponibil în acest browser.'));
  if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   const request=global.indexedDB.open(DB_NAME,DB_VERSION);
   request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:'id'});store.createIndex('createdAt','createdAt',{unique:false})}if(!db.objectStoreNames.contains(SESSIONS)){const sessions=db.createObjectStore(SESSIONS,{keyPath:'id'});sessions.createIndex('updatedAt','updatedAt',{unique:false})}if(!db.objectStoreNames.contains(CHUNKS)){const chunks=db.createObjectStore(CHUNKS,{keyPath:['sessionId','sequence']});chunks.createIndex('sessionId','sessionId',{unique:false})}};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||new Error('Nu pot deschide stocarea audio.'));
   request.onblocked=()=>reject(new Error('Stocarea audio este blocată de o altă filă deschisă.'));
  }).catch(error=>{opening=null;throw error});
  return opening;
 }
 function transaction(mode,action,storeName=STORE){return openDb().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName);let request;
  try{request=action(store)}catch(error){reject(error);return}
  tx.oncomplete=()=>resolve(request?.result);
  tx.onerror=()=>reject(request?.error||tx.error||new Error('Tranzacția audio a eșuat.'));
  tx.onabort=()=>reject(request?.error||tx.error||new Error('Tranzacția audio a fost anulată.'));
 }))}
 function restoreBlob(record){
  if(!record)return record;
  if(record.blob instanceof Blob)return record;
  if(!(record.audioData instanceof ArrayBuffer))return record;
  const {audioData,...metadata}=record;
  return {...metadata,blob:new Blob([audioData],{type:record.mimeType||'application/octet-stream'})};
 }
 const webStore={
  async initialize(){return true},
  async save(record){
   if(!record?.id||!(record.blob instanceof Blob)||!record.blob.size)throw new Error('Înregistrarea audio este invalidă sau goală.');
   const {blob,...metadata}=record,audioData=await blob.arrayBuffer();
   return transaction('readwrite',store=>store.put({...metadata,audioData}));
  },
  get(id){return transaction('readonly',store=>store.get(id)).then(restoreBlob)},
  list(){return transaction('readonly',store=>store.getAll()).then(records=>records.map(restoreBlob).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))))},
  remove(id){return transaction('readwrite',store=>store.delete(id))},
  async rename(id,title){const name=String(title||'').trim();if(!name||name.length>100)throw new Error('Titlul trebuie să aibă 1–100 de caractere.');const record=await webStore.get(id);if(!record)throw new Error('Înregistrarea nu a fost găsită.');const {blob,...metadata}=record;const audioData=blob?await blob.arrayBuffer():metadata.audioData;return transaction('readwrite',store=>store.put({...metadata,title:name,audioData}))},
  async beginSession(session){
   if(!session?.id||!session.mimeType)throw new Error('Sesiunea audio nu are metadate valide.');
   const row={id:session.id,createdAt:session.createdAt||new Date().toISOString(),mimeType:session.mimeType,chunkCount:0,nextSequence:0,durationMs:0,updatedAt:new Date().toISOString()};
   await transaction('readwrite',store=>store.put(row),SESSIONS);return row;
  },
  async appendSessionChunk(id,chunk,durationMs=0){
   if(!id||!(chunk instanceof Blob)||!chunk.size)return false;
   // WebKit can reject Blob structured-clone writes in some IndexedDB versions.
   // Store a plain ArrayBuffer so chunk checkpoints remain portable across engines.
   const data=await chunk.arrayBuffer(),mimeType=chunk.type||'application/octet-stream';
   return openDb().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction([SESSIONS,CHUNKS],'readwrite'),sessions=tx.objectStore(SESSIONS),chunks=tx.objectStore(CHUNKS),request=sessions.get(id);let result,error;
    request.onsuccess=()=>{const row=request.result;if(!row){error=new Error('Sesiunea audio nu mai există.');try{tx.abort()}catch{}return}const sequence=Number(row.nextSequence)||0;result=chunks.put({sessionId:id,sequence,data,mimeType,size:data.byteLength});row.nextSequence=sequence+1;row.chunkCount=(Number(row.chunkCount)||0)+1;row.durationMs=Math.max(Number(row.durationMs)||0,Number(durationMs)||0);row.updatedAt=new Date().toISOString();sessions.put(row)};
    tx.oncomplete=()=>resolve(result?.result??true);
    tx.onerror=()=>reject(error||request.error||tx.error||new Error('Nu am putut salva fragmentul audio.'));
    tx.onabort=()=>reject(error||request.error||tx.error||new Error('Salvarea fragmentului audio a fost anulată.'));
   }));
  },
  listInterruptedSessions(){return transaction('readonly',store=>store.getAll(),SESSIONS).then(rows=>rows.filter(row=>(Number(row.chunkCount)>0)||Array.isArray(row.chunks)&&row.chunks.some(chunk=>chunk instanceof Blob&&chunk.size>0)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))))},
  async recoverSession(id){
   const session=await transaction('readonly',store=>store.get(id),SESSIONS);
   if(!session)throw new Error('Sesiunea audio întreruptă nu a fost găsită.');
   let chunks=(session.chunks||[]).filter(chunk=>chunk instanceof Blob&&chunk.size>0);
   if(!chunks.length){
    const rows=await transaction('readonly',store=>store.index('sessionId').getAll(id),CHUNKS);
    chunks=rows.sort((a,b)=>a.sequence-b.sequence).map(row=>{
     if(row.blob instanceof Blob)return row.blob; // Backward compatibility with pre-ArrayBuffer checkpoints.
     if(row.data instanceof ArrayBuffer)return new Blob([row.data],{type:row.mimeType||session.mimeType||'application/octet-stream'});
     if(ArrayBuffer.isView(row.data))return new Blob([row.data],{type:row.mimeType||session.mimeType||'application/octet-stream'});
     return null;
    }).filter(blob=>blob instanceof Blob&&blob.size>0);
   }
   const blob=new Blob(chunks,{type:session.mimeType||chunks[0]?.type||'audio/webm'});
   if(!blob.size)throw new Error('Sesiunea nu conține fragmente audio recuperabile.');
   const record={id:session.id,createdAt:session.createdAt||new Date().toISOString(),durationMs:Number(session.durationMs)||0,mimeType:blob.type||'audio/webm',size:blob.size,blob,recovered:true,warning:'Înregistrare recuperată din fragmente salvate periodic. Verifică redarea.'};
   await webStore.save(record);await webStore.removeSession(id);return record;
  },
  async clearAll(){
   const db=await openDb();
   return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORE,SESSIONS,CHUNKS],'readwrite');
    tx.objectStore(STORE).clear();tx.objectStore(SESSIONS).clear();tx.objectStore(CHUNKS).clear();
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error('Nu am putut șterge stocarea audio locală.'));
    tx.onabort=()=>reject(tx.error||new Error('Ștergerea stocării audio a fost anulată.'));
   });
  },
  async removeSession(id){
   return openDb().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction([SESSIONS,CHUNKS],'readwrite'),sessions=tx.objectStore(SESSIONS),chunks=tx.objectStore(CHUNKS);
    sessions.delete(id);
    const request=chunks.index('sessionId').openCursor(id);
    request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue()}};
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(request.error||tx.error||new Error('Nu am putut șterge checkpointul audio.'));
    tx.onabort=()=>reject(request.error||tx.error||new Error('Ștergerea checkpointului audio a fost anulată.'));
   }));
  },
 };
 function safeFileName(id){return String(id).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)||'audio'}
 function isSafeAudioFilePath(path){return typeof path==='string'&&/^collector-audio\/[A-Za-z0-9_-]+\.(?:aac|webm)$/i.test(path)}
 async function blobToBase64(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));
  return global.btoa(binary);
 }
 function createNativeStore({filesystem,storage,legacyStore=webStore}={}){
  if(!filesystem||!storage)throw new TypeError('Filesystem sau StorageAdapter nu este disponibil pentru audio nativ.');
  let initialization=null;
  async function readIndex(){
   const raw=await storage.readRaw(INDEX_KEY);
   if(raw===null)return [];
   const rows=JSON.parse(raw),ids=new Set();
   if(!Array.isArray(rows)||rows.some(row=>{
    if(!row||typeof row.id!=='string'||!row.id.trim()||typeof row.filePath!=='string'||!isSafeAudioFilePath(row.filePath)||typeof row.uri!=='string'||!row.uri.trim()||typeof row.createdAt!=='string'||!row.createdAt.trim()||!Number.isFinite(Number(row.size))||Number(row.size)<0)return true;
    if(ids.has(row.id))return true;
    ids.add(row.id);return false;
   }))throw new Error('Indexul audio nativ este invalid. Datele nu au fost suprascrise.');
   return rows;
  }
  async function writeIndex(rows){await storage.writeRaw(INDEX_KEY,JSON.stringify(rows));return rows}
  async function ensureDirectory(){await filesystem.mkdir({path:'collector-audio',directory:'DATA',recursive:true})}
  async function migrateLegacy(){
   const rows=await readIndex(),legacy=await legacyStore.list();let current=rows.slice();
   for(const old of legacy){
    if(current.some(row=>row.id===old.id)){await legacyStore.remove(old.id);continue}
    if(!(old.blob instanceof Blob)||!old.blob.size)continue;
    const filePath='collector-audio/legacy-'+safeFileName(old.id)+'.webm';
    await filesystem.writeFile({path:filePath,data:await blobToBase64(old.blob),directory:'DATA',encoding:'base64',recursive:true});
    try{
     const location=await filesystem.getUri({path:filePath,directory:'DATA'});
     const row={id:old.id,createdAt:old.createdAt,durationMs:Number(old.durationMs)||0,mimeType:old.mimeType||'audio/webm',size:Number(old.size)||old.blob.size,filePath,uri:location.uri};
     current=[...current,row];await writeIndex(current);await legacyStore.remove(old.id);
    }catch(error){
     try{await filesystem.deleteFile({path:filePath,directory:'DATA'})}catch(cleanupError){}
     throw error;
    }
   }
  }
  async function initialize(){
   if(!initialization)initialization=(async()=>{await ensureDirectory();await migrateLegacy();return true})().catch(error=>{initialization=null;throw error});
   return initialization;
  }
  async function saveNative(record){
   await initialize();
   if(!record?.id||!isSafeAudioFilePath(record.filePath)||!record.uri)throw new Error('Referința fișierului audio nativ este invalidă.');
   const rows=await readIndex(),next=rows.filter(row=>row.id!==record.id);
   const metadata={id:record.id,createdAt:record.createdAt||new Date().toISOString(),durationMs:Number(record.durationMs)||0,mimeType:record.mimeType||'audio/aac',size:Number(record.size)||0,filePath:record.filePath,uri:record.uri,warning:record.warning||null};
   await writeIndex([...next,metadata]);return metadata;
  }
  return Object.freeze({
   initialize,
   beginSession(session){if(typeof legacyStore.beginSession!=='function')return Promise.reject(new Error('Backup-ul periodic nu este disponibil.'));return legacyStore.beginSession(session)},
   appendSessionChunk(id,chunk,durationMs){if(typeof legacyStore.appendSessionChunk!=='function')return Promise.reject(new Error('Backup-ul periodic nu este disponibil.'));return legacyStore.appendSessionChunk(id,chunk,durationMs)},
   listInterruptedSessions(){return typeof legacyStore.listInterruptedSessions==='function'?legacyStore.listInterruptedSessions():Promise.resolve([])},
   recoverSession(id){if(typeof legacyStore.recoverSession!=='function')return Promise.reject(new Error('Recuperarea sesiunii web nu este disponibilă.'));return legacyStore.recoverSession(id)},
   removeSession(id){return typeof legacyStore.removeSession==='function'?legacyStore.removeSession(id):Promise.resolve(false)},
   async save(record){
    await initialize();
    if(!record?.id||!(record.blob instanceof Blob)||!record.blob.size)throw new Error('Înregistrarea audio este invalidă sau goală.');
    const filePath='collector-audio/'+safeFileName(record.id)+'.webm';
    const rows=await readIndex(),existing=rows.find(row=>row.id===record.id);
    await filesystem.writeFile({path:filePath,data:await blobToBase64(record.blob),directory:'DATA',encoding:'base64',recursive:true});
    try{
     const location=await filesystem.getUri({path:filePath,directory:'DATA'});
     return await saveNative({...record,filePath,uri:location.uri});
    }catch(error){
     if(existing?.filePath!==filePath){try{await filesystem.deleteFile({path:filePath,directory:'DATA'})}catch(cleanupError){}}
     throw error;
    }
   },
   saveNative,
   async rename(id,title){await initialize();const name=String(title||'').trim();if(!name||name.length>100)throw new Error('Titlul trebuie să aibă 1–100 de caractere.');const rows=await readIndex(),row=rows.find(item=>item.id===id);if(!row)throw new Error('Înregistrarea nu a fost găsită în indexul nativ.');row.title=name;await writeIndex(rows);return row},
   async get(id){await initialize();const row=(await readIndex()).find(item=>item.id===id);return row||legacyStore.get(id)},
   async list(){
    await initialize();
    const rows=await readIndex(),legacy=await legacyStore.list(),known=new Set(rows.map(row=>row.id));
    return [...rows,...legacy.filter(row=>!known.has(row.id))].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   },
   async remove(id){
    await initialize();
    const rows=await readIndex(),row=rows.find(item=>item.id===id);
    if(!row)return legacyStore.remove(id);
    if(!isSafeAudioFilePath(row.filePath))throw new Error('Calea înregistrării audio este invalidă; fișierul a fost păstrat.');
    try{await filesystem.deleteFile({path:row.filePath,directory:'DATA'})}catch(error){if(!/not.?found|does not exist|no such file/i.test(String(error?.message||error)))throw error}
    await writeIndex(rows.filter(item=>item.id!==id));return true;
   },
   async clearAll(){
    await initialize();
    const rows=await readIndex(),paths=new Set(),prefix='collector-audio/';
    for(const row of rows){
     const name=String(row.filePath||'').startsWith(prefix)?String(row.filePath).slice(prefix.length):'';
     if(!name||name.includes('/')||! /^[A-Za-z0-9_-]+\.(?:aac|webm)$/i.test(name))throw new Error('Indexul audio conține o cale locală invalidă. Fișierele nu au fost șterse.');
     paths.add(prefix+name);
    }
    if(typeof filesystem.readdir==='function'){
     let entries=[];
     try{const listing=await filesystem.readdir({path:'collector-audio',directory:'DATA'});entries=Array.isArray(listing?.files)?listing.files:[]}
     catch(error){if(!/not.?found|does not exist|no such file/i.test(String(error?.message||error)))throw error}
     for(const entry of entries){
      const name=typeof entry==='string'?entry:entry?.name;
      if(!name||entry?.type==='directory'||name.includes('/')||! /^[A-Za-z0-9_-]+\.(?:aac|webm)$/i.test(name))continue;
      paths.add(prefix+name);
     }
    }
    for(const path of paths){
     try{await filesystem.deleteFile({path,directory:'DATA'})}
     catch(error){if(!/not.?found|does not exist|no such file/i.test(String(error?.message||error)))throw error}
    }
    if(typeof legacyStore.clearAll==='function')await legacyStore.clearAll();
    else{
     const legacyRows=typeof legacyStore.list==='function'?await legacyStore.list():[];
     for(const row of legacyRows)if(typeof legacyStore.remove==='function')await legacyStore.remove(row.id);
     const sessions=typeof legacyStore.listInterruptedSessions==='function'?await legacyStore.listInterruptedSessions():[];
     for(const session of sessions)if(typeof legacyStore.removeSession==='function')await legacyStore.removeSession(session.id);
    }
    if(typeof storage.removeRaw!=='function')throw new Error('StorageAdapter nu poate șterge indexul audio nativ.');
    await storage.removeRaw(INDEX_KEY);
    return {recordings:rows.length,files:paths.size};
   }
  });
 }
 let activeStore=webStore;
 const api=Object.freeze({
  async initialize({capacitor=global.Capacitor,filesystem=capacitor?.Plugins?.Filesystem,storage=global.CollectorStorage}={}){
   if(typeof capacitor?.isNativePlatform==='function'&&capacitor.isNativePlatform()){
    activeStore=createNativeStore({filesystem,storage});
    await activeStore.initialize();
   }else{activeStore=webStore;await activeStore.initialize()}
   return true;
  },
  save(record){return activeStore.save(record)},
  saveNative(record){if(typeof activeStore.saveNative!=='function')return Promise.reject(new Error('Stocarea audio nativă nu este inițializată.'));return activeStore.saveNative(record)},
  get(id){return activeStore.get(id)},
  list(){return activeStore.list()},
  remove(id){return activeStore.remove(id)},
  rename(id,title){if(typeof activeStore.rename!=='function')return Promise.reject(new Error('Redenumirea nu este disponibilă.'));return activeStore.rename(id,title)},
  beginSession(session){if(typeof activeStore.beginSession!=='function')return Promise.reject(new Error('Backup-ul periodic nu este disponibil pe această platformă.'));return activeStore.beginSession(session)},
  appendSessionChunk(id,chunk,durationMs){if(typeof activeStore.appendSessionChunk!=='function')return Promise.reject(new Error('Backup-ul periodic nu este disponibil pe această platformă.'));return activeStore.appendSessionChunk(id,chunk,durationMs)},
  listInterruptedSessions(){if(typeof activeStore.listInterruptedSessions!=='function')return Promise.resolve([]);return activeStore.listInterruptedSessions()},
  recoverSession(id){if(typeof activeStore.recoverSession!=='function')return Promise.reject(new Error('Recuperarea sesiunii web nu este disponibilă.'));return activeStore.recoverSession(id)},
  removeSession(id){if(typeof activeStore.removeSession!=='function')return Promise.resolve(false);return activeStore.removeSession(id)},
  clearAll(){if(typeof activeStore.clearAll!=='function')return Promise.reject(new Error('Ștergerea stocării audio nu este disponibilă.'));return activeStore.clearAll()}
 });
 global.CollectorAudioStore=api;
 if(typeof module!=='undefined'&&module.exports)module.exports={createNativeStore,webStore,transaction,openDb};
})(typeof window!=='undefined'?window:globalThis);
