// Oberfläche des Datenmanagers (Tab "Spieldaten"): Spiel aufs Gerät laden, Offline-Betrieb, Cloud-Spielstände.
import type { Dlc } from './api';
import { formatBytes } from './format';
import {
  checkSupport, isPhone, isRunning, overview, readState, removeOffline, startDownload, stopDownload, syncNow, syncStatus,
  type Progress,
} from './offline';
import type { Quality } from './offline-plan';
import { busy, esc, toast, when } from './ui';

let progress: Progress | null = null;
let rate = { at: 0, done: 0, bps: 0 };
let support: { ok: boolean; reason?: string } | null = null;
let quality: Quality | null = null;

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.floor((a / b) * 100)) : 0);
function eta(left: number): string {
  if (!rate.bps || left <= 0) return '';
  const s = Math.round(left / rate.bps);
  return s < 90 ? ` · noch ca. ${s} s` : s < 5400 ? ` · noch ca. ${Math.round(s / 60)} min` : ` · noch ca. ${(s / 3600).toFixed(1)} h`;
}

export async function renderDataManager(el: HTMLElement, dlc: Dlc[]): Promise<void> {
  const dlcOff = dlc.filter((d) => !d.enabled).map((d) => d.name.toLowerCase());
  const state = await readState();
  if (!quality) quality = state.enabled ? state.quality : isPhone() ? 'low' : 'high';
  const ov = await overview(quality, dlcOff);
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  const free = est?.quota !== undefined && est.usage !== undefined ? est.quota - est.usage : undefined;
  const active = isRunning();
  const complete = state.enabled && ov.total > 0 && ov.have >= ov.total;
  const dlcOn = dlc.filter((d) => d.enabled).length;
  const goLabel = !state.enabled || ov.have === 0 ? 'Herunterladen' : complete ? (ov.stale ? 'Aktualisieren' : 'Prüfen') : 'Fortsetzen';

  el.innerHTML = `
    <section class="card" id="dm">
      <div class="head"><h2>Offline spielen</h2>${complete ? '<span class="badge ok">Auf dem Gerät</span>' : state.enabled ? '<span class="badge">Teilweise</span>' : ''}</div>
      <p class="muted">Lädt das Spiel einmal auf dieses Gerät. Danach startet es vom Gerät – ohne Wartezeit auf den Server
      und auch ganz ohne Internet. Spielstände bleiben in der Cloud (deinem Server) und werden automatisch abgeglichen.</p>
      <div id="dmSupport" class="muted">${support ? (support.ok ? '' : `⚠️ ${esc(support.reason)}`) : 'Prüfe, ob dieser Browser das kann …'}</div>
      <div class="row wrap" role="radiogroup" aria-label="Qualität">
        <label class="check"><input type="radio" name="dmq" value="high" ${quality === 'high' ? 'checked' : ''}/> Hoch – volle Texturen (PC)</label>
        <label class="check"><input type="radio" name="dmq" value="low" ${quality === 'low' ? 'checked' : ''}/> Niedrig – etwa ein Drittel (iPad)</label>
      </div>
      <p class="muted">Enthalten: Grundspiel${dlcOn ? ` und ${dlcOn} DLC${dlcOn > 1 ? 's' : ''}` : ''} (DLCs oben ein-/ausschalten).
        ${ov.stale ? '<br>⚠️ Die Daten auf dem Server haben sich geändert (z. B. DLCs umgeschaltet) – bitte aktualisieren.' : ''}</p>
      <div class="meter" aria-hidden="true"><div id="dmBar" style="width:${pct(ov.have, ov.total)}%"></div></div>
      <p id="dmText" class="muted">${formatBytes(ov.have)} von ${formatBytes(ov.total)} auf diesem Gerät${free !== undefined ? ` · frei: ${formatBytes(free)}` : ''}${ov.online ? '' : ' · offline'}</p>
      <div class="actions">
        <button id="dmGo" ${active || !ov.online ? 'disabled' : ''}>${goLabel}</button>
        <button class="secondary" id="dmStop" ${active ? '' : 'hidden'}>Anhalten</button>
        ${state.enabled ? '<button class="danger" id="dmDel">Vom Gerät löschen</button>' : ''}
      </div>
      ${isPhone() ? '<p class="hint">iPad: Die App vorher über Teilen → „Zum Home-Bildschirm“ hinzufügen und von dort öffnen – nur dann bleiben die Daten dauerhaft.</p>' : ''}
    </section>
    <section class="card" id="dmCloud" ${state.enabled ? '' : 'hidden'}>
      <div class="head"><h2>Spielstände in der Cloud</h2><button class="secondary" id="dmSync">Jetzt abgleichen</button></div>
      <p id="dmSyncText" class="muted">…</p>
    </section>`;

  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  el.querySelectorAll<HTMLInputElement>('input[name=dmq]').forEach((r) =>
    r.addEventListener('change', () => {
      quality = r.value as Quality;
      void renderDataManager(el, dlc);
    }),
  );
  const paint = (p: Progress) => {
    progress = p;
    const bar = el.querySelector<HTMLElement>('#dmBar'), text = el.querySelector<HTMLElement>('#dmText');
    if (!bar || !text) return;
    if (p.phase === 'app') {
      bar.style.width = pct(p.done, p.total) + '%';
      text.textContent = `App-Dateien: ${p.done} von ${p.total}`;
      return;
    }
    if (p.phase === 'game') {
      const t = Date.now();
      if (rate.at && t - rate.at > 1500) {
        const bps = ((p.done - rate.done) / (t - rate.at)) * 1000;
        rate = { at: t, done: p.done, bps: rate.bps ? rate.bps * 0.7 + bps * 0.3 : bps };
      } else if (!rate.at) rate = { at: t, done: p.done, bps: 0 };
      bar.style.width = pct(p.done, p.total) + '%';
      text.textContent = `${formatBytes(p.done)} von ${formatBytes(p.total)}${rate.bps ? ` · ${formatBytes(rate.bps)}/s` : ''}${eta(p.total - p.done)}${p.file ? ' · ' + p.file : ''}`;
      return;
    }
    rate = { at: 0, done: 0, bps: 0 };
    if (p.phase === 'error') toast('Download: ' + p.error, 'error');
    else if (p.phase === 'done') toast(p.done >= p.total ? 'Spiel liegt jetzt auf dem Gerät' : 'Download beendet');
    else toast('Angehalten – „Fortsetzen“ macht dort weiter');
    progress = null;
    if (el.isConnected) void renderDataManager(el, dlc);
  };
  if (active && progress) paint(progress);

  q<HTMLButtonElement>('#dmGo').addEventListener('click', async () => {
    if (!support?.ok) {
      support = await checkSupport();
      if (!support.ok) { void renderDataManager(el, dlc); return; }
    }
    void startDownload(quality!, dlcOff, paint);
    void renderDataManager(el, dlc);
  });
  q<HTMLButtonElement>('#dmStop').addEventListener('click', () => stopDownload());
  el.querySelector<HTMLButtonElement>('#dmDel')?.addEventListener('click', async (e) => {
    if (!confirm('Spieldaten von diesem Gerät löschen? Spielstände werden vorher in die Cloud hochgeladen. Auf dem Server ändert sich nichts.')) return;
    await busy(e.target as HTMLButtonElement, async () => {
      const r = await removeOffline();
      toast(r.savesKept ? 'Gelöscht – Spielstände konnten nicht hochgeladen werden und bleiben auf dem Gerät.' : 'Vom Gerät gelöscht', r.savesKept ? 'error' : 'ok');
      void renderDataManager(el, dlc);
    });
  });
  el.querySelector<HTMLButtonElement>('#dmSync')?.addEventListener('click', async (e) => {
    await busy(e.target as HTMLButtonElement, async () => {
      const r = await syncNow();
      if (!r?.ok) throw new Error('Abgleich fehlgeschlagen: ' + (r?.error ?? 'unbekannt'));
      toast(`Abgeglichen: ${r.downloaded} geholt, ${r.uploaded} hochgeladen${r.conflicts ? `, ${r.conflicts} Konflikt-Kopie(n)` : ''}`);
      void paintSync();
    });
  });
  const paintSync = async () => {
    const s = await syncStatus();
    const t = el.querySelector('#dmSyncText');
    if (!t) return;
    if (!s) { t.textContent = 'Noch nicht aktiv – wird beim nächsten App-Start eingeschaltet.'; return; }
    const parts = [s.lastSync ? `Zuletzt abgeglichen: ${when(s.lastSync)}` : 'Noch nicht abgeglichen'];
    if (s.pending) parts.push(`${s.pending} Änderung(en) warten auf Upload`);
    if (s.last && !s.last.ok) parts.push(`⚠️ ${s.last.error}`);
    if (s.last?.conflicts) parts.push(`${s.last.conflicts} Konflikt-Kopie(n) angelegt („… (Cloud …)“)`);
    t.textContent = parts.join(' · ');
  };
  if (state.enabled) void paintSync();
  if (!support) {
    support = await checkSupport();
    const s = el.querySelector('#dmSupport');
    if (s) s.textContent = support.ok ? '' : `⚠️ ${support.reason}`;
  }
}
