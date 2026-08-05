'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { getSupabase, isSupabaseEnabled } = require('./supabase');

const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

if (!process.env.VERCEL && !fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.warn('[storage] Kunne ikke opprette uploads-mappe:', err.message);
  }
}

function isRemoteStorageEnabled() {
  return isSupabaseEnabled() && !!process.env.SUPABASE_STORAGE_BUCKET;
}

function sanitizeFilename(name) {
  return String(name || 'fil').replace(/[^\w.\-]+/g, '_');
}

function makeFilename(originalName) {
  return `${Date.now()}-${sanitizeFilename(originalName)}`;
}

function uploadPathToKey(uploadPath) {
  return path.basename(String(uploadPath || '').replace(/^\/uploads\//, ''));
}

function toUploadPath(filename) {
  return `/uploads/${path.basename(filename)}`;
}

function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain'
  };
  return map[ext] || 'application/octet-stream';
}

async function ensureBucket() {
  if (!isRemoteStorageEnabled()) return false;

  const supabase = getSupabase();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = (buckets || []).some(function (bucket) {
    return bucket.name === BUCKET;
  });

  if (exists) return true;

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024
  });

  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }

  return true;
}

async function saveBuffer(filename, buffer, contentType) {
  const safeName = path.basename(filename);
  const type = contentType || guessContentType(safeName);

  if (isRemoteStorageEnabled()) {
    const supabase = getSupabase();
    const { error } = await supabase.storage.from(BUCKET).upload(safeName, buffer, {
      contentType: type,
      upsert: true
    });
    if (error) throw error;
    return toUploadPath(safeName);
  }

  fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
  return toUploadPath(safeName);
}

async function saveBase64DataUrl(dataUrl, options = {}) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const contentType = match[1];
  const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const filename = options.filename || `${Date.now()}-${options.index || 0}.${ext}`;
  const uploadPath = await saveBuffer(filename, Buffer.from(match[2], 'base64'), contentType);

  return {
    name: options.name || filename,
    path: uploadPath,
    type: contentType
  };
}

async function persistMulterFile(file) {
  if (!file) return null;

  const filename = file.filename || makeFilename(file.originalname);

  if (!isRemoteStorageEnabled()) {
    const diskName = file.filename || path.basename(file.path || filename);
    const abs = file.path || path.join(UPLOADS_DIR, diskName);
    if (fs.existsSync(abs)) {
      return {
        filename: path.basename(abs),
        originalname: file.originalname || diskName,
        size: file.size || fs.statSync(abs).size,
        mimetype: file.mimetype || guessContentType(diskName),
        path: toUploadPath(path.basename(abs))
      };
    }
  }

  const buffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
  if (!buffer) return null;

  const uploadPath = await saveBuffer(filename, buffer, file.mimetype || guessContentType(filename));

  if (file.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch (_err) {
      /* ignore */
    }
  }

  return {
    filename: path.basename(uploadPath),
    originalname: file.originalname || filename,
    size: file.size || buffer.length,
    mimetype: file.mimetype || guessContentType(filename),
    path: uploadPath
  };
}

async function deleteUpload(uploadPath) {
  const key = uploadPathToKey(uploadPath);
  if (!key) return;

  if (isRemoteStorageEnabled()) {
    const supabase = getSupabase();
    const { error } = await supabase.storage.from(BUCKET).remove([key]);
    if (error) throw error;
    return;
  }

  const abs = path.join(UPLOADS_DIR, key);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}

async function openUpload(uploadPath) {
  const key = uploadPathToKey(uploadPath);
  if (!key) return null;

  if (isRemoteStorageEnabled()) {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error || !data) return null;

    const buffer = Buffer.from(await data.arrayBuffer());
    return {
      buffer,
      stream: Readable.from(buffer),
      contentType: data.type || guessContentType(key),
      size: buffer.length
    };
  }

  const abs = path.join(UPLOADS_DIR, key);
  if (!fs.existsSync(abs)) return null;

  return {
    buffer: fs.readFileSync(abs),
    stream: fs.createReadStream(abs),
    contentType: guessContentType(key),
    size: fs.statSync(abs).size
  };
}

async function uploadLocalFile(absPath, filename) {
  const buffer = fs.readFileSync(absPath);
  return saveBuffer(filename || path.basename(absPath), buffer, guessContentType(absPath));
}

module.exports = {
  UPLOADS_DIR,
  BUCKET,
  isRemoteStorageEnabled,
  ensureBucket,
  sanitizeFilename,
  makeFilename,
  toUploadPath,
  uploadPathToKey,
  saveBuffer,
  saveBase64DataUrl,
  persistMulterFile,
  deleteUpload,
  openUpload,
  uploadLocalFile
};
