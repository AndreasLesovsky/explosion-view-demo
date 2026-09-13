// =====================================================================
// dev/kamera-messung.js – Regressionssuite für das Kameramodell des Viewers.
//
// Aufruf: Seite mit ?debug laden, Scan starten, Intro abwarten, dann in der Konsole
//   await fensterMessung()                       komplette Suite, Tabelle in der Konsole
//   const M = await fensterMessung({ nurHelfer: true })   nur die Helfer, für eigene Messungen
//
// Vier Regeln, alle aus Schaden gelernt (12./13.09.2026):
// - FESTE UHR. performance.now wird für die Dauer der Messung durch einen Zähler ersetzt,
//   jeder Tick ist exakt 1000/60 ms. Tweens laufen nach Uhr; mit der Wanduhr hinge das
//   Ergebnis von der Rechnerlast ab (ein "37-cm-Sprung" war nur eine überlastete Schleife).
// - KEIN RENDERING. composer.render ist während der Messung gestubbt, ein Tick kostet
//   Mikrosekunden statt eines Bildes; die ganze Suite läuft in unter einer Sekunde.
// - SYNCHRON UND BEGRENZT. Keine await-Schleifen, jede Schleife mit Obergrenze. Ein
//   abgebrochener Aufruf kann nichts hinterlassen, das weiterläuft und den Rechner lahmlegt.
// - ECHTE EINGABEWEGE. Zoom über Wheel-Events auf dem Canvas, Drehung über die
//   OrbitControls-Drehung: gemessen wird derselbe Pfad, den Nutzereingaben nehmen (die
//   Handler der Controls rufen update() selbst auf, eine Messung "um update() herum"
//   sähe den Rad-Zoom gar nicht).
//
// Greift auf interne Felder zu (viewer._poseGemerkt, viewer.swivelRaw, controls._rotateLeft;
// three 0.185). Das ist Testcode neben dem Viewer, nicht Teil seiner Schnittstelle.
// =====================================================================

const FRAME_MS = 1000 / 60;
const MAX_FRAMES = 400;
const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : NaN);
const deg = (r) => r * 180 / Math.PI;

// Helfer um einen laufenden Viewer herum. Uhr und Rendering werden erst mit `an()` umgehängt
// und mit `aus()` wiederhergestellt; `suite()` macht das selbst.
export function messgeschirr(v) {
  const V3 = v.camera.position.constructor;
  const Box3 = v.box.constructor;
  const c = v.controls;
  const cam = v.camera.position;
  const t = c.target;
  const M = { V3, Box3, aktiv: false };

  let echteUhr = null, echtesRender = null, uhr = 0;
  M.an = () => {
    if (M.aktiv) return;
    echteUhr = performance.now.bind(performance);
    uhr = echteUhr();
    performance.now = () => uhr;
    echtesRender = v.composer.render;
    v.composer.render = () => {};
    M.aktiv = true;
  };
  M.aus = () => {
    if (!M.aktiv) return;
    performance.now = echteUhr;
    v.composer.render = echtesRender;
    v.needsRender = true;
    M.aktiv = false;
  };
  M.frame = (n = 1) => { for (let i = 0; i < n; i++) { uhr += FRAME_MS; v.tick(); } };
  M.warteRuhe = (max = 600) => { for (let i = 0; i < max && v.tweens.length; i++) M.frame(); M.frame(5); };

  // Kamera per Kugelkoordinaten um den Drehpunkt setzen (Test-Teleport, gilt nicht als Eingabe).
  M.pose = (thetaDeg, phiDeg, d) => {
    v.cancelCameraTweens(); v.discardMomentum();
    v._poseGemerkt = false; v.swivelRaw.set(0, 0, 0);
    const b = t.copy(v.baseTarget());
    const th = thetaDeg * Math.PI / 180, ph = phiDeg * Math.PI / 180;
    cam.set(b.x + d * Math.sin(ph) * Math.sin(th), b.y + d * Math.cos(ph), b.z + d * Math.sin(ph) * Math.cos(th));
    v.camera.lookAt(b); v.userInteracted = true;
    v.applyNearLimits(v.nahWert()); c.update(); v.applyPanCoupling(); v.applyBoundsConstraint();
    M.frame(5);
  };
  // Rad-Zoom wie vom Nutzer: Wheel-Event auf dem Element der Controls, Δy < 0 = hinein.
  M.rad = (deltaY, n = 1) => {
    const el = c.domElement, r = el.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
      M.frame(1);
    }
  };
  M.zoomAuf = (dist, richtung = -1, max = 120) => { for (let i = 0; i < max && (richtung < 0 ? cam.distanceTo(t) > dist : cam.distanceTo(t) < dist); i++) M.rad(richtung * 100); };
  // Ziehen wie vom Nutzer: Anteil der Bühnenhöhe (OrbitControls: 2π je volle Höhe × rotateSpeed).
  M.dreh = (anteilHoehe, frames = 70) => { c._rotateLeft(2 * Math.PI * anteilHoehe * c.rotateSpeed); M.frame(frames); };
  M.neige = (anteilHoehe, frames = 70) => { c._rotateUp(2 * Math.PI * anteilHoehe * c.rotateSpeed); M.frame(frames); };
  M.azimut = () => deg(Math.atan2(cam.x - t.x, cam.z - t.z));
  M.box = (name) => (v.parts.has(name) ? new Box3().setFromObject(v.parts.get(name)) : null);

  // Steckt `pos` (mit Rand) in einem der Teile? Geprüft gegen die mitgedrehten lokalen Boxen.
  M.inParts = (pos, margin = 0.06, names = [...v.parts.keys()]) => {
    const hits = [];
    for (const n of names) {
      const o = v.parts.get(n); if (!o) continue;
      o.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox, l = m.worldToLocal(pos.clone());
        const s = m.getWorldScale(new V3()).x || 1, mg = margin / s;
        if (l.x > bb.min.x - mg && l.x < bb.max.x + mg && l.y > bb.min.y - mg && l.y < bb.max.y + mg && l.z > bb.min.z - mg && l.z < bb.max.z + mg) hits.push(n);
      });
    }
    return [...new Set(hits)];
  };

  // Aktion auslösen und `frames` Ticks lang die Kamera mitschreiben.
  M.verlauf = (aktion, frames) => {
    const start = cam.clone();
    let prev = cam.clone(), prevD = null, prevAz = null;
    let maxSchritt = 0, knick = 0, zurWand = 0, drin = 0, maxDy = 0, maxRate = 0, endeBei = -1, nachEnde = 0, seitlich = 0, nan = false;
    aktion();
    for (let f = 0; f < Math.min(frames, MAX_FRAMES); f++) {
      M.frame();
      v.fenster.updateWorldMatrix(true, true);
      if (!Number.isFinite(cam.x + cam.y + cam.z + t.x + t.y + t.z)) { nan = true; break; }
      const d = cam.clone().sub(prev), len = d.length();
      if (!v.tweens.length && endeBei < 0) endeBei = f;
      if (len > 5e-4) {
        zurWand = Math.max(zurWand, prev.z - cam.z);
        maxSchritt = Math.max(maxSchritt, len);
        maxDy = Math.max(maxDy, Math.abs(d.y));
        seitlich += Math.hypot(d.x, d.y);
        if (prevD && prevD.length() > 2e-3 && len > 2e-3) knick = Math.max(knick, deg(prevD.angleTo(d)));
        prevD = d;
        if (endeBei >= 0 && f > endeBei) nachEnde += len;
      }
      const az = M.azimut();
      if (prevAz !== null) { const dAz = Math.abs(az - prevAz); if (dAz < 180) maxRate = Math.max(maxRate, dAz * 60); }
      prevAz = az; prev = cam.clone();
      if (M.inParts(cam).length) drin++;
    }
    return {
      start: start.toArray().map(r3), ende: cam.toArray().map(r3), zielEnde: t.toArray().map(r3),
      maxSchritt: r3(maxSchritt), maxKnick: Math.round(knick), zurWand: r3(zurWand), seitlich: r3(seitlich),
      maxDy: r3(maxDy), maxGradProSek: Math.round(maxRate), imTeil: drin, tweenEndeFrame: endeBei,
      nachTweenEnde: r3(nachEnde), nan, tweens: v.tweens.map((w) => w.tag).join(','),
    };
  };
  return M;
}

// Komplette Suite. Voraussetzung: Viewer bereit, Intro vorbei, keine Tweens. Gibt die
// Ergebnisse zurück und druckt sie als Tabelle; lässt den Viewer in der Home-Ansicht zurück.
export function suite(v, { nurHelfer = false, leise = false } = {}) {
  if (!v || !v.ready) throw new Error('Viewer nicht bereit');
  const M = messgeschirr(v);
  if (nurHelfer) return M;
  if (v.introPlaying || v.tweens.length) throw new Error('Intro läuft noch oder Tweens offen — kurz warten');

  const c = v.controls, cam = v.camera.position, t = c.target;
  const ergebnisse = [];
  const pruefe = (test, werte, bedingungen) => {
    const offen = bedingungen.filter(([, ok]) => !ok).map(([label]) => label);
    ergebnisse.push({ test, ok: offen.length === 0, verletzt: offen.join('; '), werte });
  };
  const glatt = (w, schritt = 0.1) => [
    ['kein NaN', !w.nan], [`Schritt ≤ ${schritt} m`, w.maxSchritt <= schritt], ['nie im Teil', w.imTeil === 0],
    ['Ruhe nach Tween', w.nachTweenEnde === 0], ['Tween beendet', w.tweenEndeFrame >= 0],
  ];
  const home = v.homeTarget.clone();
  const sollPose = () => { const p = v.standardPose(); return v.baseTarget().clone().addScaledVector(p.dir, p.dist); };
  const start = performance.now();

  M.an();
  try {
    const lauf = (name, fn) => { try { fn(); } catch (e) { ergebnisse.push({ test: name, ok: false, verletzt: 'Ausnahme: ' + (e && e.message), werte: {} }); } };

    lauf('Zoom hinein: kein Schwenk, gerader Pfad', () => {
      v.resetView(); M.warteRuhe(); v.userInteracted = true;
      let maxAbw = 0, maxKnick = 0, prev = cam.clone(), prevD = null, n = 0;
      while (cam.distanceTo(t) > 0.72 && n < 120) {
        M.rad(-100); n++; maxAbw = Math.max(maxAbw, t.distanceTo(home));
        const d = cam.clone().sub(prev); if (d.length() > 1e-4) { if (prevD) maxKnick = Math.max(maxKnick, deg(prevD.angleTo(d))); prevD = d; } prev = cam.clone();
      }
      const w = { radStufen: n, dist: r3(cam.distanceTo(t)), blickpunktAbweichung: r3(maxAbw), pfadKnickGrad: Math.round(maxKnick) };
      pruefe('Zoom hinein', w, [['Mindestabstand erreicht', w.dist < 0.75], ['Blickpunkt bleibt ≤ 5 mm', maxAbw <= 0.005], ['Knick ≤ 3°', maxKnick <= 3]]);
    });

    lauf('Drehen nah: Schwenk, umkehrbar, Anschlag', () => {
      const t0 = t.clone(); M.dreh(0.1); const t1 = t.clone(); M.dreh(-0.1); const t2 = t.clone(); M.dreh(0.6, 90);
      const w = { schwenk10Prozent: r3(t1.x - t0.x), rest: r3(t2.distanceTo(t0)), amAnschlag: r3(t.x - home.x), azimut: Math.round(M.azimut()), xMax: r3(v.panCoupling.xMax) };
      pruefe('Drehen nah', w, [['Schwenk 5–40 cm', Math.abs(w.schwenk10Prozent) >= 0.05 && Math.abs(w.schwenk10Prozent) <= 0.4], ['zurück ≤ 1 cm', w.rest <= 0.01], ['Blickpunkt innerhalb xMax', Math.abs(w.amAnschlag) <= v.panCoupling.xMax + 0.01]]);
    });

    lauf('Zoom hinaus: Schwenk blendet aus', () => {
      let maxSprung = 0, prevT = t.clone();
      for (let i = 0; i < 120 && cam.distanceTo(t) < 2.6; i++) { M.rad(100); maxSprung = Math.max(maxSprung, t.distanceTo(prevT)); prevT = t.clone(); }
      const w = { dist: r3(cam.distanceTo(t)), blickpunktAbweichung: r3(t.distanceTo(home)), maxBlickpunktSchritt: r3(maxSprung) };
      pruefe('Zoom hinaus', w, [['Blickpunkt zurück auf Mitte ≤ 1 cm', w.blickpunktAbweichung <= 0.01], ['kein Sprung > 6 cm/Frame', maxSprung <= 0.06]]);
    });

    lauf('Zoom-Mitte: Schwenk je Zug', () => {
      v.resetView(); M.warteRuhe(); v.userInteracted = true; M.zoomAuf(1.42);
      const d0 = cam.distanceTo(t), az0 = M.azimut(), tx0 = t.x; M.dreh(0.1);
      const w = { dist: r3(d0), rotateSpeed: r3(c.rotateSpeed), schwenk: r3(t.x - tx0), drehungGrad: r3(M.azimut() - az0), naehe: r3(v.naehe(d0)) };
      pruefe('Zoom-Mitte', w, [['Schwenk 5–40 cm', Math.abs(w.schwenk) >= 0.05 && Math.abs(w.schwenk) <= 0.4], ['rotateSpeed > 0', w.rotateSpeed > 0]]);
    });

    lauf('Fokus: keine Kopplung, volle Drehgeschwindigkeit', () => {
      v.resetView(); M.warteRuhe();
      const griff = v.parts.has('Griff') ? 'Griff' : [...v.parts.keys()][0];
      v.focusByName(griff); M.warteRuhe(); M.frame(2);
      const w = { teil: griff, dist: r3(cam.distanceTo(t)), rotateSpeed: r3(c.rotateSpeed), panScale: v.panScale, schwenkRoh: r3(v.swivelRaw.length()) };
      pruefe('Fokus', w, [['panScale 0', v.panScale === 0], ['Schwenk 0', w.schwenkRoh === 0], ['rotateSpeed ≥ 0.5', w.rotateSpeed >= 0.5]]);
    });

    lauf('Nutzerpose nah: öffnen, dann Explosion', () => {
      v.resetView(); M.warteRuhe(); v.userInteracted = true; M.zoomAuf(0.72);
      const a = M.verlauf(() => v.setOpen(true), 100);
      const b = M.verlauf(() => v.setExploded(true), 170);
      pruefe('Nah öffnen', a, [...glatt(a, 0.08), ['nie zur Wand', a.zurWand <= 0.005]]);
      pruefe('Nah Explosion', b, [...glatt(b, 0.1), ['nie zur Wand', b.zurWand <= 0.005]]);
      // Ebenen der Explosion: Dichtungen hinter dem Flügel, Außenfensterbank steht still
      const fl = M.box('Fluegel'), an = M.box('Anschlagdichtung'), fa = M.box('Falzdichtung'), bank = M.box('Fensterbank_aussen');
      if (fl && an && fa) pruefe('Explosionsebenen', { fluegelMinZ: r3(fl.min.z), anschlagMaxZ: r3(an.max.z), falzMaxZ: r3(fa.max.z), bankMinZ: bank ? r3(bank.min.z) : null },
        [['Anschlagdichtung hinter Flügel', an.max.z < fl.min.z], ['Falzdichtung hinter Anschlagdichtung', fa.max.z < an.min.z], ['Außenbank unbewegt', !bank || bank.min.z < 0]]);
      v.setExploded(false); M.warteRuhe(); v.resetView(); M.warteRuhe();
    });

    lauf('Offener Flügel: weit seitlich, dann schließen', () => {
      v.setOpen(true); M.warteRuhe(); M.pose(95, 90, 0.7); M.frame(12);
      const az = Math.round(M.azimut());
      const w = M.verlauf(() => v.setSash('closed'), 110); w.azimutVorher = az;
      pruefe('Schließen aus weiter Pose', w, [...glatt(w, 0.05), ['weite Pose erreichbar (≥ 80°)', az >= 80], ['Kamera bleibt (Weg ≤ 3 cm)', w.seitlich <= 0.03]]);
      v.resetView(); M.warteRuhe();
    });

    lauf('Fokus auf Rahmen, Kamera in der Flügelbahn, öffnen', () => {
      const teil = v.parts.has('Rahmen_oben') ? 'Rahmen_oben' : null;
      if (!teil) { pruefe('Fokus öffnen', { hinweis: 'Rahmen_oben fehlt' }, [['Teil vorhanden', false]]); return; }
      v.focusByName(teil); M.warteRuhe(); M.pose(30, 100, 0.7);
      const w = M.verlauf(() => v.setOpen(true), 100);
      let verletzt = 0; for (const th of [-40, -20, 0, 20, 40]) for (const ph of [70, 90, 110]) { M.pose(th, ph, 0.7); if (M.inParts(cam, 0.05).length) verletzt++; }
      w.posenImTeil = verletzt;
      pruefe('Fokus öffnen', w, [...glatt(w, 0.05), ['rundum nie im Teil', verletzt === 0]]);
      v.setSash('closed'); M.warteRuhe(); v.resetView(); M.warteRuhe();
    });

    lauf('Fokusfahrt durch Öffnen unterbrochen', () => {
      v.userInteracted = true; M.zoomAuf(0.9); M.dreh(0.05);
      const griff = v.parts.has('Griff') ? 'Griff' : [...v.parts.keys()][0];
      v.focusByName(griff); M.frame(15);
      const rest = Math.round(v.restFokusFahrt());
      const w = M.verlauf(() => v.setOpen(true), 180); w.restFokusMs = rest; w.panScaleEnde = v.panScale; w.sashMode = v.sashMode;
      pruefe('Fokusfahrt unterbrochen', w, [...glatt(w, 0.06), ['Fahrt wurde abgewartet', rest > 0], ['panScale endet bei 0', v.panScale === 0], ['Flügel offen', v.sashMode === 'open']]);
      v.setSash('closed'); M.warteRuhe(); v.resetView(); M.warteRuhe();
    });

    lauf('Explosion einklappen aus mittlerem Abstand mit Schwenk', () => {
      v.userInteracted = true; M.zoomAuf(1.52); M.dreh(0.15);
      const schwenk = r3(t.x - home.x);
      v.setExploded(true); M.warteRuhe(); M.frame(5);
      const w = M.verlauf(() => v.setExploded(false), 150); w.schwenkVorher = schwenk; w.blickpunktEnde = r3(t.distanceTo(home));
      pruefe('Einklappen mit Schwenk', w, [...glatt(w, 0.08), ['Schwenk war da', Math.abs(schwenk) > 0.05], ['Blickpunkt endet in der Mitte ≤ 1 cm', w.blickpunktEnde <= 0.01]]);
      v.resetView(); M.warteRuhe();
    });

    lauf('Außenansicht: Kopplung gleichsinnig', () => {
      v.setOutside(true); M.warteRuhe(); v.userInteracted = true; M.zoomAuf(0.75);
      const cx0 = cam.x, tx0 = t.x; M.dreh(0.1);
      const w = { dCamX: r3(cam.x - cx0), dZielX: r3(t.x - tx0), camZ: r3(cam.z) };
      pruefe('Außenansicht', w, [['Kamera außen (z < 0)', cam.z < 0], ['Blickpunkt folgt der Drehrichtung', Math.sign(w.dCamX) === Math.sign(w.dZielX) && Math.abs(w.dZielX) > 0.01]]);
      v.setOutside(false); M.warteRuhe(); v.resetView(); M.warteRuhe();
    });

    lauf('Home: Fahrten enden in der Ruhepose', () => {
      const a = M.verlauf(() => v.setOpen(true), 120); a.abwRuhepose = r3(cam.distanceTo(sollPose()));
      v.setSash('closed'); M.warteRuhe(); M.frame(10);
      const b = M.verlauf(() => v.setExploded(true), 120); b.abwRuhepose = r3(cam.distanceTo(sollPose()));
      v.setExploded(false); M.warteRuhe(); v.resetView(); M.warteRuhe();
      const r = { abwHome: r3(cam.distanceTo(sollPose())), blickpunkt: r3(t.distanceTo(home)), tweens: v.tweens.length };
      pruefe('Home öffnen', a, [...glatt(a, 0.2), ['Ruhepose ≤ 5 mm', a.abwRuhepose <= 0.005]]);
      pruefe('Home Explosion', b, [...glatt(b, 0.2), ['Ruhepose ≤ 5 mm', b.abwRuhepose <= 0.005]]);
      pruefe('Reset', r, [['Home ≤ 5 mm', r.abwHome <= 0.005], ['Blickpunkt Mitte', r.blickpunkt <= 0.005], ['keine Tweens', r.tweens === 0]]);
    });
  } finally {
    M.aus();
  }

  const bestanden = ergebnisse.filter((e) => e.ok).length;
  const dauer = Math.round(performance.now() - start);
  if (!leise) {
    console.table(ergebnisse.map((e) => ({ Test: e.test, OK: e.ok ? '✓' : '✗', Verletzt: e.verletzt, Werte: JSON.stringify(e.werte) })));
    console.log(`${bestanden}/${ergebnisse.length} bestanden, ${dauer} ms (feste Uhr, ohne Rendering)`);
  }
  return { bestanden, gesamt: ergebnisse.length, dauerMs: dauer, ergebnisse };
}
