'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const { Pool } = require('pg');
const { expandNamedParams, normalizeRow } = require('./sql');

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '';
const txStorage = new AsyncLocalStorage();

const TRANSIENT_PG_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EADDRNOTAVAIL',
  'EPIPE',
  '08006',
  '08001',
  '08003',
  '08004',
  '57P01',
  '53300'
]);

let pool = null;

function isTransientDbError(err) {
  if (!err) return false;
  if (TRANSIENT_PG_CODES.has(err.code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return /timeout|econnreset|enotfound|eaddrnotavail|connection terminated|socket hang up|broken pipe|connection reset/.test(msg);
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function withDbRetry(fn, attempts) {
  const maxAttempts = attempts || Number(process.env.DB_RETRY_ATTEMPTS || 3);
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || attempt >= maxAttempts - 1) throw err;
      const delay = Math.min(2000, 250 * Math.pow(2, attempt));
      console.warn('[postgres] Midlertidig DB-feil – prøver igjen (' + (attempt + 2) + '/' + maxAttempts + '):', err.message);
      await sleep(delay);
    }
  }

  throw lastErr;
}

function attachPoolErrorHandler(activePool) {
  activePool.on('error', function (err) {
    console.error('[postgres] Idle-tilkobling feilet (serveren fortsetter):', err.message || err);
  });
}

function getPool() {
  if (!DATABASE_URL) {
    throw new Error(
      'Mangler DATABASE_URL (eller SUPABASE_DB_URL). Hent connection string fra Supabase → Settings → Database.'
    );
  }
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    });
    attachPoolErrorHandler(pool);
    pool.query('SELECT 1').catch(function (err) {
      console.warn('[postgres] Oppstartstest mot database feilet:', err.message);
    });
  }
  return pool;
}

function queryClient() {
  return txStorage.getStore() || getPool();
}

function returningClause(pgSql) {
  if (/\bINTO\s+innstillinger\b/i.test(pgSql)) return ' RETURNING key';
  if (/\bINTO\s+bil_kunder\b/i.test(pgSql)) return '';
  return ' RETURNING id';
}

function normalizeBindParams(args) {
  if (!args.length) return undefined;
  if (args.length === 1) return args[0];
  return args;
}

function prepare(sql) {
  return {
    get: async function (...args) {
      return withDbRetry(async function () {
        const { sql: pgSql, values } = expandNamedParams(sql, normalizeBindParams(args));
        const result = await queryClient().query(pgSql, values);
        return normalizeRow(result.rows[0]);
      });
    },
    all: async function (...args) {
      return withDbRetry(async function () {
        const { sql: pgSql, values } = expandNamedParams(sql, normalizeBindParams(args));
        const result = await queryClient().query(pgSql, values);
        return result.rows.map(normalizeRow);
      });
    },
    run: async function (...args) {
      return withDbRetry(async function () {
        let { sql: pgSql, values } = expandNamedParams(sql, normalizeBindParams(args));
        const isInsert = /^\s*INSERT\s+/i.test(pgSql.trim());
        if (isInsert && !/RETURNING/i.test(pgSql)) {
          const returning = returningClause(pgSql);
          if (returning) pgSql += returning;
        }
        const result = await queryClient().query(pgSql, values);
        const row = result.rows[0];
        return {
          changes: result.rowCount,
          lastInsertRowid: row?.id ?? row?.key ?? null
        };
      });
    }
  };
}

async function exec(sql) {
  return withDbRetry(async function () {
    await queryClient().query(sql);
  });
}

function transaction(fn) {
  return async function (...args) {
    return withDbRetry(async function () {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await txStorage.run(client, async function () {
          return fn(...args);
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (_rollbackErr) {
          /* ignore */
        }
        throw err;
      } finally {
        client.release(true);
      }
    });
  };
}

function getRawDb() {
  return null;
}

module.exports = {
  isPostgres: true,
  prepare,
  exec,
  transaction,
  getRawDb,
  isTransientDbError,
  healthCheck: async function () {
    return prepare('SELECT 1 AS ok').get();
  }
};
