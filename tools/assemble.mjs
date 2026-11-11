#!/usr/bin/env node
// Stellt den Upload-Ordner für das Weblaufwerk zusammen (wird von pc/build.ps1 und von den Tests benutzt):
//
//   www/            Web-Ordner der (Sub-)Domain
//     index.html    unsere App (Spielen, Spielstände, Spieldaten, Cheats, Admin, Diagnose)
//     game.html     die Spielseite von fnv-web-recomp, ergänzt um addons.js (randlos, Menü, Cheats)
//     build/, shader/, …   der Build aus der eigenen Spielkopie
//     fs.php, api.php, lib.php, .htaccess, fs-config.php
//   fnv-private/.htpasswd   nur beim ersten Mal: Zugang "admin" mit dem Startpasswort
//
// node tools/assemble.mjs --recomp <out/dist> --app <dist> --out <upload> --server-base </www/htdocs/w0123456>
//                         [--web-folder fnv-www] [--dlc] [--init-private] [--ipad-build <web_browser_ipad>]
//
// --ipad-build:  zweiter Emscripten-Build mit weniger Threads/Speicher (pc/build.ps1) -> build-ipad/ + game-ipad.html
//
// --server-base: ABSOLUTER Pfad auf dem Server (wie PHP/Apache ihn sehen), unter dem fnv-private/ usw. liegen.
//                Nur die .htaccess braucht ihn (AuthUserFile). Bei all-inkl: /www/htdocs/<account>/<FTP-Startordner>.
// --web-folder:  Ordner der (Sub-)Domain relativ dazu ('' = die Domain zeigt direkt auf server-base).
// fs-config.php rechnet alle Pfade selbst relativ zu ihrem eigenen Ordner aus (__DIR__) – unabhängig vom FTP-Pfad.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(n);

const recomp = opt('--recomp');
const appDist = path.resolve(opt('--app', path.join(REPO, 'dist')));
const out = path.resolve(opt('--out', 'upload'));
const base = (opt('--server-base') || opt('--remote-base') || '').replace(/\/+$/, '');
const webFolder = (opt('--web-folder', '') || '').replace(/^\/+|\/+$/g, '');
if (webFolder.includes('..')) fail('--web-folder darf kein .. enthalten');
if (!recomp || !fs.existsSync(path.join(recomp, 'index.html'))) fail('--recomp <Ordner mit index.html von recomp_bundle.py> fehlt');
if (!fs.existsSync(path.join(appDist, 'index.html'))) fail(`App-Build fehlt (${appDist}): erst "npm run build"`);
if (!base.startsWith('/') || base === '') fail('--server-base <absoluter Server-Pfad, z. B. /www/htdocs/w0123456> fehlt');

const www = path.join(out, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

// 1) Spiel-Build; seine Startseite wird zu game.html
fs.cpSync(recomp, www, { recursive: true });
for (const ext of ['', '.gz', '.br']) fs.rmSync(path.join(www, 'index.html' + ext), { force: true });
let game = fs.readFileSync(path.join(recomp, 'index.html'), 'utf8');
if (!game.includes('</body>')) fail('index.html des Spiels hat kein </body>');
// Werbeskript der öffentlichen Seite: auf dem privaten Server nicht laden (Datenschutz; COEP blockt es ohnehin)
game = game.replace(/<script[^>]*adsbygoogle[\s\S]*?<\/script>\s*/g, '');
game = game.replace('</body>', '<script src="addons.js"></script>\n</body>');
// Einstellungen für die Engine, bevor sie startet (FNV_* in der Adresse haben weiter Vorrang):
// - fonvLocal: der Datenmanager hat das Spiel aufs Gerät geladen und sw.js liefert es aus
// - Block-Cache der Engine (FNV_FS_CACHE_MB, Standard 256): vom Gerät gelesen braucht es ihn kaum -> 32 MB; das gibt
//   dem Spiel über 200 MB mehr vom festen Speicher (sonst "OOM" beim Laden der Welt). Gestreamt 128, iPad-Variante 64.
const patch = (from, to, what) => {
  if (!game.includes(from)) fail(`game.html: ${what} nicht gefunden – Spielseite hat sich geändert, tools/assemble.mjs anpassen`);
  game = game.replace(from, to);
};
patch('<script src="precheck.js"></script>', `<script>
window.fonvLocal = (function () { try { return localStorage.getItem('fonv.offline') === '1' && !!(navigator.serviceWorker && navigator.serviceWorker.controller); } catch (e) { return false; } })();
window.fonvEnv = { FNV_FS_CACHE_MB: window.fonvLocal ? '32' : '__STREAM_CACHE__' };
// iPad-Variante (fonvLite, unten gesetzt): sparsame Spiel-Einstellungen über FNV_INI der Engine; abschaltbar mit
// localStorage fonv.lite = 0. Die kleinere Auflösung nur, solange die automatische Qualität keine eigene gewählt hat.
try {
  if (window.fonvLite && localStorage.getItem('fonv.lite') !== '0')
    window.fonvEnv.FNV_INI = window.fonvLite + (+(localStorage.getItem('fnv.tuner.res') || 0) ? '' : ';iSize W:Display=960;iSize H:Display=540');
} catch (e) { /* privater Modus */ }
</script>
<script src="precheck.js"></script>`, 'precheck.js');
// iPad-Variante: immer die kleinen Archive. Die iPad-Grafik kann die komprimierten Texturen nicht direkt nutzen
// (kein BC), sie werden entpackt und brauchen ein Vielfaches an Speicher – mit "High" schließt iPadOS den Tab.
patch("const qualityParam = query.get('quality') ||", "const qualityParam = query.get('quality') || window.fonvQuality ||", 'Qualität');
// Chat der öffentlichen Seite: auf dem privaten Server nicht laden (die Reiter blendet addons.js aus)
game = game.replace(/<script src="chat\.js"><\/script>\s*/, '');
// Seiten der öffentlichen Website (Impressum, Werbung …) gehören nicht auf den privaten Server
for (const f of ['about.html', 'contact.html', 'how-to-play.html', 'privacy.html', 'terms.html', 'chat.js'])
  for (const ext of ['', '.br', '.gz']) fs.rmSync(path.join(www, f + ext), { force: true });
patch('const env = {};', 'const env = Object.assign({}, window.fonvEnv);', 'env');
patch("MB downloaded` + (boot.file", "MB ${window.fonvLocal ? 'vom Gerät geladen' : 'downloaded'}` + (boot.file", 'Ladeanzeige');
// Geräte-Check der Spielseite: mit Daten vom Gerät weder die Leitung messen noch vor langsamer Verbindung warnen
{
  const f = path.join(www, 'precheck.js');
  let pc = fs.readFileSync(f, 'utf8');
  for (const [from, to] of [
    ["const measured = query.get('start') ? null :", "const measured = (window.fonvLocal || query.get('start')) ? null :"],
    ['if (info.mbps < 0.6) warn(', 'if (!window.fonvLocal && info.mbps < 0.6) warn('],
    ['if (info.rttMs > 400) warn(', 'if (!window.fonvLocal && info.rttMs > 400) warn('],
  ]) {
    if (!pc.includes(from)) fail(`precheck.js: "${from}" nicht gefunden – tools/assemble.mjs anpassen`);
    pc = pc.replace(from, to);
  }
  fs.writeFileSync(f, pc);
  for (const ext of ['.br', '.gz']) fs.rmSync(f + ext, { force: true });   // sonst liefert der Server die alte Fassung
}
// Sparsame Einstellungen der iPad-Variante ("Schlüssel:Abschnitt=Wert", FNV_INI in port/recomp/pal_kernel.cpp).
// Protokoll vom iPad: der Tab wurde mitten im Spiel geschlossen bzw. die Grafikeinheit fiel aus (createBindGroup
// scheitert, "popErrorScope failed") – der Grafikspeicher reicht dort nicht für die PC-Standardwerte, weil Texturen
// ohne BC-Kompression entpackt werden (4–8-facher Speicher). Deshalb: halbe Texturauflösung, keine Figurenschatten,
// kürzere Ladedistanzen, weniger zwischengespeicherte Gebiete. Nicht angefasst: HDR, Wasser an/aus, Kantenglättung
// (andere Shader-Wege) und uGridsToLoad (Spielstände). Sichtweite und Gras regelt die automatische Qualität (tuner.js).
const LITE_INI = [
  'iTexMipMapSkip:Display=1', 'iMaxDecalsPerFrame:Display=2', 'iActorShadowCountInt:Display=0', 'iActorShadowCountExt:Display=0',
  'iShadowMapResolution:Display=256', 'fSpecularLODStartFade:Display=200', 'fShadowLODStartFade:Display=100',
  'fLightLODStartFade:Display=200', 'fDecalLOD1:Display=500', 'fDecalLOD2:Display=1000',
  'fTreeLoadDistance:TerrainManager=0', 'fBlockLoadDistanceLow:TerrainManager=25000', 'fBlockLoadDistance:TerrainManager=125000',
  'fSplitDistanceMult:TerrainManager=0.75', 'fHighBlockLoadDistanceLow:TerrainManager=20000',
  'iWaterReflectWidth:Water=256', 'iWaterReflectHeight:Water=256',
  'uInterior Cell Buffer:General=1', 'uExterior Cell Buffer:General=12', 'bPreemptivelyUnloadCells:General=1',
  'iPreloadSizeLimit:General=8388608', 'bSelectivePurgeUnusedOnFastTravel:General=1',
].join(';');
const page = (cache) => game.replace('__STREAM_CACHE__', cache);
fs.writeFileSync(path.join(www, 'game.html'), page('128'));
const ipad = opt('--ipad-build');
if (ipad) {
  if (!fs.existsSync(path.join(ipad, 'fnv_web.wasm'))) fail(`--ipad-build: ${ipad}/fnv_web.wasm fehlt`);
  if (!game.includes("'/build/fnv_web.js'")) fail("game.html lädt nicht mehr '/build/fnv_web.js' – iPad-Seite anpassen");
  fs.mkdirSync(path.join(www, 'build-ipad'));
  // vorkomprimierte Fassungen (die .htaccess liefert sie aus; 95 MB -> ~14 MB), einmal neben dem Build gemerkt
  for (const f of ['fnv_web.js', 'fnv_web.wasm']) {
    const src = path.join(ipad, f), mt = fs.statSync(src).mtimeMs;
    const fresh = (x) => fs.existsSync(x) && fs.statSync(x).mtimeMs >= mt;
    if (!fresh(src + '.br')) fs.writeFileSync(src + '.br', zlib.brotliCompressSync(fs.readFileSync(src), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }));
    if (!fresh(src + '.gz')) fs.writeFileSync(src + '.gz', zlib.gzipSync(fs.readFileSync(src), { level: 9 }));
  }
  for (const f of fs.readdirSync(ipad)) if (/^fnv_web\.(js|wasm)(\.(br|gz))?$/.test(f)) fs.copyFileSync(path.join(ipad, f), path.join(www, 'build-ipad', f));
  fs.writeFileSync(path.join(www, 'game-ipad.html'), page('64').replaceAll("'/build/fnv_web.js'", "'/build-ipad/fnv_web.js'")
    .replace('window.fonvEnv = {', `window.fonvQuality = 'low'; window.fonvLite = ${JSON.stringify(LITE_INI)}; window.fonvEnv = {`));
}

// 2) unsere App (überschreibt nichts vom Spiel außer index.html)
for (const f of fs.readdirSync(appDist)) {
  fs.cpSync(path.join(appDist, f), path.join(www, f), { recursive: true });
}

// 3) Server-Dateien
for (const f of ['fs.php', 'api.php', 'lib.php', 'check.php']) fs.copyFileSync(path.join(REPO, 'hosting', f), path.join(www, f));
const priv = `${base}/fnv-private`;
fs.writeFileSync(path.join(www, '.htaccess'),
  fs.readFileSync(path.join(REPO, 'hosting', 'htaccess.txt'), 'utf8').replace('__HTPASSWD__', `${priv}/.htpasswd`));
const php = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const up = webFolder ? webFolder.split('/').map(() => '/..').join('') : '';
fs.writeFileSync(path.join(www, 'fs-config.php'), `<?php
// erzeugt von tools/assemble.mjs – Pfade relativ zu diesem Ordner, damit sie zum Server passen
$base = realpath(__DIR__ . ${php(up)}) ?: __DIR__ . ${php(up)};
return [
    'game'    => $base . '/fnv-game',
    'data'    => $base . '/fnv-data',
    'mobile'  => $base . '/fnv-mobile',
    'cache'   => $base . '/fnv-cache',
    'private' => $base . '/fnv-private',
    'dlc'     => ${flag('--dlc') ? 'true' : 'false'},
];
`);

// 4) Liste der App-Dateien für den Offline-Betrieb (Datenmanager, sw.js); "version" ändert sich mit jedem Inhalt
const offline = [];
const hash = crypto.createHash('sha1');
const walk = (dir, rel) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { walk(path.join(dir, e.name), r); continue; }
    if (/\.(php|br|gz|map)$/.test(e.name) || e.name.startsWith('.')) continue;
    offline.push(r);
    hash.update(r + '\0').update(fs.readFileSync(path.join(dir, e.name)));
  }
};
walk(www, '');
fs.writeFileSync(path.join(www, 'offline.json'), JSON.stringify({ version: hash.digest('hex').slice(0, 16), files: offline }));

// 5) beim ersten Hochladen: Startzugang
if (flag('--init-private')) {
  fs.mkdirSync(path.join(out, 'fnv-private'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'hosting', 'initial-admin.htpasswd.txt'), path.join(out, 'fnv-private', '.htpasswd'));
}
console.log(`fertig: ${out}`);

function fail(msg) { console.error('assemble: ' + msg); process.exit(2); }
