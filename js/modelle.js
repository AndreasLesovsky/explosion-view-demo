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
  // Hauptseite: dort liegen Ruheansicht, Intro und Explosion; die andere Seite erreicht man über
  // den Ansichtsknopf. Fenster: innen.
  hauptseite: 'innen',
  // Wo die Explosion zu sehen ist: 'innen' | 'aussen' (Viewer fährt vorher auf diese Seite,
  // Seitenwechsel klappt ein) oder 'beide' (bleibt beim Seitenwechsel bestehen).
  explosionSeite: 'innen',
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
  // `loslassen`: der Griff geht zurück in die Ruhelage, sobald der Flügel schwingt (Drücker);
  // ein Fenstergriff bleibt in seiner Stellung.
  griff: { name: 'Griff', rosette: 'Griff_Rosette', drehen: 90, kippen: 180, richtung: null, loslassen: false },
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
    info: 'Innendrücker Edelstahl mit Chromhals, Rundprofil Ø 19 mm, 90°-Bogen, Hebel 120 mm, dreht um die Spindelachse',
    category: 'druecker',
    categoryLabel: 'Alle Drücker',
  },
  Druecker_Rosette: {
    hover: false,
    label: 'Drückerrosette',
    info: 'Rundrosette Ø 52 mm, Edelstahl matt mit Chromring',
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
    info: 'Motorzylinder mit Rundrosette und Knauf innen, außen unter der Fingerprint-Blende, Ersatz ohne Blattwechsel',
    category: 'zylinder',
    categoryLabel: 'Alle Profilzylinder',
  },
  Fingerprint: {
    label: 'Fingerprint-Scanner',
    info: 'Fingerprint-Leser in Edelstahlblende 120 × 60 mm, steuert den Motorzylinder, Sensorfenster 22 × 32 mm',
    category: 'zutritt',
    categoryLabel: 'Alle Zutrittssysteme',
  },
  Falle: {
    label: 'Falle',
    info: 'Falle des Hauptschlosses, federnd, Ersatz bei Verschleiß',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Riegel: {
    label: 'Riegel',
    info: 'Riegel des Hauptschlosses, 12 mm Ausschluss, 2-tourig',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Zusatzschloss_oben: {
    label: 'Zusatzschloss oben',
    info: 'Zusatzschloss der Mehrfachverriegelung: Schwenkhaken und Bolzen, greift ins Schließblech',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Zusatzschloss_unten: {
    label: 'Zusatzschloss unten',
    info: 'Zusatzschloss der Mehrfachverriegelung: Schwenkhaken und Bolzen, greift ins Schließblech',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Stulp: {
    label: 'Schlossstulp',
    info: 'Durchgehender Stulp der Mehrfachverriegelung, Edelstahl 17 × 2,5 mm',
    category: 'schloss',
    categoryLabel: 'Alle Schlossteile',
  },
  Schliessblech_oben: {
    label: 'Schließblech oben',
    info: 'Schließblech im Rahmenfalz, Edelstahl, nimmt den Schwenkhaken des oberen Zusatzschlosses auf',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließbleche',
  },
  Schliessblech_mitte: {
    label: 'Schließblech mitte',
    info: 'Schließblech im Rahmenfalz, Edelstahl, nimmt Falle und Riegel auf',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließbleche',
  },
  Schliessblech_unten: {
    label: 'Schließblech unten',
    info: 'Schließblech im Rahmenfalz, Edelstahl, nimmt den Schwenkhaken des unteren Zusatzschlosses auf',
    category: 'schliessstuecke',
    categoryLabel: 'Alle Schließbleche',
  },
  Band_oben: {
    label: 'Band oben',
    info: 'Aufsatzband für Aluminium-Haustüren, rahmenseitiges Teil, 3D-verstellbar, pulverbeschichtet weiß',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_oben_Fluegel: {
    label: 'Band oben, Flügelteil',
    info: 'Aufsatzband, flügelseitiges Teil mit Bandbolzen, pulverbeschichtet weiß',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_mitte: {
    label: 'Band mitte',
    info: 'Aufsatzband für Aluminium-Haustüren, rahmenseitiges Teil, 3D-verstellbar, pulverbeschichtet weiß',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_mitte_Fluegel: {
    label: 'Band mitte, Flügelteil',
    info: 'Aufsatzband, flügelseitiges Teil mit Bandbolzen, pulverbeschichtet weiß',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_unten: {
    label: 'Band unten',
    info: 'Aufsatzband für Aluminium-Haustüren, rahmenseitiges Teil, 3D-verstellbar, pulverbeschichtet weiß',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Band_unten_Fluegel: {
    label: 'Band unten, Flügelteil',
    info: 'Aufsatzband, flügelseitiges Teil mit Bandbolzen, pulverbeschichtet weiß',
    category: 'baender',
    categoryLabel: 'Alle Türbänder',
  },
  Innendichtung: {
    label: 'Innendichtung',
    info: 'Innere Falzdichtung auf der Rahmenstufe, EPDM, dreiseitig',
    category: 'dichtungen',
    categoryLabel: 'Alle Dichtungen',
  },
  Anschlagdichtung: {
    label: 'Anschlagdichtung außen',
    info: 'Äußere Anschlagdichtung hinter dem Rahmenanschlag, EPDM, dreiseitig',
    category: 'dichtungen',
    categoryLabel: 'Alle Dichtungen',
  },
  Tuerblatt: {
    label: 'Türblatt',
    info: 'Aluminium-Türblatt 90 mm, dreistufiges Falzprofil, außen flächenbündig im Rahmenanschlag, innen bündig mit 6 mm Schattenfuge, außen RAL 7016, innen weiß',
    category: 'tuerblaetter',
    categoryLabel: 'Alle Türblätter',
  },
  Dekorplatte: {
    label: 'Dekorplatte Eiche',
    info: 'Echtholz-Applikation Eiche natur, 347 × 2033 mm, 3 mm aufgesetzt',
    category: 'fuellungen',
    categoryLabel: 'Alle Dekorplatten',
  },
  Rahmen: {
    label: 'Blendrahmen',
    info: 'Aluminium-Blendrahmen, ein Stück, Stufenfalz nach AT500-Prinzip, 90 mm Bautiefe, außen 75 mm Anschlag, innen 44 mm, außen RAL 7016, innen weiß',
    category: 'blendrahmen',
    categoryLabel: 'Alle Blendrahmen',
  },
  Schwelle: {
    label: 'Schwelle',
    info: 'Aluminium-Bodenschwelle 20 mm, durchgehend 1100 mm, thermisch getrennt, barrierearm',
    category: 'schwellen',
    categoryLabel: 'Alle Schwellen',
  },
};

export const HAUSTUER = {
  id: 'haustuer',
  url: './haustuer.glb',
  root: 'Tuer',
  // Die meisten Bauteile einer Haustür sitzen außen (Stoßgriff, Fingerprint, Dekorplatte, die
  // Ansichtsfläche des Blatts): Ruheansicht und Intro liegen vor der Fassade. Die Explosion geht
  // vom Blatt aus nach beiden Seiten und bleibt beim Seitenwechsel bestehen: von außen sieht man
  // die Außenteile, von innen Drücker, Bänder und Innendichtung.
  hauptseite: 'aussen',
  explosionSeite: 'beide',
  // Hub der Explosion in Metern (fest statt aus der Wanddicke): so weit vor die Fassade, dass
  // auch Drücker und Bänder, die vom Blatt aus nach innen gehen, frei vor der Wand stehen.
  hub: 0.7,
  anrede: 'Ihre Haustür',
  titel: 'Haustür Aluminium 1100 × 2200',
  nummer: 'HT-2026-0930',
  scanZeile: 'Haustür HT-2026-0930',
  canvasLabel: '3D-Modell der Haustür',
  // Türblatt dreht um die Achse der Aufsatzbänder (Custom Property `pivot`, 17 mm vor der
  // Innenfläche) in den Raum; Kippen gibt es nicht.
  fluegel: { name: 'Tuerblatt', winkel: 60, oeffnen: 'Tür öffnen', kippen: null },
  // Der Drücker liegt waagerecht und zeigt zur Türmitte (+x, zur Bandseite hin); Drücken heißt
  // nach unten, vom Raum aus gesehen im Uhrzeigersinn, also negativ um +z: Richtung -1, 38 Grad.
  griff: { name: 'Druecker', rosette: 'Druecker_Rosette', drehen: 38, kippen: null, richtung: -1, loslassen: true },
  schere: null,
  bandMuster: /^Band_(oben|mitte|unten)/,
  fensterbank: null,
  // Wand mit Öffnung als Node im GLB, wie beim Fenster; die Tür sitzt außen bündig in der Fassade.
  wand: 'Wand',
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
    'Zylinder', 'Fingerprint', 'Falle', 'Riegel', 'Zusatzschloss_oben', 'Zusatzschloss_unten', 'Stulp',
    'Innendichtung', 'Anschlagdichtung',
    'Tuerblatt', 'Dekorplatte', 'Rahmen', 'Schwelle',
  ],
  // Versatz in Metern, lokal zu "Tuer" (z: + in den Raum, - zur Straße). Vorher hebt der Hub die
  // ganze Tür 70 cm vor die Fassade. Der Blendrahmen ist ein Stück und bleibt auf dem Hub stehen; das
  // Blatt gleitet aus seinem Falz nach innen (nach außen sperrt der 75-mm-Anschlag), die
  // Schlossteile bleiben in seiner Kante (seitlich wären die Schließbleche im Weg). Was innen am
  // Blatt oder am Rahmen sitzt, geht nach innen (Drücker, Aufsatzbänder), was außen sitzt, nach
  // außen (Dekorplatte, Stoßgriff); Zylinder und Fingerprint-Blende gleiten als Einheit aus der
  // Bohrung nach außen. Nach außen vor den Rahmen kann das Blatt nicht: die Anschlaglippe des
  // einteiligen Rahmens greift 9 mm über seine Mittelstufe. Die Innendichtung fährt mit dem Blatt (gleicher Weg): die Riegel und
  // Haken ragen unter ihr aus der Blattkante, jeder andere Weg schöbe sie durch die Dichtung. Die
  // Anschlagdichtung sitzt hinter dem Anschlag fest und die Schließbleche im Rahmenfalz, beide
  // bleiben beim Rahmen.
  // Nachgemessen (Scheitelpunkte gegen Volumen, jede Phase abgetastet): keine Durchdringung, die
  // nicht schon im montierten Zustand besteht (Zylinder in seiner Bohrung, Bolzen im Schließblech).
  versatz: {
    Rahmen:              [ 0, 0, 0],
    Schwelle:            [ 0, -0.14, 0],
    Schliessblech_oben:  [ 0, 0, 0],
    Schliessblech_mitte: [ 0, 0, 0],
    Schliessblech_unten: [ 0, 0, 0],
    Anschlagdichtung:    [ 0, 0, 0],
    Innendichtung:       [ 0, 0, 0.22],
    Tuerblatt:           [ 0, 0, 0.22],
    Stulp:               [ 0, 0, 0.22],
    Falle:               [ 0, 0, 0.22],
    Riegel:              [ 0, 0, 0.22],
    Zusatzschloss_oben:  [ 0, 0, 0.22],
    Zusatzschloss_unten: [ 0, 0, 0.22],
    Band_oben_Fluegel:   [ 0, 0, 0.4],
    Band_mitte_Fluegel:  [ 0, 0, 0.4],
    Band_unten_Fluegel:  [ 0, 0, 0.4],
    Band_oben:           [ 0, 0, 0.4],
    Band_mitte:          [ 0, 0, 0.4],
    Band_unten:          [ 0, 0, 0.4],
    Druecker:            [ 0, 0, 0.42],
    Zylinder:            [ 0, 0, -0.1],
    Fingerprint:         [ 0, 0, -0.1],
    Dekorplatte:         [ 0, 0, -0.16],
    Stossgriff:          [ 0, 0, -0.3],
  },
  // Reihenfolge im Intro: Rahmen zuerst, dann Schwelle, Anschlagdichtung und Schließbleche, das
  // Blatt samt Innendichtung und Schlossteilen (gleiche Verzögerung, sie fahren mit ihm), danach
  // Bänder, Außenteile, Zylinder mit Blende und zuletzt der Drücker. Alles, was am Blatt montiert
  // ist, startet nach dem Blatt, damit es ihm nie in die Quere kommt.
  introVerzoegerung: {
    Rahmen: 0, Schwelle: 0.06,
    Schliessblech_oben: 0.1, Schliessblech_mitte: 0.1, Schliessblech_unten: 0.1,
    Anschlagdichtung: 0.12,
    Tuerblatt: 0.2, Innendichtung: 0.2, Stulp: 0.2, Falle: 0.2, Riegel: 0.2, Zusatzschloss_oben: 0.2, Zusatzschloss_unten: 0.2,
    Dekorplatte: 0.24, Band_oben: 0.25, Band_mitte: 0.25, Band_unten: 0.25,
    Band_oben_Fluegel: 0.28, Band_mitte_Fluegel: 0.28, Band_unten_Fluegel: 0.28,
    Stossgriff: 0.32, Fingerprint: 0.4, Zylinder: 0.4, Druecker: 0.5,
  },
  buendig: {
    Schliessblech_oben:  [0.0008, 0, 0],   // bündig auf der Falzfläche des Blendrahmens
    Schliessblech_mitte: [0.0008, 0, 0],
    Schliessblech_unten: [0.0008, 0, 0],
  },
};

export const MODELLE = { fenster: FENSTER, haustuer: HAUSTUER };
