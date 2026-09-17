// =====================================================================
// modelle.js – alles, was der Viewer über ein konkretes Modell wissen muss.
// Der Viewer selbst ist modellneutral: er liest Node-Namen, Versätze, Texte und Fähigkeiten
// (Kippen ja/nein, Griffdrehung) aus dem hier beschriebenen Eintrag. Ein neues Produkt ist
// ein neuer Eintrag plus ein GLB nach demselben Vertrag (VIEWER.md, Abschnitt 3).
// =====================================================================

// Shop-Basis-URL: Kategorie wird angehängt (im Demo-Betrieb bleibt der Link ein Platzhalter).
export const SHOP_BASE = '#';

// Teile ohne eigenen Eintrag in `versatz` bekommen ihren Explosionsversatz aus der Custom
// Property `mount` des GLB: sash = fährt mit dem Flügel, frame = spreizt mit der jeweiligen
// Rahmenseite, hinge = schwenkt zur Bandseite aus. Gilt für alle Modelle.
export const MOUNT_OFFSETS = {
  sash: [0, 0, 0.3],
  sashHardware: [0.45, 0, 0.3],   // Beschlag aus dem Flügelfalz seitlich neben den Flügel legen
  hinge: [0.5, 0, 0.3],           // Bandkappen (Ecklager, Scherenlager)
  hingeHardware: [0.5, 0, 0.5],   // Stahlteile der Bandseite (Eckband, Schere) eine Ebene davor
  frameSpread: 0.28,
};
// Start-Verzögerung in der Intro-Animation je Montageart (Anteil der Gesamtdauer), wenn das
// Teil keinen eigenen Eintrag in `introVerzoegerung` hat.
export const MOUNT_INTRO_DELAY = { sash: 0.22, frame: 0.03, hinge: 0.25 };

// ---------------------------------------------------------------------------------------
// Dreh-Kipp-Fenster
// ---------------------------------------------------------------------------------------

// Texte überschreiben die Platzhalter aus dem GLB (userData.label / .info).
// `hover` überschreibt userData.hover (die Dichtung ist im GLB nicht hoverbar,
// soll hier aber anklickbar sein). Fehlt ein Eintrag, gilt userData.
const FENSTER_TEILE = {
  Griff: {
    label: 'Fenstergriff',
    info: 'Aluminium, Dreh-Kipp-Griff, Vierkantstift 7 mm',
    category: 'griffe',
    categoryLabel: 'Alle Fenstergriffe',
  },
  Glas: {
    label: 'Verglasung',
    info: 'Isolierglas 24 mm, 2-fach, Ug 1,1 W/m²K',
    category: 'verglasung',
    categoryLabel: 'Alle Verglasungen',
  },
  Dichtung: {
    hover: true,
    label: 'Glasdichtung',
    info: 'EPDM-Glasdichtung, schwarz, für 24 mm Isolierglas',
    category: 'dichtungen',
    categoryLabel: 'Alle Dichtungen',
  },
  Anschlagdichtung: {
    label: 'Anschlagdichtung',
    info: 'Flügeldichtung am Überschlag, EPDM, umlaufend',
    category: 'dichtungen',
    categoryLabel: 'Alle Dichtungen',
  },
  Falzdichtung: {
    label: 'Falzdichtung',
    info: 'Äußere Falzdichtung am Flügel, EPDM, schließt die Falzluft zur Außenseite',
    category: 'dichtungen',
    categoryLabel: 'Alle Dichtungen',
  },
  Fensterbank_aussen: {
    label: 'Außenfensterbank',
    info: 'Aluminium, weiß pulverbeschichtet, 1,5 mm Blech, 6 Grad Gefälle, 40 mm Tropfkante mit Haken',
    category: 'fensterbaenke',
    categoryLabel: 'Alle Fensterbänke',
  },
  Glasleiste: {
    label: 'Glasleiste',
    info: 'Glashalteleiste innen, vier Teile auf Gehrung, 20 mm Ansichtsbreite',
    category: 'glasleisten',
    categoryLabel: 'Alle Glasleisten',
  },
  Band_oben: {
    label: 'Scherenlager oben',
    info: 'Dreh-Kipp-Beschlag, Scherenlager mit Abdeckkappen, Kunststoff weiß',
    category: 'beschlaege',
    categoryLabel: 'Alle Beschläge',
  },
  Band_unten: {
    label: 'Ecklager unten',
    info: 'Dreh-Kipp-Beschlag, Ecklager mit Abdeckkappen, Kunststoff weiß',
    category: 'beschlaege',
    categoryLabel: 'Alle Beschläge',
  },
  Band_oben_Fluegel: {
    label: 'Scherenlagerkappe Flügel oben',
    info: 'Flügelseitige Abdeckkappe am Scherenlager, schwenkt und kippt mit dem Flügel',
    category: 'beschlaege',
    categoryLabel: 'Alle Beschläge',
  },
  Band_unten_Fluegel: {
    label: 'Ecklagerkappe Flügel unten',
    info: 'Flügelseitige Abdeckkappe am Ecklager, Gegenstück zum Ecklager am Blendrahmen',
    category: 'beschlaege',
    categoryLabel: 'Alle Beschläge',
  },
  Anschlussfuge: {
    label: 'Anschlussfuge',
    info: 'Silikonfuge zwischen Blendrahmen und Laibung',
    category: 'dichtmassen',
    categoryLabel: 'Alle Dichtmassen',
  },
  // Beschlag im Falz (sichtbar bei geöffnetem Flügel und in der Explosion)
  Getriebe: {
    label: 'Getriebe',
    info: 'Dreh-Kipp-Getriebe im Flügelfalz, Vierkant 7 mm, Dornmaß 15 mm',
    category: 'getriebe',
    categoryLabel: 'Alle Getriebe',
  },
  Treibstange: {
    label: 'Treibstange',
    info: 'Treibstangen im Flügelfalz, Griffseite, oben und unten',
    category: 'beschlagteile',
    categoryLabel: 'Alle Beschlagteile',
  },
  Eckumlenkung_oben: {
    label: 'Eckumlenkung oben',
    info: 'Eckumlenkung Flügelecke oben, Griffseite',
    category: 'beschlagteile',
    categoryLabel: 'Alle Beschlagteile',
  },
  Eckumlenkung_unten: {
    label: 'Eckumlenkung unten',
    info: 'Eckumlenkung Flügelecke unten, Griffseite',
    category: 'beschlagteile',
    categoryLabel: 'Alle Beschlagteile',
  },
  Schliesszapfen: {
    label: 'Schließzapfen',
    info: 'Pilzkopfzapfen auf den Treibstangen, einbruchhemmend',
    category: 'beschlagteile',
    categoryLabel: 'Alle Schließzapfen',
  },
  Fehlbedienungssperre: {
    label: 'Fehlbedienungssperre',
    info: 'Sperrt den Griff gegen Fehlbedienung bei geöffnetem Flügel',
    category: 'beschlagteile',
    categoryLabel: 'Alle Beschlagteile',
  },
  Fluegelheber: {
    label: 'Flügelheber',
    info: 'Hebt den Flügel beim Schließen an, unten Griffseite',
    category: 'beschlagteile',
    categoryLabel: 'Alle Beschlagteile',
  },
  Schere: {
    label: 'Ausstellschere',
    info: 'Ausstellschere oben Bandseite, begrenzt die Kippstellung',
    category: 'beschlaege',
    categoryLabel: 'Alle Beschläge',
  },
  Eckband: {
    label: 'Eckband',
    info: 'Eckbandwinkel unten Bandseite, Gegenstück zum Ecklager',
    category: 'beschlaege',
    categoryLabel: 'Alle Beschläge',
  },
  Schliessblech_rechts: {
    label: 'Schließbleche Griffseite',
    info: 'Schließstücke im Blendrahmenfalz, Griffseite',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließstücke',
  },
  Schliessblech_oben: {
    label: 'Schließblech oben',
    info: 'Schließstück im Blendrahmenfalz, oben',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließstücke',
  },
  Schliessblech_unten: {
    label: 'Schließblech unten',
    info: 'Schließstück im Blendrahmenfalz, unten',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließstücke',
  },
  Fluegel: {
    label: 'Flügelrahmen',
    info: 'Dreh-Kipp-Flügel, 85 mm Ansichtsbreite, 70 mm Bautiefe',
    category: 'fluegelrahmen',
    categoryLabel: 'Alle Flügelrahmen',
  },
  Rahmen_links: {
    label: 'Blendrahmen links',
    info: 'Kunststoffprofil, 70 mm Ansichtsbreite, 80 mm Bautiefe',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
  Rahmen_rechts: {
    label: 'Blendrahmen rechts',
    info: 'Kunststoffprofil, 70 mm Ansichtsbreite, 80 mm Bautiefe',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
  Rahmen_oben: {
    label: 'Blendrahmen oben',
    info: 'Kunststoffprofil, 70 mm Ansichtsbreite, 80 mm Bautiefe',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
  Rahmen_unten: {
    label: 'Blendrahmen unten',
    info: 'Kunststoffprofil, 70 mm Ansichtsbreite, 80 mm Bautiefe',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
};

export const FENSTER = {
  id: 'fenster',
  url: './fenster.glb',
  // Node, dessen Kinder die Bauteile sind.
  root: 'Fenster',
  // Texte der Oberfläche.
  anrede: 'Ihr Fenster',
  titel: 'Dreh-Kipp-Fenster 1200 × 1400',
  nummer: 'FK-2026-0417',
  scanZeile: 'Fenster FK-2026-0417',
  canvasLabel: '3D-Modell des Fensters',
  // Flügel: Drehen um die senkrechte Bandachse, optional Kippen um die waagerechte Achse am
  // Flügelfuß. Winkel in Grad.
  fluegel: { name: 'Fluegel', winkel: 32, oeffnen: 'Flügel öffnen', kippen: 'Flügel kippen' },
  // Griff mit fester Rosette (eigenes Objekt, dreht nicht mit). Drehung in Grad: Drehen 90,
  // Kippen 180 (Griff zeigt nach oben). `richtung` null: aus der Griffseite ableiten.
  griff: { name: 'Griff', rosette: 'Griff_Rosette', drehen: 90, kippen: 180, richtung: null },
  // Ausstellschere: schwenkt beim Kippen um ihr rahmenseitiges Ende.
  schere: 'Schere',
  // Bandteile, aus deren Custom Property `pivot` (oder Lage) die Bandachse folgt.
  bandMuster: /^Band_(oben|unten)/,
  // Innenfensterbank: eigenes mattes Dekor (siehe makeSillMaterial).
  fensterbank: 'Fensterbank',
  wand: 'Wand',
  // Materialname für Beschlagteile: sie liegen in der Explosion seitlich neben dem Flügel.
  hardwareMaterialien: ['Beschlag_Stahl'],
  // Bauteile, die zum Bau gehören, nicht zur Baugruppe: anklickbar und im Shop, aber sie
  // stehen in Intro und Explosion still und zählen nicht zur Fenster-Box (die bestimmt
  // Home-Blickpunkt, Explosionshub und Kameragrenzen). Die Außenfensterbank hängt 6 cm unter
  // dem Rahmen und ragt 17 cm nach außen — in der Box hätte sie den Hub um ebenso viel vergrößert.
  statisch: new Set(['Fensterbank_aussen']),
  teile: FENSTER_TEILE,
  // Gruppenüberschriften für die Bauteil-Liste, nach Shop-Kategorie.
  gruppen: {
    griffe: 'Griff und Beschlag', getriebe: 'Griff und Beschlag', beschlagteile: 'Griff und Beschlag',
    schliessstuecke: 'Griff und Beschlag', beschlaege: 'Griff und Beschlag',
    verglasung: 'Glas und Dichtungen', glasleisten: 'Glas und Dichtungen', dichtungen: 'Glas und Dichtungen',
    fluegelrahmen: 'Rahmen', blendrahmen: 'Rahmen', dichtmassen: 'Rahmen', fensterbaenke: 'Rahmen',
  },
  // Reihenfolge für die Bauteil-Liste; unbekannte Nodes werden hinten angehängt.
  reihenfolge: [
    'Griff', 'Getriebe', 'Treibstange', 'Eckumlenkung_oben', 'Eckumlenkung_unten', 'Schliesszapfen',
    'Fehlbedienungssperre', 'Fluegelheber', 'Schliessblech_rechts', 'Schliessblech_oben', 'Schliessblech_unten',
    'Band_oben', 'Band_oben_Fluegel', 'Band_unten', 'Band_unten_Fluegel', 'Schere', 'Eckband',
    'Glas', 'Glasleiste', 'Dichtung', 'Anschlagdichtung', 'Falzdichtung',
    'Fluegel', 'Rahmen_links', 'Rahmen_rechts', 'Rahmen_oben', 'Rahmen_unten',
    'Anschlussfuge', 'Fensterbank_aussen',
  ],
  // Versatz (in Metern, lokal zum Root-Node) für Intro- und Explosionsansicht. Zusätzlich
  // werden alle Teile um den Hub nach vorn (+z) geschoben, damit auch der Blendrahmen vor der
  // Innenwand liegt statt in der Laibung zu verschwinden. Ebenen von der Wand in den Raum:
  // Blendrahmen (seitlich auseinander) und Anschlussfuge, Flügel mit Anschlagdichtung und
  // Bändern (zur Bandseite hin), Glasdichtung, Glas, Glasleiste, Griff.
  versatz: {
    Rahmen_links:     [-0.28, 0, 0],
    Rahmen_rechts:    [ 0.28, 0, 0],
    Rahmen_oben:      [ 0, 0.28, 0],
    Rahmen_unten:     [ 0, -0.28, 0],
    Anschlussfuge:    [ 0, 0, 0.10],
    // Beide Flügeldichtungen liegen zwischen Flügel und Blendrahmen, also HINTER dem Flügel:
    // die Falzdichtung tiefer im Falz (zweiter Anschlag), die Anschlagdichtung am Überschlag.
    // Die Anschlagdichtung stand früher vor dem Flügel (0.42) und fuhr durch ihn hindurch.
    Falzdichtung:     [ 0, 0, 0.16],
    Anschlagdichtung: [ 0, 0, 0.22],
    Fluegel:          [ 0, 0, 0.3],
    Band_oben:        [-0.5, 0, 0.3],
    Band_unten:       [-0.5, 0, 0.3],
    Dichtung:         [ 0, 0, 0.55],
    Glas:             [ 0, 0, 0.75],
    Glasleiste:       [ 0, 0, 0.9],
    Griff:            [ 0.16, 0, 1.05],
  },
  // Start-Verzögerung je Bauteil in der Intro-Animation (Anteil der Gesamtdauer).
  introVerzoegerung: {
    Rahmen_links: 0, Rahmen_rechts: 0, Rahmen_oben: 0.06, Rahmen_unten: 0.06, Anschlussfuge: 0.04,
    Falzdichtung: 0.12, Anschlagdichtung: 0.16,
    Fluegel: 0.2, Band_oben: 0.25, Band_unten: 0.25,
    Dichtung: 0.32, Glas: 0.38, Glasleiste: 0.43, Griff: 0.5,
  },
  // Dünne Teile, die im Modell bündig auf einer anderen Fläche liegen: minimal versetzen,
  // sonst flackern sie (Z-Fighting) und der Raycast trifft zufällig das Teil dahinter. Meter.
  buendig: {
    Anschlagdichtung: [0, 0, 0.0008],        // bündig auf dem Flügelüberschlag (seit dem Modell vom 13.09. am Flügel montiert)
    Schliessblech_rechts: [-0.0008, 0, 0],   // bündig auf der Falzfläche des Blendrahmens
    Schliessblech_oben: [0, -0.0008, 0],
    Schliessblech_unten: [0, 0.0008, 0],
  },
};

// ---------------------------------------------------------------------------------------
// Haustür (Aluminium, einflügelig, Bänder rechts, öffnet nach innen)
// ---------------------------------------------------------------------------------------

// Die Texte folgen den Angaben im GLB (Custom Properties label/info), hier mit Umlauten.
const HAUSTUER_TEILE = {
  Druecker: {
    label: 'Innendrücker',
    info: 'Innendrücker Edelstahl, Hebel 130 mm, dreht um die Spindelachse',
    category: 'druecker',
    categoryLabel: 'Alle Drücker',
  },
  Druecker_Rosette: {
    hover: false,
    label: 'Drückerrosette',
    info: 'Rosette des Innendrückers, Edelstahl Ø 52 mm',
    category: 'druecker',
    categoryLabel: 'Alle Drücker',
  },
  Stossgriff: {
    label: 'Stoßgriff',
    info: 'Edelstahl-Stoßgriff außen, 1400 mm, 30 × 15 mm Flachprofil, zwei Stützen',
    category: 'stossgriffe',
    categoryLabel: 'Alle Stoßgriffe',
  },
  Zylinder: {
    label: 'Profilzylinder',
    info: 'Motorzylinder mit Knauf innen, außen unter der Fingerprint-Blende, Ersatz ohne Blattwechsel',
    category: 'zylinder',
    categoryLabel: 'Alle Profilzylinder',
  },
  Fingerprint: {
    label: 'Fingerprint-Scanner',
    info: 'Fingerprint-Leser in Edelstahlblende 130 × 60 mm, steuert den Motorzylinder, Sensorfenster 22 × 32 mm',
    category: 'zutritt',
    categoryLabel: 'Alle Zutrittssysteme',
  },
  Falle: {
    label: 'Falle',
    info: 'Schlossfalle, federnd, Ersatz bei Verschleiß',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Riegel: {
    label: 'Riegelbolzen',
    info: 'Zwei Riegelbolzen der Mehrfachverriegelung, oben und unten',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Stulp: {
    label: 'Schlossstulp',
    info: 'Stulp der Mehrfachverriegelung, Edelstahl 24 × 2,5 mm, durchgehend',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Schliessblech_oben: {
    label: 'Schließblech oben',
    info: 'Schließblech im Rahmenfalz, Edelstahl, nimmt den oberen Riegel auf',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließbleche',
  },
  Schliessblech_mitte: {
    label: 'Schließblech mitte',
    info: 'Schließblech im Rahmenfalz, Edelstahl, nimmt die Falle auf',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließbleche',
  },
  Schliessblech_unten: {
    label: 'Schließblech unten',
    info: 'Schließblech im Rahmenfalz, Edelstahl, nimmt den unteren Riegel auf',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließbleche',
  },
  Band_oben: {
    label: 'Band oben',
    info: 'Verdeckt liegendes Band, rahmenseitiger Körper, 3D-verstellbar, geschlossen unsichtbar',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_oben_Fluegel: {
    label: 'Band oben, Flügelteil',
    info: 'Verdeckt liegendes Band, flügelseitiger Körper mit Lenkern, Edelstahl',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_mitte: {
    label: 'Band mitte',
    info: 'Verdeckt liegendes Band, rahmenseitiger Körper, 3D-verstellbar, geschlossen unsichtbar',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_mitte_Fluegel: {
    label: 'Band mitte, Flügelteil',
    info: 'Verdeckt liegendes Band, flügelseitiger Körper mit Lenkern, Edelstahl',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_unten: {
    label: 'Band unten',
    info: 'Verdeckt liegendes Band, rahmenseitiger Körper, 3D-verstellbar, geschlossen unsichtbar',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_unten_Fluegel: {
    label: 'Band unten, Flügelteil',
    info: 'Verdeckt liegendes Band, flügelseitiger Körper mit Lenkern, Edelstahl',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Innendichtung: {
    label: 'Innendichtung',
    info: 'Innere Falzdichtung auf der Rahmenstufe, EPDM, dichtet gegen die Innenschale',
    category: 'dichtungen',
    categoryLabel: 'Alle Dichtungen',
  },
  Anschlagdichtung: {
    label: 'Anschlagdichtung außen',
    info: 'Äußere Anschlagdichtung im Blendrahmen, EPDM, dichtet gegen die Außenschale',
    category: 'dichtungen',
    categoryLabel: 'Alle Dichtungen',
  },
  Tuerblatt: {
    label: 'Türblatt',
    info: 'Aluminium-Türblatt 104 mm, flügelüberdeckend, innen flächenbündig mit 6 mm Schattenfuge, außen RAL 7016, innen weiß',
    category: 'tuerblaetter',
    categoryLabel: 'Alle Türblätter',
  },
  Dekorplatte: {
    label: 'Dekorplatte Eiche',
    info: 'Echtholz-Applikation Eiche natur, 420 × 2106 mm, flächenbündig aufgesetzt',
    category: 'fuellungen',
    categoryLabel: 'Alle Dekorplatten',
  },
  Rahmen_links: {
    label: 'Blendrahmen links',
    info: 'Aluminium-Blendrahmen mit Stufenfalz, 90 mm Bautiefe, innen 44 mm Ansicht, außen vom Flügel überdeckt',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
  Rahmen_rechts: {
    label: 'Blendrahmen rechts',
    info: 'Aluminium-Blendrahmen mit Stufenfalz, 90 mm Bautiefe, innen 44 mm Ansicht, außen vom Flügel überdeckt',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
  Rahmen_oben: {
    label: 'Blendrahmen oben',
    info: 'Aluminium-Blendrahmen mit Stufenfalz, 90 mm Bautiefe, innen 44 mm Ansicht, außen vom Flügel überdeckt',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
  Schwelle: {
    label: 'Schwelle',
    info: 'Aluminium-Bodenschwelle 20 mm, thermisch getrennt, barrierearm',
    category: 'schwellen',
    categoryLabel: 'Alle Schwellen',
  },
};

export const HAUSTUER = {
  id: 'haustuer',
  url: './haustuer.glb',
  root: 'Tuer',
  anrede: 'Ihre Haustür',
  titel: 'Haustür Aluminium 1100 × 2200',
  nummer: 'HT-2026-0930',
  scanZeile: 'Haustür HT-2026-0930',
  canvasLabel: '3D-Modell der Haustür',
  // Türblatt dreht um die Bandachse rechts in den Raum; Kippen gibt es nicht.
  fluegel: { name: 'Tuerblatt', winkel: 60, oeffnen: 'Tür öffnen', kippen: null },
  // Der Drücker liegt waagerecht und zeigt zur Türmitte (+x, zur Bandseite hin); Drücken heißt
  // nach unten, vom Raum aus gesehen im Uhrzeigersinn, also negativ um +z: Richtung -1, 38 Grad.
  griff: { name: 'Druecker', rosette: 'Druecker_Rosette', drehen: 38, kippen: null, richtung: -1 },
  schere: null,
  bandMuster: /^Band_(oben|mitte|unten)/,
  fensterbank: null,
  // Das GLB hat (noch) keine Wand: der Viewer stellt eine verputzte Ersatzwand mit Öffnung um
  // die Tür, damit Innen-/Außenansicht, Laibung und Kameragrenzen wie beim Fenster funktionieren.
  // Liegt im GLB ein Node "Wand", hat er Vorrang.
  wand: 'Wand',
  // Edelstahl zählt hier als Beschlag: Bänder, Drücker, Zylinder liegen in der Explosion
  // seitlich neben dem Türblatt statt darin zu verschwinden.
  hardwareMaterialien: ['Beschlag_Stahl', 'Edelstahl'],
  statisch: new Set(),
  teile: HAUSTUER_TEILE,
  gruppen: {
    druecker: 'Griff und Beschlag', stossgriffe: 'Griff und Beschlag', baender: 'Griff und Beschlag',
    schliessstuecke: 'Griff und Beschlag',
    schloss: 'Schloss und Zutritt', zylinder: 'Schloss und Zutritt', zutritt: 'Schloss und Zutritt',
    dichtungen: 'Dichtungen',
    tuerblaetter: 'Türblatt und Rahmen', fuellungen: 'Türblatt und Rahmen', blendrahmen: 'Türblatt und Rahmen',
    schwellen: 'Türblatt und Rahmen',
  },
  // Gruppenweise sortiert (die Liste setzt bei jedem Gruppenwechsel eine Überschrift).
  reihenfolge: [
    'Druecker', 'Stossgriff', 'Schliessblech_oben', 'Schliessblech_mitte', 'Schliessblech_unten',
    'Band_oben', 'Band_oben_Fluegel', 'Band_mitte', 'Band_mitte_Fluegel', 'Band_unten', 'Band_unten_Fluegel',
    'Zylinder', 'Fingerprint', 'Falle', 'Riegel', 'Stulp',
    'Innendichtung', 'Anschlagdichtung',
    'Tuerblatt', 'Dekorplatte', 'Rahmen_links', 'Rahmen_rechts', 'Rahmen_oben', 'Schwelle',
  ],
  // Ebenen von der Wand in den Raum: Blendrahmen und Schwelle (auseinander), Schließbleche mit
  // dem linken Rahmen, äußere und innere Dichtung, Türblatt. Was außen am Blatt sitzt
  // (Dekorplatte, Stoßgriff, Fingerprint), bleibt hinter der Blattebene, aber seitlich daneben,
  // damit es von innen zu sehen ist; die Bänder rechts, Schlossteile links, Zylinder und
  // Drücker vor dem Blatt. Die x-Werte sind so gewählt, dass sich keine zwei Teile berühren
  // (nachgemessen über die Explosions-Boxen, siehe dev/kamera-messung.js).
  versatz: {
    Rahmen_links:        [-0.28, 0, 0],
    Rahmen_rechts:       [ 0.28, 0, 0],
    Rahmen_oben:         [ 0, 0.28, 0],
    Schwelle:            [ 0, -0.28, 0],
    Schliessblech_oben:  [-0.22, 0, 0.1],
    Schliessblech_mitte: [-0.22, 0, 0.1],
    Schliessblech_unten: [-0.22, 0, 0.1],
    Anschlagdichtung:    [ 0, 0, 0.08],
    Innendichtung:       [ 0, 0, 0.16],
    Tuerblatt:           [ 0, 0, 0.3],
    // Rechts neben dem Blatt, knapp HINTER der Ebene des Blendrahmens: davor verdeckte sie den
    // rechten Blendrahmen fast ganz; so bleibt er frei und die Platte schaut links und rechts
    // von ihm hervor. Nach dem Hub liegt sie 3 cm vor der Wandfläche.
    Dekorplatte:         [ 0.6, 0, -0.1],
    Band_oben_Fluegel:   [ 0.7, 0, 0.3],
    Band_mitte_Fluegel:  [ 0.7, 0, 0.3],
    Band_unten_Fluegel:  [ 0.7, 0, 0.3],
    Band_oben:           [ 0.78, 0, 0.3],
    Band_mitte:          [ 0.78, 0, 0.3],
    Band_unten:          [ 0.78, 0, 0.3],
    Stossgriff:          [-0.3, 0, 0.16],
    Fingerprint:         [-0.42, 0, 0.16],
    Stulp:               [-0.62, 0, 0.3],
    Riegel:              [-0.62, 0, 0.3],
    Falle:               [-0.62, 0, 0.3],
    Zylinder:            [ 0, 0, 0.72],
    Druecker:            [ 0, 0, 0.95],
  },
  introVerzoegerung: {
    Rahmen_links: 0, Rahmen_rechts: 0, Rahmen_oben: 0.06, Schwelle: 0.06,
    Schliessblech_oben: 0.1, Schliessblech_mitte: 0.1, Schliessblech_unten: 0.1,
    Anschlagdichtung: 0.12, Innendichtung: 0.16,
    Tuerblatt: 0.2, Dekorplatte: 0.24,
    Band_oben: 0.25, Band_mitte: 0.25, Band_unten: 0.25,
    Band_oben_Fluegel: 0.28, Band_mitte_Fluegel: 0.28, Band_unten_Fluegel: 0.28,
    Stulp: 0.3, Riegel: 0.3, Falle: 0.3, Stossgriff: 0.32, Fingerprint: 0.36,
    Zylinder: 0.42, Druecker: 0.5,
  },
  buendig: {
    Schliessblech_oben:  [0.0008, 0, 0],   // bündig auf der Falzfläche des linken Blendrahmens
    Schliessblech_mitte: [0.0008, 0, 0],
    Schliessblech_unten: [0.0008, 0, 0],
  },
};

export const MODELLE = { fenster: FENSTER, haustuer: HAUSTUER };
