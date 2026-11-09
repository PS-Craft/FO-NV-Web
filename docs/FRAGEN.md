# Offene Entscheidungen

## Beantwortet

- ✅ **Spiel:** New Vegas bei Steam gekauft (Fallout 3 wird nicht genutzt).
- ✅ **Hosting:** eigenes Weblaufwerk (PHP-Webspace), passwortgeschützt, auch unterwegs; genug Speicher frei.
- ✅ **Entwicklung:** auf GitHub; Claude ist Hauptentwickler.
- ✅ **Steuerung:** Touch muss gehen (Tastatur nicht immer dabei).
- ✅ **Anspruch:** Es muss am Ende vollständig und gut laufen.
- ✅ **iPad:** iPad mit A16, iPadOS 26.5.2.
- ✅ **DLCs:** alle, aber **ein-/ausschaltbar** (Einstellung) → Umsetzung in `hosting/fs.php` geplant.
- ✅ **PC per Remote Control:** später; erst wenn für den Build nötig.

## Befund 2026-11-09

- falloutnewvegasweb.com stürzt auf dem iPad bei **17 % („Compiling the game“)** ab.
  Vermutung: Safari verkraftet den Start nicht – 3 GB fest reservierter geteilter Speicher,
  64 Threads auf einmal und/oder das Übersetzen des ~95-MB-Programms.
  → Der **Belastungstest** in der Web-App (Abschnitt 2) misst, welcher Teil es ist.

## Noch offen

1. Ergebnis des Belastungstests auf dem iPad (Seite muss dafür einmal online gehen, siehe Chat).
