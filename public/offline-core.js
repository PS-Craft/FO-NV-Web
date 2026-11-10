// FO-NV-Web: reine Logik des Offline-Betriebs, geteilt von sw.js (importScripts) und den Tests (src/offline-core.test.ts).
// Kein DOM, kein Netz, keine Speicher-API – nur Rechnen.
(function (g) {
  'use strict';

  /** '/game/Data/X.esm' -> '/game/data/x.esm' (Schlüssel im Index), sonst null */
  function gameKey(p) {
    var k = String(p || '').toLowerCase();
    while (k.length > 1 && k.charAt(k.length - 1) === '/') k = k.slice(0, -1);
    return k === '/game' || k.indexOf('/game/') === 0 ? k : null;
  }

  /** '/docs/My Games/x.ini' -> 'My Games/x.ini' ('' = Wurzel), sonst null. '.', '..' und Backslashes sind ungültig. */
  function docsRel(p) {
    var m = /^\/docs(\/.*)?$/i.exec(String(p || ''));
    if (!m) return null;
    var parts = (m[1] || '').split('/').filter(function (s) { return s.length > 0; });
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '.' || parts[i] === '..' || parts[i].indexOf('\\') >= 0 || parts[i].indexOf('\0') >= 0) return null;
    }
    return parts.join('/');
  }

  /**
   * Abgleich der Spielstände (Ordner /docs) zwischen Gerät und Server.
   *   server: { key: { name, size, mtime } }  – Dateien auf dem Server (key = Pfad klein geschrieben)
   *   local:  Array der Schlüssel aller Dateien auf dem Gerät
   *   seen:   { key: { srv } }                 – Server-mtime beim letzten Abgleich dieser Datei
   *   dirty:  { key: 'w' | 'd' }               – auf dem Gerät geändert ('w') oder gelöscht ('d'), noch nicht hochgeladen
   * Ergebnis: download (Server-Stand holen), conflict (beide Seiten geändert: Server-Stand als Kopie holen, eigener
   * Stand wird danach hochgeladen), deleteLocal (auf dem Server gelöscht), markDirty (nur hier vorhanden: hochladen).
   * Nichts geht verloren: Bei Zweifel bleiben beide Stände erhalten.
   */
  function syncPlan(server, local, seen, dirty) {
    var plan = { download: [], conflict: [], deleteLocal: [], markDirty: [] };
    var have = {};
    for (var i = 0; i < local.length; i++) have[local[i]] = true;
    for (var k in server) {
      var s = server[k], was = seen[k], d = dirty[k];
      // eigener, unterbrochener Upload (sw.js push): der halbe Stand auf dem Server ist kein fremder – kein Konflikt,
      // die Datei wird einfach noch einmal hochgeladen
      if (was && was.pushing && d === 'w') continue;
      var changed = !was || was.srv !== s.mtime;
      if (!changed) continue;
      if (d === 'w' && have[k]) plan.conflict.push(k);
      else plan.download.push(k);                     // auch 'd': dort geändert, also hier nicht löschen
    }
    for (var j = 0; j < local.length; j++) {
      var lk = local[j];
      if (server[lk] || dirty[lk]) continue;
      if (seen[lk]) plan.deleteLocal.push(lk);        // war abgeglichen, ist auf dem Server weg
      else plan.markDirty.push(lk);                   // nie abgeglichen: hochladen
    }
    return plan;
  }

  /** 'Saves/Save 3.fos' -> 'Saves/Save 3 (Cloud 2026-11-09 1830).fos' */
  function conflictName(name, date) {
    var d = date || new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + pad(d.getMinutes());
    var slash = name.lastIndexOf('/'), dot = name.lastIndexOf('.');
    return dot > slash + 1 ? name.slice(0, dot) + ' (Cloud ' + stamp + ')' + name.slice(dot) : name + ' (Cloud ' + stamp + ')';
  }

  g.FnvOffline = { gameKey: gameKey, docsRel: docsRel, syncPlan: syncPlan, conflictName: conflictName };
})(typeof self !== 'undefined' ? self : globalThis);
