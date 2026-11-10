// Selbsttest des Datenmanagers, in einem Worker wie die Threads des Spiels:
//   write: kann dieser Browser in Workern schnell in den Gerätespeicher schreiben (createSyncAccessHandle)?
//   xhr:   erreicht eine synchrone Anfrage aus einem Worker den Service Worker (sw.js)? Nur dann kann das Spiel
//          seine Dateien vom Gerät lesen.
var write = typeof FileSystemFileHandle !== 'undefined' && 'createSyncAccessHandle' in FileSystemFileHandle.prototype;
var xhr = false;
try {
  var x = new XMLHttpRequest();
  x.open('GET', 'fs/__probe', false);
  x.send();
  xhr = x.status === 200 && x.responseText === 'ok';
} catch (e) {
  xhr = false;
}
postMessage({ write: write, xhr: xhr });
