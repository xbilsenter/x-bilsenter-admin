#!/usr/bin/env node
'use strict';

/**
 * Fjerner all operasjonell CRM-data (biler, henvendelser, innbytte, osv.)
 * Beholder brukere, innstillinger, mailkontoer og e-postmaler.
 *
 *   node scripts/purge-operational-data.js          # viser tellinger
 *   node scripts/purge-operational-data.js --confirm # sletter (irreversibelt)
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');

require(path.join(SERVER_DIR, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') });

const {
  dbReady,
  prepare,
  parseJson,
  syncPostgresSequences
} = require(path.join(SERVER_DIR, 'db-pg'));
const { getSupabase, isSupabaseEnabled } = require(path.join(SERVER_DIR, 'supabase'));
const { BUCKET, deleteUpload, isRemoteStorageEnabled } = require(path.join(SERVER_DIR, 'storage'));

const OPERATIONAL_TABLES = [
  'epost_vedlegg',
  'eposter',
  'epost_utkast',
  'mail_mapper',
  'bil_kunder',
  'bil_slettinger',
  'biler',
  'innbytte',
  'selg_bil',
  'henvendelser',
  'kalender',
  'innkjopskalkyle',
  'kunder'
];

const PRESERVED_TABLES = ['users', 'innstillinger', 'mail_kontoer', 'epost_maler'];

function parseArgs() {
  return { confirm: process.argv.includes('--confirm') };
}

async function countTable(table) {
  const row = await prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  return Number(row.c || 0);
}

function collectUploadPathsFromJson(value) {
  const paths = [];
  const items = Array.isArray(value) ? value : [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const filePath = item.path || item.url || '';
    if (String(filePath).startsWith('/uploads/')) paths.push(filePath);
  }
  return paths;
}

async function collectUploadPaths() {
  const paths = new Set();

  const innbytteRows = await prepare('SELECT bilder FROM innbytte').all();
  for (const row of innbytteRows) {
    for (const p of collectUploadPathsFromJson(parseJson(row.bilder, []))) paths.add(p);
  }

  const selgRows = await prepare('SELECT bilder FROM selg_bil').all();
  for (const row of selgRows) {
    for (const p of collectUploadPathsFromJson(parseJson(row.bilder, []))) paths.add(p);
  }

  const bilRows = await prepare('SELECT dokumenter FROM biler').all();
  for (const row of bilRows) {
    for (const p of collectUploadPathsFromJson(parseJson(row.dokumenter, []))) paths.add(p);
  }

  const vedleggRows = await prepare('SELECT lagring_path FROM epost_vedlegg').all();
  for (const row of vedleggRows) {
    const filePath = String(row.lagring_path || '');
    if (filePath.startsWith('/uploads/')) paths.add(filePath);
  }

  return [...paths];
}

async function purgeStorageBucket() {
  if (!isRemoteStorageEnabled()) {
    console.log('Storage: lokal mappe – hopper over bucket-tømming.');
    return 0;
  }

  const supabase = getSupabase();
  let removed = 0;
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw error;
    if (!data || !data.length) break;

    const keys = data.map(function (item) { return item.name; }).filter(Boolean);
    if (keys.length) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(keys);
      if (removeError) throw removeError;
      removed += keys.length;
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return removed;
}

async function deleteUploads(paths) {
  let ok = 0;
  let failed = 0;

  for (const uploadPath of paths) {
    try {
      await deleteUpload(uploadPath);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.warn('Kunne ikke slette fil:', uploadPath, err.message);
    }
  }

  return { ok, failed };
}

async function purgeDatabase() {
  const deleted = {};

  for (const table of OPERATIONAL_TABLES) {
    const info = await prepare(`DELETE FROM ${table}`).run();
    deleted[table] = info.changes || 0;
  }

  await syncPostgresSequences();
  return deleted;
}

async function printCounts(label) {
  console.log(`\n${label}`);
  console.log('─'.repeat(40));

  for (const table of OPERATIONAL_TABLES) {
    console.log(`${table.padEnd(18)} ${await countTable(table)}`);
  }

  console.log('\nBeholdes:');
  for (const table of PRESERVED_TABLES) {
    console.log(`${table.padEnd(18)} ${await countTable(table)}`);
  }
}

async function main() {
  const { confirm } = parseArgs();

  if (!isSupabaseEnabled()) {
    console.error('Krever USE_SUPABASE=true og Supabase-nøkler i .env');
    process.exit(1);
  }

  await dbReady;

  await printCounts('Nåværende tellinger');

  if (!confirm) {
    console.log('\nKjør med --confirm for å slette all operasjonell data (irreversibelt).');
    return;
  }

  console.log('\nSletter operasjonell data …');

  const uploadPaths = await collectUploadPaths();
  console.log(`Fant ${uploadPaths.length} filreferanser i databasen.`);

  const deleted = await purgeDatabase();
  console.log('\nSlettet rader:');
  for (const [table, count] of Object.entries(deleted)) {
    console.log(`  ${table}: ${count}`);
  }

  const uploadResult = await deleteUploads(uploadPaths);
  console.log(`\nSlettet ${uploadResult.ok} filer fra storage-referanser.` +
    (uploadResult.failed ? ` (${uploadResult.failed} feilet)` : ''));

  try {
    const bucketRemoved = await purgeStorageBucket();
    console.log(`Tømte ${bucketRemoved} filer fra Supabase bucket "${BUCKET}".`);
  } catch (err) {
    console.warn('Bucket-tømming feilet:', err.message);
  }

  await printCounts('Etter sletting');
  console.log('\nFerdig – systemet er klart for produksjonsbruk.');
}

main().catch(function (err) {
  console.error('purge-operational-data feilet:', err.message);
  process.exit(1);
});
