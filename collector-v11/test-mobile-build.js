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
 const androidJobStart=workflow.indexOf('  android:');
 assert.notEqual(androidJobStart,-1,'Android workflow job must exist');
 const androidSection=workflow.slice(androidJobStart,iosJobStart);
 assert.ok(iosSection.includes('npm run mobile:install-toolchain'),'iOS must use the shared pinned native toolchain');
 const packageJson=JSON.parse(await fs.readFile(path.join(__dirname,'package.json'),'utf8'));
 const installer=packageJson.scripts['mobile:install-toolchain'];
 for(const dependency of ['@supabase/supabase-js@2.119.2','@aparajita/capacitor-secure-storage@8.0.1','esbuild@0.28.2','@capacitor/core@8.6.2','@capacitor/cli@8.6.2','@capacitor/android@8.6.2','@capacitor/ios@8.6.2'])assert.ok(installer.includes(dependency),'shared toolchain must pin '+dependency);
 assert.match(iosSection,/run: npm run mobile:install-toolchain && \.\/node_modules\/\.bin\/cap --version/);
 assert.match(iosSection,/run: \.\/node_modules\/\.bin\/cap add ios/);
 assert.match(iosSection,/run: \.\/node_modules\/\.bin\/cap sync ios/);
 assert.doesNotMatch(iosSection,/npm install .*@capacitor\/ios@/,'platform install must not prune shared CLI dependencies');
 assert.match(androidSection,/run: npm run mobile:install-toolchain && \.\/node_modules\/\.bin\/cap --version/);
 assert.match(androidSection,/run: \.\/node_modules\/\.bin\/cap add android/);
 assert.match(androidSection,/run: \.\/node_modules\/\.bin\/cap sync android/);
 assert.doesNotMatch(androidSection,/npm install .*@capacitor\/android@/,'platform install must not prune shared CLI dependencies');
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

test('all HTML entrypoints expose the same searchable Think and Work-first UI',async()=>{
 const entrypoints=['index.html','index-server.html','Deschide-prin-dublu-click.html'];
 const pageHeadings=['Entități','Relații și locații','Populații și solduri','Financiar','Atribute','Evenimente','Istoric','Audit și integritate'];
 const filterTargets=['relationList','locationList','stockList','financeList','attributeList','eventList','auditList'];
 for(const entrypoint of entrypoints){
  const html=await fs.readFile(path.join(__dirname,entrypoint),'utf8');
  for(const heading of pageHeadings)assert.ok(html.includes('<h2>'+heading+'</h2>'),entrypoint+' missing heading '+heading);
  for(const target of filterTargets)assert.ok(html.includes('data-filter-target="'+target+'"'),entrypoint+' missing search filter '+target);
  assert.ok(html.includes('id="entitySearch"'),entrypoint+' missing entity search');
  assert.ok(html.includes('id="entitySearchCount"'),entrypoint+' missing entity search result count');
  assert.match(html,/id="assistant" class="page active work-layout"/);
  const recorder=html.indexOf('class="panel recorder-panel work-recorder"');
  const command=html.indexOf('class="panel work-command"');
  const reminders=html.indexOf('class="panel reminders-panel work-reminders"');
  assert.ok(recorder>=0&&command>recorder&&reminders>command,entrypoint+' must expose Work in recorder → command → reminders order');
  assert.ok(html.includes('id="audioRecoverPending"'),entrypoint+' missing interrupted-audio recovery action');
  assert.ok(html.includes('subscriptions.js?v=0.1'),entrypoint+' missing subscriptions client');
 }
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 assert.ok(app.includes("addEventListener('click',recoverInterruptedAudio)"),'recovery button must invoke the recovery handler');
 const css=await fs.readFile(path.join(__dirname,'style.css'),'utf8');
 assert.ok(css.includes('.page.active.work-layout{display:grid}'),'active Work page must use the capture grid');
});

test('HTML entrypoints are balanced and Work layout CSS is parseable',async()=>{
 for(const file of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
  const html=await fs.readFile(path.join(__dirname,file),'utf8');
  assert.equal((html.match(/<div\b/g)||[]).length,(html.match(/<\/div>/g)||[]).length,file+' must have balanced div elements');
 }
 const css=await fs.readFile(path.join(__dirname,'style.css'),'utf8');
 assert.ok(css.includes('grid-template-columns:repeat(auto-fit,minmax(180px,1fr))'),'finance grid repeat() must be closed');
 assert.ok(css.includes('.page.active.work-layout{display:grid}'));
 assert.ok(css.includes('.work-recorder{order:1'));
 assert.ok(css.includes('.work-command{order:2'));
 assert.ok(css.includes('.work-reminders{order:3}'));
 assert.ok(!css.includes('\\n/* Work capture'),'CSS must not contain escaped source line breaks');
});

test('all entrypoints expose guarded full local-data erasure without cloud account deletion',async()=>{
 for(const file of ['index.html','index-server.html','Deschide-prin-dublu-click.html']){
  const html=await fs.readFile(path.join(__dirname,file),'utf8');
  assert.ok(html.includes('id="clearLocalData"'),file+' missing local data erasure control');
  assert.ok(html.includes('id="localDataClearStatus"'),file+' missing local data erasure status');
  assert.ok(html.includes('Contul cloud, sesiunea de autentificare și abonamentul din Google Play / App Store rămân active'),file+' must distinguish local erase from cloud and billing');
 }
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 assert.ok(app.includes('if(audioStartPending||audioRecorder||nativeAudioSession)'));
 assert.ok(app.includes('await mutationQueue.catch(()=>undefined)'));
 assert.ok(app.includes('await window.CollectorNativeAudioRecorder?.discardPending?.()'));
 assert.ok(app.includes('await window.CollectorAudioStore.clearAll()'));
 assert.ok(app.includes('await window.CollectorReminders?.clearAll?.()'));
 assert.ok(app.includes('await storageAdapter.clearCollectorData()'));
});


test('reminder initialization remains retryable after transient service setup failure',async()=>{
 const reminders=await fs.readFile(path.join(__dirname,'reminders.js'),'utf8');
 const initialize=reminders.slice(reminders.indexOf('async function initialize(){'),reminders.indexOf('root.CollectorReminders='));
 assert.ok(initialize.includes('try{service=createService({storage,plugin})}'));
 assert.ok(initialize.includes('catch(error){if(status)status.textContent=error.message;return}'),'failed setup must return without marking initialized');
 const nativeSetup=initialize.slice(initialize.indexOf('const storage='));
 const setupTry=nativeSetup.indexOf('try{service=createService({storage,plugin})}');
 const setupCatch=nativeSetup.indexOf('catch(error){if(status)status.textContent=error.message;return}',setupTry);
 const successfulInit=nativeSetup.indexOf('initialized=true;',setupCatch);
 assert.ok(setupTry>=0&&setupCatch>setupTry&&successfulInit>setupCatch,'native service initialization is marked complete only after successful setup');
 assert.ok(initialize.includes('if(!form)return;'),'missing UI must not permanently consume initialization');
});

test('Work draft autosave operations are serialized so a stale write cannot overwrite a clear',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 const draft=app.slice(app.indexOf('function initializeWorkDraft()'),app.indexOf('async function clearAllLocalData()'));
 assert.ok(draft.includes('let writeVersion=0,draftWriteQueue=Promise.resolve()'),'draft writes must have a serial queue');
 assert.ok(draft.includes('draftWriteQueue=draftWriteQueue.catch(()=>undefined).then('),'each write/removal must follow the previous storage operation');
 assert.ok(draft.includes('const version=++writeVersion,value=input.value'),'typing must invalidate stale restore/status operations');
 assert.ok(draft.includes('await enqueueDraftWrite(\'\',version)'),'clear must enqueue removal after pending autosaves');
 assert.ok(draft.includes('storageAdapter[(value.trim()?\'writeRaw\':\'removeRaw\')]'),'empty drafts must remove the key through the serialized queue');
});

test('audio playback is detached before deleting the currently playing recording',async()=>{
 const app=await fs.readFile(path.join(__dirname,'app.js'),'utf8');
 assert.ok(app.includes('audioPlaybackRecordId=null'));
 assert.ok(app.includes('function clearAudioPlayback(){'));
 assert.ok(app.includes('if(audioPlaybackRecordId===recordId)clearAudioPlayback()'));
 assert.ok(app.includes('function setAudioPlayback(recordId,source,ownedObjectUrl=null){'));
 assert.ok(app.includes('audioObjectUrl=ownedObjectUrl'));
 assert.ok(app.includes('setAudioPlayback(record.id,objectUrl,objectUrl)'),'blob playback must retain ownership of its object URL');
 assert.ok(app.includes('audioPlaybackRecordId=recordId'));
 const nativeStop=app.slice(app.indexOf('async function stopAudioRecording()'),app.indexOf('async function playAudioRecording('));
 assert.ok(nativeStop.includes('setAudioPlayback(record.id,window.CollectorNativeAudioRecorder.toPlayableUrl(record.uri))'),'native stop must register playback ownership so deleting the active recording cleans the player');

 assert.ok(app.includes('clearAudioPlayback()'),'local data erasure must stop and release the active player');
});
