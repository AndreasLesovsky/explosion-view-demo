// =====================================================================
// viewer.js – three.js Viewer für Fenster und Türen (Explosion View Demo)
// Lädt das GLB des gewählten Modells (modelle.js), rendert mit Umgebungslicht + Outline-
// Highlight, Raycast auf hoverbare Bauteile, Intro-/Explosionsanimation und Tooltip-Anker in
// Bildschirmkoordinaten. Rendert nur bei Änderungen. Alles Modellspezifische (Node-Namen,
// Versätze, Texte, ob es Kippen und Griffdrehung gibt) kommt aus dem Modelleintrag.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { MODELLE, MOUNT_OFFSETS, MOUNT_INTRO_DELAY, SHOP_BASE } from './modelle.js';

// Bauteil-Texte, Reihenfolge, Explosionsversätze und Namen je Modell: siehe modelle.js.

// Flügel: Drehstellung um die senkrechte Bandachse (aus den Bandteilen abgeleitet) oder
// Kippstellung um die waagerechte Achse am Flügelfuß. Vorher dreht jeweils der Griff. Winkel,
// Namen und ob Kippen möglich ist, stehen im Modelleintrag (modelle.js). Alles prozedural in
// three.js, nichts aus dem GLB.
const OPEN_DURATION = 900;          // ms, Schwenk in die Drehstellung
const TILT_GAP = 0.14;              // m, Spaltmaß oben in Kippstellung; der Winkel folgt aus der Flügelhöhe
const TILT_DURATION = 700;          // ms
const HANDLE_TURN_DURATION = 350;   // ms je 90 Grad Griffdrehung
const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const IDENTITY_Q = new THREE.Quaternion();

// Explosion in zwei Stufen: erst hebt sich das ganze Fenster gerade aus der Wand
// (Hub), dann gehen die Teile auseinander (Spreizung). Einklappen läuft umgekehrt.
// Anteil der Gesamtdauer, den die Hub-Phase beim Ausfahren einnimmt:
const EXPLODE_LIFT_SHARE = 0.4;
const INTRO_DURATION = 2000;    // ms, Teile fliegen zusammen, dann gleitet das Fenster in die Wand
const INTRO_SPREAD_SHARE = 0.62;
const EXPLODE_DURATION = 1300;  // ms, beide Stufen zusammen
const RESET_DURATION = 700;    // ms
const VIEW_RIDE_MS = 3600;     // ms, Kamerafahrt um die Wandkante beim Wechsel Innen-/Außenansicht
const MIN_DIST = 0.7;          // m, Mindestabstand Kamera zu Blickpunkt (eingebaut, Fokus)
// m über der Wandunterkante, unter die die Kamera nicht darf. Klein halten: Der Anschlag nimmt
// sonst beim Blick von schräg unten die Neigung zurück, statt nur die Höhe zu begrenzen, und
// die untere Ecke rückt wieder aus dem Bild.
const FLOOR_CLEARANCE = 0.08;
// Drehgeschwindigkeit in der Übersicht und am Mindestabstand. Dazwischen wird nicht die
// Geschwindigkeit überblendet, sondern der Bildweg je Zug (siehe tick): nah am Fenster ist die
// Kopplung steil (der Blickpunkt erreicht die Ecke innerhalb von rund 12 Grad), dieselbe
// Fingerbewegung schiebt das Bild dort um ein Vielfaches. Mit 0.3 fuhr die Ansicht mit einem
// kurzen Zug quer über den Rahmen. Mit 0.05 fährt das Bild am Mindestabstand bei einem Zug
// über die volle Bühnenhöhe rund 2,5 Bildhöhen weit; in der Übersicht dreht derselbe Zug um
// 250 Grad.
const ROTATE_SPEED = 0.6;
const ROTATE_SPEED_NEAR = 0.1;
// Dritte Stützstelle für die Zoom-Mitte (halbe Kopplungsstärke, rund 1,4 m). Dort ist der
// Schwenk je Zug sonst am größten, weil Drehung und Kopplung beide noch kräftig sind — mit nur
// zwei Stützstellen lag er in der Mitte beim Doppelten des Werts am Mindestabstand.
const ROTATE_SPEED_MID = 0.16;
// Ab welcher Nähe (0 = Home-Distanz, 1 = Mindestabstand) die Kopplung des Blickpunkts an die
// Drehung einsetzt. Weiter draußen dreht die Kamera rein um die Fenstermitte. Bewusst nicht
// null: begann die Kopplung schon auf Home-Distanz, fuhr der Blickpunkt bei halbem Zoom je
// Grad Drehung anderthalbmal so weit seitlich wie der Orbit-Weg, und die Ansicht rutschte
// von Kante zu Kante, statt sich zu drehen. Mit 0.4 beginnt sie bei rund 2,1 m.
const COUPLING_START = 0.4;
// Der aufsummierte Schwenk (Rohwert) wird bei diesem Vielfachen seiner Grenze gekappt: dort
// erreicht softLimit 95 % der Grenze. Ließe man ihn weiterlaufen, müsste man beim Zurückdrehen
// erst den Überhang abtragen, bevor sich der Blickpunkt wieder bewegt — eine tote Zone.
const SWIVEL_RAW_MAX = 1.06;
// Über diesen unteren Bereich der Kopplungsstärke wird der wirksame Schwenk weich auf null
// gezogen. Ohne die Hülle spränge der Blickpunkt, wenn der Abstand ohne Zoom über die
// Kopplungsschwelle wächst (Explosion klappt aus 1,5 m ein: Drehpunkt weicht 0,7 m zurück,
// die Kamera bleibt, u wird null und der Rohwert würde in einem Frame gelöscht).
const SWIVEL_FADE_U = 0.2;
// Neigung nach oben und nach unten gleich weit (rad, gemessen von +y). Die Boden- und
// Wandschranke in applyNearLimits() engt das nah am Fenster zusätzlich ein.
const POLAR_TILT = 2.3;
// Nah am Fenster muss die Kamera in der Maueröffnung bleiben. Steht sie daneben oder darüber,
// schiebt sich die Laibung davor. Gemessen bei 0.7 m Abstand: ab 15 Grad Aufsicht zeigte der
// ganze Bildschirm nur noch die Wand, seitlich fiel der Fensteranteil von 88 auf 25 Prozent.
// Mehr Schwenk half dort nichts, er schob die Kamera nur weiter aus der Öffnung heraus.
// Zugabe über die Öffnungskante hinaus, in Metern, in beide Richtungen gleich. Mit 0.16 stand
// die Kamera an der oberen Ecke 15 cm neben und über der Öffnung, und im Bild waren noch
// 8 Prozent Fenster. Der Rand bestimmt zusammen mit PIVOT_INSET den Drehwinkel, der am
// Mindestabstand übrig bleibt: asin((Rand + Einzug) / MIN_DIST), mit 0.12 + 0.02 rund
// 12 Grad. Die Ecke inspiziert man also fast frontal — mehr geht bei 0.22 m Laibungstiefe
// nicht, ohne dass die Laibung das Bild übernimmt.
const OPENING_MARGIN_X = 0.12;
const OPENING_MARGIN_Y = 0.12;
// Wie weit der Blickpunkt vor der Fensterkante haltmacht, in Metern. Klein, damit die Ecke
// selbst in die Bildmitte kommt; genau auf der Kante zielte er auf die Fuge zur Laibung.
// Mit 0.10 blieb der Blickpunkt 18 cm vor der Ecke stehen, die Ecke lag am Bildrand.
const PIVOT_INSET = 0.02;
// Abstand, den die Kamera zu jedem Bauteil hält, in Metern. Die Nahebene liegt bei 0,05 m,
// ihre Ecken bei breitem Bild rund 0,065 m vor der Kamera; darunter schneidet sie Flächen an,
// und man sieht in Teile hinein (Z-Fighting der Innereien).
const CLEAR_MARGIN = 0.10;
// Vorausschauender Rückzug vor Öffnen, Kippen und Explosion: so viele Zwischenposen werden
// abgetastet, und höchstens so lange dauert die Fahrt. Beim Flügel dreht in dieser Zeit erst
// der Griff (HANDLE_TURN_DURATION), der Rückzug ist also fertig, bevor sich der Flügel bewegt.
const RETREAT_SAMPLES = 12;
const RETREAT_MS = 350;

// Qualitätsstufen. Das Modell ist klein (wenige tausend Dreiecke), teuer ist auf Handys die
// Füllrate: jedes Bild geht mit Pixel-Ratio in ein HDR-Ziel mit MSAA, danach Kontur- und
// Tonemapping-Pass, dazu PCF-Schatten auf jedem Pixel. Touch-Geräte (kein Hover, kein
// feiner Zeiger) rendern deshalb mit weniger Pixeln, halbem MSAA, kleinerer Schattenkarte
// und einer Ambient Occlusion in halber Auflösung mit halb so vielen Samples: die
// Kontaktschatten (Fensterbank an Blendrahmen, Rahmen an Wand) sind weich, aber da.
const QUALITY = {
  desktop: { maxPixelRatio: 1.5, msaa: 4, shadowMap: 1024, gtao: { samples: 16, pdSamples: 16 } },
  mobile: { maxPixelRatio: 1.5, msaa: 2, shadowMap: 1024, gtao: { samples: 8, pdSamples: 8 } },
};
// Gemessen wird der Abstand zwischen zwei aufeinander folgenden gerenderten Bildern, nicht die
// Dauer des Zeichenbefehls: der kehrt zurück, sobald die Befehle abgeschickt sind, und sagt über
// die Grafikkarte nichts aus.
//
// Zurückgeschaltet wird nach zwei Kriterien, und zwar erst wenn BEIDE Wege es nahelegen wollen:
// hauptsächlich relativ zum eigenen Takt des Geräts, hilfsweise absolut.
// Relativ: der kleinste gemessene Abstand im Fenster ist der Takt des Bildschirms. Liegt der
// Mittelwert deutlich darüber, werden Bilder ausgelassen. Das gilt bei 60, 90 und 120 Hz
// gleichermaßen. Eine feste Millisekundenzahl tut das NICHT: ein Galaxy S21 schaltet seinen
// Bildschirm je nach Last auf 48 Hz, das sind 20.8 ms je Bild und völlig regulär. Mit einer
// starren Schwelle von 20 ms wurde genau dieser normale Takt als Ruckeln gewertet, und das
// Telefon rutschte Stufe für Stufe bis ganz nach unten.
// Absolut: ist die Grafik selbst der Engpass, sind alle Bilder gleichmäßig langsam, dann ist der
// Mittelwert nah am Minimum und das relative Kriterium schweigt. Deshalb zusätzlich eine harte
// Grenze bei 28 ms, also rund 36 Bildern je Sekunde.
// Beide Werte zusammen bedeuten dasselbe: zurückgeschaltet wird erst unterhalb von etwa
// 30 Bildern je Sekunde. Bei 60 Hz sind 2.0 mal der Takt 33 ms, und 34 ms absolut liegen
// daneben. Vorher standen hier 1.6 und 28 ms, das entsprach 36 fps: ein Telefon, das mit
// 40 bis 45 fps völlig ordentlich lief, wurde damit Stufe für Stufe abgebaut, bis das Bild
// sichtbar grob war. Eine Bildrate in den Vierzigern ist kein Grund, die Auflösung zu opfern;
// das Bild ist das, was man sieht, die Bildrate merkt man erst deutlich darunter.
const FRAME_BUDGET_REL = 2.0;
const FRAME_BUDGET_ABS = 34;
// Obergrenze für den Bezugstakt. Ohne sie misst sich ein schneller Bildschirm an sich selbst:
// bei 165 Hz ist der Takt 6 ms, das Doppelte sind 12 ms, und damit gilt schon alles unter
// 83 fps als zu langsam - auf einer RTX 5080 wurde deshalb einmal grundlos abgestuft. Bei 120 Hz
// wären es 60 fps, und genau daran fiel ein Galaxy S21 durch, das mit 50 bis 60 fps völlig in
// Ordnung lief. Mit dem Deckel gilt für JEDEN Bildschirm derselbe Maßstab: unter etwa 30 fps.
// Das ist eine bewusste Entscheidung für Bildqualität statt Bildrate - hier wird ein Fenster
// betrachtet und gedreht, kein Ego-Shooter gespielt.
const TAKT_MIN_MS = 1000 / 60;
// Größerer Abstand heißt: es wurde zwischendurch gar nicht gezeichnet (Render-on-Demand).
// Solche Pausen zählen nicht mit, sonst würde jede Ruhephase als Ruckler gewertet.
const FRAME_GAP_MS = 100;
// So viele gerenderte Bilder werden gemittelt, bevor ein Fenster bewertet wird.
const PERF_WINDOW = 30;
// So viele schlechte Fenster hintereinander sind nötig, bevor zurückgeschaltet wird. Mit nur
// einem kaskadierte es: während des Ziehens ist die Last am höchsten, jedes Fenster fiel durch,
// und die Leiter rutschte in einem Zug bis ganz nach unten, obwohl eine mittlere Stufe gereicht
// hätte. Ein gutes Fenster setzt den Zähler zurück.
const PERF_SCHLECHTE_FENSTER = 2;
// Mindestabstand zwischen zwei Umschaltungen. Jede legt Renderziele neu an; zu schnell
// hintereinander bringt das schwache Treiber ins Straucheln.
const PERF_COOLDOWN_MS = 2000;
// So viele Bilder nach dem Start und nach jeder Umschaltung werden verworfen (Aufwärmen,
// Shader-Übersetzung, Texturen).
const PERF_WARMUP = 8;

// Einmessphase. Sie läuft unsichtbar hinter dem Scan-Overlay: der Viewer spielt das Intro
// einmal blind durch und sucht sich dabei seine Stufe. Gemessen wird damit an genau der Last,
// die gleich danach sichtbar wird - die Explosionsansicht ist der teuerste Zustand der ganzen
// Anwendung. Der Gewinn ist doppelt: das sichtbare Intro läuft vom ersten Bild an auf der
// richtigen Stufe, und die Umschaltungen dorthin sieht niemand.
// Kürzere Fenster und kein Abklingen, weil hier Tempo zählt und ein Flackern nicht stört.
const KAL_WINDOW = 20;
// So viele gute Fenster hintereinander gelten als eingemessen. Zwei genügen: ein einzelnes
// gutes Fenster kann ein ruhiger Moment der Animation sein.
const KAL_GUT_NOETIG = 2;
// Notbremse. Ein sehr langsames Gerät soll den Ablauf nicht aufhalten; die Leiter im Betrieb
// fängt den Rest ohnehin ab.
const KAL_MAX_MS = 1600;
// Die Stufen vollständig beschrieben, von teuer (0) nach billig. Als Tabelle statt als Folge
// von Einzelschritten: so ist auf einen Blick zu sehen, was eine Stufe bedeutet, und der Start
// ist schlicht ein Index.
// Die Stufen vollständig beschrieben, von teuer (0) nach billig. Als Tabelle statt als Folge
// von Einzelschritten: so ist auf einen Blick zu sehen, was eine Stufe bedeutet, und der Start
// ist schlicht ein Index.
//
// Reihenfolge: zuerst die Umgebungsverdeckung, dann die Auflösung. Die Verdeckung ist der
// teuerste Durchgang, die Schärfe dagegen das, was am meisten auffällt. Umgekehrt sortiert
// landete ein Telefon bei Pixelverhältnis 1 und sah verpixelt aus, obwohl die Verdeckung
// noch lief. Ganz oben die Anzeigeauflösung selbst: wirksam wird min(devicePixelRatio, pr),
// auf einem gewöhnlichen Monitor ändert diese Stufe also nichts.
//
// Die Kantenglättung steht bewusst NICHT mehr in der Tabelle. Sie war eine eigene Sprosse,
// die vor der Auflösung geopfert wurde - aber gemessen verbessert FXAA das Bild bei jedem
// Pixelverhältnis (24 % bei pr 2, 19 % bei 1.5, 35 % bei 1), und ein Vollbild-Durchgang ist
// billiger als alles andere in der Kette. Sie abzuschalten war die schlechteste aller
// möglichen Ersparnisse. Jetzt gilt: eingebaute Grafik hat FXAA, immer; eigenständige hat
// MSAA, immer. Beides steht beim Start fest.
const STUFEN = [
  { pr: 3,    ao: true,  aoProben: 16 },
  { pr: 2,    ao: true,  aoProben: 16 },
  { pr: 2,    ao: true,  aoProben: 8  },
  { pr: 2,    ao: false, aoProben: 8  },
  { pr: 1.5,  ao: false, aoProben: 8  },
  { pr: 1.25, ao: false, aoProben: 8  },
  { pr: 1,    ao: false, aoProben: 8  },
];
// Startstufe je Art der Grafik.
// Bewusst NICHT zusätzlich nach Punktdichte aufgeteilt: naheliegend wäre, einem Notebook
// mit einfacher Dichte mehr zuzutrauen als einem Telefon mit dreifacher. Nachgemessen ist es
// umgekehrt. Das Telefon rechnet 0,7, das Notebook 1,5 Megapixel je Bild - der kleinere Wert
// je Punkt wird von der viel größeren Fläche mehr als aufgewogen. Die Dichte allein sagt
// also nichts über die Last, entscheidend ist Fläche mal Dichte im Quadrat.
// Eigenständige Karten starten ganz oben. Das ist erst vertretbar, seit es die Einmessphase
// gibt: eine schwächere Karte findet dort in einem Zug ihre Stufe, unsichtbar, statt dem
// Nutzer beim Drehen vier Umschaltungen vorzuführen. Nach dem Chipnamen ließe sich das nicht
// unterscheiden - derselbe Firefox meldet eine RTX 5080 als "GeForce GTX 980".
const START_STUFE = { 'eigenständig': 0, unbekannt: 2, eingebaut: 2 };
// Die Kantenglättung gehört bewusst NICHT in die Tabelle. Sie steckt in den Renderzielen des
// Composers, und die Zahl der Abtastungen zur Laufzeit zu ändern zerlegt sie: three wirft dann
// beim nächsten Bild "Invalid value used as weak map key" aus setRenderTarget. Sie wird deshalb
// einmal beim Start festgelegt: eingebaute Grafik bekommt FXAA, eigenständige MSAA.

// Eingebaute Grafik am Namen des Chips erkennen. NUR zum Absenken der Startstufe: die
// Zeichenkette ist unzuverlässig, manche Browser verschleiern sie, und neue Chips fehlen in
// jeder Liste. Die Startstufe ist deshalb nur eine Vermutung; korrigiert wird ausschließlich
// nach unten, über die Messung. Einen Weg zurück nach oben gibt es bewusst NICHT: jede
// Umschaltung legt Renderziele neu an und ist ein Bild lang als Flackern zu sehen, und ein
// Auf und Ab zwischen zwei Stufen war genau die Beschwerde, die dazu geführt hat.
// eingebauter Grafik beginnt es gleich auf der passenden Stufe, statt sichtbar umzuschalten.
// @param {WebGLRenderingContext} gl
// @returns {boolean}
function grafikName(gl) {
  try {
    // Firefox nennt den Chip direkt in RENDERER und warnt vor der alten Erweiterung (wird dort
    // entfernt); Chrome und Safari melden dort nur "WebKit WebGL" und brauchen sie weiterhin.
    const direkt = String(gl.getParameter(gl.RENDERER) || '');
    if (direkt && !/^(WebKit WebGL|Mozilla)$/i.test(direkt)) return direkt;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch (e) { /* manche Browser verschleiern den Wert */ }
  return '';
}

function grafikKlasse(gl) {
  const name = grafikName(gl);
  if (!name) return 'unbekannt';
  // Eigenständige Karten zuerst, ihre Namen enthalten teils den Herstellernamen eines
  // Chipsatzes mit eingebauter Grafik.
  if (/(GeForce|Quadro|Radeon RX|Radeon Pro|Arc\s|Apple M\d)/i.test(name)) return 'eigenständig';
  // Alles andere von Apple ist ein Telefon oder Tablet. Safari meldet dort schlicht "Apple GPU"
  // oder "Apple A17 GPU"; ohne diese Zeile landete ein iPhone in "unbekannt" und damit auf einer
  // Stufe, die erst die Messung zurechtrücken musste.
  if (/Apple/i.test(name)) return 'eingebaut';
  // Erste Zeile: die üblichen Namen aus WebGL.
  // Zweite Zeile: dieselben Chips, wie sie über WebGPU heißen. Dort steht nicht das Modell,
  // sondern die Architektur, also "ARM Valhall" statt "Mali-G78". Ohne diese Schreibweise
  // fällt so ein Telefon auf "unbekannt" - und "unbekannt" startet höher und schaltet
  // Mehrfachabtastung ein, also ausgerechnet die teure Variante.
  // Dritte Zeile: AMD-Grafik in Ryzen-Notebooks, je nach Generation "Vega 8",
  // "Radeon(TM) Graphics" oder "Radeon R5/R7 Graphics". Die eigenständigen Radeon-Karten sind
  // oben schon ausgenommen, hier bleibt nur die eingebaute übrig.
  const eingebaut = /(Intel|UHD|HD Graphics|Iris|Mali|Adreno|PowerVR|VideoCore|llvmpipe|SwiftShader)/i.test(name)
    || /(\bARM\b|Valhall|Bifrost|Midgard|Immortalis|Qualcomm|Samsung|Xclipse)/i.test(name)
    || /(Vega \d|Radeon\(TM\) Graphics|Radeon R[2-7] Graphics)/i.test(name);
  return eingebaut ? 'eingebaut' : 'unbekannt';
}

function pickQuality() {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const vorlage = fine ? QUALITY.desktop : QUALITY.mobile;
  // Kopie: setzeStufe() ändert maxPixelRatio zur Laufzeit. Ohne Kopie würde das die geteilte
  // Vorlage überschreiben und ein erneuter Scan startete auf der zuletzt erreichten Stufe
  // statt wieder oben.
  return { ...vorlage, gtao: vorlage.gtao ? { ...vorlage.gtao } : null };
}

const BRAND = new THREE.Color(0xCC0000);
const SILL_COLOR = 0xe9e5dc;   // Fensterbank: warmes Hellgrau, matt (Laminat-Optik)
const SILL_GRAIN_PER_M = 6;    // Wiederholungen der Struktur-Textur je Meter
const HOVER_COLOR = new THREE.Color(0xFF5252);

// Eigener Overlay-Shader für den OutlinePass. Das Original multipliziert die
// Kantenfarbe mit edgeStrength (HDR-Rot, wird vom Tonemapping rosa) und lässt
// weiche, halbtransparente Ausläufer stehen. Über Geometrie werden die linear
// eingeblendet, über dem transparenten Canvas dagegen vom Browser in Gamma
// nachkomponiert, wodurch die Linie dort deutlich dicker wirkt. Hier: reine
// Kantenfarbe und eine harte Alpha-Schwelle, also überall dieselbe Breite.
const OUTLINE_OVERLAY_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D maskTexture;
  uniform sampler2D edgeTexture1;
  uniform sampler2D edgeTexture2;
  uniform float edgeStrength;
  uniform float edgeGlow;
  void main() {
    vec4 e = texture2D(edgeTexture1, vUv) + texture2D(edgeTexture2, vUv) * edgeGlow;
    float mask = texture2D(maskTexture, vUv).r;             // 0 innerhalb des gewählten Teils
    float a = smoothstep(0.35, 0.65, clamp(edgeStrength * e.a, 0.0, 1.0)) * mask;
    vec3 color = e.rgb / max(e.a, 1e-5);                    // sichtbare/verdeckte Kantenfarbe, unskaliert
    gl_FragColor = vec4(color, a);
  }
`;
// Rotstich nur für das Teil unter dem Zeiger. Die Auswahl bekommt keinen Rotstich,
// dort reicht die dicke Kontur. So sind drei Zustände unterscheidbar:
// gehovert (Rotstich + dünne Kontur), ausgewählt (dicke Kontur), beides (dicke Kontur + Rotstich).
const HOVER_EMISSIVE = 0.35;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const AXES = ['x', 'y', 'z'];
// Weiche Begrenzung auf [lo, hi] (lo < 0 < hi): bis 70 % der Grenze linear, danach
// asymptotische Annäherung, stetig in Wert und Steigung. Ersetzt einen harten Anschlag.
// Winkel in (-PI, PI] normieren (Azimut-Differenzen über den ±180-Grad-Sprung hinweg).
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const softLimit = (v, lo, hi) => {
  const limit = v < 0 ? -lo : hi;
  const a = Math.abs(v);
  const knee = limit * 0.7;
  if (a <= knee) return v;
  const r = limit - knee;
  return Math.sign(v) * (knee + r * Math.tanh((a - knee) / r));
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;   // flacher Spitzenwert (1,57x statt 3x)
// Fortschritt 0..1 innerhalb eines Teilabschnitts [a, b] des Gesamtfortschritts p.
const phase = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

// Das GLB wird nur einmal geladen (Preload beim Seitenaufruf). Schlägt der
// Download fehl, wird der Cache geleert, damit ein erneuter Scan neu lädt.
const modelPromises = new Map();
export function preloadModel(url) {
  if (!modelPromises.has(url)) {
    const p = new GLTFLoader().loadAsync(url);
    modelPromises.set(url, p);
    p.catch(() => { if (modelPromises.get(url) === p) modelPromises.delete(url); });
  }
  return modelPromises.get(url);
}

export class WindowViewer {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {HTMLElement} o.stage      Container, dessen Größe der Canvas füllt
   * @param {(info: object|null) => void} [o.onSelect]
   * @param {(name: string|null) => void} [o.onHover]
   * @param {(a: {x:number,y:number,visible:boolean}) => void} [o.onAnchor]
   * @param {() => void} [o.onContextLost]      WebGL-Sitzung weg: Bild bleibt stehen, bis sie zurück ist
   * @param {() => void} [o.onContextRestored]  Sitzung zurück, Viewer hat sich selbst erholt
   * @param {boolean} [o.debug]  Shader-Diagnose von three einschalten (Konsole); in Produktion aus
   * @param {object} [o.modell]  Modelleintrag aus modelle.js (Standard: Fenster)
   * @param {number|null} [o.startStufe]  Qualitätsstufe eines vorigen Viewers übernehmen, dann
   *   entfällt die Einmessung (Modellwechsel im laufenden Betrieb)
   */
  constructor({ canvas, stage, onSelect = () => {}, onHover = () => {}, onAnchor = () => {}, onContextLost = () => {}, onContextRestored = () => {}, debug = false, modell = MODELLE.fenster, startStufe = null }) {
    this.canvas = canvas;
    this.stage = stage;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onAnchor = onAnchor;
    this.onContextLost = onContextLost;
    this.onContextRestored = onContextRestored;
    this.debug = debug;
    this.modell = modell;
    this.openAngle = THREE.MathUtils.degToRad(modell.fluegel.winkel);
    this.kannKippen = !!modell.fluegel.kippen;
    // Hauptseite des Modells: dort liegen Ruheansicht, Intro und Explosion (Fenster innen,
    // Haustür außen, weil ihre Bauteile größtenteils außen sitzen).
    this.hauptAussen = modell.hauptseite === 'aussen';
    this.startStufeVorgabe = startStufe;
    this.kontextVerloren = false;

    this.parts = new Map();       // name -> Object3D (Kinder von "Fenster")
    this.partFactor = new Map();  // name -> Spreizung 0 (montiert) … 1 (auseinander)
    this.liftFactor = 0;          // gemeinsamer Hub aus der Wand, 0 … 1
    this.selected = null;
    this.hovered = null;
    this.anchorLocal = null;      // Tooltip-Anker im lokalen Raum des gewählten Teils
    this.lastAnchor = { x: NaN, y: NaN, visible: false };

    this.tweens = [];
    this.exploded = false;
    this.sashMode = 'closed';     // Flügel: 'closed' | 'open' (Drehstellung) | 'tilt' (Kippstellung)
    this.openFactor = 0;          // 0 geschlossen … 1 Drehstellung
    this.tiltFactor = 0;          // 0 geschlossen … 1 Kippstellung
    this.handleAngle = 0;         // Griffdrehung in rad, 0 = Griff zeigt nach unten (verriegelt)
    this.hingeAxis = null;        // Punkt auf der Bandachse (lokal zu "Fenster"), Achse senkrecht
    this.hingeSide = -1;          // -1 Bandseite links, +1 rechts
    this.tiltAxis = null;         // Punkt auf der waagerechten Kippachse am Flügelfuß (lokal zu "Fenster")
    this.tiltAngle = 0;           // rad, aus TILT_GAP und Flügelhöhe
    this.handlePivot = null;      // Spindel des Griffs (lokal zu "Fenster"), Drehachse parallel z
    this.handleSign = -1;         // -1: im Uhrzeigersinn vom Raum gesehen (Griff rechts), +1 links
    this.handleReady = false;     // Modell für die Griffdrehung gebaut (Rosette getrennt / Spindel bekannt)
    this.attached = [];           // { obj, host }: Objekte, die zu einem Bauteil gehören, aber nicht mitdrehen (Rosette)
    this.clearance = [];          // { mesh, box }: alle Meshes mit lokaler Box, für die Kollisionsprüfung der Kamera
    this._hits = [];              // Arbeitsliste von clearanceHits(), pro Frame wiederverwendet
    this.stayReady = false;       // Schere mit Ursprung am Drehpunkt und mount sash: Kipp-Kinematik aktiv
    this.stayLength = 0;          // m, Armlänge der Schere vom Drehpunkt bis zum flügelseitigen Ende
    this.stayDir = 1;             // +1: Arm zeigt vom Drehpunkt nach +x, -1 nach -x
    this.openShift = 0.45;        // m, Drehpunkt nach vorn in Drehstellung (aus der Ausladung des Flügels)
    this.explodeShift = 0.7;      // m, dito in der Explosion (Mitte der Baugruppe, aus dem Modell)
    this.explodeMinDist = 0.9;    // m, Mindestabstand in der Explosion: vor den vordersten Teilen
    // Drehpunkt, den der Blickpunkt zuletzt übernommen hat (Arm = gültig; nach Kamerafahrten
    // wird neu aufgesetzt). Wandert der Drehpunkt durch einen Zustandswechsel, folgt ihm nur
    // der Blickpunkt: die Kamera bleibt stehen und dreht sich hin. Folgt er einem fokussierten
    // Teil, fährt die Kamera mit dem Teil mit. Siehe applyPanCoupling.
    this._pivotSeen = new THREE.Vector3();
    this._pivotArmed = false;
    this.focused = null;          // fokussiertes Bauteil: Drehpunkt folgt ihm auch durch Animationen
    this._baseTmp = new THREE.Vector3();
    this._boxTmp = new THREE.Box3();
    this._vTmp2 = new THREE.Vector3();
    this._qTmp = new THREE.Quaternion();
    this._qTmp2 = new THREE.Quaternion();
    this._qTmp3 = new THREE.Quaternion();
    this._qTmp4 = new THREE.Quaternion();
    this._vTmp = new THREE.Vector3();
    this.introPlaying = false;
    this.userInteracted = false;
    this.dragging = false;
    this.pendingHover = null;
    this.downPos = null;
    this.activePointers = new Set();
    this.running = false;
    this.ready = false;
    this.needsRender = true;
    this.width = 1;
    this.height = 1;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    // Home-Blickrichtung der aktuellen Seite (innen oder außen).
    this.homeDir = new THREE.Vector3(-0.42, 0.2, 1).normalize();
    this.insideDir = this.homeDir.clone();
    // Außenansicht: gespiegelt, Kamera vor der Außenwand, gleiche Dreiviertel-Komposition.
    this.outsideDir = new THREE.Vector3(0.42, 0.2, -1).normalize();
    this.outside = false;         // Seite, auf der die Kamera tatsächlich ist (Schranke, Home-Richtung)
    this.outsideRequested = false;// gewünschte Seite (für die Toolbar; wechselt sofort beim Klick)
    this.introDir = new THREE.Vector3(-0.7, 0.34, 1).normalize();
    // Blick fast frontal, leicht von oben: in den Spalt zwischen geöffnetem Flügel und
    // Rahmen, so sind Flügelbeschlag (Griffseite des Flügels) und Schließbleche (Rahmenfalz) sichtbar.
    this.openDir = new THREE.Vector3(0.12, 0.25, 1).normalize();
    // Kippen: von vorn unten nach oben blicken, so ist der geöffnete Spalt an der
    // Flügeloberkante zu sehen (innen wie außen, außen gespiegelt).
    this.tiltDir = new THREE.Vector3(-0.15, -0.25, 1).normalize();
    this.homeTarget = new THREE.Vector3(0, 1.6, 0);
    this.pivot = new THREE.Vector3(0, 1.6, 0);   // aktueller Drehpunkt, wird bei der Explosion animiert
    this.homeDist = 3;
    // Beide Distanzen werden in resize() aus den Boxen berechnet. Der Startwert hier ist
    // Pflicht: bricht resize() ab, weil die Bühne noch keine Größe hat, bliebe explodeDist
    // sonst undefined, und die Kamerafahrt der Explosion rechnete (undefined − d)·s = NaN.
    this.explodeDist = this.homeDist * 1.3;
    // Schwenk gekoppelt an die Drehung: dreht der Nutzer nah am Fenster, wandert der Blickpunkt
    // mit der Kamera zur Seite (xFrame) und folgt ihrer Höhe (yFrameUp, yFrame) — Gewinne in
    // Metern je Radiant gedrehtem Winkel, mal Kopplungsstärke (naehe). Weich begrenzt in Metern
    // (xMax seitlich, yUp nach oben, yDown nach unten): der Blickpunkt darf bis kurz vor die
    // Fensterkante, nicht darüber hinaus. So liegt nah am Fenster der Rahmen im Bild und nicht
    // die Scheibe, eine Ecke erreicht man mit Drehen plus Heben. Der Schwenk wird aus den
    // Winkeländerungen AUFSUMMIERT (applyPanCoupling), er ist keine Funktion des Winkels:
    // Zoomen schwenkt nie, und auf Home-Distanz ist der Blickpunkt die Fenstermitte.
    // Alle sechs Werte werden beim Laden aus der Fenstergeometrie berechnet, die Zahlen hier
    // sind nur Platzhalter. Die Grenzen sind die Fensterkante minus PIVOT_INSET; die Gewinne
    // sind so bemessen, dass der Blickpunkt seine Grenze genau dort erreicht, wo
    // applyNearLimits die Drehung stoppt. Beides hat seine Geschichte: ein fester Wert
    // yUp = 2.2 m (das Dreifache der halben Fensterhöhe) setzte den Blickpunkt ganz
    // herangezoomt 1,4 m über das Fenster, und ein zu hoher Gewinn hatte den Blickpunkt
    // seitlich nach 6 Grad am Anschlag, die restlichen 16 Grad des Bereichs bewegten ihn nicht
    // mehr — beim Ziehen ein Sprung von Ecke zu Ecke.
    this.panCoupling = { xFrame: 1, xMax: 0.5, yFrame: 1, yFrameUp: 1, yUp: 0.6, yDown: 0.6 };
    // Stärke der Kopplung: 1 = aktiv, 0 = aus (Fokus auf ein Bauteil, die Kamera kreist
    // dann exakt um das Teil). Wird in den Kamera-Tweens weich überblendet.
    this.panScale = 1;
    // Läuft gerade die Einmessphase? Dann wird schneller gemessen und sofort umgeschaltet.
    this.kalibrierung = false;
    // Einmal eingemessen? Verhindert einen zweiten Durchlauf bei "Neu scannen".
    this.kalibriert = false;
    // Laufende Messung der Bildzeit für die selbsttätige Qualitätsanpassung (siehe measureFrame,
    // applyPendingQuality und setzeStufe). `stufe` ist der Index in STUFEN, 0 ist die teuerste.
    this.perf = {
      frames: 0, summe: 0, warmup: PERF_WARMUP, stufe: 0, letzte: 0, zuletztGesenkt: 0,
      // Gewünschte Stufe (wird erst in einer Ruhephase angewandt) und kleinster Bildabstand
      // im laufenden Fenster, der als Takt des Bildschirms gilt.
      wunsch: -1, min: 0, schlecht: 0, gut: 0,
      fps: 0, fpsZeit: 0,
    };
    this.wallFaceZ = 0.26;        // Innenwand-Ebene (wird aus dem Modell gelesen), Kamera bleibt davor
    this.wallOuterZ = -0.12;      // Außenwand-Ebene, in der Außenansicht bleibt die Kamera davor
    this.wallHalfX = 1.7;         // halbe Wandbreite, die Fahrt zur anderen Seite geht um diese Kante
    this.floorY = 0;              // Bodenebene (Wandfuß), Kamera bleibt darüber
    this._panWant = new THREE.Vector3();
    this._pivotDelta = new THREE.Vector3();
    // Aufsummierter Schwenk in Metern relativ zum Drehpunkt (x seitlich, y Höhe), unbegrenzt
    // bis SWIVEL_RAW_MAX; wirksam wird softLimit davon. Siehe applyPanCoupling.
    this.swivelRaw = new THREE.Vector3();
    // Pose relativ zum Blickpunkt am Ende des letzten Frames (siehe merkePose): daraus liest
    // applyPanCoupling, wie weit der Nutzer seither gedreht und gezoomt hat.
    this._pose = { theta: 0, phi: 0, dist: 0 };
    this._poseGemerkt = false;
    this._dirTmp = new THREE.Vector3();
    this._dirTmp2 = new THREE.Vector3();
    this.explodeLift = 0.35;      // wird aus Wanddicke + Rahmenlage abgeleitet

    this.tick = this.tick.bind(this);
  }

  // ------------------------------------------------------------------
  async init(url) {
    const { canvas, stage } = this;

    const quality = pickQuality();
    this.quality = quality;
    // Antialiasing kommt vom MSAA-Rendertarget des Composers, nicht vom Canvas.
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    // Leicht unter 1, damit weiße Profile und helle Wand nicht beide im
    // komprimierten Spitzlichtbereich landen und gleich hell wirken.
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;   // Schattenkarte nur neu rendern, wenn sich Teile bewegen
    this.renderer = renderer;
    // Shader-Diagnose (Info-Logs, Fehlermeldungen in der Konsole) nur im Debug-Betrieb: three
    // fragt dafür jedes Programm synchron nach Status und Log, und der HLSL-Übersetzer unter
    // Windows legt Hinweise wie X4122 (Konstantenfaltung) ins Log, die three als Warnung ausgibt.
    renderer.debug.checkShaderErrors = this.debug;

    // Startstufe absenken, wenn die Grafik eingebaut ist. Muss vor dem Aufbau des Composers
    // stehen: die Mehrfachabtastung wird beim Anlegen des Renderziels festgelegt.
    this.gpuName = grafikName(renderer.getContext());
    this.gpuNameGenau = '';
    // Solange die WebGPU-Abfrage läuft, steht noch keine endgültige Angabe fest. Ohne dieses
    // Kennzeichen zeigt die Anzeige erst die WebGL-Angabe und springt Sekundenbruchteile
    // später auf die genauere um, was als Flackern auffällt.
    this.gpuProbeFertig = false;
    this.verfeinereGpuNamen();
    // Was beim Start schon feststeht, wird auch beim Start entschieden. Eine Korrektur mitten
    // im Betrieb legt Renderziele neu an und ist ein Bild lang als Flackern zu sehen; wer eine
    // eigene Karte hat, soll dieses Umschalten gar nicht erst erleben. Liegt die Erkennung
    // daneben, fängt die Messung es über die Leiter wieder ein.
    this.grafikKlasse = grafikKlasse(renderer.getContext());
    this.startStufe = this.startStufeVorgabe ?? START_STUFE[this.grafikKlasse] ?? 1;
    // Übernommene Stufe: nicht noch einmal einmessen. Der Wechsel zwischen den Modellen läuft
    // ohne Scan-Overlay, ein blindes Intro wäre zu sehen.
    if (this.startStufeVorgabe != null) this.kalibriert = true;
    const s = STUFEN[this.startStufe];
    // Die Tabelle bestimmt das Pixelverhältnis allein. Wirksam wird ohnehin nur
    // min(devicePixelRatio, maxPixelRatio), ein Bildschirm ohne hohe Punktdichte bekommt also
    // nie mehr als er hat.
    quality.maxPixelRatio = s.pr;
    quality.gtao.samples = s.aoProben;
    quality.gtao.pdSamples = s.aoProben;
    // Eingebaute Grafik: FXAA statt Mehrfachabtastung. Ein einzelner Bildschirmdurchgang statt
    // vierfacher Abtastung je Pixel, das ist dort ein Vielfaches billiger.
    this.startFxaa = this.grafikKlasse === 'eingebaut';
    if (this.startFxaa) quality.msaa = 0;
    this.gtaoWenigerProben = s.aoProben <= 8;
    this.perf.stufe = this.startStufe;

    const scene = new THREE.Scene();
    this.scene = scene;

    // Umgebungslicht: nötig, damit der metallische Griff nicht schwarz bleibt.
    this.erneuereUmgebung();
    // Neutral und hell, aber unterhalb der Sättigung: sonst werden weiße Profile
    // und helle Wand vom Tonemapping auf dieselbe Helligkeit gedrückt.
    scene.environmentIntensity = 0.7;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    this.camera = camera;

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = ROTATE_SPEED;
    controls.zoomSpeed = 0.8;
    // Neigung nach oben und nach unten gleich weit: Die Kopplung verschiebt Kamera und Blickpunkt
    // immer gemeinsam und kann den Blickwinkel deshalb nicht beeinflussen; wie steil man auf das
    // Fenster schaut, hängt allein an diesen beiden Grenzen. Ungleiche Grenzen fielen sofort auf
    // (von oben schaute man deutlich steiler herab als von unten hinauf). Die Boden-Schranke in
    // applyBoundsConstraint() verhindert zusätzlich, dass die Kamera bei tiefer Lage unter den
    // Boden gerät.
    controls.minPolarAngle = Math.PI - POLAR_TILT;
    controls.maxPolarAngle = POLAR_TILT;
    // Keine feste seitliche Winkelgrenze: dass die Kamera nicht in die Wand gerät, regelt
    // allein applyBoundsConstraint(). So darf man in der Explosion (Drehpunkt vor der Wand)
    // deutlich weiter zur Seite als im eingebauten Zustand.
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.addEventListener('start', () => {
      this.dragging = true;
      this.userInteracted = true;
      stage.classList.add('is-dragging');
      this.setHovered(null);
    });
    controls.addEventListener('end', () => {
      this.dragging = false;
      stage.classList.remove('is-dragging');
    });
    // Mausrad/Pinch: OrbitControls bewegt die Kamera direkt im Event-Handler
    // (eigener update()-Aufruf). Der Tick sieht dann keine Änderung mehr,
    // deshalb hier explizit einen Frame anfordern.
    controls.addEventListener('change', () => { this.needsRender = true; });
    this.controls = controls;

    // Post-Processing: RenderPass -> OutlinePass (Hover, dünn) -> OutlinePass (Auswahl, dick)
    // -> OutputPass (Tonemapping/sRGB). Ein OutlinePass ohne Objekte kostet nichts.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality.msaa });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));

    // Ambient Occlusion (GTAO): Kontaktschatten in den Laibungsecken und dort, wo
    // Rahmen auf Wand oder Fensterbank trifft. Genau das trennt Weiß von Weiß.
    // Auf Handys in reduzierter Auflösung und mit weniger Samples (siehe QUALITY).
    if (quality.gtao) {
      const q = quality.gtao;
      const gtao = new GTAOPass(scene, camera, 1, 1);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.85;
      // thickness = maximaler Tiefenabstand (m), bis zu dem eine Fläche eine andere
      // verschatten darf. Klein halten, sonst wirft z. B. der explodierte Flügel
      // einen AO-Halo auf Wand oder Himmel einen Meter dahinter.
      gtao.updateGtaoMaterial({
        radius: 0.22, distanceExponent: 1, thickness: 0.3, scale: 1,
        samples: q.samples, distanceFallOff: 1, screenSpaceRadius: false,
      });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: q.pdSamples });
      // Immer in voller Auflösung. In halber Auflösung wird das Rauschen der Verdeckung
      // mit hochskaliert und das Bild sichtbar körnig; billiger wird sie deshalb nur über
      // die Zahl der Abtastungen (siehe STUFEN und setzeStufe), nie über die Auflösung.
      composer.addPass(gtao);
      this.gtao = gtao;
      // Bereits gesenkt, wenn die Startstufe wegen eingebauter Grafik reduziert wurde.
      this.gtaoWenigerProben = q.samples <= 8;
    }

    const hoverOutline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    // Kantenerkennung in voller Auflösung. Der Vorgabewert von three ist 2, dann laeuft sie
    // auf einem Viertel der Pixel und wird hochskaliert: der Rand ist dadurch sichtbar
    // getreppt, unabhaengig von Pixelverhaeltnis und MSAA, weil die Treppe erst nach dem
    // Glätten entsteht.
    // Auf Touch-Geräten in halber Auflösung: die Kantenerkennung ist ein eigener Durchgang je
    // Kontur, und auf einem Telefon zählt jeder gesparte Bildschirmdurchgang. Die feine Kante
    // war eine Anforderung vom großen Bildschirm; auf einem Telefon sieht man den Unterschied
    // bei dieser Punktdichte ohnehin kaum.
    const konturFein = !window.matchMedia('(pointer: coarse)').matches;
    hoverOutline.downSampleRatio = konturFein ? 1 : 2;
    hoverOutline.edgeStrength = 9;
    hoverOutline.edgeGlow = 0;
    hoverOutline.edgeThickness = 1;
    hoverOutline.pulsePeriod = 0;
    hoverOutline.visibleEdgeColor.copy(HOVER_COLOR);
    hoverOutline.hiddenEdgeColor.set(0xB03A3A);
    hoverOutline.overlayMaterial.blending = THREE.NormalBlending;
    hoverOutline.overlayMaterial.fragmentShader = OUTLINE_OVERLAY_FRAG;
    hoverOutline.overlayMaterial.needsUpdate = true;
    composer.addPass(hoverOutline);
    this.hoverOutline = hoverOutline;

    const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    outline.downSampleRatio = konturFein ? 1 : 2;   // siehe hoverOutline
    // edgeStrength steuert mit dem eigenen Shader die Breite der deckenden Kante,
    // edgeThickness (Blur-Radius) wird in resize() an den Pixelratio angepasst.
    outline.edgeStrength = 14;
    outline.edgeGlow = 0;
    outline.edgeThickness = 2;
    outline.pulsePeriod = 0;
    outline.visibleEdgeColor.copy(BRAND);
    outline.hiddenEdgeColor.set(0x8A0000);
    // Standard ist additives Blending (auf Weiß unsichtbar) mit weichem Rand:
    // deckend zeichnen und eigenen Overlay-Shader mit harter Kante verwenden.
    outline.overlayMaterial.blending = THREE.NormalBlending;
    outline.overlayMaterial.fragmentShader = OUTLINE_OVERLAY_FRAG;
    outline.overlayMaterial.needsUpdate = true;
    composer.addPass(outline);
    composer.addPass(new OutputPass());

    // Ersatz-Kantenglättung für schwache Grafik. Läuft NACH dem OutputPass, also auf dem
    // fertigen Bild in sRGB; im HDR-Puffer davor würde die Kantenerkennung auf ungetonten
    // Werten arbeiten und Kanten verfehlen. Kostet einen Bildschirmdurchgang statt der
    // vierfachen Abtastung je Pixel und ist damit ein Vielfaches billiger als MSAA.
    // Standardmäßig aus: solange MSAA läuft, wäre es doppelt geglättet und unnötig weich.
    const fxaa = new ShaderPass(FXAAShader);
    fxaa.enabled = false;   // wird in resize() aus der aktuellen Stufe gesetzt
    composer.addPass(fxaa);
    this.fxaa = fxaa;
    this.composer = composer;
    this.outline = outline;

    // Modell
    const gltf = await preloadModel(url);
    // Das geladene GLB ist ein geteilter Zwischenspeicher (preloadModel): jeder Viewer arbeitet
    // auf einer eigenen Kopie des Szenengraphen. Sonst stünden beim nächsten Viewer desselben
    // Modells die Teile schon in der letzten Pose, die Millimeterversätze wären doppelt und die
    // zerlegte Wand läge zweimal in der Szene. Geometrien und Materialien teilt
    // die Kopie; was verändert wird (Wandfarbe, Kunststoff, Glas, Fensterbank), wird vorher geklont.
    const root = gltf.scene.clone(true);
    const modell = this.modell;
    const baugruppe = root.getObjectByName(modell.root);
    if (!baugruppe) throw new Error(`Node "${modell.root}" wurde im Modell nicht gefunden.`);
    this.root = root;
    this.baugruppe = baugruppe;

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Wand nur einen Hauch unter Reinweiß; die Trennung zu den Profilen leistet die AO.
        if (o.material && /^Wand/.test(o.material.name)) {
          o.material = o.material.clone();   // geteiltes Material des Zwischenspeichers nicht abdunkeln
          o.material.color.multiplyScalar(0.96);
        }
      }
    });
    // Fensterbank als eigenes Dekor: matt, einen Hauch wärmer und dunkler als das PVC und mit
    // feiner Struktur, sonst verschmilzt sie von unten mit dem Blendrahmen (Weiß auf Weiß).
    const sillNode = modell.fensterbank ? root.getObjectByName(modell.fensterbank) : null;
    if (sillNode) {
      sillNode.traverse((o) => {
        if (!o.isMesh) return;
        o.material = makeSillMaterial(o.material);
        planarUVs(o, SILL_GRAIN_PER_M);
      });
    }
    for (const child of baugruppe.children) {
      const nudge = modell.buendig[child.name];
      if (nudge) child.position.add(new THREE.Vector3(...nudge));
      child.userData.basePosition = child.position.clone();
      child.userData.baseQuaternion = child.quaternion.clone();   // im Modell gesetzte Drehung bleibt erhalten
      // Eigene Material-Instanz je Bauteil, damit Hover/Auswahl nicht auf geteilte Materialien wirkt.
      child.traverse((o) => { if (o.isMesh) o.material = upgradePlastic(o.material.clone()); });
      if (child.name === modell.griff.rosette) {
        // Feste Rosette des Griffs: gehört für Hover, Auswahl und Explosion zum Griff,
        // bewegt sich mit dem Flügel, dreht aber nicht mit der Griffstange.
        child.userData.hover = false;
        this.attached.push({ obj: child, host: modell.griff.name });
        continue;
      }
      this.parts.set(child.name, child);
      this.partFactor.set(child.name, 0);
    }
    const glas = this.parts.get('Glas');
    if (glas) {
      glas.traverse((o) => {
        if (!o.isMesh) return;
        o.material = makeGlassMaterial();
        o.castShadow = false;   // Glas wirft keinen (deckenden) Schatten, das Sonnenlicht fällt hindurch
      });
    }
    scene.add(root);

    // Maße aus dem Modell ableiten (Fenster + Wand), nicht hart kodieren. Die Fenster-Box
    // umfasst nur die Baugruppe, kein Zubehör am Bau (modell.statisch).
    // expandByObject rechnet die Weltmatrix nur des Teils selbst neu, die des Elternknotens
    // "Fenster" (steht 1,6 m hoch) muss vorher stimmen.
    baugruppe.updateWorldMatrix(true, false);
    this.box = new THREE.Box3();
    for (const [name, obj] of this.parts) if (!modell.statisch.has(name)) this.box.expandByObject(obj);
    for (const { obj } of this.attached) this.box.expandByObject(obj);
    this.box.getCenter(this.homeTarget);
    this.pivot.copy(this.homeTarget);
    const size = this.box.getSize(new THREE.Vector3());
    const wand = root.getObjectByName(modell.wand);
    const wandBox = new THREE.Box3().setFromObject(wand || root);
    const wandSize = wandBox.getSize(new THREE.Vector3());
    this.wallFaceZ = wandBox.max.z;
    this.wallOuterZ = wandBox.min.z;
    this.wallHalfX = wandSize.x / 2;
    this.floorY = wandBox.min.y;
    // So weit zur Hauptseite, dass der Blendrahmen in der Explosion komplett vor der Wandfläche
    // liegt: innen in den Raum (+z), außen vor die Fassade (-z).
    // `modell.hub` setzt den Weg fest (Tür: deutlich vor die Fassade, damit auch die nach innen
    // explodierenden Teile frei vor der Wand stehen).
    const hub = modell.hub ?? (this.hauptAussen
      ? Math.max(0.2, this.box.max.z - wandBox.min.z + 0.06)
      : Math.max(0.2, wandBox.max.z - this.box.min.z + 0.06));
    this.explodeLift = this.hauptAussen ? -hub : hub;
    // Explosionsversatz je Teil: Tabelle, sonst aus `mount` und Lage abgeleitet.
    const winCenter = this.box.getCenter(new THREE.Vector3());
    for (const [name, obj] of this.parts) {
      const pb = new THREE.Box3().setFromObject(obj);
      const c = pb.getCenter(new THREE.Vector3()).sub(winCenter);
      obj.userData.partBox = pb;
      let hardware = false;
      obj.traverse((o) => { if (o.isMesh && o.material && modell.hardwareMaterialien.includes(o.material.name)) hardware = true; });
      // Tabellenwerte gelten lokal (z: + in den Raum). Nur die Vorgaben je `mount` sind für ein
      // Modell mit Hauptseite innen gedacht; außen zeigt ihr +z zur Kamera, also nach -z.
      const tabelle = modell.versatz[name];
      const vorgabe = tabelle ? null : mountOffset(obj.userData.mount, c, hardware);
      obj.userData.explodeOffset = tabelle || (this.hauptAussen ? [vorgabe[0], vorgabe[1], -vorgabe[2]] : vorgabe);
      obj.userData.introDelay = modell.introVerzoegerung[name] ?? MOUNT_INTRO_DELAY[obj.userData.mount] ?? 0;
    }
    for (const { obj, host } of this.attached) {
      const h = this.parts.get(host);
      obj.userData.mount = h ? h.userData.mount : 'sash';
      obj.userData.explodeOffset = h ? h.userData.explodeOffset : [0, 0, 0];
    }
    // Bandachse: senkrecht durch die gemeinsame Mitte aller Bandteile (Band_oben*, Band_unten*,
    // rahmen- und flügelseitige Hälften), lokal zu "Fenster". Trägt ein Bandteil die Custom
    // Property `pivot` [x, y, z], gilt stattdessen der Mittelwert dieser Angaben.
    const bands = [...this.parts.values()].filter((o) => modell.bandMuster.test(o.name));
    if (bands.length) {
      const pivots = bands.map((o) => o.userData.pivot).filter((p) => Array.isArray(p) && p.length === 3);
      let bc;
      if (pivots.length) {
        bc = pivots.reduce((acc, p) => acc.add(new THREE.Vector3(p[0], p[1], p[2])), new THREE.Vector3()).divideScalar(pivots.length);
      } else {
        const bb = new THREE.Box3();
        for (const b of bands) bb.union(b.userData.partBox);
        bc = bb.getCenter(new THREE.Vector3());
        baugruppe.updateWorldMatrix(true, false);
        baugruppe.worldToLocal(bc);
      }
      this.hingeAxis = new THREE.Vector3(bc.x, 0, bc.z);
      this.hingeSide = bc.x < 0 ? -1 : 1;
    }
    // Kippachse: waagerecht am Flügelfuß, in der Ebene der Bandachse. Kippwinkel aus dem
    // Spaltmaß oben und der Flügelhöhe. Drehpunkt-Verschiebung beim Öffnen: 80 % der
    // Ausladung der freien Kante, so liegt der Beschlag der Griffseite (Treibstange,
    // Getriebe) nah am Drehpunkt und bleibt beim Heranzoomen im Bild.
    const sash = this.parts.get(modell.fluegel.name);
    if (sash && this.hingeAxis) {
      const sb = sash.userData.partBox;
      if (this.kannKippen) {
        const foot = baugruppe.worldToLocal(new THREE.Vector3(0, sb.min.y + 0.015, 0));
        this.tiltAxis = new THREE.Vector3(0, foot.y, this.hingeAxis.z);
        this.tiltAngle = Math.asin(clamp(TILT_GAP / (sb.max.y - sb.min.y), 0, 1));
      }
      this.openShift = Math.sin(this.openAngle) * (sb.max.x - sb.min.x) * 0.8;
    }
    // Griffdrehung nur, wenn das Modell dafür gebaut ist: eigene Rosette (Griff_Rosette) oder
    // eine Spindel-Angabe (Custom Property `pivot` bzw. Objektursprung auf der Spindel). Sonst
    // bleibt der Griff in Grundstellung, statt ein ungeteiltes Mesh samt Rosette zu verdrehen.
    const handle = this.parts.get(modell.griff.name);
    if (handle) {
      const hasRosette = this.attached.some((a) => a.host === modell.griff.name);
      const p = handle.userData.pivot;
      this.handleReady = hasRosette || (Array.isArray(p) && p.length === 3) || handle.position.lengthSq() > 1e-8;
      if (this.handleReady) {
        this.handlePivot = deriveHandlePivot(handle, baugruppe);
        // Drehsinn: aus dem Modelleintrag, sonst aus der Griffseite (Griff rechts dreht im
        // Uhrzeigersinn vom Raum aus gesehen).
        this.handleSign = modell.griff.richtung ?? (this.handlePivot.x > 0 ? -1 : 1);
      }
    }
    // Ausstellschere: mit Ursprung am rahmenseitigen Drehpunkt (Scherenlager) und mount sash
    // schwenkt der Arm beim Kippen waagerecht so weit aus, dass sein flügelseitiges Ende der
    // Flügeloberkante folgt (starrer Arm, Ende gleitet entlang des Flügels).
    const stay = modell.schere ? this.parts.get(modell.schere) : null;
    if (stay) {
      this.stayReady = stay.position.lengthSq() > 1e-8 && stay.userData.mount === 'sash';
      if (this.stayReady) {
        const gb = new THREE.Box3();
        stay.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); gb.union(o.geometry.boundingBox); } });
        this.stayDir = Math.abs(gb.max.x) >= Math.abs(gb.min.x) ? 1 : -1;
        this.stayLength = Math.max(Math.abs(gb.max.x), Math.abs(gb.min.x));
      }
    }
    // Bounding-Box der Explosionsansicht (alle Teile an ihrer Endposition), für das
    // Kamera-Framing. Ihr Zentrum ist in der Explosion auch der Drehpunkt der Kamera.
    this.explodedBox = this.box.clone();
    for (const [name, obj] of this.parts) {
      if (modell.statisch.has(name)) continue;
      const off = obj.userData.explodeOffset;
      const pb = obj.userData.partBox.clone();
      pb.translate(new THREE.Vector3(off[0], off[1], off[2] + this.explodeLift));
      this.explodedBox.union(pb);
    }
    this.explodedCenter = this.explodedBox.getCenter(new THREE.Vector3());
    // Drehpunkt der Explosion: Fenstermitte, nur in z auf die Mitte der Baugruppe gesetzt
    // (kein seitlicher Versatz, die Kamera fährt beim Ausfahren gerade nach hinten).
    this.explodeShift = this.explodedCenter.z - this.homeTarget.z;
    // Mindestabstand in der Explosion: bis vor die vordersten Teile, plus Reserve, damit die
    // Kamera beim Kreisen um die Baugruppe nie in ein Teil gerät.
    this.explosionsMasse();
    // Grenzen des Blickpunkt-Schwenks aus der Fenstergröße: der Blickpunkt darf bis auf die
    // Kante wandern, nicht darüber hinaus. Sonst zielt die Kamera neben die Öffnung und sieht
    // nur noch Wand. Wie schnell die Grenze erreicht wird, regeln xFrame und yFrame*.
    const pc = this.panCoupling;
    pc.xMax = Math.max(0.1, this.box.max.x - this.homeTarget.x - PIVOT_INSET);
    pc.yUp = Math.max(0.1, this.box.max.y - this.homeTarget.y - PIVOT_INSET);
    pc.yDown = Math.max(0.1, this.homeTarget.y - this.box.min.y - PIVOT_INSET);
    // Kopplungsgewinne aus derselben Geometrie: am Mindestabstand stoppt applyNearLimits die
    // Drehung, sobald die Kamera OPENING_MARGIN über die Öffnungskante hinaus steht; der
    // Blickpunkt darf bis PIVOT_INSET vor die Kante. Der Winkel dazwischen ist
    // asin((Rand + Einzug) / MIN_DIST). Bis dahin soll der Blickpunkt 95 % seiner Grenze
    // erreicht haben: softLimit ist bis 70 % linear und geht dann in tanh über, 95 % liegen
    // bei einem Rohwert von 1,06 × Grenze. Höher wäre ein toter Restbereich, niedriger käme
    // der Blickpunkt nie bis zur Ecke.
    const stopX = Math.max(0.05, Math.asin(clamp((OPENING_MARGIN_X + PIVOT_INSET) / MIN_DIST, 0, 1)));
    const stopY = Math.max(0.05, Math.asin(clamp((OPENING_MARGIN_Y + PIVOT_INSET) / MIN_DIST, 0, 1)));
    pc.xFrame = 1.06 * pc.xMax / stopX;
    pc.yFrameUp = 1.06 * pc.yUp / stopY;
    pc.yFrame = 1.06 * pc.yDown / stopY;

    // Kollisionsprüfung der Kamera: je Mesh die lokale Box. Geprüft wird später im lokalen
    // Raum des Meshs, also gegen die mitgedrehte Box — die Welt-Hülle eines geöffneten Flügels
    // wäre ein Keil, der zur Hälfte aus Luft besteht.
    this.clearance.length = 0;
    const sammle = (o) => o.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      this.clearance.push({ mesh: m, box: m.geometry.boundingBox });
    });
    for (const o of this.parts.values()) sammle(o);
    for (const { obj } of this.attached) sammle(obj);

    // Draußen: weicher Himmel als Fläche hinter der Außenwand, nur durch das Fenster sichtbar —
    // die Maske in makeSkyBackdrop zeichnet ihn allein dort, wo der Sehstrahl die Öffnung
    // durchquert, nie neben oder über der Wandscheibe, und von außen gar nicht. Bewusst
    // außerhalb der Wanddicke: Läge er in der Laibung, sähe die (ihn ausblendende) Ambient
    // Occlusion dahinter die Laibungsflächen und würde den Himmel an den Öffnungskanten
    // abdunkeln. Und hinter ALLEM, was nach außen ragt: die Außenfensterbank steht 4,5 cm
    // weiter draußen als die Wand, stand die Fläche dazwischen, war die Bank abgeschnitten.
    // Die Fläche darf beliebig groß sein (die Maske begrenzt sie), muss aber groß genug sein,
    // dass jeder Blick durch die Öffnung sie trifft — bei größerer Tiefe also breiter. Der
    // Farbverlauf bleibt an der Wandhöhe verankert, egal wie hoch die Fläche wird.
    let aussenMinZ = wandBox.min.z;
    for (const o of this.parts.values()) aussenMinZ = Math.min(aussenMinZ, o.userData.partBox.min.z);
    const sill = modell.fensterbank ? root.getObjectByName(modell.fensterbank) : null;
    if (sill) aussenMinZ = Math.min(aussenMinZ, new THREE.Box3().setFromObject(sill).min.z);
    const skyZ = aussenMinZ - 0.02;
    const reach = (this.wallFaceZ - skyZ) * 2.3;   // seitlicher Blickversatz bei max. Azimut (rund 66 Grad)
    const skyW = size.x + 2 * reach;
    const skyTop = Math.max(wandBox.max.y - 0.02, this.box.max.y + reach * 0.5);
    const skyBottom = Math.min(wandBox.min.y + 0.02, this.box.min.y - reach * 0.5);
    const skyCenter = new THREE.Vector3(this.homeTarget.x, (skyTop + skyBottom) / 2, 0);
    // Öffnungsrechteck in der Innenwand-Ebene: der Himmel wird nur dort gezeichnet, wo
    // der Sehstrahl durch die Öffnung geht (siehe makeSkyBackdrop), nie über die
    // Wandoberkante oder seitlich an der Wandscheibe vorbei.
    const opening = {
      min: new THREE.Vector2(this.box.min.x - 0.01, this.box.min.y - 0.01),
      max: new THREE.Vector2(this.box.max.x + 0.01, this.box.max.y + 0.01),
      faceZ: this.wallFaceZ,
    };
    // Knapp hinter Außenwand und äußerer Fensterbank, damit die Bank nicht in der Fläche steckt.
    const sky = makeSkyBackdrop(skyCenter, new THREE.Vector3(skyW, skyTop - skyBottom, 0), skyZ, opening,
      { bottom: wandBox.min.y, top: wandBox.max.y });
    scene.add(sky);
    // Maß der Wandöffnung aus der Wandgeometrie (Laibungskanten), nicht aus dem Fenster:
    // der Rahmen steckt ein paar Millimeter in der Laibung.
    const openingRect = deriveOpening(wand || root, this.box);
    // Laibungen sowie Stirn-, Ober- und Unterseite der Wandscheibe als eigene Meshes mit neu
    // projizierten Texturkoordinaten: im Modell ist der Putz auf diesen schmalen Flächen stark
    // gedehnt (Streifen). Die Schnittflächen der Scheibe bekommen den Außenputz, so wirkt sie von
    // außen wie ein verputzter Block. Beleuchtet und verschattet werden sie wie die Wand selbst.
    if (wand) {
      const inRect = (cx, cy) => cx > openingRect.min.x - 0.01 && cx < openingRect.max.x + 0.01 && cy > openingRect.min.y - 0.01 && cy < openingRect.max.y + 0.01;
      const meshes = [];
      wand.traverse((o) => { if (o.isMesh && o.material) meshes.push(o); });
      const density = new Map(meshes.map((m) => [m, textureDensity(m)]));
      const outerMesh = meshes.find((m) => m.material.name === 'Wand_aussen');
      for (const m of meshes) {
        const reveal = splitFaces(m, (cx, cy, n) => Math.abs(n.z) < 0.5 && inRect(cx, cy));
        if (reveal) {
          m.parent.add(reveal);
          planarUVs(reveal, density.get(m));
        }
        const slab = splitFaces(m, (cx, cy, n) => Math.abs(n.z) < 0.5 && !inRect(cx, cy));
        if (slab) {
          const src = outerMesh || m;
          slab.name = `${m.name}_Stirn`;
          slab.material = src.material;
          m.parent.add(slab);
          planarUVs(slab, density.get(src));
        }
      }
    }
    // Der Himmel ist "unendlich weit weg" und bekommt keine Kontaktschatten: aus der
    // Ambient Occlusion heraushalten.
    if (this.gtao) {
      const aoHidden = [sky];
      this.aoHidden = aoHidden;
      const gtaoRender = this.gtao.render.bind(this.gtao);
      this.gtao.render = (...args) => {
        for (const o of aoHidden) o.visible = false;
        try { gtaoRender(...args); } finally { for (const o of aoHidden) o.visible = true; }
      };
    }

    // Licht: neutrales, helles Tageslicht mit EINER Sonne. Sie steht draußen, tief und seitlich
    // (ca. 20 Grad hoch, von links vorn): durch die Scheibe trifft ihr Licht die rechte Laibung
    // und die Innenkante der Fensterbank, außen die Fassade schräg und die sonnenseitige Laibung
    // voll, Blendrahmen und Flügel liegen links und oben im Schatten der Laibung. Alle Schatten
    // kommen aus der echten Geometrie und innen wie außen aus derselben Richtung; es gibt keine
    // Masken oder Blenden, die umschalten müssten.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdadada, 0.4));
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.6);
    sun.position.copy(this.homeTarget).add(new THREE.Vector3(-4.5, 2.2, -3.0));
    sun.target.position.copy(this.homeTarget);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const ext = Math.max(wandSize.x, wandSize.y, size.x, size.y) * 0.6 + 0.5;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 16 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    this.sun = sun;
    // Fülllicht von der Raumseite (ohne Schatten), damit die Innenwand hell bleibt.
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.copy(this.homeTarget).add(new THREE.Vector3(2.5, 2.5, 4.5));
    fill.target.position.copy(this.homeTarget);
    scene.add(fill, fill.target);
    renderer.shadowMap.needsUpdate = true;

    controls.target.copy(this.homeTarget);
    controls.minDistance = MIN_DIST;

    this.abort = new AbortController();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    window.addEventListener('resize', () => this.resize(), { signal: this.abort.signal });
    // WebGL-Kontextverlust: der Browser kündigt die GPU-Sitzung jederzeit einseitig (Tab im
    // Hintergrund am Handy, Speicherdruck, Treiber-Reset). Ohne Behandlung bleibt der Canvas
    // danach schwarz, während die Oberfläche weiterläuft. preventDefault meldet, dass wir die
    // Sitzung zurückhaben wollen; three registriert seinen eigenen Handler vor diesem und hat
    // beim Wiederherstellen den Renderer schon neu aufgesetzt, wir ergänzen nur, was er nicht
    // kennt (erholeKontext).
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.kontextVerloren = true;
      this.pause();
      this.onContextLost();
    }, { signal: this.abort.signal });
    canvas.addEventListener('webglcontextrestored', () => {
      this.kontextVerloren = false;
      this.erholeKontext();
      this.onContextRestored();
    }, { signal: this.abort.signal });
    this.resize(true);

    this.bindPointer();

    // Shader vorkompilieren, damit der erste sichtbare Frame nicht ruckelt. Der Composer rendert
    // in ein Rendertarget, also gegen dieses kompilieren. compileAsync holt sich die Erweiterung
    // über extensions.get(), das ohne sie eine Warnung ausgibt (Firefox); has() ist still, darum
    // vorher prüfen und ohne Erweiterung synchron kompilieren.
    try {
      renderer.setRenderTarget(composer.renderTarget1);
      if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch (_) {
      /* Fallback: normaler Render kompiliert synchron */
    } finally {
      renderer.setRenderTarget(null);
    }
    const griff = this.parts.get(modell.griff.name);
    outline.selectedObjects = griff ? [griff] : [];
    hoverOutline.selectedObjects = griff ? [griff] : [];
    composer.render();
    outline.selectedObjects = [];
    hoverOutline.selectedObjects = [];

    this.prepareIntro();
    composer.render();
    this.ready = true;
    return this;
  }

  // Nach webglcontextrestored. Geometrie, Texturen und Programme lädt three beim nächsten Bild
  // selbst nach, die Renderziele der Pässe legt es beim nächsten Durchgang neu an. Was fehlt,
  // ist alles, was wir auf der GPU BERECHNET hatten: die Umgebungsbeleuchtung (PMREM aus dem
  // RoomEnvironment) und die Schattenkarte, die nur auf Anforderung gerendert wird.
  erholeKontext() {
    if (!this.renderer || !this.scene) return;
    this.erneuereUmgebung();
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
    this.start();
  }

  // Umgebungsbeleuchtung (PMREM aus dem RoomEnvironment) berechnen: beim Aufbau in init und
  // nach Kontextverlust, weil die alte Textur mit der GPU-Sitzung verloren ist.
  erneuereUmgebung() {
    // three's PMREMGGXConvolution-Shader legt unter Windows (ANGLE, HLSL-Übersetzer) einen
    // Hinweis zur Konstantenfaltung (X4122) ins Programm-Log, den three bei eingeschalteter
    // Diagnose als Warnung ausgibt. Für diesen fremden Shader die Diagnose kurz aus; unsere
    // Materialien bleiben geprüft.
    const diagnose = this.renderer.debug.checkShaderErrors;
    this.renderer.debug.checkShaderErrors = false;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const alt = this.scene.environment;
    try {
      this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    } finally {
      this.renderer.debug.checkShaderErrors = diagnose;
      room.dispose();
      pmrem.dispose();
    }
    if (alt) alt.dispose();
  }

  dispose() {
    this.pause();
    this.tweens.length = 0;
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.abort) this.abort.abort();
    if (this.controls) this.controls.dispose();
    if (this.outline) this.outline.dispose();
    if (this.hoverOutline) this.hoverOutline.dispose();
    if (this.gtao) this.gtao.dispose();
    if (this.composer) this.composer.dispose();
    if (this.scene && this.scene.environment) this.scene.environment.dispose();
    if (this.renderer) this.renderer.dispose();
    this.ready = false;
  }

  // ------------------------------------------------------------------
  resize(force = false) {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    if (pr !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
      force = true;
    }
    // Konturbreite in CSS-Pixeln konstant halten (OutlinePass rechnet in Gerätepixeln).
    // Die Faktoren gelten für downSampleRatio 1: der Kantenpuffer hat dann die volle
    // Auflösung, und edgeThickness wirkt in Pufferpixeln, also doppelt so fein wie bei der
    // Vorgabe 2. Gemessen ergibt 1.6 * pr genau 2 CSS-Pixel breite Kontur.
    // Bei halbierter Kantenauflösung wirkt derselbe Wert doppelt so breit, deshalb halbieren.
    const kf = this.outline.downSampleRatio === 1 ? 1 : 0.5;
    this.outline.edgeThickness = 1.6 * pr * kf;
    this.hoverOutline.edgeThickness = 0.9 * pr * kf;
    // FXAA rechnet in Gerätepixeln und braucht die Kantenlänge eines Pixels.
    if (this.fxaa) {
      this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      // Läuft auf eingebauter Grafik immer. Hier stand einmal "pr < 2" mit der Begründung, bei
      // doppelter Rechenauflösung glätte das Herunterrechnen schon selbst; nachgemessen stimmt
      // das nicht. Danach war es eine Sprosse der Leiter; auch das war falsch, denn der
      // Durchgang ist billig und sein Wegfall gut sichtbar.
      this.fxaa.enabled = !!this.startFxaa;
    }
    if (!force && w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.homeDist = this.computeHomeDistance();
    // Explosion: Box darf das Bild fast füllen, die äußersten Ecken sind nur Rahmenenden.
    this.explosionsMasse();
    if (!this.userInteracted && !this.hasTween('camera')) this.placeAtStandardPose();
    this.needsRender = true;
  }

  // Distanz, die zur aktuellen Ansicht passt (montiert oder explodiert).
  currentFitDistance() {
    return this.exploded ? this.explodeDist : this.homeDist;
  }

  // Ruhepose (Blickrichtung, Distanz) des aktuellen Zustands: Home, Explosion, Dreh- oder
  // Kippstellung, jeweils für die aktuelle Seite. Endpose der Kamerafahrten und Bezug für
  // resize(), damit ein Resize nie in eine andere Ansicht springt. `dir` ist ein Arbeitsvektor.
  standardPose() {
    if (this.exploded) return { dir: this.homeDir, dist: this.explodeDist };
    if (this.sashMode === 'open') return { dir: this.sideDir(this.openDir), dist: this.homeDist * 1.15 };
    // Kippen: etwas weiter weg, weil der Blick von unten die Flügeloberkante samt Spalt zeigen soll.
    if (this.sashMode === 'tilt') return { dir: this.sideDir(this.tiltDir), dist: this.homeDist * 1.15 };
    return { dir: this.homeDir, dist: this.homeDist };
  }

  // Kamera ohne Fahrt auf die Ruhepose setzen (Startansicht, Resize, Seitenwechsel), ohne
  // Schwenk (Rohwert genullt), damit der nächste Tick nichts nachschiebt.
  placeAtStandardPose() {
    const pose = this.standardPose();
    this.swivelRaw.set(0, 0, 0);
    this._poseGemerkt = false;   // gesetzte Pose ist keine Nutzereingabe
    const target = this.baseTarget();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(pose.dir, pose.dist);
    this.camera.lookAt(target);
    this.applyNearLimits(this.nahWert());
    this.controls.update();
  }

  computeHomeDistance() {
    return this.computeFitDistance(this.box);
  }

  // Kameradistanz so wählen, dass eine Bounding-Box (montiert oder explodiert, inkl.
  // Griff) aus der Home-Blickrichtung mit Rand ins Bild passt. Die Ecken werden real
  // projiziert, damit Hochformat und schräge Blickrichtung korrekt berücksichtigt sind.
  computeFitDistance(box, fill = null, dir = this.homeDir) {
    const cam = this._fitCamera || (this._fitCamera = new THREE.PerspectiveCamera());
    cam.fov = this.camera.fov;
    cam.aspect = this.camera.aspect || 1;
    cam.near = this.camera.near;
    cam.far = this.camera.far;
    cam.updateProjectionMatrix();

    const size = box.getSize(new THREE.Vector3());
    const halfFov = THREE.MathUtils.degToRad(cam.fov) / 2;
    let dist = Math.max(size.y / 2 / Math.tan(halfFov), size.x / 2 / (Math.tan(halfFov) * cam.aspect)) + size.z;
    const limit = fill ?? (cam.aspect < 1 ? 0.82 : 0.88);   // Anteil des Bildes, den die Box maximal füllt
    const corners = [];
    for (let i = 0; i < 8; i++) {
      corners.push(new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ));
    }
    const p = new THREE.Vector3();
    const center = box.getCenter(new THREE.Vector3());   // Kamera kreist um die Boxmitte
    for (let iter = 0; iter < 10; iter++) {
      cam.position.copy(center).addScaledVector(dir, dist);
      cam.lookAt(center);
      cam.updateMatrixWorld(true);
      let maxN = 0;
      for (const c of corners) {
        p.copy(c).project(cam);
        maxN = Math.max(maxN, Math.abs(p.x), Math.abs(p.y));
      }
      if (maxN <= limit) break;
      dist *= (maxN / limit) * 1.02;
    }
    return dist;
  }

  // Drehpunkt der aktuellen Ansicht: Fenstermitte, in Drehstellung und Explosion in z nach
  // vorn (siehe setSash, setExploded), im Fokus das Teil selbst. Übergänge werden getweent.
  baseTarget() {
    return this._baseTmp.copy(this.pivot);
  }

  // Mindestabstand der Kamera zum Blickpunkt: in der Explosion vor den vordersten Teilen,
  // sonst und im Fokus (der Drehpunkt ist dann das Teil selbst) der Grundwert.
  stateMinDistance() {
    return this.exploded && !this.focused ? this.explodeMinDist : MIN_DIST;
  }

  // Weltmitte eines Bauteils (Bounding-Box), z. B. um den Fokus durch Animationen zu führen.
  partCenter(part, out = this._vTmp2) {
    part.updateWorldMatrix(true, false);
    return this._boxTmp.setFromObject(part).getCenter(out);
  }

  get open() { return this.sashMode === 'open'; }
  get tilted() { return this.sashMode === 'tilt'; }

  homePosition(dist = this.homeDist, dir = this.homeDir, target = this.baseTarget()) {
    return target.clone().addScaledVector(dir, dist);
  }

  // ------------------------------------------------------------------
  start() {
    if (this.running) return;
    this.running = true;
    this.needsRender = true;
    this.renderer.setAnimationLoop(this.tick);
  }

  // Bildzeit mitschreiben und bei anhaltender Überschreitung eine Stufe herunterschalten.
  // Der Grund für die Automatik: die Stufe wurde bisher am Eingabegerät festgemacht
  // (hover/pointer), nicht an der Grafikleistung. Jeder Rechner mit Maus bekam damit die
  // schwerste Stufe, auch ein Notebook mit eingebauter Grafik.
  // @param {number} ms Dauer des gerade gerenderten Bildes
  measureFrame(jetzt) {
    const p = this.perf;
    const vorher = p.letzte;
    p.letzte = jetzt;
    // Nur fortlaufend gezeichnete Bilder zählen (Fahrt, Ziehen, Animation).
    if (!vorher || jetzt - vorher > FRAME_GAP_MS) return;
    if (p.warmup > 0) { p.warmup--; return; }
    const dt = jetzt - vorher;
    p.min = p.min ? Math.min(p.min, dt) : dt;
    // Geglättete Bildrate für die Anzeige. Nur aus fortlaufend gezeichneten Bildern, in Ruhe
    // wird nichts gezeichnet und es gibt folglich auch keine Bildrate.
    const jetztFps = 1000 / Math.max(dt, 0.001);
    p.fps = p.fps ? p.fps * 0.85 + jetztFps * 0.15 : jetztFps;
    p.fpsZeit = jetzt;
    p.summe += dt;
    p.frames++;
    if (p.frames < (this.kalibrierung ? KAL_WINDOW : PERF_WINDOW)) return;
    const mittel = p.summe / p.frames;
    const takt = Math.max(p.min || mittel, TAKT_MIN_MS);
    p.summe = 0;
    p.frames = 0;
    p.min = 0;
    const zuLangsam = mittel > takt * FRAME_BUDGET_REL || mittel > FRAME_BUDGET_ABS;
    // Einmessen: ein einziges schlechtes Fenster genügt, denn es ist unsichtbar und soll
    // schnell gehen. Der Maßstab bleibt derselbe wie im Betrieb - es geht um Tempo, nicht
    // um Strenge.
    if (this.kalibrierung) {
      if (zuLangsam) {
        p.gut = 0;
        if (p.stufe < this.tiefsteStufe()) p.wunsch = p.stufe + 1;
      } else {
        p.gut++;
      }
      return;
    }
    p.schlecht = zuLangsam ? p.schlecht + 1 : 0;
    // Nie sofort umschalten, nur vormerken. Ausgeführt wird in einer Ruhephase,
    // siehe applyPendingQuality.
    if (p.schlecht >= PERF_SCHLECHTE_FENSTER && p.stufe < this.tiefsteStufe()) {
      p.schlecht = 0;
      p.wunsch = p.stufe + 1;
    }
  }

  // Eine vorgemerkte Umschaltung ausführen, aber nur wenn gerade nichts läuft. Das Neuanlegen
  // der Renderziele ist ein Bild lang sichtbar; mitten in einer Fahrt oder Animation fällt
  // genau das als Flackern auf, in Ruhe merkt man es kaum. Während des Intros erst recht
  // nicht, dort werden ohnehin gerade Ziele und Shader angelegt.
  applyPendingQuality() {
    const p = this.perf;
    if (p.wunsch < 0) return;
    const jetzt = performance.now();
    // Im Betrieb nur in Ruhe und mit Abstand. Beim Einmessen sofort: dort läuft zwar das Intro,
    // aber verdeckt - und genau deshalb ist die Umschaltung dort gratis.
    if (!this.kalibrierung) {
      if (this.introPlaying || this.dragging || this.tweens.length) return;
      if (jetzt - p.zuletztGesenkt < PERF_COOLDOWN_MS) return;
    }
    const ziel = p.wunsch;
    p.wunsch = -1;
    if (this.setzeStufe(ziel)) p.zuletztGesenkt = jetzt;
  }

  // Eine Stufe billiger rendern. Reihenfolge nach Kosten je sichtbarem Verlust: zuerst die
  // Pixelzahl, dann die Umgebungsverdeckung, zuletzt die Verdeckung ganz. Es wird nie wieder
  // hochgeschaltet: die Stufe steht nach dem Start fest, bis es nicht mehr reicht.
  // Tiefste Stufe, die überhaupt angefahren werden darf. Auf einem Bildschirm mit hoher
  // Punktdichte ist unterhalb von Pixelverhältnis 1.5 Schluss: dort wäre nur noch die Hälfte
  // der Anzeigeauflösung übrig, und genau das sah auf einem iPhone grob aus. Lieber ein paar
  // Bilder je Sekunde weniger als ein Bild, das man als unscharf erkennt. Auf einem
  // gewöhnlichen Monitor (Punktdichte 1) ändert die Grenze nichts, dort ist 1 die native
  // Auflösung.
  // @returns {number}
  tiefsteStufe() {
    const dicht = (window.devicePixelRatio || 1) >= 2;
    if (!dicht) return STUFEN.length - 1;
    let letzte = STUFEN.length - 1;
    for (let i = 0; i < STUFEN.length; i++) if (STUFEN[i].pr >= 1.5) letzte = i;
    return letzte;
  }

  // Eine Stufe der Tabelle anwenden. Renderziele werden dabei neu angelegt, deshalb ruft das
  // nur applyPendingQuality auf, und zwar in einer Ruhephase.
  // @param {number} ziel Index in STUFEN
  // @returns {boolean} true, wenn sich etwas geändert hat
  // Was von einer Stufe auf DIESEM Gerät tatsächlich übrig bleibt, als Zeichenkette zum
  // Vergleichen: das Pixelverhältnis wird von der Punktdichte gedeckelt, die Glättung von
  // der Grafikklasse.
  // @param {number} i
  // @returns {string}
  stufenAbdruck(i) {
    const s = STUFEN[clamp(Math.round(i), 0, STUFEN.length - 1)];
    const pr = Math.min(window.devicePixelRatio || 1, s.pr);
    return `${pr}|${s.ao ? s.aoProben : 0}`;
  }

  setzeStufe(ziel) {
    const p = this.perf;
    let i = clamp(Math.round(ziel), 0, this.tiefsteStufe());
    // Sprossen überspringen, die auf diesem Gerät nichts ändern. Zwei Fälle: auf einem
    // Bildschirm mit Punktdichte 2 sind die Zeilen pr 3 und pr 2 dasselbe Bild, und auf einer
    // Karte mit MSAA ist die fxaa-Spalte wirkungslos. Ohne diese Schleife verpufft eine
    // Abstufung folgenlos, und es bräuchte ein weiteres schlechtes Fenster, bis wirklich
    // etwas billiger wird.
    while (i < this.tiefsteStufe() && this.stufenAbdruck(i) === this.stufenAbdruck(p.stufe)) i++;
    if (i === p.stufe) return false;
    const s = STUFEN[i];
    p.stufe = i;
    this.quality.maxPixelRatio = s.pr;
    if (this.gtao) {
      this.gtao.enabled = s.ao;
      if (this.gtaoWenigerProben !== (s.aoProben <= 8)) {
        this.gtaoWenigerProben = s.aoProben <= 8;
        this.gtao.updateGtaoMaterial({ samples: s.aoProben });
        this.gtao.updatePdMaterial({ samples: s.aoProben });
      }
    }
    this.resize(true);
    p.warmup = PERF_WARMUP;
    p.schlecht = 0;
    this.needsRender = true;
    return true;
  }

  // Genauere Angabe zum Grafikchip über WebGPU nachreichen. Chrome vergröbert unter Windows
  // die WebGL-Angabe zum Schutz vor Wiedererkennung und bildet die Karte auf ein generisches
  // Modell ab (eine RTX 5080 meldet sich dort als "GeForce GTX 980"). WebGPU liefert Hersteller
  // und Architektur ungefiltert. Läuft nebenher, das Ergebnis wird beim nächsten Auffrischen
  // der Anzeige übernommen; fehlt WebGPU, bleibt es bei der WebGL-Angabe.
  async verfeinereGpuNamen() {
    try {
      if (!navigator.gpu || !navigator.gpu.requestAdapter) return;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return;
      const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
      if (!info) return;
      const beschreibung = (info.description || '').trim();
      const kurz = [info.vendor, info.architecture].filter(Boolean).join(' ').trim();
      this.gpuNameGenau = beschreibung || kurz;
    } catch (e) {
      // WebGPU nicht vorhanden oder abgelehnt: die WebGL-Angabe bleibt stehen.
    } finally {
      this.gpuProbeFertig = true;
    }
  }

  // Fortlaufend zeichnen, solange die Technikanzeige offen ist. Sonst rendert der Viewer nur
  // bei Änderungen, und es gäbe schlicht keine Bildrate zu messen.
  // @param {boolean} an
  setStatsMode(an) {
    this.statsMode = !!an;
    if (an) this.needsRender = true;
  }

  // Werte für die Debug-Anzeige. Reine Auskunft, verändert nichts.
  // @returns {object}
  debugInfo() {
    const c = this.renderer.domElement;
    const pr = this.renderer.getPixelRatio();
    const frisch = performance.now() - this.perf.fpsZeit < 500;
    return {
      gpu: this.gpuNameGenau || this.gpuName || 'unbekannt',
      gpuBereit: this.gpuProbeFertig,
      gpuWebgl: this.gpuName || '',
      gpuGenau: this.gpuNameGenau || '',
      eingebaut: !!this.startFxaa,
      grafikKlasse: this.grafikKlasse,
      fps: frisch ? Math.round(this.perf.fps) : null,
      breite: c.width,
      hoehe: c.height,
      cssBreite: this.width,
      cssHoehe: this.height,
      pixelRatio: pr,
      geraeteRatio: window.devicePixelRatio || 1,
      stufe: this.perf.stufe,
      msaa: this.composer.renderTarget1 ? this.composer.renderTarget1.samples : 0,
      fxaa: !!(this.fxaa && this.fxaa.enabled),
      gtao: !!(this.gtao && this.gtao.enabled),
      gtaoProben: this.gtaoWenigerProben ? 8 : 16,
      schattenkarte: this.sun ? this.sun.shadow.mapSize.x : 0,
      dreiecke: this.renderer.info.render.triangles,
    };
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  // Rendert nur, wenn sich etwas geändert hat (Kamera, Tween, Hover, Auswahl, Größe).
  tick() {
    const now = performance.now();
    let changed = this.updateTweens(now);
    if (!this.hasTween('camera') && !this.hasTween('view')) {
      const dist0 = this.camera.position.distanceTo(this.controls.target);
      // Drehgeschwindigkeit aus dem Bildweg je Zug an drei Stützstellen (Übersicht, halbe
      // Kopplung, Mindestabstand), nicht aus einer Überblendung der Geschwindigkeit: je Radiant
      // bewegt sich das Bild um den Orbit-Weg (d) plus den Schwenk (G·u), gemessen relativ zur
      // Bildhöhe (∝ d). Der Bildweg wird stückweise linear in der wirksamen Kopplung u
      // überblendet und die Geschwindigkeit daraus zurückgerechnet. Überblendet man die
      // Geschwindigkeit selbst, hat das Produkt aus fallender Drehung und steigender Kopplung in
      // der Mitte eine Beule (gemessen: bei 1,7 m fuhr der Blickpunkt je Zug 3,7-mal so weit wie
      // am Mindestabstand). Im Fokus ist die Kopplung aus (panScale 0), also u = 0 und volle
      // Geschwindigkeit: die Bremse gilt dem Schwenk, nicht der Nähe.
      const u = this.naehe(dist0) * this.panScale;
      // Ein Gewinn für beide Achsen (OrbitControls kennt nur eine Drehgeschwindigkeit): das
      // Mittel aus seitlich und senkrecht, bei hohen Fenstern liegen sie auseinander.
      const G = (this.panCoupling.xFrame + Math.max(this.panCoupling.yFrame, this.panCoupling.yFrameUp)) / 2;
      const dMitte = this.homeDist - (COUPLING_START + 1) / 2 * (this.homeDist - MIN_DIST);
      const wegFern = ROTATE_SPEED;
      const wegMitte = ROTATE_SPEED_MID * (dMitte + G * 0.5) / dMitte;
      const wegNah = ROTATE_SPEED_NEAR * (MIN_DIST + G) / MIN_DIST;
      const weg = u < 0.5
        ? wegFern + (wegMitte - wegFern) * (u / 0.5)
        : wegMitte + (wegNah - wegMitte) * ((u - 0.5) / 0.5);
      this.controls.rotateSpeed = dist0 > 1e-6 ? weg * dist0 / (dist0 + G * u) : ROTATE_SPEED;
      this.applyNearLimits(this.nahWert());
      if (this.controls.update()) changed = true;
      if (this.applyPanCoupling()) changed = true;
      if (this.applyBoundsConstraint()) changed = true;
      if (this.keepClear()) changed = true;
      this.merkePose();
    } else {
      // Die Fahrt setzt die Kamera selbst; was sie bewegt, ist keine Nutzereingabe.
      this.freeControlLimits();
      this._poseGemerkt = false;
    }

    if (this.pendingHover && !this.dragging && !this.introPlaying) {
      const { x, y } = this.pendingHover;
      const hit = this.pick(x, y);
      const part = hit ? hit.part : null;
      if (this.setHovered(part, x, y)) changed = true;
      else if (part) this.onHover(part.name, x, y);   // Namensschild folgt dem Zeiger
    }
    this.pendingHover = null;

    if (changed || this.needsRender) {
      this.needsRender = false;
      this.composer.render();
      this.measureFrame(now);
      this.updateAnchor();
    }
    this.applyPendingQuality();
    if (this.statsMode) this.needsRender = true;
  }

  // Blickpunkt pro Frame nachführen: Blickpunkt = Drehpunkt + Schwenk. Der Schwenk entsteht
  // NUR aus Drehung: die Winkeländerung, die der Nutzer seit dem letzten Frame gemacht hat
  // (gegen die gemerkte Pose, siehe merkePose), wird mit Gewinn und Kopplungsstärke in Meter
  // übersetzt und aufsummiert. Der Blickpunkt wandert dabei in Drehrichtung der Kamera — das
  // ist die Richtung, in die der Finger das Fenster zieht; welche Seite der Kamera das ist,
  // spielt keine Rolle. Zoomen schwenkt nie: hinein ändert den Schwenk nicht, hinaus blendet
  // ihn im Verhältnis der Kopplungsstärke aus, auf Home-Distanz ist der Blickpunkt die
  // Fenstermitte. Kamera und Blickpunkt werden immer um DENSELBEN Vektor verschoben, die
  // Orbit-Geometrie bleibt unverändert.
  //
  // Wandert der Drehpunkt (Explosion, Drehstellung, Fokus auf ein bewegtes Teil), folgt ihm
  // der Blickpunkt, der Schwenk bleibt relativ zu ihm erhalten. Die Kamera fährt nur mit, wenn
  // er auf sie ZUKOMMT (oder ein Fokus dem Teil folgt): nah am Fenster ist das genau das
  // Zurückweichen, das der Mindestabstand ohnehin verlangt hätte. Weicht der Drehpunkt ZURÜCK
  // (Flügel schließt, Explosion klappt ein), bleibt die Kamera stehen — sie fährt von sich aus
  // nie auf das Fenster zu.
  //
  // Frühere Fassungen waren eine Funktion des Winkels (Blickpunkt = f(Azimut, Neigung,
  // Abstand)). Erst divergierte sie bei wanderndem Drehpunkt per Fixpunkt-Iteration (1,18 m
  // in einem Frame, 12.09.), dann war sie mit einem Rückstand-Vektor stabil, zog aber beim
  // Hineinzoomen entlang der Home-Richtung die Kamera in die linke obere Ecke, weil der
  // Home-Winkel mit wachsender Nähe zu einem Versatz wurde. Eine aufsummierte Kopplung hat
  // beides nicht: kein Winkel, kein Fixpunkt, kein Versatz ohne Drehung.
  // Die Nutzereingabe wird als Differenz zur gemerkten Pose des letzten Frames gelesen
  // (merkePose, am Ende des Controls-Blocks in tick). Nicht um controls.update() herum: die
  // Zeiger- und Rad-Handler der OrbitControls rufen update() selbst auf, der Rad-Zoom ist also
  // schon angewendet, bevor tick "vorher" misst, und vom Ziehen sieht man nur die gedämpften
  // 92 Prozent. Gemessen: der Schwenk blendete beim Hinauszoomen nicht aus und sprang bei 2,1 m
  // um 55 cm auf die Mitte.
  // @returns {boolean} true, wenn sich etwas bewegt hat
  applyPanCoupling() {
    const t = this.controls.target;
    const cam = this.camera.position;
    const pc = this.panCoupling;
    const raw = this.swivelRaw;
    let moved = false;

    // Drehung und Zoom seit dem letzten Frame, gegen den noch unveränderten Blickpunkt gemessen.
    const off = this._dirTmp.subVectors(cam, t);
    const dist = off.length();
    const u = this.naehe(dist) * this.panScale;
    if (this._poseGemerkt && u > 0) {
      const p0 = this._pose;
      // Hebt ein Tween den Mindestabstand an (Explosion), klemmt controls.update den Radius
      // nach außen — das ist kein Zoom des Nutzers und darf nicht ausblenden.
      const dist0 = Math.max(p0.dist, this.controls.minDistance);
      const u0 = this.naehe(dist0) * this.panScale;
      const theta1 = Math.atan2(off.x, off.z);
      const phi1 = Math.acos(clamp(off.y / Math.max(dist, 1e-6), -1, 1));
      // Kürzeste Winkeldifferenz (stetig über ±180 Grad). Außen ist die Kamera bei −z, dort
      // läuft der Azimut andersherum, deshalb gespiegelt: +x bleibt +x. Eine Faltung mit
      // asin(sin) hätte bei 90 Grad die Richtung umgekehrt — erreichbar bei offenem Flügel.
      const dTheta = Math.atan2(Math.sin(theta1 - p0.theta), Math.cos(theta1 - p0.theta));
      const dSeite = this.outside ? -dTheta : dTheta;
      const dHoehe = p0.phi - phi1;
      raw.x = clamp(raw.x + pc.xFrame * u * dSeite, -SWIVEL_RAW_MAX * pc.xMax, SWIVEL_RAW_MAX * pc.xMax);
      const gY = raw.y >= 0 ? pc.yFrameUp : pc.yFrame;
      raw.y = clamp(raw.y + gY * u * dHoehe, -SWIVEL_RAW_MAX * pc.yDown, SWIVEL_RAW_MAX * pc.yUp);
      // Zoom hinaus (die Kamera hat sich vom Blickpunkt entfernt) blendet den Schwenk im
      // Verhältnis der Kopplungsstärke aus. Nur der Zoom: ein zurückweichender Drehpunkt wird
      // erst weiter unten angewendet und steckt schon in der gemerkten Pose.
      if (dist > dist0 + 1e-9 && u < u0) raw.multiplyScalar(u / u0);
    }
    if (u <= 0) raw.set(0, 0, 0);

    if (!this._pivotArmed) {
      this._pivotSeen.copy(this.pivot);
      this._pivotArmed = true;
      this._poseGemerkt = false;
      raw.set(0, 0, 0);
    } else if (!this._pivotSeen.equals(this.pivot)) {
      const d = this._pivotDelta.subVectors(this.pivot, this._pivotSeen);
      this._pivotSeen.copy(this.pivot);
      const back = this._dirTmp2.subVectors(cam, t).normalize();
      t.add(d);
      if (this.focused || d.dot(back) > 0) cam.add(d);
      moved = true;
    }

    // Blickpunkt = Drehpunkt + weich begrenzter Schwenk, bei schwacher Kopplung weich auf null
    // gezogen (SWIVEL_FADE_U); Kamera um dieselbe Differenz mit.
    const huelle = smoothstep(0, SWIVEL_FADE_U, u);
    const want = this._panWant
      .set(softLimit(raw.x, -pc.xMax, pc.xMax) * huelle, softLimit(raw.y, -pc.yDown, pc.yUp) * huelle, 0)
      .add(this.baseTarget());
    const delta = want.sub(t);
    if (delta.lengthSq() > 1e-10) {
      t.add(delta);
      cam.add(delta);
      moved = true;
    }
    // Mindestabstand entlang der Blickachse halten (der Drehpunkt kann auf die Kamera zu
    // gewandert sein). Radial vom Blickpunkt weg ist dasselbe wie entlang der Blickachse,
    // weil die Kamera immer auf den Blickpunkt schaut.
    const minD = this.controls.minDistance;
    const d2 = cam.distanceTo(t);
    if (d2 < minD - 1e-6) {
      const view = this._dirTmp2.subVectors(t, cam).normalize();
      cam.addScaledVector(view, d2 - minD);
      moved = true;
    }
    return moved;
  }

  // Pose relativ zum Blickpunkt am Ende des Controls-Blocks merken (siehe applyPanCoupling).
  // Läuft NACH Kollisionsschutz und Raum-Schranke, damit deren Verschiebungen im nächsten Frame
  // nicht als Nutzereingabe gelten.
  merkePose() {
    const off = this._dirTmp.subVectors(this.camera.position, this.controls.target);
    const dist = off.length();
    this._pose.theta = Math.atan2(off.x, off.z);
    this._pose.phi = Math.acos(clamp(off.y / Math.max(dist, 1e-6), -1, 1));
    this._pose.dist = dist;
    this._poseGemerkt = true;
  }

  // 0 = Home-Distanz oder weiter weg, 1 = Mindestabstand. Linear; Bezug für die Winkelgrenzen.
  // @returns {number}
  nahWert() {
    const d = this.camera.position.distanceTo(this.controls.target);
    return clamp((this.homeDist - d) / Math.max(this.homeDist - MIN_DIST, 0.1), 0, 1);
  }

  // Kopplungsstärke 0 … 1 für einen Abstand `dist`: null ab COUPLING_START nach außen, eins am
  // Mindestabstand, dazwischen smoothstep — die Ableitung ist an beiden Enden null, die
  // Kameraspur knickt beim Überfahren der Schwelle nicht (linear waren es 17 Grad Richtungs-
  // wechsel). Gilt für den Schwenk (applyPanCoupling) und die Drehgeschwindigkeit (tick),
  // damit beide an derselben Stelle einsetzen.
  // @returns {number}
  naehe(dist) {
    return smoothstep(COUPLING_START, 1, clamp((this.homeDist - dist) / Math.max(this.homeDist - MIN_DIST, 0.1), 0, 1));
  }

  // Winkelgrenzen, die mit dem Zoom enger werden. Weit weg sind es die Raum-Schranken (Wand,
  // Boden), ganz herangezoomt die Maueröffnung: dann bleibt die Kamera im Rahmen der Öffnung
  // und schaut durch sie hindurch, statt daneben gegen die Wand. Dazwischen wird überblendet.
  // Der Unterschied zu constrainPosition(): dort wird die Kamera erst nachträglich zurück-
  // geschoben, während der Zug weiterläuft und die Kopplung schon mit dem ungebremsten Winkel
  // gerechnet hat. Hier stoppt bereits die Drehung.
  // @param {number} nah 0 = Home-Distanz, 1 = Mindestabstand
  applyNearLimits(nah) {
    const c = this.controls;
    const t = c.target;
    const cam = this.camera.position;
    const dx = cam.x - t.x, dy = cam.y - t.y, dz = cam.z - t.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6 || !this.box) return;
    const horiz = Math.max(Math.sqrt(dx * dx + dz * dz), 1e-6);
    const innen = !this.outside;
    const gerade = innen ? 0 : Math.PI;

    // Steht der Blickpunkt vor der Wandfläche (offener Flügel, Explosion), kann die Laibung ihn
    // nicht verdecken: dann gelten nur die Raum-Schranken, und man kann um den offenen Flügel
    // herum bis an die Wand drehen, um seine Außenseite zu sehen. Zwischen Rahmenvorderkante
    // und Wandfläche wird weich überblendet, damit die Grenzen während der Flügel- und
    // Explosionsfahrt nicht springen. Früher wuchs die Öffnung nur um den Vorstand des
    // Drehpunkts mit; bei offenem Flügel endete die Drehung so bei rund 48 Grad.
    const wandflaeche = Math.max(this.wallFaceZ, this.box.max.z + 0.01);
    const eng = nah * (1 - smoothstep(this.box.max.z, wandflaeche, t.z));
    const xHi = this.box.max.x + OPENING_MARGIN_X;
    const xLo = this.box.min.x - OPENING_MARGIN_X;
    const yHi = this.box.max.y + OPENING_MARGIN_Y;
    const yLo = this.box.min.y - OPENING_MARGIN_Y;

    // Seitlich. Außen läuft der Azimut um 180 Grad, dort dreht sich das Vorzeichen von x.
    const zLim = innen ? this.wallFaceZ + 0.12 : this.wallOuterZ - 0.12;
    const wand = Math.acos(clamp((innen ? zLim - t.z : t.z - zLim) / horiz, -1, 1));
    const sLo = (xLo - t.x) / horiz, sHi = (xHi - t.x) / horiz;
    const boxLo = Math.asin(clamp(innen ? sLo : -sHi, -1, 1));
    const boxHi = Math.asin(clamp(innen ? sHi : -sLo, -1, 1));
    // Die Raum-Schranke bleibt in jedem Fall die äußere Grenze, die Öffnung engt nur weiter ein.
    let devLo = Math.max(-wand, -wand + (boxLo + wand) * eng);
    let devHi = Math.min(wand, wand + (boxHi - wand) * eng);
    if (devHi - devLo < 0.10) { const m = (devLo + devHi) / 2; devLo = m - 0.05; devHi = m + 0.05; }
    // Grenzen dürfen die Kamera nie schieben, nur blockieren. Ziehen sie sich zusammen, während
    // die Kamera außerhalb steht (Flügel schließt aus einer Pose weit seitlich, Explosion
    // klappt ein), wird der Bereich um die aktuelle Pose erweitert: nicht weiter hinaus, aber
    // zurück — und beim Zurückdrehen zieht sich die Grenze hinter der Kamera wieder zusammen.
    // Ohne das riss ein Schließen aus 95 Grad die Kamera mit 835 Grad pro Sekunde in die
    // Öffnungsgrenze (gemessen am 13.09.). Der Nutzer sieht dann eben kurz Wand — seine Pose,
    // seine Entscheidung; die Kamera bewegt sich nicht von selbst.
    const azJetzt = Math.atan2(dx, dz) - gerade;
    const cur = Math.atan2(Math.sin(azJetzt), Math.cos(azJetzt));
    devLo = Math.min(devLo, cur);
    devHi = Math.max(devHi, cur);
    if (eng > 0.02 && devHi - devLo < 2 * Math.PI - 0.1) {
      c.minAzimuthAngle = gerade + devLo;
      c.maxAzimuthAngle = gerade + devHi;
    } else {
      c.minAzimuthAngle = -Infinity;
      c.maxAzimuthAngle = Infinity;
    }

    // Höhe. Nach unten zusätzlich vom Boden begrenzt, nach oben nur von POLAR_TILT.
    const bodenPhi = Math.acos(clamp((this.floorY + FLOOR_CLEARANCE - t.y) / d, -1, 1));
    const phiMinRaum = Math.PI - POLAR_TILT;
    const phiMaxRaum = Math.min(POLAR_TILT, bodenPhi);
    const phiMinBox = Math.acos(clamp((yHi - t.y) / d, -1, 1));
    const phiMaxBox = Math.acos(clamp((yLo - t.y) / d, -1, 1));
    let phiMin = Math.max(phiMinRaum, phiMinRaum + (phiMinBox - phiMinRaum) * eng);
    let phiMax = Math.min(phiMaxRaum, phiMaxRaum + (phiMaxBox - phiMaxRaum) * eng);
    if (phiMax - phiMin < 0.10) { const m = (phiMin + phiMax) / 2; phiMin = m - 0.05; phiMax = m + 0.05; }
    // Dasselbe für die Neigung: nur blockieren, nie schieben.
    const phiJetzt = Math.acos(clamp(dy / d, -1, 1));
    phiMin = Math.min(phiMin, phiJetzt);
    phiMax = Math.max(phiMax, phiJetzt);
    c.minPolarAngle = clamp(phiMin, 0.02, Math.PI - 0.02);
    c.maxPolarAngle = clamp(phiMax, c.minPolarAngle + 0.02, Math.PI - 0.02);
  }

  // Winkelgrenzen zurück auf die Raum-Schranken. Nötig, solange eine Kamerafahrt läuft: die
  // Fahrt setzt die Kameraposition direkt und kennt ihren Weg selbst, der Seitenwechsel
  // schwenkt zum Beispiel bewusst weit um die Wandkante herum. Ohne das bleiben die Grenzen
  // der Ausgangspose stehen, und das nächste controls.update() nach der Fahrt reißt die
  // Kamera in dieses veraltete Fenster zurück. Genau so landete der Wechsel nach außen aus
  // einer herangezoomten Seitenansicht bei Azimut 96 Grad statt in der Ruhepose.
  freeControlLimits() {
    const c = this.controls;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.minPolarAngle = Math.PI - POLAR_TILT;
    c.maxPolarAngle = POLAR_TILT;
  }

  // Raum-Schranken: Käme die Kamera unter den Boden, wird die Neigung zurückgenommen;
  // käme sie hinter die Ebene knapp vor der Innenwand, der seitliche Winkel. Distanz
  // und Ziel bleiben unverändert, es entsteht jeweils ein weicher Anschlag.
  // @returns {boolean} true, wenn die Kamera verschoben wurde
  applyBoundsConstraint() {
    const t = this.controls.target;
    if (!this.constrainPosition(this.camera.position, t)) return false;
    this.camera.lookAt(t);
    return true;
  }

  // Kameraposition `cam` (wird verändert) so anpassen, dass sie über dem Boden und vor
  // der Wand liegt; Distanz zum Ziel `t` bleibt erhalten.
  // @returns {boolean} true, wenn die Position verschoben wurde
  constrainPosition(cam, t) {
    // Innen bleibt die Kamera vor der Innenwand (z groß), außen vor der Außenwand (z klein);
    // so ist auf keiner Seite eine Fahrt um die Wand herum (360 Grad) möglich.
    const inside = !this.outside;
    const zLim = inside ? this.wallFaceZ + 0.12 : this.wallOuterZ - 0.12;
    const zOk = inside ? cam.z >= zLim : cam.z <= zLim;
    const yMin = this.floorY + FLOOR_CLEARANCE;
    if (zOk && cam.y >= yMin) return false;
    const off = this._dirTmp.copy(cam).sub(t);
    const d = off.length();
    if (d < 1e-6) return false;
    let phi = Math.acos(clamp(off.y / d, -1, 1));
    let theta = Math.atan2(off.x, off.z);
    // Boden: Neigung so weit zurück, dass y = yMin
    if (cam.y < yMin) phi = Math.acos(clamp((yMin - t.y) / d, -1, 1));
    const horiz = d * Math.sin(phi);
    // Wand: Azimut so weit zurück, dass z = zLim (auf der jeweiligen Seite)
    if (horiz > 1e-6) {
      const z = t.z + horiz * Math.cos(theta);
      if (inside ? z < zLim : z > zLim) theta = Math.sign(off.x || 1) * Math.acos(clamp((zLim - t.z) / horiz, -1, 1));
    }
    cam.set(t.x + horiz * Math.sin(theta), t.y + d * Math.cos(phi), t.z + horiz * Math.cos(theta));
    return true;
  }

  // Steckt der Punkt `pos` (mit Rand `margin`, Meter) in einem Bauteil? Geprüft im lokalen
  // Raum jedes Meshs, also gegen die mitgedrehte Box. Für jeden Treffer zwei Wege hinaus:
  // `along` ist die Strecke entlang `back` (Weltvektor, Einheitslänge, üblicherweise die
  // Blickachse rückwärts) bis zum Austritt, `push` die kürzeste Achsverschiebung als Weltvektor.
  // `out` wird geleert und wiederverwendet; `push`-Vektoren werden nur bei Treffern angelegt.
  // @returns {Array<{along:number, push:THREE.Vector3, name:string}>}
  clearanceHits(pos, back, margin, out) {
    out.length = 0;
    const lp = this._vTmp;
    const ld = this._vTmp2;
    for (const { mesh, box } of this.clearance) {
      lp.copy(pos);
      mesh.worldToLocal(lp);
      const s = mesh.matrixWorld.getMaxScaleOnAxis() || 1;
      const m = margin / s;
      if (lp.x <= box.min.x - m || lp.x >= box.max.x + m
        || lp.y <= box.min.y - m || lp.y >= box.max.y + m
        || lp.z <= box.min.z - m || lp.z >= box.max.z + m) continue;
      // Austritt entlang `back`: Slab-Test im lokalen Raum. `ld` ist die lokale Richtung für
      // einen Meter Weltweg, das Ergebnis damit direkt in Weltmetern.
      ld.copy(pos).add(back);
      mesh.worldToLocal(ld);
      ld.sub(lp);
      let along = Infinity;
      for (const ax of AXES) {
        const dir = ld[ax];
        if (dir > 1e-9) along = Math.min(along, (box.max[ax] + m - lp[ax]) / dir);
        else if (dir < -1e-9) along = Math.min(along, (box.min[ax] - m - lp[ax]) / dir);
      }
      // Kürzeste Achsverschiebung: die Fläche, die am nächsten liegt.
      let best = Infinity, bestAx = 'x', bestSign = 1;
      for (const ax of AXES) {
        const toMax = box.max[ax] + m - lp[ax];
        const toMin = lp[ax] - (box.min[ax] - m);
        if (toMax < best) { best = toMax; bestAx = ax; bestSign = 1; }
        if (toMin < best) { best = toMin; bestAx = ax; bestSign = -1; }
      }
      const push = new THREE.Vector3();
      push[bestAx] = bestSign;
      push.transformDirection(mesh.matrixWorld).multiplyScalar(best * s + 1e-3);
      out.push({ along: along + 1e-3, push, name: mesh.name });
    }
    return out;
  }

  // Kamera aus Bauteilen heraushalten, pro Frame nach Controls und Kopplung. Hinaus geht es
  // entlang der Blickachse rückwärts (die Kamera geht auf Abstand, der Blick bleibt) oder über
  // die kürzeste Achsverschiebung — je nachdem, was die kleinere Bewegung ist. Das ist der
  // Anschlag beim Ziehen und Zoomen; die Animationen selbst weichen vorher aus (retreatBefore).
  // Mehrere Durchgänge, falls die Kamera in zwei Teilen zugleich steckt.
  // @returns {boolean} true, wenn die Kamera verschoben wurde
  keepClear() {
    if (!this.clearance.length || !this.baugruppe) return false;
    const cam = this.camera.position;
    const t = this.controls.target;
    this.baugruppe.updateWorldMatrix(true, true);
    const back = this._dirTmp2.subVectors(cam, t).normalize();
    let moved = false;
    for (let pass = 0; pass < 3; pass++) {
      const hits = this.clearanceHits(cam, back, CLEAR_MARGIN, this._hits);
      if (!hits.length) break;
      const h = hits[0];
      if (Number.isFinite(h.along) && h.along <= h.push.length()) cam.addScaledVector(back, h.along);
      else cam.add(h.push);
      moved = true;
    }
    if (moved) this.camera.lookAt(t);
    return moved;
  }

  // Vorausschauender Rückzug vor einer Bewegung von Bauteilen. `stellung(q)` bringt die Szene
  // in die Zwischenpose q ∈ [0, 1] der bevorstehenden Bewegung, `zeit(q)` sagt in ms, wann sie
  // erreicht ist, `drehpunkt(q)` liefert den Drehpunkt dieser Pose — kommt er auf die Kamera
  // zu, fährt sie mit ihm mit (applyPanCoupling), geprüft wird dann ihre mitgefahrene Position.
  // Steht sie in einer der abgetasteten Posen in einem Bauteil, fährt sie vorab entlang der
  // Blickachse zurück — weich, und fertig, bevor die erste Berührung käme. Die Szene steht
  // danach wieder in der Ausgangspose. Der Rückzug läuft als eigener Tween ('retreat') in
  // Schritten, verträgt sich also mit Kopplung und Controls, die parallel weiterlaufen. Ohne
  // diesen Vorlauf würde der Frame-Anschlag (keepClear) die Kamera erst im Moment der
  // Berührung wegschieben, mit dem Tempo des Teils statt in Ruhe.
  // @returns {number} Rückzugsweg in Metern (0 = nichts nötig)
  retreatBefore(stellung, zeit, drehpunkt) {
    this.killTweens('retreat');
    const cam = this.camera.position;
    const back = this._dirTmp2.subVectors(cam, this.controls.target).normalize();
    const pos = new THREE.Vector3();
    stellung(0);
    const p0 = drehpunkt(0).clone();
    let weg = 0, frist = Infinity;
    for (let k = 1; k <= RETREAT_SAMPLES; k++) {
      const q = k / RETREAT_SAMPLES;
      stellung(q);
      this.baugruppe.updateWorldMatrix(true, true);
      const dp = this._vTmp2.copy(drehpunkt(q)).sub(p0);
      pos.copy(cam);
      if (this.focused || dp.dot(back) > 0) pos.add(dp);
      for (const h of this.clearanceHits(pos, back, CLEAR_MARGIN + 0.02, this._hits)) {
        if (Number.isFinite(h.along)) weg = Math.max(weg, h.along);
        frist = Math.min(frist, zeit(q));
      }
    }
    stellung(0);
    this.baugruppe.updateWorldMatrix(true, true);
    if (weg < 0.005) return 0;
    const dauer = clamp(frist - 40, 120, RETREAT_MS);
    let bisher = 0;
    this.tween({
      tag: 'retreat', duration: dauer, ease: easeInOutSine,
      update: (e) => {
        const schritt = weg * e - bisher;
        bisher = weg * e;
        const richtung = this._dirTmp.subVectors(cam, this.controls.target).normalize();
        cam.addScaledVector(richtung, schritt);
        const geklemmt = this.constrainPosition(cam, this.controls.target);
        // Der Rückzug ist kein Zoom des Nutzers: gemerkten Abstand nachziehen, sonst blendete
        // applyPanCoupling den Schwenk um den Rückzugsweg aus. Nur den Abstand — die Winkel
        // bleiben, damit eine gleichzeitige Drehung des Nutzers weiter gezählt wird; hat die
        // Raum-Schranke die Winkel verändert, die ganze Pose.
        if (this._poseGemerkt) {
          if (geklemmt) this.merkePose();
          else this._pose.dist = cam.distanceTo(this.controls.target);
        }
      },
    });
    return weg;
  }

  // Nach Kamera-Tweens: Ziel auf den Drehpunkt der Ansicht, Controls neu synchronisieren.
  settleControls() {
    this.swivelRaw.set(0, 0, 0);
    this._poseGemerkt = false;
    this.controls.target.copy(this.baseTarget());
    this.applyNearLimits(this.nahWert());
    this.controls.update();
  }

  // Restschwung der OrbitControls (Dämpfung) verwerfen, bevor ein Kamera-Tween startet;
  // sonst würde er nach dem Tween nachgeholt. Greift auf interne Felder zu (three 0.185);
  // fehlen sie, wird der Rest sofort angewendet statt verworfen.
  discardMomentum() {
    const c = this.controls;
    if (c._sphericalDelta && c._panOffset) {
      c._sphericalDelta.set(0, 0, 0);
      c._panOffset.set(0, 0, 0);
      c._scale = 1;
      return;
    }
    const damping = c.enableDamping;
    c.enableDamping = false;
    c.update();
    c.enableDamping = damping;
  }

  // Laufende Kamera-/Drehpunkt-Tweens (Fokus, Reset) abbrechen, ohne die Controls gesperrt
  // zu lassen. Wer danach eine neue Fahrt anlegt, sperrt sie selbst wieder.
  // `fokusSchonen`: eine laufende Fokusfahrt weiterlaufen lassen. Ihr Abschluss setzt
  // Drehpunkt, Blickpunkt und Kopplung konsistent (panScale 0, settleControls); abgebrochen
  // bliebe panScale auf halbem Weg stehen, und der Blickpunkt spränge im nächsten Frame um
  // den Restweg plus den alten Schwenk. Öffnen und Explosion warten deshalb auf sie
  // (restFokusFahrt); Reset und Seitenwechsel dürfen sie töten, sie fahren selbst zu Ende.
  cancelCameraTweens(fokusSchonen = false) {
    this.tweens = this.tweens.filter((t) =>
      (t.tag !== 'camera' || (fokusSchonen && t.fokus)) && t.tag !== 'pivot' && t.tag !== 'retreat');
    this.controls.enabled = !this.hasTween('camera');
  }

  // Restdauer einer laufenden Fokusfahrt in ms, 0 wenn keine läuft.
  restFokusFahrt() {
    const f = this.tweens.find((t) => t.tag === 'camera' && t.fokus);
    if (!f) return 0;
    return f.start === null ? f.delay + f.duration : Math.max(0, f.start + f.duration - performance.now());
  }

  // Gemeinsame Kamerafahrt für Explosion und Flügel. Startpose erst im ersten Frame lesen
  // (verzögerter Start nach einer anderen Animation). Der Blickpunkt wandert vom aktuellen
  // (inkl. Schwenk) zum Drehpunkt der Zielansicht (die Fahrt endet ohne Schwenk), Richtung
  // und Distanz werden dorthin überblendet, so springt weder der erste noch der letzte
  // Frame. `progress(p)` liefert den bereits geglätteten Fortschritt 0 … 1 zur Tween-Zeit p.
  cameraRide({ duration, delay = 0, dirTo, dEnd, progress }) {
    this.killTweens('camera');
    this.discardMomentum();
    const look = this.controls.target;
    const lookFrom = new THREE.Vector3();
    const lookTo = new THREE.Vector3();
    const dirFrom = new THREE.Vector3();
    let dStart = 0;
    let started = false;
    this.controls.enabled = false;
    this.tween({
      tag: 'camera', duration, delay, ease: (t) => t,
      update: (_, p) => {
        if (!started) {
          started = true;
          lookFrom.copy(look);
          dirFrom.copy(this.camera.position).sub(look).normalize();
          dStart = this.camera.position.distanceTo(look);
        }
        const s = progress(p);
        lookTo.copy(this.baseTarget());
        look.lerpVectors(lookFrom, lookTo, s);
        const dir = this._dirTmp.copy(dirFrom).lerp(dirTo, s).normalize();
        this.camera.position.copy(look).addScaledVector(dir, dStart + (dEnd() - dStart) * s);
        // Auch unterwegs vor Wand und Boden bleiben (die Endpose liegt ohnehin davor).
        this.constrainPosition(this.camera.position, look);
        this.camera.lookAt(look);
      },
      complete: () => {
        this.controls.enabled = true;
        this.applyNearLimits(this.nahWert());
        this.controls.update();
        this.userInteracted = false;
        this._pivotArmed = false;
      },
    });
  }

  // ------------------------------------------------------------------
  // Intro: Teile fliegen aus einer Explosionsansicht zusammen, Kamera fährt heran.
  prepareIntro() {
    this.tweens.length = 0;
    // Restschwung der Controls verwerfen: nach "Neu scannen" mitten im Ausschwingen drehte die
    // Kamera nach dem Intro sonst noch einige Grad von selbst weiter.
    if (this.controls) this.discardMomentum();
    this.introPlaying = false;
    this.exploded = false;
    this.userInteracted = false;
    this.downPos = null;
    this.select(null);
    this.setHovered(null);
    this.pivot.copy(this.homeTarget);
    this.panScale = 1;
    this._pivotArmed = false;
    this.focused = null;
    if (this.controls) this.controls.minDistance = MIN_DIST;
    // Startseite der Kamera ist die Hauptseite des Modells.
    this.outside = this.hauptAussen;
    this.outsideRequested = this.hauptAussen;
    this.applyViewSide();
    this.sashMode = 'closed';
    this.openFactor = 0;
    this.tiltFactor = 0;
    this.handleAngle = 0;
    this.liftFactor = 1;
    for (const name of this.parts.keys()) this.partFactor.set(name, 1);
    this.applyExplode();
    this.controls.target.copy(this.homeTarget);
    this.camera.position.copy(this.homePosition(this.homeDist * 1.4, this.sideDir(this.introDir)));
    this.camera.lookAt(this.homeTarget);
    this.controls.enabled = false;
    this.needsRender = true;
  }

  // Einmal blind durchspielen und dabei die Stufe finden. Wird aufgerufen, solange das
  // Scan-Overlay noch alles verdeckt.
  // @returns {Promise<{von: number, nach: number, dauer: number, bilder: number}>}
  kalibriere() {
    const p = this.perf;
    // Nur einmal je Viewer. Bei "Neu scannen" bliebe der Viewer bestehen, die Einmessung liefe
    // erneut - und weil es nur abwärts geht, würde sie sich mit jedem Scan weiter
    // herunterschrauben, ohne dass je etwas langsamer geworden waere.
    if (!this.ready || this.kalibriert) return Promise.resolve(null);
    const zaehler = () => { p.frames = 0; p.summe = 0; p.min = 0; p.gut = 0; p.schlecht = 0;
      p.warmup = PERF_WARMUP; p.wunsch = -1; p.letzte = 0; };
    const von = p.stufe;
    const t0 = performance.now();
    this.kalibrierung = true;
    zaehler();
    this.prepareIntro();
    this.start();
    this.playIntro();
    return new Promise((fertig) => {
      const pruefe = () => {
        const durch = p.gut >= KAL_GUT_NOETIG
          || performance.now() - t0 > KAL_MAX_MS
          || (!this.introPlaying && !this.tweens.length);
        if (!durch) { setTimeout(pruefe, 50); return; }
        this.kalibrierung = false;
        this.kalibriert = true;
        this.tweens.length = 0;
        this.prepareIntro();
        zaehler();
        p.zuletztGesenkt = 0;   // die erste Umschaltung im Betrieb soll nicht warten müssen
        fertig({ von, nach: p.stufe, dauer: Math.round(performance.now() - t0) });
      };
      setTimeout(pruefe, 50);
    });
  }

  playIntro() {
    this.introPlaying = true;
    this.controls.enabled = false;
    const from = this.camera.position.clone();
    this.tween({
      tag: 'camera', duration: INTRO_DURATION, ease: easeOutCubic,
      // Ziel jedes Mal neu berechnen: bei Resize während des Intros stimmt so das Framing.
      update: (e) => { this.camera.position.lerpVectors(from, this.homePosition(), e); this.camera.lookAt(this.homeTarget); },
    });
    this.tween({
      tag: 'explode', duration: INTRO_DURATION, ease: (t) => t,
      update: (_, p) => {
        // Stufe 1: Teile fliegen (gestaffelt) zusammen, das Fenster schwebt noch vor der Wand.
        const ps = phase(p, 0, INTRO_SPREAD_SHARE);
        for (const [name, obj] of this.parts) {
          const d = obj.userData.introDelay;
          const q = clamp((ps - d) / 0.5, 0, 1);
          this.partFactor.set(name, 1 - easeOutCubic(q));
        }
        // Stufe 2: das komplette Fenster gleitet gerade in die Wand.
        this.liftFactor = 1 - easeInOutCubic(phase(p, INTRO_SPREAD_SHARE, 1));
        this.applyExplode();
      },
      complete: () => {
        this.introPlaying = false;
        this.controls.enabled = true;
        this.settleControls();
        this.applyPendingQuality();
      },
    });
  }

  // Position = Ausgangslage + gemeinsamer Hub (z) + individueller Versatz * Spreizung.
  // Danach die Flügelstellung: erst der Griff um seine Spindel, dann alle am Flügel
  // montierten Teile (mount sash) um die Bandachse (Drehen) bzw. die Kippachse (Kippen).
  // Die Achsen wandern mit dem Hub mit.
  applyExplode() {
    const lift = this.explodeLift * this.liftFactor;
    const openAngle = this.hingeSide * this.openAngle * this.openFactor;
    const tiltAngle = this.tiltAngle * this.tiltFactor;
    const qOpen = this.hingeAxis && openAngle !== 0 ? this._qTmp.setFromAxisAngle(UP, openAngle) : null;
    const qTilt = this.tiltAxis && tiltAngle !== 0 ? this._qTmp2.setFromAxisAngle(X_AXIS, tiltAngle) : null;
    const qHandle = this.handleReady && this.handlePivot && this.handleAngle !== 0
      ? this._qTmp3.setFromAxisAngle(Z_AXIS, this.handleSign * this.handleAngle) : null;
    const axis = this._vTmp;
    const placeObj = (name, obj, role) => {
      const base = obj.userData.basePosition;
      if (!base) return;
      if (this.modell.statisch.has(name)) {
        obj.position.copy(base);
        obj.quaternion.copy(obj.userData.baseQuaternion || IDENTITY_Q);
        return;
      }
      const off = obj.userData.explodeOffset || [0, 0, 0];
      const f = this.partFactor.get(name) ?? 0;
      obj.position.set(base.x + off[0] * f, base.y + off[1] * f, base.z + lift + off[2] * f);
      obj.quaternion.copy(obj.userData.baseQuaternion || IDENTITY_Q);
      // Mit dem Flügel bewegen sich nur Teile mit mount sash. Bandseitige Teile am
      // Blendrahmen (mount hinge: Ecklager, Scherenlager) bleiben stehen; ihre flügelseitigen
      // Gegenstücke (Eckband, Kappen) sind im Modell eigene Teile mit mount sash.
      if (obj.userData.mount !== 'sash') return;
      if (role === 'handle' && qHandle) {
        // Spindel wandert mit dem Teil (Versatz gegenüber der Ausgangslage).
        rotateAbout(obj, qHandle, axis.copy(this.handlePivot).add(obj.position).sub(base));
      }
      if (role === 'stay' && this.stayReady) {
        // Die Schere hängt an ihrem Lagerzapfen (Ursprung): Drehen schwenkt sie dort mit dem
        // Flügelwinkel, Kippen so weit, dass ihr Ende der Flügeloberkante folgt. Ihr
        // flügelseitiges Ende gleitet dabei entlang des Flügels, der Zapfen bleibt im Lager.
        if (qOpen) obj.quaternion.premultiply(qOpen);
        if (qTilt) {
          const end = axis.set(obj.position.x + this.stayDir * this.stayLength, obj.position.y, obj.position.z);
          const k = this.tiltAxis;
          const dz = (end.y - k.y) * Math.sin(tiltAngle) - (end.z - (k.z + lift)) * (1 - Math.cos(tiltAngle));
          const swing = Math.asin(clamp(dz / this.stayLength, -1, 1));
          obj.quaternion.premultiply(this._qTmp4.setFromAxisAngle(UP, -this.stayDir * swing));
        }
        return;
      }
      if (qOpen) rotateAbout(obj, qOpen, axis.copy(this.hingeAxis).setZ(this.hingeAxis.z + lift));
      if (qTilt) rotateAbout(obj, qTilt, axis.copy(this.tiltAxis).setZ(this.tiltAxis.z + lift));
    };
    const griffName = this.modell.griff.name, schereName = this.modell.schere;
    for (const [name, obj] of this.parts) placeObj(name, obj, name === griffName ? 'handle' : name === schereName ? 'stay' : '');
    for (const { obj, host } of this.attached) placeObj(host, obj, '');
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
  }

  // Flügelstellung wechseln: 'closed' | 'open' (Drehen) | 'tilt' (Kippen). Ablauf wie am
  // echten Fenster: erst zurück in die Schließstellung (falls anders geöffnet), dann dreht
  // der Griff, dann schwenkt bzw. kippt der Flügel. Schließt sich mit der Explosion aus:
  // ist sie aktiv, wird sie zuerst eingeklappt. Der Drehpunkt der Kamera wandert mit der
  // Flügelbewegung nach vorn (halbe Ausladung), ein aktiver Fokus wird dabei aufgelöst.
  // @returns {number} Gesamtdauer bis zur Endstellung in ms (inkl. Wartezeit)
  setSash(mode, delay = 0) {
    if (this.introPlaying || !this.hingeAxis) return 0;
    if (mode === 'tilt' && !this.kannKippen) return 0;
    if (mode === this.sashMode && !this.hasTween('sash')) return 0;
    if (mode !== 'closed' && this.exploded) {
      this.setExploded(false);
      delay = EXPLODE_DURATION;
    }
    this.sashMode = mode;
    this.killTweens('sash');
    // Eine laufende Fokusfahrt zu Ende fahren lassen (siehe cancelCameraTweens).
    delay = Math.max(delay, this.restFokusFahrt());
    this.cancelCameraTweens(true);
    const o0 = this.openFactor, t0 = this.tiltFactor, h0 = this.handleAngle;
    const oT = mode === 'open' ? 1 : 0;
    const tT = mode === 'tilt' ? 1 : 0;
    // Griffdrehung je Stellung aus dem Modelleintrag (Grad): Fenster 90/180, Türdrücker 38/–.
    const g = this.modell.griff;
    const hT = !this.handleReady ? 0
      : mode === 'open' ? THREE.MathUtils.degToRad(g.drehen || 0)
        : mode === 'tilt' ? THREE.MathUtils.degToRad(g.kippen || 0) : 0;
    // Schritte nacheinander: `key` ist der animierte Wert, `moves` markiert Flügelbewegung.
    const steps = [];
    if (o0 > 0 && oT === 0) steps.push({ key: 'openFactor', from: o0, to: 0, dur: OPEN_DURATION * o0, moves: true });
    if (t0 > 0 && tT === 0) steps.push({ key: 'tiltFactor', from: t0, to: 0, dur: TILT_DURATION * t0, moves: true });
    if (Math.abs(hT - h0) > 1e-4) {
      steps.push({ key: 'handleAngle', from: h0, to: hT, dur: HANDLE_TURN_DURATION * Math.abs(hT - h0) / (Math.PI / 2), moves: false });
    }
    if (oT > o0) steps.push({ key: 'openFactor', from: o0, to: oT, dur: OPEN_DURATION * (oT - o0), moves: true });
    if (tT > t0) steps.push({ key: 'tiltFactor', from: t0, to: tT, dur: TILT_DURATION * (tT - t0), moves: true });
    // Drücker (Tür): niemand hält ihn, während die Tür schwingt. Sobald sie sich bewegt, geht
    // er in die Ruhelage zurück - parallel zum Öffnen, nach einem Viertel von dessen Dauer.
    const loslassen = !!(g.loslassen && oT > o0 && hT > 0);
    if (loslassen) {
      steps.push({ key: 'handleAngle', from: hT, to: 0, dur: HANDLE_TURN_DURATION * hT / (Math.PI / 2), moves: false, parallelZu: 'openFactor' });
    }
    if (!steps.length) return 0;
    let at = 0;
    for (const step of steps) {
      if (step.parallelZu) {
        const bezug = steps.find((s) => s.key === step.parallelZu && s.moves);
        step.start = bezug.start + bezug.dur * 0.25;
        at = Math.max(at, step.start + step.dur);
        continue;
      }
      step.start = at;
      at += step.dur;
    }
    const total = at;
    const movesTotal = steps.reduce((sum, step) => sum + (step.moves ? step.dur : 0), 0);
    // Fortschritt der Flügelbewegung (ohne Griffdrehung), geglättet, 0 … 1: daran hängen
    // Drehpunkt, Kopplung und Kamerafahrt, damit die Kamera steht, solange nur der Griff dreht.
    // Dreht nur der Griff zurück (z. B. Reset während der Griffdrehung), läuft der Fortschritt
    // über die ganze Dauer, sonst kämen Drehpunkt und Kamera nie an.
    const local = (step, elapsed) => easeInOutCubic(clamp((elapsed - step.start) / step.dur, 0, 1));
    const motion = (elapsed) => {
      if (!movesTotal) return easeInOutCubic(clamp(elapsed / total, 0, 1));
      let m = 0;
      for (const step of steps) if (step.moves) m += local(step, elapsed) * step.dur;
      return m / movesTotal;
    };
    // Drehpunkt: in Drehstellung (nur innen, dort schwenkt der Flügel in den Raum) um die
    // Ausladung nach vorn, sonst die Fenstermitte. Wandert synchron mit der Flügelbewegung,
    // die Kamera dreht sich dabei nur hin (siehe applyPanCoupling). Startwert erst im ersten
    // Frame lesen (verzögerter Start). Ein Fokus hat Vorrang: dann folgt der Drehpunkt dem Teil.
    const pivotTo = this.homeTarget.clone().setZ(this.homeTarget.z + (mode === 'open' && !this.outside ? this.openShift : 0));
    const pivotFrom = new THREE.Vector3();
    let started = false;
    // Kamerafahrt nur aus der zurückgesetzten Ansicht: hat der Nutzer die Kamera bewegt oder ein
    // Teil fokussiert, sieht er die Bewegung aus seinem Blickwinkel (wie bei der Explosion).
    // In der Außenansicht gar keine Fahrt: dort bleibt die Kamera stehen, nur der Flügel bewegt
    // sich. Geprüft wird auch die gewünschte Seite, damit ein Klick während des Seitenwechsels
    // nicht doch noch eine Fahrt startet.
    // Vor dem Flügel-Tween angelegt, damit sie pro Frame nach ihm ausgewertet wird.
    const ride = !this.userInteracted && !this.hasTween('view') && !(this.outside || this.outsideRequested);
    if (ride) {
      const dirTo = this.standardPose().dir.clone();
      // Mindestdauer: Ist nur eine kurze Griffbewegung übrig (z. B. Reset kurz nach dem
      // Öffnen), fährt die Kamera trotzdem in Ruhe und nicht in 100 ms zur Ruhepose.
      const rideMs = Math.max(total, RESET_DURATION);
      const progress = rideMs === total ? (p) => motion(p * total) : (p) => easeInOutSine(p);
      this.cameraRide({ duration: rideMs, delay, dirTo, dEnd: () => this.standardPose().dist, progress });
    }
    // Pose der Flügelteile zum Fortschritt q ∈ [0, 1] der Gesamtdauer; für den Tween und für
    // die Abtastung des Rückzugs (retreatBefore) dieselbe Funktion.
    const stellung = (q) => {
      const elapsed = q * total;
      for (const step of steps) this[step.key] = step.from + (step.to - step.from) * local(step, elapsed);
      this.applyExplode();
    };
    this.tween({
      tag: 'sash', duration: total, delay, ease: (t) => t,
      update: (_, p) => {
        if (!started) {
          started = true;
          pivotFrom.copy(this.pivot);
          // Aus einer Nutzerpose: steht die Kamera im Weg des Flügels, vorher zurückweichen.
          // Erst jetzt geprüft, nicht beim Aufruf — davor kann noch eine Explosion einklappen,
          // und die Kamera steht dann woanders.
          if (!ride) {
            const drehpunkt = (q) => (this.focused
              ? this.partCenter(this.focused)
              : this._vTmp2.lerpVectors(pivotFrom, pivotTo, motion(q * total)));
            this.retreatBefore(stellung, (q) => q * total, drehpunkt);
          }
        }
        stellung(p);
        const q = motion(p * total);
        if (this.focused) this.pivot.copy(this.partCenter(this.focused));
        else this.pivot.lerpVectors(pivotFrom, pivotTo, q);
      },
      complete: () => {
        this.openFactor = oT;
        this.tiltFactor = tT;
        this.handleAngle = loslassen ? 0 : hT;
        this.applyExplode();
        if (this.focused) this.pivot.copy(this.partCenter(this.focused));
        else this.pivot.copy(pivotTo);
      },
    });
    return delay + total;
  }

  setOpen(on) { return this.setSash(on ? 'open' : 'closed'); }
  setTilt(on) { return this.setSash(on ? 'tilt' : 'closed'); }

  toggleOpen() {
    this.setSash(this.sashMode === 'open' ? 'closed' : 'open');
    return this.open;
  }

  toggleTilt() {
    this.setSash(this.sashMode === 'tilt' ? 'closed' : 'tilt');
    return this.tilted;
  }

  setExploded(on, delay = 0) {
    if (this.introPlaying) return this.exploded;
    if (on && this.sashMode !== 'closed') {
      // Erst den Flügel schließen (Griff zurück), dann explodieren.
      delay = this.setSash('closed');
    }
    this.killTweens('explode');
    // Eine laufende Fokusfahrt zu Ende fahren lassen (siehe cancelCameraTweens).
    delay = Math.max(delay, this.restFokusFahrt());
    this.cancelCameraTweens(true);
    // Explosion nur auf einer Seite (Fenster: innen)? Dann von der anderen erst hinüberfahren.
    let switchedSide = false;
    const seite = this.explosionSeite();
    if (on && seite !== null && (this.outside !== seite || this.outsideRequested !== seite)) {
      delay = Math.max(delay, this.setOutside(seite));
      switchedSide = true;
    }
    this.exploded = !!on;
    const fromLift = this.liftFactor;
    const fromSpread = new Map(this.partFactor);
    const to = this.exploded ? 1 : 0;
    // Ausfahren: erst Hub, dann Spreizung. Einklappen: erst Spreizung zurück, dann Hub zurück.
    const liftA = this.exploded ? 0 : 1 - EXPLODE_LIFT_SHARE;
    const liftB = this.exploded ? EXPLODE_LIFT_SHARE : 1;
    const spreadA = this.exploded ? EXPLODE_LIFT_SHARE : 0;
    const spreadB = this.exploded ? 1 : 1 - EXPLODE_LIFT_SHARE;
    // Drehpunkt: in der Explosion die Mitte der Baugruppe (Fenstermitte, in z nach vorn), sonst
    // die Fenstermitte. Wandert synchron mit der Spreizung, ebenso der Mindestabstand (vor den
    // vordersten Teilen). Startwerte erst im ersten Frame lesen (verzögerter Start). Ein Fokus
    // hat Vorrang: dann folgt der Drehpunkt dem Teil und der Mindestabstand bleibt klein.
    const pivotTo = this.homeTarget.clone().setZ(this.homeTarget.z + (this.exploded ? this.explodeShift : 0));
    const pivotFrom = new THREE.Vector3();
    const minDistTo = this.exploded ? this.explodeMinDist : MIN_DIST;
    let minDistFrom = MIN_DIST;
    let started = false;

    // Kamerafahrt nur während der Spreiz-Stufe (während des Hubs steht die Kamera still) und
    // nur aus der zurückgesetzten Ansicht. Hat der Nutzer gedreht, gezoomt oder ein Teil
    // fokussiert, bleibt seine Einstellung; ein Fokus folgt dem Teil. Vor dem Explosions-Tween
    // angelegt, damit sie pro Frame nach ihm ausgewertet wird (die Tween-Liste läuft rückwärts).
    const ride = !this.userInteracted && !switchedSide;
    if (ride) {
      this.cameraRide({
        duration: EXPLODE_DURATION, delay, dirTo: this.homeDir,
        dEnd: () => this.currentFitDistance(),
        progress: (p) => easeInOutCubic(phase(p, spreadA, spreadB)),
      });
    }

    // Pose aller Teile zum Fortschritt p ∈ [0, 1]; liefert die Spreizung s, an der Drehpunkt und
    // Mindestabstand hängen. Für den Tween und die Abtastung des Rückzugs dieselbe Funktion.
    const stellung = (p) => {
      const l = easeInOutCubic(phase(p, liftA, liftB));
      this.liftFactor = fromLift + (to - fromLift) * l;
      const s = easeInOutCubic(phase(p, spreadA, spreadB));
      for (const [name, f] of fromSpread) this.partFactor.set(name, f + (to - f) * s);
      this.applyExplode();
      return s;
    };
    this.tween({
      tag: 'explode', duration: EXPLODE_DURATION, delay, ease: (t) => t,
      update: (_, p) => {
        if (!started) {
          started = true;
          pivotFrom.copy(this.pivot);
          minDistFrom = this.controls.minDistance;
          // Aus einer Nutzerpose: kommen Teile beim Hub oder Spreizen in die Kamera, vorher
          // zurückweichen (siehe setSash).
          if (!ride) {
            const drehpunkt = (q) => (this.focused
              ? this.partCenter(this.focused)
              : this._vTmp2.lerpVectors(pivotFrom, pivotTo, easeInOutCubic(phase(q, spreadA, spreadB))));
            this.retreatBefore(stellung, (q) => q * EXPLODE_DURATION, drehpunkt);
          }
        }
        const s = stellung(p);
        if (this.focused) this.pivot.copy(this.partCenter(this.focused));
        else {
          this.pivot.lerpVectors(pivotFrom, pivotTo, s);
          this.controls.minDistance = minDistFrom + (minDistTo - minDistFrom) * s;
        }
      },
      complete: () => {
        if (this.focused) this.pivot.copy(this.partCenter(this.focused));
        else this.pivot.copy(pivotTo);
        this.controls.minDistance = this.stateMinDistance();
      },
    });
    return this.exploded;
  }

  // Seite, auf der es die Explosion allein gibt (true außen, false innen), oder null, wenn sie
  // auf beiden Seiten stehen bleibt (Tür: die Teile gehen vom Blatt aus nach beiden Seiten).
  explosionSeite() {
    const s = this.modell.explosionSeite || (this.hauptAussen ? 'aussen' : 'innen');
    return s === 'beide' ? null : s === 'aussen';
  }

  toggleExplode() {
    return this.setExploded(!this.exploded);
  }

  // Blickrichtung für die aktuelle Seite: in der Außenansicht an der Wandebene gespiegelt.
  sideDir(dir) {
    return this.outside ? this._dirTmp2.set(dir.x, dir.y, -dir.z) : dir;
  }

  // Innen-/Außenansicht wechseln: Kamerafahrt als Orbit um die Fenstermitte, außen um die
  // Wandkante herum (nicht durch die Scheibe), der Blick bleibt die ganze Zeit auf dem Fenster.
  // Endet in der Ruhepose der anderen Seite. Bei aktiver Explosion wird zuerst eingeklappt
  // (Explosion nur auf der Hauptseite). Seite, Home-Richtung und Schranke wechseln erst, wenn die Fahrt
  // beginnt (verzögerter Start), die Schranke selbst gilt während der Fahrt nicht.
  // @returns {number} Zeit in ms bis zum Ende der Fahrt (inkl. Wartezeit)
  setOutside(on, delay = 0) {
    on = !!on;
    if (this.introPlaying || on === this.outsideRequested) return 0;
    // Weg von der Seite, auf der es die Explosion allein gibt: vorher einklappen.
    const seite = this.explosionSeite();
    if (this.exploded && seite !== null && on !== seite) {
      this.setExploded(false);
      delay = EXPLODE_DURATION;
    }
    this.outsideRequested = on;
    this.killTweens('view');
    this.cancelCameraTweens();
    this.discardMomentum();
    this.controls.enabled = false;
    const look = this.controls.target;
    const lookFrom = new THREE.Vector3();
    const pivotFrom = new THREE.Vector3();
    const pivotTo = new THREE.Vector3();
    const endTarget = new THREE.Vector3();
    const off = new THREE.Vector3();
    const TWO_PI = Math.PI * 2;
    let panScaleFrom = 1;
    let d0 = 1, d1 = 1, theta0 = 0, dTheta = 0, phi0 = 1, phi1 = 1, hump = 0, sPass = 0.5;
    let started = false;
    const tween = this.tween({
      tag: 'view', duration: VIEW_RIDE_MS, delay, ease: easeInOutSine,
      update: (s) => {
        if (!started) {
          started = true;
          this.outside = on;
          this.applyViewSide();
          // Auswahl bleibt über den Seitenwechsel bestehen (Kontur und Infofeld des
          // gewählten Teils). Nur der Fokus wird gelöst: der Drehpunkt geht zurück auf
          // die Fenstermitte, die Fahrt endet in der Ruhepose der anderen Seite.
          this.setHovered(null);
          this.focused = null;
          pivotFrom.copy(this.pivot);
          panScaleFrom = this.panScale;
          lookFrom.copy(look);
          pivotTo.copy(this.homeTarget);
          // Ruhepose der Zielseite um den Ziel-Drehpunkt (ohne Schwenk).
          const pose = this.standardPose();
          endTarget.copy(pivotTo);
          // Start- und Zielpose in Kugelkoordinaten um den Blickpunkt: die Fahrt ist ein Orbit
          // um die Fenstermitte, außen um die Wandkante herum, der Blick bleibt auf dem Fenster.
          off.copy(this.camera.position).sub(lookFrom);
          d0 = off.length();
          theta0 = Math.atan2(off.x, off.z);
          phi0 = Math.acos(clamp(off.y / d0, -1, 1));
          d1 = pose.dist;
          const theta1 = Math.atan2(pose.dir.x, pose.dir.z);
          phi1 = Math.acos(clamp(pose.dir.y, -1, 1));
          const wallMid = (this.wallFaceZ + this.wallOuterZ) / 2;
          const crossing = (this.camera.position.z < wallMid) !== on;
          const dPlus = ((theta1 - theta0) % TWO_PI + TWO_PI) % TWO_PI;
          const dMinus = dPlus - TWO_PI;
          if (crossing) {
            // Um die Kante auf der Seite, auf der die Kamera gerade steht (kürzester Weg zur Kante).
            const sideTheta = Math.sign(off.x || 1) * Math.PI / 2;
            const rel = ((sideTheta - theta0) % TWO_PI + TWO_PI) % TWO_PI;   // Winkel von theta0 zur Kante, positiv
            dTheta = rel <= dPlus ? dPlus : dMinus;
            sPass = dTheta > 0 ? rel / dTheta : (TWO_PI - rel) / -dTheta;
            // Radius an der Kante: so weit, dass die Kamera mit Abstand an der Wandkante vorbeikommt.
            const clearance = this.wallHalfX + 1.3;
            hump = Math.max(0, clearance - (d0 + (d1 - d0) * sPass));
          } else {
            dTheta = Math.abs(dPlus) <= Math.abs(dMinus) ? dPlus : dMinus;
            hump = 0;
            tween.duration = VIEW_RIDE_MS * 0.55;
          }
        }
        // Radiusverlauf: linear vom Start- zum Zielabstand, dazu eine Ausbuchtung mit
        // Maximum an der Kante, die an beiden Enden auf null ausläuft.
        const bell = hump > 0
          ? (s < sPass ? Math.sin((Math.PI / 2) * s / Math.max(sPass, 1e-3)) : Math.cos((Math.PI / 2) * (s - sPass) / Math.max(1 - sPass, 1e-3)))
          : 0;
        const r = d0 + (d1 - d0) * s + hump * bell;
        const theta = theta0 + dTheta * s;
        const phi = phi0 + (phi1 - phi0) * s;
        look.lerpVectors(lookFrom, endTarget, s);
        this.camera.position.set(
          look.x + r * Math.sin(phi) * Math.sin(theta),
          look.y + r * Math.cos(phi),
          look.z + r * Math.sin(phi) * Math.cos(theta),
        );
        this.camera.lookAt(look);
        this.pivot.lerpVectors(pivotFrom, pivotTo, s);
        this.panScale = panScaleFrom + (1 - panScaleFrom) * s;
      },
      complete: () => {
        this.pivot.copy(pivotTo);
        this.panScale = 1;
        this._pivotArmed = false;
        this.controls.minDistance = this.stateMinDistance();
        this.userInteracted = false;
        this.controls.enabled = true;
        this.placeAtStandardPose();
        this.needsRender = true;
      },
    });
    return delay + VIEW_RIDE_MS;
  }

  toggleOutside() {
    this.setOutside(!this.outsideRequested);
    return this.outsideRequested;
  }


  // Seite anwenden: Home-Richtung und Framing umstellen. Bewegt
  // weder Kamera noch Auswahl; das erledigt die aufrufende Fahrt.
  applyViewSide() {
    this.homeDir.copy(this.outside ? this.outsideDir : this.insideDir);
    if (this.box) this.homeDist = this.computeHomeDistance();
    this.explosionsMasse();
  }

  // Kameramaße der Explosion für die aktuelle Seite: Abstand, mit dem die explodierte Box ins
  // Bild passt (sie darf es fast füllen, die äußersten Ecken sind nur Rahmenenden), und der
  // Mindestabstand vor den Teilen, die der Kamera am nächsten liegen.
  explosionsMasse() {
    if (!this.explodedBox) {
      this.explodeDist = this.homeDist * 1.3;
      return;
    }
    this.explodeDist = this.computeFitDistance(this.explodedBox, 0.92);
    const c = this.explodedCenter;
    const vorn = this.outside ? c.z - this.explodedBox.min.z : this.explodedBox.max.z - c.z;
    this.explodeMinDist = Math.max(MIN_DIST, vorn + 0.15);
    if (this.controls) this.controls.maxDistance = Math.max(this.homeDist * 2.4, this.explodeDist * 1.2);
  }

  resetView() {
    if (this.introPlaying) return;
    this.cancelCameraTweens();
    this.discardMomentum();
    this.userInteracted = false;
    // Explosion und Flügel zuerst zurück: sie bringen ihre eigene Kamerafahrt mit (programmatisch,
    // weil userInteracted gerade zurückgesetzt wurde). Nur wenn danach keine Fahrt läuft, etwa
    // weil nichts offen war oder die Flügelbewegung noch gar nicht begonnen hatte, fährt der
    // Reset selbst zur Home-Pose.
    this.focused = null;
    if (this.exploded) this.setExploded(false);
    if (this.sashMode !== 'closed') this.setSash('closed');
    // Reset-Fahrt nur, wenn keine andere Fahrt läuft. Sie wird VOR dem Drehpunkt-Tween angelegt,
    // damit sie pro Frame nach ihm ausgewertet wird (die Tween-Liste läuft rückwärts) und den
    // aktuellen Drehpunkt sieht; andersherum sähe sie den des Vorframes und der letzte Frame
    // schöbe um den Rest nach. Der Blickpunkt wandert vom aktuellen (inkl. Schwenk) auf den
    // Drehpunkt, so springt der erste Frame nicht.
    if (!this.hasTween('camera') && !this.hasTween('view')) {
      const from = this.camera.position.clone();
      const look = this.controls.target;
      const lookFrom = look.clone();
      // Dauer nach Weg: kleine Korrekturen kurz, weite Fahrten (etwa aus einem Fokus von
      // 0,75 m) länger und mit Sinus-Verlauf, damit die Winkelgeschwindigkeit moderat bleibt.
      const dirFrom = from.clone().sub(lookFrom).normalize();
      const duration = rideDuration(dirFrom, this.homeDir, lookFrom.distanceTo(this.homeTarget), Math.min(from.distanceTo(lookFrom), this.homeDist));
      this.controls.enabled = false;
      this.tween({
        tag: 'camera', duration, ease: easeInOutSine,
        update: (e) => {
          look.lerpVectors(lookFrom, this.pivot, e);
          this.camera.position.lerpVectors(from, this.homePosition(this.homeDist, this.homeDir, this.pivot), e);
          this.constrainPosition(this.camera.position, look);
          this.camera.lookAt(look);
        },
        complete: () => { this.controls.enabled = true; this.settleControls(); this._pivotArmed = false; },
      });
    }
    // Drehpunkt und Kopplung zurück auf die Fenstermitte (löst einen Fokus), unabhängig davon,
    // welche Fahrt die Kamera gerade führt (Explosion, Flügel, Seitenwechsel oder der Reset selbst).
    {
      const pivotFrom = this.pivot.clone();
      const panFrom = this.panScale;
      this.tween({
        tag: 'pivot', duration: RESET_DURATION, ease: easeInOutSine,
        update: (e) => {
          this.pivot.lerpVectors(pivotFrom, this.homeTarget, e);
          this.panScale = panFrom + (1 - panFrom) * e;
        },
        complete: () => { this.pivot.copy(this.homeTarget); this.panScale = 1; this._pivotArmed = false; },
      });
    }
  }

  // ------------------------------------------------------------------
  // Tween-Helfer (ohne Bibliothek)
  tween({ tag = '', duration, delay = 0, ease = easeOutCubic, update, complete }) {
    const t = { tag, duration, delay, ease, update, complete, start: null };
    this.tweens.push(t);
    this.needsRender = true;
    return t;
  }

  hasTween(tag) {
    return this.tweens.some((t) => t.tag === tag);
  }

  killTweens(tag) {
    this.tweens = this.tweens.filter((t) => t.tag !== tag);
  }

  /** @returns {boolean} true, wenn mindestens ein Tween etwas verändert hat */
  updateTweens(now) {
    let any = false;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      if (t.start === null) t.start = now + t.delay;
      if (now < t.start) continue;
      const p = clamp((now - t.start) / t.duration, 0, 1);
      t.update(t.ease(p), p);
      any = true;
      if (p >= 1) {
        this.tweens.splice(i, 1);
        if (t.complete) t.complete();
      }
    }
    return any;
  }

  // ------------------------------------------------------------------
  // Picking
  bindPointer() {
    const c = this.canvas;
    const opts = { signal: this.abort.signal };
    const active = this.activePointers;

    c.addEventListener('pointerdown', (e) => {
      if (e.isPrimary) active.clear();
      active.add(e.pointerId);
      // Nur linke Maustaste / erster Finger zählt als Klick; bei Pinch (2 Finger) kein Klick.
      if (e.button !== 0 || !e.isPrimary || active.size > 1) {
        this.downPos = null;
        return;
      }
      this.downPos = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    }, opts);

    const end = (e) => {
      active.delete(e.pointerId);
      const d = this.downPos;
      if (!d || e.pointerId !== d.id) return;
      this.downPos = null;
      if (e.type === 'pointercancel') return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved < 6 && performance.now() - d.t < 600) this.handleClick(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', end, opts);
    c.addEventListener('pointercancel', end, opts);

    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pendingHover = { x: e.clientX, y: e.clientY };
    }, opts);
    c.addEventListener('pointerleave', () => {
      this.pendingHover = null;
      this.setHovered(null);
    }, opts);
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    if (!hits.length) return null;
    const part = this.partOf(hits[0].object);
    if (!part || !this.isHoverable(part)) return null;
    return { part, point: hits[0].point };
  }

  partOf(obj) {
    let o = obj;
    while (o && o !== this.baugruppe && o !== this.root) {
      if (this.parts.has(o.name)) return o;
      const att = this.attached.find((a) => a.obj === o);
      if (att) return this.parts.get(att.host) || null;
      o = o.parent;
    }
    return null;
  }

  // Objekte für Kontur und Rotstich eines Teils: das Teil plus zugehörige feste Objekte (Rosette).
  outlineObjects(part) {
    if (!part) return [];
    return [part, ...this.attached.filter((a) => a.host === part.name).map((a) => a.obj)];
  }

  handleClick(x, y) {
    if (this.introPlaying) return;
    const hit = this.pick(x, y);
    const now = performance.now();
    const last = this.lastClick;
    this.lastClick = { t: now, x, y, part: hit ? hit.part : null };
    if (!hit) { this.select(null); return; }
    this.select(hit.part, hit.point);
    // Doppelklick / Doppeltipp auf dasselbe Teil: heranzoomen und darum kreisen.
    if (last && last.part === hit.part && now - last.t < 400 && Math.hypot(x - last.x, y - last.y) < 12) {
      this.focusPart(hit.part);
    }
  }

  // Drehpunkt und Kamera weich auf ein Bauteil fahren. Danach kreist und zoomt man um das
  // Teil selbst, so lassen sich auch kleine Teile abseits der Mitte nah betrachten.
  focusPart(part) {
    if (!part || this.introPlaying) return;
    // Solange Explosion oder Flügel noch animieren, bewegen sich die Teile: kein Fokus.
    if (this.hasTween('explode') || this.hasTween('sash') || this.hasTween('view')) return;
    part.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(part);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dist = clamp(size * 2.5, MIN_DIST + 0.05, 3);
    this.killTweens('camera');
    this.killTweens('pivot');
    this.discardMomentum();
    this.focused = part;   // bleibt bis Reset oder Seitenwechsel; Animationen führen den Drehpunkt mit dem Teil
    this.controls.minDistance = MIN_DIST;   // der Drehpunkt ist jetzt das Teil selbst, nah heran erlaubt
    const pivotFrom = this.pivot.clone();
    const panScaleFrom = this.panScale;
    // Blickrichtung relativ zum tatsächlichen Blickpunkt (inkl. Schwenk-Versatz): der
    // erste Frame ist exakt die aktuelle Ansicht. Der Schwenk wird dabei ausgeblendet,
    // damit das Teil nach dem Tween wirklich in der Mitte liegt und dort bleibt.
    const look = this.controls.target;
    const lookFrom = look.clone();
    const dirFrom = this.camera.position.clone().sub(lookFrom).normalize();
    const dStart = this.camera.position.distanceTo(lookFrom);
    // Zielposition vorab an Boden und Wand geprüft, damit die Schranke danach nicht springt.
    const camTo = center.clone().addScaledVector(dirFrom, dist);
    this.constrainPosition(camTo, center);
    const dirTo = camTo.sub(center).normalize();
    // Dauer nach Weg (seitlicher Blickpunkt-Weg relativ zum Abstand) mit Sinus-Verlauf;
    // bei seitlichen Fahrten zwischen zwei Teilen hebt ein kleiner Distanz-Bogen die Kamera
    // zwischendurch etwas ab, das senkt die Winkelgeschwindigkeit im Bild deutlich.
    const travel = lookFrom.distanceTo(center);
    const duration = rideDuration(dirFrom, dirTo, travel, Math.min(dStart, dist));
    const hump = 0.35 * travel;
    this.controls.enabled = false;
    const fahrt = this.tween({
      tag: 'camera', duration, ease: easeInOutSine,
      update: (e) => {
        this.pivot.lerpVectors(pivotFrom, center, e);
        this.panScale = panScaleFrom * (1 - e);
        look.lerpVectors(lookFrom, center, e);
        const dir = this._dirTmp.copy(dirFrom).lerp(dirTo, e).normalize();
        this.camera.position.copy(look).addScaledVector(dir, dStart + (dist - dStart) * e + hump * Math.sin(Math.PI * e));
        // Auch unterwegs vor Wand und Boden bleiben (z. B. Fokuswechsel von der Wandseite her).
        this.constrainPosition(this.camera.position, look);
        this.camera.lookAt(look);
      },
      complete: () => { this.panScale = 0; this.controls.enabled = true; this.settleControls(); this.userInteracted = true; this._pivotArmed = false; },
    });
    fahrt.fokus = true;   // Öffnen und Explosion warten auf diese Fahrt statt sie abzubrechen
  }

  focusByName(name) {
    const part = this.parts.get(name);
    if (part && this.isHoverable(part)) { this.select(part); this.focusPart(part); }
  }

  /** @returns {boolean} true, wenn sich der Hover-Zustand geändert hat */
  setHovered(part, x = NaN, y = NaN) {
    if (part === this.hovered) return false;
    if (this.hovered) this.setEmissive(this.hovered, 0);
    this.hovered = part;
    if (part) this.setEmissive(part, HOVER_EMISSIVE);
    this.syncHoverOutline();
    this.stage.classList.toggle('is-hover', !!part);
    this.onHover(part ? part.name : null, x, y);
    this.needsRender = true;
    return true;
  }

  // Dünne Hover-Kontur nur für ein gehovertes, nicht ausgewähltes Teil.
  syncHoverOutline() {
    if (!this.hoverOutline) return;
    const part = this.hovered && this.hovered !== this.selected ? this.hovered : null;
    this.hoverOutline.selectedObjects = this.outlineObjects(part);
  }

  setEmissive(part, intensity) {
    const apply = (o) => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      o.material.emissive.copy(BRAND);
      o.material.emissiveIntensity = intensity;
    };
    for (const o of this.outlineObjects(part)) o.traverse(apply);
  }

  // ------------------------------------------------------------------
  // Auswahl + Tooltip-Anker
  select(part, worldPoint = null) {
    this.selected = part;
    if (this.outline) this.outline.selectedObjects = this.outlineObjects(part);
    this.syncHoverOutline();
    this.stage.classList.toggle('has-selection', !!part);
    this.needsRender = true;

    if (!part) {
      this.anchorLocal = null;
      this.onSelect(null);
      return;
    }
    part.updateWorldMatrix(true, false);
    const wp = worldPoint ? worldPoint.clone() : this.defaultAnchor(part);
    this.anchorLocal = part.worldToLocal(wp);
    this.lastAnchor = { x: NaN, y: NaN, visible: false };
    this.onSelect(this.describe(part));
    this.updateAnchor();
  }

  selectByName(name) {
    const part = this.parts.get(name);
    if (!part || !this.isHoverable(part)) return;
    this.select(part);
  }

  // Anker: Mitte der Vorderseite (Raumseite, +z) des Bauteils.
  defaultAnchor(part) {
    const box = new THREE.Box3().setFromObject(part);
    const c = box.getCenter(new THREE.Vector3());
    c.z = box.max.z;
    return c;
  }

  updateAnchor() {
    if (!this.selected || !this.anchorLocal) return;
    const p = this.selected.localToWorld(this.anchorLocal.clone()).project(this.camera);
    const x = (p.x * 0.5 + 0.5) * this.width;
    const y = (-p.y * 0.5 + 0.5) * this.height;
    const visible = p.z < 1;
    const last = this.lastAnchor;
    if (Math.abs(x - last.x) > 0.3 || Math.abs(y - last.y) > 0.3 || visible !== last.visible) {
      this.lastAnchor = { x, y, visible };
      this.onAnchor(this.lastAnchor);
    }
  }

  describe(part) {
    const meta = this.modell.teile[part.name] || {};
    const category = meta.category || 'ersatzteile';
    return {
      name: part.name,
      label: meta.label || part.userData.label || part.name,
      info: meta.info || part.userData.info || '',
      category,
      categoryLabel: meta.categoryLabel || 'Passende Ersatzteile',
      group: this.modell.gruppen[category] || 'Weitere Teile',
      url: SHOP_BASE + category,
    };
  }

  // Anklickbar ist, was der Modelleintrag (`hover`) oder sonst das GLB (userData.hover) so nennt.
  isHoverable(obj) {
    const meta = this.modell.teile[obj.name];
    if (meta && typeof meta.hover === 'boolean') return meta.hover;
    return obj.userData.hover === true;
  }

  // Alle anklickbaren Bauteile, die das geladene Modell tatsächlich enthält.
  getParts() {
    const reihe = this.modell.reihenfolge;
    const idx = (n) => { const i = reihe.indexOf(n); return i < 0 ? reihe.length : i; };
    return this.baugruppe.children
      .filter((o) => this.isHoverable(o))
      .sort((a, b) => idx(a.name) - idx(b.name) || a.name.localeCompare(b.name))
      .map((o) => this.describe(o));
  }
}

// Fläche mit Himmel-Verlauf in der Wandöffnung (innerhalb der Wanddicke),
// damit sie nur durch das Fenster sichtbar ist und nie über die Wandkante ragt.
// Objekt (Position + Rotation) mit der Drehung `q` um den Punkt `point` weiterdrehen.
function rotateAbout(obj, q, point) {
  obj.position.sub(point).applyQuaternion(q).add(point);
  obj.quaternion.premultiply(q);
}

// Dauer einer Kamerafahrt nach Weg: Richtungsänderung (rad) plus seitlicher Weg des
// Blickpunkts relativ zum Abstand. Kurze Korrekturen bleiben knackig, weite Fahrten aus
// der Nähe werden gestreckt, damit die Winkelgeschwindigkeit im Bild moderat bleibt.
function rideDuration(dirFrom, dirTo, travel, standoff) {
  const turn = Math.acos(clamp(dirFrom.dot(dirTo), -1, 1));
  const psi = turn + travel / Math.max(standoff, 0.3);
  return clamp(450 + 350 * psi, RESET_DURATION, 1400);
}

// Spindel (Drehachse) des Griffs, lokal zu "Fenster". Reihenfolge: Custom Property `pivot`
// [x, y, z] aus Blender, sonst der Objektursprung, falls er nicht im Fenster-Ursprung liegt,
// sonst aus der Geometrie: der Hals zwischen Rosette und Griffstange ist ein enger
// Vertex-Ring, also das 2-mm-Höhenband mit den meisten Vertices.
function deriveHandlePivot(handle, fenster) {
  const p = handle.userData.pivot;
  if (Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) return new THREE.Vector3(p[0], p[1], p[2]);
  if (handle.position.lengthSq() > 1e-8) return handle.position.clone();
  handle.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(handle);
  const binSize = 0.002;
  const counts = new Map();
  const v = new THREE.Vector3();
  handle.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const b = Math.floor((v.y - box.min.y) / binSize);
      counts.set(b, (counts.get(b) || 0) + 1);
    }
  });
  let best = 0;
  let bestN = -1;
  for (const [b, n] of counts) if (n > bestN) { bestN = n; best = b; }
  // z der Spindel: mittlere Tiefe der Ring-Vertices (dort sitzt die Stange auf der Rosette).
  const yLo = box.min.y + best * binSize;
  const yHi = yLo + binSize;
  let zSum = 0;
  let zN = 0;
  handle.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y >= yLo && v.y < yHi) { zSum += v.z; zN++; }
    }
  });
  const world = new THREE.Vector3((box.min.x + box.max.x) / 2, (yLo + yHi) / 2, zN ? zSum / zN : (box.min.z + box.max.z) / 2);
  return fenster.worldToLocal(world);
}


// `opening`: { min, max: Vector2 in der Innenwand-Ebene, faceZ }. Der Himmel wird nur
// dort gezeichnet, wo der Sehstrahl die Innenwand-Ebene innerhalb der Öffnung schneidet.
// `verlauf`: { bottom, top } — Höhenbereich (Welt-y), über den der Farbverlauf läuft; ohne
// Angabe ist es die Fläche selbst. Darüber und darunter setzt sich die Randfarbe fort.
function makeSkyBackdrop(center, size, z, opening, verlauf = null) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#79b0e3');
  g.addColorStop(0.55, '#c6dff3');
  g.addColorStop(1, '#eef4f8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (verlauf) {
    // Die Fläche kann höher sein als der Verlaufsbereich: Textur so skalieren und
    // verschieben, dass 0…1 genau auf [bottom, top] liegt (ClampToEdge ist Standard).
    const spanne = Math.max(verlauf.top - verlauf.bottom, 1e-3);
    tex.repeat.y = size.y / spanne;
    tex.offset.y = (center.y - size.y / 2 - verlauf.bottom) / spanne;
  }
  const material = new THREE.MeshBasicMaterial({ map: tex });
  // Nur durch die Öffnung sichtbar: Fragmente, deren Sehstrahl (Kamera zu Fragment) die
  // Innenwand-Ebene außerhalb des Öffnungsrechtecks schneidet, werden verworfen. So darf
  // die Fläche groß bleiben (schräge Blicke durch die Öffnung treffen immer Himmel), ohne
  // dass sie über die Wandoberkante oder seitlich an der Wandscheibe vorbei zu sehen ist.
  if (opening) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uOpenMin = { value: opening.min };
      shader.uniforms.uOpenMax = { value: opening.max };
      shader.uniforms.uFaceZ = { value: opening.faceZ };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkyWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSkyWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkyWorld;\nuniform vec2 uOpenMin;\nuniform vec2 uOpenMax;\nuniform float uFaceZ;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  {
    vec3 ray = vSkyWorld - cameraPosition;
    if (ray.z >= 0.0 || cameraPosition.z <= uFaceZ) discard;   // nur von innen, vor der Innenwand
    float t = (uFaceZ - cameraPosition.z) / ray.z;
    vec2 q = cameraPosition.xy + ray.xy * t;
    if (q.x < uOpenMin.x || q.x > uOpenMax.x || q.y < uOpenMin.y || q.y > uOpenMax.y) discard;
  }`);
    };
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), material);
  mesh.position.set(center.x, center.y, z);
  mesh.name = 'Himmel';
  return mesh;
}

// Explosionsversatz aus `mount` und Lage relativ zur Fenstermitte (c = Teilmitte minus Fenstermitte).
function mountOffset(mount, c, hardware = false) {
  if (mount === 'sash') {
    if (!hardware) return MOUNT_OFFSETS.sash;
    // Flügelbeschlag zur jeweils eigenen Seite (Griffseite bzw. Bandseite) versetzen.
    const h = MOUNT_OFFSETS.sashHardware;
    return [Math.sign(c.x || 1) * h[0], 0, h[2]];
  }
  if (mount === 'hinge') {
    const h = hardware ? MOUNT_OFFSETS.hingeHardware : MOUNT_OFFSETS.hinge;
    return [Math.sign(c.x || -1) * h[0], 0, h[2]];
  }
  if (mount === 'frame') {
    const s = MOUNT_OFFSETS.frameSpread;
    return Math.abs(c.x) > Math.abs(c.y) ? [Math.sign(c.x) * s, 0, 0] : [0, Math.sign(c.y) * s, 0];
  }
  return [0, 0, 0];
}

// Öffnung in der Wand als Box3 (x/y), abgeleitet aus den Wand-Vertices nahe den Fensterkanten:
// die Laibungskanten liegen knapp innerhalb des Fenster-Außenmaßes. Fällt nichts Passendes
// an, gilt das Fenstermaß.
function deriveOpening(wall, fensterBox) {
  const v = new THREE.Vector3();
  const tol = 0.05;
  const near = { xMin: [], xMax: [], yMin: [], yMax: [] };
  wall.updateWorldMatrix(true, false);
  wall.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.x - fensterBox.min.x) < tol) near.xMin.push(v.x);
      if (Math.abs(v.x - fensterBox.max.x) < tol) near.xMax.push(v.x);
      if (Math.abs(v.y - fensterBox.min.y) < tol) near.yMin.push(v.y);
      if (Math.abs(v.y - fensterBox.max.y) < tol) near.yMax.push(v.y);
    }
  });
  const box = fensterBox.clone();
  if (near.xMin.length && near.xMax.length && near.yMin.length && near.yMax.length) {
    // Innerste Kanten: an der Min-Seite der größte, an der Max-Seite der kleinste Wert.
    box.min.x = Math.max(...near.xMin);
    box.max.x = Math.min(...near.xMax);
    box.min.y = Math.max(...near.yMin);
    box.max.y = Math.min(...near.yMax);
  }
  return box;
}

// Flächen eines Meshes, für die `pick(cx, cy, normal)` wahr ist, in ein eigenes Mesh abtrennen;
// cx und cy sind der Schwerpunkt des Dreiecks in Weltkoordinaten. Position, Schatten und Name
// folgen dem Original. Liefert null, wenn es nichts abzutrennen gibt.
function splitFaces(mesh, pick) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  mesh.updateWorldMatrix(true, false);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const reveal = [];
  const rest = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    n.copy(b).sub(a).cross(c.sub(a)).normalize();
    (pick(cx, cy, n) ? reveal : rest).push(i0, i1, i2);
  }
  if (!reveal.length || !rest.length) return null;
  const revealGeo = geo.clone();
  revealGeo.setIndex(reveal);
  revealGeo.computeBoundingSphere();
  const restGeo = geo.clone();
  restGeo.setIndex(rest);
  restGeo.computeBoundingSphere();
  mesh.geometry = restGeo;
  const out = new THREE.Mesh(revealGeo, mesh.material);
  out.name = `${mesh.name}_Seiten`;
  out.position.copy(mesh.position);
  out.quaternion.copy(mesh.quaternion);
  out.scale.copy(mesh.scale);
  out.castShadow = mesh.castShadow;
  out.receiveShadow = mesh.receiveShadow;
  return out;
}

// Texturwiederholungen pro Meter auf den Hauptflächen (|n.z| > 0.5) eines Wand-Meshes, als
// Median über die Dreieckskanten. Ohne Texturkoordinaten 1.
function textureDensity(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const index = geo.index;
  if (!uv) return 1;
  mesh.updateWorldMatrix(true, false);
  const triCount = index ? index.count / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3();
  const ua = new THREE.Vector2(), ub = new THREE.Vector2();
  const ratios = [];
  for (let tri = 0; tri < triCount; tri++) {
    const i0 = index ? index.getX(tri * 3) : tri * 3;
    const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
    const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
    n.copy(b).sub(a).cross(t.copy(c).sub(a)).normalize();
    if (Math.abs(n.z) < 0.5) continue;
    const d = a.distanceTo(b);
    if (d < 1e-4) continue;
    ua.fromBufferAttribute(uv, i0);
    ub.fromBufferAttribute(uv, i1);
    ratios.push(ua.distanceTo(ub) / d);
  }
  if (!ratios.length) return 1;
  ratios.sort((x, y) => x - y);
  return ratios[ratios.length >> 1];
}

// Texturkoordinaten eines Meshes neu als ebene Projektion setzen (je Dreieck entlang seiner
// Hauptachse) mit `density` Texturwiederholungen pro Meter. Für schmale Flächen wie Laibungen
// und Stirnseiten, deren Koordinaten im Modell gedehnt sind. Das Mesh muss in der Szene hängen.
function planarUVs(mesh, density) {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geo.attributes.position;
  const uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3();
  const p = [a, b, c];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, i + 2).applyMatrix4(mesh.matrixWorld);
    n.copy(b).sub(a).cross(t.copy(c).sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const alongX = ax >= ay && ax >= az;
    const alongY = !alongX && ay >= az;
    for (let k = 0; k < 3; k++) {
      const q = p[k];
      uv.setXY(i + k, (alongX ? q.z : q.x) * density, (alongY ? q.z : q.y) * density);
    }
  }
  geo.setAttribute('uv', uv);
  geo.computeBoundingSphere();
  mesh.geometry = geo;
  const map = mesh.material && mesh.material.map;
  if (map) { map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; }
}

// Weißer Kunststoff (PVC-Profile) als leicht glänzendes Material: der Clearcoat
// gibt Reflexe aus der Umgebung, dadurch setzen sich die Profile von der matten
// Wand ab. Übernimmt alle Werte des GLB-Materials (inkl. Emissive für Hover).
function upgradePlastic(mat) {
  if (!mat || mat.name !== 'Kunststoff_Weiss') return mat;
  const pm = new THREE.MeshPhysicalMaterial();
  // Nur die Standard-Eigenschaften übernehmen: MeshPhysicalMaterial.copy() würde
  // Clearcoat-Felder vom Quellmaterial lesen, die ein StandardMaterial nicht hat.
  THREE.MeshStandardMaterial.prototype.copy.call(pm, mat);
  pm.roughness = Math.min(mat.roughness, 0.28);
  pm.clearcoat = 0.4;
  pm.clearcoatRoughness = 0.25;
  return pm;
}

// Fensterbank: eigenes, mattes Dekor mit feiner Struktur (siehe SILL_COLOR). Übernimmt vom
// GLB-Material nur, was für Hover nötig wäre (Emissive gibt es im Standard-Material ohnehin).
function makeSillMaterial(mat) {
  const m = new THREE.MeshStandardMaterial({
    color: SILL_COLOR,
    roughness: 0.85,
    metalness: 0,
    map: makeGrainTexture(),
  });
  m.name = mat && mat.name ? mat.name : 'Fensterbank';
  return m;
}

// Feines, leicht weichgezeichnetes Rauschen als Struktur-Textur (kein sichtbares Muster).
// Kachelbar, mit Mipmaps, damit es aus der Distanz zu einer glatten Fläche wird.
function makeGrainTexture(size = 256, amount = 0.07) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  let seed = 20260906;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(255 * (1 - amount * rnd()));
    d[i] = g; d[i + 1] = g; d[i + 2] = g; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Ein Pixel weichzeichnen: aus Salz-und-Pfeffer wird eine feine Körnung.
  ctx.filter = 'blur(1px)';
  ctx.drawImage(c, 0, 0);
  ctx.filter = 'none';
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Echtes Glas statt der 12 %-Alpha-Variante aus dem GLB.
function makeGlassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xeaf6f3,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 0.03,
    ior: 1.52,
    attenuationColor: new THREE.Color(0xcfeee6),
    attenuationDistance: 0.6,
    specularIntensity: 1,
    envMapIntensity: 1.2,
    side: THREE.FrontSide,
  });
}
