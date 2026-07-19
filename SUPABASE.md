# Migrering til Supabase

CRM-et bruker SQLite lokalt (`server/data/xbilsenter.db`). Supabase gir PostgreSQL i skyen + fil-lagring.

## Fase 1 – Skjema og dataeksport (klar)

### 1. Opprett Supabase-prosjekt

1. Gå til [supabase.com](https://supabase.com) og opprett prosjekt
2. Velg **EU-region** (f.eks. Frankfurt) for GDPR
3. Noter **Project URL** og **service_role key** (Settings → API)

### 2. Kjør databaseskjema

I Supabase Dashboard → **SQL Editor**, lim inn og kjør:

`supabase/migrations/001_initial_schema.sql`

### 3. Eksporter data fra SQLite

```bash
cd x-bilsenter-admin
npm run migrate:export
```

JSON-filer lagres i `supabase/export/` (ignorert av git).

### 4. Importer til Supabase

Legg dette i `.env`:

```env
USE_SUPABASE=true
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=din-service-role-key
```

Kjør import:

```bash
npm run migrate:import
```

Kjør deretter `setval`-linjene nederst i SQL-skjemaet hvis du vil beholde samme id-er ved nye rader.

---

## Fase 2 – Backend koblet til Supabase (gjenstår)

Backend (`server/db.js`, `index.js`, `mail.js`) bruker fortsatt SQLite direkte.

For full Supabase-drift må vi:

1. Flytte SQL fra `index.js`/`mail.js` inn i databaselaget
2. Implementere Supabase-versjon av alle CRUD-funksjoner
3. Slå på `USE_SUPABASE=true` i runtime

**Inntil fase 2 er ferdig:** la `USE_SUPABASE` være utkommentert eller `false` – da kjører alt som før lokalt.

---

## Fase 3 – Filopplastinger (planlagt)

Opplastede bilder i `server/data/uploads/` kan flyttes til **Supabase Storage**:

```env
SUPABASE_STORAGE_BUCKET=uploads
```

---

## Nyttige kommandoer

| Kommando | Beskrivelse |
|----------|-------------|
| `npm run migrate:export` | SQLite → JSON |
| `npm run migrate:import` | JSON → Supabase |
| `npm start` | Starter CRM (SQLite som standard) |

## Sikkerhet

- **Service role key** har full tilgang – kun på server, aldri i frontend eller git
- `.env` skal ikke committes
- Bruk sterke passord og HTTPS i produksjon
