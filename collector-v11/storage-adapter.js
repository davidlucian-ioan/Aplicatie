(function(root){
 'use strict';
 function createWebStorageAdapter(storage){
  const backing=storage||root.localStorage;
  if(!backing)throw new Error('Web Storage nu este disponibil.');
  let queue=Promise.resolve(),initialized=false;
  return Object.freeze({
   async initialize(){initialized=true;return true},
   async readRaw(key){if(!initialized)await this.initialize();return backing.getItem(String(key))},
   async writeRaw(key,value){
    if(!initialized)await this.initialize();
    const name=String(key),serialized=String(value);
    const operation=queue.then(()=>{backing.setItem(name,serialized);return true});
    queue=operation.catch(()=>false);
    return operation;
   },
   async removeRaw(key){
    if(!initialized)await this.initialize();
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
