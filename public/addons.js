// FO-NV-Web: Ergänzungen für die Spielseite (game.html). tools/assemble.mjs bindet diese Datei ein.
// - Spielstände: Die Engine hält alles, was das Spiel unter /docs schreibt, nur in diesem Tab (pal_fs_web.cpp); ihr
//   Server-Modus (FNV_DOCS=server) bleibt beim Start hängen. Diese Datei lädt deshalb jeden neuen oder geänderten
//   Spielstand (.fos) selbst hoch, sobald er fertig geschrieben ist – mit Offline-Daten über sw.js zuerst aufs Gerät,
//   von dort in die Cloud.
// - Anzeige (fonv.display, in der App wählbar): "fullscreen" (Vollbild ab dem ersten Tippen/Klicken), "window"
//   (randlos im Fenster) – beide ohne Leisten und Knöpfe –, "classic" (Seite mit Leiste und Knöpfen).
// - Menü: Taste F8 oder oben in der Mitte tippen (dort liegt ein unsichtbarer Knopf; mit der Maus erscheint er).
// - Cheats laufen über die Spielkonsole (Module.ccall('fnv_console', …)), freigeschaltet per Cheat-Passwort.
(function () {
  'use strict';
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* egal */ } },
  };

  var css = [
    'html.fonv-borderless, html.fonv-borderless body { background:#000; height:100%; margin:0; overflow:hidden; }',
    'html.fonv-borderless #wrap { max-width:none; padding:0; height:100%; display:flex; align-items:center; justify-content:center; }',
    'html.fonv-borderless #bar, html.fonv-borderless #saves { display:none; }',
    'html.fonv-clean #fonv-btn { opacity:0; transition:opacity .2s; }',
    'html.fonv-clean.fonv-peek #fonv-btn, html.fonv-clean #fonv-btn:focus-visible { opacity:1; }',
    'html.fonv-borderless #stage { width:min(100vw, calc(100dvh * 16 / 9)); }',
    '#fonv-btn { position:fixed; top:calc(env(safe-area-inset-top) + 4px); left:50%; transform:translateX(-50%); z-index:60;',
    '  width:44px; height:22px; border:0; border-radius:11px; background:rgba(20,16,12,.45); color:rgba(241,227,200,.8);',
    '  font:600 14px/22px -apple-system,system-ui,sans-serif; padding:0; touch-action:manipulation; }',
    '#fonv-panel { position:fixed; top:calc(env(safe-area-inset-top) + 32px); left:50%; transform:translateX(-50%); z-index:60;',
    '  width:min(92vw,420px); max-height:80dvh; overflow:auto; background:rgba(26,20,16,.96); color:#f1e3c8; border-radius:14px;',
    '  padding:12px; box-shadow:0 10px 40px rgba(0,0,0,.6); font:15px/1.4 -apple-system,system-ui,sans-serif; }',
    '#fonv-panel[hidden] { display:none; }',
    '#fonv-panel h3 { margin:12px 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#b39d7c; }',
    '#fonv-panel .g { display:grid; grid-template-columns:1fr 1fr; gap:8px; }',
    '#fonv-panel button, #fonv-panel a.b { min-height:44px; border:0; border-radius:10px; background:#3a2c20; color:#f1e3c8;',
    '  font:inherit; text-align:center; text-decoration:none; display:flex; align-items:center; justify-content:center; padding:0 10px; }',
    '#fonv-panel .accent { background:#e8a03c; color:#1a1410; font-weight:600; }',
    '#fonv-panel form { display:flex; gap:8px; margin-top:8px; }',
    '#fonv-panel input { flex:1; min-height:44px; border-radius:10px; border:1px solid #4a3a2a; background:#1a1410; color:#f1e3c8;',
    '  padding:0 10px; font:inherit; }',
    '#fonv-panel .muted { color:#b39d7c; font-size:13px; margin:6px 0; }',
    '#fonv-toast { position:fixed; bottom:calc(env(safe-area-inset-bottom) + 16px); left:50%; transform:translateX(-50%); z-index:61;',
    '  background:rgba(26,20,16,.95); color:#f1e3c8; padding:10px 16px; border-radius:10px; font:14px -apple-system,system-ui,sans-serif;',
    '  transition:opacity .3s; pointer-events:none; }',
  ].join('\n');

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var toastTimer = 0;
  function toast(text) {
    var t = document.getElementById('fonv-toast') || document.body.appendChild(el('div', { id: 'fonv-toast' }));
    t.textContent = text;
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 2200);
  }

  // ---- Anzeige: Vollbild / Fenster / Mit Leiste ------------------------------------------------------------
  function mode() {
    var m = store.get('fonv.display');
    if (m === 'fullscreen' || m === 'window' || m === 'classic') return m;
    return store.get('fonv.borderless') === '0' ? 'classic' : 'fullscreen';   // ältere Einstellung übernehmen
  }
  function setMode(m) {
    store.set('fonv.display', m);
    var clean = m !== 'classic';
    document.documentElement.classList.toggle('fonv-borderless', clean);
    document.documentElement.classList.toggle('fonv-clean', clean);
    if (m === 'fullscreen' && !isFullscreen()) enterFullscreen();
    if (m !== 'fullscreen' && isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function enterFullscreen() {
    var d = document.documentElement;
    if (d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).catch(function () { toast('Vollbild nicht möglich – App zum Home-Bildschirm hinzufügen'); });
    else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
    else toast('Vollbild nicht möglich – App zum Home-Bildschirm hinzufügen');
  }
  function toggleFullscreen() {
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else enterFullscreen();
  }

  // ---- Cheats --------------------------------------------------------------------------------------------
  var cheats = [];
  function runCommand(cmd) {
    var M = window.Module;
    if (!M || !M.ccall || !M._fnv_boot) { toast('Das Spiel läuft noch nicht'); return; }
    try {
      M.ccall('fnv_console', null, ['string'], [cmd]);
      toast('✓ ' + cmd);
    } catch (e) { toast('Fehler: ' + e); }
  }
  function unlock(pw) {
    return fetch('./api/cheats/unlock', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'X-FONV': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }),
    }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'Fehler'); return b; }); });
  }

  // ---- Spielstände hochladen -------------------------------------------------------------------------------
  // window.fnvSaves (Spielseite): list() = .fos-Dateien, die dieser Tab hält {path, size, mtime}; read(path) = Bytes
  var uploaded = {}, lastSeen = {}, saving = false;
  var CH = 8 << 20;
  function post(url, body) { return fetch(url, { method: 'POST', credentials: 'same-origin', body: body || null }); }
  async function upload(path, bytes) {
    var p = encodeURIComponent(path);
    var r = await post('/fs/truncate?p=' + p);
    if (!r.ok) throw new Error('Server ' + r.status);
    for (var off = 0; off < bytes.length; off += CH) {
      r = await post('/fs/write?p=' + p + '&o=' + off, bytes.subarray(off, off + CH));
      if (!r.ok) throw new Error('Server ' + r.status);
    }
  }
  async function syncSaves() {
    if (saving || !window.fnvSaves) return;
    saving = true;
    try {
      var list = window.fnvSaves.list();
      for (var i = 0; i < list.length; i++) {
        var f = list[i], sig = f.size + '|' + f.mtime;
        if (uploaded[f.path] === sig) continue;
        if (lastSeen[f.path] !== sig) { lastSeen[f.path] = sig; continue; }   // erst hochladen, wenn fertig geschrieben
        var bytes = window.fnvSaves.read(f.path);
        if (!bytes) continue;
        await upload(f.path, bytes);
        uploaded[f.path] = sig;
        toast('Spielstand gesichert: ' + f.path.slice(f.path.lastIndexOf('/') + 1).replace(/\.fos$/i, ''));
      }
    } catch (e) {
      console.warn('[fonv] Spielstand hochladen:', e);       // nächster Versuch in ein paar Sekunden
    }
    saving = false;
  }

  // ---- Panel ---------------------------------------------------------------------------------------------
  var panel, btn;
  function paint() {
    var label = store.sget('fonv.cheats');
    var html =
      '<div class="g"><a class="b accent" href="./">Zur App</a><button data-a="close">Schließen (F8)</button>' +
      '<button data-a="fs"' + (mode() === 'fullscreen' ? ' class="accent"' : '') + '>' + (isFullscreen() ? 'Vollbild aus' : 'Vollbild') + '</button>' +
      '<button data-a="win"' + (mode() === 'window' ? ' class="accent"' : '') + '>Fenster</button>' +
      '<button data-a="classic"' + (mode() === 'classic' ? ' class="accent"' : '') + '>Mit Leiste</button></div>' +
      '<h3>Cheats</h3>';
    if (label) {
      html += '<div class="g">' + cheats.map(function (c) { return '<button data-cmd="' + esc(c.cmd) + '" title="' + esc(c.help) + '">' + esc(c.label) + '</button>'; }).join('') + '</div>' +
        '<form data-f="cmd"><input name="c" placeholder="Eigener Konsolenbefehl" autocomplete="off" autocapitalize="off" spellcheck="false"><button>Los</button></form>' +
        '<p class="muted">Freigeschaltet: ' + esc(label) + '</p>';
    } else {
      html += '<p class="muted">Gesperrt – Cheat-Passwort eingeben:</p>' +
        '<form data-f="unlock"><input name="p" type="password" placeholder="Cheat-Passwort" autocomplete="off"><button class="accent">Freischalten</button></form>';
    }
    panel.innerHTML = html;
  }
  function onClick(e) {
    var t = e.target.closest('button');
    if (!t) return;
    var a = t.getAttribute('data-a');
    if (a === 'fs') { if (mode() === 'fullscreen') toggleFullscreen(); else setMode('fullscreen'); }
    else if (a === 'win') setMode('window');
    else if (a === 'classic') setMode('classic');
    else if (a === 'close') { panel.hidden = true; return; }
    else if (t.hasAttribute('data-cmd')) runCommand(t.getAttribute('data-cmd'));
    setTimeout(paint, 300);
  }
  function onSubmit(e) {
    e.preventDefault();
    var f = e.target;
    if (f.getAttribute('data-f') === 'cmd') { var c = f.c.value.trim(); if (c) runCommand(c); f.c.value = ''; }
    else unlock(f.p.value).then(function (b) { store.sset('fonv.cheats', b.label); toast('Cheats freigeschaltet'); paint(); }, function (err) { toast(err.message); });
  }

  function togglePanel() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { paint(); if (document.exitPointerLock) document.exitPointerLock(); }
  }

  function init() {
    document.head.appendChild(el('style', {}, css));
    var m = mode();
    document.documentElement.classList.toggle('fonv-borderless', m !== 'classic');
    document.documentElement.classList.toggle('fonv-clean', m !== 'classic');
    // Vollbild braucht eine Geste: beim ersten Tippen/Klicken/Tastendruck (z. B. auf "Start") einmal versuchen
    var fsTried = false;
    ['pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (fsTried || mode() !== 'fullscreen' || isFullscreen()) return;
        fsTried = true;
        enterFullscreen();
      }, true);
    });
    // F8: Menü auf/zu (vor dem Spiel abfangen)
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'F8' && e.code !== 'F8') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      togglePanel();
    }, true);
    window.addEventListener('keyup', function (e) { if (e.key === 'F8' || e.code === 'F8') e.stopImmediatePropagation(); }, true);
    // Maus am oberen Rand: Menüknopf kurz zeigen
    var peekTimer = 0;
    document.addEventListener('mousemove', function (e) {
      if (e.clientY > 48) return;
      document.documentElement.classList.add('fonv-peek');
      clearTimeout(peekTimer);
      peekTimer = setTimeout(function () { document.documentElement.classList.remove('fonv-peek'); }, 2000);
    }, { passive: true });
    btn = el('button', { id: 'fonv-btn', 'aria-label': 'Menü (F8)' }, '☰');
    panel = el('div', { id: 'fonv-panel', hidden: '' });
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    // Eingaben im Menü nicht ans Spiel durchreichen
    ['keydown', 'keyup', 'keypress', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel'].forEach(function (ev) {
      panel.addEventListener(ev, function (e) { e.stopPropagation(); });
      btn.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    btn.addEventListener('click', togglePanel);
    setInterval(syncSaves, 3000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) syncSaves(); });
    if (m !== 'classic') toast('Menü: F8 oder oben in der Mitte tippen');
    panel.addEventListener('click', onClick);
    panel.addEventListener('submit', onSubmit);
    document.addEventListener('fullscreenchange', function () { if (!panel.hidden) paint(); });
    document.addEventListener('webkitfullscreenchange', function () { if (!panel.hidden) paint(); });
    fetch('./cheats.json').then(function (r) { return r.json(); }).then(function (l) { cheats = l; }, function () { cheats = []; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
