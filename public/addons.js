// FO-NV-Web: Ergänzungen für die Spielseite (game.html). build.ps1 bindet diese Datei ein.
// - Randlos (Standard): keine Leisten, das Bild füllt den Bildschirm im 16:9-Format.
// - Winziger Knopf oben in der Mitte klappt das Menü aus: zurück zur App, Vollbild, Randlos, Cheats.
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
    'html.fonv-borderless #bar { display:none; }',
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

  // ---- Randlos / Vollbild --------------------------------------------------------------------------------
  function setBorderless(on) {
    document.documentElement.classList.toggle('fonv-borderless', on);
    store.set('fonv.borderless', on ? '1' : '0');
  }
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFullscreen() {
    var d = document.documentElement;
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (d.requestFullscreen) d.requestFullscreen().catch(function () { toast('Vollbild nicht möglich – App zum Home-Bildschirm hinzufügen'); });
    else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
    else toast('Vollbild nicht möglich – App zum Home-Bildschirm hinzufügen');
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

  // ---- Panel ---------------------------------------------------------------------------------------------
  var panel, btn;
  function paint() {
    var label = store.sget('fonv.cheats');
    var html =
      '<div class="g"><a class="b accent" href="./">Zur App</a><button data-a="fs">' + (isFullscreen() ? 'Vollbild aus' : 'Vollbild') + '</button>' +
      '<button data-a="bl">' + (document.documentElement.classList.contains('fonv-borderless') ? 'Mit Leiste' : 'Randlos') + '</button>' +
      '<button data-a="close">Schließen</button></div>' +
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
    if (a === 'fs') toggleFullscreen();
    else if (a === 'bl') setBorderless(!document.documentElement.classList.contains('fonv-borderless'));
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

  function init() {
    document.head.appendChild(el('style', {}, css));
    setBorderless(store.get('fonv.borderless') !== '0');
    btn = el('button', { id: 'fonv-btn', 'aria-label': 'Menü' }, '☰');
    panel = el('div', { id: 'fonv-panel', hidden: '' });
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    // Eingaben im Menü nicht ans Spiel durchreichen
    ['keydown', 'keyup', 'keypress', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel'].forEach(function (ev) {
      panel.addEventListener(ev, function (e) { e.stopPropagation(); });
      btn.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    btn.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { paint(); if (document.exitPointerLock) document.exitPointerLock(); }
    });
    panel.addEventListener('click', onClick);
    panel.addEventListener('submit', onSubmit);
    document.addEventListener('fullscreenchange', function () { if (!panel.hidden) paint(); });
    document.addEventListener('webkitfullscreenchange', function () { if (!panel.hidden) paint(); });
    fetch('./cheats.json').then(function (r) { return r.json(); }).then(function (l) { cheats = l; }, function () { cheats = []; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
