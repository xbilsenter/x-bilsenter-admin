'use strict';

const crypto = require('crypto');

const PREVIEW_COOKIE = 'xb_site_preview';
const PREVIEW_TTL_MS = 12 * 60 * 60 * 1000;

function getPreviewSecret() {
  return process.env.INGEST_SECRET || '';
}

function createPreviewToken(userId) {
  const secret = getPreviewSecret();
  if (!secret) {
    throw new Error('INGEST_SECRET mangler');
  }

  const exp = Date.now() + PREVIEW_TTL_MS;
  const uid = String(userId || 'admin');
  const payload = `${exp}:${uid}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');

  return `${payload}:${sig}`;
}

function verifyPreviewToken(token) {
  const secret = getPreviewSecret();
  if (!secret || !token) return false;

  const parts = String(token).split(':');
  if (parts.length !== 3) return false;

  const exp = Number(parts[0]);
  const uid = parts[1];
  const sig = parts[2];
  if (!Number.isFinite(exp) || !uid || !sig) return false;
  if (Date.now() > exp) return false;

  const payload = `${exp}:${uid}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  PREVIEW_COOKIE,
  PREVIEW_TTL_MS,
  createPreviewToken,
  verifyPreviewToken
};
