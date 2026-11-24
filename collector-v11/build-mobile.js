'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

const ROOT=__dirname;
const WEB_FILES=[
 'index.html',
 'style.css',
 'engine.js',
 'audio-store.js',
 'storage-adapter.js',
 'reminders.js',
 'app.js',
 'ai/core-port-browser.js',
 'ai/provider-openai-browser.js'
];

async function buildMobile(outDir=path.join(ROOT,'www')){
 const target=path.resolve(outDir);
 if(target===ROOT||!target.startsWith(ROOT+path.sep))throw new Error('Directorul de ieșire trebuie să fie în interiorul proiectului.');
 await fs.rm(target,{recursive:true,force:true});
 await fs.mkdir(target,{recursive:true});
 for(const relative of WEB_FILES){
  const source=path.join(ROOT,relative),destination=path.join(target,relative);
  await fs.access(source);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.copyFile(source,destination);
 }
 // Bundle the official Local Notifications bridge only when its package is installed.
 const notificationPlugin=path.join(ROOT,'node_modules','@capacitor','local-notifications','dist','plugin.js');
 try{
  await fs.access(notificationPlugin);
  const vendorDir=path.join(target,'vendor');
  await fs.mkdir(vendorDir,{recursive:true});
  await fs.copyFile(notificationPlugin,path.join(vendorDir,'local-notifications.js'));
  const indexPath=path.join(target,'index.html');
  const html=await fs.readFile(indexPath,'utf8');
  const marker='<script src="reminders.js?v=0.1"></script>';
  if(!html.includes(marker))throw new Error('Nu găsesc punctul de încărcare pentru modulul de alarme.');
  await fs.writeFile(indexPath,html.replace(marker,'<script src="vendor/local-notifications.js"></script>'+marker));
 }catch(error){
  if(error.code!=='ENOENT')throw error;
 }
 return {outDir:target,files:WEB_FILES.slice()};
}

if(require.main===module){
 buildMobile().then(result=>{
  process.stdout.write('Collector mobile bundle: '+result.files.length+' fișiere în '+result.outDir+'\n');
 }).catch(error=>{
  process.stderr.write('Mobile bundle failed: '+error.message+'\n');
  process.exitCode=1;
 });
}
module.exports={buildMobile,WEB_FILES};
