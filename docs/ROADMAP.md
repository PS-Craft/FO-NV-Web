# Roadmap (Weg A)

Größen: S ≈ Tage, M ≈ 1–3 Wochen, L ≈ 1–2 Monate, XL ≈ 3–6 Monate, XXL ≈ > 6 Monate
(bei einer Person in Teilzeit). Jeder Meilenstein endet mit einer **auf dem iPad prüfbaren** Demo.

---

## M0 – Fundament (S)

- [x] Vite + TypeScript (strict)
- [ ] ESLint/Prettier
- [x] PWA: Manifest, eigene Icons, Service Worker, Offline-Start
- [x] COOP/COEP über eigenen Service Worker (SharedArrayBuffer auf GitHub Pages)
- [x] GitHub Actions: Spieldaten-Sperre, Unit-Tests (Vitest), Build, Deploy auf Pages (bei `main`)
- [ ] E2E-Tests mit Playwright **WebKit** in CI
- [x] `.gitignore` + CI-Prüfung, die Spieldateien (`*.esm`, `*.bsa`, `*.nif`, `*.dds` …) blockieren
- [x] Debug-HUD: FPS, Heap (Draw Calls folgen mit dem Renderer)
- [x] **iPad-Systemcheck** in der App (Basis für M1: WebGPU/WebGL2, Texturformate, Speicher, OPFS, Audio, PWA, Eingabe)

**Abnahme:** Leere App ist unter `https://<user>.github.io/<repo>/` erreichbar, lässt sich auf
dem iPad zum Home-Bildschirm hinzufügen und startet offline im Vollbild.

## M1 – Machbarkeits-Spikes auf dem iPad (S–M)

| Spike | Frage | Ergebnis-Dokument |
|---|---|---|
| S1 Import | Wie kommen 8–10 GB zuverlässig in OPFS? Mehrfachauswahl, ZIP, Ordner? Dauer? | `docs/spikes/S1-import.md` |
| S2 Speicher | Ab welchem Verbrauch beendet Safari den Tab (Gerät notieren)? | `S2-speicher.md` |
| S3 Grafik | WebGPU vs. WebGL2: Unterstützte Texturformate (BC/ASTC/ETC2), Draw-Call-Budget | `S3-grafik.md` |
| S4 Audio | OGG/MP3/WAV-Dekodierung in WebAudio, Latenz | `S4-audio.md` |
| S5 Persistenz | Überleben OPFS-Daten als PWA Wochen/Neustarts? `storage.persist()`? | `S5-persistenz.md` |
| S7 OpenMW-WASM | Lohnt es sich, OpenMW (ESM4-Code) nach WASM zu bauen statt neu zu schreiben? | `S7-openmw.md` |

**Abnahme:** Alle Spikes dokumentiert; Plan und Budgets in [IPAD.md](IPAD.md) aktualisiert;
**Go/No-Go-Entscheidung** für M2+.

## M2 – Daten-Leser (M)

- [ ] BSA-Reader (Inhaltsverzeichnis, Hash-Lookup, zlib, Range-basiert)
- [ ] ESM-Reader (Gruppen, Records, Subrecords, Kompression, Master-Auflösung, Override-Reihenfolge)
- [ ] Typisierte Record-Definitionen für die ersten Typen: `CELL`, `WRLD`, `LAND`, `REFR`, `STAT`, `LIGH`, `DOOR`, `TXST`, `LTEX`
- [ ] NIF-Parser, generiert aus `nif.xml`, für Version 20.2.0.7 / FNV
- [ ] DDS-Decoder (DXT1/3/5 → GPU oder RGBA)
- [ ] In-App-Datei-Browser: BSA-Inhalt, ESM-Record-Ansicht

## M3 – Asset-Viewer (M)

- [ ] NIF → Three.js-Szenengraph (Geometrie, Materialien, Alpha, Normal-Maps)
- [ ] Orbit-Kamera per Touch (Pinch/Drag)
- [ ] Shader-Grundlage, die dem Original-Look nahekommt (Spekular, Glow, Env-Map)

**Abnahme:** Beliebige Meshes aus den eigenen Daten auf dem iPad flüssig drehbar.

## M4 – Innenzellen (L)

- [ ] Zelle laden: Referenzen platzieren (Position/Rotation/Skalierung)
- [ ] Lichter (`LIGH`), Ambient/Fog aus Zelldaten
- [ ] Kollision aus `bhk*`-Blöcken → Jolt
- [ ] Freiflug- und Laufkamera
- [ ] Zellwahl per Liste (Debug)

## M5 – Außenwelt (XL)

- [ ] Terrain aus `LAND` (Höhen, Normalen, Vertex-Farben, Textur-Blending)
- [ ] Zell-Streaming um die Kamera, Worker-basiert, Speicherbudget
- [ ] Distant-LOD für Terrain & Objekte
- [ ] Himmel, Wetter (`WTHR`), Tageszeit, Wasser
- [ ] Türen zwischen Außen- und Innenzellen

**Abnahme „Mojave-Explorer":** Man kann auf dem iPad zu Fuß durch die Außenwelt laufen und
Gebäude betreten, ≥ 30 FPS auf Primärgeräten.

## M6 – Spielerfigur & Steuerung (M)

- [ ] Character-Controller (Laufen, Springen, Schleichen, Treppen, Hänge)
- [ ] Touch-Overlay (konfigurierbar), Gamepad, Maus/Tastatur
- [ ] Ego- und Third-Person-Kamera

## M7 – Interaktion & Audio (L)

- [ ] Aktivieren: Türen, Container, Items aufheben, Terminals (nur Anzeige)
- [ ] Inventar-Grundmodell
- [ ] Musik-System (`MUSC`), Ambient-Sounds, 3D-Audio

## M8 – NPCs & Animation (XL)

- [ ] Skelett-Rigs, Skinning, `.kf`-Animationen, Blending
- [ ] Ausrüstung am Körper (Biped-Slots)
- [ ] FaceGen-Gesichter
- [ ] KI-Pakete (`PACK`) Grundstufe: Tagesablauf, Wandern, Navmesh-Pfade

## M9 – Dialog & Skript-VM (XXL)

- [ ] Dialogsystem (`DIAL`/`INFO`), Bedingungsfunktionen, Sprachausgabe + Lippensync
- [ ] Interpreter für kompilierten Skript-Bytecode; Befehle schrittweise implementieren,
      Abdeckung messen (Liste „verwendete Befehle in den Daten" automatisch erzeugen)
- [ ] Quest-System (Stages, Ziele), globale Variablen, Fraktionen/Ruf

## M10 – Kampf & Werte (XXL)

- [ ] S.P.E.C.I.A.L., Skills, Perks (Entry-Points), Level-Up
- [ ] Waffen (Hitscan/Projektil), Schaden, Trefferzonen, Munition, Zustand
- [ ] V.A.T.S. (Zeitlupe, Trefferchancen, Touch-optimierte Zielwahl)
- [ ] Kampf-KI

## M11 – Pip-Boy & Menüs (L)

- [ ] Pip-Boy (eigene Umsetzung, Touch-first): Status, Inventar, Daten/Karte, Radio
- [ ] Hauptmenü, Einstellungen, **Speichern/Laden** (eigenes Format in OPFS, Export als Datei)

## M12 – Politur & Erweiterungen (offen)

- [ ] DLC-Worldspaces, Hardcore-Modus
- [ ] Laden von `.esp`-Mods in Ladereihenfolge
- [ ] Performance-Profile je iPad-Klasse
