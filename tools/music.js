// Ersatz für den Musik-Spieler der Spielseite (tools/assemble.mjs setzt ihn in game.html ein).
//
// Vorher: jedes Stück wurde mit decodeAudioData ganz entpackt und für immer behalten – ein Stück von drei Minuten
// sind so ~70 MB Gleitkomma-Samples, nach ein paar Gebietswechseln Hunderte MB. Am iPad (ohnehin knapp, weil das
// Spiel 3 GB fest belegt) schließt iPadOS dann den Tab, ohne Fehlermeldung.
// Jetzt: ein <audio>-Element je Stück, das der Browser beim Abspielen nach und nach dekodiert; die MP3-Bytes liegen
// als Blob vor (wenige MB) und werden freigegeben, sobald das Spiel das Stück stoppt. Lautstärke über einen
// GainNode (am iPad ist audio.volume nur lesbar). Die Befehle bleiben die der Engine (port/recomp/pal_dshow.cpp):
// 1 ab Position abspielen, 2 Pause, 3 Stopp, 4 Lautstärke (Hundertstel dB), 5 Springen.
const tracks = new Map();
audio.tracks = tracks;
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
    const el = new Audio();
    el.preload = 'auto';
    t = { el, gain: audio.ctx.createGain(), node: null, url: null, ready: null, playing: false, path };
    t.gain.connect(audio.ctx.destination);
    t.ready = trackUrl(path).then((url) => {
      t.url = url;
      el.src = url;
      t.node = audio.ctx.createMediaElementSource(el);
      t.node.connect(t.gain);
      return new Promise((res, rej) => {
        el.addEventListener('loadedmetadata', () => res(), { once: true });
        el.addEventListener('error', () => rej(new Error('cannot play')), { once: true });
      });
    }).then(() => { if (isFinite(t.el.duration)) window.Module._fnv_music_duration(id, t.el.duration); });
    tracks.set(id, t);
  }
  const setVol = (v) => { t.gain.gain.value = v <= -10000 ? 0 : Math.pow(10, Math.min(0, v) / 2000); };
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
    try { t.node && t.node.disconnect(); } catch {}
    t.gain.disconnect();
    tracks.delete(id);
  };
  if (cmd === 1) { setVol(volume); t.playing = true; start(pos).catch((e) => log('music ' + path + ': ' + e, true)); log('music: ' + path); }
  else if (cmd === 2) { t.playing = false; try { t.el.pause(); } catch {} }
  else if (cmd === 3) free();
  else if (cmd === 4) setVol(volume);
  else if (cmd === 5 && t.playing) start(pos).catch(() => undefined);
};
