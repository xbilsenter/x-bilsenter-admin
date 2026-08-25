'use strict';

const { prepare } = require('./db');

/** Tabeller som synkes til klienten – hardkodet for sikker SQL. */
const SYNC_SOURCES = [
  { table: 'biler', timeCol: 'updated_at' },
  { table: 'henvendelser', timeCol: 'updated_at' },
  { table: 'innbytte', timeCol: 'updated_at' },
  { table: 'selg_bil', timeCol: 'updated_at' },
  { table: 'kalender', timeCol: 'created_at' },
  { table: 'kunder', timeCol: 'updated_at' },
  { table: 'eposter', timeCol: 'created_at' }
];

async function getSyncRevision() {
  const parts = await Promise.all(SYNC_SOURCES.map(async function (src) {
    const row = await prepare(
      `SELECT COUNT(*) AS c, MAX(${src.timeCol}) AS t FROM ${src.table}`
    ).get();
    const count = Number(row?.c ?? 0);
    const ts = row?.t != null ? String(row.t) : '';
    return `${src.table}:${count}:${ts}`;
  }));
  return { revision: parts.join('|') };
}

module.exports = { getSyncRevision };
