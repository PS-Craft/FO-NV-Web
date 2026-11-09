# FO-NV-Web

Privates Self-Hosting von *Fallout: New Vegas* im Browser – **iPad-tauglich, mit Touch-Steuerung,
passwortgeschützt, auch unterwegs** – auf Basis von [fnv-web-recomp](https://github.com/SgtMetz/fnv-web-recomp)
und der **eigenen Steam-Kopie**. Gehostet auf dem eigenen PHP-Weblaufwerk.

👉 **Los geht's: [docs/ANLEITUNG.md](docs/ANLEITUNG.md)**

> ⚠️ Dieses Repository enthält und verteilt **keine** Spieldaten. Nicht mit Bethesda Softworks
> oder Microsoft verbunden.

## Status

- ✅ `hosting/`: PHP-Ersatz für den Node-Server (Spieldateien, Spielstände) + `.htaccess` (Passwort,
  COOP/COEP, vorkomprimierte Dateien, Caching) – getestet mit PHP und Apache
- ✅ `pc/`: Setup- und Build-Skripte für den Windows-PC (noch nicht auf echtem PC getestet)
- ⏳ iPad-Schnelltest, PC-Einrichtung, erster echter Durchlauf
- 🧰 `src/`: iPad-Systemcheck (Web-App), Tests

## Entwicklung

```bash
npm ci
npm run dev      # lokaler Server (auch im WLAN fürs iPad erreichbar)
npm test
npm run build
```

Push auf `main` → GitHub Actions baut und veröffentlicht automatisch auf GitHub Pages.

## Dokumentation

Einstieg: **[docs/PLAN.md](docs/PLAN.md)**

| Dokument | Inhalt |
|---|---|
| [ANLEITUNG.md](docs/ANLEITUNG.md) | **Schritt-für-Schritt: Weblaufwerk, PC-Build, iPad** |
| [PLAN.md](docs/PLAN.md) | Gesamtplan, Lösungswege, Architektur, Risiken |
| [ROADMAP.md](docs/ROADMAP.md) | Meilensteine M0–M12 mit Aufgaben & Abnahmekriterien |
| [IPAD.md](docs/IPAD.md) | iPad/Safari: Speicher, Import, Grafik, Audio, Steuerung |
| [FORMATE.md](docs/FORMATE.md) | ESM, BSA, NIF, DDS … und öffentliche Quellen |
| [RECHT.md](docs/RECHT.md) | Was ins Repo darf und was nicht |
| [WEG-B-STREAMING.md](docs/WEG-B-STREAMING.md) | Sofort spielen per Streaming |
| [FRAGEN.md](docs/FRAGEN.md) | Offene Entscheidungen |
