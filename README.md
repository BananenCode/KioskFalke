# KioskFalke PWA V2

Smartphone-optimierte private Kiosk-Verwaltung mit Kategorien, Produktverwaltung, User_ID-Login, Kontostand, Monatsjournal, Zahlungen, Fehlbuchungs-Korrektur und Admin-Analyse.

## Wichtigste Änderungen in V2

- Login mit **User_ID + Zugangscode** statt nur Zugangscode.
- Admin kann Kategorien anlegen, bearbeiten und löschen.
- Admin kann Produkte mit Titel, Beschreibung, Preis und Kategorie anlegen, bearbeiten und löschen/deaktivieren.
- User und Admin haben ein Konto:
  - Produktentnahmen belasten das Konto.
  - Zahlungen erhöhen das Konto.
  - Minus bedeutet offene Rechnung.
  - 0 bedeutet ausgeglichen.
  - Plus bedeutet Guthaben/Vorauszahlung.
- Konto-Hinweis: Beträge sollen immer zum **1. eines Monats** bezahlt werden.
- Monatsjournal zeigt den aktuellen Monat.
- User können eigene Buchungen nicht löschen.
- Admin kann im User-Profil Fehlbuchungen entfernen.
- User können nur gelöscht werden, wenn ihr Konto exakt 0,00 € ist.
- Admins können nur mit Sicherheitscode gelöscht werden.
- Sicherheitscode zum Löschen eines Admins: `DROPADMIN`
- Der letzte aktive Admin kann nicht gelöscht werden.
- Admin-Analyse nach Produkten und Kategorien.
- Warnung bei Produktbuchung, sobald das Konto bei **-50,00 € oder schlechter** steht.
- Option „Eingeloggt bleiben“ beim Login.

## Supabase Update

In Supabase musst du einmalig die Datei ausführen:

```text
supabase/setup_v2.sql
```

Schritte:

1. Supabase Projekt öffnen.
2. Links **SQL Editor** öffnen.
3. **New query** anklicken.
4. Inhalt von `supabase/setup_v2.sql` komplett einfügen.
5. **Run** klicken.

Das Skript ist als Migration gedacht und kann auf deine bestehende Datenbank angewendet werden.

## Erster Login nach Update

Falls du noch den Standard-Admin nutzt:

```text
User_ID: admin
Zugangscode: admin1234
```

Danach bitte direkt einen eigenen Admin anlegen oder den bestehenden Admin bearbeiten.

## Supabase URL / Key

In `src/supabase.js` ist aktuell eine Fallback-Konfiguration enthalten.

Wichtig: Die Supabase URL darf **nicht** so aussehen:

```text
https://...supabase.co/rest/v1/
```

Sie muss so aussehen:

```text
https://...supabase.co
```

Für spätere saubere Verwaltung kannst du in Vercel diese Environment Variables setzen:

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

## Hinweis

Diese App ist für private Kleingruppen gedacht. Zugangscodes sind wie Passwörter zu behandeln.
