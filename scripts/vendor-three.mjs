// Kopiert three.js und genau die Addons, die js/viewer.js und js/app.js importieren, samt
// ihrer transitiven relativen Importe (Pass, CopyShader, GTAOShader, SimplexNoise, three.core …)
// aus node_modules nach vendor/three/ und minifiziert sie dabei mit esbuild. Die Seite lädt
// three über die Importmap in index.html von dort — nicht aus node_modules (30 MB, tausende
// Dateien, per FTP unbrauchbar) und nicht mehr vom CDN (jede Besucher-IP ging an jsdelivr;
// dasselbe Argument wie bei den Schriften).
//
// Minifiziert wird selbst, weil three seit r186 keine .min-Builds mehr veröffentlicht und der
// Hoster unkomprimiert ausliefert: three.module.js + three.core.js wären roh 2,1 MB. esbuild
// lässt Import-/Exportpfade und Eigenschaftsnamen unangetastet; die Zugriffe auf
// OrbitControls-Interna (_sphericalDelta, _rotateLeft …) bleiben also gültig.
//
// Ablauf nach einem Versionswechsel: `npm install three@<version> --save-exact`, `npm run vendor`,
// Seite prüfen, vendor/three committen. Bricht mit Fehler ab, wenn ein Addon etwas importiert,
// das die Importmap nicht kennt (three/webgpu, three/tsl) — dann muss die Importmap erweitert
// werden.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve, posix } from 'node:path';
import { transform } from 'esbuild';

const ROOT = resolve(import.meta.dirname, '..');
const PKG = join(ROOT, 'node_modules', 'three');
const OUT = join(ROOT, 'vendor', 'three');
const BUILD = 'build/three.module.js';

if (!existsSync(join(PKG, 'package.json'))) {
  console.error('node_modules/three fehlt — erst `npm install`.');
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;

// Einstiege: alles, was der Viewer aus three/addons/ importiert, plus der Build selbst.
const quellen = ['js/viewer.js', 'js/app.js'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
const addons = [...quellen.matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)].map((m) => 'examples/jsm/' + m[1]);
const offen = [BUILD, ...addons];

// Transitive Hülle über relative Importe/Exporte ("from './Pass.js'", "export * from '../x.js'").
const gesehen = new Set();
while (offen.length) {
  const rel = offen.pop();
  if (gesehen.has(rel)) continue;
  const pfad = join(PKG, rel);
  if (!existsSync(pfad)) {
    console.error(`fehlt im Paket: ${rel}`);
    process.exit(1);
  }
  gesehen.add(rel);
  const src = readFileSync(pfad, 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    offen.push(posix.normalize(posix.join(posix.dirname(rel), m[1])));
  }
  for (const m of src.matchAll(/from\s*['"](three\/[^'"]+)['"]/g)) {
    if (m[1].startsWith('three/addons/')) offen.push('examples/jsm/' + m[1].slice('three/addons/'.length));
    else { console.error(`${rel} importiert ${m[1]} — nicht in der Importmap`); process.exit(1); }
  }
}

// Alten Bestand verwerfen, damit nach einem Versionswechsel nichts liegen bleibt, was niemand
// mehr importiert (r185 → r186: die .min-Dateien).
rmSync(OUT, { recursive: true, force: true });

let roh = 0, klein = 0;
for (const rel of [...gesehen].sort()) {
  const src = readFileSync(join(PKG, rel), 'utf8');
  const { code } = await transform(src, { minify: true, format: 'esm' });
  const nach = join(OUT, rel);
  mkdirSync(dirname(nach), { recursive: true });
  writeFileSync(nach, code);
  roh += Buffer.byteLength(src);
  klein += Buffer.byteLength(code);
}
copyFileSync(join(PKG, 'LICENSE'), join(OUT, 'LICENSE'));
console.log(`three ${version}: ${gesehen.size} Module, ${Math.round(roh / 1024)} KB → ${Math.round(klein / 1024)} KB minifiziert → vendor/three/`);
for (const rel of [...gesehen].sort()) console.log('  ' + rel);
