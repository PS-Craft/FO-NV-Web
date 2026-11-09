// iPad-/Browser-Systemcheck: beantwortet die Machbarkeitsfragen aus Meilenstein M1
// direkt auf dem Gerät des Nutzers. Ergebnis ist als JSON kopierbar.
import { formatBytes } from './format';

export type Status = 'ok' | 'warn' | 'fail';
export interface CheckItem {
  id: string;
  label: string;
  status: Status;
  detail: string;
}

/** Mindestens 8 GB freier Speicher werden für Basisspiel + DLCs gebraucht. */
export const REQUIRED_STORAGE = 8 * 1024 ** 3;

export function rateStorage(quota: number | undefined): Status {
  if (quota == null) return 'warn';
  if (quota >= REQUIRED_STORAGE) return 'ok';
  if (quota >= REQUIRED_STORAGE / 2) return 'warn';
  return 'fail';
}

export function overall(items: CheckItem[]): Status {
  if (items.some((i) => i.status === 'fail')) return 'fail';
  if (items.some((i) => i.status === 'warn')) return 'warn';
  return 'ok';
}

type GPUAdapterLike = { features: Set<string>; limits: Record<string, number> };

async function checkWebGPU(): Promise<CheckItem> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GPUAdapterLike | null> } }).gpu;
  if (!gpu) return { id: 'webgpu', label: 'WebGPU', status: 'warn', detail: 'nicht verfügbar – WebGL2-Fallback' };
  try {
    const a = await gpu.requestAdapter();
    if (!a) return { id: 'webgpu', label: 'WebGPU', status: 'warn', detail: 'kein Adapter' };
    const fmts = ['texture-compression-bc', 'texture-compression-astc', 'texture-compression-etc2'].filter((f) =>
      a.features.has(f),
    );
    return {
      id: 'webgpu',
      label: 'WebGPU',
      status: 'ok',
      detail: `Texturformate: ${fmts.join(', ') || 'keine komprimierten'}; maxTexture2D ${a.limits.maxTextureDimension2D}; maxBuffer ${formatBytes(a.limits.maxBufferSize)}`,
    };
  } catch (e) {
    return { id: 'webgpu', label: 'WebGPU', status: 'warn', detail: String(e) };
  }
}

function checkWebGL2(): CheckItem {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { id: 'webgl2', label: 'WebGL2', status: 'fail', detail: 'nicht verfügbar' };
  const ext = ['WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc'].filter(
    (e) => gl.getExtension(e),
  );
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return {
    id: 'webgl2',
    label: 'WebGL2',
    status: 'ok',
    detail: `${renderer}; Erweiterungen: ${ext.join(', ') || 'keine'}`,
  };
}

async function checkStorage(): Promise<CheckItem[]> {
  const out: CheckItem[] = [];
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  out.push({
    id: 'quota',
    label: 'Speicherkontingent',
    status: rateStorage(est?.quota),
    detail: `frei laut Browser: ${formatBytes(est?.quota)}, belegt: ${formatBytes(est?.usage)} (benötigt ~${formatBytes(REQUIRED_STORAGE)})`,
  });
  let opfs: CheckItem;
  try {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle('.probe', { create: true });
    await root.removeEntry('.probe');
    opfs = { id: 'opfs', label: 'OPFS (lokaler Dateispeicher)', status: fh ? 'ok' : 'fail', detail: 'lesen/schreiben möglich' };
  } catch (e) {
    opfs = { id: 'opfs', label: 'OPFS (lokaler Dateispeicher)', status: 'fail', detail: String(e) };
  }
  out.push(opfs);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  out.push({
    id: 'persist',
    label: 'Dauerhafter Speicher',
    status: persisted ? 'ok' : 'warn',
    detail: persisted ? 'gewährt' : 'nicht gewährt – App zum Home-Bildschirm hinzufügen und „Speicher sichern" tippen',
  });
  return out;
}

function checkAudio(): CheckItem {
  const a = document.createElement('audio');
  const r = (t: string) => a.canPlayType(t) || 'nein';
  const ogg = a.canPlayType('audio/ogg; codecs="vorbis"');
  return {
    id: 'audio',
    label: 'Audio-Formate',
    status: ogg ? 'ok' : 'warn',
    detail: `OGG Vorbis: ${r('audio/ogg; codecs="vorbis"')}, MP3: ${r('audio/mpeg')}, WAV: ${r('audio/wav')}${ogg ? '' : ' → WASM-Decoder für Stimmen nötig'}`,
  };
}

function checkMisc(): CheckItem[] {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return [
    {
      id: 'pwa',
      label: 'Als App installiert',
      status: standalone ? 'ok' : 'warn',
      detail: standalone ? 'ja (Vollbild, Speicher geschützt)' : 'nein – in Safari: Teilen → „Zum Home-Bildschirm"',
    },
    {
      id: 'coi',
      label: 'Cross-Origin-Isolation (WASM-Threads)',
      status: crossOriginIsolated ? 'ok' : 'warn',
      detail: crossOriginIsolated ? 'aktiv, SharedArrayBuffer verfügbar' : 'inaktiv – Seite einmal neu laden',
    },
    {
      id: 'wasm',
      label: 'WebAssembly',
      status: typeof WebAssembly === 'object' ? 'ok' : 'fail',
      detail: `SIMD: ${WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])) ? 'ja' : 'nein'}`,
    },
    {
      id: 'input',
      label: 'Eingabe',
      status: 'ok',
      detail: `Touchpunkte: ${navigator.maxTouchPoints}, Gamepad-API: ${'getGamepads' in navigator ? 'ja' : 'nein'}, Pointer Lock: ${'requestPointerLock' in Element.prototype ? 'ja' : 'nein'}`,
    },
    {
      id: 'device',
      label: 'Gerät',
      status: 'ok',
      detail: `${navigator.userAgent}; Bildschirm ${screen.width}×${screen.height} @${devicePixelRatio}x; Kerne ${navigator.hardwareConcurrency ?? '?'}`,
    },
  ];
}

export async function runSystemCheck(): Promise<CheckItem[]> {
  return [await checkWebGPU(), checkWebGL2(), ...(await checkStorage()), checkAudio(), ...checkMisc()];
}
