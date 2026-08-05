'use strict';

function usePostgresBackend() {
  if (process.env.USE_SUPABASE !== 'true') return false;
  return !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL);
}

module.exports = usePostgresBackend() ? require('./db-pg') : require('./db-sqlite');
