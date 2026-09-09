'use strict';

const fs = require('fs');
const path = require('path');
const { openUpload, toUploadPath, uploadPathToKey } = require('./storage');

const KNOWN_PUBLIC_ORIGINS = [
  process.env.ADMIN_PUBLIC_URL,
  process.env.VERCEL ? 'https://drift.xbilsenter.no' : null,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
  'http://localhost:8090',
  'http://127.0.0.1:8090'
].filter(Boolean).map(function (origin) {
  return String(origin).replace(/\/$/, '').toLowerCase();
});

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

function extractLocalPath(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (value.startsWith('/uploads/') || value.startsWith('/assets/')) {
    return value.split(/[?#]/)[0];
  }

  const uploadIdx = value.indexOf('/uploads/');
  if (uploadIdx !== -1) {
    return toUploadPath(value.slice(uploadIdx + '/uploads/'.length).split(/[?#]/)[0]);
  }

  const assetIdx = value.indexOf('/assets/');
  if (assetIdx !== -1) {
    return `/assets/${value.slice(assetIdx + '/assets/'.length).split(/[?#]/)[0]}`;
  }

  return null;
}

function resolveInlineImageRef(src, baseUrl) {
  const raw = String(src || '').trim();
  if (!raw || /^cid:/i.test(raw)) return null;

  if (/^data:image\//i.test(raw)) {
    return { kind: 'data', src: raw };
  }

  const localPath = extractLocalPath(raw);
  if (localPath) {
    return {
      kind: localPath.startsWith('/uploads/') ? 'upload' : 'asset',
      path: localPath
    };
  }

  try {
    const url = new URL(raw);
    const origin = `${url.protocol}//${url.host}`.toLowerCase();
    const base = String(baseUrl || '').replace(/\/$/, '').toLowerCase();
    const known = KNOWN_PUBLIC_ORIGINS.includes(origin) || (base && origin === base);
    if (!known) return null;

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
    : ext === '.png'
      ? [rel, `${relBase}.svg`]
      : [rel, `${relBase}.png`, `${relBase}.svg`];

  for (const name of tryNames) {
    for (const abs of assetCandidates(name)) {
      if (!fs.existsSync(abs)) continue;
      const buffer = fs.readFileSync(abs);
      const contentType = guessContentTypeFromName(abs);
      if (contentType === 'image/svg+xml') {
        continue;
      }
      return {
        buffer,
        contentType,
        filename: path.basename(abs)
      };
    }
  }

  return null;
}

async function readInlineImage(ref) {
  if (!ref) return null;

  if (ref.kind === 'data') {
    const parsed = parseDataImageSrc(ref.src);
    if (parsed && parsed.contentType === 'image/svg+xml') return null;
    return parsed;
  }

  if (ref.kind === 'upload') {
    const file = await openUpload(ref.path);
    if (!file?.buffer) {
      console.warn('[mail/inline-image] Fant ikke opplastet bilde:', ref.path);
      return null;
    }
    const contentType = file.contentType || guessContentTypeFromName(ref.path);
    if (contentType === 'image/svg+xml') return null;
    return {
      buffer: file.buffer,
      contentType,
      filename: uploadPathToKey(ref.path) || path.basename(ref.path)
    };
  }

  if (ref.kind === 'asset') {
    const asset = readInlineAssetFile(ref.path);
    if (!asset) {
      console.warn('[mail/inline-image] Fant ikke signatur-asset:', ref.path);
    }
    return asset;
  }

  return null;
}

function refKey(ref) {
  if (!ref) return '';
  if (ref.kind === 'data') return `data:${ref.src.slice(0, 64)}`;
  return `${ref.kind}:${ref.path}`;
}

function countUnembeddedLocalImages(html) {
  const re = /<img\b[^>]*\bsrc=["'](?!cid:)([^"']+)["']/gi;
  let count = 0;
  let match;
  while ((match = re.exec(String(html || ''))) !== null) {
    if (resolveInlineImageRef(match[1], '')) count += 1;
  }
  return count;
}

async function embedInlineImagesInHtml(html, baseUrl) {
  const htmlStr = String(html || '');
  if (!htmlStr || !/<img\b/i.test(htmlStr)) {
    return { html: htmlStr, attachments: [], failed: [] };
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
  const failed = [];
  let cidIndex = 0;

  for (const [key, ref] of refs.entries()) {
    const file = await readInlineImage(ref);
    if (!file?.buffer) {
      failed.push(ref.path || ref.src || key);
      continue;
    }
    if (!/^image\//i.test(file.contentType || '')) {
      failed.push(ref.path || ref.src || key);
      continue;
    }

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

  let out = htmlStr.replace(/<img\b([^>]*?\bsrc=["'])([^"']+)(["'][^>]*)>/gi, function (full, prefix, src, suffix) {
    const resolved = resolveInlineImageRef(src, baseUrl);
    if (!resolved) return full;
    const cid = replacement.get(refKey(resolved));
    if (!cid) return full;
    return `<img${prefix}cid:${cid}${suffix}>`;
  });

  const remaining = countUnembeddedLocalImages(out);
  if (remaining > 0) {
    failed.push(`remaining:${remaining}`);
  }

  return { html: out, attachments, failed };
}

module.exports = {
  resolveInlineImageRef,
  embedInlineImagesInHtml,
  countUnembeddedLocalImages
};
