import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'www');
const assets = [
  'index.html',
  'style.css',
  'engine.js',
  'audio-store.js',
  'app.js',
  'ai/core-port-browser.js',
];

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'ai'), { recursive: true });

for (const relativePath of assets) {
  const source = path.join(root, relativePath);
  const destination = path.join(output, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

const html = await readFile(path.join(output, 'index.html'), 'utf8');
const localReferences = [
  ...html.matchAll(/(?:src|href)="([^"]+)"/g),
].map((match) => match[1]).filter((value) =>
  !/^(?:[a-z]+:|#|\/\/)/i.test(value)
);
const missing = localReferences.filter((reference) => {
  const clean = reference.split(/[?#]/, 1)[0];
  return !assets.includes(clean);
});

if (missing.length) {
  throw new Error(`Android web bundle contains unresolved local assets: ${missing.join(', ')}`);
}

const bundle = spawnSync('npx', [
  '--yes',
  '--package=esbuild@0.25.11',
  'esbuild',
  'android-native-entry.js',
  '--bundle',
  '--format=iife',
  '--outfile=www/android-native-entry.js',
], { cwd: root, encoding: 'utf8' });

if (bundle.status !== 0) {
  throw new Error(bundle.stderr || bundle.stdout || 'Could not bundle the Android native bridge.');
}

const indexPath = path.join(output, 'index.html');
let bundledHtml = await readFile(indexPath, 'utf8');
if (!bundledHtml.includes('android-native-entry.js')) {
  const appScript = '<script src="app.js';
  if (!bundledHtml.includes(appScript)) {
    throw new Error('Could not find the Collector app.js script tag to inject the Android bridge.');
  }
  bundledHtml = bundledHtml.replace(appScript, '<script src="android-native-entry.js"></script>' + appScript);
  await writeFile(indexPath, bundledHtml);
}

console.log(`Prepared Android web bundle in ${path.relative(root, output)} (${assets.length} source files plus native bridge).`);
