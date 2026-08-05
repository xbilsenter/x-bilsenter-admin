# Migrering til Supabase

CRM-et bruker SQLite lokalt (`server/data/xbilsenter.db`) som standard. Supabase gir PostgreSQL i skyen + fil-lagring.

## Fase 1 – Skjema og dataeksport (klar)

### 1. Opprett Supabase-prosjekt

1. Gå til [supabase.com](https://supabase.com) og opprett prosjekt
2. Velg **EU-region** (f.eks. Frankfurt) for GDPR
3. Noter **Project URL** og **service_role key** (Settings → API)

### 2. Kjør databaseskjema

I Supabase Dashboard → **SQL Editor** → **New query**:

**Enklest:** lim inn og kjør **hele** filen:

`supabase/migrations/000_run_all.sql`

Alternativt stegvis:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_schema_extensions.sql`
3. `supabase/migrations/003_bil_documents.sql` (hvis ikke allerede i 000)
4. `supabase/migrations/004_selg_bil.sql` (oppkjøpsskjema – krever `kunder`)

Etter kjøring skal du se en liste med 13 tabeller nederst i resultatet (`users`, `biler`, `kunder`, `selg_bil`, osv.).

**Feilsøking steg 1**

| Symptom | Løsning |
|---------|---------|
| Feil om `pgcrypto` / extension | Bruk oppdaterte filer (pgcrypto er fjernet) |
| Feil på `setval` / sekvens | Bruk `000_run_all.sql` – setval er fjernet |
| `Could not find table public.users` ved import | Skjema er ikke kjørt – kjør SQL på nytt |
| «Success» men ingen tabeller | Sjekk **Table Editor** → schema `public` |
| Delvis kjøring feilet | Kjør `000_run_all.sql` på nytt (trygg å kjøre flere ganger) |

Gå til **Settings → API** og klikk **Reload schema** hvis import fortsatt ikke finner tabellene.

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

## Fase 2 – Backend koblet til Supabase (klar)

Backend velger database via `server/db.js`:

- `USE_SUPABASE=false` (standard): SQLite via `server/db-sqlite.js`
- `USE_SUPABASE=true` + Supabase-nøkler: PostgreSQL via `server/db-pg.js`

### Påkrevd for PostgreSQL-runtime

Legg til i `.env`:

```env
USE_SUPABASE=true
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=din-service-role-key
DATABASE_URL=postgresql://postgres.[ref]:[passord]@aws-0-[region].pooler.supabase.com:6543/postgres
```

`DATABASE_URL` hentes fra Supabase → **Settings → Database → Connection string** → **Transaction pooler** (port **6543**). Brukernavn er `postgres.[prosjekt-ref]`, ikke bare `postgres`. **Ikke** bruk direkte `db.*`-URL (port 5432) – den feiler på enkelte nettverk.

Uten `DATABASE_URL` feiler backend ved oppstart når PostgreSQL er aktivert.

### Verifiser

```bash
# SQLite (standard)
USE_SUPABASE=false node -e "require('./server/db')"

# PostgreSQL (krever DATABASE_URL)
USE_SUPABASE=true node -e "require('./server/db')"
```

Ved oppstart logger serveren `Database: Supabase PostgreSQL` eller `Database: SQLite (...)`.

---

## Fase 3 – Filopplastinger (klar)

Nye og eksisterende filer kan lagres i **Supabase Storage** i stedet for `server/data/uploads/`.

Legg til i `.env`:

```env
USE_SUPABASE=true
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=din-service-role-key
SUPABASE_STORAGE_BUCKET=uploads
```

Serveren oppretter bucket automatisk ved oppstart (privat bucket). Filer serveres fortsatt på `/uploads/...` via API-et.

### Migrer eksisterende lokale filer

```bash
cd x-bilsenter-admin
npm run migrate:uploads
```

Dette laster opp alle filer fra `server/data/uploads/` til Supabase Storage. Eksisterende `/uploads/`-stier i databasen fungerer uendret.

---

## Nyttige kommandoer

| Kommando | Beskrivelse |
|----------|-------------|
| `npm run migrate:export` | SQLite → JSON |
| `npm run migrate:import` | JSON → Supabase |
| `npm run migrate:uploads` | Lokale filer → Supabase Storage |
| `npm start` | Starter CRM (SQLite som standard) |

## Sikkerhet

- **Service role key** har full tilgang – kun på server, aldri i frontend eller git
- **DATABASE_URL** inneholder databasepassord – kun på server
- `.env` skal ikke committes
- Bruk sterke passord og HTTPS i produksjon
