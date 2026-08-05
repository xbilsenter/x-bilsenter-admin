'use strict';

const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const DEFAULT_SCOPE = 'skatteetaten:omregistreringsavgift';
const DEFAULT_TOKEN_URL = 'https://maskinporten.no/token';
const DEFAULT_API_BASE = 'https://api.skatteetaten.no/api/omregistreringsavgift/v1';

let tokenCache = null;

function normalizeRegNr(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '');
}

function loadPrivateKey() {
  const inline = process.env.MASKINPORTEN_PRIVATE_KEY || process.env.SKATTEETATEN_OMREG_PRIVATE_KEY;
  if (inline) {
    return inline.replace(/\\n/g, '\n');
  }
  const keyPath = process.env.MASKINPORTEN_PRIVATE_KEY_PATH
    || process.env.SKATTEETATEN_OMREG_PRIVATE_KEY_PATH;
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  return null;
}

function getConfig() {
  const clientId = process.env.MASKINPORTEN_CLIENT_ID
    || process.env.SKATTEETATEN_OMREG_CLIENT_ID;
  const privateKey = loadPrivateKey();
  const rettighetspakke = process.env.SKATTEETATEN_OMREG_RETTIGHETSPAKKE;
  const tokenUrl = process.env.MASKINPORTEN_TOKEN_URL || DEFAULT_TOKEN_URL;
  const apiBase = (process.env.SKATTEETATEN_OMREG_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
  const scope = process.env.SKATTEETATEN_OMREG_SCOPE || DEFAULT_SCOPE;
  const keyId = process.env.MASKINPORTEN_KEY_ID || process.env.SKATTEETATEN_OMREG_KEY_ID || undefined;
  const consumerOrg = process.env.SKATTEETATEN_OMREG_CONSUMER_ORG || undefined;
  const audience = tokenUrl.includes('test.maskinporten.no')
    ? 'https://test.maskinporten.no/'
    : 'https://maskinporten.no/';

  return {
    clientId,
    privateKey,
    rettighetspakke,
    tokenUrl,
    apiBase,
    scope,
    keyId,
    consumerOrg,
    audience,
    configured: Boolean(clientId && privateKey && rettighetspakke)
  };
}

function isConfigured() {
  return getConfig().configured;
}

function createLookupError(message, code, statusCode) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function buildAssertion(config) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: config.audience,
    scope: config.scope,
    iss: config.clientId,
    iat: now,
    exp: now + 120,
    jti: crypto.randomUUID()
  };
  if (config.consumerOrg) {
    payload.consumer_org = String(config.consumerOrg).replace(/\D/g, '');
  }

  const signOptions = { algorithm: 'RS256' };
  if (config.keyId) signOptions.keyid = config.keyId;

  return jwt.sign(payload, config.privateKey, signOptions);
}

async function fetchMaskinportenToken(config) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 15000) {
    return tokenCache.accessToken;
  }

  const assertion = buildAssertion(config);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    /* ignore */
  }

  if (!response.ok) {
    const detail = data.error_description || data.error || response.statusText;
    throw createLookupError(
      `Maskinporten-token feilet: ${detail}`,
      response.status === 401 || response.status === 403 ? 'FORBIDDEN' : 'UPSTREAM_ERROR',
      502
    );
  }

  if (!data.access_token) {
    throw createLookupError('Maskinporten returnerte ikke access_token.', 'UPSTREAM_ERROR', 502);
  }

  const expiresIn = Number(data.expires_in) || 600;
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000
  };

  return data.access_token;
}

function parseIsoDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function lookupOmregistreringsavgift(regNrInput, options) {
  const config = getConfig();
  if (!config.configured) {
    throw createLookupError(
      'Skatteetaten omregistreringsavgift er ikke konfigurert (Maskinporten/rettighetspakke).',
      'MISSING_CONFIG',
      400
    );
  }

  const kjennemerke = normalizeRegNr(regNrInput);
  if (kjennemerke.length < 5) {
    throw createLookupError('Ugyldig registreringsnummer.', 'INVALID_REGNR', 400);
  }

  const omregistreringsdato = parseIsoDate(options?.omregistreringsdato);
  const accessToken = await fetchMaskinportenToken(config);

  const url = new URL(`${config.apiBase}/${encodeURIComponent(config.rettighetspakke)}/${encodeURIComponent(kjennemerke)}`);
  if (omregistreringsdato) {
    url.searchParams.set('omregistreringsdato', omregistreringsdato);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Korrelasjonsid: crypto.randomUUID()
    }
  });

  let data = {};
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      /* ignore */
    }
  } else {
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { melding: text };
      }
    }
  }

  if (!response.ok) {
    const code = data.kode || '';
    const message = data.melding || `Skatteetaten svarte med HTTP ${response.status}.`;

    if (response.status === 404 || code === 'OMREGSAVGIFT-007') {
      throw createLookupError(message, 'NOT_FOUND', 404);
    }
    if (response.status === 401 || code === 'OMREGSAVGIFT-004') {
      throw createLookupError(message, 'FORBIDDEN', 403);
    }
    if (response.status === 403 || code === 'OMREGSAVGIFT-005') {
      throw createLookupError(message, 'FORBIDDEN', 403);
    }
    if (response.status === 400 || code === 'OMREGSAVGIFT-006') {
      throw createLookupError(message, 'INVALID_REGNR', 400);
    }

    throw createLookupError(message, 'UPSTREAM_ERROR', 502);
  }

  const belop = Number(data.omregistreringsavgift);
  if (!Number.isFinite(belop)) {
    throw createLookupError('Skatteetaten returnerte ikke et gyldig beløp.', 'UPSTREAM_ERROR', 502);
  }

  return {
    kjennemerke: data.kjennemerke || kjennemerke,
    omregistreringsavgift: Math.round(belop),
    datoOmregistreringsavgift: data.datoOmregistreringsavgift || omregistreringsdato || null
  };
}

module.exports = {
  isConfigured,
  lookupOmregistreringsavgift,
  normalizeRegNr
};
