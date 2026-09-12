// =====================================================================
// app.js – UI-Ablauf: Hero -> Scan-Animation -> 3D-Viewer -> Tooltip/Shop
// =====================================================================

import { WindowViewer, PART_META, PART_ORDER, SHOP_BASE, preloadModel } from './viewer.js';

const MODEL_URL = './fenster.glb';
const DEBUG = new URLSearchParams(location.search).has('debug');

const $ = (sel) => document.querySelector(sel);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Wartet, bis eine Ausblendung wirklich durch ist, statt eine Dauer zu raten. Die Notbremse
// holt sich die Dauer aus dem Stylesheet statt sie zu schätzen: läuft gar kein Übergang, kommt
// auch kein transitionend, und dann soll es sofort weitergehen statt eine Sekunde zu warten.
// Genau das ist der Fall, wenn im Betriebssystem "Bewegung reduzieren" eingeschaltet ist.
function ausgeblendet(el) {
  const dauer = (parseFloat(getComputedStyle(el).transitionDuration) || 0) * 1000;
  return new Promise((fertig) => {
    let erledigt = false;
    const abschliessen = () => {
      if (erledigt) return;
      erledigt = true;
      el.removeEventListener('transitionend', beiEnde);
      fertig();
    };
    const beiEnde = (e) => { if (e.target === el && e.propertyName === 'opacity') abschliessen(); };
    el.addEventListener('transitionend', beiEnde);
    setTimeout(abschliessen, dauer + 80);
  });
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Unter 900px liegen Bühne, Tooltip-Panel und Liste untereinander (siehe CSS).
const isStackedLayout = () => window.matchMedia('(max-width: 900px)').matches;

const els = {
  logo: $('#logo'),
  scanBtn: $('#btn-scan'),
  rescanBtn: $('#btn-rescan'),
  hero: $('#screen-hero'),
  viewerScreen: $('#screen-viewer'),
  footer: $('#footer'),
  scan: $('#scan'),
  scanTitle: $('#scan-title'),
  scanText: $('#scan-text'),
  scanQr: $('#scan-qr'),
  stage: $('#stage'),
  canvas: $('#canvas'),
  loading: $('#viewer-loading'),
  loadingText: $('#viewer-loading-text'),
  tooltip: $('#tooltip'),
  ttTitle: $('#tt-title'),
  ttInfo: $('#tt-info'),
  ttLink: $('#tt-link'),
  ttLinkLabel: $('#tt-link-label'),
  ttClose: $('#tooltip-close'),
  parts: $('#parts'),
  explodeBtn: $('#btn-explode'),
  openBtn: $('#btn-open'),
  tiltBtn: $('#btn-tilt'),
  outsideBtn: $('#btn-outside'),
  resetBtn: $('#btn-reset'),
  statsBtn: $('#btn-stats'),
  stats: $('#stats'),
  statsFps: $('#stats-fps'),
  statsRes: $('#stats-res'),
  statsGpu: $('#stats-gpu'),
  statsTier: $('#stats-tier'),
  hoverLabel: $('#hover-label'),
  hoverLabelText: $('#hover-label-text'),
};

// Zustand
let viewer = null;
let viewerInit = null;
let lastAnchor = { x: 0, y: 0, visible: false };
let selectedName = null;
let selectionFromList = false;
const partLabels = new Map();   // name -> Anzeigename (für das Hover-Schild)

// Modell schon beim Seitenaufruf laden, damit es nach dem "Scan" sofort da ist.
preloadModel(MODEL_URL).catch(() => { /* Fehler wird in initViewer() behandelt */ });

buildFakeQr(els.scanQr, 25);
// Vorläufige Liste aus den Metadaten; sobald das Modell geladen ist, wird sie
// aus den tatsächlich vorhandenen Bauteilen neu aufgebaut.
buildPartsList(PART_ORDER
  .filter((name) => PART_META[name] && PART_META[name].hover !== false)
  .map((name) => ({ name, label: PART_META[name].label, categoryLabel: PART_META[name].categoryLabel })));

// ---------------------------------------------------------------------
// Viewer
function setLoadingState(state, err) {
  els.loading.hidden = false;
  els.loading.classList.toggle('is-error', state === 'error');
  if (state === 'error') {
    const msg = err && err.message ? ` (${err.message})` : '';
    els.loadingText.textContent =
      `Das 3D-Modell konnte nicht geladen werden${msg}. Prüfen Sie, ob fenster.glb neben index.html liegt `
      + 'und die Seite über einen Webserver geöffnet ist (z. B. XAMPP: http://localhost/…). '
      + 'Mit „Neu scannen" können Sie es erneut versuchen.';
  } else {
    els.loadingText.textContent = 'Modell wird geladen …';
  }
}

function initViewer() {
  if (viewerInit) return viewerInit;
  setLoadingState('loading');
  viewer = new WindowViewer({
    canvas: els.canvas,
    stage: els.stage,
    onSelect: handleSelect,
    onAnchor: handleAnchor,
    onHover: handleHover,
  });
  if (DEBUG) window.fensterViewer = viewer; // Debug-Zugriff: index.html?debug
  viewerInit = viewer.init(MODEL_URL)
    .then(() => {
      els.loading.hidden = true;
      buildPartsList(viewer.getParts());
    })
    .catch((err) => {
      console.error('[fenster] Modell konnte nicht geladen werden:', err);
      setLoadingState('error', err);
      // Aufräumen, damit der nächste Scan komplett neu starten kann.
      try { viewer.dispose(); } catch (_) { /* ignorieren */ }
      viewer = null;
      viewerInit = null;
      throw err;
    });
  return viewerInit;
}

function handleSelect(info) {
  const previous = selectedName;
  selectedName = info ? info.name : null;
  for (const btn of els.parts.querySelectorAll('button')) {
    const active = !!info && btn.dataset.part === info.name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
  if (!info) {
    const hadFocusInside = els.tooltip.contains(document.activeElement);
    els.tooltip.hidden = true;
    // Fokus zurück auf den Listeneintrag, sonst landet er im <body>. Ohne Scrollen:
    // auf dem Handy liegt die Liste unter der Bühne und würde sonst hart ins Bild springen.
    if (hadFocusInside && previous) {
      const btn = els.parts.querySelector(`button[data-part="${previous}"]`);
      if (btn) btn.focus({ preventScroll: true });
    }
    return;
  }
  els.ttTitle.textContent = info.label;
  els.ttInfo.textContent = info.info;
  els.ttLink.href = info.url;
  els.ttLinkLabel.textContent = `${info.categoryLabel} im Shop`;
  els.hoverLabel.hidden = true;   // Schild des gerade angeklickten Teils ausblenden
  els.tooltip.hidden = false;
  if (isStackedLayout()) {
    // Panel unter dem Canvas: nur dann sanft scrollen, wenn es nicht schon im Bild ist
    // (z. B. weil man gerade unten in der Liste getippt hat).
    els.tooltip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else {
    positionTooltip(lastAnchor);
  }
  if (selectionFromList) {
    els.tooltip.focus({ preventScroll: true });
    selectionFromList = false;
  }
}

// Kleines Namensschild am Mauszeiger, solange ein klickbares Teil gehovert wird.
function handleHover(name, clientX, clientY) {
  const label = els.hoverLabel;
  if (!name || name === selectedName || !Number.isFinite(clientX)) {
    label.hidden = true;
    return;
  }
  els.hoverLabelText.textContent = partLabels.get(name) || name;
  label.hidden = false;
  const rect = els.stage.getBoundingClientRect();
  const w = label.offsetWidth;
  const h = label.offsetHeight;
  let x = clientX - rect.left + 18;
  let y = clientY - rect.top + 22;
  if (x + w > rect.width - 8) x = clientX - rect.left - w - 12;
  if (y + h > rect.height - 8) y = clientY - rect.top - h - 12;
  label.style.setProperty('--x', `${Math.max(8, x)}px`);
  label.style.setProperty('--y', `${Math.max(8, y)}px`);
}

function handleAnchor(anchor) {
  lastAnchor = anchor;
  if (!els.tooltip.hidden && !isStackedLayout()) positionTooltip(anchor);
}

function positionTooltip({ x, y, visible }) {
  const tt = els.tooltip;
  if (isStackedLayout()) {
    // Gestapeltes Layout: Panel im Dokumentfluss, keine Koordinaten nötig.
    tt.style.visibility = '';
    return;
  }
  tt.style.visibility = visible ? '' : 'hidden';
  if (!visible) return;

  const w = tt.offsetWidth;
  const h = tt.offsetHeight;
  const sw = els.stage.clientWidth;
  const sh = els.stage.clientHeight;
  const gap = 24;

  const below = y - h - gap < 8;
  tt.classList.toggle('is-below', below);
  const cx = clamp(x, w / 2 + 8, sw - w / 2 - 8);
  const cy = below ? clamp(y, 8, sh - h - gap) : clamp(y, h + gap, sh - 8);
  tt.style.setProperty('--x', `${cx}px`);
  tt.style.setProperty('--y', `${cy}px`);
}

/** @param {Array<{name:string,label:string,categoryLabel:string,group?:string}>} parts */
function buildPartsList(parts) {
  els.parts.innerHTML = '';
  let lastGroup = null;
  for (const part of parts) {
    partLabels.set(part.name, part.label);
    if (part.group && part.group !== lastGroup) {
      const head = document.createElement('li');
      head.className = 'parts__group';
      head.textContent = part.group;
      els.parts.appendChild(head);
      lastGroup = part.group;
    }
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.part = part.name;
    btn.setAttribute('aria-pressed', String(part.name === selectedName));
    btn.classList.toggle('is-active', part.name === selectedName);
    btn.innerHTML = '<span class="parts__dot" aria-hidden="true"></span>'
      + '<span class="parts__label"></span><span class="parts__cat"></span>';
    btn.querySelector('.parts__label').textContent = part.label;
    btn.querySelector('.parts__cat').textContent = (part.categoryLabel || '').replace(/^Alle\s+/, '');
    btn.addEventListener('click', () => {
      if (!viewer || !viewer.ready) return;
      selectionFromList = true;
      viewer.selectByName(part.name);
      selectionFromList = false;
    });
    // Doppelklick in der Liste: Kamera auf das Teil fokussieren.
    btn.addEventListener('dblclick', () => {
      if (!viewer || !viewer.ready) return;
      viewer.focusByName(part.name);
    });
    li.appendChild(btn);
    els.parts.appendChild(li);
  }
}

// ---------------------------------------------------------------------
// Screens
function showScreen(which) {
  const show = which === 'hero' ? els.hero : els.viewerScreen;
  const hide = which === 'hero' ? els.viewerScreen : els.hero;
  hide.classList.remove('is-active');
  hide.hidden = true;
  show.hidden = false;
  void show.offsetWidth; // Reflow, damit die Transition greift
  show.classList.add('is-active');
  els.rescanBtn.hidden = which !== 'viewer';
  // Der Fußbereich gehört zur Startseite. Im Viewer füllt die Bühne die Höhe des Fensters,
  // ein Fußbereich darunter ergäbe nur eine Scrollleiste neben einem Canvas, der Scrollen abfängt.
  if (els.footer) els.footer.hidden = which === 'viewer';
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------------
// Scan-Ablauf (Dummy): Overlay -> "erkannt" -> Übergang zum 3D-Viewer
let scanning = false;

async function startScan() {
  if (scanning) return;
  scanning = true;
  els.scanBtn.disabled = true;

  // Overlay einblenden, Scan-Zustand
  els.scan.classList.remove('is-found');
  els.scanTitle.textContent = 'Jetzt QR-Code scannen';
  els.scanText.textContent = 'Ihr Fenstermodell wird Ihnen in Folge angezeigt.';
  els.scan.hidden = false;
  void els.scan.offsetWidth;
  els.scan.classList.add('is-visible');

  await wait(1500);

  // Unter dem Overlay bereits auf den Viewer wechseln und three.js starten.
  showScreen('viewer');
  const ready = initViewer().catch(() => null);

  await wait(900);
  els.scan.classList.add('is-found');
  els.scanTitle.textContent = 'QR-Code erkannt';
  els.scanText.textContent = 'Fenster FK-2026-0417 · Modell wird geladen …';

  await Promise.all([wait(900), ready]);

  const ok = !!(viewer && viewer.ready);
  if (ok) {
    // Einmessen, solange das Overlay noch alles verdeckt: der Viewer spielt das Intro einmal
    // blind durch und sucht sich seine Stufe. Auf einer schnellen Maschine ist das nach rund
    // einer Viertelsekunde vorbei, auf einer langsamen dauert es länger - und genau dort ist
    // die Zeit gut angelegt, weil sonst das sichtbare Intro ruckelt und danach stufenweise
    // heruntergeschaltet wird.
    await viewer.kalibriere();
    viewer.prepareIntro();
    syncToolbar();   // Zustand wurde vom Viewer zurückgesetzt
    viewer.start();
  }

  // Erst das Overlay ganz weg, dann die Animation. Vorher lief beides gleichzeitig: die
  // Animation begann, während das Overlay noch halb da war, und weil dahinter kurz zuvor
  // dieselbe Animation zum Einmessen lief, sah man sie zweimal ineinander.
  els.scan.classList.remove('is-visible');
  await ausgeblendet(els.scan);
  els.scan.hidden = true;
  if (ok) viewer.playIntro();

  scanning = false;
  els.scanBtn.disabled = false;
}

function goHome() {
  toggleStats(false);
  if (scanning) return;
  if (viewer && viewer.ready) {
    viewer.select(null);
    viewer.pause();
  }
  syncToolbar();
  showScreen('hero');
  els.scanBtn.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------
// Events
els.scanBtn.addEventListener('click', startScan);
els.rescanBtn.addEventListener('click', goHome);
els.logo.addEventListener('click', (e) => { e.preventDefault(); goHome(); });
// Leistungs-Overlay: Auflösung, Bildrate und erkannte Grafik. Aktualisiert sich viermal je
// Sekunde, solange es sichtbar ist; unsichtbar läuft nichts.
let statsTimer = 0;
// Breitester Stand, den das Overlay bisher gebraucht hat. Es wächst mit, schrumpft aber nicht
// wieder: sonst springt die Breite, sobald ein Wert kürzer wird (2× statt 1,5× in der Auflösung,
// oder der Grafikname nach dem Auslassungszeichen). Damit bleibt kein Platz reserviert, den
// nicht wirklich schon einmal ein Wert gebraucht hat.
let statsBreite = 0;
// Herstellerangaben in eine einheitliche Form bringen. Die Quellen sind je nach Browser
// verschieden: WebGPU liefert "nvidia blackwell" (Hersteller und Architektur), WebGL je
// nach Browser "ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 (0x2C02) Direct3D11 ...)" oder einen
// Platzhalter. Identisch werden die Inhalte dadurch nicht, aber die Schreibweise.
const HERSTELLER = { nvidia: 'NVIDIA', amd: 'AMD', ati: 'AMD', intel: 'Intel', apple: 'Apple', qualcomm: 'Qualcomm', arm: 'ARM', imagination: 'Imagination', microsoft: 'Microsoft', google: 'Google' };
// Kürzel, die WebGPU klein zurückgibt und die groß geschrieben gehören.
const GPU_AKRONYME = new Set(['rdna', 'gcn', 'cdna', 'xe', 'uhd', 'hd', 'lp', 'gpu']);

function grafikText(roh) {
  const sauber = String(roh || '')
    .replace(/^ANGLE \(/, '')                    // Wrapper von Chrome unter Windows
    .replace(/ (Direct3D|OpenGL|Vulkan|Metal).*$/i, '') // Treiber- und Shader-Zusatz
    .replace(/\s*\(0x[0-9a-f]+\)/i, '')          // Geräte-Kennung
    .replace(/\((R|TM)\)/gi, '')                 // Schutzrechts-Zusätze
    .replace(/[(),]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!sauber) return 'unbekannt';
  const worte = [];
  for (const w of sauber.split(' ')) {
    const k = HERSTELLER[w.toLowerCase()];
    // Herstellername genau einmal und ganz vorn; doppelte Nennungen fallen weg.
    if (k) { if (!worte.includes(k)) worte.unshift(k); continue; }
    // Alles mit Ziffern oder Grossbuchstaben bleibt wie es ist (RTX, 5080, GeForce, M2),
    // reine Kleinschreibung wird gross angesetzt (blackwell wird Blackwell).
    const schon = worte.some((x) => x.toLowerCase() === w.toLowerCase());
    if (schon) continue;
    if (GPU_AKRONYME.has(w.toLowerCase())) { worte.push(w.toUpperCase()); continue; }
    // Kurze Typbezeichnungen wie m2 oder g78 ganz groß, sonst bliebe der Buchstabe klein.
    if (/^[a-z]\d/.test(w)) { worte.push(w.toUpperCase()); continue; }
    worte.push(/[0-9A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1));
  }
  return worte.join(' ') || 'unbekannt';
}

function renderStats() {
  if (!viewer || !viewer.ready) return;
  const d = viewer.debugInfo();
  els.statsFps.textContent = d.fps === null ? '--' : d.fps;
  els.statsRes.textContent = `${d.breite} × ${d.hoehe}  (${d.cssBreite} × ${d.cssHoehe} @ ${d.pixelRatio}×)`;
  // Aus "ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 (0x2C02) Direct3D11 ...)" wird
  // "GeForce RTX 5080": Klammer, Treiberzusatz, doppelter Herstellername und die
  // Geräte-Kennung sind für die Anzeige nur Rauschen.
  els.statsGpu.textContent = d.gpuBereit ? grafikText(d.gpu) : '…';
  const glaettung = d.msaa ? `MSAA ${d.msaa}` : d.fxaa ? 'FXAA' : 'keine';
  const ao = d.gtao ? `AO ${d.gtaoProben}` : 'AO aus';
  els.statsTier.textContent = `${d.stufe} · ${glaettung} · ${ao}`;
  // Natürliche Breite ohne die bisherige Sperre messen, dann den größten Stand festhalten.
  els.stats.style.minWidth = '';
  statsBreite = Math.max(statsBreite, els.stats.offsetWidth);
  els.stats.style.minWidth = `${statsBreite}px`;
}

function toggleStats(an) {
  const zeigen = an === undefined ? els.stats.hidden : an;
  els.stats.hidden = !zeigen;
  els.statsBtn.classList.toggle('is-on', zeigen);
  els.statsBtn.setAttribute('aria-pressed', String(zeigen));
  clearInterval(statsTimer);
  statsTimer = 0;
  if (viewer && viewer.ready) viewer.setStatsMode(zeigen);
  if (!zeigen) {
    // Beim Schließen zurücksetzen, sonst erbt der nächste Aufruf die Breite von vorhin.
    statsBreite = 0;
    els.stats.style.minWidth = '';
    return;
  }
  renderStats();
  statsTimer = setInterval(renderStats, 250);
}

els.statsBtn.addEventListener('click', () => toggleStats());
els.ttClose.addEventListener('click', () => viewer && viewer.select(null));
// Alle Zustandsbuttons aus dem Viewer ableiten, da sich Explosion, Drehen und Kippen
// gegenseitig ausschließen.
function syncToolbar() {
  const exploded = !!(viewer && viewer.exploded);
  const open = !!(viewer && viewer.open);
  const tilted = !!(viewer && viewer.tilted);
  els.explodeBtn.classList.toggle('is-on', exploded);
  els.explodeBtn.setAttribute('aria-pressed', String(exploded));
  els.openBtn.classList.toggle('is-on', open);
  els.openBtn.setAttribute('aria-pressed', String(open));
  els.tiltBtn.classList.toggle('is-on', tilted);
  els.tiltBtn.setAttribute('aria-pressed', String(tilted));
  const outside = !!(viewer && viewer.outsideRequested);
  els.outsideBtn.classList.toggle('is-on', outside);
  els.outsideBtn.setAttribute('aria-pressed', String(outside));
}
els.explodeBtn.addEventListener('click', () => {
  if (!viewer || !viewer.ready) return;
  viewer.toggleExplode();
  syncToolbar();
});
els.openBtn.addEventListener('click', () => {
  if (!viewer || !viewer.ready) return;
  viewer.toggleOpen();
  syncToolbar();
});
els.tiltBtn.addEventListener('click', () => {
  if (!viewer || !viewer.ready) return;
  viewer.toggleTilt();
  syncToolbar();
});
els.outsideBtn.addEventListener('click', () => {
  if (!viewer || !viewer.ready) return;
  viewer.toggleOutside();
  syncToolbar();
});
els.resetBtn.addEventListener('click', () => {
  if (!viewer || !viewer.ready) return;
  viewer.resetView();
  syncToolbar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && viewer && viewer.ready && viewer.selected) viewer.select(null);
});
window.addEventListener('resize', () => {
  // Gemerkte Overlay-Breite verwerfen: nach einem Größenwechsel gilt eine andere
  // Schriftgröße, und die Sperre von vorhin wäre zu breit.
  statsBreite = 0;
  els.stats.style.minWidth = '';
  if (els.tooltip.hidden) return;
  if (isStackedLayout()) {
    // Beim Wechsel ins gestapelte Layout Desktop-Koordinaten verwerfen.
    els.tooltip.style.visibility = '';
    els.tooltip.style.removeProperty('--x');
    els.tooltip.style.removeProperty('--y');
    els.tooltip.classList.remove('is-below');
  } else {
    positionTooltip(lastAnchor);
  }
});

if (DEBUG) console.info('[fenster] Debug aktiv, Shop-Basis:', SHOP_BASE);

// ---------------------------------------------------------------------
// Fake-QR-Code für die Scan-Animation (deterministisches Muster, kein echter Code)
function buildFakeQr(svg, n = 25, seed = 20260904) {
  let s = seed >>> 0;
  const rnd = () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const grid = Array.from({ length: n }, () => Array(n).fill(false));
  const reserved = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (reserved(x, y)) continue;
      if (x === 6 || y === 6) { grid[y][x] = (x + y) % 2 === 0; continue; }
      grid[y][x] = rnd() < 0.45;
    }
  }
  const finder = (ox, oy) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const ring = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[oy + y][ox + x] = ring || core;
      }
    }
  };
  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);

  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  const pad = 2;
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`);
  svg.innerHTML = `<rect x="${-pad}" y="${-pad}" width="${n + pad * 2}" height="${n + pad * 2}" fill="#fff"/>`
    + `<path d="${d}" fill="#111"/>`;
}
