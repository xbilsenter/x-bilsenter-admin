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

module.exports = {
  accountImapReady,
  accountSmtpReady,
  normalizeMessageId
};
