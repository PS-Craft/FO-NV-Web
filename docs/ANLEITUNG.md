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
| **Spieldaten** | **DLCs einzeln an/aus** (pro Spieler), Speicherbelegung auf dem Gerät |
| **Cheats** | Freischalten mit Cheat-Passwort; im Spiel dann über **☰** |
| **Admin** | Spieler-Zugänge (anlegen, Passwort zurücksetzen, Admin-Rechte, löschen), Cheat-Passwörter |
| **Diagnose** | Systemcheck und Belastungstest |

**Im Spiel:** standardmäßig **randlos** (Bild füllt den Bildschirm, keine Leisten). Winziger **☰**-Knopf oben in
der Mitte: Zur App · Vollbild · Randlos/Mit Leiste · Cheats (Gott-Modus, Durch Wände, Heilen, Kronkorken,
Erfahrung, Tragkraft, Kartenorte, Unentdeckt, KI anhalten, eigener Konsolenbefehl). Touch-Steuerung des Spiels
bleibt unverändert.

Jeder Spieler hat **eigene Spielstände, Backups und DLC-Einstellungen**.

**Getestet** (ohne echtes Spiel, mit Ersatz-Spielseite): Apache + PHP mit Passwortschutz, 24 Unit-Tests
(`npm test`) und ein Klick-Test durch die ganze App mit 13 Prüfungen (`tools/e2e-app.cjs`).

## Noch nicht fertig

- **Lokale Kopie der Spieldaten** auf dem iPad mit eigener Verwaltung: folgt nach dem ersten erfolgreichen
  Spielstart (braucht einen Test, ob Safari die Datei-Anfragen des Spiels über einen Service Worker umleiten lässt).
  Bis dahin hält der Browser-Cache geladene Daten.
- **iPad-Variante des Builds** (weniger Threads/Speicher), siehe `docs/spikes/S2-ipad-belastung.md`.

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
