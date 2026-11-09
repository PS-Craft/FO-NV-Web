# Gesamtplan: FO-NV-Web

> Status: **v0.3** – Neuer Hauptweg: privates Self-Hosting von *fnv-web-recomp* auf dem eigenen
> Weblaufwerk. **Umsetzung: [ANLEITUNG.md](ANLEITUNG.md).** Offene Punkte: [FRAGEN.md](FRAGEN.md)

## ⭐ Aktueller Hauptweg (ab v0.3)

Es gibt inzwischen das Open-Source-Projekt **SgtMetz/fnv-web-recomp** (MIT): Es übersetzt die
`FalloutNV.exe` des Spielers statisch nach WebAssembly + WebGPU und spielt mit dessen eigenen
Spieldateien – das volle Originalspiel, keine Nachprogrammierung. Darauf bauen wir auf:

- Der Projektinhaber besitzt New Vegas (Steam). Der **Build-PC** baut daraus die Browser-Version.
- Gehostet wird **privat, passwortgeschützt** auf dem eigenen **Weblaufwerk** (PHP-Webspace, all-inkl-artig).
  Weil dort kein Node läuft, ersetzt `hosting/fs.php` den Original-Server (getestet).
- **GitHub** enthält Skripte, Server-Code, Tests, Doku und CI – nie Spiel- oder Build-Dateien.
- iPad: Touch-Steuerung und verkleinerte Archive bringt das Projekt mit; ob Safari die Engine
  vollständig trägt, prüft [ANLEITUNG.md](ANLEITUNG.md), Schritt 0.

Der unten beschriebene **Weg A** (eigene Engine) ist damit nur noch Rückfallebene.

## Festgelegte Entscheidungen

| Datum | Entscheidung |
|---|---|
| 2026-11-09 | Projektinhaber besitzt **New Vegas (Steam)**. Hauptweg: privates Self-Hosting von fnv-web-recomp. |
| 2026-11-09 | Hosting auf dem **eigenen Weblaufwerk** (PHP), passwortgeschützt, auch unterwegs. Entwicklung, Doku und CI auf **GitHub**. Spieldaten und Build nie auf GitHub. |
| 2026-11-09 | **Touch-Steuerung** ist Pflicht (iPad ohne Tastatur). |
| 2026-11-09 | **Claude ist Hauptentwickler** und verantwortet Architektur, Code, Tests, Doku und Deploy. Der Projektinhaber testet auf dem iPad und trifft Produktentscheidungen. |
| 2026-11-09 | ~~Vorläufig Weg A (eigene Web-Engine)~~ → ersetzt durch den Hauptweg oben. |

## 1. Ziel

Fallout: New Vegas soll im Browser spielbar sein – vollständig über **GitHub** entwickelt und über
**GitHub Pages** ausgeliefert, und zwar **auf dem iPad** (Safari bzw. als installierte Web-App).

## 2. Die harte Wahrheit zuerst

Es gibt keinen „Port", den man einfach kompilieren könnte:

| Fakt | Konsequenz |
|---|---|
| Die Original-Engine (Gamebryo, `FalloutNV.exe`) ist **closed source**, 32-Bit-x86, DirectX 9. | Man kann sie nicht nach WebAssembly übersetzen. Emulation (x86 + Windows + DX9 im Browser) ist auf einem iPad aussichtslos (Leistung, Speicher). |
| Die Spieldaten (~8–10 GB inkl. DLCs) sind **urheberrechtlich geschützt** (Bethesda/Microsoft). | Sie dürfen **nicht** auf GitHub oder einen öffentlichen Server. Jeder Spieler muss **seine eigene, legal gekaufte Kopie** mitbringen. |
| iPad-Safari hat harte Speichergrenzen pro Tab (grob 1,5–4 GB je nach Modell). | Alles muss gestreamt, komprimiert und herunterskaliert werden. |

Daraus folgen drei realistische Wege:

### Weg A – Eigene Web-Engine, die die Originaldaten liest („OpenMW-Prinzip") ⭐ empfohlen, wenn es wirklich *im Browser* laufen soll

Wir schreiben eine **neue Engine** in TypeScript/WebAssembly, die die Dateiformate von New Vegas
versteht (`.esm/.esp`, `.bsa`, `.nif`, `.dds`, `.kf`, Audio). Die Engine (unser Code) liegt auf
GitHub Pages; die Spieldaten importiert jeder Nutzer **lokal** aus seiner eigenen Kopie
(Steam/GOG) in den Browser-Speicher seines iPads – oder lädt sie von seinem **privaten**
Weblaufwerk.

- ✅ Läuft wirklich nur im Browser, auf GitHub Pages hostbar, rechtlich sauber gestaltbar.
- ❌ Riesiger Aufwand. Vorbild OpenMW (Morrowind) brauchte ~15 Jahre bis zur vollen Spielbarkeit.
  Realistisch: Ein **Welt-Explorer** (durch das Mojave-Ödland laufen) ist in Monaten machbar,
  **vollständiges Gameplay** (Quests, Dialoge, Kampf, V.A.T.S., Skripte) ist ein Mehrjahresprojekt.

### Weg B – Streaming (pragmatisch, sofort spielbar)

Das Originalspiel läuft auf einem PC (zu Hause oder Cloud-VM), das iPad empfängt den Stream:
**Sunshine + Moonlight** (Open Source) oder **Steam Link**. Eine kleine Web-Oberfläche auf GitHub
Pages kann Start/Verbindung/Touch-Steuerung bündeln.

- ✅ 100 % des Spiels inkl. Mods, in Tagen eingerichtet.
- ❌ Braucht einen laufenden Windows-Rechner; „voll auf GitHub" ist es nicht.

### Weg C – Eigenes Spiel „im Geist von" New Vegas

Ein eigenständiges, originales Retro-Futurismus-Western-RPG mit eigenen Assets, eigener Welt,
eigenen Figuren – keine Nachbildung von New Vegas.

- ✅ Rechtlich unproblematisch, frei veröffentlichbar, iPad-optimiert von Anfang an.
- ❌ Es ist nicht New Vegas.

**Empfehlung:** Weg A als Hauptprojekt, mit klar definierten Meilensteinen, die einzeln schon
nützlich sind. Weg B parallel als „Jetzt-spielen"-Lösung (1 Wochenende Aufwand).
Der Rest dieses Dokuments beschreibt **Weg A**.

---

## 3. Architektur (Weg A)

```
┌──────────────────────────── iPad / Browser ─────────────────────────────┐
│                                                                          │
│  PWA-Shell (index.html, Service Worker, Manifest, Touch-UI)              │
│     │                                                                    │
│     ├─ Import-Assistent ── Dateiauswahl (Files-App) ──► OPFS-Speicher     │
│     │                                                                    │
│     ├─ Asset-Pipeline (Web Worker)                                       │
│     │     BSA-Reader → NIF-Parser → Mesh/Material                        │
│     │     DDS-Decoder → GPU-Format (BC / ASTC / ETC2 / RGBA)             │
│     │     ESM-Indexer → Record-Datenbank (IndexedDB/OPFS-Cache)          │
│     │                                                                    │
│     ├─ Weltsystem: Worldspace/Cell-Streaming, Terrain (LAND), LOD        │
│     ├─ Renderer: Three.js (WebGPU, Fallback WebGL2)                      │
│     ├─ Physik: Jolt (WASM) – Kollisionen aus bhk*-Blöcken der NIFs        │
│     ├─ Audio: WebAudio (WAV/MP3, OGG via WASM-Decoder falls nötig)       │
│     ├─ Gameplay: Skript-VM, Dialog, Quests, Inventar, SPECIAL, Kampf, KI │
│     └─ UI: Pip-Boy/HUD in HTML/CSS oder Canvas, Touch + Gamepad          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
          ▲ statische Dateien (nur unser Code, keine Spieldaten)
   GitHub Pages (Deploy per GitHub Actions)
```

### 3.1 Technologie-Stack (Vorschlag)

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | **TypeScript** (strict) | Ein Ökosystem, gute Werkzeuge, iPad-Safari-kompatibel. Heiße Pfade später optional in Rust→WASM. |
| Build | **Vite** | Schnell, statischer Output für Pages. |
| Rendering | **Three.js** (WebGPURenderer + WebGL2-Fallback) | Reif, große Community, WebGPU ist ab iPadOS 26 in Safari verfügbar. |
| Physik | **Jolt Physics (jolt-physics.js, WASM)** | Schnell, Character-Controller, MIT-Lizenz. |
| Dekompression | **fflate** (zlib) | BSA- und ESM-Records sind zlib-komprimiert. |
| Speicher | **OPFS** (Origin Private File System) + IndexedDB | Große Binärdateien lokal auf dem iPad. |
| Offline | Service Worker + Web App Manifest | „Zum Home-Bildschirm" → Vollbild, Schutz vor Safari-Datenlöschung. |
| Tests | Vitest + Playwright (WebKit-Engine!) | WebKit-Tests kommen Safari am nächsten. |
| CI/CD | GitHub Actions → GitHub Pages | Deploy bei jedem Push auf `main`. |

### 3.2 Datenimport – der kritische Punkt auf dem iPad

1. Nutzer kopiert den `Data`-Ordner seiner PC-Installation auf das iPad (iCloud Drive,
   USB-Stick, AirDrop, Nextcloud-App …).
2. In der Web-App: „Spieldaten importieren" → Dateiauswahl der Files-App
   (`<input type="file" multiple>`; Ordnerauswahl wird in Spike S1 geprüft).
3. Dateien werden **streamend** in OPFS kopiert (keine 1-GB-Blobs im RAM).
4. Prüfung: Dateinamen, Größen, Hashes bekannter Versionen → klare Fehlermeldung bei
   fehlenden Dateien.
5. Einmalige **Vorverarbeitung** im Worker: ESM-Index, BSA-Inhaltsverzeichnisse,
   optional Texturen in iPad-freundliches Format umwandeln und verkleinern.

Spieldaten liegen damit **nur auf dem iPad** des Spielers – nie auf GitHub. (Ein optionaler
Weblaufwerk-Modus per HTTP-Range-Request bleibt technisch möglich, ist aber laut Entscheidung
nicht vorgesehen.)

### 3.3 Hosting

- **GitHub Pages:** nur Engine-Code (wenige MB). Limits (1 GB Site, 100 MB/Datei) sind kein
  Problem, weil keine Spieldaten gehostet werden. Für `SharedArrayBuffer` (Multithreading in WASM)
  braucht es COOP/COEP-Header, die Pages nicht setzen kann → unser Service Worker
  (`public/sw.js`) setzt sie selbst (Prinzip `coi-serviceworker`).
- **GitHub Actions:** Jeder Push wird geprüft (Spieldaten-Sperre, Tests, Build); Push auf `main`
  deployt automatisch.

### 3.4 Arbeitsweise auf GitHub

- `main` = immer lauffähig und live auf Pages.
- Entwicklung auf Feature-Branches → Pull Request → CI grün → Merge.
- Jeder Meilenstein wird als GitHub-Milestone + Issues geführt (sobald freigegeben).
- Spike-Ergebnisse und Entscheidungen werden in `docs/` festgehalten.

---

## 4. Arbeitspakete & Meilensteine

Details mit Abnahmekriterien in [ROADMAP.md](ROADMAP.md). Grobübersicht:

| # | Meilenstein | Ergebnis | Grobe Größe |
|---|---|---|---|
| M0 | Fundament | Repo, Vite/TS, PWA, CI, Pages-Deploy, WebKit-Tests | S |
| M1 | Spikes (Machbarkeit iPad) | Import, OPFS, Speicher, WebGPU, Audio, Texturformate gemessen | S–M |
| M2 | Daten-Leser | BSA-, ESM-, NIF-, DDS-Parser + Datei-Browser im Browser | M |
| M3 | Asset-Viewer | Beliebiges Mesh mit Texturen auf dem iPad drehen/ansehen | M |
| M4 | Innenzellen | Ein Interieur (z. B. Startgebäude) begehbar, Licht, Kollision | L |
| M5 | Außenwelt | Mojave-Worldspace mit Terrain, LOD, Streaming, Himmel, Tageszeit | XL |
| M6 | Spielerfigur & Steuerung | Ego/3rd-Person, Touch-Sticks, Gamepad, Maus/Tastatur | M |
| M7 | Interaktion & Audio | Türen, Container, Items aufheben, Musik, Ambient, Stimmen | L |
| M8 | NPCs & Animation | Skelette, KF-Animationen, Gesichter (FaceGen), einfache KI | XL |
| M9 | Dialog & Skript-VM | Dialogbaum, Bedingungen, Skript-Bytecode, Quests | XXL |
| M10 | Kampf, V.A.T.S., Werte | Waffen, Schaden, SPECIAL/Skills/Perks, V.A.T.S. | XXL |
| M11 | Pip-Boy & Menüs | Inventar, Karte, Quests, Level-Up, Speichern/Laden | L |
| M12 | Politur & DLCs | Performance, DLC-Worldspaces, Mod-Unterstützung (ESP) | offen |

**Meilenstein-Philosophie:** M0–M5 ergeben einen „Mojave-Explorer" – schon für sich ein
vorzeigbares Ergebnis. Erst ab M8 wird es „ein Spiel".

---

## 5. Hauptrisiken

| Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
|---|---|---|
| iPad-Speicherlimit lässt Tab abstürzen | hoch | Speicherbudget pro System, Textur-Downscaling, aggressives Entladen, früh in M1 messen |
| Gameplay-Umfang (Skripte, KI, Kampf) unterschätzt | sehr hoch | Klare Meilensteine, M0–M5 als eigenständiges Ziel |
| DMCA/Abmahnung | mittel | Keine Assets, kein dekompilierter Code, neutraler Projektname, siehe [RECHT.md](RECHT.md) |
| Safari-Eigenheiten (Audio-Formate, Fullscreen, Pointer Lock, Speicherlöschung) | hoch | WebKit-Tests in CI, PWA-Installation, Spikes in M1 |
| Texturformate (DXT) auf älteren iPads nicht unterstützt | mittel | Laufzeit-Erkennung, Umwandlung beim Import |
| Motivation/Zeit bei Einzelentwickler | hoch | Kleine, sichtbare Zwischenergebnisse |

---

## 6. Weitere Dokumente

- [RECHT.md](RECHT.md) – rechtliche Leitplanken
- [IPAD.md](IPAD.md) – iPad-/Safari-spezifische Anforderungen
- [FORMATE.md](FORMATE.md) – Dateiformate & öffentliche Quellen
- [ROADMAP.md](ROADMAP.md) – Meilensteine mit Aufgaben und Abnahmekriterien
- [WEG-B-STREAMING.md](WEG-B-STREAMING.md) – Sofortlösung per Streaming
- [FRAGEN.md](FRAGEN.md) – offene Entscheidungen
