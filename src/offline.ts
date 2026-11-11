// Datenmanager: lädt das Spiel auf das Gerät (OPFS) und schaltet den Offline-Betrieb über den Service Worker
// (public/sw.js) ein. Spielstände gleicht der Service Worker mit dem Server ab ("Cloud").
import { doneBytes, planDownload, type GameIndex, type PlanFile, type Quality } from './offline-plan';

export interface OfflineState {
  enabled: boolean;
  quality: Quality;
  dlcOff: string[];
  /** vollständig geladene Dateien: key -> mtime */
  files: Record<string, number>;
  /** angefangene Dateien: key -> mtime (Download wird dort fortgesetzt) */
  partial: Record<string, number>;
  /** Version der App-Dateien im Cache (offline.json) */
  app?: string;
}
export interface SyncStatus {
  ok: boolean;
  enabled?: boolean;
  docsLocal?: boolean;
  pending?: number;
  lastSync?: number;
  last?: { ok: boolean; error?: string; downloaded: number; uploaded: number; conflicts: number; at: number } | null;
  error?: string;
}
export interface Progress {
  phase: 'app' | 'game' | 'done' | 'stopped' | 'error';
  done: number;
  total: number;
  file?: string;
  error?: string;
}

const EMPTY: OfflineState = { enabled: false, quality: 'high', dlcOff: [], files: {}, partial: {} };
export const isPhone = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// ---- Gerätespeicher ------------------------------------------------------------------------------------------
async function fnvDir(): Promise<FileSystemDirectoryHandle> {
  return (await navigator.storage.getDirectory()).getDirectoryHandle('fnv', { create: true });
}
export async function readState(): Promise<OfflineState> {
  try {
    const f = await (await (await fnvDir()).getFileHandle('state.json')).getFile();
    return { ...EMPTY, ...JSON.parse(await f.text()) };
  } catch {
    return { ...EMPTY, quality: isPhone() ? 'low' : 'high' };
  }
}
async function readLocalIndex(): Promise<string | null> {
  try {
    return await (await (await (await fnvDir()).getFileHandle('index.json')).getFile()).text();
  } catch {
    return null;
  }
}

// ein Worker für alle Schreibzugriffe (public/opfs-worker.js)
let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (m: { ok: boolean; error?: string; result?: unknown }) => void>();
let onWorkerEvent: ((m: { type: string; key: string; done?: number; mtime?: number }) => void) | null = null;
function opfs(): Worker {
  if (worker) return worker;
  worker = new Worker('./opfs-worker.js');
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)!(m);
      waiting.delete(m.id);
    } else onWorkerEvent?.(m);
  };
  return worker;
}
function call(msg: Record<string, unknown>): Promise<unknown> {
  const id = ++seq;
  return new Promise((res, rej) => {
    waiting.set(id, (m) => (m.ok ? res(m.result) : rej(new Error(m.error))));
    opfs().postMessage({ ...msg, id });
  });
}
let writes = Promise.resolve();
function saveState(s: OfflineState): Promise<void> {
  const text = JSON.stringify(s);
  writes = writes.then(() => call({ type: 'write', name: 'state.json', text }).then(() => undefined));
  return writes;
}

// ---- Service Worker --------------------------------------------------------------------------------------------
export async function ensureServiceWorker(): Promise<ServiceWorker | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    // frisch installiert: sw.js übernimmt die Seite selbst (clients.claim)
    await new Promise<void>((res) => {
      const t = setTimeout(res, 5000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); res(); }, { once: true });
    });
  }
  return navigator.serviceWorker.controller || reg.active;
}
export async function swCall<T>(type: string, timeoutMs = 120000): Promise<T> {
  const sw = navigator.serviceWorker?.controller || (await navigator.serviceWorker?.ready)?.active;
  if (!sw) throw new Error('Service Worker nicht aktiv');
  return new Promise<T>((res, rej) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => rej(new Error('Service Worker antwortet nicht')), timeoutMs);
    ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data as T); };
    sw.postMessage({ type }, [ch.port2]);
  });
}

/** Kann dieser Browser das Spiel vom Gerät laden? Prüft alles, was gebraucht wird – auch den eigentlichen Weg. */
export async function checkSupport(): Promise<{ ok: boolean; reason?: string }> {
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'Dieser Browser hat keine Service Worker (privates Fenster?).' };
  if (!navigator.storage?.getDirectory) return { ok: false, reason: 'Dieser Browser hat keinen Gerätespeicher (OPFS).' };
  try {
    await ensureServiceWorker();
  } catch (e) {
    return { ok: false, reason: 'Service Worker lässt sich nicht starten: ' + (e instanceof Error ? e.message : e) };
  }
  const r = await new Promise<{ write: boolean; xhr: boolean } | null>((res) => {
    const w = new Worker('./probe-worker.js');
    const t = setTimeout(() => { w.terminate(); res(null); }, 8000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); res(e.data); };
    w.onerror = () => { clearTimeout(t); res(null); };
  });
  if (!r) return { ok: false, reason: 'Selbsttest lief nicht (Worker).' };
  if (!r.write) return { ok: false, reason: 'Dieser Browser kann nicht schnell in den Gerätespeicher schreiben.' };
  if (!r.xhr) return { ok: false, reason: 'Der Browser leitet die Dateizugriffe des Spiels nicht über den Gerätespeicher – offline spielen geht hier nicht.' };
  return { ok: true };
}

// ---- Überblick ---------------------------------------------------------------------------------------------------
export interface Overview {
  state: OfflineState;
  index: GameIndex | null;
  files: PlanFile[];
  total: number;
  have: number;
  online: boolean;
  /** Index auf dem Gerät passt nicht mehr zum Server (DLCs umgeschaltet, Spieldaten geändert) */
  stale: boolean;
}
async function serverIndex(): Promise<string | null> {
  try {
    const r = await fetch('/fs/index', { headers: { 'X-FONV-DL': '1' }, cache: 'no-store', credentials: 'same-origin' });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}
export async function overview(quality: Quality, dlcOff: string[]): Promise<Overview> {
  const state = await readState();
  const [remote, local] = await Promise.all([serverIndex(), readLocalIndex()]);
  const raw = remote ?? local;
  const index = raw ? (JSON.parse(raw) as GameIndex) : null;
  const plan = index ? planDownload(index, { quality, dlcOff }) : { files: [], bytes: 0 };
  return {
    state, index, files: plan.files, total: plan.bytes, have: doneBytes(plan.files, state.files), online: remote !== null,
    stale: !!(state.enabled && remote && local && remote !== local),
  };
}

// ---- Laden -------------------------------------------------------------------------------------------------------
let running: Promise<void> | null = null;
export const isRunning = () => running !== null;
export function stopDownload(): void {
  worker?.postMessage({ type: 'stop' });
}

/** App-Dateien in den Cache (für den Start ohne Netz). Dateien mit Prüfsumme im Namen nur einmal. */
async function cacheApp(state: OfflineState, report: (p: Progress) => void): Promise<void> {
  const man = (await (await fetch('./offline.json', { cache: 'no-store', credentials: 'same-origin' })).json()) as { version: string; files: string[] };
  if (state.app === man.version) return;
  const cache = await caches.open('fonv-app');
  const hashed = (f: string) => /^(shader\/([0-9a-f]{40}|pack-[0-9a-f]{16}\.txt)|assets\/)/.test(f);
  let next = 0, done = 0;
  const lane = async () => {
    while (next < man.files.length) {
      const f = man.files[next++]!;
      const url = new URL(f, location.href).href;
      if (!(hashed(f) && (await cache.match(url)))) {
        const r = await fetch(url, { cache: 'no-cache', credentials: 'same-origin', headers: { 'X-FONV-DL': '1' } });
        if (!r.ok) throw new Error(`${f}: Server antwortet ${r.status}`);
        await cache.put(url, r);
      }
      done++;
      if (done % 25 === 0 || done === man.files.length) report({ phase: 'app', done, total: man.files.length, file: f });
    }
  };
  await Promise.all([lane(), lane(), lane(), lane(), lane(), lane()]);
  // alte Shader (Einzeldateien von früher, ältere Pakete) aus dem Cache: sonst wächst er mit jedem Update um ~12 MB
  const want = new Set(man.files.map((f) => new URL(f, location.href).href));
  for (const k of await cache.keys()) if (new URL(k.url).pathname.includes('/shader/') && !want.has(k.url)) await cache.delete(k);
  state.app = man.version;
  await saveState(state);
}

/** App-Dateien auf dem Gerät auf den Stand des Servers bringen (nach einem Update), im Hintergrund beim App-Start. */
export async function refreshAppCache(): Promise<boolean> {
  if (running) return false;
  const state = await readState();
  if (!state.enabled) return false;
  const before = state.app;
  await cacheApp(state, () => undefined);
  return state.app !== before;
}

async function removeFile(key: string): Promise<void> {
  let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('fnv');
  const parts = key.slice(1).split('/');
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
  await dir.removeEntry(parts[parts.length - 1]!);
}

export function startDownload(quality: Quality, dlcOff: string[], report: (p: Progress) => void): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      await navigator.storage.persist?.().catch(() => false);
      if (!(await ensureServiceWorker())) throw new Error('Service Worker nicht verfügbar');
      const raw = await serverIndex();
      if (!raw) throw new Error('Der Server ist nicht erreichbar.');
      const index = JSON.parse(raw) as GameIndex;
      const plan = planDownload(index, { quality, dlcOff });
      const state = await readState();
      // nur behalten, was zum aktuellen Stand des Servers passt
      const fit = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([k, t]) => index.f[k]?.[1] === t));
      Object.assign(state, { enabled: true, quality, dlcOff, files: fit(state.files), partial: fit(state.partial) });
      const est = await navigator.storage.estimate?.().catch(() => undefined);
      const need = plan.bytes - doneBytes(plan.files, state.files);
      if (est?.quota && est.usage !== undefined && need > est.quota - est.usage)
        throw new Error(`Zu wenig Speicher: gebraucht ${(need / 2 ** 30).toFixed(1)} GB, frei ${((est.quota - est.usage) / 2 ** 30).toFixed(1)} GB.`);
      await call({ type: 'write', name: 'index.json', text: raw });
      await saveState(state);
      try { localStorage.setItem('fnv.quality', quality); localStorage.setItem('fonv.offline', '1'); } catch { /* egal */ }
      await swCall('reload');
      void swCall('sync');                                   // Spielstände vom Server holen, ab dann auf dem Gerät

      await cacheApp(state, report);

      const todo = plan.files.filter((f) => state.files[f.key] !== f.mtime);
      const total = plan.bytes;
      const base = plan.bytes - todo.reduce((s, f) => s + f.size, 0);
      const inFlight = new Map<string, number>();
      let saveTimer = 0;
      const saveSoon = () => {
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => void saveState(state), 1500);
      };
      let last = 0;
      onWorkerEvent = (m) => {
        if (m.type === 'file') { state.partial[m.key] = m.mtime!; saveSoon(); }
        else if (m.type === 'progress') inFlight.set(m.key, m.done!);
        else if (m.type === 'fileDone') {
          inFlight.delete(m.key);
          delete state.partial[m.key];
          state.files[m.key] = m.mtime!;
          saveSoon();
        }
        const t = Date.now();
        if (t - last > 400 || m.type === 'fileDone') {
          last = t;
          const done = doneBytes(plan.files, state.files) + [...inFlight.values()].reduce((s, v) => s + v, 0);
          report({ phase: 'game', done: Math.max(base, done), total, file: m.key?.replace('/game/', '') });
        }
      };
      let result: unknown;
      try {
        result = await call({ type: 'download', files: todo, partial: state.partial });
      } finally {
        onWorkerEvent = null;
        clearTimeout(saveTimer);
        await saveState(state);
        await swCall('reload').catch(() => undefined);
      }
      // fertig: Dateien, die nicht mehr zum Plan gehören (z. B. die großen Archive nach dem Wechsel auf Niedrig), löschen
      if (result !== 'stopped') {
        const keep = new Set(plan.files.map((f) => f.key));
        for (const key of Object.keys(state.files)) {
          if (keep.has(key)) continue;
          await removeFile(key).catch(() => undefined);
          delete state.files[key];
        }
        await saveState(state);
        await swCall('reload').catch(() => undefined);
      }
      const done = doneBytes(plan.files, state.files);
      report({ phase: result === 'stopped' ? 'stopped' : 'done', done, total });
    } catch (e) {
      report({ phase: 'error', done: 0, total: 0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

// ---- Spielstände / Löschen ------------------------------------------------------------------------------------------
export async function syncNow(): Promise<SyncStatus['last']> {
  await ensureServiceWorker();
  return swCall<NonNullable<SyncStatus['last']>>('sync');
}
export async function syncStatus(): Promise<SyncStatus | null> {
  try {
    if (!navigator.serviceWorker?.controller) return null;
    return await swCall<SyncStatus>('status', 5000);
  } catch {
    return null;
  }
}

/** Spieldaten vom Gerät löschen. Spielstände vorher hochladen; gelingt das nicht, bleiben sie auf dem Gerät. */
export async function removeOffline(): Promise<{ savesKept: boolean }> {
  stopDownload();
  let savesKept = false;
  try {
    const r = await syncNow();
    const st = await syncStatus();
    savesKept = !r?.ok || (st?.pending ?? 0) > 0;
  } catch {
    savesKept = true;
  }
  worker?.terminate();
  worker = null;
  await (await navigator.storage.getDirectory()).removeEntry('fnv', { recursive: true }).catch(() => undefined);
  await caches.delete('fonv-app');
  await caches.delete('fonv-api');
  if (!savesKept) indexedDB.deleteDatabase('fonv-offline');
  try { localStorage.removeItem('fonv.offline'); } catch { /* egal */ }
  for (const reg of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await reg.unregister();
  return { savesKept };
}
