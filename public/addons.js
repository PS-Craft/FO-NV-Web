// FO-NV-Web: Ergänzungen für die Spielseite (game.html). tools/assemble.mjs bindet diese Datei ein.
// - Spielstände: Die Engine hält alles, was das Spiel unter /docs schreibt, nur in diesem Tab (pal_fs_web.cpp); ihr
//   Server-Modus (FNV_DOCS=server) bleibt beim Start hängen. Diese Datei lädt deshalb jeden neuen oder geänderten
//   Spielstand (.fos) selbst hoch, sobald er fertig geschrieben ist – mit Offline-Daten über sw.js zuerst aufs Gerät,
//   von dort in die Cloud.
// - Anzeige (fonv.display, in der App wählbar): "fullscreen" (Vollbild ab dem ersten Tippen/Klicken), "window"
//   (randlos im Fenster) – beide ohne Leisten und Knöpfe –, "classic" (Seite mit Leiste und Knöpfen).
// - Menü: Taste F8 oder der Knopf ☰ oben in der Mitte (mit Maus unsichtbar, bis sie an den oberen Rand kommt; auf
//   Touch-Geräten wie dem iPad ohne Tastatur immer leicht sichtbar).
// - Anmeldung verloren (Netzwechsel o. Ä.): nach ein paar Sekunden zurück zur Anmeldung.
// - Cheats laufen über die Spielkonsole (Module.ccall('fnv_console', …)), freigeschaltet per Cheat-Passwort.
(function () {
  'use strict';
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* egal */ } },
  };

  var TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 1;
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
    'html.fonv-notouch #touch { display:none !important; }',
    'html.fonv-notouch #screen { pointer-events:auto !important; }',
    'html.fonv-touch.fonv-clean #fonv-btn { opacity:.55; width:64px; height:30px; border-radius:15px; line-height:30px; font-size:18px; }',
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

  // ---- Anmeldung -----------------------------------------------------------------------------------------
  // Nach einem Netzwechsel kennt der Server die Anmeldung manchmal nicht mehr (401): dann nach ein paar Sekunden zur
  // Startseite, wo der Browser wieder nach Name und Passwort fragt. Ohne Netz (offline) bleibt das Spiel einfach offen.
  var leaving = false;
  function checkAuth() {
    if (leaving) return;
    fetch('./api/me', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (r.status !== 401 || leaving) return;
      leaving = true;
      toast('Anmeldung abgelaufen – gleich geht es zur Anmeldung');
      setTimeout(function () { location.replace('./?login=' + Date.now()); }, 4000);
    }, function () { /* offline */ });
  }

  // ---- Eingabe: Tastatur und Touch zugleich, Touch-Steuerung abschaltbar ------------------------------------
  // Die Spielseite nimmt Tasten nur an, wenn die Spielfläche den Fokus hat – mit Touch-Steuerung bekommt sie ihn nie
  // (iPad mit Tastatur). Deshalb hier: Tasten von überall ans Spiel (DirectInput-Codes wie in der Spielseite).
  var DIK = { Escape: 1, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10,
    Digit0: 11, Minus: 12, Equal: 13, Backspace: 14, Tab: 15, KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20, KeyY: 21,
    KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26, BracketRight: 27, Enter: 28, ControlLeft: 29, KeyA: 30,
    KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36, KeyK: 37, KeyL: 38, Semicolon: 39, Quote: 40,
    Backquote: 41, ShiftLeft: 42, Backslash: 43, KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47, KeyB: 48, KeyN: 49, KeyM: 50,
    Comma: 51, Period: 52, Slash: 53, ShiftRight: 54, NumpadMultiply: 55, AltLeft: 56, Space: 57, CapsLock: 58, F1: 59,
    F2: 60, F3: 61, F4: 62, F5: 63, F6: 64, F7: 65, F9: 67, F10: 68, Numpad7: 71, Numpad8: 72, Numpad9: 73,
    NumpadSubtract: 74, Numpad4: 75, Numpad5: 76, Numpad6: 77, NumpadAdd: 78, Numpad1: 79, Numpad2: 80, Numpad3: 81,
    Numpad0: 82, NumpadDecimal: 83, F11: 87, F12: 88, NumpadEnter: 156, ControlRight: 157, NumpadDivide: 181,
    AltRight: 184, Home: 199, ArrowUp: 200, PageUp: 201, ArrowLeft: 203, ArrowRight: 205, End: 207, ArrowDown: 208,
    PageDown: 209, Insert: 210, Delete: 211 };
  function touchOn() { return store.get('fonv.touch') !== '0'; }
  function setTouch(on) {
    store.set('fonv.touch', on ? '1' : '0');
    document.documentElement.classList.toggle('fonv-notouch', !on);
    // losgelassene Tasten/Stick: die Spielseite räumt bei "blur" auf
    if (!on) window.dispatchEvent(new Event('blur'));
  }
  function inputInit() {
    var canvas = document.getElementById('screen');
    if (TOUCH && !touchOn()) document.documentElement.classList.add('fonv-notouch');
    var typing = function (e) {
      var t = e.target;
      if (!(t instanceof Node)) return false;
      return t === canvas || (panel && panel.contains(t)) || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || (t && t.isContentEditable);
    };
    var keyTo = function (e, down) {
      var d = DIK[e.code], M = window.Module;
      if (!d || !M || !M._fnv_key || typing(e) || e.metaKey) return;   // Spielfläche mit Fokus: das macht die Spielseite
      e.preventDefault();
      if (!(down && e.repeat)) M._fnv_key(d, down ? 1 : 0);
    };
    window.addEventListener('keydown', function (e) { keyTo(e, true); });
    window.addEventListener('keyup', function (e) { keyTo(e, false); });
    // Maus/Trackpad ohne Zeigersperre (Safari am iPad kennt sie nicht): Bewegung und Tasten direkt ans Spiel
    if (canvas && !canvas.requestPointerLock) {
      var btn = function (e) { return e.button === 2 ? 1 : e.button === 1 ? 2 : 0; };
      var M = function () { return window.Module && window.Module._fnv_mouse ? window.Module : null; };
      canvas.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' && M()) M()._fnv_mouse(e.movementX || 0, e.movementY || 0, 0, -1, 0); });
      canvas.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && M()) M()._fnv_mouse(0, 0, 0, btn(e), 1); });
      canvas.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse' && M()) M()._fnv_mouse(0, 0, 0, btn(e), 0); });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
  }

  // ---- Diagnose-Protokoll ---------------------------------------------------------------------------------
  // Alle paar Sekunden eine Zeile über den Zustand des Spiels in den eigenen Ordner auf dem Server
  // (Einstellungen/Spielstände: FONV-Diagnose/<Start>.txt). Schließt der Browser den Tab (iPad: zu wenig Speicher),
  // läuft kein Code mehr – die letzte Zeile zeigt dann, was das Spiel gerade tat. Nur eigene Daten, nur eigener Server.
  var diag = { name: '/docs/FONV-Diagnose/' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt', off: 0, n: 0, sig: '', lines: [], errs: [], busy: false, t0: Date.now() };
  function diagHook() {
    var rep = window.fnvReport;
    if (rep && rep.add && !rep.fonv) {
      var add = rep.add;
      rep.fonv = true;
      rep.add = function (kind, m) {
        if (!/^\[(vorbis|d3d9|mmio)\]/.test(m)) { diag.lines.push(String(m).slice(0, 160)); if (diag.lines.length > 8) diag.lines.shift(); }
        return add.apply(this, arguments);
      };
    }
    window.addEventListener('error', function (e) { diag.errs.push(String(e.message || e.type).slice(0, 200)); diagTick(true); });
    window.addEventListener('unhandledrejection', function (e) { diag.errs.push(String((e.reason && e.reason.message) || e.reason).slice(0, 200)); });
    document.addEventListener('visibilitychange', function () { diagTick(true); });
  }
  function diagTick(force) {
    if (diag.busy || diag.n > 400) return;
    var b = window.fnvBoot || {}, P = window.PThread, pm = performance.memory;
    var st = document.getElementById('status');
    var e = {
      s: Math.round((Date.now() - diag.t0) / 1000), text: b.text, stage: b.stage, mb: Math.round((b.kb || 0) / 1024), retries: b.retries,
      status: st ? st.textContent : '', fail: b.failText, hidden: document.hidden, local: !!window.fonvLocal,
      threads: P ? P.runningWorkers.length + '/' + (P.runningWorkers.length + P.unusedWorkers.length) : '',
      jsMB: pm ? Math.round(pm.usedJSHeapSize / 1048576) : undefined, errs: diag.errs.splice(0), log: diag.lines.splice(0),
    };
    if (diag.n === 0) e.dev = { ua: navigator.userAgent, page: location.pathname + location.search, w: innerWidth, h: innerHeight, dpr: devicePixelRatio,
      cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory, touch: navigator.maxTouchPoints, quality: b.quality, env: window.fonvEnv,
      standalone: !!navigator.standalone, display: mode() };
    var sig = [e.text, e.stage, e.mb, e.fail, e.hidden, e.status.replace(/\d+ fps/, 'fps')].join('|');
    if (!force && sig === diag.sig && !e.errs.length && !e.log.length && diag.n % 6 !== 0) { diag.n++; return; }
    diag.sig = sig;
    diag.n++;
    var bytes = new TextEncoder().encode(JSON.stringify(e) + '\n');
    var off = diag.off;
    diag.off += bytes.length;
    diag.busy = true;
    // X-FONV-DL: am Service Worker vorbei direkt zum Server (das Protokoll soll auch dann ankommen, wenn er hängt)
    var opt = { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'X-FONV-DL': '1' } };
    var q = encodeURIComponent(diag.name);
    // beim ersten Mal die Datei anlegen (legt auch den Ordner an), danach nur anhängen
    diag.made = diag.made || fetch('/fs/truncate?p=' + q, opt);
    diag.made.then(function () { return fetch('/fs/write?p=' + q + '&o=' + off, Object.assign({ body: bytes }, opt)); })
      .then(function () { diag.busy = false; }, function () { diag.busy = false; });
  }

  // ---- Panel ---------------------------------------------------------------------------------------------
  var panel, btn;
  function paint() {
    var label = store.sget('fonv.cheats');
    var html =
      '<div class="g"><a class="b accent" href="./">Zur App</a><button data-a="close">' + (TOUCH ? 'Schließen' : 'Schließen (F8)') + '</button>' +
      '<button data-a="fs"' + (mode() === 'fullscreen' ? ' class="accent"' : '') + '>' + (isFullscreen() ? 'Vollbild aus' : 'Vollbild') + '</button>' +
      '<button data-a="win"' + (mode() === 'window' ? ' class="accent"' : '') + '>Fenster</button>' +
      '<button data-a="classic"' + (mode() === 'classic' ? ' class="accent"' : '') + '>Mit Leiste</button>' +
      (TOUCH ? '<button data-a="touch"' + (touchOn() ? ' class="accent"' : '') + '>Touch-Steuerung: ' + (touchOn() ? 'An' : 'Aus') + '</button>' : '') + '</div>' +
      (TOUCH ? '<p class="muted">Tastatur und Maus gehen immer, auch zusammen mit Touch. „Aus“ blendet Stick und Knöpfe aus.</p>' : '') +
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
    else if (a === 'touch') { setTouch(!touchOn()); toast(touchOn() ? 'Touch-Steuerung an' : 'Touch-Steuerung aus – Tastatur/Maus'); }
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
    document.documentElement.classList.toggle('fonv-touch', TOUCH);
    btn = el('button', { id: 'fonv-btn', 'aria-label': 'Menü' }, '☰');
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
    if (m !== 'classic') toast(TOUCH ? 'Menü: ☰ oben in der Mitte antippen' : 'Menü: F8 oder Maus an den oberen Rand');
    setInterval(checkAuth, 20000);
    inputInit();
    diagHook();
    diagTick(true);
    setInterval(diagTick, 5000);
    window.addEventListener('online', function () { setTimeout(checkAuth, 2000); });
    panel.addEventListener('click', onClick);
    panel.addEventListener('submit', onSubmit);
    document.addEventListener('fullscreenchange', function () { if (!panel.hidden) paint(); });
    document.addEventListener('webkitfullscreenchange', function () { if (!panel.hidden) paint(); });
    fetch('./cheats.json').then(function (r) { return r.json(); }).then(function (l) { cheats = l; }, function () { cheats = []; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
