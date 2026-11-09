// Bricht ab, falls Spieldaten ins Repository geraten sind (siehe docs/RECHT.md).
import { execSync } from 'node:child_process';

const forbidden = /\.(esm|esp|bsa|nif|kf|dds|lip|egm|egt|tri|fos|ogg|mp3|wav|bik)$/i;
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const hits = files.filter((f) => forbidden.test(f));
if (hits.length) {
  console.error('Spieldaten-Dateien im Repository gefunden – nicht erlaubt:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`OK: ${files.length} Dateien geprüft, keine Spieldaten.`);
