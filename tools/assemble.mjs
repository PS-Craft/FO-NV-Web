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
//                         [--web-folder fnv-www] [--dlc] [--init-private]
//
// --server-base: ABSOLUTER Pfad auf dem Server (wie PHP/Apache ihn sehen), unter dem fnv-private/ usw. liegen.
//                Nur die .htaccess braucht ihn (AuthUserFile). Bei all-inkl: /www/htdocs/<account>/<FTP-Startordner>.
// --web-folder:  Ordner der (Sub-)Domain relativ dazu ('' = die Domain zeigt direkt auf server-base).
// fs-config.php rechnet alle Pfade selbst relativ zu ihrem eigenen Ordner aus (__DIR__) – unabhängig vom FTP-Pfad.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
game = game.replace('</body>', '<script src="addons.js"></script>\n</body>');
fs.writeFileSync(path.join(www, 'game.html'), game);

// 2) unsere App (überschreibt nichts vom Spiel außer index.html)
for (const f of fs.readdirSync(appDist)) {
  if (f === 'sw.js') continue;                       // auf dem eigenen Server kein Service Worker
  fs.cpSync(path.join(appDist, f), path.join(www, f), { recursive: true });
}

// 3) Server-Dateien
for (const f of ['fs.php', 'api.php', 'lib.php']) fs.copyFileSync(path.join(REPO, 'hosting', f), path.join(www, f));
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

// 4) beim ersten Hochladen: Startzugang
if (flag('--init-private')) {
  fs.mkdirSync(path.join(out, 'fnv-private'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'hosting', 'initial-admin.htpasswd.txt'), path.join(out, 'fnv-private', '.htpasswd'));
}
console.log(`fertig: ${out}`);

function fail(msg) { console.error('assemble: ' + msg); process.exit(2); }
