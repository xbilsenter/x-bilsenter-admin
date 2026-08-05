# Deploy til Vercel

To Vercel-prosjekter (admin + nettside), begge med Supabase.

## 1. Admin CRM (`x-bilsenter-admin`)

### Opprett prosjekt
1. [vercel.com](https://vercel.com) → **Add New Project**
2. Importer repo `x-bilsenter-admin`
3. **Plan:** Hobby fungerer for admin-panel og API. **Pro** kreves for e-post-cron hvert 3. min (se nederst).

### Build-innstillinger (auto fra `vercel.json`)
| Felt | Verdi |
|------|--------|
| Install | `npm run install:all` |
| Build | `npm run build --prefix client` |
| Output | `client/dist` |

### Miljøvariabler (Production)

**Database (påkrevd)**
```
USE_SUPABASE=true
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=uploads
```

**Auth / integrasjon**
```
JWT_SECRET=<sterk-hemmelighet>
INGEST_SECRET=<samme som nettside>
VEGVESEN_API_KEY=...
PUBLIC_SITE_ORIGIN=https://xbilsenter.no
ADMIN_PUBLIC_URL=https://drift.xbilsenter.no
CORS_ORIGINS=https://xbilsenter.no,https://www.xbilsenter.no
```

**E-post cron**
```
CRON_SECRET=<generer med: openssl rand -hex 32>
MAIL_SYNC_INTERVAL_MS=180000
```

**Maskinporten / omreg (valgfritt)**
```
MASKINPORTEN_CLIENT_ID=...
MASKINPORTEN_PRIVATE_KEY=...   (hele PEM som én linje eller env)
SKATTEETATEN_OMREG_RETTIGHETSPAKKE=...
```

**Node**
```
NODE_ENV=production
```

### Domene
- Koble **`drift.xbilsenter.no`** til admin-prosjektet (Settings → Domains)

### Etter deploy
1. Sjekk `GET /api/public/status` → HTTP 200 (f.eks. `https://[prosjekt].vercel.app/api/public/status`)
2. Koble domene **`drift.xbilsenter.no`** (Settings → Domains) og legg til DNS (CNAME → `cname.vercel-dns.com`)
3. Logg inn i admin
4. **Pro:** Legg til cron i Vercel → Settings → Cron Jobs: `GET /api/cron/mail-sync` hvert 3. min

### Viktig: Admin må opprettes som eget Vercel-prosjekt
Nettsiden (`x-bilsenter`) og admin (`x-bilsenter-admin`) er **to separate prosjekter** i Vercel. Importer repo `xbilsenter/x-bilsenter-admin` og deploy på nytt etter env-variabler er satt.

---

## 2. Nettside (`x-bilsenter`)

### Opprett prosjekt
1. Nytt Vercel-prosjekt for `x-bilsenter`
2. Hobby/Pro fungerer (ingen cron)

### Miljøvariabler
```
NODE_ENV=production
VEGVESEN_API_KEY=...
FINN_API_KEY=...
FINN_ORG_ID=7640539
INGEST_SECRET=<samme som admin>
ADMIN_API_URL=https://drift.xbilsenter.no
```

### Domene
- `xbilsenter.no` / `www.xbilsenter.no`

---

## Lokal utvikling (uendret)

```bash
# Admin
cd x-bilsenter-admin && npm run dev

# Nettside
cd x-bilsenter && npm run dev
```

PM2 lokalt er valgfritt under utvikling. Produksjon = Vercel.

---

## Supabase før deploy

1. Kjør alle migrasjoner i `supabase/migrations/` (inkl. `008_innkjopskalkyle_updated_by.sql`)
2. `npm run migrate:uploads` hvis filer fortsatt ligger lokalt
3. Verifiser Storage-bucket `uploads`

---

## Feilsøking

| Problem | Løsning |
|---------|---------|
| Admin finnes ikke på Vercel | Opprett **nytt prosjekt** for repo `x-bilsenter-admin` (ikke samme som nettsiden) |
| `drift.xbilsenter.no` virker ikke | Legg til CNAME i DNS → `cname.vercel-dns.com` etter domene er koblet i Vercel |
| Build feiler på `better-sqlite3` | Bruk `install:vercel` (i `vercel.json`) + `USE_SUPABASE=true` |
| 401 på cron | Sett `CRON_SECRET` i Vercel env |
| CORS-feil | Legg nettside-URL i `CORS_ORIGINS` + `PUBLIC_SITE_ORIGIN` på admin |
| Skjema lagres ikke | `ADMIN_API_URL` på nettside må peke til admin-URL |
| Database timeout | Bruk Supabase **pooler** port **6543** i `DATABASE_URL` |
| Upload feiler | `SUPABASE_STORAGE_BUCKET` + service role key |

---

## Slack migrasjon fra PM2

Når Vercel fungerer:
```bash
cd x-bilsenter && npx pm2 stop ecosystem.config.cjs
```

Behold PM2 lokalt om du vil teste parallelt under overgangen.
