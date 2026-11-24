'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {buildMobile,WEB_FILES}=require('./build-mobile');

test('mobile bundle include doar activele runtime necesare',async()=>{
 const root=await fs.mkdtemp(path.join(__dirname,'.tmp-mobile-'));
 try{
  const out=path.join(root,'www');
  const result=await buildMobile(out);
  assert.deepEqual(result.files,WEB_FILES);
  for(const relative of WEB_FILES)await fs.access(path.join(out,relative));
  await assert.rejects(fs.access(path.join(out,'server.js')));
  await assert.rejects(fs.access(path.join(out,'.env')));
  await assert.rejects(fs.access(path.join(out,'test-engine.js')));
  const html=await fs.readFile(path.join(out,'index.html'),'utf8');
  assert.ok(html.includes('storage-adapter.js'));
  assert.ok(html.includes('reminders.js'));
  assert.ok(html.includes('ai/core-port-browser.js'));
  const notificationSource=path.join(__dirname,'node_modules','@capacitor','local-notifications','dist','plugin.js');
  let notificationsInstalled=true;
  try{await fs.access(notificationSource)}catch{notificationsInstalled=false}
  if(notificationsInstalled){
   await fs.access(path.join(out,'vendor','local-notifications.js'));
   assert.ok(html.indexOf('vendor/local-notifications.js')<html.indexOf('reminders.js'));
  }else{
   await assert.rejects(fs.access(path.join(out,'vendor','local-notifications.js')));
  }
  const sqliteSource=path.join(__dirname,'node_modules','@capacitor-community','sqlite','dist','plugin.js');
  let sqliteInstalled=true;
  try{await fs.access(sqliteSource)}catch{sqliteInstalled=false}
  if(sqliteInstalled){
   await fs.access(path.join(out,'vendor','capacitor-sqlite.js'));
   assert.ok(html.indexOf('vendor/capacitor-sqlite.js')<html.indexOf('storage-adapter.js'));
  }else{
   await assert.rejects(fs.access(path.join(out,'vendor','capacitor-sqlite.js')));
  }
 }finally{await fs.rm(root,{recursive:true,force:true})}
});

test('mobile bundle respinge directoare de ieșire în afara proiectului',async()=>{
 await assert.rejects(buildMobile(os.tmpdir()),/interiorul proiectului/);
});
