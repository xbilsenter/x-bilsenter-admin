'use strict';

function usePostgresDriver() {
  if (process.env.VERCEL) return true;
  if (process.env.USE_SUPABASE !== 'true') return false;
  return !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
}

module.exports = usePostgresDriver() ? require('./postgres') : require('./sqlite');
