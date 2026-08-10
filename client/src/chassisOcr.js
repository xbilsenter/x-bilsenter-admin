export function normalizeChassisInput(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '');
}

function fixOcrChar(ch) {
  if (ch === 'O' || ch === 'Q') return '0';
  if (ch === 'I') return '1';
  return ch;
}

function isChassisChar(ch, index) {
  if (!ch || !/[A-Z0-9]/.test(ch)) return false;
  if (index === 8 && ch === '0') return false;
  if (/[IOQ]/.test(ch)) return false;
  return true;
}

function looksLikeChassis(value) {
  const text = normalizeChassisInput(value);
  if (text.length < 11 || text.length > 17) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (!isChassisChar(text[i], i)) return false;
  }
  return true;
}

function addCandidate(set, value) {
  const text = normalizeChassisInput(value);
  if (!looksLikeChassis(text)) return;
  set.add(text);
}

export function extractChassisCandidates(text) {
  const candidates = new Set();
  const raw = String(text || '').toUpperCase();
  const compact = raw.replace(/[^A-Z0-9]/g, '');

  for (let len = 17; len >= 11; len -= 1) {
    for (let i = 0; i <= compact.length - len; i += 1) {
      addCandidate(candidates, compact.slice(i, i + len));
      addCandidate(candidates, compact.slice(i, i + len).split('').map(fixOcrChar).join(''));
    }
  }

  raw.split(/\s+/).forEach(function (part) {
    addCandidate(candidates, part);
    addCandidate(candidates, part.split('').map(fixOcrChar).join(''));
  });

  return Array.from(candidates).sort(function (a, b) {
    return b.length - a.length || a.localeCompare(b);
  });
}

async function loadImageFromFile(file) {
  if (!(file instanceof Blob)) {
    throw new Error('Ugyldig bildefil.');
  }
  return file;
}

export async function readChassisFromImage(file) {
  const image = await loadImageFromFile(file);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: function () { /* stille */ }
  });

  try {
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    });
    const result = await worker.recognize(image);
    const text = result?.data?.text || '';
    const candidates = extractChassisCandidates(text);
    return {
      text,
      candidates,
      best: candidates[0] || ''
    };
  } finally {
    await worker.terminate();
  }
}
