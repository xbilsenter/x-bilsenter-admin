#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getSiteOrigin } = require('../server/site-origin');
const {
  KLAR_STATUS,
  ANNONSERT_STATUS,
  loadFinnInventory,
  matchKlarBilerToFinn
} = require('../server/finn-bil-match');
const { prepare } = require('../server/database');
const dbHelpers = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.VERCEL)
  ? require('../server/db-pg')
  : require('../server/db-sqlite');
const { getInnstillinger } = dbHelpers;
const {
  ensureSjekklisterForStatus,
  parseBilSjekklisterObject,
  getAktivSjekklisteFromRow
} = require('../server/db-shared');

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function appendLogg(row, tekst, av) {
  const logg = parseJson(row.logg, []);
  logg.unshift({
    dato: new Date().toLocaleString('nb-NO'),
    av: av || 'System',
    tekst: tekst
  });
  return logg.slice(0, 200);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const refresh = process.argv.includes('--refresh');

  const klarBiler = await prepare(
    "SELECT * FROM biler WHERE COALESCE(archived, 0) = 0 AND status = ? ORDER BY id"
  ).all(KLAR_STATUS);

  console.log('Biler i «' + KLAR_STATUS + '»:', klarBiler.length);

  const siteOrigin = getSiteOrigin();
  console.log('Henter FINN-lager fra', siteOrigin, refresh ? '(refresh)' : '');
  const finnCars = await loadFinnInventory(siteOrigin, { refresh });
  console.log('FINN (tilgjengelige):', finnCars.length);

  const { matches, unmatched } = matchKlarBilerToFinn(klarBiler, finnCars);
  console.log('\nTreff:', matches.length);
  matches.forEach(function (m) {
    console.log(
      '  ✓',
      m.bil.reg,
      '→',
      m.finn.id,
      '(' + (m.finn.make || '') + ' ' + (m.finn.model || '') + ' ' + (m.finn.year || '') + ')',
      'score=' + m.score
    );
  });

  if (unmatched.length) {
    console.log('\nIngen FINN-treff (' + unmatched.length + '):');
    unmatched.forEach(function (b) {
      console.log('  ·', b.reg, b.merke, b.modell, b.aar || '');
    });
  }

  if (!apply) {
    console.log('\nKjør med --apply for å flytte treff til «' + ANNONSERT_STATUS + '».');
    return;
  }

  if (!matches.length) {
    console.log('\nIngen oppdateringer å gjøre.');
    return;
  }

  const settings = await getInnstillinger();
  let updated = 0;

  for (const match of matches) {
    const row = await prepare('SELECT * FROM biler WHERE id = ?').get(match.bil.id);
    if (!row || row.status !== KLAR_STATUS) continue;

    const currentSjekklister = parseBilSjekklisterObject(row);
    const sjekklister = ensureSjekklisterForStatus(
      currentSjekklister,
      ANNONSERT_STATUS,
      settings.bilSjekklister
    );
    const sjekkliste = getAktivSjekklisteFromRow({ ...row, status: ANNONSERT_STATUS }, sjekklister);
    const logg = appendLogg(
      row,
      'Flyttet automatisk til ' + ANNONSERT_STATUS + ' (FINN ' + match.finn.id + ').',
      'FINN-sync'
    );

    await prepare(`
      UPDATE biler SET
        status = @status,
        finn_kode = @finn_kode,
        sjekkliste = @sjekkliste,
        sjekklister = @sjekklister,
        logg = @logg,
        updated_at = NOW()
      WHERE id = @id
    `).run({
      id: row.id,
      status: ANNONSERT_STATUS,
      finn_kode: String(match.finn.id),
      sjekkliste: JSON.stringify(sjekkliste),
      sjekklister: JSON.stringify(sjekklister),
      logg: JSON.stringify(logg)
    });
    updated += 1;
  }

  console.log('\nOppdatert', updated, 'bil(er) til «' + ANNONSERT_STATUS + '».');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
