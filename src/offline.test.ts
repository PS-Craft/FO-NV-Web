import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { doneBytes, planDownload, type GameIndex } from './offline-plan';

const ix: GameIndex = {
  f: {
    '/game/falloutnv.exe': [16, 1],
    '/game/data/falloutnv.esm': [200, 2],
    '/game/data/fallout - textures.bsa': [1000, 3],
    '/game/data/fallout - misc.bsa': [50, 4],
    '/game/data/deadmoney.esm': [30, 5],
    '/game/data/deadmoney - main.bsa': [300, 6],
    '/game/data/mobile/fallout - textures.bsa': [100, 7],
    '/game/data/shaders/shaderpackage013.sdp': [2, 8],
  },
  d: {},
};
const keys = (p: { files: { key: string }[] }) => p.files.map((f) => f.key).sort();

describe('planDownload', () => {
  it('Hoch: Original-Archive, keine kleinen Archive', () => {
    const p = planDownload(ix, { quality: 'high', dlcOff: [] });
    expect(keys(p)).not.toContain('/game/data/mobile/fallout - textures.bsa');
    expect(keys(p)).toContain('/game/data/fallout - textures.bsa');
    expect(p.bytes).toBe(16 + 200 + 1000 + 50 + 30 + 300 + 2);
  });
  it('Niedrig: kleine Archive statt der großen, Rest unverändert', () => {
    const p = planDownload(ix, { quality: 'low', dlcOff: [] });
    expect(keys(p)).toContain('/game/data/mobile/fallout - textures.bsa');
    expect(keys(p)).not.toContain('/game/data/fallout - textures.bsa');
    expect(keys(p)).toContain('/game/data/fallout - misc.bsa'); // kein kleines Gegenstück
  });
  it('ausgeschaltete DLCs werden nicht geladen', () => {
    const p = planDownload(ix, { quality: 'high', dlcOff: ['DeadMoney'] });
    expect(keys(p).some((k) => k.includes('deadmoney'))).toBe(false);
    expect(keys(p)).toContain('/game/data/shaders/shaderpackage013.sdp');
  });
  it('doneBytes zählt nur Dateien in der geladenen Fassung (mtime)', () => {
    const p = planDownload(ix, { quality: 'high', dlcOff: [] });
    expect(doneBytes(p.files, { '/game/data/falloutnv.esm': 2, '/game/falloutnv.exe': 999 })).toBe(200);
  });
});

// public/offline-core.js läuft im Service Worker; hier in einem eigenen Kontext geladen
const ctx: { FnvOffline?: any } = {};
runInNewContext(readFileSync(new URL('../public/offline-core.js', import.meta.url), 'utf8'), ctx);
const Core = ctx.FnvOffline;

describe('offline-core', () => {
  it('Pfade', () => {
    expect(Core.gameKey('/game/Data/X.ESM/')).toBe('/game/data/x.esm');
    expect(Core.gameKey('/docs/x')).toBeNull();
    expect(Core.docsRel('/DOCS/My Games/FalloutNV/Saves/a.fos')).toBe('My Games/FalloutNV/Saves/a.fos');
    expect(Core.docsRel('/docs')).toBe('');
    expect(Core.docsRel('/docs/../x')).toBeNull();
    expect(Core.docsRel('/game/x')).toBeNull();
  });

  it('Abgleich: holen, hochladen, löschen, Konflikt', () => {
    const server = {
      'a.fos': { name: 'a.fos', size: 1, mtime: 10 },   // unverändert
      'b.fos': { name: 'b.fos', size: 1, mtime: 20 },   // dort geändert
      'c.fos': { name: 'c.fos', size: 1, mtime: 30 },   // dort geändert, hier auch
      'n.fos': { name: 'n.fos', size: 1, mtime: 40 },   // dort neu
      'r.fos': { name: 'r.fos', size: 1, mtime: 50 },   // hier gelöscht, dort geändert
    };
    const local = ['a.fos', 'b.fos', 'c.fos', 'gone.fos', 'mine.fos'];
    const seen = { 'a.fos': { srv: 10 }, 'b.fos': { srv: 11 }, 'c.fos': { srv: 12 }, 'gone.fos': { srv: 1 }, 'r.fos': { srv: 2 } };
    const dirty = { 'c.fos': 'w', 'r.fos': 'd' };
    const plan = Core.syncPlan(server, local, seen, dirty);
    expect(plan.download.sort()).toEqual(['b.fos', 'n.fos', 'r.fos']);
    expect(plan.conflict).toEqual(['c.fos']);
    expect(plan.deleteLocal).toEqual(['gone.fos']);
    expect(plan.markDirty).toEqual(['mine.fos']);
  });

  it('erster Abgleich auf leerem Gerät holt alles', () => {
    const plan = Core.syncPlan({ 'x.ini': { name: 'X.ini', size: 1, mtime: 5 } }, [], {}, {});
    expect(plan.download).toEqual(['x.ini']);
  });

  it('Konflikt-Kopie behält die Endung', () => {
    const d = new Date(2026, 10, 9, 18, 30);
    expect(Core.conflictName('Saves/Save 3.fos', d)).toBe('Saves/Save 3 (Cloud 2026-11-09 1830).fos');
    expect(Core.conflictName('Saves/noext', d)).toBe('Saves/noext (Cloud 2026-11-09 1830)');
  });
});
