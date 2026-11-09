// Welche Dateien des Server-Index (fs.php /fs/index) der Datenmanager auf das Gerät lädt. Reine Logik (getestet).

/** Index der Installation: Schlüssel klein geschrieben ("/game/data/falloutnv.esm") -> [Größe, mtime]; Ordnerlisten */
export interface GameIndex {
  f: Record<string, [number, number]>;
  d: Record<string, string[]>;
}
export interface PlanFile {
  key: string;
  size: number;
  mtime: number;
}
export type Quality = 'high' | 'low';

const MOBILE = '/game/data/mobile/';
const DATA = '/game/data/';

/**
 * high: die Original-Archive; low: für Texturen und Sounds die kleinen Archive aus fnv-mobile (wie die Spielseite
 * mit Qualität "Low" sie liest). dlcOff: Namen ausgeschalteter DLCs (klein, z. B. "deadmoney") – deren Dateien in
 * Data/ werden nicht geladen.
 */
export function planDownload(ix: GameIndex, opts: { quality: Quality; dlcOff: string[] }): { files: PlanFile[]; bytes: number } {
  const off = opts.dlcOff.map((n) => n.toLowerCase());
  const files: PlanFile[] = [];
  for (const [key, [size, mtime]] of Object.entries(ix.f)) {
    const base = key.slice(key.lastIndexOf('/') + 1);
    if (key.startsWith(MOBILE)) {
      if (opts.quality !== 'low') continue;
    } else if (key.startsWith(DATA) && key.lastIndexOf('/') === DATA.length - 1) {
      if (opts.quality === 'low' && base.endsWith('.bsa') && ix.f[MOBILE + base]) continue;
      if (off.some((n) => base.startsWith(n))) continue;
    }
    if (key.startsWith(MOBILE) && off.some((n) => base.startsWith(n))) continue;
    files.push({ key, size, mtime });
  }
  files.sort((a, b) => a.size - b.size || a.key.localeCompare(b.key));
  return { files, bytes: files.reduce((s, f) => s + f.size, 0) };
}

/** Bytes, die davon schon vollständig auf dem Gerät liegen (state.files: key -> mtime der geladenen Fassung) */
export function doneBytes(files: PlanFile[], have: Record<string, number>): number {
  return files.reduce((s, f) => s + (have[f.key] === f.mtime ? f.size : 0), 0);
}
