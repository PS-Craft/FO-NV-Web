// Ein Thread wie bei Emscripten-pthreads: bekommt das übersetzte Modul und den geteilten Speicher,
// instanziiert es und führt Code aus. Mit hotMs > 0 laufen die riesigen Funktionen (g0, g1, …) so lange
// in einer Schleife, dass Safari sie in schnelleren Code nachübersetzt (das kostet viel Speicher).
self.onmessage = async (e: MessageEvent<{ module: WebAssembly.Module; memory: WebAssembly.Memory; id: number; hotMs?: number }>) => {
  const { module, memory, id, hotMs = 0 } = e.data;
  try {
    const t = performance.now();
    const inst = await WebAssembly.instantiate(module, { env: { mem: memory } });
    const ex = inst.exports as Record<string, (a: number, b: number) => number>;
    ex.run!(id * 4096, id);
    const giants = Object.keys(ex).filter((k) => /^g\d+$/.test(k));
    let calls = 0;
    const end = performance.now() + hotMs;
    while (giants.length && performance.now() < end) {
      for (const g of giants) ex[g]!((id * 8192 + calls * 64) % (1 << 20), calls);
      calls++;
    }
    (self as unknown as Worker).postMessage({ ok: true, ms: performance.now() - t, calls });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
