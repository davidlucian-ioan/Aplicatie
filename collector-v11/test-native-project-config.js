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
  await fs.writeFile(file,'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name=".MainActivity" /></application></manifest>');
  await configureNativeProjects({root,platforms:['android']});
  await configureNativeProjects({root,platforms:['android']});
  const xml=await fs.readFile(file,'utf8');
  assert.equal((xml.match(/android\.permission\.RECORD_AUDIO/g)||[]).length,1);
  assert.ok(xml.indexOf('uses-permission')<xml.indexOf('<application'));
  assert.match(xml,/android:launchMode="standard"/);
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
  await fs.writeFile(projectFile,`/* Begin PBXBuildFile section */
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
/* End PBXFileReference section */
/* Begin PBXGroup section */
A00000000000000000000001 /* App */ = { isa = PBXGroup; children = ( B00000000000000000000001, ); path = App; sourceTree = "<group>"; };
/* End PBXGroup section */
/* Begin PBXResourcesBuildPhase section */
C00000000000000000000001 = { isa = PBXResourcesBuildPhase; files = ( ); };
/* End PBXResourcesBuildPhase section */
/* Begin PBXProject section */
D00000000000000000000001 = { isa = PBXProject; attributes = { TargetAttributes = { E00000000000000000000001 = { CreatedOnToolsVersion = 15.0; }; }; }; };
/* End PBXProject section */
`);
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
  assert.equal((project.match(/C011EC000000000000000001/g)||[]).length,3);
  assert.equal((project.match(/C011EC000000000000000002/g)||[]).length,2);
  assert.equal((project.match(/com.apple.InAppPurchase/g)||[]).length,1);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('respinge platformele necunoscute',async()=>{
 await assert.rejects(configureNativeProjects({root:os.tmpdir(),platforms:['windows'] }),/Platformă nativă necunoscută/);
});
