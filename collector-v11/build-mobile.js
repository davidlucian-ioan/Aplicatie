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
