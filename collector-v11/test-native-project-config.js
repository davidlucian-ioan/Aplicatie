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
  await configureNativeProjects({root,platforms:['ios']});
  await configureNativeProjects({root,platforms:['ios']});
  const xml=await fs.readFile(file,'utf8');
  assert.equal((xml.match(/NSMicrophoneUsageDescription/g)||[]).length,1);
  assert.ok(xml.includes('înregistrări audio'));
  assert.ok(xml.includes('<key>UIBackgroundModes</key>'));
  assert.ok(xml.includes('<string>audio</string>'));
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('respinge platformele necunoscute',async()=>{
 await assert.rejects(configureNativeProjects({root:os.tmpdir(),platforms:['windows'] }),/Platformă nativă necunoscută/);
});
