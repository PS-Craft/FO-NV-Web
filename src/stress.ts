// Belastungstest: findet heraus, an welcher Grenze Safari auf dem iPad scheitert, wenn es die
// nachgebaute Spiel-Engine startet (geteilter Speicher, riesiges WASM-Modul, viele Threads).
// Vor jedem Schritt wird sein Name gespeichert. Stürzt der Tab ab, zeigt die Seite nach dem Neuladen,
// bei welchem Schritt das passiert ist, und macht mit dem nächsten weiter.
import { makeModule, PAGES_PER_GB } from './wasmgen';

export interface StressStep {
  id: string;
  label: string;
  run: (log: (s: string) => void) => Promise<string>;
}
export interface StressResult {
  id: string;
  label: string;
  status: 'ok' | 'fail' | 'crash';
  detail: string;
}

const KEY_PENDING = 'fonv.stress.pending';
const KEY_RESULTS = 'fonv.stress.results';
const MB = 1024 * 1024;

function store<T>(key: string, value?: T): T | undefined {
  try {
    if (value === undefined) {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privater Modus o. ä. */
  }
  return undefined;
}
function clear(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* egal */
  }
}

function sharedMemory(gb: number): WebAssembly.Memory {
  const pages = Math.round(gb * PAGES_PER_GB);
  return new WebAssembly.Memory({ initial: pages, maximum: pages, shared: true } as WebAssembly.MemoryDescriptor);
}

/** Speicher wirklich belegen (Seiten beschreiben), wie das Spiel es mit seinem Heap tut. */
function touch(mem: WebAssembly.Memory, bytes: number): void {
  const u8 = new Uint8Array(mem.buffer);
  const n = Math.min(bytes, u8.length);
  for (let i = 0; i < n; i += 4096) u8[i] = 1;
}

async function compile(mb: number, memGb: number, log: (s: string) => void, giantsMb: number[] = []) {
  let t = performance.now();
  const bytes = makeModule(mb * MB, Math.round(memGb * PAGES_PER_GB), giantsMb.map((g) => g * MB));
  log(`Modul erzeugt: ${(bytes.length / MB).toFixed(0)} MB in ${((performance.now() - t) / 1000).toFixed(1)} s`);
  t = performance.now();
  const module = await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>);
  return { module, ms: performance.now() - t };
}

async function spawnWorkers(n: number, module: WebAssembly.Module, memory: WebAssembly.Memory, hotMs = 0): Promise<number> {
  const t = performance.now();
  const workers: Worker[] = [];
  try {
    const done = Array.from({ length: n }, (_, id) => {
      const w = new Worker(new URL('./stress-worker.ts', import.meta.url), { type: 'module' });
      workers.push(w);
      return new Promise<void>((ok, fail) => {
        const timer = setTimeout(() => fail(new Error(`Thread ${id}: keine Antwort nach 180 s`)), 180000 + hotMs);
        w.onmessage = (e) => {
          clearTimeout(timer);
          if (e.data.ok) ok();
          else fail(new Error(`Thread ${id}: ${e.data.error}`));
        };
        w.onerror = (e) => {
          clearTimeout(timer);
          fail(new Error(`Thread ${id}: ${e.message || 'Fehler'}`));
        };
        w.postMessage({ module, memory, id, hotMs });
      });
    });
    await Promise.all(done);
    return performance.now() - t;
  } finally {
    for (const w of workers) w.terminate();
  }
}

const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export const STEPS: StressStep[] = [
  ...[1, 2, 3].map((gb) => ({
    id: `mem${gb}`,
    label: `Geteilter Speicher ${gb} GB anlegen, 512 MB davon belegen`,
    run: async () => {
      const m = sharedMemory(gb);
      touch(m, 512 * MB);
      return `${(m.buffer.byteLength / 1024 ** 3).toFixed(1)} GB ok`;
    },
  })),
  ...[25, 50, 100].map((mb) => ({
    id: `compile${mb}`,
    label: `WASM-Modul mit ${mb} MB Code übersetzen (Spiel: ~95 MB)`,
    run: async (log: (s: string) => void) => `übersetzt in ${s((await compile(mb, 0.25, log)).ms)}`,
  })),
  ...[16, 32, 64].map((n) => ({
    id: `workers${n}`,
    label: `${n} Threads starten (Spiel: 64)`,
    run: async (log: (s: string) => void) => {
      const memory = sharedMemory(0.25);
      const { module } = await compile(1, 0.25, log);
      return `alle bereit nach ${s(await spawnWorkers(n, module, memory))}`;
    },
  })),
  {
    id: 'game64',
    label: 'Wie das Spiel: 3 GB Speicher + 100-MB-Modul + 64 Threads',
    run: async (log) => {
      const memory = sharedMemory(3);
      touch(memory, 512 * MB);
      const { module, ms } = await compile(100, 3, log);
      log(`übersetzt in ${s(ms)}, starte Threads …`);
      return `übersetzt in ${s(ms)}, 64 Threads bereit nach ${s(await spawnWorkers(64, module, memory))}`;
    },
  },
  {
    id: 'game16',
    label: 'iPad-Variante: 2 GB Speicher + 100-MB-Modul + 16 Threads',
    run: async (log) => {
      const memory = sharedMemory(2);
      touch(memory, 512 * MB);
      const { module, ms } = await compile(100, 2, log);
      log(`übersetzt in ${s(ms)}, starte Threads …`);
      return `übersetzt in ${s(ms)}, 16 Threads bereit nach ${s(await spawnWorkers(16, module, memory))}`;
    },
  },
  // --- Runde 2: näher am echten Programm (riesige Funktionen, heißer Code auf vielen Threads) ---
  ...[1, 4, 7].map((g) => ({
    id: `giant${g}`,
    label: `Eine riesige Funktion mit ${g} MB übersetzen und heißlaufen lassen`,
    run: async (log: (s: string) => void) => {
      const memory = sharedMemory(0.25);
      const { module, ms } = await compile(g + 1, 0.25, log, [g]);
      log(`übersetzt in ${s(ms)}, lasse sie 5 s laufen …`);
      return `übersetzt in ${s(ms)}, heiß gelaufen nach ${s(await spawnWorkers(1, module, memory, 5000))}`;
    },
  })),
  {
    id: 'hot16',
    label: 'Heiß: 2 GB (1 GB belegt) + 100 MB mit 8 Riesenfunktionen + 16 Threads rechnen 10 s',
    run: async (log) => {
      const memory = sharedMemory(2);
      touch(memory, 1024 * MB);
      const { module, ms } = await compile(100, 2, log, [4, 4, 2, 2, 1, 1, 1, 1]);
      log(`übersetzt in ${s(ms)}, 16 Threads rechnen …`);
      return `übersetzt in ${s(ms)}, fertig nach ${s(await spawnWorkers(16, module, memory, 10000))}`;
    },
  },
  {
    id: 'hot64',
    label: 'Heiß wie das Spiel: 3 GB (1,5 GB belegt) + 100 MB mit 8 Riesenfunktionen + 64 Threads rechnen 10 s',
    run: async (log) => {
      const memory = sharedMemory(3);
      touch(memory, 1536 * MB);
      const { module, ms } = await compile(100, 3, log, [4, 4, 2, 2, 1, 1, 1, 1]);
      log(`übersetzt in ${s(ms)}, 64 Threads rechnen …`);
      return `übersetzt in ${s(ms)}, fertig nach ${s(await spawnWorkers(64, module, memory, 10000))}`;
    },
  },
];

/** Ergebnisse bisher; ein Schritt, der beim letzten Mal lief und nie fertig wurde, gilt als Absturz. */
export function loadResults(): StressResult[] {
  const results = store<StressResult[]>(KEY_RESULTS) ?? [];
  const pending = store<string>(KEY_PENDING);
  if (pending && !results.some((r) => r.id === pending)) {
    const step = STEPS.find((x) => x.id === pending);
    results.push({
      id: pending,
      label: step?.label ?? pending,
      status: 'crash',
      detail: 'Tab ist abgestürzt (Safari hat die Seite neu geladen)',
    });
    store(KEY_RESULTS, results);
  }
  clear(KEY_PENDING);
  return results;
}

export function resetResults(): void {
  clear(KEY_RESULTS);
  clear(KEY_PENDING);
}

/** Führt alle noch nicht erledigten Schritte nacheinander aus. */
export async function runRemaining(onUpdate: (r: StressResult[], running?: string, log?: string) => void): Promise<void> {
  const results = loadResults();
  for (const step of STEPS) {
    if (results.some((r) => r.id === step.id)) continue;
    onUpdate(results, step.label);
    store(KEY_PENDING, step.id);
    let res: StressResult;
    try {
      const detail = await step.run((line) => onUpdate(results, step.label, line));
      res = { id: step.id, label: step.label, status: 'ok', detail };
    } catch (e) {
      res = { id: step.id, label: step.label, status: 'fail', detail: String(e) };
    }
    results.push(res);
    store(KEY_RESULTS, results);
    clear(KEY_PENDING);
    onUpdate(results);
    await new Promise((r) => setTimeout(r, 500)); // Speicher freigeben lassen
  }
}
