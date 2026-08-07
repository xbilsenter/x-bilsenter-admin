'use strict';

const PRODUCTION_SITE_ORIGIN = 'https://xbilsenter.no';

function getSiteOrigin() {
  const raw = String(process.env.PUBLIC_SITE_ORIGIN || '').trim().replace(/\/$/, '');
  if (!raw) {
    return process.env.NODE_ENV === 'production' ? PRODUCTION_SITE_ORIGIN : 'http://localhost:8080';
  }

  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host.endsWith('.vercel.app')) return PRODUCTION_SITE_ORIGIN;
  } catch (_err) {
    return process.env.NODE_ENV === 'production' ? PRODUCTION_SITE_ORIGIN : 'http://localhost:8080';
  }

  return raw;
}

module.exports = { getSiteOrigin, PRODUCTION_SITE_ORIGIN };
