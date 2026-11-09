// Tests für hosting/fs.php (Datei-API des Spiels auf PHP-Webhosting).
// Erwartetes Verhalten = server/serve.mjs aus SgtMetz/fnv-web-recomp (dort nachgelesen, Stand 2026-11-09).
// Nutzt eine selbst erzeugte Fake-Installation – KEINE Spieldaten.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAS_PHP = spawnSync('php', ['-v']).status === 0;
const HOSTING = path.resolve(__dirname, '..', 'hosting');
const enc = encodeURIComponent;

function put(p: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

async function startServer(dlc: boolean, port: number) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fnv-php-'));
  const game = path.join(tmp, 'Fallout New Vegas');
  put(path.join(game, 'FalloutNV.exe'), 'fake');
  const big = Buffer.alloc(3 * 1024 * 1024 + 123);
  for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 255;
  put(path.join(game, 'Data', 'FalloutNV.esm'), big);
  put(path.join(game, 'Data', 'Fallout - Textures.bsa'), 'textures-original');
  put(path.join(game, 'Data', 'DeadMoney.nam'), '');
  put(path.join(game, 'Data', 'DeadMoney.esm'), 'dm');
  put(path.join(game, 'Data', 'Menus', 'Main', 'Start_Menu.xml'), '<menu/>');
  fs.mkdirSync(path.join(game, 'Data', 'Empty'));
  const mobile = path.join(tmp, 'mobile');
  put(path.join(mobile, 'Fallout - Textures.bsa'), 'textures-mobile');
  // eigenes Docroot je Server, damit sich die Konfigurationen nicht stören
  const root = path.join(tmp, 'www');
  fs.mkdirSync(root);
  for (const f of ['fs.php', 'lib.php', 'api.php', 'dev-router.php'].filter((f) => fs.existsSync(path.join(HOSTING, f)))) fs.copyFileSync(path.join(HOSTING, f), path.join(root, f));
  const cfg = { game, data: path.join(tmp, 'docs'), mobile, cache: path.join(tmp, 'cache'), dlc };
  fs.writeFileSync(
    path.join(root, 'fs-config.php'),
    `<?php return ${'['}${Object.entries(cfg)
      .map(([k, v]) => `'${k}' => ${typeof v === 'boolean' ? String(v) : `'${v}'`}`)
      .join(', ')}];\n`,
  );
  const proc: ChildProcess = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root, path.join(root, 'dev-router.php')], {
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + '/fs/index');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { base, proc, tmp, big, cfg };
}

describe.skipIf(!HAS_PHP)('hosting/fs.php', () => {
  let s: Awaited<ReturnType<typeof startServer>>;
  let sDlc: Awaited<ReturnType<typeof startServer>>;
  const get = (url: string, base = s.base) => fetch(base + url);
  const post = (url: string, body?: string) => fetch(s.base + url, { method: 'POST', body });

  beforeAll(async () => {
    s = await startServer(false, 18194);
    sDlc = await startServer(true, 18195);
  });
  afterAll(() => {
    for (const x of [s, sDlc]) {
      x.proc.kill();
      fs.rmSync(x.tmp, { recursive: true, force: true });
    }
  });

  it('liefert den Index der Installation (klein geschriebene Schlüssel, Originalnamen in Ordnerlisten)', async () => {
    const r = await get('/fs/index');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(r.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    const idx = await r.json();
    expect(idx.f['/game/data/falloutnv.esm'][0]).toBe(s.big.length);
    expect(typeof idx.f['/game/data/falloutnv.esm'][1]).toBe('number');
    expect(idx.d['/game/data'].sort()).toEqual(
      ['DeadMoney.esm', 'Empty', 'Fallout - Textures.bsa', 'FalloutNV.esm', 'Menus'].sort(),
    );
    expect(idx.d['/game/data/empty']).toEqual([]);
    // DLC-Marker versteckt, mobile-Archive im Index, aber nicht als Ordner gelistet
    expect(idx.f['/game/data/deadmoney.nam']).toBeUndefined();
    expect(idx.f['/game/data/mobile/fallout - textures.bsa'][0]).toBe(15);
    expect(idx.d['/game/data/mobile']).toBeUndefined();
  });

  it('zeigt DLC-Marker nur mit dlc=true', async () => {
    const idx = await (await get('/fs/index', sDlc.base)).json();
    expect(idx.f['/game/data/deadmoney.nam']).toEqual([0, expect.any(Number)]);
  });

  it('stat unter /game: Groß/Klein egal, Ordner, fehlende Dateien, fremde Wurzeln', async () => {
    const a = await (await get(`/fs/stat?p=${enc('/GAME/Data/FalloutNV.ESM')}`)).json();
    expect(a).toMatchObject({ dir: false, size: s.big.length });
    expect(await (await get(`/fs/stat?p=${enc('/game/data')}`)).json()).toEqual({ dir: true, size: 0, mtime: 0 });
    expect(await (await get(`/fs/stat?p=${enc('/game/')}`)).json()).toEqual({ dir: true, size: 0, mtime: 0 });
    expect((await get(`/fs/stat?p=${enc('/game/nope')}`)).status).toBe(404);
    expect((await get(`/fs/stat?p=${enc('/game/data/deadmoney.nam')}`)).status).toBe(404);
    expect((await get(`/fs/stat?p=${enc('/etc/passwd')}`)).status).toBe(403);
  });

  it('list unter /game', async () => {
    expect(await (await get(`/fs/list?p=${enc('/game/data/empty')}`)).json()).toEqual([]);
    expect((await get(`/fs/list?p=${enc('/game/data/mobile')}`)).status).toBe(404);
  });

  it('read: 1-MB-Blöcke, Dateiende, Cache-Header, mobile-Archiv, Groß/Klein', async () => {
    const r = await get(`/fs/read?p=${enc('/game/data/falloutnv.esm')}&o=1048576&n=1048576&v=1`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(await r.arrayBuffer()).equals(s.big.subarray(1048576, 2 * 1048576))).toBe(true);
    const tail = await get(`/fs/read?p=${enc('/game/data/falloutnv.esm')}&o=${3 * 1048576}&n=1048576&v=1`);
    expect((await tail.arrayBuffer()).byteLength).toBe(123);
    const past = await get(`/fs/read?p=${enc('/game/data/falloutnv.esm')}&o=99999999&n=10`);
    expect(past.status).toBe(200);
    expect(past.headers.get('cache-control')).toBe('no-store');
    expect((await past.arrayBuffer()).byteLength).toBe(0);
    expect(await (await get(`/fs/read?p=${enc('/game/data/mobile/fallout - textures.bsa')}&o=0&n=100`)).text()).toBe(
      'textures-mobile',
    );
    expect(await (await get(`/fs/read?p=${enc('/game/data/menus/main/start_menu.xml')}&o=1&n=4`)).text()).toBe('menu');
    expect((await get(`/fs/read?p=${enc('/game/../../etc/passwd')}&o=0&n=10`)).status).toBe(404);
  });

  it('Schreiben unter /game ist verboten', async () => {
    expect((await post(`/fs/write?p=${enc('/game/data/falloutnv.esm')}&o=0`, 'x')).status).toBe(403);
  });

  it('Spielstände unter /docs: anlegen, schreiben, lesen, umbenennen, löschen', async () => {
    expect((await post(`/fs/mkdir?p=${enc('/docs/Saves')}`)).status).toBe(200);
    expect((await post(`/fs/mkdir?p=${enc('/docs/saves')}`)).status).toBe(404); // existiert schon
    expect((await post(`/fs/truncate?p=${enc('/docs/Saves/Save 1.fos')}`)).status).toBe(200);
    expect((await post(`/fs/write?p=${enc('/docs/saves/save 1.fos')}&o=0`, 'HELLO WORLD')).status).toBe(200);
    expect((await post(`/fs/write?p=${enc('/docs/saves/save 1.fos')}&o=6`, 'MOJAVE')).status).toBe(200);
    const rd = await get(`/fs/read?p=${enc('/docs/SAVES/Save 1.fos')}&o=0&n=100`);
    expect(rd.headers.get('cache-control')).toBe('no-store');
    expect(await rd.text()).toBe('HELLO MOJAVE');
    const st = await (await get(`/fs/stat?p=${enc('/docs/saves/save 1.fos')}`)).json();
    expect(st).toMatchObject({ dir: false, size: 12 });
    expect(await (await get(`/fs/list?p=${enc('/docs/saves')}`)).json()).toEqual(['Save 1.fos']);
    expect((await post(`/fs/rename?p=${enc('/docs/saves/save 1.fos')}&q=${enc('/docs/saves/Save 2.fos')}`)).status).toBe(200);
    expect(await (await get(`/fs/list?p=${enc('/docs/saves')}`)).json()).toEqual(['Save 2.fos']);
    expect((await post(`/fs/rename?p=${enc('/docs/saves/Save 2.fos')}&q=${enc('/game/x')}`)).status).toBe(403);
    expect((await post(`/fs/remove?p=${enc('/docs/saves/save 2.fos')}`)).status).toBe(200);
    expect((await post(`/fs/remove?p=${enc('/docs/saves/save 2.fos')}`)).status).toBe(404);
  });

  it('weist Pfadtricks und falsche Methoden ab', async () => {
    expect((await get(`/fs/stat?p=${enc('/docs/../x')}`)).status).toBe(404);
    expect((await post(`/fs/write?p=${enc('/docs/../../escape.txt')}&o=0`, 'x')).status).toBe(404);
    expect(fs.existsSync(path.join(s.tmp, 'escape.txt'))).toBe(false);
    expect((await get(`/fs/write?p=${enc('/docs/a')}`)).status).toBe(400);
    expect((await post(`/fs/write?p=${enc('/docs/nodir/a.ini')}&o=0`, 'x')).status).toBe(404);
    expect((await post(`/fs/bogus?p=${enc('/docs/a')}`)).status).toBe(400);
  });
});
