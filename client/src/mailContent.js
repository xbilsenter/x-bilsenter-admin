import {
  decodeHtmlEntities,
  normalizeOutgoingHtml,
  MAIL_BODY_PARAGRAPH_STYLE,
  MAIL_BODY_TEXT_COLOR,
  prepareSignatureHtmlForSend
} from './mailHtmlNormalize.js';

const MAIL_BODY_WRAP_STYLE = `font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:${MAIL_BODY_TEXT_COLOR}`;
const REPLY_QUOTE_MARKER = 'data-xbilsenter-quote="1"';
const SIGNATURE_DEFAULT_LOGO_PATH = '/assets/logo-mark.svg';
const SIGNATURE_DEFAULT_LOGO_STYLE = 'width:84px;height:84px;object-fit:contain;border-radius:8px;background:#f2f5f2';

function wrapMailBody(html) {
  return html ? `<div style="${MAIL_BODY_WRAP_STYLE}">${html}</div>` : '';
}

function wrapMailSignature(html) {
  return html ? `<div style="margin-top:12px">${html}</div>` : '';
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
  const base = String(baseUrl || window.location.origin).replace(/\/$/, '');
  let out = String(html || '');
  out = out.replace(/src=["'](\/uploads\/[^"']+)["']/gi, function (_m, uploadPath) {
    return `src="${base}${uploadPath}"`;
  });
  out = out.replace(/src=["']https?:\/\/[^"']*(\/uploads\/[^"']+)["']/gi, function (_m, uploadPath) {
    return `src="${base}${uploadPath}"`;
  });
  out = out.replace(/src=["'](\/assets\/[^"']+)["']/gi, function (_m, assetPath) {
    return `src="${base}${assetPath}"`;
  });
  out = out.replace(/src=["']https?:\/\/[^"']*(\/assets\/[^"']+)["']/gi, function (_m, assetPath) {
    return `src="${base}${assetPath}"`;
  });
  return out;
}

function fixSignatureImageSources(html, baseUrl) {
  const base = String(baseUrl || window.location.origin).replace(/\/$/, '');
  const defaultLogo = `${base}${SIGNATURE_DEFAULT_LOGO_PATH}`;
  let out = String(html || '');

  out = out.replace(/<img\b([^>]*?)src=["']\s*["']([^>]*)>/gi, function (full) {
    if (/data-placeholder=["']logo["']/i.test(full) || /alt=["']logo["']/i.test(full)) {
      return `<img src="${defaultLogo}" alt="Logo" data-placeholder="logo" style="${SIGNATURE_DEFAULT_LOGO_STYLE}">`;
    }
    return '';
  });

  return out;
}

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

function prepareSignatureHtml(signatur, baseUrl) {
  const sig = String(signatur || '').trim();
  if (!sig) return { html: '', plain: '' };
  if (isHtmlContent(sig)) {
    const normalized = fixSignatureImageSources(sig, baseUrl);
    const html = prepareSignatureHtmlForSend(absolutizeUploadUrls(normalized, baseUrl));
    return { html: html, plain: htmlToText(html) };
  }
  return { html: textToHtml(sig), plain: sig };
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

export function prepareMailContent(text, html, signatur, baseUrl, quoteHtml) {
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

export function buildOutgoingMailPreviewHtml(options) {
  const opts = options || {};
  const baseUrl = opts.baseUrl || window.location.origin;
  const merged = prepareMailContent(
    opts.text || '',
    opts.html || '',
    opts.signatur || '',
    baseUrl,
    opts.quoteHtml || ''
  );
  return merged.html || '';
}
