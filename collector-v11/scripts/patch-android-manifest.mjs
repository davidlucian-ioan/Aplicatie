import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.env.COLLECTOR_ANDROID_MANIFEST
  || path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const resourceRoot = process.env.COLLECTOR_ANDROID_RES
  || path.join(root, 'android', 'app', 'src', 'main', 'res');

let manifest = await readFile(manifestPath, 'utf8');
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
];
const permissionLines = permissions
  .filter((permission) => !manifest.includes('android:name="' + permission + '"'))
  .map((permission) => '    <uses-permission android:name="' + permission + '" />')
  .join('\n');

if (permissionLines) {
  manifest = manifest.replace(/<application\b/, permissionLines + '\n    <application');
}

const declarations = [
  {
    marker: 'io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver',
    xml: '    <receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" android:exported="false" />',
  },
  {
    marker: 'io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService',
    xml: '    <service android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="microphone" />',
  },
];
const missingDeclarations = declarations
  .filter(({ marker }) => !manifest.includes(marker))
  .map(({ xml }) => xml)
  .join('\n');

if (missingDeclarations) {
  manifest = manifest.replace('</application>', missingDeclarations + '\n  </application>');
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

console.log('Applied Collector microphone foreground-service manifest and notification icon.');
