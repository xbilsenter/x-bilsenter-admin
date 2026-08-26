#!/usr/bin/env node
'use strict';

/**
 * Gjenopprett kunder-tabellen fra Supabase backup (pg_dump custom format).
 *
 * 1. Supabase Dashboard → Project → Database → Backups
 * 2. Last ned backup fra FØR slettingen (16. aug 2026, før ~13:56)
 * 3. Kjør:
 *    node scripts/restore-kunder-from-backup.js /sti/til/backup.dump
 *    node scripts/restore-kunder-from-backup.js /sti/til/backup.dump --confirm
 *    node scripts/restore-kunder-from-backup.js /sti/til/backup.sql --only-manuell --confirm
 *
 * Alternativ (kun Manuell-kilde fra backup SQL):
 *    node scripts/restore-kunder-from-backup.js /sti/til/backup.sql --confirm
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'server', 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') });

const backupPath = process.argv[2];
const confirm = process.argv.includes('--confirm');
const onlyManuell = process.argv.includes('--only-manuell');
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!backupPath) {
  console.error('Bruk: node scripts/restore-kunder-from-backup.js <backup-fil> [--confirm]');
  process.exit(1);
}

if (!fs.existsSync(backupPath)) {
  console.error('Fil finnes ikke:', backupPath);
  process.exit(1);
}

if (!dbUrl) {
  console.error('Mangler DATABASE_URL i .env');
  process.exit(1);
}

const isSql = backupPath.endsWith('.sql');
const isDump = backupPath.endsWith('.dump') || backupPath.endsWith('.backup');

console.log('Backup:', backupPath);
console.log('Mål:', dbUrl.replace(/:[^:@]+@/, ':***@'));

if (!confirm) {
  console.log('\nKjør med --confirm for å gjenopprette kunder-tabellen.');
  console.log('Tips: Supabase Dashboard → Database → Backups → velg tidspunkt før sletting.');
  process.exit(0);
}

try {
  if (isDump) {
    const args = [
      '--data-only',
      '--table=kunder',
      '--no-owner',
      '--no-acl',
      '-d', dbUrl,
      backupPath
    ];
    execFileSync('pg_restore', args, { stdio: 'inherit' });
    if (onlyManuell) {
      execFileSync('psql', [
        dbUrl, '-v', 'ON_ERROR_STOP=1', '-c',
        "DELETE FROM kunder WHERE trim(kilde) = 'E-post';"
      ], { stdio: 'inherit' });
    }
  } else if (isSql) {
    const sql = fs.readFileSync(backupPath, 'utf8');
    const rows = [];
    const re = /INSERT INTO (?:public\.)?kunder[^;]+;/gi;
    let match;
    while ((match = re.exec(sql))) {
      const stmt = match[0];
      if (onlyManuell && /'E-post'|"E-post"/i.test(stmt)) continue;
      rows.push(stmt);
    }
    if (!rows.length) {
      console.error('Fant ingen INSERT INTO kunder i SQL-filen.');
      process.exit(1);
    }
    const tmp = path.join(ROOT, '.tmp', 'kunder-restore.sql');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, rows.join('\n'));
    execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', tmp], { stdio: 'inherit' });
  } else {
    console.error('Støtter .dump/.backup (pg_restore) eller .sql med INSERT INTO kunder');
    process.exit(1);
  }
  console.log('\nKunder gjenopprettet. Sjekk i driftssystemet under Kunder.');
} catch (err) {
  console.error('Gjenoppretting feilet:', err.message);
  process.exit(1);
}
