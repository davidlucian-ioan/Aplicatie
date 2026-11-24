'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {configureNativeProjects}=require('./configure-native-projects');

test('configurează permisiunea microfonului Android fără duplicate',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'collector-native-'));
 try{
  const dir=path.join(root,'android','app','src','main');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'AndroidManifest.xml');
  await fs.writeFile(file,'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>');
  await configureNativeProjects({root,platforms:['android']});
  await configureNativeProjects({root,platforms:['android']});
  const xml=await fs.readFile(file,'utf8');
  assert.equal((xml.match(/android\.permission\.RECORD_AUDIO/g)||[]).length,1);
  assert.ok(xml.indexOf('uses-permission')<xml.indexOf('<application'));
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('configurează descrierea microfonului iOS fără duplicate',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'collector-ios-'));
 try{
  const dir=path.join(root,'ios','App','App');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'Info.plist');
  await fs.writeFile(file,'<?xml version="1.0"?><plist><dict><key>CFBundleName</key><string>Collector</string><key>UILaunchScreen</key><dict><key>UIColorName</key><string>Launch</string></dict></dict></plist>');
  const projectDir=path.join(root,'ios','App','App.xcodeproj');await fs.mkdir(projectDir,{recursive:true});
  const projectFile=path.join(projectDir,'project.pbxproj');
  await fs.writeFile(projectFile,`/* Begin PBXBuildFile section */\n/* End PBXBuildFile section */\n/* Begin PBXFileReference section */\n/* End PBXFileReference section */\n/* Begin PBXGroup section */\nA00000000000000000000001 /* App */ = { isa = PBXGroup; children = ( B00000000000000000000001, ); path = App; sourceTree = "<group>"; };\n/* End PBXGroup section */\n/* Begin PBXResourcesBuildPhase section */\nC00000000000000000000001 = { isa = PBXResourcesBuildPhase; files = ( ); };\n/* End PBXResourcesBuildPhase section */\n`);
  await configureNativeProjects({root,platforms:['ios']});
  await configureNativeProjects({root,platforms:['ios']});
  const xml=await fs.readFile(file,'utf8');
  assert.equal((xml.match(/NSMicrophoneUsageDescription/g)||[]).length,1);
  assert.ok(xml.includes('înregistrări audio'));
  assert.ok(xml.includes('<key>UIBackgroundModes</key>'));
  assert.ok(xml.includes('<string>audio</string>'));
  const privacy=await fs.readFile(path.join(dir,'PrivacyInfo.xcprivacy'),'utf8');
  assert.ok(privacy.includes('NSPrivacyAccessedAPICategoryFileTimestamp'));
  assert.ok(privacy.includes('C617.1'));
  const project=await fs.readFile(projectFile,'utf8');
  assert.equal((project.match(/PrivacyInfo\.xcprivacy/g)||[]).length,3);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('respinge platformele necunoscute',async()=>{
 await assert.rejects(configureNativeProjects({root:os.tmpdir(),platforms:['windows'] }),/Platformă nativă necunoscută/);
});
