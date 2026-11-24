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
 'collector-config.js',
 'reminders.js',
 'native-audio-recorder.js',
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
 // Bundle native Capacitor plugin bridges only when their packages are installed.
 const indexPath=path.join(target,'index.html');
 let html=await fs.readFile(indexPath,'utf8');
 const bridges=[
  {source:path.join(ROOT,'node_modules','@capacitor-community','sqlite','dist','plugin.js'),file:'capacitor-sqlite.js',marker:'<script src="storage-adapter.js?v=0.1"></script>'},
  {source:path.join(ROOT,'node_modules','@capacitor','filesystem','dist','plugin.js'),file:'capacitor-filesystem.js',marker:'<script src="audio-store.js?v=0.1"></script>'},
  {source:path.join(ROOT,'node_modules','@capacitor','local-notifications','dist','plugin.js'),file:'local-notifications.js',marker:'<script src="reminders.js?v=0.1"></script>'},
  {source:path.join(ROOT,'node_modules','@capgo','capacitor-audio-recorder','dist','plugin.js'),file:'capacitor-audio-recorder.js',marker:'<script src="native-audio-recorder.js?v=0.1"></script>'}
 ];
 for(const bridge of bridges){
  try{
   await fs.access(bridge.source);
   const vendorDir=path.join(target,'vendor');
   await fs.mkdir(vendorDir,{recursive:true});
   await fs.copyFile(bridge.source,path.join(vendorDir,bridge.file));
   if(!html.includes(bridge.marker))throw new Error('Nu găsesc punctul de încărcare pentru pluginul '+bridge.file+'.');
   html=html.replace(bridge.marker,'<script src="vendor/'+bridge.file+'"></script>'+bridge.marker);
  }catch(error){
   if(error.code!=='ENOENT')throw error;
  }
 }
 const apiBaseUrl=String(process.env.COLLECTOR_API_BASE_URL||'').trim().replace(/\/+$/,'');
 if(apiBaseUrl&&!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(apiBaseUrl))throw new Error('COLLECTOR_API_BASE_URL trebuie să fie un URL HTTPS valid.');
 await fs.writeFile(path.join(target,'collector-config.js'),"(function(root){'use strict';root.CollectorConfig=Object.freeze({apiBaseUrl:"+JSON.stringify(apiBaseUrl)+"});})(typeof window!=='undefined'?window:globalThis);\n");
 await fs.writeFile(indexPath,html);
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
