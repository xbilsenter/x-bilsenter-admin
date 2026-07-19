'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const {
  db,
  getMailKontoer,
  getMailKontoById,
  getDefaultMailKonto,
  setMailKontoLastSync,
  countUlestEpost,
  countEpostUtkast
} = require('./db');

function normalizeMessageId(value) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}

function parseEmailList(value) {
  if (!value) return null;
  const list = String(value)
    .split(/[,;]/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  return list.length ? list.join(', ') : null;
}

const ADMIN_PUBLIC_URL = process.env.ADMIN_PUBLIC_URL || process.env.PUBLIC_SITE_ORIGIN || 'http://localhost:8090';

function isHtmlContent(value) {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textToHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
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
  const userRaw = String(html || '').trim();
  const quoteRaw = String(quoteHtml || '').trim();

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
    let sig = String(signatur || '').trim();

    if (!sig) {
      const merged = `${userHtml}${quotePart}`;
      const bodyBlock = merged
        ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">${merged}</div>`
        : '';
      return {
        text: htmlToText(merged),
        html: bodyBlock
      };
    }

    if (isHtmlContent(sig)) {
      sig = absolutizeUploadUrls(sig, baseUrl);
    }
    const sigHtml = isHtmlContent(sig) ? sig : textToHtml(sig);
    const plainSig = isHtmlContent(sig) ? htmlToText(sig) : sig;
    const userBlock = userHtml
      ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">${userHtml}</div>`
      : '';
    const sigBlock = `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#444;margin-top:12px">${sigHtml}</div>`;
    const textParts = [userText, plainSig, quoteText].filter(function (part) {
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
  let sig = String(signatur || '').trim();
  if (!sig) {
    return {
      text: body,
      html: body ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${textToHtml(body)}</div>` : ''
    };
  }

  if (isHtmlContent(sig)) {
    sig = absolutizeUploadUrls(sig, baseUrl);
    const plainSig = htmlToText(sig);
    const fullText = body ? `${body}\n\n${plainSig}` : plainSig;
    const bodyHtml = body
      ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${textToHtml(body)}</div>`
      : '';
    const sigBlock = `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#444;margin-top:12px">${sig}</div>`;
    return { text: fullText, html: bodyHtml ? `${bodyHtml}${sigBlock}` : sigBlock };
  }

  const fullText = body ? `${body}\n\n${sig}` : sig;
  const sigBlock = `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#444;margin-top:12px">${textToHtml(sig)}</div>`;
  const bodyHtml = body
    ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${textToHtml(body)}</div>`
    : '';
  return { text: fullText, html: bodyHtml ? `${bodyHtml}${sigBlock}` : sigBlock };
}

function accountImapReady(konto) {
  return !!(konto && konto.aktiv && konto.imapHost && konto.imapUser && konto.imapPass);
}

function accountSmtpReady(konto) {
  return !!(konto && konto.aktiv && konto.smtpHost && konto.smtpUser && konto.smtpPass);
}

function getMailStatus() {
  const kontoer = getMailKontoer(false);
  const active = kontoer.filter(function (k) { return k.aktiv; });
  const ulest = countUlestEpost();
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
    utkastCount: countEpostUtkast()
  };
}

function resolveSendAccount(kontoId) {
  const konto = kontoId
    ? getMailKontoById(Number(kontoId), true)
    : getDefaultMailKonto(true);

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

function storeOutboundMail(record) {
  const info = db.prepare(`
    INSERT INTO eposter (
      konto_id, message_id, thread_id, in_reply_to, retning,
      fra_navn, fra_epost, til_epost, emne, innhold, innhold_html,
      lest, henvendelse_id, mottatt_dato
    ) VALUES (
      @konto_id, @message_id, @thread_id, @in_reply_to, 'ut',
      @fra_navn, @fra_epost, @til_epost, @emne, @innhold, @innhold_html,
      1, @henvendelse_id, @mottatt_dato
    )
  `).run(record);
  return info.lastInsertRowid;
}

async function syncAccount(konto) {
  if (!accountImapReady(konto)) {
    throw new Error(`IMAP er ikke konfigurert for ${konto.navn}.`);
  }

  const client = new ImapFlow({
    host: konto.imapHost,
    port: Number(konto.imapPort || 993),
    secure: konto.imapSecure !== false,
    auth: {
      user: konto.imapUser,
      pass: konto.imapPass
    },
    logger: false
  });

  const insert = db.prepare(`
    INSERT OR IGNORE INTO eposter (
      konto_id, message_id, thread_id, in_reply_to, retning,
      fra_navn, fra_epost, til_epost, emne, innhold, innhold_html, mottatt_dato
    ) VALUES (
      @konto_id, @message_id, @thread_id, @in_reply_to, 'inn',
      @fra_navn, @fra_epost, @til_epost, @emne, @innhold, @innhold_html, @mottatt_dato
    )
  `);

  let imported = 0;
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const uids = await client.search({ since });
    const fetchUids = uids.slice(-150);

    if (fetchUids.length) {
      for await (const msg of client.fetch(fetchUids, { envelope: true, source: true, uid: true })) {
        const parsed = await simpleParser(msg.source);
        const messageId = normalizeMessageId(parsed.messageId) || `uid-${konto.id}-${msg.uid}@local`;
        const inReplyTo = normalizeMessageId(parsed.inReplyTo);
        const references = String(parsed.references || '').split(/\s+/).map(normalizeMessageId).filter(Boolean);
        const threadId = inReplyTo || references[0] || messageId;
        const from = parsed.from?.value?.[0];
        const to = parsed.to?.value?.[0];

        const info = insert.run({
          konto_id: konto.id,
          message_id: messageId,
          thread_id: threadId,
          in_reply_to: inReplyTo,
          fra_navn: from?.name || '',
          fra_epost: from?.address || '',
          til_epost: to?.address || konto.epost || konto.imapUser || '',
          emne: parsed.subject || '(Uten emne)',
          innhold: parsed.text || '',
          innhold_html: parsed.html || '',
          mottatt_dato: (parsed.date || new Date()).toISOString()
        });

        if (info.changes) imported += 1;
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
  setMailKontoLastSync(konto.id, new Date().toISOString());

  return { kontoId: konto.id, kontoNavn: konto.navn, imported };
}

async function syncInbox(kontoId) {
  const accounts = getMailKontoer(true).filter(function (k) {
    if (!k.aktiv || !accountImapReady(k)) return false;
    if (kontoId) return k.id === Number(kontoId);
    return true;
  });

  if (!accounts.length) {
    throw new Error('Ingen aktive mailkontoer med IMAP er konfigurert. Legg til konto under Innstillinger.');
  }

  const results = [];
  for (const konto of accounts) {
    results.push(await syncAccount(konto));
  }

  const imported = results.reduce(function (sum, item) { return sum + item.imported; }, 0);
  return {
    imported,
    accounts: results,
    total: db.prepare(`
      SELECT COUNT(*) AS c
      FROM eposter e
      INNER JOIN mail_kontoer k ON k.id = e.konto_id
      WHERE e.retning = 'inn'
    `).get().c
  };
}

async function testMailKonto(kontoId) {
  const konto = getMailKontoById(Number(kontoId), true);
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

  const konto = resolveSendAccount(kontoId);
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
      return {
        filename: file.filename || file.originalname || 'vedlegg',
        path: file.path,
        contentType: file.contentType || file.mimetype || undefined
      };
    });
  }

  const info = await transporter.sendMail(mailOptions).catch(function (err) {
    throw new Error(formatSmtpError(err, konto));
  });

  const messageId = normalizeMessageId(info.messageId) || `sent-${Date.now()}@local`;
  const rowId = storeOutboundMail({
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
  });

  return { messageId, rowId, kontoId: konto.id };
}

module.exports = {
  getMailStatus,
  syncInbox,
  syncAccount,
  sendMail,
  testMailKonto,
  normalizeMessageId,
  accountImapReady,
  accountSmtpReady
};
