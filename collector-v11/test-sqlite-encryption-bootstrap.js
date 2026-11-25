'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareSQLiteEncryption}=require('./sqlite-encryption-bootstrap');
const {createSQLiteStorageAdapter}=require('./storage-adapter');
function mockSQLite({exists=false,encrypted=false,secret=false,verifySecret=true}={}){
 const calls=[];let stored=secret,opened=false;const rows=new Map();
 return {calls,rows,sqlite:{
  async isDBExists(o){calls.push(['isDBExists',o]);return {result:exists}},
  async isDatabaseEncrypted(o){calls.push(['isDatabaseEncrypted',o]);return {result:encrypted}},
  async isSecretStored(){calls.push(['isSecretStored']);return {result:stored}},
  async setEncryptionSecret(o){calls.push(['setEncryptionSecret',o]);stored=verifySecret},
  async isConnection(){return {result:opened}},
  async createConnection(o){calls.push(['createConnection',o]);opened=true},
  async open(o){calls.push(['open',o]);opened=true},
  async execute(o){calls.push(['execute',o]);return {changes:{changes:0}}},
  async query(o){const v=rows.get(o.values[0]);return {values:v===undefined?[]:[{value:v}]}},
  async run(o){calls.push(['run',o]);const [k,v]=o.values||[];if(o.statement.startsWith('INSERT'))rows.set(k,v);else rows.delete(k);return {changes:{changes:1}}}
 }};
}
function fakeCrypto(){return {getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes}}}
test('bootstrap pentru DB nou generează secret aleator, verifică secure store și selectează secret mode',async()=>{
 const m=mockSQLite({verifySecret:true});
 const state=await prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:fakeCrypto()});
 assert.deepEqual(state,{encrypted:true,mode:'secret',state:'new-encrypted'});
 const secretCall=m.calls.find(c=>c[0]==='setEncryptionSecret');
 assert.equal(secretCall[1].passphrase.length,64);
 assert.notEqual(secretCall[1].passphrase,'collector');
 assert.ok(m.calls.some(c=>c[0]==='isSecretStored'));
});
test('DB nouă nu se creează dacă verificarea stocării secretului eșuează',async()=>{
 const m=mockSQLite({verifySecret:false});
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:fakeCrypto()}),/verification failed/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'),false);
});
test('DB criptată existentă se deschide doar cu secret secure store disponibil',async()=>{
 const m=mockSQLite({exists:true,encrypted:true,secret:true});
 const state=await prepareSQLiteEncryption({sqlite:m.sqlite});
 assert.deepEqual(state,{encrypted:true,mode:'secret',state:'existing-encrypted'});
});
test('DB criptată cu secret lipsă intră în recovery fără mutații',async()=>{
 const m=mockSQLite({exists:true,encrypted:true,secret:false});
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite}),/secret is missing/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'||c[0]==='setEncryptionSecret'),false);
});
test('DB plaintext existentă nu este convertită in-place și rămâne intactă',async()=>{
 const m=mockSQLite({exists:true,encrypted:false,secret:false});
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite}),/Safe migration is required/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'||c[0]==='setEncryptionSecret'),false);
});
test('bootstrap fail-closed dacă secure random nu este disponibil',async()=>{
 const m=mockSQLite();
 await assert.rejects(prepareSQLiteEncryption({sqlite:m.sqlite,cryptoImpl:null}),/Secure random generator unavailable/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'),false);
});
test('adapterul requireEncryption creează o bază nouă în mod criptat și persistă KV',async()=>{
 const m=mockSQLite({verifySecret:true});
 const bootstrap={prepareSQLiteEncryption:args=>prepareSQLiteEncryption({...args,cryptoImpl:fakeCrypto()})};
 const adapter=createSQLiteStorageAdapter({sqlite:m.sqlite,legacyStorage:null,encryptionBootstrap:bootstrap,requireEncryption:true});
 await adapter.writeRaw('test','secure');
 const create=m.calls.find(c=>c[0]==='createConnection');
 assert.equal(create[1].encrypted,true);
 assert.equal(create[1].mode,'secret');
 assert.equal(await adapter.readRaw('test'),'secure');
 assert.equal(adapter.getEncryptionState().state,'new-encrypted');
});
test('adapterul refuză plaintext dacă encryption mode este cerut, fără fallback necriptat',async()=>{
 const m=mockSQLite({exists:true,encrypted:false});
 const adapter=createSQLiteStorageAdapter({sqlite:m.sqlite,legacyStorage:null,encryptionBootstrap:{prepareSQLiteEncryption:args=>prepareSQLiteEncryption(args)},requireEncryption:true});
 await assert.rejects(adapter.initialize(),/Safe migration is required/);
 assert.equal(m.calls.some(c=>c[0]==='createConnection'),false);
});
