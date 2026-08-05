#!/usr/bin/env node
'use strict';

/**
 * Eksporter data fra SQLite og importer til Supabase.
 *
 * Steg 1 (kun eksport):
 *   node scripts/migrate-to-supabase.js --export
 *
 * Steg 2 (import – krever Supabase-oppsett):
 *   1. Opprett prosjekt på supabase.com (velg EU-region)
 *   2. Kjør supabase/migrations/001_initial_schema.sql i SQL Editor
 *   3. Legg SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY i .env
 *   4. node scripts/migrate-to-supabase.js --import
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');

require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') });

const { prepare, parseJson } = require(path.join(SERVER_DIR, 'db'));
const { getSupabase, isSupabaseEnabled } = require(path.join(SERVER_DIR, 'supabase'));

const EXPORT_DIR = path.join(__dirname, '..', 'supabase', 'export');

const TABLES = [
  {
    name: 'users',
    query: 'SELECT * FROM users ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        username: row.username,
        password_hash: row.password_hash,
        name: row.name,
        email: row.email || '',
        role: row.role,
        permissions: parseJson(row.permissions, []),
        aktiv: !!row.aktiv,
        is_admin: !!row.is_admin,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'innstillinger',
    query: 'SELECT * FROM innstillinger ORDER BY key',
    map: function (row) {
      return {
        key: row.key,
        value: parseJson(row.value, []),
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'mail_kontoer',
    query: 'SELECT * FROM mail_kontoer ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        navn: row.navn,
        epost: row.epost,
        imap_host: row.imap_host,
        imap_port: row.imap_port,
        imap_secure: !!row.imap_secure,
        imap_user: row.imap_user,
        imap_pass: row.imap_pass,
        smtp_host: row.smtp_host,
        smtp_port: row.smtp_port,
        smtp_secure: !!row.smtp_secure,
        smtp_user: row.smtp_user,
        smtp_pass: row.smtp_pass,
        from_name: row.from_name,
        signatur: row.signatur || '',
        aktiv: !!row.aktiv,
        standard: !!row.standard,
        last_sync: row.last_sync || null,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'kunder',
    query: 'SELECT * FROM kunder ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        navn: row.navn,
        epost: row.epost || '',
        tlf: row.tlf || '',
        adresse: row.adresse || '',
        postnr: row.postnr || '',
        poststed: row.poststed || '',
        organisasjonsnummer: row.organisasjonsnummer || '',
        type: row.type || 'Privat',
        notater: row.notater || '',
        kilde: row.kilde || 'Manuell',
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'henvendelser',
    query: 'SELECT * FROM henvendelser ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        navn: row.navn,
        epost: row.epost,
        tlf: row.tlf,
        emne: row.emne,
        melding: row.melding,
        status: row.status,
        ansvarlig: row.ansvarlig,
        svar: row.svar,
        kommentarer: parseJson(row.kommentarer, []),
        kilde: row.kilde,
        bil_ref: row.bil_ref,
        kunde_id: row.kunde_id || null,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'innbytte',
    query: 'SELECT * FROM innbytte ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        navn: row.navn,
        epost: row.epost,
        tlf: row.tlf,
        regnr: row.regnr,
        merke: row.merke,
        modell: row.modell,
        arsmodell: row.arsmodell,
        drivstoff: row.drivstoff,
        farge: row.farge,
        kjoretoy_type: row.kjoretoy_type,
        hjuldrift: row.hjuldrift,
        effekt_hk: row.effekt_hk,
        siste_eu_kontroll: row.siste_eu_kontroll,
        neste_eu_kontroll: row.neste_eu_kontroll,
        kilometerstand: row.kilometerstand,
        servicehistorikk: row.servicehistorikk,
        siste_service: row.siste_service,
        utstyr: parseJson(row.utstyr, []),
        sommerdekk: row.sommerdekk,
        vinterdekk: row.vinterdekk,
        forventning: row.forventning,
        kommentar: row.kommentar,
        finn_kode: row.finn_kode,
        status: row.status,
        ansvarlig: row.ansvarlig,
        tilbud: row.tilbud,
        kommentarer: parseJson(row.kommentarer, []),
        bilder: parseJson(row.bilder, []),
        kunde_id: row.kunde_id || null,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'biler',
    query: 'SELECT * FROM biler ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        reg: row.reg,
        merke: row.merke,
        modell: row.modell,
        aar: row.aar,
        km: row.km,
        innkjop: row.innkjop,
        salg: row.salg,
        farge: row.farge,
        status: row.status,
        ansvarlig: row.ansvarlig,
        frist: row.frist,
        notater: row.notater,
        eu_kontroll: row.eu_kontroll,
        forsikring: row.forsikring,
        sjekkliste: parseJson(row.sjekkliste, []),
        logg: parseJson(row.logg, []),
        svv_data: parseJson(row.svv_data, null),
        sjekklister: parseJson(row.sjekklister, null),
        archived: row.archived ? 1 : 0,
        archived_at: row.archived_at || null,
        sort_order: row.sort_order ?? 0,
        kunde_id: row.kunde_id || null,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'bil_kunder',
    query: 'SELECT * FROM bil_kunder ORDER BY bil_id, kunde_id',
    map: function (row) {
      return {
        bil_id: row.bil_id,
        kunde_id: row.kunde_id,
        created_at: row.created_at
      };
    }
  },
  {
    name: 'kalender',
    query: 'SELECT * FROM kalender ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        tittel: row.tittel,
        type: row.type,
        dato: row.dato,
        tid: row.tid,
        tid_slutt: row.tid_slutt,
        ansvarlig: row.ansvarlig,
        bil_ref: row.bil_ref,
        notat: row.notat,
        kunde_id: row.kunde_id || null,
        created_at: row.created_at
      };
    }
  },
  {
    name: 'epost_maler',
    query: 'SELECT * FROM epost_maler ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        navn: row.navn,
        emne: row.emne,
        innhold_html: row.innhold_html,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'epost_utkast',
    query: 'SELECT * FROM epost_utkast ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        konto_id: row.konto_id,
        til: row.til,
        kopi: row.kopi,
        blindkopi: row.blindkopi,
        emne: row.emne,
        innhold_html: row.innhold_html,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }
  },
  {
    name: 'eposter',
    query: 'SELECT * FROM eposter ORDER BY id',
    map: function (row) {
      return {
        id: row.id,
        konto_id: row.konto_id,
        message_id: row.message_id,
        thread_id: row.thread_id,
        in_reply_to: row.in_reply_to,
        retning: row.retning,
        fra_navn: row.fra_navn,
        fra_epost: row.fra_epost,
        til_epost: row.til_epost,
        emne: row.emne,
        innhold: row.innhold,
        innhold_html: row.innhold_html,
        lest: !!row.lest,
        henvendelse_id: row.henvendelse_id,
        kunde_id: row.kunde_id || null,
        status: row.status || '',
        ansvarlig: row.ansvarlig || '',
        mottatt_dato: row.mottatt_dato,
        created_at: row.created_at
      };
    }
  }
];

async function exportData() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  for (const table of TABLES) {
    let rows = [];
    try {
      const result = await prepare(table.query).all();
      rows = result.map(table.map);
    } catch (err) {
      console.warn(`Hopper over ${table.name}: ${err.message}`);
    }
    const file = path.join(EXPORT_DIR, `${table.name}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
    console.log(`Eksportert ${rows.length} rader → ${file}`);
  }

  console.log('\nFerdig. Kjør SQL-skjema i Supabase, deretter: node scripts/migrate-to-supabase.js --import');
}

const IMPORT_ORDER = [
  'users',
  'innstillinger',
  'mail_kontoer',
  'kunder',
  'henvendelser',
  'innbytte',
  'biler',
  'bil_kunder',
  'kalender',
  'epost_maler',
  'epost_utkast',
  'eposter'
];

function conflictColumn(tableName) {
  if (tableName === 'innstillinger') return 'key';
  if (tableName === 'bil_kunder') return 'bil_id,kunde_id';
  return 'id';
}

function normalizeImportRow(tableName, row, validKontoIds) {
  if (tableName === 'biler') {
    return Object.assign({}, row, {
      archived: row.archived ? 1 : 0
    });
  }
  if ((tableName === 'epost_utkast' || tableName === 'eposter') && row.konto_id != null) {
    if (!validKontoIds.has(Number(row.konto_id))) {
      const fallback = validKontoIds.size ? Math.min(...validKontoIds) : null;
      return Object.assign({}, row, { konto_id: fallback });
    }
  }
  return row;
}

async function importTable(supabase, tableName, rows, validKontoIds) {
  if (!rows.length) {
    console.log(`Hopper over ${tableName} (tom)`);
    return;
  }

  const batchSize = 200;
  const onConflict = conflictColumn(tableName);
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map(function (row) {
      return normalizeImportRow(tableName, row, validKontoIds);
    });
    const { error } = await supabase.from(tableName).upsert(batch, { onConflict });
    if (error) throw new Error(`${tableName}: ${error.message}`);
    console.log(`  ${tableName}: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
  }
}

async function importData() {
  if (!isSupabaseEnabled()) {
    console.error('Mangler Supabase-konfigurasjon. Sett USE_SUPABASE=true, SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY i .env');
    process.exit(1);
  }

  const supabase = getSupabase();
  const validKontoIds = new Set();
  const kontoFile = path.join(EXPORT_DIR, 'mail_kontoer.json');
  if (fs.existsSync(kontoFile)) {
    JSON.parse(fs.readFileSync(kontoFile, 'utf8')).forEach(function (row) {
      if (row.id != null) validKontoIds.add(Number(row.id));
    });
  }

  for (const tableName of IMPORT_ORDER) {
    const file = path.join(EXPORT_DIR, `${tableName}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`Mangler ${file} – kjør --export først`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`Importerer ${tableName}…`);
    await importTable(supabase, tableName, rows, validKontoIds);
  }

  console.log('\nImport fullført.');
  console.log('Tips: Kjør setval-linjer nederst i supabase/migrations/001_initial_schema.sql hvis nye rader skal få riktig id.');
  console.log('Deretter: sett USE_SUPABASE=true og DATABASE_URL i .env for PostgreSQL-drift (fase 2).');
}

const arg = process.argv[2];
if (arg === '--export') {
  exportData().catch(function (err) {
    console.error(err.message || err);
    process.exit(1);
  });
} else if (arg === '--import') {
  importData().catch(function (err) {
    console.error(err.message || err);
    process.exit(1);
  });
} else {
  console.log('Bruk: node scripts/migrate-to-supabase.js --export | --import');
}
