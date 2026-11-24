(function(root){
 'use strict';
 function createWebStorageAdapter(storage){
  const backing=storage||root.localStorage;
  if(!backing)throw new Error('Web Storage nu este disponibil.');
  let queue=Promise.resolve(),initialized=false,initialization=null;
  return Object.freeze({
   async initialize(){if(!initialization)initialization=Promise.resolve().then(()=>{initialized=true;return true});return initialization},
   async readRaw(key){await this.initialize();return backing.getItem(String(key))},
   async writeRaw(key,value){
    await this.initialize();
    const name=String(key),serialized=String(value);
    const operation=queue.then(()=>{backing.setItem(name,serialized);return true});
    queue=operation.catch(()=>false);
    return operation;
   },
   async removeRaw(key){
    await this.initialize();
    const name=String(key);
    const operation=queue.then(()=>{backing.removeItem(name);return true});
    queue=operation.catch(()=>false);
    return operation;
   },
   async flush(){await queue;return true}
  });
 }
 const api=Object.freeze({createWebStorageAdapter});
 root.CollectorStorageAdapter=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
