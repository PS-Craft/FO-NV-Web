# Anleitung: New Vegas privat im Browser (iPad, unterwegs, mit Passwort)

**Stand:** 2026-11-09 · App und Server getestet (Apache + PHP, wie bei all-inkl) · PC-Build-Skripte noch
nicht auf echtem PC getestet

## Wie es funktioniert

```
 iPad (Safari, als App auf dem Home-Bildschirm)
   │  https://fnv.deine-domain.de   ← Passwortabfrage (Verzeichnisschutz)
   ▼
 Weblaufwerk (all-inkl, PHP)
   ├─ fnv-www/      Spielseite + WebAssembly (aus DEINER FalloutNV.exe gebaut) + fs.php + .htaccess
   ├─ fnv-game/     deine Installation: FalloutNV.exe + Data/   (nicht direkt aus dem Web erreichbar)
   ├─ fnv-mobile/   verkleinerte Textur-/Sound-Archive fürs iPad
   ├─ fnv-data/     Einstellungen + Spielstände (beschreibbar)
   └─ fnv-cache/    Dateiindex
        ▲
        │ einmalig (und bei Updates) hochladen
 Build-PC (Windows) – baut aus deiner Steam-Kopie die Browser-Version
```

Grundlage ist das Open-Source-Projekt **[fnv-web-recomp](https://github.com/SgtMetz/fnv-web-recomp)**
(MIT), dieselbe Technik wie falloutnewvegasweb.com. Dieses Repo ergänzt:
- `hosting/fs.php` + `hosting/htaccess.txt`: Ersatz für dessen Node-Server, damit es auf normalem
  PHP-Webspace läuft. Getestet gegen das Verhalten des Originals (`src/fs-php.test.ts`) und mit Apache.
- `pc/setup.ps1`, `pc/build.ps1`: Einrichtung und Build auf dem PC.

**Auf GitHub landen nie** Spieldateien, die gebaute WebAssembly-Datei oder Shader – alles davon ist aus
deiner Kopie abgeleitet und bleibt auf PC und Weblaufwerk.

---

## Schritt 0 – Schnelltest auf dem iPad (5 Minuten, vor allem anderen!)

Öffne auf dem iPad in Safari **falloutnewvegasweb.com**, wähle **Low** und **Start outside Doc
Mitchell's house**. Das ist exakt die Technik, die wir aufbauen.

- Läuft es (auch ruckelig)? → Super, dann wissen wir: Dein iPad schafft es grundsätzlich.
- Bricht es ab / Fehlermeldung / Seite lädt neu? → Bitte Screenshot und **iPad-Modell + iPadOS-Version**
  an Claude. Dann muss die Engine für Safari angepasst werden, bevor sich der Rest lohnt.

## Schritt 1 – Weblaufwerk vorbereiten (all-inkl, KAS)

1. **Subdomain** anlegen, z. B. `fnv.deine-domain.de`, mit eigenem Ordner `/fnv-www/`.
   Wichtig: Das Spiel muss **im Wurzelverzeichnis** einer (Sub-)Domain liegen, nicht in einem Unterordner.
2. **SSL/HTTPS** (Let's Encrypt) für die Subdomain aktivieren – ohne HTTPS startet das Spiel nicht.
3. **PHP 8.1 oder neuer** für die Subdomain einstellen.
4. Per FTP/SFTP **neben** `fnv-www` diese Ordner anlegen: `fnv-game`, `fnv-mobile`, `fnv-data`, `fnv-cache`.
5. **Speicherplatz prüfen:** ca. 12 GB (Spiel ~10 GB inkl. DLC, iPad-Archive ~1 GB, Build ~0,2 GB).
6. **Verzeichnisschutz** (KAS → Tools → Verzeichnisschutz) für `/fnv-www/` mit Benutzername + gutem
   Passwort anlegen. **Erst nach** dem Hochladen der `.htaccess` (Schritt 5) – danach kontrollieren, dass
   unsere Zeilen in der `.htaccess` noch drin sind.

## Schritt 2 – Build-PC einrichten

Am einfachsten **gemeinsam mit Claude** (siehe unten „PC mit Claude verbinden“). Alleine:

1. Fallout: New Vegas in **Steam installieren und einmal starten** (Launcher reicht).
2. Dieses Repo herunterladen (Code → Download ZIP) und entpacken.
3. PowerShell **als Administrator** öffnen, in den Ordner `pc` wechseln:
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass; .\setup.ps1
   ```
4. Die Prüfliste am Ende an Claude schicken.

## Schritt 3 – Shader-Werkzeuge (vkd3d + Tint)

Die Original-Shader (Direct3D 9) werden in WebGPU-Shader übersetzt. Dafür braucht es eine gepatchte
vkd3d-Version und Tint aus Googles Dawn. Dieser Teil ist am wenigsten standardisiert – **den machen wir
gemeinsam**, sobald Schritt 2 durch ist.

## Schritt 4 – Zugangsdaten fürs Hochladen

`pc\deploy.example.json` als **`pc\deploy.local.json`** speichern und ausfüllen (SFTP-/FTP-Zugang aus dem KAS,
`remoteBase` = absoluter Pfad des Webspace, z. B. `/www/htdocs/w0123456`, `webFolder` = Ordner der Subdomain).
Diese Datei wird nie committet.

## Schritt 5 – Bauen und hochladen

```powershell
.\build.ps1               # Spiel aus der eigenen exe bauen + App + Upload-Ordner (C:\FNV-Web\upload)
.\deploy.ps1 -GameFiles   # erstes Mal: zusätzlich FalloutNV.exe + Data\ (~10 GB)
.\deploy.ps1              # später: nur Geändertes
```

`deploy.ps1` legt die Ordner auf dem Server an, lädt App, Spiel-Build, iPad-Archive und Server-Dateien hoch und
richtet beim allerersten Mal den **Startzugang `admin`** ein (das Startpasswort steht nicht im Repo, nur sein
Prüfwert; Claude hat es dir im Chat gegeben). `fs-config.php` und `.htaccess` werden automatisch erzeugt.

## Schritt 6 – Erster Start

1. iPad → Safari → `https://fnv.deine-domain.de` → Name `admin` + Startpasswort.
2. Die App verlangt sofort ein **eigenes Passwort**. Danach fragt Safari einmal nach dem neuen.
3. Teilen → **Zum Home-Bildschirm**, ab dann von dort starten.
4. **Admin** → weitere Spieler-Zugänge und **Cheat-Passwörter** anlegen.

## Die App

| Bereich | Was es kann |
|---|---|
| **Spielen** | Spiel starten, letzter Spielstand, Überblick |
| **Spielstände** | Liste, Herunterladen, Hochladen, Löschen; **Backups** als ZIP anlegen, herunterladen, einspielen, wiederherstellen (vorher automatische Sicherheitskopie) |
| **Spieldaten** | **DLCs einzeln an/aus** (pro Spieler); **Datenmanager**: Spiel aufs Gerät laden (offline spielen), Spielstände in der Cloud |
| **Cheats** | Freischalten mit Cheat-Passwort; im Spiel dann über **☰** |
| **Admin** | Spieler-Zugänge (anlegen, Passwort zurücksetzen, Admin-Rechte, löschen), Cheat-Passwörter |
| **Diagnose** | Systemcheck und Belastungstest |

**Anzeige** (unter „Spielen“ wählbar, auch im Spiel-Menü): **Vollbild** (ab dem ersten Tippen/Klicken),
**Fenster** (randlos, ohne Leisten und Knöpfe) oder **Mit Leiste** (Originalseite). **Menü im Spiel:** Taste **F8**
(oder Maus an den oberen Rand, dann ☰), am iPad den Knopf **☰** oben in der Mitte antippen: Zur App · Anzeige · Cheats (Gott-Modus, Durch Wände,
Heilen, Kronkorken, Erfahrung, Tragkraft, Kartenorte, Unentdeckt, KI anhalten, eigener Konsolenbefehl).
**Eingabe:** Tastatur geht immer – auch am iPad mit Tastatur und zusammen mit Touch; Maus/Trackpad ebenso. Die
Touch-Steuerung (Stick und Knöpfe) lässt sich im ☰-Menü aus- und einschalten.
Am iPad blendet sie sich von selbst aus, sobald du Tastatur oder Maus/Trackpad benutzt, und wieder ein, wenn du das
Bild mit dem Finger berührst. **In Menüs** (Hauptmenü, Pip-Boy, Dialoge) klickt ein Fingertipp genau dort, wo du
tippst, und der Spielzeiger folgt Maus/Trackpad exakt (gilt für die GOG-Fassung 1.4.0.525).
**iPad-Qualität:** `game-ipad.html` benutzt immer die kleinen Archive („Niedrig“) – mit „Hoch“ schließt iPadOS den
Tab wegen Speichermangel.
**Menü im Spiel (☰ / F8):** Weiterspielen, **Speichern & verlassen** (schnellspeichern, hochladen, zurück zur App),
Pause, Pip-Boy, Schnellspeichern, Anzeige, **Akku sparen** (höchstens 30 Bilder/s), **Pause im Hintergrund** (beim
App-Wechsel pausiert das Spiel und sichert), Touch-Steuerung, Cheats. Beendet sich das Spiel selbst (Hauptmenü → Quit),
geht es zurück zur App. Fällt die Grafik aus (iPad), wird zuerst schnellgespeichert, dann neu laden.
**Diagnose:** Die Spielseite schreibt alle paar Sekunden ihren Zustand nach `fnv-data/users/<Name>/FONV-Diagnose/`
(eigener Server). Schließt der Browser den Tab, zeigt die letzte Zeile, was das Spiel gerade tat.
**Tempo:** Apache prüft das Passwort bei jeder Anfrage. Die App speichert Passwörter deshalb mit bcrypt-Stufe 6 und
stellt ältere (Stufe 12, ~0,2 s je Anfrage) beim nächsten Öffnen der App automatisch um.
Geht die Anmeldung verloren (z. B. nach einem Netzwechsel), leiten App und Spiel nach ein paar Sekunden
selbst zur Anmeldung weiter.

**Spielstände** speichert das Spiel auf dem Server (`fnv-data/<Spieler>`), sie erscheinen unter „Spielstände“.

### Offline spielen (Datenmanager, Tab „Spieldaten“)

- **Herunterladen** lädt das Spiel einmal aufs Gerät: Qualität **Hoch** (PC, ~10 GB mit DLCs) oder **Niedrig**
  (iPad, ~7 GB), dazu die eingeschalteten DLCs. Anhalten/Fortsetzen jederzeit, auch nach Abbruch der Verbindung.
- Danach startet das Spiel **vom Gerät**: keine Wartezeit auf den Server, kaum Latenz, und es läuft **ohne Internet**.
- **Spielstände in der Cloud:** werden auf dem Gerät gespeichert und im Hintergrund mit dem Server abgeglichen
  (nach dem Speichern hochgeladen, beim App-Start geholt). Haben zwei Geräte denselben Spielstand geändert, bleiben
  beide erhalten (der vom Server als „… (Cloud Datum)“).
- **Das Netz stört nicht mehr:** Spieldaten, App, Shader und Spielstände kommen vom Gerät; die Ladeanzeige sagt dann
  „vom Gerät geladen“. Fällt der Server aus oder wechselt das Netz, läuft das Spiel weiter (lokal geprüft: Start mit
  abgeschaltetem Server, 0 Anfragen für Spieldaten).
- **Ladezeiten:** Mit Daten vom Gerät lesen eigene Worker (`public/fs-worker.js`) die Spieldateien direkt aus dem
  Gerätespeicher in den Speicher des Spiels – ohne Umweg über HTTP und Service Worker (pc/patches/0006). Große
  Spieldateien (FalloutNV.esm u. a.) werden in größeren Stücken gelesen und vorausgeladen, alle Shader kommen als ein
  Paket (~0,5 MB). Gemessen am PC: Hauptmenü 22,5 → 15 s, Schnellstart in die Welt 53 → 31–38 s.
- **Vom Gerät löschen** lädt vorher offene Spielstände hoch; auf dem Server ändert sich nichts.
- Vorher prüft die App selbst, ob der Browser das kann. iPad: App über Teilen → **Zum Home-Bildschirm** öffnen,
  sonst darf Safari die Daten nach einiger Zeit löschen.

Jeder Spieler hat **eigene Spielstände, Backups und DLC-Einstellungen**.

**Getestet** (ohne echtes Spiel, mit Ersatz-Spielseite): Apache + PHP mit Passwortschutz, 24 Unit-Tests
(`npm test`) und ein Klick-Test durch die ganze App mit 13 Prüfungen (`tools/e2e-app.cjs`).

## Engine: Stand und eigene Änderungen

`pc/build.ps1` baut die Engine (fnv-web-recomp von SgtMetz) immer vom selben Stand aus: Commit **8f79919**. Darauf
spielt es der Reihe nach alle Dateien aus `pc/patches` ein:

- `0000-upstream-*`: spätere Verbesserungen des Originals, die das **Spiel** betreffen. Im Dateinamen steht die
  Commit-Nummer des Originals. Übernommen: Rückfall auf den WebGPU-Kompatibilitätsmodus, gleichmäßiger Bildtakt,
  Shader-Kombinationen im Hintergrund kompilieren, roher Mauseingang, Threads gezielt wecken, Sound-Puffer freigeben,
  Messwerkzeug für Bildzeiten, Paketliste ohne Website-Seiten. **Nicht** übernommen: Chat, Werbung, Besucher-Statistik,
  Website-Seiten.
- `0001`–`0010`: unsere eigenen Korrekturen (Ladezeiten, Speicher, Abstürze; Kurzbeschreibung jeweils im Dateinamen
  und in den Commit-Nachrichten dieses Repos).

Die bisherigen Fassungen geänderter Engine-Dateien legt der Build vorher in `fnv-web-recomp\out\patch-backup` ab.

## Noch nicht fertig

- **Offline auf dem iPad:** in Chrome geprüft; ob Safari die Datei-Anfragen des Spiels über den Service Worker
  leitet, zeigt der Selbsttest im Datenmanager (sonst meldet er es und lädt nichts).
- **iPad-Variante auf echtem Gerät:** `game-ipad.html` (24 statt 64 vorab gestartete Threads, 2560 statt 3072 MiB
  fester Speicher, kleiner Block-Cache) läuft in Chrome am PC; auf dem iPad selbst ist sie noch nicht geprüft.
  Die App wählt sie auf Tablets automatisch („Spielen“ → Version: Automatisch / PC / iPad). Werte ändern:
  `$env:FNV_IPAD_POOL`, `$env:FNV_IPAD_MEMORY` vor `build.ps1` (2048 MiB reichen nicht: „OOM“ beim Laden).

---

## PC mit Claude verbinden (empfohlen für Schritt 2, 3, 5)

Dann führt Claude die Befehle auf deinem PC selbst aus und behebt Fehler direkt:
1. **Claude Desktop-App** auf dem PC installieren und anmelden.
2. Einstellungen → Claude Code → **Remote Control** → Ordner `C:\FNV-Web` freigeben.
3. Hier im Chat Bescheid geben.

## Bekannte Risiken

| Risiko | Was wir dann tun |
|---|---|
| iPad-Safari: zu wenig Speicher oder WebGPU-Unterschiede | Schritt 0 klärt das; ggf. Engine-Anpassungen (z. B. weniger Threads, kleinere Archive) |
| Passwortabfrage im Home-Bildschirm-Modus stört | Alternative: Login-Seite mit Cookie statt Browser-Passwortdialog |
| Webspace drosselt viele 1-MB-Anfragen | Blockgröße/Caching anpassen; erste Session lädt ~1 GB, danach Cache |
| Build-Werkzeuge auf deinem PC weichen ab | gemeinsam per Remote Control lösen |
