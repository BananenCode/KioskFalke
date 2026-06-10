# KioskFalke PWA V3

Smartphone-optimierte Kiosk-Verwaltung mit modernem iOS/Apple-Design, Kategorien zuerst, Produkt-Icons, Kategorie-Icons, User_ID-Login, Kontostand, Monatsjournal, Konto-Korrekturen und Admin-Analyse.

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
