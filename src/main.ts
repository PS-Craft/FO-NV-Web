import './style.css';
import { api, ApiError, detectServer, type CheatEntry, type Dlc, type FileEntry, type Me, type UserEntry } from './api';
import { CHEATS, cheatLabel, lockCheats } from './cheats';
import { startHud } from './hud';
import { loadResults, resetResults, runRemaining, STEPS, type StressResult } from './stress';
import { overall, runSystemCheck, type CheckItem, type Status } from './systemcheck';
import { busy, esc, icon, pickFile, toast, when } from './ui';
import { formatBytes } from './format';

type Tab = 'play' | 'saves' | 'data' | 'cheats' | 'admin' | 'system';
const TABS: { id: Tab; label: string; server: boolean; admin?: boolean }[] = [
  { id: 'play', label: 'Spielen', server: true },
  { id: 'saves', label: 'Spielstände', server: true },
  { id: 'data', label: 'Spieldaten', server: true },
  { id: 'cheats', label: 'Cheats', server: true },
  { id: 'admin', label: 'Admin', server: true, admin: true },
  { id: 'system', label: 'Diagnose', server: false },
];

const app = document.querySelector<HTMLDivElement>('#app')!;
let me: Me | null = null;
let tab: Tab = 'play';

function shell(): void {
  const tabs = TABS.filter((t) => (me ? !t.admin || me.admin : !t.server));
  if (!tabs.some((t) => t.id === tab)) tab = tabs[0]!.id;
  app.innerHTML = `
    <div id="hud" aria-hidden="true"></div>
    <header class="top">
      <div class="brand"><img src="./icon.svg" alt="" /><span>Mojave</span></div>
      ${me?.user ? `<button class="chip" id="account" title="Passwort ändern">${esc(me.user)}${me.admin ? ' · Admin' : ''}</button>` : ''}
    </header>
    <main id="view"></main>
    <nav class="tabbar">${tabs
      .map((t) => `<button data-tab="${t.id}" class="${t.id === tab ? 'active' : ''}">${icon(t.id)}<span>${t.label}</span></button>`)
      .join('')}</nav>
    <footer class="legal">Benötigt eine eigene Kopie von Fallout: New Vegas. Nicht mit Bethesda Softworks, Obsidian oder Microsoft verbunden.</footer>`;
  app.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      try { localStorage.setItem('fonv.tab', tab); } catch { /* egal */ }
      shell();
    }),
  );
  app.querySelector('#account')?.addEventListener('click', () => passwordDialog(false));
  startHud(app.querySelector('#hud')!);
  void render();
}

const view = () => app.querySelector<HTMLElement>('#view')!;

async function render(): Promise<void> {
  const v = view();
  v.innerHTML = '<p class="muted">Lädt …</p>';
  try {
    if (tab === 'play') await renderPlay(v);
    else if (tab === 'saves') await renderSaves(v);
    else if (tab === 'data') await renderData(v);
    else if (tab === 'cheats') renderCheats(v);
    else if (tab === 'admin') await renderAdmin(v);
    else renderSystem(v);
  } catch (e) {
    v.innerHTML = `<div class="card error">${esc(e instanceof Error ? e.message : e)}</div>`;
  }
}

// ---- Spielen -------------------------------------------------------------------------------------------
async function renderPlay(v: HTMLElement): Promise<void> {
  const [saves, dlc] = await Promise.all([api.get<{ saves: FileEntry[] }>('saves'), api.get<{ dlc: Dlc[] }>('dlc')]);
  const last = saves.saves[0];
  const on = dlc.dlc.filter((d) => d.enabled).length;
  v.innerHTML = `
    <section class="hero">
      <h1>Willkommen zurück${me?.user ? ', ' + esc(me.user) : ''}.</h1>
      <p class="muted">${last ? `Letzter Spielstand: <b>${esc(last.name.replace(/\.fos$/i, ''))}</b> · ${when(last.mtime)}` : 'Noch kein Spielstand – Zeit für ein neues Spiel.'}</p>
      <a class="btn big" href="./game.html">${icon('play')} Spiel starten</a>
      <p class="hint">Im Spiel oben in der Mitte: ☰ für Cheats und zurück zur App.</p>
    </section>
    <div class="grid">
      <div class="card stat"><b>${saves.saves.length}</b><span>Spielstände</span></div>
      <div class="card stat"><b>${on}/${dlc.dlc.length}</b><span>DLCs aktiv</span></div>
      <div class="card stat"><b>${cheatLabel() ? 'An' : 'Aus'}</b><span>Cheats</span></div>
    </div>`;
}

// ---- Spielstände + Backups -----------------------------------------------------------------------------
async function renderSaves(v: HTMLElement): Promise<void> {
  const [{ saves }, { backups }] = await Promise.all([
    api.get<{ saves: FileEntry[] }>('saves'),
    api.get<{ backups: FileEntry[] }>('backups'),
  ]);
  v.innerHTML = `
    <section class="card">
      <div class="head"><h2>Spielstände</h2><button class="secondary" id="up">Hochladen</button></div>
      ${saves.length ? `<ul class="list">${saves
        .map((s) => `<li><div><b>${esc(s.name.replace(/\.fos$/i, ''))}</b><small>${when(s.mtime)} · ${formatBytes(s.size)}</small></div>
          <div class="actions"><a class="btn secondary" href="${api.link('saves/download?name=' + encodeURIComponent(s.name))}" download>Herunterladen</a>
          <button class="danger" data-del="${esc(s.name)}">Löschen</button></div></li>`)
        .join('')}</ul>` : '<p class="muted">Noch keine Spielstände. Sie erscheinen hier, sobald du im Spiel speicherst.</p>'}
    </section>
    <section class="card">
      <div class="head"><h2>Backups</h2><button class="secondary" id="upzip">ZIP einspielen</button></div>
      <p class="muted">Ein Backup enthält alle Spielstände und Einstellungen. Vor jeder Wiederherstellung wird automatisch eine Sicherheitskopie angelegt.</p>
      <form class="row" id="mk"><input id="label" placeholder="Bezeichnung (optional), z. B. vor Dead Money" maxlength="40" /><button>Backup anlegen</button></form>
      ${backups.length ? `<ul class="list">${backups
        .map((b) => `<li><div><b>${esc(b.name.replace(/\.zip$/, '').replace(/_/g, ' '))}</b><small>${formatBytes(b.size)}</small></div>
          <div class="actions"><button class="secondary" data-restore="${esc(b.name)}">Wiederherstellen</button>
          <a class="btn secondary" href="${api.link('backups/download?name=' + encodeURIComponent(b.name))}" download>Herunterladen</a>
          <button class="danger" data-bdel="${esc(b.name)}">Löschen</button></div></li>`)
        .join('')}</ul>` : '<p class="muted">Noch keine Backups.</p>'}
    </section>`;
  v.querySelector('#up')!.addEventListener('click', async (e) => {
    const f = await pickFile('.fos');
    if (f && (await busy(e.target as HTMLButtonElement, () => api.post('saves/upload?name=' + encodeURIComponent(f.name), undefined, f)))) {
      toast('Spielstand hochgeladen');
      void render();
    }
  });
  v.querySelector('#upzip')!.addEventListener('click', async (e) => {
    const f = await pickFile('.zip');
    if (!f || !confirm('Dieses Backup einspielen? Deine aktuellen Spielstände werden vorher automatisch gesichert.')) return;
    if (await busy(e.target as HTMLButtonElement, () => api.post('backups/upload', undefined, f))) {
      toast('Backup eingespielt');
      void render();
    }
  });
  v.querySelector<HTMLFormElement>('#mk')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = v.querySelector<HTMLInputElement>('#label')!.value;
    if (await busy(v.querySelector('#mk button'), () => api.post('backups/create', { label }))) {
      toast('Backup angelegt');
      void render();
    }
  });
  v.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (confirm(`Spielstand „${b.dataset.del}“ wirklich löschen?`) && (await busy(b, () => api.post('saves/delete', { name: b.dataset.del })))) {
        toast('Gelöscht');
        void render();
      }
    }),
  );
  v.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Dieses Backup wiederherstellen? Die aktuellen Spielstände werden vorher automatisch gesichert.')) return;
      if (await busy(b, () => api.post('backups/restore', { name: b.dataset.restore }))) {
        toast('Wiederhergestellt');
        void render();
      }
    }),
  );
  v.querySelectorAll<HTMLButtonElement>('[data-bdel]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (confirm('Backup wirklich löschen?') && (await busy(b, () => api.post('backups/delete', { name: b.dataset.bdel })))) void render();
    }),
  );
}

// ---- Spieldaten / DLCs ---------------------------------------------------------------------------------
async function renderData(v: HTMLElement): Promise<void> {
  const { dlc } = await api.get<{ dlc: Dlc[] }>('dlc');
  v.innerHTML = `
    <section class="card">
      <h2>Erweiterungen (DLC)</h2>
      <p class="muted">Gilt für dein Konto ab dem nächsten Spielstart. Ein Spielstand, der ein DLC benutzt, braucht es zum Laden.</p>
      ${dlc.length ? `<ul class="list">${dlc
        .map((d) => `<li><div><b>${esc(prettyDlc(d.name))}</b><small>${esc(d.name)}</small></div>
          <label class="switch"><input type="checkbox" data-dlc="${esc(d.name)}" ${d.enabled ? 'checked' : ''}/><span></span></label></li>`)
        .join('')}</ul>` : '<p class="muted">Keine DLCs auf dem Server gefunden.</p>'}
    </section>
    <section class="card">
      <h2>Spieldaten auf diesem Gerät</h2>
      <p class="muted">Die Spieldaten kommen vom Server. Was einmal geladen wurde, hält der Browser im Zwischenspeicher. Eine vollständige Offline-Kopie mit eigener Verwaltung folgt nach dem ersten erfolgreichen Spielstart.</p>
      <div id="quota" class="muted"></div>
    </section>`;
  v.querySelectorAll<HTMLInputElement>('[data-dlc]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      const ok = await busy(null, () => api.post('dlc', { name: cb.dataset.dlc, enabled: cb.checked }));
      if (ok) toast(`${prettyDlc(cb.dataset.dlc!)}: ${cb.checked ? 'an' : 'aus'}`);
      else cb.checked = !cb.checked;
    }),
  );
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  if (est) view().querySelector('#quota')!.textContent = `Belegt auf diesem Gerät: ${formatBytes(est.usage)} von ${formatBytes(est.quota)}.`;
}

const DLC_NAMES: Record<string, string> = {
  deadmoney: 'Dead Money', honesthearts: 'Honest Hearts', oldworldblues: 'Old World Blues', lonesomeroad: 'Lonesome Road',
  gunrunnersarsenal: "Gun Runners' Arsenal", caravanpack: 'Courier’s Stash: Caravan Pack', classicpack: 'Courier’s Stash: Classic Pack',
  mercenarypack: 'Courier’s Stash: Mercenary Pack', tribalpack: 'Courier’s Stash: Tribal Pack',
};
const prettyDlc = (n: string) => DLC_NAMES[n.toLowerCase()] ?? n;

// ---- Cheats --------------------------------------------------------------------------------------------
function renderCheats(v: HTMLElement): void {
  const label = cheatLabel();
  v.innerHTML = `
    <section class="card">
      <h2>Cheats</h2>
      ${label
        ? `<p>✅ Freigeschaltet (${esc(label)}) – bis du die App schließt.</p>
           <p class="muted">Im Spiel oben in der Mitte auf <b>☰</b> tippen. Verfügbar:</p>
           <ul class="plain">${CHEATS.map((c) => `<li><b>${esc(c.label)}</b> – ${esc(c.help)}</li>`).join('')}</ul>
           <button class="secondary" id="lock">Wieder sperren</button>`
        : `<p class="muted">Cheats sind mit einem eigenen Passwort geschützt. Die Passwörter verwaltet der Admin.</p>
           <form class="row" id="unlock"><input type="password" id="cpw" placeholder="Cheat-Passwort" autocomplete="off" /><button>Freischalten</button></form>`}
    </section>`;
  v.querySelector('#lock')?.addEventListener('click', () => {
    lockCheats();
    void render();
  });
  v.querySelector<HTMLFormElement>('#unlock')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = v.querySelector<HTMLInputElement>('#cpw')!.value;
    await busy(v.querySelector('#unlock button'), async () => {
      const r = await api.post<{ ok: true; label: string }>('cheats/unlock', { password: pw });
      try { sessionStorage.setItem('fonv.cheats', r.label); } catch { /* egal */ }
      toast('Cheats freigeschaltet');
      void render();
    });
  });
}

// ---- Admin-Center --------------------------------------------------------------------------------------
async function renderAdmin(v: HTMLElement): Promise<void> {
  const [{ users }, { cheats }] = await Promise.all([
    api.get<{ users: UserEntry[] }>('admin/users'),
    api.get<{ cheats: CheatEntry[] }>('admin/cheats'),
  ]);
  v.innerHTML = `
    <section class="card">
      <h2>Spieler-Zugänge</h2>
      <p class="muted">Jeder Zugang hat eigene Spielstände, Backups und DLC-Einstellungen. Neue Zugänge müssen ihr Passwort beim ersten Login ändern.</p>
      <ul class="list">${users
        .map((u) => `<li><div><b>${esc(u.user)}</b><small>${u.admin ? 'Admin' : 'Spieler'}${u.mustChangePassword ? ' · muss Passwort ändern' : ''}${u.user === me?.user ? ' · du' : ''}</small></div>
          <div class="actions"><button class="secondary" data-pw="${esc(u.user)}">Passwort</button>
          ${u.user === me?.user ? '' : `<button class="secondary" data-adm="${esc(u.user)}" data-on="${u.admin ? 0 : 1}">${u.admin ? 'Admin entziehen' : 'Zum Admin'}</button>
          <button class="danger" data-udel="${esc(u.user)}">Löschen</button>`}</div></li>`)
        .join('')}</ul>
      <form class="row wrap" id="adduser">
        <input id="nu" placeholder="Name" autocomplete="off" required pattern="[A-Za-z0-9._-]{1,40}" />
        <input id="np" type="password" placeholder="Start-Passwort (mind. 8)" autocomplete="new-password" required minlength="8" />
        <label class="check"><input type="checkbox" id="na" /> Admin</label>
        <button>Zugang anlegen</button>
      </form>
    </section>
    <section class="card">
      <h2>Cheat-Passwörter</h2>
      <p class="muted">Jedes dieser Passwörter schaltet die Cheats frei. Gespeichert werden nur verschlüsselte Prüfwerte.</p>
      ${cheats.length ? `<ul class="list">${cheats
        .map((c) => `<li><div><b>${esc(c.label)}</b><small>${c.created ? 'angelegt ' + when(c.created) : ''}</small></div>
          <button class="danger" data-cdel="${esc(c.id)}">Löschen</button></li>`)
        .join('')}</ul>` : '<p class="muted">Noch keine Cheat-Passwörter – Cheats sind gesperrt.</p>'}
      <form class="row wrap" id="addcheat">
        <input id="cl" placeholder="Bezeichnung, z. B. Familie" required maxlength="60" />
        <input id="cp" type="password" placeholder="Cheat-Passwort (mind. 4)" autocomplete="new-password" required minlength="4" />
        <button>Hinzufügen</button>
      </form>
    </section>`;
  const reload = () => void render();
  v.querySelector<HTMLFormElement>('#adduser')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { user: val('#nu'), password: val('#np'), admin: v.querySelector<HTMLInputElement>('#na')!.checked };
    if (await busy(v.querySelector('#adduser button'), () => api.post('admin/users/add', body))) { toast(`Zugang „${body.user}“ angelegt`); reload(); }
  });
  v.querySelector<HTMLFormElement>('#addcheat')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await busy(v.querySelector('#addcheat button'), () => api.post('admin/cheats/add', { label: val('#cl'), password: val('#cp') }))) { toast('Cheat-Passwort hinzugefügt'); reload(); }
  });
  v.querySelectorAll<HTMLButtonElement>('[data-pw]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (b.dataset.pw === me?.user) return passwordDialog(false);
      const pw = prompt(`Neues Passwort für „${b.dataset.pw}“ (mind. 8 Zeichen). Es muss beim nächsten Login geändert werden.`);
      if (pw && (await busy(b, () => api.post('admin/users/password', { user: b.dataset.pw, password: pw })))) { toast('Passwort gesetzt'); reload(); }
    }),
  );
  v.querySelectorAll<HTMLButtonElement>('[data-adm]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (await busy(b, () => api.post('admin/users/admin', { user: b.dataset.adm, admin: b.dataset.on === '1' }))) reload();
    }),
  );
  v.querySelectorAll<HTMLButtonElement>('[data-udel]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (confirm(`Zugang „${b.dataset.udel}“ löschen? Seine Spielstände bleiben auf dem Server erhalten.`) && (await busy(b, () => api.post('admin/users/delete', { user: b.dataset.udel })))) reload();
    }),
  );
  v.querySelectorAll<HTMLButtonElement>('[data-cdel]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (confirm('Dieses Cheat-Passwort löschen?') && (await busy(b, () => api.post('admin/cheats/delete', { id: b.dataset.cdel })))) reload();
    }),
  );
  function val(sel: string): string {
    return v.querySelector<HTMLInputElement>(sel)!.value;
  }
}

// ---- Passwort ändern (Pflicht nach dem Startpasswort) ---------------------------------------------------
function passwordDialog(forced: boolean): void {
  const d = document.createElement('dialog');
  d.className = 'dialog';
  d.innerHTML = `<form method="dialog" id="pwf">
      <h2>${forced ? 'Bitte neues Passwort festlegen' : 'Passwort ändern'}</h2>
      ${forced ? '<p class="muted">Du bist mit einem Start-Passwort angemeldet. Lege jetzt dein eigenes fest.</p>' : ''}
      <input type="password" id="cur" placeholder="Aktuelles Passwort" autocomplete="current-password" required />
      <input type="password" id="new1" placeholder="Neues Passwort (mind. 8 Zeichen)" autocomplete="new-password" required minlength="8" />
      <input type="password" id="new2" placeholder="Neues Passwort wiederholen" autocomplete="new-password" required minlength="8" />
      <div class="row end">${forced ? '' : '<button type="button" class="secondary" id="cancel">Abbrechen</button>'}<button id="save">Speichern</button></div>
    </form>`;
  document.body.appendChild(d);
  d.showModal();
  d.addEventListener('cancel', (e) => forced && e.preventDefault());
  d.querySelector('#cancel')?.addEventListener('click', () => d.remove());
  d.querySelector<HTMLFormElement>('#pwf')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = (s: string) => d.querySelector<HTMLInputElement>(s)!.value;
    if (q('#new1') !== q('#new2')) return toast('Die neuen Passwörter stimmen nicht überein', 'error');
    const ok = await busy(d.querySelector('#save'), () => api.post('account/password', { current: q('#cur'), password: q('#new1') }));
    if (ok) {
      d.remove();
      alert('Passwort geändert. Safari fragt gleich einmal nach dem neuen Passwort.');
      location.reload();
    }
  });
}

// ---- Diagnose (Systemcheck + Belastungstest) -----------------------------------------------------------
let checks: CheckItem[] = [];
let stress: StressResult[] = loadResults();
const sIcon = { ok: '✅', fail: '❌', crash: '💥' } as const;
const cIcon: Record<Status, string> = { ok: '✅', warn: '⚠️', fail: '❌' };

function renderSystem(v: HTMLElement): void {
  v.innerHTML = `
    ${me ? '' : `<section class="card"><h2>Diagnose-Version</h2><p class="muted">Diese Seite prüft nur, was dein Gerät kann. Das Spiel selbst läuft auf deinem eigenen, passwortgeschützten Server.</p></section>`}
    <section class="card">
      <div class="head"><h2>Systemcheck</h2><button id="run">Starten</button></div>
      <div id="summary"></div>
      <ul class="results" id="results"></ul>
    </section>
    <section class="card">
      <div class="head"><h2>Belastungstest</h2><div class="actions"><button id="stress">Starten / fortsetzen</button><button class="secondary" id="stressReset">Zurücksetzen</button></div></div>
      <p class="muted">Spielt nach, was das Spiel beim Start verlangt. Stürzt Safari ab, lädt die Seite neu – dann einfach fortsetzen.</p>
      <div id="stressNow"></div>
      <ul class="results" id="stressList"></ul>
    </section>
    <div class="row"><button class="secondary" id="copy">Ergebnis kopieren</button><button class="secondary" id="persist">Speicher dauerhaft sichern</button></div>`;
  const paintChecks = () => {
    if (!checks.length) return;
    const o = overall(checks);
    v.querySelector('#summary')!.textContent = `${cIcon[o]} ${o === 'ok' ? 'Alles bereit.' : o === 'warn' ? 'Nutzbar, mit Hinweisen.' : 'Wichtige Funktionen fehlen.'}`;
    v.querySelector('#results')!.innerHTML = checks
      .map((i) => `<li><span>${cIcon[i.status]}</span><div><b>${esc(i.label)}</b><small>${esc(i.detail)}</small></div></li>`)
      .join('');
  };
  const paintStress = (results: StressResult[], running?: string, line?: string) => {
    stress = results;
    v.querySelector('#stressNow')!.textContent = running ? `⏳ ${running}${line ? ' – ' + line : ''}` : results.length >= STEPS.length ? 'Fertig.' : '';
    v.querySelector('#stressList')!.innerHTML = results
      .map((r) => `<li><span>${sIcon[r.status]}</span><div><b>${esc(r.label)}</b><small>${esc(r.detail)}</small></div></li>`)
      .join('');
  };
  paintChecks();
  paintStress(stress);
  v.querySelector('#run')!.addEventListener('click', async (e) => {
    await busy(e.target as HTMLButtonElement, async () => {
      v.querySelector('#summary')!.textContent = 'Prüfe …';
      checks = await runSystemCheck();
      paintChecks();
    });
  });
  v.querySelector('#stress')!.addEventListener('click', (e) => busy(e.target as HTMLButtonElement, () => runRemaining(paintStress)));
  v.querySelector('#stressReset')!.addEventListener('click', () => {
    resetResults();
    paintStress([]);
  });
  v.querySelector('#persist')!.addEventListener('click', async () => {
    const ok = await navigator.storage?.persist?.().catch(() => false);
    toast(ok ? 'Speicher ist dauerhaft.' : 'Nicht gewährt – App zum Home-Bildschirm hinzufügen und von dort öffnen.', ok ? 'ok' : 'error');
  });
  v.querySelector('#copy')!.addEventListener('click', async () => {
    const text = JSON.stringify({ version: __APP_VERSION__, date: new Date().toISOString(), checks, stress }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('Kopiert – einfach in den Chat einfügen.');
    } catch {
      prompt('Bitte manuell kopieren:', text);
    }
  });
}

// ---- Start ---------------------------------------------------------------------------------------------
async function start(): Promise<void> {
  me = await detectServer();
  if (me && !me.user) {
    // Server erreichbar, aber (noch) nicht angemeldet: Seite neu laden lässt Safari nach dem Passwort fragen
    app.innerHTML = '<main class="center"><div class="card"><h2>Bitte anmelden</h2><p class="muted">Lade die Seite neu und gib Name und Passwort ein.</p><button onclick="location.reload()">Neu laden</button></div></main>';
    return;
  }
  try {
    const saved = localStorage.getItem('fonv.tab') as Tab | null;
    if (saved && TABS.some((t) => t.id === saved)) tab = saved;
  } catch { /* egal */ }
  shell();
  if (me?.mustChangePassword) passwordDialog(true);
  // Offline-Fähigkeit nur für die Diagnose-Version (GitHub Pages). Auf dem eigenen Server setzt Apache die
  // Header, und ein Service Worker würde die vielen Spieldaten-Anfragen nur ausbremsen.
  if (!me && 'serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      if (!crossOriginIsolated && !sessionStorage.getItem('coi-reload')) {
        sessionStorage.setItem('coi-reload', '1');
        navigator.serviceWorker.ready.then(() => location.reload());
      }
    });
  }
}

void start().catch((e) => {
  if (e instanceof ApiError && e.status === 401) location.reload();
  else app.textContent = String(e);
});
