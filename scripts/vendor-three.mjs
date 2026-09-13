// Kopiert three.js und genau die Addons, die js/viewer.js und js/app.js importieren, samt
// ihrer transitiven relativen Importe (Pass, CopyShader, GTAOShader, SimplexNoise, three.core …)
// aus node_modules nach vendor/three/. Die Seite lädt three über die Importmap in index.html
// von dort — nicht aus node_modules (30 MB, tausende Dateien, per FTP unbrauchbar) und nicht
// mehr vom CDN (jede Besucher-IP ging an jsdelivr; dasselbe Argument wie bei den Schriften).
//
// Ablauf nach einem Versionswechsel: package.json anpassen, `npm install`, `npm run vendor`,
// vendor/three committen. Bricht mit Fehler ab, wenn ein Addon etwas importiert, das die
// Importmap nicht kennt (three/webgpu, three/tsl) — dann muss die Importmap erweitert werden.
import { readFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, posix } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PKG = join(ROOT, 'node_modules', 'three');
const OUT = join(ROOT, 'vendor', 'three');
const BUILD = 'build/three.module.min.js';

if (!existsSync(join(PKG, 'package.json'))) {
  console.error('node_modules/three fehlt — erst `npm install`.');
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;

// Einstiege: alles, was der Viewer aus three/addons/ importiert, plus der Build selbst.
const quellen = ['js/viewer.js', 'js/app.js'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
const addons = [...quellen.matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)].map((m) => 'examples/jsm/' + m[1]);
const offen = [BUILD, ...addons];

// Transitive Hülle über relative Importe/Exporte ("from './Pass.js'", "export * from '../x.js'",
// auch minifiziert ohne Leerzeichen).
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

let bytes = 0;
for (const rel of [...gesehen, 'LICENSE'].sort()) {
  const von = join(PKG, rel), nach = join(OUT, rel);
  mkdirSync(dirname(nach), { recursive: true });
  copyFileSync(von, nach);
  bytes += statSync(nach).size;
}
console.log(`three ${version}: ${gesehen.size} Module, ${Math.round(bytes / 1024)} KB → vendor/three/`);
for (const rel of [...gesehen].sort()) console.log('  ' + rel);
