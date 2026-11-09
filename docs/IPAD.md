# iPad-Anforderungen

Das iPad ist die **Zielplattform Nr. 1**. Alles wird zuerst dort getestet.
Punkte mit 🔬 werden im Spike-Meilenstein M1 auf echter Hardware verifiziert, bevor wir darauf bauen.

## Zielgeräte

| Klasse | Beispiele | Ziel |
|---|---|---|
| Primär | iPad Pro / Air mit M1 oder neuer (8 GB+ RAM) | volle Darstellung, 30–60 FPS |
| Sekundär | iPad (A14+), iPad mini (A15+) | reduzierte Texturen/Sichtweite, 30 FPS |
| Nicht unterstützt | Geräte ohne aktuelles iPadOS | – |

Mindest-OS: aktuelles iPadOS (WebGPU in Safari ab iPadOS 26; WebGL2 als Fallback).

## Browser-Fähigkeiten & Fallstricke

| Thema | Plan |
|---|---|
| **Speicher pro Tab** 🔬 | Safari beendet Tabs bei zu hohem Verbrauch ohne Vorwarnung. Hartes Budget (Start: 1 GB gesamt), eigener Speicher-Monitor im Debug-HUD. |
| **WASM-Speicher** | wasm32 max. 4 GB, real deutlich weniger. Keine Abhängigkeit von Memory64. |
| **Persistenter Speicher** 🔬 | OPFS für importierte Daten. Safari kann Daten nicht genutzter Websites löschen → App als **PWA zum Home-Bildschirm** hinzufügen, `navigator.storage.persist()` anfragen. |
| **Datei-Import** 🔬 | Files-App über `<input type="file" multiple>`. Ordnerauswahl (`webkitdirectory`/`showDirectoryPicker`) auf iPadOS nicht verlässlich → Mehrfachauswahl oder ZIP-Import. |
| **Texturen** 🔬 | Originale sind DXT1/3/5 (BC1–3). Apple-GPUs ab M1 können BC; ältere eher ASTC/ETC2. Laufzeit-Erkennung, ggf. beim Import umwandeln. |
| **Audio** 🔬 | Stimmen sind OGG Vorbis, Musik MP3, Effekte WAV. OGG-Unterstützung in Safari prüfen, sonst WASM-Decoder. AudioContext erst nach Nutzer-Tipp starten (Autoplay-Sperre). |
| **Vollbild** | Als PWA (`display: fullscreen/standalone`) – zuverlässiger als die Fullscreen-API. |
| **Wärme/Akku** | Bildrate begrenzen (30 FPS-Modus), dynamische Auflösung. |

## Steuerung

| Eingabe | Umsetzung |
|---|---|
| **Touch** (Standard) | Linker virtueller Stick = Laufen, rechte Bildschirmhälfte wischen = Umsehen, Buttons: Aktivieren, Springen, Schleichen, Feuern, Zielen, Nachladen, V.A.T.S., Pip-Boy. Layout anpassbar, Größe/Transparenz einstellbar. |
| **Gamepad** | Gamepad API (Xbox-, PlayStation-, MFi-Controller per Bluetooth). Standard-Belegung analog zur Konsolenversion. |
| **Maus & Tastatur** | Magic Keyboard/Trackpad: Pointer Lock 🔬, WASD-Belegung. |
| **Menüs** | Pip-Boy & Dialoge vollständig per Touch bedienbar (große Trefferflächen ≥ 44 pt). |

## Leistungsbudget (Startwerte, nach M1 anpassen)

- Draw Calls: < 1 500 pro Frame (Instancing, Zell-Batching)
- Texturspeicher: ≤ 400 MB (Mip-Bias, max. 1024² auf Sekundärgeräten)
- Geladene Außenzellen: 3×3 voll, darüber LOD
- Frame-Zeit: 33 ms (30 FPS) garantiert, 16 ms (60 FPS) auf M-Chips angestrebt
