'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

async function configureNativeProjects({root=__dirname,platforms=[]}={}){
 const completed=[];
 for(const platform of platforms){
  if(platform==='android'){
   const file=path.join(root,'android','app','src','main','AndroidManifest.xml');
   let xml=await fs.readFile(file,'utf8');
   const permission='android.permission.RECORD_AUDIO';
   if(!xml.includes('android:name="'+permission+'"')){
    const manifest=xml.match(/<manifest\b[^>]*>/);
    if(!manifest)throw new Error('AndroidManifest.xml nu conține elementul manifest.');
    xml=xml.replace(manifest[0],manifest[0]+'\n    <uses-permission android:name="'+permission+'" />');
    await fs.writeFile(file,xml);
   }
   completed.push('android');
  }else if(platform==='ios'){
   const file=path.join(root,'ios','App','App','Info.plist');
   let xml=await fs.readFile(file,'utf8');
   const key='NSMicrophoneUsageDescription';
   if(!xml.includes('<key>'+key+'</key>')){
    const entry='    <key>'+key+'</key>\n    <string>Collector folosește microfonul pentru înregistrări audio inițiate de tine.</string>\n';
    if(!xml.includes('</dict>'))throw new Error('Info.plist nu conține dicționarul principal.');
    xml=xml.replace('</dict>',entry+'</dict>');
    await fs.writeFile(file,xml);
   }
   completed.push('ios');
  }else{
   throw new Error('Platformă nativă necunoscută: '+platform);
  }
 }
 return completed;
}

if(require.main===module){
 const platforms=process.argv.slice(2);
 configureNativeProjects({platforms}).then(done=>{
  process.stdout.write('Native permissions configured: '+done.join(', ')+'\n');
 }).catch(error=>{
  process.stderr.write('Native configuration failed: '+error.message+'\n');
  process.exitCode=1;
 });
}
module.exports={configureNativeProjects};
