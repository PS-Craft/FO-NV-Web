# Rechtliche Leitplanken

> Keine Rechtsberatung. Bei öffentlicher Veröffentlichung im Zweifel anwaltlich prüfen lassen.

Projekte wie **OpenMW** (Morrowind), **OpenRA**, **OpenTTD** oder **devilutionX** zeigen, wie
Engine-Nachbauten neben kommerziellen Spielen existieren können. Gemeinsame Regeln:

## Verboten im Repository / auf dem Server

- ❌ Spieldaten jeder Art: `.esm`, `.bsa`, Meshes, Texturen, Sounds, Musik, Videos, Texte/Dialoge,
  Schriftarten aus dem Spiel – auch nicht „nur zum Testen", auch nicht in Releases oder Git-LFS.
- ❌ Dekompilierter oder disassemblierter Code aus `FalloutNV.exe` oder den Bethesda-Tools.
- ❌ Logos, Schriftzüge, Cover-Art, Screenshots aus dem Spiel als Projekt-Branding.
- ❌ Öffentlich erreichbare Weblaufwerke mit Spieldaten (auch nicht „versteckt" per Link).

## Erlaubt / so machen wir es

- ✅ Eigener, selbst geschriebener Engine-Code.
- ✅ Implementierung anhand **öffentlicher Formatdokumentation** (UESP, NifTools `nif.xml`,
  xEdit-Definitionen, GECK-Wiki) – siehe [FORMATE.md](FORMATE.md). Lizenzen dieser Quellen
  beachten (z. B. MPL für xEdit-Code: nicht kopieren, nur als Referenz lesen, oder lizenzkonform
  übernehmen).
- ✅ Nutzer bringt **eigene, legal erworbene Kopie** mit (Steam/GOG/Epic). Daten bleiben auf dem
  eigenen Gerät (iPad-Browserspeicher).
- ✅ Tests in CI ausschließlich mit **selbst erzeugten** Testdateien (synthetische BSA/ESM/NIF).
- ✅ Eigene Platzhalter-Grafiken/Icons für die Oberfläche.

## Name & Marke

„Fallout" ist eine eingetragene Marke. Empfehlung: Projekt unter **neutralem Namen** führen
(z. B. „Mojave Web Engine" o. ä.) mit dem Hinweis *„benötigt eine eigene Kopie von Fallout: New
Vegas; nicht mit Bethesda/Microsoft verbunden"*. Der aktuelle Repo-Name `FO-NV-Web` ist für ein
privates Repo unkritisch, für ein öffentliches sollte er überdacht werden.

## Repo-Sichtbarkeit

- **Privates Repo** + GitHub Pages: Pages-Seiten privater Repos sind je nach GitHub-Plan
  trotzdem öffentlich erreichbar (Engine-Code, keine Daten – unkritisch).
- **Öffentliches Repo:** möglich, wenn die obigen Regeln strikt eingehalten werden.
