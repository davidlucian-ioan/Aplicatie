(function(root){
 'use strict';
 const DB='collector';
 function makePassphrase(cryptoImpl){
  if(!cryptoImpl||typeof cryptoImpl.getRandomValues!=='function')throw new Error('Secure random generator unavailable; encryption bootstrap aborted.');
  const bytes=new Uint8Array(32);cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 }
 async function prepareSQLiteEncryption({sqlite,database=DB,cryptoImpl=root.crypto}={}){
  const required=['isDatabase','isDatabaseEncrypted','isSecretStored','setEncryptionSecret','createConnection'];
  if(!sqlite||required.some(method=>typeof sqlite[method]!=='function'))throw new Error('SQLite encryption APIs are incomplete; refusing plaintext fallback.');
  const dbExists=(await sqlite.isDatabase({database})).result;
  const secretStored=(await sqlite.isSecretStored()).result;
  if(typeof dbExists!=='boolean'||typeof secretStored!=='boolean')throw new Error('SQLite encryption state is unknown; recovery required.');
  if(!dbExists){
   if(secretStored){
    // A stored secret can be safely reused for a new encrypted database.
   }else{
    const passphrase=makePassphrase(cryptoImpl);
    await sqlite.setEncryptionSecret({passphrase});
    const verified=(await sqlite.isSecretStored()).result;
    if(verified!==true)throw new Error('Secure secret storage verification failed; database creation aborted.');
   }
   return Object.freeze({encrypted:true,mode:'secret',state:'new-encrypted'});
  }
  const encryptedResult=await sqlite.isDatabaseEncrypted({database});
  if(typeof encryptedResult?.result!=='boolean')throw new Error('SQLite encryption state unknown; recovery required.');
  if(encryptedResult.result){
   if(!secretStored)throw new Error('Collector database is encrypted but its secure key is missing. Recovery is required; data was not modified.');
   return Object.freeze({encrypted:true,mode:'secret',state:'existing-encrypted'});
  }
  // Never attempt an in-place conversion until a separately verified backup/restore path is available.
  throw new Error('Existing Collector database is plaintext. Safe migration is required; original data was preserved and no conversion was attempted.');
 }
 const api=Object.freeze({prepareSQLiteEncryption,makePassphrase});
 root.CollectorSQLiteEncryption=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
