(function(global){
 'use strict';
 const DB_NAME='collector-audio-assets',DB_VERSION=2,RECORDINGS='recordings',TRANSCRIPTS='transcripts';
 let opening=null;
 function openDb(){
  if(!('indexedDB' in global))return Promise.reject(new Error('IndexedDB nu este disponibil în acest browser.'));
  if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   const request=global.indexedDB.open(DB_NAME,DB_VERSION);
   request.onupgradeneeded=()=>{
    const db=request.result;
    if(!db.objectStoreNames.contains(RECORDINGS)){
     const store=db.createObjectStore(RECORDINGS,{keyPath:'id'});
     store.createIndex('createdAt','createdAt',{unique:false});
    }
    if(!db.objectStoreNames.contains(TRANSCRIPTS)){
     const store=db.createObjectStore(TRANSCRIPTS,{keyPath:'id'});
     store.createIndex('createdAt','createdAt',{unique:false});
    }
   };
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null};resolve(db)};
   request.onerror=()=>reject(request.error||new Error('Nu pot deschide stocarea audio.'));
   request.onblocked=()=>reject(new Error('Stocarea audio este blocată de o altă filă deschisă.'));
  }).catch(error=>{opening=null;throw error});
  return opening;
 }
 function transaction(storeName,mode,action){
  return openDb().then(db=>new Promise((resolve,reject)=>{
   let tx,request;
   try{tx=db.transaction(storeName,mode);request=action(tx.objectStore(storeName))}
   catch(error){reject(error);return}
   tx.oncomplete=()=>resolve(request?.result);
   tx.onerror=()=>reject(request?.error||tx.error||new Error('Tranzacția locală a eșuat.'));
   tx.onabort=()=>reject(request?.error||tx.error||new Error('Tranzacția locală a fost anulată.'));
  }));
 }
 function restoreBlob(record){
  if(!record)return record;
  if(record.blob instanceof Blob)return record;
  if(!(record.audioData instanceof ArrayBuffer))return record;
  const {audioData,...metadata}=record;
  return {...metadata,blob:new Blob([audioData],{type:record.mimeType||'application/octet-stream'})};
 }
 function validateTranscriptSession(session){
  if(!session||typeof session!=='object'||typeof session.id!=='string'||!session.id||
     !Array.isArray(session.segments)||session.segments.length>10000){
   throw new TypeError('Sesiunea de transcriere este invalidă.');
  }
  for(const segment of session.segments){
   if(!segment||typeof segment.id!=='string'||typeof segment.text!=='string'||
      !segment.text.trim()||!Number.isFinite(segment.startOffsetMs)||!Number.isFinite(segment.endOffsetMs)||
      segment.startOffsetMs<0||segment.endOffsetMs<segment.startOffsetMs){
    throw new TypeError('Un segment al transcrierii are structură sau timestamp invalid.');
   }
  }
  return structuredClone(session);
 }
 const api={
  async save(record){
   if(!record?.id||!(record.blob instanceof Blob)||!record.blob.size)return Promise.reject(new Error('Înregistrarea audio este invalidă sau goală.'));
   const {blob,...metadata}=record;
   const audioData=await blob.arrayBuffer();
   return transaction(RECORDINGS,'readwrite',store=>store.put({...metadata,audioData}));
  },
  get(id){return transaction(RECORDINGS,'readonly',store=>store.get(id)).then(restoreBlob)},
  list(){return transaction(RECORDINGS,'readonly',store=>store.getAll()).then(records=>records.map(restoreBlob).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))))},
  remove(id){return transaction(RECORDINGS,'readwrite',store=>store.delete(id))},
  saveTranscriptSession(session){
   const value=validateTranscriptSession(session);
   value.updatedAt=new Date().toISOString();
   return transaction(TRANSCRIPTS,'readwrite',store=>store.put(value));
  },
  getTranscriptSession(id){return transaction(TRANSCRIPTS,'readonly',store=>store.get(id))},
  listTranscriptSessions(){
   return transaction(TRANSCRIPTS,'readonly',store=>store.getAll())
    .then(items=>items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))));
  },
  removeTranscriptSession(id){return transaction(TRANSCRIPTS,'readwrite',store=>store.delete(id))}
 };
 global.CollectorAudioStore=Object.freeze(api);
})(window);
