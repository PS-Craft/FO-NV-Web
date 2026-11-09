import './style.css';
import { startHud } from './hud';
import { loadResults, resetResults, runRemaining, STEPS, type StressResult } from './stress';
import { overall, runSystemCheck, type CheckItem, type Status } from './systemcheck';

const icon: Record<Status, string> = { ok: '✅', warn: '⚠️', fail: '❌' };
const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div id="hud" aria-hidden="true"></div>
  <main>
    <h1>FO-NV-Web</h1>
    <p class="sub">Browser-Engine für deine eigene Kopie von <em>Fallout: New Vegas</em> · Version ${__APP_VERSION__}</p>
    <section class="card">
      <h2>1 · Systemcheck</h2>
      <p>Prüft, ob dieses Gerät alles kann, was die Engine braucht.</p>
      <div class="row">
        <button id="run">Systemcheck starten</button>
        <button id="persist" class="secondary">Speicher sichern</button>
        <button id="copy" class="secondary" disabled>Ergebnis kopieren</button>
      </div>
      <div id="summary"></div>
      <ul id="results" class="results"></ul>
    </section>
    <section class="card">
      <h2>2 · Belastungstest</h2>
      <p>Spielt nach, was die Browser-Version von New Vegas beim Start verlangt (viel geteilter Speicher,
      ein ~100-MB-Programm, 64 Threads), Schritt für Schritt. Stürzt Safari ab, lädt die Seite neu:
      dann einfach <b>Fortsetzen</b> tippen. Dauer: wenige Minuten. Bitte andere Tabs vorher schließen.</p>
      <div class="row">
        <button id="stress">Test starten / fortsetzen</button>
        <button id="stressReset" class="secondary">Zurücksetzen</button>
      </div>
      <div id="stressNow"></div>
      <ul id="stressList" class="results"></ul>
    </section>
    <footer>Enthält keine Spieldaten. Nicht mit Bethesda Softworks oder Microsoft verbunden.</footer>
  </main>`;

let last: CheckItem[] = [];
let stress: StressResult[] = [];
const sIcon = { ok: '✅', fail: '❌', crash: '💥' } as const;

function renderStress(results: StressResult[], running?: string, line?: string): void {
  stress = results;
  $('#stressNow').textContent = running ? `⏳ ${running}${line ? ' – ' + line : ''}` : results.length >= STEPS.length ? 'Fertig.' : '';
  $('#stressList').innerHTML = results
    .map((r) => `<li><span>${sIcon[r.status]}</span><div><b>${escapeHtml(r.label)}</b><small>${escapeHtml(r.detail)}</small></div></li>`)
    .join('');
  $<HTMLButtonElement>('#copy').disabled = !last.length && !results.length;
}
const $ = <T extends HTMLElement>(s: string) => app.querySelector<T>(s)!;

async function run(): Promise<void> {
  $('#summary').textContent = 'Prüfe …';
  last = await runSystemCheck();
  const o = overall(last);
  $('#summary').textContent = `${icon[o]} ${o === 'ok' ? 'Alles bereit.' : o === 'warn' ? 'Nutzbar, mit Hinweisen.' : 'Wichtige Funktionen fehlen.'}`;
  $('#results').innerHTML = last
    .map((i) => `<li><span>${icon[i.status]}</span><div><b>${i.label}</b><small>${escapeHtml(i.detail)}</small></div></li>`)
    .join('');
  $<HTMLButtonElement>('#copy').disabled = false;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

$('#run').addEventListener('click', run);
$('#stress').addEventListener('click', async () => {
  const b = $<HTMLButtonElement>('#stress');
  b.disabled = true;
  try {
    await runRemaining(renderStress);
  } finally {
    b.disabled = false;
  }
});
$('#stressReset').addEventListener('click', () => {
  resetResults();
  renderStress([]);
});
renderStress(loadResults());
$('#persist').addEventListener('click', async () => {
  const ok = await navigator.storage?.persist?.().catch(() => false);
  alert(ok ? 'Speicher ist jetzt dauerhaft.' : 'Nicht gewährt. Tipp: erst zum Home-Bildschirm hinzufügen und von dort öffnen.');
  void run();
});
$('#copy').addEventListener('click', async () => {
  const text = JSON.stringify({ version: __APP_VERSION__, date: new Date().toISOString(), checks: last, stress }, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    alert('Kopiert – einfach in den Chat einfügen.');
  } catch {
    prompt('Bitte manuell kopieren:', text);
  }
});

startHud($('#hud'));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    // Beim ersten Besuch kontrolliert der SW die Seite noch nicht → einmal neu laden für COOP/COEP.
    if (!crossOriginIsolated && !sessionStorage.getItem('coi-reload')) {
      sessionStorage.setItem('coi-reload', '1');
      navigator.serviceWorker.ready.then(() => location.reload());
    }
  });
}
