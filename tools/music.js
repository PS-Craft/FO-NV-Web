// Ersatz für den Musik-Spieler der Spielseite (tools/assemble.mjs setzt ihn in game.html ein).
//
// Vorher: jedes Stück wurde mit decodeAudioData ganz entpackt und für immer behalten – ein Stück von drei Minuten
// sind so ~70 MB Gleitkomma-Samples, nach ein paar Gebietswechseln Hunderte MB. Am iPad (ohnehin knapp, weil das
// Spiel 3 GB fest belegt) schließt iPadOS dann den Tab, ohne Fehlermeldung.
// Jetzt: <audio>-Elemente, die der Browser beim Abspielen nach und nach dekodiert; die MP3-Bytes liegen als Blob vor
// (wenige MB) und werden freigegeben, sobald das Spiel das Stück stoppt. Lautstärke über einen GainNode (am iPad ist
// audio.volume nur lesbar).
// Safari spielt ein <audio> nur ab, wenn es einmal während einer Nutzer-Geste gestartet wurde. Deshalb gibt es einen
// kleinen Vorrat an Elementen, die beim ersten Tippen/Klicken/Tastendruck freigeschaltet werden; ein Stück leiht sich
// eines und gibt es beim Stopp zurück.
// Befehle der Engine (port/recomp/pal_dshow.cpp): 1 ab Position abspielen, 2 Pause, 3 Stopp, 4 Lautstärke
// (Hundertstel dB), 5 Springen.
const tracks = new Map();
audio.tracks = tracks;
// eine Zehntelsekunde Stille als WAV (zum Freischalten der Elemente)
const SILENT = (() => {
  const n = 4800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 48000, true); v.setUint32(28, 96000, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
})();
const pool = [];                 // { el, node, gain, busy }
function makeSlot() {
  const el = new Audio();
  el.preload = 'auto';
  const gain = audio.ctx.createGain();
  const node = audio.ctx.createMediaElementSource(el);
  node.connect(gain);
  gain.connect(audio.ctx.destination);
  return { el, node, gain, busy: false, unlocked: false };
}
function unlockPool() {
  if (!audio.ctx) return;
  while (pool.length < 4) pool.push(makeSlot());
  for (const s of pool) {
    // ein Stück, das vor der ersten Geste starten sollte (Hauptmenü), jetzt abspielen – das schaltet auch frei
    if (s.busy && s.track && s.track.playing && s.el.paused && s.track.url) {
      s.el.play().then(() => { s.unlocked = true; }, () => undefined);
      continue;
    }
    if (s.unlocked || s.busy) continue;
    s.el.src = SILENT;
    const p = s.el.play();
    if (p && p.then) p.then(() => { s.unlocked = true; if (!s.busy) s.el.pause(); }, () => undefined);
  }
}
for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchend'])
  window.addEventListener(ev, unlockPool, { capture: true, passive: true });
function takeSlot() {
  let s = pool.find((x) => !x.busy && x.unlocked) || pool.find((x) => !x.busy);
  if (!s) { s = makeSlot(); pool.push(s); }       // mehr Stücke gleichzeitig als vorbereitet (selten)
  s.busy = true;
  return s;
}
async function trackUrl(path) {
  const q = encodeURIComponent(path);
  const st = await (await fetch('/fs/stat?p=' + q)).json();
  const bytes = await (await fetch(`/fs/read?p=${q}&o=0&n=${st.size}`)).arrayBuffer();
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
}
window.fnvMusic = (id, cmd, path, volume, pos) => {
  id >>>= 0;
  if (!audio.ctx || !path) return;
  let t = tracks.get(id);
  if (!t && cmd !== 1) return;                              // Stopp/Pause für ein Stück, das hier nie lief
  if (!t) {
    const slot = takeSlot();
    t = { slot, el: slot.el, url: null, ready: null, playing: false, path };
    slot.track = t;
    t.ready = trackUrl(path).then((url) => {
      t.url = url;
      t.el.src = url;
      return new Promise((res, rej) => {
        t.el.addEventListener('loadedmetadata', () => res(), { once: true });
        t.el.addEventListener('error', () => rej(new Error('cannot play')), { once: true });
      });
    }).then(() => { if (isFinite(t.el.duration)) window.Module._fnv_music_duration(id, t.el.duration); });
    tracks.set(id, t);
  }
  const setVol = (v) => { t.slot.gain.gain.value = v <= -10000 ? 0 : Math.pow(10, Math.min(0, v) / 2000); };
  const start = async (from) => {
    await t.ready;
    if (!t.playing) return;
    t.el.currentTime = Math.min(from, isFinite(t.el.duration) ? t.el.duration : from);
    await t.el.play();
  };
  const free = () => {
    t.playing = false;
    try { t.el.pause(); } catch {}
    t.el.removeAttribute('src'); t.el.load();                 // gibt den Puffer des Elements frei
    if (t.url) URL.revokeObjectURL(t.url);
    t.slot.busy = false;
    t.slot.track = null;
    tracks.delete(id);
  };
  // NotAllowedError (Safari vor der ersten Geste) ist kein Fehler: das erste Tippen startet das Stück (unlockPool)
  if (cmd === 1) { setVol(volume); t.playing = true; start(pos).catch((e) => { if (e && e.name !== 'NotAllowedError') log('music ' + path + ': ' + e, true); }); log('music: ' + path); }
  else if (cmd === 2) { t.playing = false; try { t.el.pause(); } catch {} }
  else if (cmd === 3) free();
  else if (cmd === 4) setVol(volume);
  else if (cmd === 5 && t.playing) start(pos).catch(() => undefined);
};
