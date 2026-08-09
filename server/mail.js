'use strict';

const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const {
  accountImapReady,
  accountSmtpReady,
  normalizeMessageId
} = require('./mail-utils');
const { syncAllAccounts, getSentMappeForKonto, startBackgroundMailSync } = require('./mail-sync');
const { saveEpostVedlegg } = require('./mail-folders');
const { saveBuffer, makeFilename } = require('./storage');
const {
  prepare,
  getMailKontoer,
  getMailKontoById,
  getDefaultMailKonto,
  setMailKontoLastSync,
  countUlestEpost,
  countEpostUtkast,
  linkInboundEpostToKunde
} = require('./db');

function parseEmailList(value) {
  if (!value) return null;
  const list = String(value)
    .split(/[,;]/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  return list.length ? list.join(', ') : null;
}

const ADMIN_PUBLIC_URL = process.env.ADMIN_PUBLIC_URL || process.env.PUBLIC_SITE_ORIGIN || 'http://localhost:8090';

const { prepareMailContent } = require('../shared/mail-content');

async function getMailStatus() {
  const kontoer = await getMailKontoer(false);
  const active = kontoer.filter(function (k) { return k.aktiv; });
  const ulest = await countUlestEpost();
  const lastSync = active
    .map(function (k) { return k.lastSync; })
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  return {
    kontoer,
    kontoCount: kontoer.length,
    activeCount: active.length,
    imapConfigured: active.some(function (k) { return k.imapConfigured; }),
    smtpConfigured: active.some(function (k) { return k.smtpConfigured; }),
    lastSync,
    ulest,
    utkastCount: await countEpostUtkast()
  };
}

async function resolveSendAccount(kontoId) {
  const konto = kontoId
    ? await getMailKontoById(Number(kontoId), true)
    : await getDefaultMailKonto(true);

  if (!accountSmtpReady(konto)) {
    throw new Error('Ingen aktiv mailkonto med SMTP er konfigurert.');
  }
  return konto;
}

function normalizeSmtpPort(port) {
  const value = Number(port || 587);
  if (value === 463) return 465;
  return value;
}

function formatSmtpError(err, konto) {
  const host = konto?.smtpHost || 'SMTP-server';
  const port = normalizeSmtpPort(konto?.smtpPort);
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ESOCKET' || err?.code === 'ECONNREFUSED' || err?.code === 'EHOSTUNREACH') {
    return `SMTP-tilkobling feilet (${host}:${port}). Sjekk server, port (465 for SSL eller 587 for STARTTLS) og passord.`;
  }
  if (err?.responseCode === 535 || /auth/i.test(String(err?.message || ''))) {
    return 'SMTP-innlogging feilet. Sjekk brukernavn og passord.';
  }
  if (err?.responseCode === 550 || /invalid recipient|avvist/i.test(String(err?.message || ''))) {
    return 'Mottakeradressen er ugyldig eller ble avvist av e-postserveren.';
  }
  return err?.message || 'Kunne ikke sende e-post.';
}

function createTransporter(konto) {
  const port = normalizeSmtpPort(konto.smtpPort);
  const secure = port === 465 ? true : (port === 587 ? false : !!konto.smtpSecure);
  return nodemailer.createTransport({
    host: konto.smtpHost,
    port,
    secure,
    requireTLS: port === 587,
    auth: {
      user: konto.smtpUser,
      pass: konto.smtpPass
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

function getFromAddress(konto) {
  const name = konto.fromName || 'X Bilsenter AS';
  const addr = konto.epost || konto.smtpUser || '';
  return addr ? `"${name}" <${addr}>` : '';
}

async function storeOutboundMail(record, attachmentRecords) {
  try {
    const sentMappe = await getSentMappeForKonto(record.konto_id);
    const payload = { ...record, mappe_id: sentMappe?.id || null, lest: 1 };
    let rowId = null;

    try {
      const info = await prepare(`
        INSERT INTO eposter (
          konto_id, mappe_id, message_id, thread_id, in_reply_to, retning,
          fra_navn, fra_epost, til_epost, emne, innhold, innhold_html,
          lest, henvendelse_id, mottatt_dato
        ) VALUES (
          @konto_id, @mappe_id, @message_id, @thread_id, @in_reply_to, 'ut',
          @fra_navn, @fra_epost, @til_epost, @emne, @innhold, @innhold_html,
          @lest, @henvendelse_id, @mottatt_dato
        )
      `).run(payload);
      rowId = info.lastInsertRowid || null;
    } catch (err) {
      const duplicate = /unique|duplicate|23505/i.test(String(err?.code || '') + String(err?.message || ''));
      if (!duplicate) throw err;
      const existing = await prepare(`
        SELECT id FROM eposter WHERE konto_id = ? AND message_id = ?
      `).get(record.konto_id, record.message_id);
      rowId = existing?.id || null;
    }

    if (!rowId) {
      console.warn('[mail/storeOutbound] Klarte ikke finne lagret utgående e-post:', record.message_id);
      return null;
    }

    for (const att of attachmentRecords || []) {
      await saveEpostVedlegg(rowId, att);
    }

    return rowId;
  } catch (err) {
    console.error('[mail/storeOutbound]', err.message);
    return null;
  }
}

async function syncInbox(kontoId) {
  return syncAllAccounts(kontoId);
}

async function testMailKonto(kontoId) {
  const konto = await getMailKontoById(Number(kontoId), true);
  if (!konto) throw new Error('Mailkonto ikke funnet.');

  const result = { imap: null, smtp: null };

  if (accountImapReady(konto)) {
    const client = new ImapFlow({
      host: konto.imapHost,
      port: Number(konto.imapPort || 993),
      secure: konto.imapSecure !== false,
      auth: { user: konto.imapUser, pass: konto.imapPass },
      logger: false
    });
    await client.connect();
    await client.logout();
    result.imap = 'OK';
  } else {
    result.imap = 'Mangler IMAP-oppsett';
  }

  if (accountSmtpReady(konto)) {
    const transporter = createTransporter(konto);
    await transporter.verify().catch(function (err) {
      throw new Error(formatSmtpError(err, konto));
    });
    result.smtp = 'OK';
  } else {
    result.smtp = 'Mangler SMTP-oppsett';
  }

  return result;
}

async function sendMail(options) {
  const {
    to,
    toName,
    cc,
    bcc,
    subject,
    text,
    html,
    inReplyTo,
    references,
    henvendelseId,
    kontoId,
    attachments,
    replyQuoteHtml
  } = options;

  const bodyText = String(text || '').trim();
  const bodyHtml = String(html || '').trim();
  if (!to || !subject || (!bodyText && !bodyHtml && !replyQuoteHtml)) {
    throw new Error('Mottaker, emne og melding er påkrevd.');
  }

  const konto = await resolveSendAccount(kontoId);
  const transporter = createTransporter(konto);
  const from = getFromAddress(konto);
  const merged = prepareMailContent(bodyText, bodyHtml, konto.signatur, ADMIN_PUBLIC_URL, replyQuoteHtml);
  const fullText = merged.text;
  const fullHtml = merged.html || undefined;
  const headers = {};
  const replyId = normalizeMessageId(inReplyTo);
  if (replyId) {
    headers['In-Reply-To'] = `<${replyId}>`;
    const refs = (references || []).map(function (r) {
      const id = normalizeMessageId(r);
      return id ? `<${id}>` : '';
    }).filter(Boolean);
    if (refs.length) headers.References = refs.join(' ');
    else headers.References = `<${replyId}>`;
  }

  const mailOptions = {
    from,
    to: toName ? `"${toName}" <${to}>` : to,
    subject,
    text: fullText,
    html: fullHtml || undefined,
    headers
  };
  const ccList = parseEmailList(cc);
  const bccList = parseEmailList(bcc);
  if (ccList) mailOptions.cc = ccList;
  if (bccList) mailOptions.bcc = bccList;
  if (attachments?.length) {
    mailOptions.attachments = attachments.map(function (file) {
      const item = {
        filename: file.filename || file.originalname || 'vedlegg',
        contentType: file.contentType || file.mimetype || undefined
      };
      if (file.content) item.content = file.content;
      else if (file.path) item.path = file.path;
      return item;
    });
  }

  const info = await transporter.sendMail(mailOptions).catch(function (err) {
    throw new Error(formatSmtpError(err, konto));
  });

  const messageId = normalizeMessageId(info.messageId)
    || `sent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@local`;
  const storedAttachments = [];
  for (const file of attachments || []) {
    const content = file.content;
    if (!content || !Buffer.isBuffer(content)) continue;
    const filnavn = file.filename || file.originalname || 'vedlegg';
    const lagringPath = await saveBuffer(makeFilename(filnavn), content, file.contentType || file.mimetype);
    storedAttachments.push({
      filnavn,
      contentType: file.contentType || file.mimetype || 'application/octet-stream',
      sizeBytes: content.length,
      lagringPath,
      contentId: ''
    });
  }

  const rowId = await storeOutboundMail({
    konto_id: konto.id,
    message_id: messageId,
    thread_id: replyId || messageId,
    in_reply_to: replyId || '',
    fra_navn: konto.fromName || 'X Bilsenter AS',
    fra_epost: konto.epost || konto.smtpUser || '',
    til_epost: to,
    emne: subject,
    innhold: fullText,
    innhold_html: fullHtml || '',
    henvendelse_id: henvendelseId || null,
    mottatt_dato: new Date().toISOString()
  }, storedAttachments);

  if (!rowId) {
    console.warn('[mail/send] E-post sendt, men ble ikke lagret i innboks:', messageId);
  }

  return { messageId, rowId, kontoId: konto.id };
}

module.exports = {
  getMailStatus,
  syncInbox,
  syncAllAccounts,
  sendMail,
  testMailKonto,
  normalizeMessageId,
  accountImapReady,
  accountSmtpReady,
  startBackgroundMailSync
};
