'use strict';

function normalizeEnvValue(value) {
  if (value == null) return '';
  let text = String(value).trim();
  if (
    (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function extractSupabaseRef(supabaseUrl) {
  const match = String(supabaseUrl || '').match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return match ? match[1] : '';
}

function encodePassword(password) {
  return encodeURIComponent(String(password || ''));
}

function tryParseUrl(connectionString) {
  try {
    const parsed = new URL(connectionString);
    if (!parsed.hostname) return null;
    if (!/^postgres(ql)?:$/i.test(parsed.protocol)) return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

function buildPoolerUrl(ref, password, region, port) {
  const safeRef = normalizeEnvValue(ref);
  const safePassword = encodePassword(password);
  const safeRegion = normalizeEnvValue(region) || 'eu-west-1';
  const safePort = normalizeEnvValue(port) || '6543';
  if (!safeRef || !password) return '';
  return `postgresql://postgres.${safeRef}:${safePassword}@aws-0-${safeRegion}.pooler.supabase.com:${safePort}/postgres`;
}

function resolveConnectionString() {
  const direct = normalizeEnvValue(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
  if (direct && tryParseUrl(direct)) return direct;

  const ref = normalizeEnvValue(process.env.SUPABASE_PROJECT_REF)
    || extractSupabaseRef(process.env.SUPABASE_URL);
  const password = normalizeEnvValue(
    process.env.SUPABASE_DB_PASSWORD
    || process.env.DATABASE_PASSWORD
    || process.env.POSTGRES_PASSWORD
  );
  const region = normalizeEnvValue(process.env.SUPABASE_DB_REGION);
  const port = normalizeEnvValue(process.env.SUPABASE_DB_PORT);

  if (ref && password) {
    const built = buildPoolerUrl(ref, password, region, port);
    if (built && tryParseUrl(built)) return built;
  }

  if (direct) {
    const refFromUser = normalizeEnvValue(process.env.SUPABASE_DB_USER)?.replace(/^postgres\./, '') || ref;
    if (refFromUser && password && !tryParseUrl(direct)) {
      const host = normalizeEnvValue(process.env.SUPABASE_DB_HOST);
      if (host) {
        const user = normalizeEnvValue(process.env.SUPABASE_DB_USER) || `postgres.${refFromUser}`;
        const dbName = normalizeEnvValue(process.env.SUPABASE_DB_NAME) || 'postgres';
        const safePort = port || '6543';
        const rebuilt = `postgresql://${encodeURIComponent(user)}:${encodePassword(password)}@${host}:${safePort}/${dbName}`;
        if (tryParseUrl(rebuilt)) return rebuilt;
      }
      const rebuilt = buildPoolerUrl(refFromUser, password, region, port);
      if (rebuilt && tryParseUrl(rebuilt)) return rebuilt;
    }
  }

  return direct;
}

function resolvePoolConfig() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      'Mangler DATABASE_URL (eller SUPABASE_DB_URL). Hent connection string fra Supabase → Settings → Database.'
    );
  }

  const parsed = tryParseUrl(connectionString);
  if (!parsed) {
    throw new Error(
      'DATABASE_URL er ugyldig. Bruk Supabase Transaction pooler (port 6543) eller sett SUPABASE_DB_PASSWORD + SUPABASE_URL.'
    );
  }

  if (parsed.password && /[[\]{}]/.test(parsed.password)) {
    throw new Error(
      'DATABASE_URL ser ut til å inneholde plassholder ([passord]). Lim inn ekte passord fra Supabase.'
    );
  }

  const useSsl = !/localhost|127\.0\.0\.1/i.test(parsed.hostname);
  return {
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  };
}

module.exports = {
  normalizeEnvValue,
  resolveConnectionString,
  resolvePoolConfig,
  tryParseUrl
};
