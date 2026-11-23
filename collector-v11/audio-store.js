(function(global){
 'use strict';
 const DB_NAME='collector-audio-assets',DB_VERSION=1,STORE='recordings';
 let opening=null;
 function openDb(){
  if(!('indexedDB' in global))return Promise.reject(new Error('IndexedDB nu este disponibil în acest browser.'));
  if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   const request=global.indexedDB.open(DB_NAME,DB_VERSION);
   request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:'id'});store.createIndex('createdAt','createdAt',{unique:false})}};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||new Error('Nu pot deschide stocarea audio.'));
   request.onblocked=()=>reject(new Error('Stocarea audio este blocată de o altă filă deschisă.'));
  }).catch(error=>{opening=null;throw error});
  return opening;
 }
 function transaction(mode,action){return openDb().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let request;
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
 const api={
  async save(record){
   if(!record?.id||!(record.blob instanceof Blob)||!record.blob.size)return Promise.reject(new Error('Înregistrarea audio este invalidă sau goală.'));
   // Store bytes rather than Blob objects: WebKit has had inconsistent Blob structured-clone
   // behavior in IndexedDB. ArrayBuffer is consistently structured-cloneable across engines.
   const {blob,...metadata}=record;
   const audioData=await blob.arrayBuffer();
   return transaction('readwrite',store=>store.put({...metadata,audioData}));
  },
  get(id){return transaction('readonly',store=>store.get(id)).then(restoreBlob)},
  list(){return transaction('readonly',store=>store.getAll()).then(records=>records.map(restoreBlob).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))))},
  remove(id){return transaction('readwrite',store=>store.delete(id))}
 };
 global.CollectorAudioStore=Object.freeze(api);
})(window);
