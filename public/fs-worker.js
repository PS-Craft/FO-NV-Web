// FO-NV-Web: liest Spieldateien vom Gerät (OPFS) direkt in den Speicher des Spiels – ohne Service Worker und HTTP.
//
// Vorher ging jeder Block (256 KB – 1 MB) als synchrone Anfrage über sw.js: auf dem PC ~6 ms je Block, beim Laden
// einer Welt ~1600 Blöcke nacheinander, und der Hauptfaden des Spiels wartete darauf. Jetzt: die Engine
// (pc/patches/0006) legt einen Auftrag in eine Warteschlange im gemeinsamen WebAssembly-Speicher, weckt diesen Worker
// mit Atomics, er liest die Datei mit FileReaderSync und schreibt die Bytes gleich an die Zielstelle.
// Alles, was er nicht liefern kann (Datei nicht vollständig geladen, Fehler), beantwortet er mit -1: dann fragt die
// Engine wie bisher über HTTP/sw.js. Gestartet von der Engine, nur wenn die Seite fonvFsWorker setzt (Daten vom Gerät).
//
// Warteschlange (Int32-Indizes ab q): [q] bereit, [q+1] Klingel, ab q+4 16 Plätze zu je 72 Int32:
//   [0] Zustand 0 frei, 1 wird gefüllt, 2 Auftrag, 4 in Arbeit, 5 schreibt, 3 fertig, 6 abgebrochen   [1] Länge des Pfads   [2] Offset (untere
//   32 Bit)  [3] Offset (obere)  [4] Länge  [5] Ziel (Adresse)  [6] Ergebnis (Bytes oder -1)  [8..] Pfad (UTF-8)
'use strict';
importScripts('offline-core.js');
var Core = self.FnvOffline;
var SLOTS = 16, SLOT = 72;
var H8, H32, q;
var files = new Map();       // Schlüssel -> File (Momentaufnahme) oder null (nicht vom Gerät)
var st = null;
var stAt = 0, stRaw = '';
var reader = typeof FileReaderSync !== 'undefined' ? new FileReaderSync() : null;
var dec = new TextDecoder();

async function fnvDir() { return (await navigator.storage.getDirectory()).getDirectoryHandle('fnv'); }
// wie sw.js localFile: nur vollständig geladene Dateien, deren Stand zum Index passt
async function fileFor(key) {
  if (files.has(key)) return files.get(key);
  var f = null;
  try {
    var want = st.index.f[key];
    if (want && st.files[key] === want[1]) {
      var dir = await fnvDir();
      var parts = key.slice(1).split('/');
      for (var i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
      var file = await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
      if (file.size === want[0]) f = file;
    }
  } catch (e) { f = null; }
  files.set(key, f);
  return f;
}

async function serve(s) {
  var n = H32[s + 1];
  var key = Core.gameKey(dec.decode(H8.slice((s + 8) * 4, (s + 8) * 4 + n)));
  var len = H32[s + 4], dst = H32[s + 5] >>> 0, off = (H32[s + 2] >>> 0) + (H32[s + 3] >>> 0) * 4294967296;
  var buf = null;
  try {
    var file = key ? await fileFor(key) : null;
    if (file) {
      var part = file.slice(off, off + len);
      buf = reader ? reader.readAsArrayBuffer(part) : await part.arrayBuffer();
    }
  } catch (e) {
    if (key) files.set(key, null);      // Datei wurde ersetzt o. Ä.: ab jetzt über den Server
    buf = null;
  }
  // nur antworten, solange das Spiel noch wartet (4 -> 5); hat es aufgegeben (6), gehört dst nicht mehr ihm
  if (Atomics.compareExchange(H32, s, 4, 5) !== 4) { Atomics.store(H32, s, 0); return; }
  var got = -1;
  if (buf) {
    try { got = Math.min(buf.byteLength, len); H8.set(new Uint8Array(buf, 0, got), dst); } catch (e) { got = -1; }
  }
  H32[s + 6] = got;
  Atomics.store(H32, s, 3);
  Atomics.notify(H32, s);
}

// wie sw.js: der Datenmanager kann Dateien neu laden oder fertig laden – Stand höchstens alle 10 s neu lesen
async function loadState() {
  stAt = Date.now();
  var dir = await fnvDir();
  var raw = await (await (await dir.getFileHandle('state.json')).getFile()).text();
  if (raw === stRaw && st) return !!st;
  var s = JSON.parse(raw), index = JSON.parse(await (await (await dir.getFileHandle('index.json')).getFile()).text());
  stRaw = raw;
  files.clear();
  st = s && s.enabled && index ? { files: s.files || {}, index: index } : null;
  return !!st;
}

async function loop() {
  var seen = Atomics.load(H32, q + 1);
  for (;;) {
    if (Date.now() - stAt > 10000) { try { await loadState(); } catch (e) { /* alter Stand bleibt */ } }
    for (var i = 0; i < SLOTS; i++) {
      var s = q + 4 + i * SLOT;
      if (Atomics.compareExchange(H32, s, 2, 4) === 2) await serve(s).catch(function () { /* das Spiel nimmt nach 30 s den Server */ });
    }
    var w = Atomics.waitAsync(H32, q + 1, seen, 1000);
    if (w.async) await w.value;
    seen = Atomics.load(H32, q + 1);
  }
}

self.onmessage = async function (e) {
  var m = e.data;
  if (!m || !m.buf || H32) return;
  H8 = new Uint8Array(m.buf);
  H32 = new Int32Array(m.buf);
  q = m.q >>> 2;
  if (!Atomics.waitAsync) return;                 // alte Browser: die Engine bleibt beim Server-Weg
  try { if (!(await loadState())) return; } catch (e) { return; }
  Atomics.add(H32, q, 1);                          // bereit (zählt die Worker)
  loop();
};
