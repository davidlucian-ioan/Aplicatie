'use strict';
const fs=require('node:fs');
const path=require('node:path');

const EXPECTED=Object.freeze({
 '@capacitor/core':'8.6.2',
 '@capacitor/cli':'8.6.2',
 '@capacitor/local-notifications':'8.3.1',
 '@capacitor-community/sqlite':'8.1.1',
 '@capacitor/filesystem':'8.1.5',
 '@capgo/capacitor-audio-recorder':'8.4.1',
 '@supabase/supabase-js':'2.119.2',
 '@aparajita/capacitor-secure-storage':'8.0.1',
 '@revenuecat/purchases-capacitor':'14.1.2',
 'esbuild':'0.28.2',
 '@capacitor/android':'8.6.2',
 '@capacitor/ios':'8.6.2'
});
function findPackageManifest(entry){
 let directory=path.dirname(entry);
 while(true){
  const candidate=path.join(directory,'package.json');
  try{const manifest=JSON.parse(fs.readFileSync(candidate,'utf8'));if(manifest.name)return {path:candidate,manifest};}catch{}
  const parent=path.dirname(directory);
  if(parent===directory)return null;
  directory=parent;
 }
}
function verifyMobileToolchain({resolve=require.resolve,expected=EXPECTED}={}){
 const errors=[],actual={};
 for(const [name,version] of Object.entries(expected)){
  let found;
  try{found=findPackageManifest(resolve(name));}catch(error){errors.push(name+': not installed ('+error.message+')');continue}
  if(!found){errors.push(name+': package manifest not found');continue}
  actual[name]=found.manifest.version;
  if(found.manifest.name!==name)errors.push(name+': resolved unexpected package '+found.manifest.name);
  if(found.manifest.version!==version)errors.push(name+': expected '+version+', found '+found.manifest.version);
 }
 return {ok:errors.length===0,actual,errors};
}
if(require.main===module){
 const result=verifyMobileToolchain();
 if(!result.ok){process.stderr.write('Mobile toolchain verification failed:\\n'+result.errors.join('\\n')+'\\n');process.exitCode=1}
 else process.stdout.write('Mobile native toolchain versions verified ('+Object.keys(result.actual).length+' packages).\\n');
}
module.exports={EXPECTED,verifyMobileToolchain};
