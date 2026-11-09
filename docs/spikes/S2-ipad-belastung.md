# Spike S2: iPad-Belastungstest (Safari-Grenzen)

**Gerät:** iPad (A16), iPadOS 26.5.2, Safari als Home-Bildschirm-App · **Datum:** 2026-11-09
**Anlass:** falloutnewvegasweb.com stürzt bei 17 % („Compiling the game“) ab.

## Systemcheck
- WebGPU ja; Texturformate nur **ASTC/ETC2, kein BC/DXT** (Renderer dekodiert DXT dann auf der CPU – vorhanden, kostet Speicher/CPU)
- maxBufferSize 1 GB, maxTexture2D 16384; Pointer Lock nein; Speicherkontingent 38 GB, dauerhaft gewährt
- Safari meldet sich als „Macintosh“ (Desktop-Modus); fnv-web-recomp erkennt das iPad trotzdem (maxTouchPoints)

## Ergebnisse (synthetische Module, keine Spieldaten)

| Schritt | Ergebnis |
|---|---|
| geteilter Speicher 1/2/3 GB anlegen; 1/1,5/2 GB wirklich belegen | ✅ |
| 25/50/100 MB Code übersetzen | ✅ (≤ 0,7 s – Safari übersetzt lazy) |
| 16/32/64 Threads starten | ✅ |
| Riesenfunktion 1/4/7 MB, 1 Thread heiß | ✅ |
| 100 MB + 8 Riesenfunktionen, 1/4/16 Threads heiß, kein Speicher belegt | ✅ |
| 100 MB kleine Funktionen, 16 Threads heiß, 1 GB belegt | ✅ |
| **hot16:** 2 GB (1 GB belegt) + Riesenfunktionen + 16 Threads | 💥 Tab-Absturz (1. Lauf) |
| **hot64:** 3 GB (1,5 GB belegt) + Riesenfunktionen + 64 Threads | ✅ (später Lauf) |
| **hotE:** Riesenfunktionen + 4 Threads + 1 GB belegt | ⚠️ Thread hängt > 180 s |

## Schlüsse
1. Keine **harte** Grenze bei Speicher, Programmgröße oder Threadzahl – jede einzeln geht, sogar die volle
   Kombination (hot64) lief einmal durch.
2. Probleme treten **nicht deterministisch** auf, sobald Riesenfunktionen heiß laufen **und** viel Speicher
   belegt ist: einmal Absturz (Speicherdruck → iPadOS beendet den Tab), einmal ein hängender Thread
   (Safari-Nachübersetzung großer Funktionen unter Last).
3. Synthetische Tests sind damit ausgereizt. Weiter geht es nur mit einem **eigenen Build** des Spiels mit
   Diagnose und iPad-Einstellungen (weniger Threads, kleinerer Block-Cache, kleinerer Speicher, ggf.
   aufgeteilte Riesenfunktionen) → braucht den Build-PC.
