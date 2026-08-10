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

function generateOcrVariants(value) {
  const text = normalizeChassisInput(value);
  if (!text || text.length !== 17) return [text].filter(Boolean);

  const results = new Set([text]);
  const queue = [text];
  while (queue.length && results.size < 24) {
    const current = queue.shift();
    for (let i = 0; i < current.length; i += 1) {
      const replacements = OCR_CONFUSABLES[current[i]] || [];
      replacements.forEach(function (nextCh) {
        const next = current.slice(0, i) + nextCh + current.slice(i + 1);
        if (results.has(next)) return;
        results.add(next);
        queue.push(next);
      });
    }
  }
  return Array.from(results);
}

function addCandidate(map, value, meta) {
  const text = normalizeChassisInput(value);
  if (text.length < 11 || text.length > 17) return;

  let allowed = false;
  if (text.length === 17 && (isValidVinFormat(text) || hasValidVinChecksum(text))) allowed = true;
  if (meta.exactToken && text.length >= 11) allowed = true;
  if (!allowed) return;

  const existing = map.get(text) || {
    value: text,
    score: 0,
    validVin: false,
    validChecksum: false,
    confidence: 0,
    source: meta.source || 'ocr'
  };

  existing.score += meta.score || 0;
  existing.validVin = existing.validVin || isValidVinFormat(text);
  existing.validChecksum = existing.validChecksum || hasValidVinChecksum(text);
  existing.confidence = Math.max(existing.confidence || 0, Number(meta.confidence) || 0);
  if (meta.source) existing.source = meta.source;
  map.set(text, existing);
}

function extractFromChunk(map, chunk, meta) {
  const raw = String(chunk || '').toUpperCase();
  if (!raw) return;

  raw.split(/[^A-Z0-9]+/).filter(Boolean).forEach(function (token) {
    addCandidate(map, token, { ...meta, exactToken: true });
    if (token.length === 17) {
      generateOcrVariants(token).forEach(function (variant) {
        addCandidate(map, variant, { ...meta, exactToken: true, score: (meta.score || 0) + 20 });
      });
    }
  });

  const compact = raw.replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i <= compact.length - 17; i += 1) {
    const slice = compact.slice(i, i + 17);
    if (!isValidVinFormat(slice) && !hasValidVinChecksum(slice)) continue;
    addCandidate(map, slice, { ...meta, score: (meta.score || 0) + 40 });
    generateOcrVariants(slice).forEach(function (variant) {
      addCandidate(map, variant, { ...meta, score: (meta.score || 0) + 35 });
    });
  }
}

function finalizeCandidates(map) {
  return Array.from(map.values()).map(function (item) {
    let score = item.score;
    if (item.validChecksum) score += 1500;
    else if (item.validVin) score += 700;
    if (item.confidence >= 85) score += 60;
    return { ...item, score };
  }).sort(function (a, b) {
    return b.score - a.score || b.value.length - a.value.length || a.value.localeCompare(b.value);
  });
}

export function extractChassisCandidatesFromOcr(data, sourceName) {
  const map = new Map();
  const base = { source: sourceName || 'ocr' };

  extractFromChunk(map, data?.text || '', { ...base, score: 10, confidence: Number(data?.confidence) || 0 });

  (data?.lines || []).forEach(function (line) {
    extractFromChunk(map, line.text || '', {
      ...base,
      source: `${sourceName || 'ocr'}:line`,
      score: 40,
      confidence: Number(line.confidence) || 0
    });
  });

  (data?.words || []).forEach(function (word) {
    const confidence = Number(word.confidence) || 0;
    extractFromChunk(map, word.text || '', {
      ...base,
      source: `${sourceName || 'ocr'}:word`,
      score: confidence >= 80 ? 70 : 30,
      confidence
    });
  });

  return finalizeCandidates(map);
}

function loadImageElement(blob) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(blob);
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
  const targetWidth = Math.min(Math.max(img.width * 2, 2200), 3600);
  const scale = targetWidth / img.width;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
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

async function buildImageVariants(blob) {
  const img = await loadImageElement(blob);
  return [
    renderCanvas(img, function (ctx, width, height) {
      const imageData = ctx.getImageData(0, 0, width, height);
      toGray(imageData.data);
      stretchContrast(imageData.data);
      ctx.putImageData(imageData, 0, 0);
    }),
    renderCanvas(img, function (ctx, width, height) {
      const imageData = ctx.getImageData(0, 0, width, height);
      toGray(imageData.data);
      stretchContrast(imageData.data);
      threshold(imageData.data, 145);
      ctx.putImageData(imageData, 0, 0);
    }),
    renderCanvas(img, function (ctx, width, height) {
      const imageData = ctx.getImageData(0, 0, width, height);
      toGray(imageData.data);
      stretchContrast(imageData.data);
      invert(imageData.data);
      threshold(imageData.data, 140);
      ctx.putImageData(imageData, 0, 0);
    })
  ];
}

async function recognizeLocal(worker, image, label) {
  await worker.setParameters({
    tessedit_pageseg_mode: '7',
    tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  });
  const result = await worker.recognize(image);
  return extractChassisCandidatesFromOcr(result?.data || {}, label);
}

function pickBestCandidate(candidates) {
  return candidates.find(function (item) { return item.validChecksum; })
    || candidates.find(function (item) { return item.validVin && item.confidence >= 85; })
    || candidates.find(function (item) { return item.validVin; })
    || null;
}

async function readChassisLocally(croppedBlob) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: function () {} });
  try {
    const variants = await buildImageVariants(croppedBlob);
    const lists = [];
    for (let i = 0; i < variants.length; i += 1) {
      lists.push(await recognizeLocal(worker, variants[i], `local:v${i + 1}`));
    }

    const map = new Map();
    lists.forEach(function (list) {
      (list || []).forEach(function (item) {
        const existing = map.get(item.value);
        if (!existing) map.set(item.value, { ...item });
        else {
          existing.score += item.score + 20;
          existing.confidence = Math.max(existing.confidence || 0, item.confidence || 0);
          existing.validVin = existing.validVin || item.validVin;
          existing.validChecksum = existing.validChecksum || item.validChecksum;
        }
      });
    });

    const candidates = Array.from(map.values()).sort(function (a, b) {
      return b.score - a.score || b.value.length - a.value.length;
    });
    const best = pickBestCandidate(candidates);
    return {
      candidates,
      best: best?.value || '',
      engine: 'local'
    };
  } finally {
    await worker.terminate();
  }
}

export async function readChassisFromImage(croppedBlob, scanRemote) {
  if (!(croppedBlob instanceof Blob)) {
    throw new Error('Ugyldig bildeutsnitt.');
  }

  let visionWarning = '';

  if (typeof scanRemote === 'function') {
    try {
      const remote = await scanRemote(croppedBlob);
      if (remote?.candidates?.length) {
        const best = pickBestCandidate(remote.candidates) || remote.candidates[0];
        return {
          candidates: remote.candidates,
          best: best?.value || remote.best || '',
          engine: remote.engine || 'openai',
          visionWarning: ''
        };
      }
    } catch (err) {
      if (err?.code === 'VISION_AUTH' || err?.status === 401) {
        visionWarning = err.message || 'OpenAI-nøkkelen er ugyldig. Sjekk OPENAI_API_KEY i Vercel.';
      } else if (err?.status !== 501 && err?.code !== 'NO_VISION') {
        visionWarning = 'AI-visjon feilet. Prøver lokal OCR i stedet.';
      }
    }
  }

  const local = await readChassisLocally(croppedBlob);
  return {
    ...local,
    visionWarning
  };
}
