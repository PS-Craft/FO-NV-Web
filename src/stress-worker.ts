// Ein Thread wie bei Emscripten-pthreads: bekommt das übersetzte Modul und den geteilten Speicher,
// instanziiert es und führt kurz Code aus.
self.onmessage = async (e: MessageEvent<{ module: WebAssembly.Module; memory: WebAssembly.Memory; id: number }>) => {
  const { module, memory, id } = e.data;
  try {
    const t = performance.now();
    const inst = await WebAssembly.instantiate(module, { env: { mem: memory } });
    (inst.exports.run as (a: number, b: number) => number)(id * 4096, id);
    (self as unknown as Worker).postMessage({ ok: true, ms: performance.now() - t });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
