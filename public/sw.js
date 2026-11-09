// FO-NV-Web Service Worker.
//
// 1) Diagnose-Version (GitHub Pages): GitHub Pages kann keine eigenen HTTP-Header setzen; SharedArrayBuffer
//    (WASM-Threads) braucht aber COOP/COEP. Wir setzen sie hier auf jede Antwort (Prinzip von coi-serviceworker).
//
// 2) Eigener Server, sobald der Datenmanager (src/offline.ts) Daten auf das Gerät geladen hat:
//    - Das Spiel fragt seine Dateien synchron über /fs/* an (port/recomp/pal_fs_web.cpp). Liegen sie auf dem Gerät
//      (OPFS, Ordner "fnv"), antwortet dieser Worker selbst: kein Netz, kaum Latenz, auch offline.
//    - Einstellungen und Spielstände (/docs) liegen dann in IndexedDB und werden im Hintergrund mit dem Server
//      abgeglichen ("Cloud"): nach dem Speichern hochgeladen, beim App-Start vom Server geholt.
//    - Die App-Dateien (offline.json) kommen bei fehlendem Netz aus dem Cache "fonv-app", GET /api/* aus der
//      letzten Antwort.
//    Ohne geladene Daten reicht der Worker alles unverändert an den Server durch.
importScripts('offline-core.js');
const Core = self.FnvOffline;
const PAGES = self.location.hostname.endsWith('github.io');
const PAGES_CACHE = 'fonv-shell-v1';
const APP_CACHE = 'fonv-app';
const API_CACHE = 'fonv-api';
const CHUNK = 8 << 20;           // Upload-Stücke (fs.php nimmt bis 64 MB)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = PAGES ? [PAGES_CACHE] : [APP_CACHE, API_CACHE];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// ---- kleine Helfer -----------------------------------------------------------------------------------------
const noStore = { 'Cache-Control': 'no-store' };
const r200 = (body, type) => new Response(body, { status: 200, headers: { ...noStore, ...(type ? { 'Content-Type': type } : {}) } });
const json = (v) => r200(JSON.stringify(v), 'application/json');
const fail = (code, text = '') => new Response(text, { status: code, headers: noStore });
const offlineJson = () => new Response(JSON.stringify({ ok: false, error: 'Offline – keine Verbindung zum Server' }),
  { status: 503, headers: { ...noStore, 'Content-Type': 'application/json' } });
const enc = encodeURIComponent;
const now = () => Math.floor(Date.now() / 1000);

// ---- Zustand: Spieldaten auf dem Gerät (vom Datenmanager in OPFS geschrieben) ------------------------------
// state.json: { enabled, quality, files: { key: mtime } }  – nur vollständig geladene Dateien stehen in files
// index.json: der Index des Servers (fs.php /fs/index) zum Zeitpunkt des Downloads
let st = { enabled: false, files: {}, index: null, raw: null };
let loaded = false;              // Zustand gelesen: ohne Offline-Daten fasst der Worker dann nichts mehr an
const trace = [];                // letzte /fs-Anfragen (Diagnose: Nachricht 'trace')
let ready = loadState();
const fileCache = new Map();

async function fnvDir() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle('fnv', { create: true });
}
async function readText(dir, name) {
  try { return await (await (await dir.getFileHandle(name)).getFile()).text(); } catch { return null; }
}
async function loadState() {
  const next = { enabled: false, files: {}, index: null, raw: null };
  try {
    const dir = await fnvDir();
    const s = JSON.parse((await readText(dir, 'state.json')) || '{}');
    next.enabled = !!s.enabled;
    next.files = s.files || {};
    next.raw = await readText(dir, 'index.json');
    next.index = next.raw ? JSON.parse(next.raw) : null;
  } catch (e) {
    console.warn('[sw] Zustand nicht lesbar', e);
  }
  st = next;
  fileCache.clear();
  if (st.enabled) await docsInit();
  else docs.local = false;
  loaded = true;
}

/** die geladene Datei zu einem Index-Schlüssel (File, liest von der Platte), oder null */
async function localFile(key) {
  const want = st.index && st.index.f[key];
  if (!want || st.files[key] !== want[1]) return null;
  const hit = fileCache.get(key);
  if (hit) return hit;
  try {
    let dir = await fnvDir();
    const parts = key.slice(1).split('/');
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    const f = await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
    if (f.size !== want[0]) return null;
    fileCache.set(key, f);
    return f;
  } catch {
    return null;
  }
}

// ---- Anfragen ------------------------------------------------------------------------------------------------
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (PAGES) return pagesFetch(e);
  // Selbsttest des Datenmanagers: erreicht eine synchrone Anfrage aus einem Worker diesen Service Worker?
  if (url.pathname.endsWith('/fs/__probe')) return e.respondWith(r200('ok', 'text/plain'));
  if (loaded && !st.enabled) return;                          // keine Offline-Daten: Browser fragt direkt den Server
  if (req.headers.get('X-FONV-DL')) return;                   // Datenmanager lädt vom Server
  const fs = url.pathname.match(/\/fs\/([a-z]+)$/);
  if (fs) {
    const t0 = Date.now();
    const entry = [new Date().toISOString().slice(11, 23), fs[1], url.searchParams.get('p'), url.searchParams.get('o'), 'offen', 0];
    trace.push(entry);
    if (trace.length > 3000) trace.splice(0, 1000);
    const done = (status) => { entry[4] = status; entry[5] = Date.now() - t0; };
    return e.respondWith(fsRequest(e, fs[1], url).then((res) => { done(res.status); return res; }, (err) => { done('Fehler ' + err); throw err; }));
  }
  if (/\/api\//.test(url.pathname)) return e.respondWith(apiRequest(req));
  if (req.method !== 'GET' || /\.php$/.test(url.pathname)) return;
  // Seitenaufrufe mit Netz nicht anfassen: nur so fragt der Browser nach Name und Passwort (Verzeichnisschutz)
  if (req.mode === 'navigate' && self.navigator.onLine) return;
  const t0 = Date.now();
  const entry = [new Date().toISOString().slice(11, 23), 'app', url.pathname, '', 'offen', 0];
  trace.push(entry);
  if (trace.length > 3000) trace.splice(0, 1000);
  e.respondWith(appRequest(req, url).then((res) => { entry[4] = res.status; entry[5] = Date.now() - t0; return res; }));
});

async function fsRequest(e, op, url) {
  await ready;
  const req = e.request;
  if (!st.enabled) return fetch(req);
  if (op === 'index') {
    if (docs.local) e.waitUntil(syncSoon(2000));              // Spielstart: Spielstände im Hintergrund abgleichen
    return st.raw ? r200(st.raw, 'application/json') : fetch(req);
  }
  const p = url.searchParams.get('p') || '';
  const key = Core.gameKey(p);
  if (key && st.index) {
    const ix = st.index;
    if (op === 'stat') {
      const f = ix.f[key];
      if (f) return json({ dir: false, size: f[0], mtime: f[1] });
      return ix.d[key] ? json({ dir: true, size: 0, mtime: 0 }) : fail(404);
    }
    if (op === 'list') return ix.d[key] ? json(ix.d[key]) : fail(404);
    if (op === 'read') {
      const file = await localFile(key);
      if (file) {
        const o = Math.max(0, +url.searchParams.get('o') || 0);
        const n = Math.max(0, Math.min(+url.searchParams.get('n') || 0, 64 << 20));
        return r200(await file.slice(o, o + n).arrayBuffer(), 'application/octet-stream');
      }
    }
    return fetch(req).catch(() => fail(404));                  // noch nicht geladen: vom Server
  }
  const rel = Core.docsRel(p);
  if (rel !== null && docs.local) {
    const res = await locked(() => docsOp(op, rel, url, req)).catch((err) => fail(404, String(err)));
    if (pendingFlush) e.waitUntil(pendingFlush);               // geschriebene Daten sichern, bevor der Worker ruht
    return res;
  }
  return fetch(req).catch(() => fail(404));
}

async function apiRequest(req) {
  await ready;
  if (!st.enabled) return fetch(req);
  if (req.method !== 'GET') return fetch(req).catch(offlineJson);
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(API_CACHE)).put(req, r.clone());
    return r;
  } catch {
    return (await (await caches.open(API_CACHE)).match(req)) || offlineJson();
  }
}

async function appRequest(req, url) {
  await ready;
  if (!st.enabled) return fetch(req);
  const cache = await caches.open(APP_CACHE);
  // genau nachschlagen (ohne ?…): ignoreSearch durchsucht den ganzen Cache – bei Tausenden Shadern auf einmal Minuten
  const key = new URL(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname, url.origin).href;
  const lookup = () => cache.match(key);
  // Dateien mit Prüfsumme im Namen ändern sich nie: direkt vom Gerät
  if (/\/(shader\/[0-9a-f]{40}|assets\/)/.test(url.pathname)) {
    const hit = await lookup();
    if (hit) return hit;
  }
  try {
    const res = await fetch(req);
    // Server da, aber Anmeldung abgelaufen o. Ä.: lieber die Fassung vom Gerät (die Seite meldet sich dann selbst)
    if (res.status >= 500 || (req.mode === 'navigate' && !res.ok)) return (await lookup()) || res;
    // frische Fassung auch fürs Gerät merken, damit die Offline-Kopie nicht veraltet
    if (res.ok && res.type === 'basic' && !req.headers.has('range')) {
      const old = await lookup();
      const same = old && ['last-modified', 'etag', 'content-length'].every((h) => old.headers.get(h) === res.headers.get(h));
      if (!same) await cache.put(key, res.clone()).catch(() => undefined);
    }
    return res;
  } catch {
    return (await lookup()) || fail(503, 'Offline und nicht auf diesem Gerät gespeichert');
  }
}

// ---- Einstellungen und Spielstände auf dem Gerät (IndexedDB) ------------------------------------------------
// docs:  { k, name, dir, mtime, data: Blob }   (k = Pfad klein geschrieben, name = Pfad wie angelegt)
// kv:    'seen' -> { k: { srv } }, 'dirty' -> { k: 'w' | 'd' }, 'pulled' -> true, 'lastSync' -> Sekunden
let dbp = null;
function db() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('fonv-offline', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('docs', { keyPath: 'k' }); r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function idb(store, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
const kvGet = (k) => idb('kv', 'readonly', (s) => s.get(k));
const kvSet = (k, v) => idb('kv', 'readwrite', (s) => s.put(v, k));

const docs = { local: false, meta: new Map(), bufs: new Map(), seen: {}, dirty: {}, loaded: false };

async function docsInit() {
  if (!docs.loaded) {
    const all = await idb('docs', 'readonly', (s) => s.getAll());
    for (const r of all || []) docs.meta.set(r.k, { k: r.k, name: r.name, dir: !!r.dir, mtime: r.mtime || 0, size: r.dir ? 0 : (r.data ? r.data.size : 0) });
    docs.seen = (await kvGet('seen')) || {};
    docs.dirty = (await kvGet('dirty')) || {};
    docs.loaded = true;
  }
  // erst wenn der Server-Stand einmal geholt ist, speichert das Spiel auf dem Gerät (sonst sähe es leere Ordner)
  docs.local = !!(await kvGet('pulled'));
}

// alle Änderungen an /docs nacheinander (Schreiben, Abgleich)
let chain = Promise.resolve();
function locked(fn) {
  const r = chain.then(fn, fn);
  chain = r.catch(() => {});
  return r;
}

const parentOf = (k) => (k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '');
function childNames(k) {
  const out = [];
  for (const n of docs.meta.values()) if (n.k !== '' && parentOf(n.k) === k) out.push(n.name.slice(n.name.lastIndexOf('/') + 1));
  return out;
}
/** Pfad wie angegeben, aber vorhandene Ordner und Dateien mit ihrem gespeicherten Namen */
function realName(rel) {
  const parts = rel.split('/');
  let name = '';
  for (let i = 0; i < parts.length; i++) {
    const n = docs.meta.get(parts.slice(0, i + 1).join('/').toLowerCase());
    name = n ? n.name : (name ? name + '/' : '') + parts[i];
  }
  return name;
}
async function ensureDirs(rel) {
  const parts = rel.split('/');
  for (let i = 1; i < parts.length; i++) {
    const sub = parts.slice(0, i).join('/');
    const k = sub.toLowerCase();
    if (docs.meta.has(k)) continue;
    const n = { k, name: realName(sub), dir: true, mtime: now(), size: 0 };
    docs.meta.set(k, n);
    await idb('docs', 'readwrite', (s) => s.put({ k, name: n.name, dir: true, mtime: n.mtime }));
  }
}
async function bufferOf(k) {
  let b = docs.bufs.get(k);
  if (b) return b;
  const rec = await idb('docs', 'readonly', (s) => s.get(k));
  const data = rec && rec.data ? new Uint8Array(await rec.data.arrayBuffer()) : new Uint8Array(0);
  b = { buf: new Uint8Array(Math.max(64 << 10, data.length)), len: data.length };
  b.buf.set(data);
  docs.bufs.set(k, b);
  return b;
}
function writeAt(b, off, bytes) {
  const end = off + bytes.length;
  if (end > b.buf.length) {
    const grown = new Uint8Array(Math.max(end, b.buf.length * 2));
    grown.set(b.buf.subarray(0, b.len));
    b.buf = grown;
  }
  if (off > b.len) b.buf.fill(0, b.len, off);
  b.buf.set(bytes, off);
  b.len = Math.max(b.len, end);
}

async function docsOp(op, rel, url, req) {
  const k = rel.toLowerCase();
  const node = k === '' ? { dir: true, mtime: 0 } : docs.meta.get(k);
  if (op === 'stat') {
    if (!node) return fail(404);
    const size = node.dir ? 0 : docs.bufs.has(k) ? docs.bufs.get(k).len : node.size;
    return json({ dir: !!node.dir, size, mtime: node.mtime || 0 });
  }
  if (op === 'list') return node && node.dir ? json(childNames(k)) : fail(404);
  if (op === 'read') {
    if (!node || node.dir) return fail(404);
    const o = Math.max(0, +url.searchParams.get('o') || 0);
    const n = Math.max(0, Math.min(+url.searchParams.get('n') || 0, 64 << 20));
    const b = docs.bufs.get(k);
    if (b) return r200(b.buf.slice(Math.min(o, b.len), Math.min(o + n, b.len)), 'application/octet-stream');
    const rec = await idb('docs', 'readonly', (s) => s.get(k));
    const blob = rec && rec.data ? rec.data : new Blob([]);
    return r200(await blob.slice(o, o + n).arrayBuffer(), 'application/octet-stream');
  }
  if (req.method !== 'POST') return fail(400);
  if (op === 'write' || op === 'truncate') {
    if (node && node.dir) return fail(404, 'EISDIR');
    await ensureDirs(rel);
    let b;
    if (op === 'truncate') docs.bufs.set(k, (b = { buf: new Uint8Array(64 << 10), len: 0 }));
    else {
      b = await bufferOf(k);
      writeAt(b, Math.max(0, +url.searchParams.get('o') || 0), new Uint8Array(await req.arrayBuffer()));
    }
    docs.meta.set(k, { k, name: node ? node.name : realName(rel), dir: false, mtime: now(), size: b.len });
    scheduleFlush();
    return r200('');
  }
  if (op === 'mkdir') {
    if (node) return fail(404, 'EEXIST');
    await ensureDirs(rel + '/x');
    return r200('');
  }
  if (op === 'remove') {
    if (!node || node.dir) return fail(404);
    await removeLocal(k);
    markDirty(k, 'd');
    return r200('');
  }
  if (op === 'rename') {
    const toRel = Core.docsRel(url.searchParams.get('q') || '');
    if (toRel === null || !node || k === '') return fail(403);
    await flushNow();
    const toK = toRel.toLowerCase();
    await ensureDirs(toRel);
    const toName = realName(toRel);
    const moves = [...docs.meta.values()].filter((n) => n.k === k || n.k.startsWith(k + '/'));
    for (const n of moves) {
      const nk = toK + n.k.slice(k.length);
      const nn = toName + n.name.slice(n.name.length - (n.k.length - k.length));
      const rec = await idb('docs', 'readonly', (s) => s.get(n.k));
      await idb('docs', 'readwrite', (s) => { s.delete(n.k); return s.put({ ...(rec || { dir: n.dir }), k: nk, name: nn, mtime: now() }); });
      docs.meta.delete(n.k);
      docs.meta.set(nk, { ...n, k: nk, name: nn, mtime: now() });
      if (!n.dir) { markDirty(n.k, 'd'); markDirty(nk, 'w'); }
    }
    return r200('');
  }
  return fail(400);
}

async function removeLocal(k) {
  docs.bufs.delete(k);
  docs.meta.delete(k);
  await idb('docs', 'readwrite', (s) => s.delete(k));
}
function markDirty(k, kind) {
  if (kind === 'd' && !docs.seen[k]) delete docs.dirty[k];       // nie hochgeladen: auf dem Server nichts zu löschen
  else docs.dirty[k] = kind;
  void kvSet('dirty', docs.dirty);
  void syncSoon(5000);
}

// geschriebene Dateien kurz sammeln, dann in IndexedDB sichern (das Spiel schreibt in 4-KB-Stücken)
let flushTimer = 0, pendingFlush = null, flushDone = null;
function scheduleFlush() {
  clearTimeout(flushTimer);
  if (!pendingFlush) pendingFlush = new Promise((r) => { flushDone = r; });
  flushTimer = setTimeout(() => void locked(flushNow), 1000);
}
async function flushNow() {
  clearTimeout(flushTimer);
  for (const [k, b] of [...docs.bufs]) {
    const n = docs.meta.get(k);
    if (!n) { docs.bufs.delete(k); continue; }
    await idb('docs', 'readwrite', (s) => s.put({ k, name: n.name, dir: false, mtime: n.mtime, data: new Blob([b.buf.subarray(0, b.len)]) }));
    n.size = b.len;
    docs.bufs.delete(k);
    markDirty(k, 'w');
  }
  const done = flushDone;
  pendingFlush = flushDone = null;
  if (done) done(pendingSync);                                  // Worker bleibt wach bis zum Hochladen
}

// ---- Abgleich mit dem Server ("Cloud") ----------------------------------------------------------------------
let syncTimer = 0, syncing = null, lastResult = null, pendingSync = null, syncResolve = null;
// ein Abgleich kurz nach der letzten Änderung; alle Wartenden bekommen dasselbe Versprechen (keins bleibt offen,
// sonst gälte der Worker für immer als beschäftigt und eine neue Fassung käme nie an die Reihe)
function syncSoon(ms) {
  clearTimeout(syncTimer);
  if (!pendingSync) pendingSync = new Promise((res) => { syncResolve = res; });
  syncTimer = setTimeout(() => {
    const res = syncResolve;
    pendingSync = syncResolve = null;
    runSync().then(res, res);
  }, ms);
  return pendingSync;
}
function runSync() {
  if (!syncing) syncing = doSync().finally(() => { syncing = null; });
  return syncing;
}
async function doSync() {
  await ready;
  if (!st.enabled) return { ok: false, error: 'Keine Offline-Daten auf diesem Gerät' };
  const r = { ok: true, downloaded: 0, uploaded: 0, deleted: 0, conflicts: 0, at: now() };
  try {
    await locked(flushNow);
    await pull(r);
    await push(r);
    await kvSet('pulled', true);
    docs.local = true;
    await kvSet('lastSync', r.at);
  } catch (e) {
    r.ok = false;
    r.error = String((e && e.message) || e);
  }
  lastResult = r;
  return r;
}
const server = (path, init) => fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
async function serverFiles(rel, out) {
  const res = await server('/fs/list?p=' + enc('/docs/' + rel));
  if (res.status === 404) return;
  if (!res.ok) throw new Error('Server: Ordnerliste ' + res.status);
  for (const name of await res.json()) {
    const sub = rel ? rel + '/' + name : name;
    const s = await server('/fs/stat?p=' + enc('/docs/' + sub));
    if (!s.ok) continue;
    const info = await s.json();
    if (info.dir) await serverFiles(sub, out);
    else out[sub.toLowerCase()] = { name: sub, size: info.size, mtime: info.mtime };
  }
}
async function fetchServerFile(f) {
  const res = await server('/fs/read?p=' + enc('/docs/' + f.name) + '&o=0&n=' + Math.max(1, f.size));
  if (!res.ok) throw new Error('Server: ' + f.name + ' ' + res.status);
  return new Blob([await res.arrayBuffer()]);
}
async function storeLocal(name, blob, mtime) {
  const k = name.toLowerCase();
  await ensureDirs(name);
  const real = realName(name);
  await idb('docs', 'readwrite', (s) => s.put({ k, name: real, dir: false, mtime, data: blob }));
  docs.meta.set(k, { k, name: real, dir: false, mtime, size: blob.size });
  docs.bufs.delete(k);
}
async function pull(r) {
  const srv = {};
  await serverFiles('', srv);
  const local = [...docs.meta.values()].filter((n) => !n.dir).map((n) => n.k);
  const plan = Core.syncPlan(srv, local, docs.seen, docs.dirty);
  for (const k of plan.download) {
    const f = srv[k];
    const blob = await fetchServerFile(f);
    await locked(() => storeLocal(f.name, blob, f.mtime));
    docs.seen[k] = { srv: f.mtime };
    delete docs.dirty[k];
    r.downloaded++;
  }
  for (const k of plan.conflict) {
    const f = srv[k];
    const blob = await fetchServerFile(f);
    const name = Core.conflictName(f.name);
    await locked(() => storeLocal(name, blob, f.mtime));
    docs.dirty[name.toLowerCase()] = 'w';                // die Kopie kommt auch auf den Server, der eigene Stand danach
    docs.seen[k] = { srv: f.mtime };
    r.conflicts++;
  }
  for (const k of plan.deleteLocal) {
    await locked(() => removeLocal(k));
    delete docs.seen[k];
    r.deleted++;
  }
  for (const k of plan.markDirty) docs.dirty[k] = 'w';
  await kvSet('seen', docs.seen);
  await kvSet('dirty', docs.dirty);
}
const post = (path, body) => server(path, { method: 'POST', body: body || null });
async function push(r) {
  for (const [k, kind] of Object.entries(docs.dirty)) {
    if (kind === 'd') {
      const res = await post('/fs/remove?p=' + enc('/docs/' + k));
      if (!res.ok && res.status !== 404) throw new Error('Server: Löschen ' + res.status);
      delete docs.seen[k];
      delete docs.dirty[k];
      r.deleted++;
      continue;
    }
    const n = docs.meta.get(k);
    if (!n || n.dir) { delete docs.dirty[k]; continue; }
    const mtime = n.mtime;
    const rec = await idb('docs', 'readonly', (s) => s.get(k));
    const data = new Uint8Array(rec && rec.data ? await rec.data.arrayBuffer() : new ArrayBuffer(0));
    const p = enc('/docs/' + n.name);
    let res = await post('/fs/truncate?p=' + p);
    if (!res.ok) throw new Error('Server: ' + n.name + ' ' + res.status);
    for (let off = 0; off < data.length; off += CHUNK) {
      res = await post('/fs/write?p=' + p + '&o=' + off, data.subarray(off, off + CHUNK));
      if (!res.ok) throw new Error('Server: ' + n.name + ' ' + res.status);
    }
    const s = await server('/fs/stat?p=' + p);
    const info = s.ok ? await s.json() : null;
    const cur = docs.meta.get(k);
    if (info && cur && cur.mtime === mtime) {               // inzwischen wieder geändert? dann bleibt es markiert
      docs.seen[k] = { srv: info.mtime };
      delete docs.dirty[k];
    }
    r.uploaded++;
  }
  await kvSet('seen', docs.seen);
  await kvSet('dirty', docs.dirty);
}

// ---- Nachrichten vom Datenmanager ------------------------------------------------------------------------------
self.addEventListener('message', (e) => {
  const port = e.ports && e.ports[0];
  const type = e.data && e.data.type;
  const job =
    type === 'reload' ? (ready = loadState()).then(() => ({ ok: true }))
    : type === 'sync' ? runSync()
    : type === 'trace' ? Promise.resolve({ ok: true, trace: trace.slice(-200) })
    : type === 'status' ? ready.then(async () => ({
        ok: true, enabled: st.enabled, docsLocal: docs.local, pending: Object.keys(docs.dirty).length,
        lastSync: (await kvGet('lastSync')) || 0, last: lastResult,
      }))
    : Promise.resolve({ ok: false, error: 'unbekannte Nachricht' });
  e.waitUntil(job.then((v) => port && port.postMessage(v), (err) => port && port.postMessage({ ok: false, error: String(err) })));
});

// ---- Diagnose-Version (GitHub Pages) ------------------------------------------------------------------------
function isolate(res) {
  if (res.status === 0) return res; // opaque
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
function pagesFetch(e) {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // Range-Requests nie cachen
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(PAGES_CACHE)).put(req, res.clone());
      return isolate(res);
    } catch {
      const cached = await caches.match(req);
      if (cached) return isolate(cached);
      throw new Error('offline und nicht im Cache: ' + req.url);
    }
  })());
}
