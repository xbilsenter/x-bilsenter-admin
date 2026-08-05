const MAIL_BODY_PARAGRAPH_STYLE = 'margin:0 0 1em';
const MAIL_BODY_TEXT_COLOR = '#000000';
const SIGNATURE_DEFAULT_LINK_COLOR = '#19BA60';
const SIGNATURE_DEFAULT_TEXT_COLOR = '#000000';

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8203;/g, '')
    .replace(/\u200B/g, '');
}

function stripHtmlToPlain(html) {
  return decodeHtmlEntities(String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ''));
}

function isEmptyHtmlBlock(html) {
  return !stripHtmlToPlain(html).replace(/\s+/g, '').length;
}

function isProtectedHtmlBlock(attrs, full) {
  return /data-xbilsenter-quote|mail-reply-quote/i.test(String(attrs || '') + String(full || ''));
}

function removeEmptyHtmlBlocks(html) {
  let out = String(html || '');
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/<(p|div|h[1-6]|li|blockquote|span)(\s[^>]*)?>\s*(?:<br\s*\/?>\s*)*<\/\1>/gi, '')
      .replace(/<(p|div)(\s[^>]*)?>\s*&nbsp;\s*<\/\1>/gi, '');
  }
  return out;
}

function cleanTypographyStyle(style) {
  return String(style || '')
    .replace(/(?:font-family|font-size|line-height|margin-bottom|margin-top|margin)\s*:\s*[^;"]+;?\s*/gi, '')
    .replace(/;\s*;/g, ';')
    .replace(/^;|;$/g, '')
    .trim();
}

function stripInlineTypography(html) {
  let out = String(html || '')
    .replace(/<font\b[^>]*>/gi, '')
    .replace(/<\/font>/gi, '');

  out = out.replace(/\sstyle="([^"]*)"/gi, function (_m, style) {
    const s = cleanTypographyStyle(style);
    return s ? ` style="${s}"` : '';
  });

  out = out.replace(/<span(?![^>]*\b(?:style|class)=)[^>]*>([\s\S]*?)<\/span>/gi, '$1');
  out = out.replace(/<h[1-6]\b[^>]*>/gi, `<p style="${MAIL_BODY_PARAGRAPH_STYLE};color:${MAIL_BODY_TEXT_COLOR}">`);
  out = out.replace(/<\/h[1-6]>/gi, '</p>');

  return out;
}

function convertLeafDivsToParagraphs(html) {
  let out = String(html || '');
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/<div(\s[^>]*)?>([\s\S]*?)<\/div>/gi, function (full, attrs, inner) {
      if (isProtectedHtmlBlock(attrs, full)) return full;
      if (/<div[\s>]/i.test(inner)) return full;
      if (/<(?:p|ul|ol|table|blockquote|h[1-6])\b/i.test(inner)) return inner.trim();
      if (isEmptyHtmlBlock(full)) return '';
      const content = inner.trim();
      if (!content) return '';
      return `<p style="${MAIL_BODY_PARAGRAPH_STYLE};color:${MAIL_BODY_TEXT_COLOR}">${content}</p>`;
    });
  }
  return out;
}

function normalizeParagraphTags(html) {
  return String(html || '').replace(/<p(\s[^>]*)?>/gi, function (_m, attrs) {
    const styleMatch = String(attrs || '').match(/style="([^"]*)"/i);
    let style = styleMatch ? cleanTypographyStyle(styleMatch[1]) : '';
    if (style && !/;\s*$/.test(style)) style += ';';
    if (!/color\s*:/i.test(style)) style += `color:${MAIL_BODY_TEXT_COLOR};`;
    return `<p style="${style}${MAIL_BODY_PARAGRAPH_STYLE}">`;
  });
}

export function normalizeOutgoingHtml(html, options) {
  const forSignature = !!(options && options.signature);
  let out = String(html || '').trim();
  if (!out) return '';

  out = out.replace(/\u200B/g, '').replace(/&#8203;/g, '');
  out = removeEmptyHtmlBlocks(out);
  out = out.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  out = out.replace(/(?:<(p|div)(?:\s[^>]*)?>\s*<br\s*\/?>\s*<\/\1>\s*)+/gi, '');

  if (!forSignature) {
    out = stripInlineTypography(out);
    out = convertLeafDivsToParagraphs(out);
    out = normalizeParagraphTags(out);
    out = removeEmptyHtmlBlocks(out);
  }

  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out
      .replace(/^(\s|<br\s*\/?>)+/gi, '')
      .replace(/(\s|<br\s*\/?>)+$/gi, '')
      .replace(/^<(?:p|div)(?:\s[^>]*)?>[\s\S]*?<\/(?:p|div)>\s*/i, function (block) {
        return isEmptyHtmlBlock(block) ? '' : block;
      })
      .replace(/\s*<(?:p|div)(?:\s[^>]*)?>[\s\S]*?<\/(?:p|div)>\s*$/i, function (block) {
        return isEmptyHtmlBlock(block) ? '' : block;
      });
  }

  return out.trim();
}

function findEnclosingColor(html, anchorIndex) {
  const chunk = html.slice(Math.max(0, anchorIndex - 1200), anchorIndex);
  const matches = chunk.match(/style="[^"]*color\s*:\s*[^;"]+/gi);
  if (!matches || !matches.length) return '';
  const last = matches[matches.length - 1];
  const m = last.match(/color\s*:\s*([^;"]+)/i);
  return m ? m[1].trim() : '';
}

function elementHasColor(attrs) {
  return /style="[^"]*color\s*:/i.test(String(attrs || '')) || /\scolor="/i.test(String(attrs || ''));
}

function mergeTextColor(attrs, color) {
  if (elementHasColor(attrs)) return attrs || '';
  const styleMatch = String(attrs || '').match(/style="([^"]*)"/i);
  if (styleMatch) {
    let style = styleMatch[1].trim();
    if (style && !/;\s*$/.test(style)) style += ';';
    return String(attrs).replace(/style="[^"]*"/i, `style="${style}color:${color}"`);
  }
  return `${attrs || ''} style="color:${color}"`;
}

function mergeLinkStyle(attrs, color) {
  const styleMatch = String(attrs || '').match(/style="([^"]*)"/i);
  if (styleMatch) {
    let style = styleMatch[1].trim();
    if (!/color\s*:/i.test(style)) style = `color:${color};${style}`;
    if (!/text-decoration\s*:/i.test(style)) style = `${style};text-decoration:none`;
    style = style.replace(/;\s*;/g, ';').replace(/^;|;$/g, '');
    return String(attrs).replace(/style="[^"]*"/i, `style="${style}"`);
  }
  return `${attrs} style="color:${color};text-decoration:none"`;
}

function applySignatureLinkColors(html) {
  const out = String(html || '');
  if (!/<a\b/i.test(out)) return out;

  let result = '';
  let lastIndex = 0;
  const re = /<a(\s[^>]*)>/gi;
  let match;
  while ((match = re.exec(out)) !== null) {
    result += out.slice(lastIndex, match.index);
    const attrs = match[1] || '';
    if (/style="[^"]*color\s*:/i.test(attrs) || /\scolor="/i.test(attrs)) {
      result += match[0];
    } else {
      const color = findEnclosingColor(out, match.index) || SIGNATURE_DEFAULT_LINK_COLOR;
      result += `<a${mergeLinkStyle(attrs, color)}>`;
    }
    lastIndex = match.index + match[0].length;
  }
  result += out.slice(lastIndex);
  return result;
}

function unwrapAnchorsContainingBlocks(html) {
  let out = String(html || '');
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/<a(\s[^>]*)>([\s\S]*?)<\/a>/gi, function (full, attrs, inner) {
      if (/<(?:p|div|table|ul|ol|h[1-6]|tr|td)\b/i.test(inner)) return inner;
      return full;
    });
  }
  return out;
}

function repairUnclosedAnchors(html) {
  let out = String(html || '').replace(/(<a\b[^>]*>)([\s\S]*?)(?=<(?:p|div|table|ul|ol|h[1-6]|tr|td)\b)/gi, function (_full, open, inner) {
    if (/<\/a>/i.test(inner)) return open + inner;
    return `${open}${inner}</a>`;
  });
  const opens = (out.match(/<a\b/gi) || []).length;
  const closes = (out.match(/<\/a>/gi) || []).length;
  if (opens > closes) out += '</a>'.repeat(opens - closes);
  return out;
}

function ensureSignatureBlockColors(html) {
  let out = String(html || '');
  ['div', 'p', 'td', 'li', 'span', 'strong', 'em'].forEach(function (tag) {
    const re = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
    out = out.replace(re, function (match, attrs) {
      if (elementHasColor(attrs)) return match;
      return `<${tag}${mergeTextColor(attrs || '', SIGNATURE_DEFAULT_TEXT_COLOR)}>`;
    });
  });
  return out;
}

export function prepareSignatureHtmlForSend(html) {
  let out = String(html || '').trim();
  if (!out) return out;
  out = repairUnclosedAnchors(out);
  out = unwrapAnchorsContainingBlocks(out);
  out = applySignatureLinkColors(out);
  out = ensureSignatureBlockColors(out);
  return out;
}
