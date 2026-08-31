'use strict';

const fs = require('fs');
const path = require('path');
const { openUpload, toUploadPath, uploadPathToKey } = require('./storage');

function guessContentTypeFromName(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  return map[ext] || 'application/octet-stream';
}

function parseDataImageSrc(src) {
  const match = String(src || '').trim().match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  try {
    return {
      buffer: Buffer.from(match[2], 'base64'),
      contentType: match[1],
      filename: 'inline-image.png'
    };
  } catch (_err) {
    return null;
  }
}

function resolveInlineImageRef(src, baseUrl) {
  const raw = String(src || '').trim();
  if (!raw || /^cid:/i.test(raw)) return null;

  if (/^data:image\//i.test(raw)) {
    return { kind: 'data', src: raw };
  }

  if (raw.startsWith('/uploads/') || raw.startsWith('/assets/')) {
    return { kind: raw.startsWith('/uploads/') ? 'upload' : 'asset', path: raw };
  }

  try {
    const url = new URL(raw);
    const uploadMatch = url.pathname.match(/^\/uploads\/(.+)$/i);
    if (uploadMatch) {
      return { kind: 'upload', path: toUploadPath(uploadMatch[1]) };
    }
    const assetMatch = url.pathname.match(/^\/assets\/(.+)$/i);
    if (assetMatch) {
      return { kind: 'asset', path: `/assets/${assetMatch[1]}` };
    }
  } catch (_err) {
    /* not a URL */
  }

  const base = String(baseUrl || '').replace(/\/$/, '');
  if (base && raw.startsWith(`${base}/uploads/`)) {
    return { kind: 'upload', path: raw.slice(base.length) };
  }
  if (base && raw.startsWith(`${base}/assets/`)) {
    return { kind: 'asset', path: raw.slice(base.length) };
  }

  return null;
}

function assetCandidates(rel) {
  return [
    path.join(__dirname, '..', 'client', 'public', 'assets', rel),
    path.join(__dirname, '..', 'client', 'dist', 'assets', rel),
    path.join(__dirname, 'assets', rel)
  ];
}

function readInlineAssetFile(assetPath) {
  const rel = String(assetPath || '').replace(/^\/assets\//, '');
  if (!rel || rel.includes('..')) return null;

  const ext = path.extname(rel).toLowerCase();
  const relBase = ext ? rel.slice(0, -ext.length) : rel;
  const tryNames = ext === '.svg'
    ? [`${relBase}.png`, rel]
    : [rel];

  for (const name of tryNames) {
    for (const abs of assetCandidates(name)) {
      if (!fs.existsSync(abs)) continue;
      const buffer = fs.readFileSync(abs);
      return {
        buffer,
        contentType: guessContentTypeFromName(abs),
        filename: path.basename(abs)
      };
    }
  }

  return null;
}

async function readInlineImage(ref) {
  if (!ref) return null;

  if (ref.kind === 'data') {
    return parseDataImageSrc(ref.src);
  }

  if (ref.kind === 'upload') {
    const file = await openUpload(ref.path);
    if (!file?.buffer) return null;
    return {
      buffer: file.buffer,
      contentType: file.contentType || guessContentTypeFromName(ref.path),
      filename: uploadPathToKey(ref.path) || path.basename(ref.path)
    };
  }

  if (ref.kind === 'asset') {
    return readInlineAssetFile(ref.path);
  }

  return null;
}

function refKey(ref) {
  if (!ref) return '';
  if (ref.kind === 'data') return `data:${ref.src.slice(0, 64)}`;
  return `${ref.kind}:${ref.path}`;
}

async function embedInlineImagesInHtml(html, baseUrl) {
  const htmlStr = String(html || '');
  if (!htmlStr || !/<img\b/i.test(htmlStr)) {
    return { html: htmlStr, attachments: [] };
  }

  const srcRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const refs = new Map();
  let match;

  while ((match = srcRe.exec(htmlStr)) !== null) {
    const resolved = resolveInlineImageRef(match[1], baseUrl);
    if (!resolved) continue;
    const key = refKey(resolved);
    if (!refs.has(key)) refs.set(key, resolved);
  }

  const attachments = [];
  const replacement = new Map();
  let cidIndex = 0;

  for (const [key, ref] of refs.entries()) {
    const file = await readInlineImage(ref);
    if (!file?.buffer) continue;
    if (!/^image\//i.test(file.contentType || '')) continue;

    const cid = `xb-sig-${++cidIndex}@xbilsenter.no`;
    replacement.set(key, cid);
    attachments.push({
      filename: file.filename || `inline-${cidIndex}.png`,
      content: file.buffer,
      contentType: file.contentType,
      contentDisposition: 'inline',
      cid
    });
  }

  if (!attachments.length) {
    return { html: htmlStr, attachments: [] };
  }

  let out = htmlStr.replace(/<img\b([^>]*?\bsrc=["'])([^"']+)(["'][^>]*)>/gi, function (full, prefix, src, suffix) {
    const resolved = resolveInlineImageRef(src, baseUrl);
    if (!resolved) return full;
    const cid = replacement.get(refKey(resolved));
    if (!cid) return full;
    return `<img${prefix}cid:${cid}${suffix}>`;
  });

  return { html: out, attachments };
}

module.exports = {
  resolveInlineImageRef,
  embedInlineImagesInHtml
};
