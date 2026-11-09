# Dateiformate & Quellen

Alle Formate werden **ausschließlich anhand öffentlicher Dokumentation** implementiert
(siehe [RECHT.md](RECHT.md)). 🔬 = Details werden beim Implementieren gegen echte Dateien geprüft.

## Übersicht

| Format | Inhalt | Notizen |
|---|---|---|
| `.esm` / `.esp` | Spielwelt-Datenbank: Records (Items, NPCs, Zellen, Dialoge, Skripte, Quests …) | Gleiche Grundstruktur wie Oblivion/Fallout 3 („TES4-Format"): Header `TES4`, Gruppen (`GRUP`), Records mit Subrecords. Record-Daten optional zlib-komprimiert. Masters-Reihenfolge & Overrides beachten (DLCs, Patches, Mods). |
| `.bsa` (v104) | Archiv mit Meshes, Texturen, Sounds, Menüs | Ordner-/Dateihashes, optional zlib-komprimiert, eingebettete Namen. Lesen per Offset → ideal für HTTP-Range-Requests. |
| `.nif` | 3D-Modelle, Szenengraph, Materialien, Kollision (Havok `bhk*`-Blöcke), teils Animation | Gamebryo-NIF, Fallout-3/NV-Variante. Struktur vollständig in NifTools `nif.xml` beschrieben → Parser daraus **generieren**. |
| `.kf` | Animationen (Keyframes) | Ebenfalls NIF-Container (`NiControllerSequence`). |
| `.dds` | Texturen | DXT1/DXT3/DXT5, teils unkomprimiert; Normal-Maps (`_n`), Glow (`_g`), Env-Maps. |
| `.wav` / `.ogg` / `.mp3` | Effekte / Stimmen / Musik | Siehe Audio-Hinweise in [IPAD.md](IPAD.md). |
| `.lip` | Lippensynchronisation | Später (M8/M9). |
| `.egm/.egt/.tri` | FaceGen-Gesichtsdaten | Später (M8). |
| `.xml` (menus) / `.fnt` | Original-UI-Layouts, Schriftarten | Optional; eigene UI zunächst einfacher. |
| `.fos` | Spielstände | Import alter Spielstände ist **kein** Ziel; eigenes Speicherformat. |

## Spielwelt-Grundlagen (für Streaming)

- Außenwelt in **Zellen**; Terrain je Zelle als Höhenraster (`LAND`-Record, 33×33 Punkte) plus
  Textur-Layer.
- Distant-LOD (Objekte/Terrain) liegt als eigene Meshes/Texturen vor → für Sichtweite auf dem
  iPad nutzbar.
- Interieurs sind eigenständige Zellen, Wechsel über Teleport-Türen.
- Navigationsnetze (`NAVM`) für NPC-Wegfindung.

## Öffentliche Quellen

| Quelle | Wofür |
|---|---|
| **UESP Wiki** – Mod-File-Format-Seiten (Oblivion/FO3/FNV) | ESM-Record- und Subrecord-Struktur, BSA-Format |
| **NifTools** – `nif.xml` (GitHub `niftools/nifxml`) | Vollständige NIF-Blockdefinitionen inkl. Versionen |
| **xEdit / FNVEdit** (GitHub `TES5Edit/TES5Edit`) | Referenz für Record-Definitionen (MPL-Lizenz beachten) |
| **GECK-Wiki** | Skriptbefehle, Bedingungsfunktionen, Spielmechanik-Semantik |
| **OpenMW** (GitHub `OpenMW/openmw`) | Engine-Architektur als Vorbild; hat experimentellen ESM4-Code (FO3/FNV-Leser) – GPL-3, daher nur als Referenz bzw. Lizenz des eigenen Projekts darauf abstimmen |
| **NifSkope** | Werkzeug zum Prüfen eigener Parser-Ergebnisse |

## Test-Strategie für Parser

- CI: **synthetische** Testdateien, die unsere eigenen Writer erzeugen (Roundtrip-Tests).
- Lokal: optionaler „Real-Data"-Testlauf gegen die eigene Installation
  (`FNV_DATA_DIR=/pfad/zu/Data npm run test:realdata`), niemals in CI, niemals committen.
