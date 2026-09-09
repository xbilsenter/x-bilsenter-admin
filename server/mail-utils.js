'use strict';

function accountImapReady(konto) {
  return !!(konto && konto.aktiv && konto.imapHost && konto.imapUser && konto.imapPass);
}

function accountSmtpReady(konto) {
  return !!(konto && konto.aktiv && konto.smtpHost && konto.smtpUser && konto.smtpPass);
}

function normalizeMessageId(value) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}

function normalizeRecipientEmail(value) {
  let email = String(value || '').trim().toLowerCase();
  const angle = email.match(/<([^>]+)>/);
  if (angle) email = angle[1].trim();
  return email;
}

function isValidEmail(value) {
  const email = normalizeRecipientEmail(value);
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

module.exports = {
  accountImapReady,
  accountSmtpReady,
  normalizeMessageId,
  normalizeRecipientEmail,
  isValidEmail
};
