// Erzeugt synthetische WebAssembly-Module, die dem nachgebauten Spiel ähneln: sehr viele Funktionen mit
// Speicherzugriffen, Rechnungen, Verzweigungen und Aufrufen, dazu ein importierter *geteilter* Speicher
// (wie bei Emscripten mit pthreads). Damit lässt sich messen, ob Safari ein Modul dieser Größe übersetzt.

function leb(n: number, out: number[]): void {
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n !== 0) b |= 0x80;
    out.push(b);
  } while (n !== 0);
}
function sleb(n: number, out: number[]): void {
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) {
      out.push(b);
      return;
    }
    out.push(b | 0x80);
  }
}
function section(id: number, body: number[] | Uint8Array): Uint8Array {
  const head: number[] = [id];
  leb(body.length, head);
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
}
function str(s: string, out: number[]): void {
  leb(s.length, out);
  for (const c of s) out.push(c.charCodeAt(0));
}

/** Ein Funktionsrumpf von ungefähr `bytes` Bytes. */
function body(index: number, bytes: number, calls = true): number[] {
  const code: number[] = [];
  let rep = 0;
  while (code.length < bytes) {
    const off = ((index * 977 + rep * 64) % 65536) * 4;
    code.push(0x20, 0x00, 0x28, 0x02); leb(off, code);            // local.get 0; i32.load
    code.push(0x20, 0x01, 0x6a, 0x22, 0x02);                         // local.get 1; i32.add; local.tee 2
    code.push(0x41); sleb((index * 31 + rep) & 0xffff, code);         // i32.const
    code.push(0x73, 0x21, 0x01);                                     // i32.xor; local.set 1
    code.push(0x20, 0x00, 0x20, 0x02, 0x36, 0x02); leb(off + 4, code); // i32.store
    code.push(0x20, 0x01, 0x41, 0x01, 0x71, 0x04, 0x40);             // if (l1 & 1)
    code.push(0x20, 0x02, 0x41, 0x03, 0x6c, 0x21, 0x03, 0x0b);       //   l3 = l2 * 3; end
    if (calls && index % 16 !== 0 && rep === 39) {                            // einmal die Vorgängerin aufrufen (Tiefe ≤ 16)
      code.push(0x20, 0x00, 0x20, 0x01, 0x10); leb(index - 1, code); code.push(0x21, 0x01);
    }
    rep++;
  }
  code.push(0x20, 0x01, 0x0b);                                       // local.get 1; end
  const fn: number[] = [];
  const locals = [0x01, 0x02, 0x7f];                                 // 2 zusätzliche i32-Locals
  leb(locals.length + code.length, fn);
  return fn.concat(locals, code);
}

/**
 * @param totalBytes ungefähre Größe des Moduls
 * @param memPages   Seiten (64 KB) des importierten, geteilten Speichers (min = max)
 */
export function makeModule(totalBytes: number, memPages: number, giants: number[] = []): Uint8Array {
  const fnBytes = 4096;
  const giantTotal = giants.reduce((a, b) => a + b, 0);
  const small = Math.max(1, Math.round(Math.max(0, totalBytes - giantTotal) / fnBytes));
  const count = small + giants.length;
  const type = [0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f];           // (i32, i32) -> i32
  const imp: number[] = [0x01];
  str('env', imp); str('mem', imp);
  imp.push(0x02, 0x03); leb(memPages, imp); leb(memPages, imp);       // memory, shared, min = max
  const fns: number[] = []; leb(count, fns); for (let i = 0; i < count; i++) fns.push(0x00);
  // run = letzte kleine Funktion; g0, g1, … = die riesigen Funktionen (zum Heißlaufen in Threads)
  const exp: number[] = []; leb(1 + giants.length, exp);
  str('run', exp); exp.push(0x00); leb(small - 1, exp);
  giants.forEach((_, k) => { str('g' + k, exp); exp.push(0x00); leb(small + k, exp); });
  const parts: Uint8Array[] = [];
  const codeHead: number[] = []; leb(count, codeHead);
  parts.push(new Uint8Array(codeHead));
  let codeLen = codeHead.length;
  for (let i = 0; i < count; i++) {
    const b = new Uint8Array(i < small ? body(i, fnBytes) : body(i, giants[i - small]!, false));
    parts.push(b);
    codeLen += b.length;
  }
  const code = new Uint8Array(codeLen);
  let o = 0;
  for (const p of parts) { code.set(p, o); o += p.length; }
  const secs = [
    new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
    section(1, type), section(2, imp), section(3, fns), section(7, exp), section(10, code),
  ];
  const out = new Uint8Array(secs.reduce((n, s) => n + s.length, 0));
  o = 0;
  for (const s of secs) { out.set(s, o); o += s.length; }
  return out;
}

export const PAGES_PER_GB = 16384;
