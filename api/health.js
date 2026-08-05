'use strict';

module.exports = function healthHandler(_req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    ok: true,
    service: 'x-bilsenter-admin',
    useSupabase: process.env.USE_SUPABASE === 'true',
    databaseConfigured: !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)
  }));
};
