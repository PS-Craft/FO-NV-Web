// FO-NV-Web Datenmanager: schreibt in den Gerätespeicher (OPFS, Ordner "fnv"). Läuft als eigener Worker, weil nur
// Worker überall (auch Safari) synchron und schnell in OPFS schreiben können (createSyncAccessHandle).
//
// Nachrichten (jeweils mit id, Antwort { id, ok, error? }):
//   { type: 'write', name, text }             kleine Datei (state.json, index.json) schreiben
//   { type: 'download', files, partial }      Spieldateien laden; meldet { type: 'file' | 'progress' | 'fileDone' }
//   { type: 'stop' }                          Download nach dem laufenden Stück anhalten
'use strict';
var CHUNK = 8 << 20;          // pro Anfrage (fs.php liefert bis 64 MB)
var PARALLEL = 3;
var stopped = false;

function root() {
  return navigator.storage.getDirectory().then(function (r) { return r.getDirectoryHandle('fnv', { create: true }); });
}
async function handleFor(key) {
  var dir = await root();
  var parts = key.slice(1).split('/');
  for (var i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create: true });
  return dir.getFileHandle(parts[parts.length - 1], { create: true });
}
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

async function writeText(name, text) {
  var h = await (await (await root()).getFileHandle(name, { create: true })).createSyncAccessHandle();
  try {
    var bytes = new TextEncoder().encode(text);
    h.truncate(0);
    h.write(bytes, { at: 0 });
    h.flush();
  } finally {
    h.close();
  }
}

async function chunk(f, off, n) {
  for (var attempt = 0; ; attempt++) {
    var fatal = false;
    try {
      var r = await fetch('/fs/read?p=' + encodeURIComponent(f.key) + '&o=' + off + '&n=' + n + '&v=' + f.mtime,
        { headers: { 'X-FONV-DL': '1' }, credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) {
        var b = await r.arrayBuffer();
        if (b.byteLength > 0) return b;
        throw new Error('leere Antwort');
      }
      fatal = r.status === 401 || r.status === 403 || r.status === 404;
      throw new Error('Server antwortet ' + r.status);
    } catch (e) {
      if (fatal || attempt >= 7 || stopped) throw new Error(f.key.replace('/game/', '') + ': ' + e.message);
      await sleep(Math.min(20000, 1000 * Math.pow(2, attempt)));
    }
  }
}

async function one(f, resume) {
  postMessage({ type: 'file', key: f.key, mtime: f.mtime });
  var h = await (await handleFor(f.key)).createSyncAccessHandle();
  try {
    var off = resume ? h.getSize() : 0;
    if (off > f.size) off = 0;
    h.truncate(off);
    postMessage({ type: 'progress', key: f.key, done: off });
    while (off < f.size) {
      if (stopped) return;
      var b = await chunk(f, off, Math.min(CHUNK, f.size - off));
      h.write(new Uint8Array(b), { at: off });
      off += b.byteLength;
      postMessage({ type: 'progress', key: f.key, done: off });
    }
    h.flush();
  } finally {
    h.close();
  }
  if (!stopped) postMessage({ type: 'fileDone', key: f.key, mtime: f.mtime });
}

async function download(files, partial) {
  stopped = false;
  var next = 0;
  var lane = async function () {
    while (!stopped && next < files.length) {
      var f = files[next++];
      await one(f, partial[f.key] === f.mtime);
    }
  };
  var lanes = [];
  for (var i = 0; i < PARALLEL; i++) lanes.push(lane());
  try {
    await Promise.all(lanes);
  } catch (e) {
    stopped = true;                 // die anderen Spuren auch anhalten
    await Promise.allSettled(lanes);
    throw e;
  }
  return stopped ? 'stopped' : 'done';
}

onmessage = function (e) {
  var m = e.data || {};
  if (m.type === 'stop') { stopped = true; return; }
  var job = m.type === 'write' ? writeText(m.name, m.text).then(function () { return null; })
    : m.type === 'download' ? download(m.files, m.partial || {})
    : Promise.reject(new Error('unbekannt: ' + m.type));
  job.then(function (result) { postMessage({ id: m.id, ok: true, result: result }); },
    function (err) { postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) }); });
};
