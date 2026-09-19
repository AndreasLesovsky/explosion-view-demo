# Explosion View Demo

Demonstrator: QR-Code am Fenster oder an der Haustür scannen (simuliert), 3D-Modell ansehen,
Bauteil antippen, auf die Bestellliste setzen. Reines Frontend ohne Build-Schritt: statische
Dateien, three.js liegt fertig im Repo unter `vendor/three/`.

Live: https://demo.andreas-web.dev/

## Lokal starten

Die Seite braucht einen Webserver (ES-Module und GLB-Dateien laden nicht per `file://`).
Mit XAMPP genügt der Ordner unter `htdocs`; alternativ im Projektordner:

```bash
python -m http.server 8791
```

und dann http://localhost:8791/ öffnen. Mit `?debug` an der URL gibt es den Viewer als
`window.fensterViewer` in der Konsole und die Kamera-Messung `await fensterMessung()`.

## Deployment per FTP

Es gibt keinen Build. Hochgeladen wird das Repo so, wie es ist, abzüglich der Werkzeuge.
Zielordner ist das Web-Root der Domain, `index.html` liegt direkt darin.

**Muss auf den Server:**

| Was | Wann neu hochladen |
| --- | --- |
| `index.html` | nach jeder Änderung |
| `css/style.css` | nach jeder Änderung |
| `js/app.js`, `js/viewer.js`, `js/modelle.js`, `js/bestellliste.js` | nach jeder Änderung; immer zusammen mit `index.html`, die Dateien passen nur zueinander |
| `fenster.glb`, `haustuer.glb` | wenn ein Modell neu exportiert wurde |
| `vendor/three/` (ganzer Ordner) | nur nach einem three.js-Versionswechsel |
| `fonts/` (ganzer Ordner) | praktisch nie |
| `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `og-image.jpg` | praktisch nie |
| `.htaccess` | einmalig, siehe unten |

**Bleibt zu Hause** (Werkzeuge und Quellen, die Seite lädt davon nichts):

- `node_modules/`, `package.json`, `package-lock.json`, `scripts/` (vendoring von three.js)
- `dev/` (Kamera-Messung, nur in der Konsole mit `?debug`)
- `mock/`, `og-quelle.png`, `favicon-16.png`, `favicon-32.png` (Quellen und Konzeptdaten)
- `*.md`, `.gitignore`, `.claude/`

Nach dem Upload einmal die Live-Seite mit Umschalt+Neuladen prüfen. Die `.htaccess` sorgt
dafür, dass Browser jede Datei beim Server nachfragen (`Cache-Control: no-cache`), damit
nach einem Deploy nicht ein altes `viewer.js` zur neuen `index.html` läuft.

### `.htaccess`

Liegt nicht im Repo (`.gitignore`), sondern nur lokal und auf dem Server. Inhalt: `no-cache`
für HTML, JS, CSS, GLB und Bilder; Schriften (`.woff2`, Version im Dateinamen) ein Jahr
cachen; `mod_deflate` für Text, JS, JSON, SVG und GLB. Beide Blöcke sind folgenlos, wenn dem
Server das Modul fehlt. Bei einem neuen Hoster einmal mit hochladen.

## three.js aktualisieren

```bash
npm install three@<version> --save-exact
npm run vendor
```

`scripts/vendor-three.mjs` kopiert three und genau die vom Viewer importierten Addons
minifiziert nach `vendor/three/`. Danach die Seite lokal prüfen, `vendor/three/` committen und
den Ordner komplett hochladen.

## Neues Modell

Ein Eintrag in `js/modelle.js` plus ein GLB nach demselben Vertrag wie `fenster.glb` und
`haustuer.glb` (Node-Namen, `Wand`, Bänder, Custom Property `mount`). Der Viewer selbst ist
modellneutral.
