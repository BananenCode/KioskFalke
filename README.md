# KioskFalke PWA

Smartphone-optimierte private Kiosk-Verwaltung mit Admin/User-Rollen, Produkten, Entnahmen, offenen Forderungen und Bezahlt-Markierung.

## Schnellstart

### 1. Supabase einrichten
1. Kostenloses Projekt bei Supabase erstellen.
2. Im Projekt links den **SQL Editor** öffnen.
3. Datei `supabase/setup.sql` komplett einfügen und ausführen.
4. Unter **Project Settings > API Keys** die **Project URL** und den **Publishable key** kopieren. Bei älteren Projekten funktioniert auch der Legacy `anon` key.

Der erste Admin ist automatisch angelegt:

- Name: `Admin`
- Zugangscode: `admin1234`

Bitte direkt nach dem ersten Login einen neuen Admin mit eigenem Code anlegen und den Standardcode nicht weitergeben.

### 2. Lokal testen
```bash
npm install
cp .env.example .env.local
# .env.local mit Supabase URL und Key füllen
npm run dev
```

### 3. Kostenlos online stellen mit Vercel
1. Projekt in ein GitHub Repository hochladen.
2. Bei Vercel neues Projekt importieren.
3. In Vercel unter **Settings > Environment Variables** setzen:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Deploy starten.

## Bedienung

- User öffnen die URL auf dem Smartphone und geben ihren Admin-vergebenen Code ein.
- Unter **Kiosk** buchen User Produkte.
- Unter **Dashboard** sehen User eigene Entnahmen und Forderungen.
- Admins sehen zusätzlich **Admin**:
  - User anlegen
  - Produkte anlegen/deaktivieren
  - offene Forderungen je User als bezahlt markieren

## Sicherheitshinweis

Diese App ist für private Kleingruppen gedacht. Es gibt bewusst keine E-Mail/Passwort-Registrierung. Jeder Zugangscode ist wie ein Passwort zu behandeln. Die Tabellen sind per Row Level Security gesperrt; die App greift über geprüfte Supabase-Funktionen zu.
