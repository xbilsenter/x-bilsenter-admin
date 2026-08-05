'use strict';

function translateSqliteToPostgres(sql) {
  let out = String(sql);

  out = out.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');
  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  out = out.replace(
    /INSERT\s+OR\s+REPLACE\s+INTO\s+innstillinger/gi,
    'INSERT INTO innstillinger'
  );

  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+innstillinger/i.test(sql)) {
    if (!/ON\s+CONFLICT/i.test(out)) {
      out += ' ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at';
    }
  }

  if (/INSERT\s+OR\s+IGNORE\s+INTO\s+eposter/i.test(sql) && !/ON\s+CONFLICT/i.test(out)) {
    out += ' ON CONFLICT (konto_id, message_id) DO NOTHING';
  } else if (/INSERT\s+OR\s+IGNORE/i.test(sql) && !/ON\s+CONFLICT/i.test(out)) {
    out += ' ON CONFLICT DO NOTHING';
  }

  ['lest', 'aktiv', 'standard', 'is_admin', 'imap_secure', 'smtp_secure', 'flagged', 'slettet', 'sync_enabled'].forEach(function (col) {
    out = out.replace(new RegExp('\\b' + col + '\\s*=\\s*0\\b', 'gi'), col + ' = false');
    out = out.replace(new RegExp('\\b' + col + '\\s*=\\s*1\\b', 'gi'), col + ' = true');
  });

  return out;
}

function positionalFromQuestionMarks(sql) {
  let index = 0;
  return sql.replace(/\?/g, function () {
    index += 1;
    return '$' + index;
  });
}

function expandNamedParams(sql, params) {
  const pgSqlBase = translateSqliteToPostgres(sql);

  if (Array.isArray(params)) {
    return { sql: positionalFromQuestionMarks(pgSqlBase), values: params };
  }

  if (params != null && typeof params !== 'object') {
    return { sql: positionalFromQuestionMarks(pgSqlBase), values: [params] };
  }

  if (!params) {
    return { sql: positionalFromQuestionMarks(pgSqlBase), values: [] };
  }

  const values = [];
  const names = [];
  const pgSql = pgSqlBase.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, function (_match, name) {
    if (!names.includes(name)) names.push(name);
    const idx = names.indexOf(name) + 1;
    return '$' + idx;
  });

  names.forEach(function (name) {
    values.push(normalizeParamValue(name, params[name]));
  });

  return { sql: pgSql, values };
}

const BOOL_PARAM_NAMES = new Set([
  'lest', 'aktiv', 'standard', 'is_admin', 'imap_secure', 'smtp_secure',
  'flagged', 'slettet', 'sync_enabled'
]);

function normalizeParamValue(name, value) {
  if (BOOL_PARAM_NAMES.has(name) && (value === 0 || value === 1 || value === '0' || value === '1')) {
    return !!Number(value);
  }
  return value;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  ['id', 'kunde_id', 'bil_id', 'konto_id', 'henvendelse_id', 'sort_order', 'archived', 'mappe_id', 'imap_uid', 'epost_id', 'parent_id', 'unread_count', 'total_count'].forEach(function (key) {
    if (out[key] != null && out[key] !== '') out[key] = Number(out[key]);
  });
  if (typeof out.lest === 'boolean') out.lest = out.lest ? 1 : 0;
  if (typeof out.aktiv === 'boolean') out.aktiv = out.aktiv ? 1 : 0;
  if (typeof out.standard === 'boolean') out.standard = out.standard ? 1 : 0;
  if (typeof out.is_admin === 'boolean') out.is_admin = out.is_admin ? 1 : 0;
  if (typeof out.imap_secure === 'boolean') out.imap_secure = out.imap_secure ? 1 : 0;
  if (typeof out.smtp_secure === 'boolean') out.smtp_secure = out.smtp_secure ? 1 : 0;
  return out;
}

module.exports = {
  translateSqliteToPostgres,
  positionalFromQuestionMarks,
  expandNamedParams,
  normalizeRow
};
