// End-to-End-Test der App auf einem echten Server (Apache + PHP), bedient wie ein Nutzer auf dem iPad.
// Voraussetzung: der Upload-Ordner von tools/assemble.mjs läuft auf <base> mit einem Ersatz-Spiel (game.html mit
// Module.ccall-Attrappe), und "admin" hat noch das Startpasswort.
//   NODE_PATH=$(npm root -g) node tools/e2e-app.cjs <base-url> <startpasswort> <screenshot-ordner>
const { webkit, chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const [base, startPw, shots] = process.argv.slice(2);
const NEW_PW = 'Neues-Admin-Pw-2026';
let step = 0;
const log = (m) => console.log(`${String(++step).padStart(2)}. ${m}`);

(async () => {
  let browser;
  try { browser = await webkit.launch(); } catch { browser = await chromium.launch(); }
  const device = devices['iPad Pro 11 landscape'];
  const ctx = async (user, pw) => browser.newContext({ ...device, httpCredentials: { username: user, password: pw } });
  const shot = (p, name) => p.screenshot({ path: path.join(shots, name + '.png') });

  // --- Erster Login mit Startpasswort: App erzwingt neues Passwort -------------------------------------
  let c = await ctx('admin', startPw);
  let p = await c.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + '/');
  await p.waitForSelector('dialog[open] #pwf');
  await shot(p, '01-passwort-pflicht');
  await p.keyboard.press('Escape');
  assert.ok(await p.isVisible('dialog[open]'), 'Pflicht-Dialog lässt sich nicht wegklicken');
  await p.fill('#cur', startPw);
  await p.fill('#new1', NEW_PW);
  await p.fill('#new2', 'tippfehler');
  await p.click('#save');
  await p.waitForSelector('.toast.error');
  await p.fill('#new2', NEW_PW);
  const done1 = p.waitForEvent('dialog');
  await p.click('#save');
  await (await done1).accept();   // „Passwort geändert“ erscheint erst nach erfolgreichem Speichern
  await c.close();
  log('Startpasswort → Pflicht zum Ändern, Dialog nicht abbrechbar, Tippfehler erkannt, Passwort geändert');

  // altes Passwort geht nicht mehr
  c = await ctx('admin', startPw);
  p = await c.newPage();
  const r401 = await p.goto(base + '/api/saves');
  assert.equal(r401.status(), 401);
  await c.close();
  log('Startpasswort gilt danach nicht mehr (401)');

  // --- Normale Nutzung als Admin -------------------------------------------------------------------------
  c = await ctx('admin', NEW_PW);
  p = await c.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + '/');
  await p.waitForSelector('.hero h1');
  assert.equal(await p.isVisible('dialog[open]'), false);
  const tabs = await p.$$eval('.tabbar button span', (s) => s.map((x) => x.textContent));
  assert.deepEqual(tabs, ['Spielen', 'Spielstände', 'Spieldaten', 'Cheats', 'Admin', 'Diagnose']);
  await shot(p, '02-start');
  log(`Startseite: Tabs ${tabs.join(' · ')}`);

  // Admin-Center: Spieler + Cheat-Passwort anlegen
  await p.click('.tabbar [data-tab=admin]');
  await p.waitForSelector('#adduser');
  await p.fill('#nu', 'lisa');
  await p.fill('#np', 'Lisa-Start-123');
  await p.click('#adduser button');
  await p.waitForSelector('text=lisa');
  await p.fill('#cl', 'Familie');
  await p.fill('#cp', 'nuka');
  await p.click('#addcheat button');
  await p.waitForSelector('text=Familie');
  await shot(p, '03-admin');
  log('Admin-Center: Zugang „lisa“ und Cheat-Passwort „Familie“ angelegt');

  // Spielstand hochladen, Backup anlegen
  await p.click('.tabbar [data-tab=saves]');
  await p.waitForSelector('#mk');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#up')]);
  await chooser.setFiles({ name: 'Save 3 - Kurier  Goodsprings.fos', mimeType: 'application/octet-stream', buffer: Buffer.from('FO3SAVEGAME-test') });
  await p.waitForSelector('text=Save 3 - Kurier  Goodsprings');
  await p.fill('#label', 'erster Test');
  await p.click('#mk button');
  await p.waitForSelector('text=erster Test');
  await shot(p, '04-spielstaende');
  const dl = await Promise.all([p.waitForEvent('download'), p.click('a[href*="saves/download"]')]);
  assert.equal(dl[0].suggestedFilename(), 'Save 3 - Kurier  Goodsprings.fos');
  log('Spielstände: Upload, Download, Backup „erster Test“ angelegt');

  // Wiederherstellen nach Löschen
  p.on('dialog', (d) => d.accept());
  await p.click('[data-del]');
  await p.waitForSelector('text=Noch keine Spielstände');
  await p.click('[data-restore]');
  await p.waitForSelector('text=Save 3 - Kurier  Goodsprings');
  assert.ok(await p.isVisible('text=vor-wiederherstellung'));
  log('Spielstand gelöscht und per Backup wiederhergestellt (Sicherheitskopie automatisch angelegt)');

  // DLC ausschalten → Spiel-Index ohne Marker
  await p.click('.tabbar [data-tab=data]');
  await p.waitForSelector('[data-dlc]');
  assert.equal(await p.textContent('.list b'), 'Dead Money');
  await p.click('.switch');
  await p.waitForSelector('.toast >> text=Dead Money: aus');
  const idx = await p.evaluate(() => fetch('/fs/index').then((r) => r.json()));
  assert.equal(idx.f['/game/data/deadmoney.nam'], undefined);
  await shot(p, '05-spieldaten');
  log('Spieldaten: DLC „Dead Money“ ausgeschaltet, Spiel sieht es nicht mehr');

  // Cheats freischalten
  await p.click('.tabbar [data-tab=cheats]');
  await p.fill('#cpw', 'falsch');
  await p.click('#unlock button');
  await p.waitForSelector('.toast.error');
  await p.fill('#cpw', 'nuka');
  await p.click('#unlock button');
  await p.waitForSelector('text=Freigeschaltet (Familie)');
  await shot(p, '06-cheats');
  log('Cheats: falsches Passwort abgelehnt, „nuka“ schaltet frei');

  // --- Spielseite: randlos, Menü-Knopf, Cheats -----------------------------------------------------------
  await p.click('.tabbar [data-tab=play]');
  await p.click('a.btn.big');
  await p.waitForFunction(() => document.title === 'Spiel bereit');
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('fonv-borderless')));
  assert.equal(await p.isVisible('#bar'), false);
  const box = await p.$eval('#screen', (e) => e.getBoundingClientRect().toJSON());
  const vp = p.viewportSize();
  assert.ok(Math.abs(box.width - Math.min(vp.width, (vp.height * 16) / 9)) < 2, 'Bild füllt den Bildschirm im 16:9-Format');
  await shot(p, '07-spiel-randlos');
  await p.click('#fonv-btn');
  await p.waitForSelector('#fonv-panel:not([hidden])');
  await shot(p, '08-spiel-menue');
  await p.click('#fonv-panel button[data-cmd="tgm"]');
  await p.fill('#fonv-panel input[name=c]', 'player.additem f 5');
  await p.press('#fonv-panel input[name=c]', 'Enter');
  assert.deepEqual(await p.evaluate(() => window.consoleLog), ['tgm', 'player.additem f 5']);
  log('Spielseite: randlos 16:9, ☰-Menü, Cheat „Gott-Modus“ + eigener Befehl an die Spielkonsole');
  await p.click('#fonv-panel button[data-a=bl]');
  assert.equal(await p.isVisible('#bar'), true);
  await p.click('#fonv-panel button[data-a=bl]');
  assert.equal(await p.isVisible('#bar'), false);
  log('Randlos/Mit Leiste umschaltbar');
  await p.click('#fonv-panel a.b');
  await p.waitForSelector('.hero h1');
  log('„Zur App“ führt zurück');
  await c.close();

  // --- Zweiter Spieler: eigene Daten, kein Admin, Cheats im Spiel gesperrt --------------------------------
  c = await ctx('lisa', 'Lisa-Start-123');
  p = await c.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + '/');
  await p.waitForSelector('dialog[open] #pwf');
  await p.fill('#cur', 'Lisa-Start-123');
  await p.fill('#new1', 'Lisa-Eigenes-1');
  await p.fill('#new2', 'Lisa-Eigenes-1');
  const done2 = p.waitForEvent('dialog');
  await p.click('#save');
  await (await done2).accept();
  await c.close();
  c = await ctx('lisa', 'Lisa-Eigenes-1');
  p = await c.newPage();
  await p.goto(base + '/');
  await p.waitForSelector('.hero h1');
  const tabsL = await p.$$eval('.tabbar button span', (s) => s.map((x) => x.textContent));
  assert.ok(!tabsL.includes('Admin'));
  await p.click('.tabbar [data-tab=saves]');
  await p.waitForSelector('text=Noch keine Spielstände');
  const adm = await p.evaluate(() => fetch('/api/admin/users').then((r) => r.status));
  assert.equal(adm, 403);
  await p.goto(base + '/game.html');
  await p.click('#fonv-btn');
  assert.ok(await p.isVisible('#fonv-panel input[name=p]'), 'Cheats im Spiel gesperrt');
  await p.fill('#fonv-panel input[name=p]', 'nuka');
  await p.press('#fonv-panel input[name=p]', 'Enter');
  await p.waitForSelector('#fonv-panel button[data-cmd="tgm"]');
  log('Zweiter Spieler: eigenes Passwort, eigene (leere) Spielstände, kein Admin-Zugriff, Cheats im Spiel freischaltbar');
  await c.close();

  assert.deepEqual(errors, [], 'keine JavaScript-Fehler');
  log('keine JavaScript-Fehler');
  await browser.close();
  console.log(`\nALLE ${step} PRÜFUNGEN BESTANDEN (${browser.browserType().name()})`);
})().catch(async (e) => {
  console.error(`\nFEHLGESCHLAGEN nach Schritt ${step}:`, e);
  process.exit(1);
});
