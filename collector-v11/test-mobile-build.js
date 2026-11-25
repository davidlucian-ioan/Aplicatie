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
  const previousApiBase=process.env.COLLECTOR_API_BASE_URL,previousSupabaseUrl=process.env.COLLECTOR_SUPABASE_URL,previousAnonKey=process.env.COLLECTOR_SUPABASE_ANON_KEY;
  process.env.COLLECTOR_API_BASE_URL='https://api.example.test';process.env.COLLECTOR_SUPABASE_URL='https://project.supabase.co';process.env.COLLECTOR_SUPABASE_ANON_KEY='anon-public-test';
  let result;
  try{result=await buildMobile(out)}finally{if(previousApiBase===undefined)delete process.env.COLLECTOR_API_BASE_URL;else process.env.COLLECTOR_API_BASE_URL=previousApiBase;if(previousSupabaseUrl===undefined)delete process.env.COLLECTOR_SUPABASE_URL;else process.env.COLLECTOR_SUPABASE_URL=previousSupabaseUrl;if(previousAnonKey===undefined)delete process.env.COLLECTOR_SUPABASE_ANON_KEY;else process.env.COLLECTOR_SUPABASE_ANON_KEY=previousAnonKey}
  assert.deepEqual(result.files,WEB_FILES);
  for(const relative of WEB_FILES)await fs.access(path.join(out,relative));
  await assert.rejects(fs.access(path.join(out,'server.js')));
  await assert.rejects(fs.access(path.join(out,'.env')));
  await assert.rejects(fs.access(path.join(out,'test-engine.js')));
  const html=await fs.readFile(path.join(out,'index.html'),'utf8');
  assert.ok(html.includes('storage-adapter.js'));
  assert.ok(html.includes('reminders.js'));
  assert.ok(html.includes('native-audio-recorder.js'));
  assert.ok(html.includes('Cheia OpenAI nu este stocată pe telefon.'));
  assert.ok(!html.includes('OPENAI_API_KEY'));
  const mobileConfig=await fs.readFile(path.join(out,'collector-config.js'),'utf8');
  assert.ok(mobileConfig.includes('apiBaseUrl'));
  assert.ok(mobileConfig.includes('https://api.example.test'));
  assert.ok(mobileConfig.includes('https://project.supabase.co'));
  assert.ok(mobileConfig.includes('anon-public-test'));
  const authBundle=await fs.readFile(path.join(out,'collector-auth-bundle.js'),'utf8');
  assert.ok(authBundle.includes('CollectorAuthBundle')||authBundle.length>1000);
  assert.ok(html.includes('ai/core-port-browser.js'));
  const capacitorConfig=JSON.parse(await fs.readFile(path.join(__dirname,'capacitor.config.json'),'utf8'));
  assert.equal(capacitorConfig.appName,'Collector');
  assert.equal(capacitorConfig.plugins.CapacitorSQLite.androidIsEncryption,false);
  assert.equal(capacitorConfig.plugins.CapacitorSQLite.iosIsEncryption,false);
  const notificationSource=path.join(__dirname,'node_modules','@capacitor','local-notifications','dist','plugin.js');
  let notificationsInstalled=true;
  try{await fs.access(notificationSource)}catch{notificationsInstalled=false}
  if(notificationsInstalled){
   await fs.access(path.join(out,'vendor','local-notifications.js'));
   assert.ok(html.indexOf('vendor/local-notifications.js')<html.indexOf('reminders.js'));
  }else{
   await assert.rejects(fs.access(path.join(out,'vendor','local-notifications.js')));
  }
  const filesystemSource=path.join(__dirname,'node_modules','@capacitor','filesystem','dist','plugin.js');
  let filesystemInstalled=true;
  try{await fs.access(filesystemSource)}catch{filesystemInstalled=false}
  if(filesystemInstalled){await fs.access(path.join(out,'vendor','capacitor-filesystem.js'));assert.ok(html.indexOf('vendor/capacitor-filesystem.js')<html.indexOf('audio-store.js'))}
  else await assert.rejects(fs.access(path.join(out,'vendor','capacitor-filesystem.js')));
  const recorderSource=path.join(__dirname,'node_modules','@capgo','capacitor-audio-recorder','dist','plugin.js');
  let recorderInstalled=true;
  try{await fs.access(recorderSource)}catch{recorderInstalled=false}
  if(recorderInstalled){await fs.access(path.join(out,'vendor','capacitor-audio-recorder.js'));assert.ok(html.indexOf('vendor/capacitor-audio-recorder.js')<html.indexOf('native-audio-recorder.js'))}
  else await assert.rejects(fs.access(path.join(out,'vendor','capacitor-audio-recorder.js')));
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


test('iOS build installs Supabase Secure Storage and esbuild for the native auth bundle',async()=>{
 const workflow=await fs.readFile(path.join(__dirname,'..','.github','workflows','collector-mobile-build.yml'),'utf8');
 const iosJobStart=workflow.indexOf('  ios:');
 assert.notEqual(iosJobStart,-1,'iOS workflow job must exist');
 const iosSection=workflow.slice(iosJobStart);
 for(const dependency of ['@supabase/supabase-js@2.119.2','@aparajita/capacitor-secure-storage@8.0.1','esbuild@0.28.2']){
  assert.ok(iosSection.includes(dependency),'iOS build must install '+dependency);
 }
});

test('Android CI retries only transient Maven throttling and limits Gradle workers',async()=>{
 const workflow=await fs.readFile(path.join(__dirname,'..','.github','workflows','collector-mobile-build.yml'),'utf8');
 const start=workflow.indexOf('name: Build Android debug APK (retry transient Maven throttling)');
 const end=workflow.indexOf('name: Upload Android debug APK',start);
 assert.notEqual(start,-1,'Android build step must exist');
 assert.notEqual(end,-1,'Android artifact upload step must exist');
 const step=workflow.slice(start,end);
 assert.match(step,/--max-workers=2/);
 assert.match(step,/for attempt in 1 2 3/);
 assert.match(step,/HTTP 429|status code 429|Too Many Requests/);
 assert.ok(step.includes('status code 5[0-9][0-9]'));
});
