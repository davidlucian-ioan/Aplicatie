'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

const PRIVACY_MANIFEST='<?xml version="1.0" encoding="UTF-8"?>\\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\\n<plist version="1.0">\\n<dict>\\n  <key>NSPrivacyAccessedAPITypes</key>\\n  <array>\\n    <dict>\\n      <key>NSPrivacyAccessedAPIType</key>\\n      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>\\n      <key>NSPrivacyAccessedAPITypeReasons</key>\\n      <array><string>C617.1</string></array>\\n    </dict>\\n  </array>\\n</dict>\\n</plist>\\n';
function addPrivacyManifestToProject(project){
 const fileRef='C011EC000000000000000001',buildRef='C011EC000000000000000002';
 if(project.includes('PrivacyInfo.xcprivacy'))return project;
 const buildEnd=project.indexOf('/* End PBXBuildFile section */');
 const fileEnd=project.indexOf('/* End PBXFileReference section */');
 if(buildEnd<0||fileEnd<0)throw new Error('Secțiunile PBXBuildFile/PBXFileReference lipsesc din proiectul iOS.');
 project=project.slice(0,buildEnd)+'\\t\\t'+buildRef+' /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = '+fileRef+' /* PrivacyInfo.xcprivacy */; };\\n'+project.slice(buildEnd);
 const newFileRef='\\t\\t'+fileRef+' /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\\n';
 const currentFileEnd=project.indexOf('/* End PBXFileReference section */');
 project=project.slice(0,currentFileEnd)+newFileRef+project.slice(currentFileEnd);
 const appPath=project.indexOf('path = App;');
 const groupStart=appPath>=0?project.lastIndexOf('/* App */ = {',appPath):-1;
 const childrenStart=groupStart>=0?project.indexOf('children = (',groupStart):-1;
 const childrenEnd=childrenStart>=0?project.indexOf(');',childrenStart):-1;
 if(childrenEnd<0)throw new Error('Grupul App nu a putut fi identificat în proiectul iOS.');
 project=project.slice(0,childrenEnd)+'\\n\\t\\t\\t\\t'+fileRef+' /* PrivacyInfo.xcprivacy */, '+project.slice(childrenEnd);
 const resourceStart=project.indexOf('isa = PBXResourcesBuildPhase;');
 const resourceFiles=resourceStart>=0?project.indexOf('files = (',resourceStart):-1;
 const resourceEnd=resourceFiles>=0?project.indexOf(');',resourceFiles):-1;
 if(resourceEnd<0)throw new Error('PBXResourcesBuildPhase nu a putut fi identificat.');
 project=project.slice(0,resourceEnd)+'\\n\\t\\t\\t\\t'+buildRef+' /* PrivacyInfo.xcprivacy in Resources */, '+project.slice(resourceEnd);
 return project;
}
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
    const closing=xml.lastIndexOf('</dict>');
    xml=xml.slice(0,closing)+entry+xml.slice(closing);
    await fs.writeFile(file,xml);
   }
   if(!xml.includes('<key>UIBackgroundModes</key>')){
    const entry='    <key>UIBackgroundModes</key>\n    <array>\n        <string>audio</string>\n    </array>\n';
    const rootClosing=xml.lastIndexOf('</dict>');
    xml=xml.slice(0,rootClosing)+entry+xml.slice(rootClosing);
    await fs.writeFile(file,xml);
   }else if(!/<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<string>audio<\/string>/.test(xml)){
    const block=xml.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/);
    if(!block)throw new Error('UIBackgroundModes există, dar nu este un array valid.');
    xml=xml.replace(block[0],block[0].replace('</array>','        <string>audio</string>\n    </array>'));
    await fs.writeFile(file,xml);
   }
   const privacyPath=path.join(root,'ios','App','App','PrivacyInfo.xcprivacy');
   await fs.writeFile(privacyPath,PRIVACY_MANIFEST);
   const projectPath=path.join(root,'ios','App','App.xcodeproj','project.pbxproj');
   const project=await fs.readFile(projectPath,'utf8');
   await fs.writeFile(projectPath,addPrivacyManifestToProject(project));
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
module.exports={configureNativeProjects,addPrivacyManifestToProject,PRIVACY_MANIFEST};
