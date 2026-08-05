'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'xbilsenter.db');

if (!process.env.VERCEL) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[db] Kunne ikke opprette lokal data-mappe:', err.message);
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function normalizeBindParams(args) {
  if (!args.length) return undefined;
  if (args.length === 1) return args[0];
  return args;
}

function prepare(sql) {
  const stmt = db.prepare(sql);
  return {
    get: function (...args) {
      const params = normalizeBindParams(args);
      return Promise.resolve(params === undefined ? stmt.get() : stmt.get(...(Array.isArray(params) ? params : [params])));
    },
    all: function (...args) {
      const params = normalizeBindParams(args);
      return Promise.resolve(params === undefined ? stmt.all() : stmt.all(...(Array.isArray(params) ? params : [params])));
    },
    run: function (...args) {
      const params = normalizeBindParams(args);
      return Promise.resolve(params === undefined ? stmt.run() : stmt.run(...(Array.isArray(params) ? params : [params])));
    }
  };
}

function exec(sql) {
  db.exec(sql);
  return Promise.resolve();
}

function transaction(fn) {
  if (fn.constructor.name === 'AsyncFunction') {
    return function (...args) {
      return fn(...args);
    };
  }
  const wrapped = db.transaction(fn);
  return function (...args) {
    return Promise.resolve(wrapped(...args));
  };
}

function getRawDb() {
  return db;
}

module.exports = {
  isPostgres: false,
  prepare,
  exec,
  transaction,
  getRawDb,
  healthCheck: function () {
    return Promise.resolve(prepare('SELECT 1 AS ok').get());
  }
};
