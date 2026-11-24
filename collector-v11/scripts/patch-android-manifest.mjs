import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.env.COLLECTOR_ANDROID_MANIFEST
  || path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const resourceRoot = process.env.COLLECTOR_ANDROID_RES
  || path.join(root, 'android', 'app', 'src', 'main', 'res');
const javaRoot = process.env.COLLECTOR_ANDROID_JAVA
  || path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'collector', 'app');

let manifest = await readFile(manifestPath, 'utf8');
const speechQueryIntent = `    <intent>
      <action android:name="android.speech.RecognitionService" />
    </intent>`;
if (!manifest.includes('android.speech.RecognitionService')) {
  if (/<queries\b/.test(manifest)) {
    manifest = manifest.replace('</queries>', speechQueryIntent + '\n  </queries>');
  } else {
    const speechQueries = `  <queries>
${speechQueryIntent}
  </queries>`;
    manifest = manifest.replace(/<application\b/, speechQueries + '\n  <application');
  }
}

if (!manifest.includes('xmlns:android=')) {
  throw new Error('AndroidManifest.xml is missing the android namespace.');
}
if (!/<application\b/.test(manifest)) {
  throw new Error('AndroidManifest.xml has no application element; refusing to patch an unknown template.');
}

const permissions = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.RECEIVE_BOOT_COMPLETED',
];
const permissionLines = permissions
  .filter((permission) => !manifest.includes('android:name="' + permission + '"'))
  .map((permission) => '    <uses-permission android:name="' + permission + '" />')
  .join('\n');

if (permissionLines) {
  manifest = manifest.replace(/<application\b/, permissionLines + '\n    <application');
}

const serviceClass = 'com.collector.app.CollectorRecordingService';
if (!manifest.includes(serviceClass)) {
  const serviceDeclaration = '    <service android:name="' + serviceClass + '" android:exported="false" android:stopWithTask="false" android:process=":collector_recorder" android:foregroundServiceType="microphone" />';
  manifest = manifest.replace('</application>', serviceDeclaration + '\n  </application>');
}

const alarmReceiver = 'com.collector.app.CollectorAlarmReceiver';
if (!manifest.includes(alarmReceiver)) {
  manifest = manifest.replace('</application>', '    <receiver android:name="' + alarmReceiver + '" android:exported="false" />\n  </application>');
}
const bootReceiver = 'com.collector.app.CollectorAlarmBootReceiver';
if (!manifest.includes(bootReceiver)) {
  const declaration = '    <receiver android:name="' + bootReceiver + '" android:enabled="true" android:exported="false">\n      <intent-filter>\n        <action android:name="android.intent.action.BOOT_COMPLETED" />\n        <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />\n        <action android:name="android.intent.action.TIME_SET" />\n        <action android:name="android.intent.action.TIMEZONE_CHANGED" />\n      </intent-filter>\n    </receiver>';
  manifest = manifest.replace('</application>', declaration + '\n  </application>');
}

await writeFile(manifestPath, manifest);

const drawableDirectory = path.join(resourceRoot, 'drawable');
await mkdir(drawableDirectory, { recursive: true });
const iconPath = path.join(drawableDirectory, 'ic_stat_collector.xml');
const icon = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
  '    android:width="24dp"',
  '    android:height="24dp"',
  '    android:viewportWidth="24"',
  '    android:viewportHeight="24">',
  '    <path',
  '        android:fillColor="#FFFFFFFF"',
  '        android:pathData="M12,14a3,3 0,0 0,3 -3V5a3,3 0,0 0,-6 0v6a3,3 0,0 0,3 3zm5,-3a5,5 0,0 1,-10 0H5a7,7 0,0 0,6 6.93V21h2v-3.07A7,7 0,0 0,19 11h-2z" />',
  '</vector>',
].join('\n') + '\n';
await writeFile(iconPath, icon);

await mkdir(javaRoot, { recursive: true });
for (const file of ['MainActivity.java', 'CollectorRecorderPlugin.java', 'CollectorRecordingService.java', 'CollectorAlarmPlugin.java', 'CollectorAlarmReceiver.java', 'CollectorAlarmBootReceiver.java', 'CollectorSpeechPlugin.java']) {
  await cp(path.join(root, 'native', 'android', file), path.join(javaRoot, file));
}

console.log('Applied Collector microphone recorder and local alarm manifest, Java bridges, receivers, and notification icon.');
