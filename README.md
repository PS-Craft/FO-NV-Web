# FO-NV-Web

Plan für eine browserbasierte, **iPad-taugliche** Engine, die *Fallout: New Vegas* mit den
**eigenen, legal erworbenen Spieldaten** des Nutzers abspielt – komplett auf GitHub entwickelt und
über GitHub Pages ausgeliefert.

> ⚠️ Dieses Repository enthält und verteilt **keine** Spieldaten. Nicht mit Bethesda Softworks
> oder Microsoft verbunden.

## Status

Meilenstein **M0 (Fundament)** steht: installierbare Web-App mit iPad-Systemcheck.
Nächster Schritt: **M1** – Machbarkeitstests auf echtem iPad.

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
| [PLAN.md](docs/PLAN.md) | Gesamtplan, Lösungswege, Architektur, Risiken |
| [ROADMAP.md](docs/ROADMAP.md) | Meilensteine M0–M12 mit Aufgaben & Abnahmekriterien |
| [IPAD.md](docs/IPAD.md) | iPad/Safari: Speicher, Import, Grafik, Audio, Steuerung |
| [FORMATE.md](docs/FORMATE.md) | ESM, BSA, NIF, DDS … und öffentliche Quellen |
| [RECHT.md](docs/RECHT.md) | Was ins Repo darf und was nicht |
| [WEG-B-STREAMING.md](docs/WEG-B-STREAMING.md) | Sofort spielen per Streaming |
| [FRAGEN.md](docs/FRAGEN.md) | Offene Entscheidungen |
