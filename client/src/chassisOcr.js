export function normalizeChassisInput(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '');
}

const VIN_TRANSLITERATION = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
};

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

const OCR_CONFUSABLES = {
  '0': ['O', 'Q', 'D'],
  '1': ['I', 'L'],
  '2': ['Z'],
  '5': ['S'],
  '6': ['G'],
  '8': ['B'],
  O: ['0'],
  Q: ['0'],
  I: ['1'],
  D: ['0'],
  B: ['8'],
  S: ['5'],
  G: ['6'],
  Z: ['2']
};

const OCR_PASS_CONFIGS = [
  { name: 'line', psm: '7' },
  { name: 'block', psm: '6' },
  { name: 'sparse', psm: '11' }
];

function isStrictVinChar(ch, index) {
  if (!ch || !/[A-Z0-9]/.test(ch)) return false;
  if (/[IOQ]/.test(ch)) return false;
  if (index === 8 && (ch === '0' || ch === 'I' || ch === 'O' || ch === 'Q')) return false;
  return true;
}

export function isValidVinFormat(value) {
  const vin = normalizeChassisInput(value);
  if (vin.length !== 17) return false;
  for (let i = 0; i < vin.length; i += 1) {
    if (!isStrictVinChar(vin[i], i)) return false;
  }
  return true;
}

export function hasValidVinChecksum(value) {
  const vin = normalizeChassisInput(value);
  if (!isValidVinFormat(vin)) return false;

  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const ch = vin[i];
    const mapped = ch >= '0' && ch <= '9'
      ? Number(ch)
      : VIN_TRANSLITERATION[ch];
    if (mapped == null) return false;
    sum += mapped * VIN_WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected;
}

function looksLikeChassis(value) {
  const text = normalizeChassisInput(value);
  if (text.length < 11 || text.length > 17) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (!isStrictVinChar(text[i], Math.min(i, 8))) return false;
  }
  return true;
}

function generateOcrVariants(value) {
  const text = normalizeChassisInput(value);
  if (!text) return [];

  const results = new Set([text]);
  const queue = [text];
  const maxVariants = 48;

  while (queue.length && results.size < maxVariants) {
    const current = queue.shift();
    for (let i = 0; i < current.length; i += 1) {
      const ch = current[i];
      const replacements = OCR_CONFUSABLES[ch] || [];
      replacements.forEach(function (nextCh) {
        const next = current.slice(0, i) + nextCh + current.slice(i + 1);
        if (results.has(next)) return;
        results.add(next);
        if (results.size < maxVariants) queue.push(next);
      });
    }
  }

  return Array.from(results);
}

function addCandidate(map, value, meta) {
  const text = normalizeChassisInput(value);
  if (!looksLikeChassis(text)) return;

  const existing = map.get(text) || {
    value: text,
    score: 0,
    validVin: false,
    validChecksum: false,
    sources: new Set(),
    ocrConfidence: 0
  };

  existing.score += meta.score || 0;
  existing.validVin = existing.validVin || isValidVinFormat(text);
  existing.validChecksum = existing.validChecksum || hasValidVinChecksum(text);
  if (meta.source) existing.sources.add(meta.source);
  if (meta.confidence > existing.ocrConfidence) existing.ocrConfidence = meta.confidence;

  map.set(text, existing);
}

function extractFromChunk(map, chunk, meta) {
  const raw = String(chunk || '').toUpperCase();
  if (!raw) return;

  addCandidate(map, raw.replace(/[^A-Z0-9]/g, ''), meta);

  const compact = raw.replace(/[^A-Z0-9]/g, '');
  for (let len = 17; len >= 11; len -= 1) {
    for (let i = 0; i <= compact.length - len; i += 1) {
      const slice = compact.slice(i, i + len);
      addCandidate(map, slice, meta);
      generateOcrVariants(slice).forEach(function (variant) {
        addCandidate(map, variant, { ...meta, score: (meta.score || 0) + 4 });
      });
    }
  }

  raw.split(/\s+/).forEach(function (part) {
    addCandidate(map, part, meta);
    generateOcrVariants(part).forEach(function (variant) {
      addCandidate(map, variant, { ...meta, score: (meta.score || 0) + 4 });
    });
  });

  const formatted = raw.match(/\b[A-HJ-NPR-Z0-9]{3}\s?[A-HJ-NPR-Z0-9]{5,6}\s?[A-HJ-NPR-Z0-9]{5,8}\b/g);
  (formatted || []).forEach(function (match) {
    addCandidate(map, match, { ...meta, score: (meta.score || 0) + 40 });
  });
}

export function extractChassisCandidatesFromOcr(data, sourceName) {
  const map = new Map();
  const baseMeta = { source: sourceName || 'ocr' };

  extractFromChunk(map, data?.text || '', { ...baseMeta, score: 10, confidence: Number(data?.confidence) || 0 });

  (data?.lines || []).forEach(function (line) {
    extractFromChunk(map, line.text || '', {
      ...baseMeta,
      source: `${sourceName || 'ocr'}:line`,
      score: 28,
      confidence: Number(line.confidence) || 0
    });
  });

  (data?.words || []).forEach(function (word) {
    const confidence = Number(word.confidence) || 0;
    extractFromChunk(map, word.text || '', {
      ...baseMeta,
      source: `${sourceName || 'ocr'}:word`,
      score: confidence >= 80 ? 55 : confidence >= 60 ? 35 : 18,
      confidence
    });
  });

  return finalizeCandidates(map);
}

export function extractChassisCandidates(text) {
  const map = new Map();
  extractFromChunk(map, text, { source: 'text', score: 10, confidence: 0 });
  return finalizeCandidates(map);
}

function finalizeCandidates(map) {
  const ranked = Array.from(map.values()).map(function (item) {
    let score = item.score;

    if (item.validChecksum) score += 1200;
    else if (item.validVin) score += 650;
    else if (item.value.length === 17) score += 180;
    else if (item.value.length === 11) score += 40;

    if (item.ocrConfidence >= 85) score += 80;
    else if (item.ocrConfidence >= 70) score += 40;

    if (/^[A-HJ-NPR-Z0-9]{3}[A-HJ-NPR-Z0-9]{14}$/.test(item.value)) score += 30;
    if (/[IOQ]/.test(item.value)) score -= 120;

    return {
      value: item.value,
      score,
      validVin: item.validVin,
      validChecksum: item.validChecksum,
      confidence: Math.round(item.ocrConfidence),
      sources: Array.from(item.sources)
    };
  }).sort(function (a, b) {
    return b.score - a.score || b.value.length - a.value.length || a.value.localeCompare(b.value);
  });

  return ranked;
}

function loadImageElement(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('Kunne ikke lese bildet.'));
    };
    img.src = url;
  });
}

function renderCanvas(img, transform) {
  const targetWidth = Math.min(Math.max(img.width * 2, 1600), 3200);
  const scale = targetWidth / img.width;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  transform(ctx, width, height);
  return canvas;
}

function toGray(data) {
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
}

function stretchContrast(data) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(((data[i] - min) / range) * 255);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

function threshold(data, limit) {
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] >= limit ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

function invert(data) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}

async function buildImageVariants(file) {
  const img = await loadImageElement(file);
  const variants = [];

  variants.push(renderCanvas(img, function (ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    toGray(imageData.data);
    stretchContrast(imageData.data);
    ctx.putImageData(imageData, 0, 0);
  }));

  variants.push(renderCanvas(img, function (ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    toGray(imageData.data);
    stretchContrast(imageData.data);
    threshold(imageData.data, 150);
    ctx.putImageData(imageData, 0, 0);
  }));

  variants.push(renderCanvas(img, function (ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    toGray(imageData.data);
    stretchContrast(imageData.data);
    invert(imageData.data);
    threshold(imageData.data, 140);
    ctx.putImageData(imageData, 0, 0);
  }));

  return variants;
}

async function recognizeVariant(worker, image, configName, psm) {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  });
  const result = await worker.recognize(image);
  return extractChassisCandidatesFromOcr(result?.data || {}, `${configName}:${psm}`);
}

function mergeCandidateLists(lists) {
  const map = new Map();
  lists.forEach(function (list) {
    (list || []).forEach(function (item) {
      const existing = map.get(item.value);
      if (!existing) {
        map.set(item.value, { ...item, hits: 1 });
        return;
      }
      existing.hits += 1;
      existing.score += Math.round(item.score * 0.2) + 25;
      existing.validVin = existing.validVin || item.validVin;
      existing.validChecksum = existing.validChecksum || item.validChecksum;
      existing.confidence = Math.max(existing.confidence || 0, item.confidence || 0);
    });
  });

  return Array.from(map.values()).sort(function (a, b) {
    return b.score - a.score || b.value.length - a.value.length || a.value.localeCompare(b.value);
  });
}

export async function readChassisFromImage(file) {
  if (!(file instanceof Blob)) {
    throw new Error('Ugyldig bildefil.');
  }

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: function () { /* stille */ }
  });

  try {
    const variants = await buildImageVariants(file);
    const collected = [];

    for (let i = 0; i < variants.length; i += 1) {
      for (let j = 0; j < OCR_PASS_CONFIGS.length; j += 1) {
        const cfg = OCR_PASS_CONFIGS[j];
        const found = await recognizeVariant(worker, variants[i], `v${i + 1}-${cfg.name}`, cfg.psm);
        collected.push(found);
      }
    }

    const candidates = mergeCandidateLists(collected);
    const best = candidates[0] || null;

    return {
      text: '',
      candidates,
      best: best?.value || '',
      bestMeta: best || null
    };
  } finally {
    await worker.terminate();
  }
}
