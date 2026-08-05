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

const {
  decodeHtmlEntities,
  normalizeOutgoingHtml,
  MAIL_BODY_PARAGRAPH_STYLE,
  MAIL_BODY_TEXT_COLOR,
  prepareSignatureHtmlForSend
} = require('../shared/mail-html-normalize');

const MAIL_BODY_WRAP_STYLE = `font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:${MAIL_BODY_TEXT_COLOR}`;

function wrapMailBody(html) {
  return html ? `<div style="${MAIL_BODY_WRAP_STYLE}">${html}</div>` : '';
}

function wrapMailSignature(html) {
  return html ? `<div style="margin-top:12px">${html}</div>` : '';
}

function prepareSignatureHtml(signatur, baseUrl) {
  const sig = String(signatur || '').trim();
  if (!sig) return { html: '', plain: '' };
  if (isHtmlContent(sig)) {
    const html = prepareSignatureHtmlForSend(absolutizeUploadUrls(sig, baseUrl));
    return { html: html, plain: htmlToText(html) };
  }
  return { html: textToHtml(sig), plain: sig };
}

function isHtmlContent(value) {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

function htmlToText(html) {
  let out = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  out = decodeHtmlEntities(out);
  out = out.split('\n').map(function (line) {
    return line.replace(/[ \t]+/g, ' ').trim();
  }).join('\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split(/\n{2,}/).filter(function (p) { return p.trim(); });
  if (!paragraphs.length) return '';
  return paragraphs.map(function (para) {
    return `<p style="${MAIL_BODY_PARAGRAPH_STYLE};color:${MAIL_BODY_TEXT_COLOR}">${para.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function absolutizeUploadUrls(html, baseUrl) {
  const base = String(baseUrl || ADMIN_PUBLIC_URL).replace(/\/$/, '');
  return String(html || '').replace(/src=["'](\/uploads\/[^"']+)["']/gi, function (_m, path) {
    return `src="${base}${path}"`;
  });
}

const REPLY_QUOTE_MARKER = 'data-xbilsenter-quote="1"';

function findReplyQuoteStart(html) {
  const str = String(html || '');
  const idx = str.indexOf(REPLY_QUOTE_MARKER);
  if (idx === -1) return -1;
  const start = str.lastIndexOf('<div', idx);
  return start > -1 ? start : idx;
}

function splitReplyQuoteHtml(html) {
  const start = findReplyQuoteStart(html);
  if (start === -1) {
    return { userHtml: html || '', quoteHtml: '' };
  }
  return {
    userHtml: String(html).slice(0, start),
    quoteHtml: String(html).slice(start)
  };
}

function prepareMailContent(text, html, signatur, baseUrl, quoteHtml) {
  const userRaw = normalizeOutgoingHtml(String(html || '').trim());
  const quoteRaw = normalizeOutgoingHtml(String(quoteHtml || '').trim());

  if (userRaw || quoteRaw) {
    let userHtml = absolutizeUploadUrls(userRaw, baseUrl);
    let quotePart = quoteRaw ? absolutizeUploadUrls(quoteRaw, baseUrl) : '';

    if (!quotePart) {
      const split = splitReplyQuoteHtml(userHtml);
      userHtml = split.userHtml;
      quotePart = split.quoteHtml;
    }

    const userText = htmlToText(userHtml);
    const quoteText = quotePart ? htmlToText(quotePart) : '';
    const preparedSig = prepareSignatureHtml(signatur, baseUrl);

    if (!preparedSig.html) {
      const merged = `${userHtml}${quotePart}`;
      return {
        text: htmlToText(merged),
        html: wrapMailBody(merged)
      };
    }

    const userBlock = wrapMailBody(userHtml);
    const sigBlock = wrapMailSignature(preparedSig.html);
    const textParts = [userText, preparedSig.plain, quoteText].filter(function (part) {
      return part && part.trim();
    });

    return {
      text: textParts.join('\n\n'),
      html: `${userBlock}${sigBlock}${quotePart}`
    };
  }

  return appendSignature(text, signatur, baseUrl);
}

function appendSignature(text, signatur, baseUrl) {
  const body = String(text || '').trimEnd();
  const preparedSig = prepareSignatureHtml(signatur, baseUrl);

  if (!preparedSig.html) {
    return {
      text: body,
      html: wrapMailBody(textToHtml(body))
    };
  }

  const fullText = body ? `${body}\n\n${preparedSig.plain}` : preparedSig.plain;
  const bodyHtml = wrapMailBody(textToHtml(body));
  const sigBlock = wrapMailSignature(preparedSig.html);
  return { text: fullText, html: bodyHtml ? `${bodyHtml}${sigBlock}` : sigBlock };
}

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
  const sentMappe = await getSentMappeForKonto(record.konto_id);
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
  `).run({ ...record, mappe_id: sentMappe?.id || null, lest: 1 });
  const rowId = info.lastInsertRowid;

  for (const att of attachmentRecords || []) {
    await saveEpostVedlegg(rowId, att);
  }

  return rowId;
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

  const messageId = normalizeMessageId(info.messageId) || `sent-${Date.now()}@local`;
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
    in_reply_to: replyId,
    fra_navn: konto.fromName || 'X Bilsenter AS',
    fra_epost: konto.epost || konto.smtpUser || '',
    til_epost: to,
    emne: subject,
    innhold: fullText,
    innhold_html: fullHtml || '',
    henvendelse_id: henvendelseId || null,
    mottatt_dato: new Date().toISOString()
  }, storedAttachments);

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
