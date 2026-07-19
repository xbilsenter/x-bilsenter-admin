'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USE_SUPABASE = process.env.USE_SUPABASE === 'true';

let client = null;

function isSupabaseEnabled() {
  return USE_SUPABASE && !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY;
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    throw new Error('Supabase er ikke aktivert. Sett USE_SUPABASE=true og nøkler i .env.');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

module.exports = {
  isSupabaseEnabled,
  getSupabase
};
