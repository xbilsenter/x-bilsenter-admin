# X Bilsenter Admin (CRM / driftssystem)

Separat prosjekt for internt driftspanel. Nettsiden (`x-bilsenter`) sender skjema hit via ingest-API.

## Oppsett

```bash
cd x-bilsenter-admin
cp .env.example .env
npm run install:all
```

Sett **samme `INGEST_SECRET`** i både `x-bilsenter-admin/.env` og `x-bilsenter/.env`.

## Kjøre lokalt

Terminal 1 – admin API:
```bash
cd x-bilsenter-admin/server && npm run dev
```

Terminal 2 – admin UI:
```bash
cd x-bilsenter-admin/client && npm run dev
```

Terminal 3 – nettside:
```bash
cd x-bilsenter && npm start
```

| Tjeneste | URL |
|----------|-----|
| Nettside | http://localhost:8080 |
| Admin API | http://localhost:8090 |
| Admin panel | http://localhost:5173 |

Standard innlogging: `admin` / `admin123` (endres i `.env`).

## Produksjon

```bash
npm run start:prod
```

Bygger React-klienten og serverer den fra admin-serveren på port 8090.

## Hva kommer inn automatisk

- **Innbytte** fra `/innbytte.html` → `POST /api/ingest/innbytte/json`
- **Kontakt** fra `/kontakt.html` → `POST /api/ingest/henvendelse`

Biler, kalender og interne oppgaver administreres direkte i CRM-et.
