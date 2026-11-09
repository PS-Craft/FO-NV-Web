# Anleitung: New Vegas privat im Browser (iPad, unterwegs, mit Passwort)

**Stand:** 2026-11-09 · Server-Teil getestet (Apache + PHP, wie bei all-inkl) · PC-Build-Skripte noch
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

## Schritt 4 – Spieldateien hochladen (einmalig, dauert je nach Leitung Stunden)

Mit **WinSCP** oder **FileZilla** (SFTP, falls dein Tarif es hat, sonst FTPS):
- aus `…\steamapps\common\Fallout New Vegas\` die Datei `FalloutNV.exe` und den kompletten Ordner `Data`
- nach `fnv-game/` auf dem Weblaufwerk.

## Schritt 5 – Bauen und hochladen

```powershell
.\build.ps1
```

Dann hochladen:
- Inhalt von `C:\FNV-Web\upload\www\` → `fnv-www/` (inkl. der versteckten Datei `.htaccess`!)
- `C:\FNV-Web\upload\fnv-mobile\` → `fnv-mobile/`

Auf dem Server `fs-config.example.php` zu **`fs-config.php`** umbenennen und die Pfade eintragen
(absolute Pfade, bei all-inkl beginnend mit `/www/htdocs/wXXXXXXX/`). `'dlc' => true`, wenn die DLCs
dabei sein sollen.

## Schritt 6 – Spielen

1. iPad → Safari → `https://fnv.deine-domain.de` → Benutzername/Passwort.
2. Teilen → **Zum Home-Bildschirm**. Von dort starten (Vollbild).
3. Qualität **Low** (fürs iPad automatisch vorgewählt), dann Start.
4. **Touch-Steuerung** erscheint automatisch: Joystick links = Laufen, auf dem Rest wischen = Umsehen,
   kurzes Tippen = Klick, Knöpfe für Feuern, Zielen, Benutzen, Springen, Nachladen, Ducken, Pip-Boy, VATS,
   Menü. Ein Bluetooth-Controller oder eine Tastatur gehen auch.
5. Unterwegs: einfach dieselbe Adresse – Mobilfunk genügt, beim ersten Start werden aber mehrere
   hundert MB geladen (danach aus dem Browser-Cache).

**Spielstände** liegen in `fnv-data/` auf dem Weblaufwerk – also auf allen Geräten dieselben.
Gelegentlich per FTP sichern. Zusätzlich: Knopf „Save game“ speichert eine Kopie aufs Gerät.

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
