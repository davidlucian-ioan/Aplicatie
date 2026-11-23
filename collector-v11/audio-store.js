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
 function transaction(mode,action){return openDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result;try{result=action(store)}catch(error){reject(error);return}tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error||new Error('Tranzacția audio a eșuat.'));tx.onabort=()=>reject(tx.error||new Error('Tranzacția audio a fost anulată.'))}))}
 const api={
  save(record){if(!record?.id||!(record.blob instanceof Blob)||!record.blob.size) return Promise.reject(new Error('Înregistrarea audio este invalidă sau goală.'));return transaction('readwrite',store=>store.put(record))},
  get(id){return transaction('readonly',store=>store.get(id))},
  list(){return transaction('readonly',store=>store.getAll()).then(records=>records.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))))},
  remove(id){return transaction('readwrite',store=>store.delete(id))}
 };
 global.CollectorAudioStore=Object.freeze(api);
})(window);
