# Prompt für eine lokale Claude-Code-Sitzung auf dem Windows-PC

In der Claude Desktop-App eine **neue Code-Sitzung lokal** („Auf diesem Computer“) im Ordner `C:\FNV-Web` starten
und den Text zwischen den Linien einfügen.

---

Du arbeitest **lokal auf meinem Windows-Rechner** im Ordner `C:\FNV-Web`. Ich besitze Fallout: New Vegas bei Steam.

## Ziel
Mein eigenes New Vegas soll als **private, passwortgeschützte Browser-Version** auf meinem Weblaufwerk (PHP-Webspace, all-inkl-artig) laufen und auf meinem **iPad (A16, iPadOS 26.5.2, Safari)** gut spielbar sein. Grundlage ist das Open-Source-Projekt **SgtMetz/fnv-web-recomp** (MIT): Es übersetzt die eigene `FalloutNV.exe` statisch nach WebAssembly + WebGPU. Mein Repo **PS-Craft/FO-NV-Web** liefert dazu die App (Spielstände, Backups, DLC-Schalter, Cheats, Admin-Center), den PHP-Ersatz für dessen Node-Server und die Build-/Upload-Skripte. Server-Teil und App sind bereits getestet. Was fehlt, ist der echte Build auf diesem PC, das Hochladen und die Anpassung fürs iPad.

## Harte Regeln
- **Niemals** Spieldateien (`.esm`, `.bsa`, …), die gebaute `.wasm`, übersetzte Shader, `out/`, `upload/` oder Zugangsdaten (`pc\deploy.local.json`, `pc\deploy.password.xml`) nach GitHub committen. Die `.gitignore` und `npm run check:no-gamedata` helfen. Vor jedem Commit ausführen.
- Die Steam-Installation **nie verändern**, nur lesen.
- Im Repo FO-NV-Web auf dem Branch `claude/lokaler-build` arbeiten (vom aktuellen `main` abzweigen), committen und pushen. Nicht direkt auf `main` pushen.
- Erst fragen, bevor du etwas installierst, das nicht in `pc\setup.ps1` steht, oder bevor du etwas auf dem Server löschst.
- Antworte mir auf **Deutsch**, kurz und konkret. Melde ehrlich, was nicht geklappt hat.

## Schritte

1. **Repo holen und lesen.** `git clone https://github.com/PS-Craft/FO-NV-Web C:\FNV-Web\FO-NV-Web`. Lies `README.md`, `docs/ANLEITUNG.md`, `docs/spikes/S2-ipad-belastung.md`, `pc\setup.ps1`, `pc\build.ps1`, `pc\deploy.ps1`, `tools\assemble.mjs`.

2. **Werkzeuge einrichten.** `pc\setup.ps1` in PowerShell **als Administrator** ausführen (`Set-ExecutionPolicy -Scope Process Bypass; .\setup.ps1`). Das Skript ist noch auf keinem echten PC gelaufen. Fehler bitte direkt im Skript beheben und committen. Am Ende muss jede Zeile der Prüfliste auf **OK** stehen. Schwierige Punkte:
   - **fnv_decomp**: `tools/exe_check.py` muss meine Steam-`FalloutNV.exe` erkennen (mindestens 12 Prüfpunkte passen). Falls nicht: Version und Ausgabe melden, nicht raten.
   - **vkd3d**: `tools/build_vkd3d.py --reset` im Ordner `C:\FNV-Web\fnv-web-recomp`. Es erwartet `local/dl/vkd3d/vkd3d-1.19.tar.xz` und SPIRV-Header unter `local/dl/vkd3d/spirvh`. Lies das Skript und `docs/SHADERS.md`, besorge die Quellen von den offiziellen Projektseiten (winehq.org, KhronosGroup/SPIRV-Headers) und baue mit zig aus der venv.
   - **tint** aus Googles Dawn: Das Skript erwartet `local/dl/dawn/*/bin/tint.exe`. Prüfe zuerst, ob es offizielle vorgebaute Dawn/Tint-Binaries für Windows gibt. Sonst Tint aus dem Dawn-Quellcode bauen (nur das Ziel `tint`). Vorher fragen, falls dafür große Downloads oder Visual Studio nötig sind.
   - **d3d9_caps_dump**: braucht `d3d9.lib` aus dem Windows SDK.

3. **Zugangsdaten fürs Hochladen.** Frag mich nach den Werten für `pc\deploy.local.json`: Protokoll (sftp/ftps), Server, Port, Benutzer, `remoteBase` (absoluter Pfad des Webspace, z. B. `/www/htdocs/w0123456`) und `webFolder` (Ordner meiner Subdomain). Die Vorlage ist `pc\deploy.example.json`. Das Passwort gebe ich selbst ein, wenn `deploy.ps1` danach fragt.

4. **Erster Build, Standard-Variante.** `pc\build.ps1`. Danach `pc\deploy.ps1 -GameFiles`. Der erste Upload ist ~10 GB und dauert. Melde mir die Zeit und ob der Upload komplett war.

5. **Funktionsprobe am PC.** Öffne die Seite in Chrome oder Edge am PC (`https://<meine-subdomain>/`) und melde dich als `admin` an (Startpasswort habe ich, die App verlangt danach ein neues). Prüfe:
   - Die App lädt.
   - **Spiel starten** → die Spielseite lädt und erreicht das Hauptmenü bzw. „Start outside Doc Mitchell's house“.
   - Spielen, speichern, und der Spielstand erscheint in der App unter **Spielstände**.
   Bei Fehlern: Browser-Konsole, `?debug` an der Spielseite und die PHP-/Apache-Fehler auswerten, Ursache beheben, neu deployen.

6. **iPad-Variante.** Das iPad stürzt bei der öffentlichen Version beim Start ab (Details in `docs/spikes/S2-ipad-belastung.md`: Speicherdruck, wenn große Funktionen auf vielen Threads heiß laufen). Baue eine Variante mit weniger Verbrauch:
   - `tools/recomp_build_web.py` im fnv-web-recomp-Ordner: `PTHREAD_POOL_SIZE` (64), `INITIAL_MEMORY`/`MAXIMUM_MEMORY` (3 GB) per Umgebungsvariable einstellbar machen.
   - Block-Cache in `port/recomp/pal_fs_web.cpp` (`kCacheMax` 256 MB / `kCacheLow`) für die mobile Variante verkleinern.
   - Vorher prüfen, wie viele Threads das Spiel wirklich anlegt (`k_CreateThread` in `port/recomp/pal_kernel.cpp` mitzählen). Der Pool darf nicht zu klein sein.
   - Ziel: eine zweite Spielseite (z. B. `game-ipad.html` mit eigenem `build-ipad/`) oder ein Schalter, den die App auf iPad/Tablet automatisch wählt. Die App ist in `src/main.ts` („Spiel starten“) und `tools/assemble.mjs`.
   - Änderungen am fnv-web-recomp-Code als Patch-Dateien in **meinem** Repo ablegen (z. B. `pc/patches/*.patch`) und von `build.ps1` anwenden lassen. Nicht in fremde Repos pushen.
   - Danach bauen, hochladen und mir sagen, was ich auf dem iPad testen soll.

7. **Bericht.** Fasse am Ende zusammen: was läuft, was nicht, welche Commits/PRs es gibt und was ich als Nächstes tun muss.

---
