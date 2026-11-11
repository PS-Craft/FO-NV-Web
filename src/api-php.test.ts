// Tests für hosting/api.php (App-Schnittstelle) zusammen mit hosting/fs.php (Spielstände pro Benutzer, DLC-Schalter).
// Läuft gegen "php -S" mit einer Fake-Installation – keine Spieldaten.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAS_PHP = spawnSync('php', ['-v']).status === 0;
const HOSTING = path.resolve(__dirname, '..', 'hosting');
const PORT = 18196;
const BASE = `http://127.0.0.1:${PORT}`;
const enc = encodeURIComponent;

function put(p: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
const bcrypt = (pw: string) =>
  spawnSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_BCRYPT);', pw], { encoding: 'utf8' }).stdout;
const auth = (u: string, p: string) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

describe.skipIf(!HAS_PHP)('hosting/api.php', () => {
  let tmp = '';
  let proc: ChildProcess;
  let priv = '';
  let adminPw = 'Start-Passwort-123';

  const call = async (user: [string, string] | null, route: string, body?: unknown, raw?: Buffer | string) => {
    const headers: Record<string, string> = {};
    if (user) headers.authorization = auth(...user);
    const post = body !== undefined || raw !== undefined;
    if (post) headers['x-fonv'] = '1';
    const r = await fetch(`${BASE}/api/${route}`, {
      method: post ? 'POST' : 'GET',
      headers,
      body: (raw !== undefined ? (typeof raw === 'string' ? raw : new Uint8Array(raw)) : body !== undefined ? JSON.stringify(body) : undefined) as BodyInit | undefined,
    });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, json: type.includes('json') ? await r.json() : null, buf: type.includes('json') ? Buffer.alloc(0) : Buffer.from(new Uint8Array(await r.arrayBuffer())), headers: r.headers };
  };
  const fsCall = (user: [string, string], url: string, init: RequestInit = {}) =>
    fetch(BASE + url, { ...init, headers: { authorization: auth(...user) } });

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv-api-'));
    const game = path.join(tmp, 'game');
    put(path.join(game, 'FalloutNV.exe'), 'fake');
    put(path.join(game, 'Data', 'FalloutNV.esm'), 'esm');
    put(path.join(game, 'Data', 'DeadMoney.esm'), 'dm');
    put(path.join(game, 'Data', 'DeadMoney.nam'), '');
    put(path.join(game, 'Data', 'HonestHearts.esm'), 'hh');
    put(path.join(game, 'Data', 'HonestHearts.nam'), '');
    priv = path.join(tmp, 'private');
    // so wie nach dem ersten Hochladen: nur "admin" mit Startpasswort, keine users.json
    put(path.join(priv, '.htpasswd'), `admin:${bcrypt(adminPw)}\n`);
    const root = path.join(tmp, 'www');
    fs.mkdirSync(root);
    for (const f of ['fs.php', 'lib.php', 'api.php', 'dev-router.php']) fs.copyFileSync(path.join(HOSTING, f), path.join(root, f));
    // dev-router um /api/ ergänzen (wie die .htaccess)
    fs.writeFileSync(
      path.join(root, 'dev-router.php'),
      `<?php $p = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/fs/([a-z]+)$#', $p, $m)) { $_GET['op'] = $m[1]; require __DIR__ . '/fs.php'; return true; }
if (preg_match('#^/api/([a-z/]+)$#', $p, $m)) { $_GET['r'] = $m[1]; require __DIR__ . '/api.php'; return true; }
return false;`,
    );
    fs.writeFileSync(
      path.join(root, 'fs-config.php'),
      `<?php return ['game' => '${game}', 'data' => '${tmp}/data', 'cache' => '${tmp}/cache', 'private' => '${priv}', 'dlc' => true];\n`,
    );
    proc = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root, path.join(root, 'dev-router.php')], { stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(BASE + '/api/me');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
  afterAll(() => {
    proc?.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('ohne Anmeldung: nur /me, sonst 401', async () => {
    expect((await call(null, 'me')).json).toMatchObject({ user: null, admin: false });
    expect((await call(null, 'saves')).status).toBe(401);
    expect((await call(['admin', 'falsch'], 'saves')).status).toBe(401);
    expect((await fetch(`${BASE}/fs/index`)).status).toBe(401);
  });

  it('Startpasswort: admin ist Admin und muss das Passwort ändern', async () => {
    const me = (await call(['admin', adminPw], 'me')).json;
    expect(me).toMatchObject({ user: 'admin', admin: true, mustChangePassword: true, zip: true });
  });

  it('Passwort ändern: altes muss stimmen, neues mind. 8 Zeichen und anders', async () => {
    const a: [string, string] = ['admin', adminPw];
    expect((await call(a, 'account/password', { current: 'falsch', password: 'Neues-Passwort-1' })).status).toBe(403);
    expect((await call(a, 'account/password', { current: adminPw, password: 'kurz' })).status).toBe(400);
    expect((await call(a, 'account/password', { current: adminPw, password: adminPw })).status).toBe(400);
    expect((await call(a, 'account/password', { current: adminPw, password: 'Neues-Passwort-1' })).json).toEqual({ ok: true });
    expect((await call(a, 'me')).json.user).toBe(null); // altes geht nicht mehr
    adminPw = 'Neues-Passwort-1';
    expect((await call(['admin', adminPw], 'me')).json).toMatchObject({ user: 'admin', admin: true, mustChangePassword: false });
  });

  it('POST ohne App-Kennung wird abgelehnt (Schutz vor fremden Seiten)', async () => {
    const r = await fetch(`${BASE}/api/backups/create`, {
      method: 'POST',
      headers: { authorization: auth('admin', adminPw) },
      body: '{}',
    });
    expect(r.status).toBe(403);
  });

  it('Admin-Center: Benutzer anlegen, Rechte, Passwort zurücksetzen, löschen', async () => {
    const a: [string, string] = ['admin', adminPw];
    expect((await call(a, 'admin/users/add', { user: 'bad name!', password: 'Passwort-123' })).status).toBe(400);
    expect((await call(a, 'admin/users/add', { user: 'lisa', password: 'kurz' })).status).toBe(400);
    expect((await call(a, 'admin/users/add', { user: 'lisa', password: 'Lisa-Passwort-1' })).json).toEqual({ ok: true });
    expect((await call(a, 'admin/users/add', { user: 'lisa', password: 'Lisa-Passwort-1' })).status).toBe(409);
    expect((await call(a, 'admin/users/add', { user: 'tom', password: 'Tom-Passwort-1' })).json).toEqual({ ok: true });
    const users = (await call(a, 'admin/users')).json.users;
    expect(users).toEqual(
      expect.arrayContaining([
        { user: 'admin', admin: true, mustChangePassword: false },
        { user: 'lisa', admin: false, mustChangePassword: true },
      ]),
    );
    // Nicht-Admins kommen nicht ins Admin-Center
    expect((await call(['lisa', 'Lisa-Passwort-1'], 'admin/users')).status).toBe(403);
    // Admin-Rechte geben/nehmen; sich selbst nicht entrechten/löschen
    expect((await call(a, 'admin/users/admin', { user: 'lisa', admin: true })).json).toEqual({ ok: true });
    expect((await call(['lisa', 'Lisa-Passwort-1'], 'admin/users')).status).toBe(200);
    expect((await call(a, 'admin/users/admin', { user: 'admin', admin: false })).status).toBe(409);
    expect((await call(a, 'admin/users/delete', { user: 'admin' })).status).toBe(409);
    // Passwort zurücksetzen -> Benutzer muss es beim nächsten Login ändern
    expect((await call(a, 'admin/users/password', { user: 'tom', password: 'Tom-Neu-12345' })).json).toEqual({ ok: true });
    expect((await call(['tom', 'Tom-Passwort-1'], 'me')).json.user).toBe(null);
    expect((await call(['tom', 'Tom-Neu-12345'], 'me')).json).toMatchObject({ user: 'tom', mustChangePassword: true });
    expect((await call(a, 'admin/users/delete', { user: 'tom' })).json).toEqual({ ok: true });
    expect((await call(['tom', 'Tom-Neu-12345'], 'me')).json.user).toBe(null);
    // .htpasswd bleibt im Apache-Format (bcrypt)
    const lines = fs.readFileSync(path.join(priv, '.htpasswd'), 'utf8').trim().split('\n');
    expect(lines.map((l) => l.split(':')[0]).sort()).toEqual(['admin', 'lisa']);
    for (const l of lines) expect(l.split(':')[1]).toMatch(/^\$2y\$/);
  });

  it('Cheats: Passwörter im Admin-Center, Freischalten für alle Benutzer', async () => {
    const a: [string, string] = ['admin', adminPw];
    const l: [string, string] = ['lisa', 'Lisa-Passwort-1'];
    expect((await call(l, 'cheats/unlock', { password: 'irgendwas' })).status).toBe(403);
    expect((await call(a, 'admin/cheats/add', { label: 'Familie', password: 'nuka' })).json).toEqual({ ok: true });
    expect((await call(a, 'admin/cheats/add', { label: 'Ich', password: 'quantum' })).json).toEqual({ ok: true });
    const list = (await call(a, 'admin/cheats')).json.cheats;
    expect(list.map((c: { label: string }) => c.label)).toEqual(['Familie', 'Ich']);
    expect(JSON.stringify(list)).not.toContain('nuka'); // keine Klartext-Passwörter
    expect((await call(l, 'cheats/unlock', { password: 'nuka' })).json).toEqual({ ok: true, label: 'Familie' });
    expect((await call(a, 'admin/cheats/delete', { id: list[0].id })).json).toEqual({ ok: true });
    expect((await call(l, 'cheats/unlock', { password: 'nuka' })).status).toBe(403);
    expect((await call(l, 'cheats/unlock', { password: 'quantum' })).json.ok).toBe(true);
    expect(fs.readFileSync(path.join(priv, 'cheats.json'), 'utf8')).not.toContain('quantum');
  });

  it('Spielstände getrennt pro Benutzer: Spiel schreibt über /fs, App sieht sie über /api', async () => {
    const a: [string, string] = ['admin', adminPw];
    const l: [string, string] = ['lisa', 'Lisa-Passwort-1'];
    // das Spiel legt Saves an (wie pal_fs_web.cpp)
    // wie das Spiel: Ordner für Ordner (mkdir legt nur eine Ebene an)
    for (const d of ['/docs/My Games', '/docs/My Games/FalloutNV', '/docs/My Games/FalloutNV/Saves'])
      expect((await fsCall(a, `/fs/mkdir?p=${enc(d)}`, { method: 'POST' })).status).toBe(200);
    expect((await fsCall(a, `/fs/truncate?p=${enc('/docs/My Games/FalloutNV/Saves/Save 1 - Courier.fos')}`, { method: 'POST' })).status).toBe(200);
    expect((await fsCall(a, `/fs/write?p=${enc('/docs/My Games/FalloutNV/Saves/Save 1 - Courier.fos')}&o=0`, { method: 'POST', body: 'FO3SAVEGAME-admin' })).status).toBe(200);
    const saves = (await call(a, 'saves')).json.saves;
    expect(saves.map((s: { name: string }) => s.name)).toEqual(['Save 1 - Courier.fos']);
    expect((await call(l, 'saves')).json.saves).toEqual([]); // Lisa sieht sie nicht
    expect((await fsCall(l, `/fs/stat?p=${enc('/docs/My Games/FalloutNV/Saves/Save 1 - Courier.fos')}`)).status).toBe(404);
    // Download, Upload, Löschen
    const dl = await call(a, `saves/download?name=${enc('Save 1 - Courier.fos')}`);
    expect(dl.buf.toString()).toBe('FO3SAVEGAME-admin');
    expect(dl.headers.get('content-disposition')).toContain('Save%201%20-%20Courier.fos');
    expect((await call(l, `saves/upload?name=${enc('Save 7.fos')}`, undefined, 'FO3SAVEGAME-lisa')).json).toEqual({ ok: true });
    expect((await fsCall(l, `/fs/read?p=${enc('/docs/my games/falloutnv/saves/save 7.fos')}&o=0&n=100`).then((r) => r.text()))).toBe('FO3SAVEGAME-lisa');
    expect((await call(l, `saves/upload?name=${enc('../../evil.fos')}`, undefined, 'x')).status).toBe(400);
    expect((await call(l, `saves/upload?name=${enc('evil.php')}`, undefined, 'x')).status).toBe(400);
    expect((await call(l, 'saves/delete', { name: 'Save 7.fos' })).json).toEqual({ ok: true });
    expect((await call(l, 'saves')).json.saves).toEqual([]);
  });

  it('Backups: anlegen, herunterladen, wiederherstellen (mit Sicherheitskopie), hochladen, löschen', async () => {
    const a: [string, string] = ['admin', adminPw];
    const created = (await call(a, 'backups/create', { label: 'vor Dead Money' })).json;
    expect(created.ok).toBe(true);
    expect(created.name).toMatch(/^\d{4}-\d\d-\d\d_\d{6}_vor Dead Money\.zip$/);
    const zip = (await call(a, `backups/download?name=${enc(created.name)}`)).buf;
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    // Spielstand ändern, dann Backup zurückspielen
    await fsCall(a, `/fs/write?p=${enc('/docs/My Games/FalloutNV/Saves/Save 1 - Courier.fos')}&o=0`, { method: 'POST', body: 'KAPUTT-KAPUTT-KAP' });
    await fsCall(a, `/fs/truncate?p=${enc('/docs/My Games/FalloutNV/Saves/Save 2.fos')}`, { method: 'POST' });
    const restored = (await call(a, 'backups/restore', { name: created.name })).json;
    expect(restored.ok).toBe(true);
    expect(restored.safety).toMatch(/vor-wiederherstellung\.zip$/);
    expect((await call(a, 'saves')).json.saves.map((s: { name: string }) => s.name)).toEqual(['Save 1 - Courier.fos']);
    const back = await call(a, `saves/download?name=${enc('Save 1 - Courier.fos')}`);
    expect(back.buf.toString()).toBe('FO3SAVEGAME-admin');
    // eigenes ZIP hochladen = wiederherstellen
    expect((await call(a, 'backups/upload', undefined, zip)).json.ok).toBe(true);
    // ZIP mit bösen Pfaden wird abgelehnt
    const evil = spawnSync('php', ['-r', `$z=new ZipArchive();$f=tempnam(sys_get_temp_dir(),'z');$z->open($f,ZipArchive::OVERWRITE);$z->addFromString('../../escape.txt','x');$z->close();echo base64_encode(file_get_contents($f));`], { encoding: 'utf8' }).stdout;
    expect((await call(a, 'backups/upload', undefined, Buffer.from(evil, 'base64'))).status).toBe(400);
    expect(fs.existsSync(path.join(tmp, 'escape.txt'))).toBe(false);
    const list = (await call(a, 'backups')).json.backups;
    expect(list.length).toBeGreaterThanOrEqual(3);
    // Backups sind privat pro Benutzer
    expect((await call(['lisa', 'Lisa-Passwort-1'], 'backups')).json.backups).toEqual([]);
    expect((await call(a, 'backups/delete', { name: created.name })).json).toEqual({ ok: true });
    expect((await call(a, `backups/download?name=${enc('../.htpasswd')}`)).status).toBe(400);
  });

  it('DLCs pro Benutzer ein-/ausschalten wirkt auf den Spiel-Index', async () => {
    const a: [string, string] = ['admin', adminPw];
    const l: [string, string] = ['lisa', 'Lisa-Passwort-1'];
    expect((await call(a, 'dlc')).json.dlc).toEqual([
      { name: 'DeadMoney', enabled: true },
      { name: 'HonestHearts', enabled: true },
    ]);
    expect((await call(a, 'dlc', { name: 'DeadMoney', enabled: false })).json).toEqual({ ok: true });
    expect((await call(a, 'dlc', { name: 'GibtsNicht', enabled: true })).status).toBe(404);
    const idxA = await (await fsCall(a, '/fs/index')).json();
    const idxL = await (await fsCall(l, '/fs/index')).json();
    expect(idxA.f['/game/data/deadmoney.nam']).toBeUndefined();
    expect(idxA.f['/game/data/honesthearts.nam']).toBeDefined();
    expect(idxL.f['/game/data/deadmoney.nam']).toBeDefined(); // Lisa hat es noch an
    expect(idxA.f['/game/data/deadmoney.esm']).toBeDefined(); // die .esm bleibt, nur der Marker fehlt
  });

  it('unbekannte Routen und falsche Methoden', async () => {
    expect((await call(['admin', adminPw], 'gibtsnicht')).status).toBe(404);
    expect((await call(['admin', adminPw], 'setup', {})).status).toBe(404);
  });
});
