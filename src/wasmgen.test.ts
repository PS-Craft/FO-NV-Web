import { describe, expect, it } from 'vitest';
import { makeModule, PAGES_PER_GB } from './wasmgen';

describe('makeModule', () => {
  it('erzeugt gültige Module der gewünschten Größe mit geteiltem Speicher', async () => {
    const bytes = makeModule(2 * 1024 * 1024, 16);
    expect(WebAssembly.validate(bytes as Uint8Array<ArrayBuffer>)).toBe(true);
    expect(Math.abs(bytes.length - 2 * 1024 * 1024)).toBeLessThan(64 * 1024);
    const memory = new WebAssembly.Memory({ initial: 16, maximum: 16, shared: true });
    const module = await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>);
    const instance = await WebAssembly.instantiate(module, { env: { mem: memory } });
    expect(typeof (instance.exports.run as (a: number, b: number) => number)(0, 1)).toBe('number');
  });
  it('rechnet Seiten pro GB richtig', () => {
    expect(PAGES_PER_GB * 65536).toBe(1024 ** 3);
  });
});

describe('makeModule mit Riesenfunktionen', () => {
  it('exportiert g0.. und bleibt gültig', async () => {
    const bytes = makeModule(1024 * 1024, 16, [256 * 1024, 128 * 1024]) as Uint8Array<ArrayBuffer>;
    expect(WebAssembly.validate(bytes)).toBe(true);
    const memory = new WebAssembly.Memory({ initial: 16, maximum: 16, shared: true });
    const instance = await WebAssembly.instantiate(await WebAssembly.compile(bytes), { env: { mem: memory } });
    expect(Object.keys(instance.exports).sort()).toEqual(['g0', 'g1', 'run']);
    expect(typeof (instance.exports.g1 as (a: number, b: number) => number)(0, 1)).toBe('number');
  });
});
