# KioskFalke PWA V10

Kioskanwendung mit mobiler Entnahmeoberfläche und eigenem Desktop-Admin-Dashboard für User, Produkte, Verkäufe, Monatsumsätze und PDF-Gesamtabrechnungen.

## Update V10: Gesamtabrechnung und geprüfte Zahlungen

- Rechnungen zeigen immer den vollständigen Nutzungszeitraum eines Users.
- Die PDF fasst Käufe, bestätigte Zahlungen, Korrekturen und den offenen Betrag zusammen.
- User benötigen keine Rechnungsanschrift mehr; Name und User-ID reichen aus.
- Nach Prüfung eines PayPal-Eingangs bestätigt der Admin die Zahlung im User-Profil.
- Der bestätigte Betrag wird als Guthaben/Ausgleich verbucht und der User erhält automatisch eine Mitteilung.
- Kategorien können kompakt angelegt und durchsucht werden.
- Neue Kategorien lassen sich direkt im Produktformular anlegen und sofort auswählen.
- Produkte lassen sich filtern, schneller erfassen und als Vorlage duplizieren.

### Erforderliche Supabase-Migration V10

Nach V9 einmal vollständig im **Supabase SQL Editor** ausführen:

```text
supabase/setup_v10_total_invoices_payments.sql
```

Die Monatsauswahl bleibt für Dashboard, Verkäufe und Analysen erhalten. Nur die Rechnungsverwaltung arbeitet bewusst über den Gesamtzeitraum.


## Update V9: Desktop-Admin und Monatsrechnungen

Neu in dieser Version:

- eigener Desktop-Arbeitsbereich mit seitlicher Admin-Navigation
- Monatsfilter für Dashboard, Verkäufe und Rechnungen
- Kennzahlen für Umsatz, Verkäufe, Einheiten und offene User-Salden
- filterbare Verkaufstabelle nach User, Produkt und Kategorie
- monatliche Rechnungsliste für alle User
- PDF-Monatsrechnung pro User mit Produktpositionen, Mengen und Preisen
- konfigurierbare Rechnungsabsender-, Adress-, Steuer- und Zahlungshinweise
- E-Mail und Rechnungsanschrift je User
- Schutz davor, den letzten aktiven Admin über die Bearbeitung zu deaktivieren oder herabzustufen
- reparierter PDF-Aufbau für Kontoauszüge und Rechnungen

### Erforderliche Supabase-Migration V9

Nach dem bisherigen Datenbank-Setup im **Supabase SQL Editor** einmal vollständig ausführen:

```text
supabase/setup_v9_desktop_admin_invoices.sql
```

Danach die App neu deployen und vollständig neu laden. Unter **Admin > Einstellungen** zuerst den Rechnungsabsender hinterlegen und anschließend unter **Admin > User** die Rechnungsanschriften ergänzen.

Die erzeugte PDF ist eine technische Monatsrechnung. Ob sie alle steuer- und handelsrechtlichen Pflichtangaben deines konkreten Einsatzfalls erfüllt, hängt von den eingetragenen Absenderdaten und den für dich geltenden Vorgaben ab.

## Neu in V3

- Kiosk-Ansicht zeigt zuerst Kategorien. Nach Klick auf eine Kategorie werden die Produkte dieser Kategorie angezeigt.
- Admin kann Kategorien mit Titel und Icon anlegen, bearbeiten und löschen/deaktivieren.
- Admin kann Produkte mit Titel, Beschreibung, Preis, Kategorie, Icon und Umsatz-Option anlegen, bearbeiten und löschen/deaktivieren.
- Produkt-Option: **Nicht dem Gesamtumsatz zurechnen**. Das Produkt belastet weiterhin das User-Konto, zählt aber nicht in Umsatz/Analyse.
- Admin kann User-Konten manuell korrigieren: positive oder negative Beträge.
- Neues iOS-artiges Design mit Glas-/Kartenoptik.
- Das mitgelieferte KioskFalke-Logo ist als App-Symbol hinterlegt.

## Icon-Upload Format

Für Kategorien und Produkte können Icons hochgeladen werden.

Empfohlen:

- Format: `PNG`, `JPG`, `WebP` oder `SVG`
- Seitenverhältnis: quadratisch, z. B. 512x512 px
- Größe: maximal ca. 300 KB pro Icon

Die Icons werden als Data-URL in Supabase gespeichert. Für private Nutzung ist das einfach und ohne extra Storage-Bucket nutzbar.

## Supabase Update

In Supabase musst du einmalig die Datei ausführen:

```text
supabase/setup_v3.sql
```

Schritte:

1. Supabase Projekt öffnen.
2. Links **SQL Editor** öffnen.
3. **New query** anklicken.
4. Inhalt von `supabase/setup_v3.sql` komplett einfügen.
5. **Run** klicken.

Das Skript löscht zuerst alte RPC-Funktionen und erstellt sie neu. Tabellen und Daten bleiben erhalten.

## Erster Login

Falls du noch den Standard-Admin nutzt:

```text
User_ID: admin
Zugangscode: admin1234
```

## Admin-Löschcode

Admins können nur mit folgendem Sicherheitscode gelöscht/deaktiviert werden:

```text
DROPADMIN
```

Der letzte aktive Admin kann nicht gelöscht werden.

## Supabase URL / Key

In `src/supabase.js` ist aktuell deine funktionierende Supabase-URL als Fallback enthalten.

Wichtig: Die Supabase URL darf **nicht** so aussehen:

```text
https://...supabase.co/rest/v1/
```

Sie muss so aussehen:

```text
https://...supabase.co
```

Optional kannst du später in Vercel diese Environment Variables setzen:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

## GitHub Update

1. ZIP entpacken.
2. Inhalt des entpackten Ordners in dein GitHub Repository hochladen.
3. Alte Dateien überschreiben.
4. Commit changes.
5. Vercel deployed automatisch neu.
6. Vor dem Testen `Ctrl + F5` drücken oder im Inkognito-Fenster öffnen.


## V4 Update

- Kiosk-Ansicht zeigt zuerst große Kategorie-Kacheln.
- Nach Klick auf eine Kategorie erscheinen Produkt-Kacheln im gleichen Stil.
- Kategorie- und Produktbilder liegen als Hintergrund in der Kachel; Titel, Preis und Anzahl werden über einer halbtransparenten dunklen Ebene angezeigt.
- Produktbeschreibungen werden im Kiosk ausgeblendet, bleiben aber in der Admin-Verwaltung erhalten.
- Neuer Community-Tab für Produktvorschläge.
- User und Admins können Vorschläge einreichen und mit Falken-Votes bewerten.
- Admins können Community-Vorschläge als „Hinzugefügt“, „Abgelehnt“ oder wieder „Offen“ markieren.

### Supabase Update V4

Führe die Datei `supabase/setup_v3.sql` erneut komplett im Supabase SQL Editor aus. Das Skript ergänzt die Tabellen:

- `kiosk_suggestions`
- `kiosk_suggestion_votes`

sowie die RPC-Funktionen:

- `kiosk_community`
- `kiosk_create_suggestion`
- `kiosk_toggle_suggestion_vote`
- `kiosk_admin_set_suggestion_status`

### Icon-Upload

Für Kategorie- und Produktbilder: PNG, JPG, WebP oder SVG. Empfohlen: quadratisch, mindestens 512×512 px, maximal ca. 300 KB.

## Update V5: PayPal.Me, Kontoauszug PDF, Liquid Glass

Neu:
- Admin kann unter **Admin > Einstellungen** eine globale PayPal.Me-Adresse hinterlegen.
- Im Tab **Konto** erscheint bei negativem Kontostand ein PayPal.Me-Button mit automatisch angehängtem offenen Betrag.
- Admins können im User-Profil einen **Kontoauszug als PDF** herunterladen.
- Design wurde in Richtung iOS / iPhone Liquid Glass optimiert.

### Supabase-Migration
Bitte in Supabase den SQL Editor öffnen und `supabase/setup_v4_paypal_liquid.sql` einmal komplett ausführen. Dadurch wird die Tabelle `kiosk_settings` sowie neue/aktualisierte RPC-Funktionen für PayPal.Me und Kontoauszüge angelegt.

## Update V8: Community-News & überarbeitetes Liquid Glass

Neu in dieser Version:

- Kontostände bleiben auch im Darkmode eindeutig farbcodiert: offene Beträge rot, Guthaben grün.
- Das komplette Stylesheet wurde vereinheitlicht, damit im Darkmode keine schwarzen Texte mehr auf dunklen Flächen erscheinen.
- Der Community-Bereich besitzt jetzt zwei Ansichten: **News** und **Produktvorschläge**.
- Admins können News mit Titel, Text und optionalem Foto veröffentlichen.
- News werden immer mit dem neuesten Beitrag zuerst angezeigt.
- Alle User können News liken und kommentieren.
- User können eigene Kommentare löschen; Admins können alle Kommentare moderieren und News löschen.
- Bei ungelesenen News erscheint am Community-Button eine rote Push-Pin. Sie verschwindet, sobald der Community-Tab geöffnet wurde.
- News-Fotos werden vor dem Speichern im Browser automatisch verkleinert und als JPEG optimiert.

### Erforderliche Supabase-Migration

Nach dem Hochladen dieser Version muss im **Supabase SQL Editor** einmal die folgende Datei vollständig ausgeführt werden:

```text
supabase/setup_v6_community_news.sql
```

Die Migration ergänzt die Tabellen für News, Likes, Kommentare und den Lesestatus sowie alle benötigten RPC-Funktionen. Bestehende User, Käufe, Zahlungen, Einstellungen und Produktvorschläge bleiben erhalten.

Danach das Projekt neu deployen und die PWA beziehungsweise den Browser einmal vollständig neu laden.
