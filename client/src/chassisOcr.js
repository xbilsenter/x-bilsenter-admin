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
  '1': ['I', 'L', '7'],
  '2': ['Z'],
  '3': ['8'],
  '4': ['A'],
  '5': ['S'],
  '6': ['G', '8'],
  '8': ['B', '3', '6'],
  '9': ['8'],
  O: ['0', 'D'],
  Q: ['0'],
  I: ['1', 'L'],
  L: ['1', 'I'],
  D: ['0', 'O'],
  B: ['8'],
  S: ['5'],
  G: ['6'],
  Z: ['2'],
  A: ['4'],
  T: ['7'],
  U: ['0'],
  V: ['U'],
  M: ['N'],
  N: ['M']
};

const PSM_MODES = ['7', '8', '13'];

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

function replacementChars(ch) {
  return [ch, ...(OCR_CONFUSABLES[ch] || [])];
}

function generateOcrVariants(value, maxResults) {
  const text = normalizeChassisInput(value);
  if (!text || text.length !== 17) return [text].filter(Boolean);

  const limit = maxResults || 48;
  const results = new Set([text]);
  const queue = [{ value: text, depth: 0 }];

  while (queue.length && results.size < limit) {
    const current = queue.shift();
    if (current.depth >= 2) continue;
    for (let i = 0; i < current.value.length; i += 1) {
      replacementChars(current.value[i]).forEach(function (nextCh) {
        if (nextCh === current.value[i]) return;
        const next = current.value.slice(0, i) + nextCh + current.value.slice(i + 1);
        if (results.has(next)) return;
        results.add(next);
        queue.push({ value: next, depth: current.depth + 1 });
      });
    }
  }
  return Array.from(results);
}

function repairVinByChecksum(value) {
  const text = normalizeChassisInput(value);
  if (text.length !== 17) return [];

  const found = new Set();
  if (hasValidVinChecksum(text)) found.add(text);

  for (let i = 0; i < 17; i += 1) {
    replacementChars(text[i]).forEach(function (ch) {
      const next = text.slice(0, i) + ch + text.slice(i + 1);
      if (hasValidVinChecksum(next)) found.add(next);
    });
  }

  if (!found.size) {
    for (let i = 0; i < 17 && found.size < 6; i += 1) {
      for (let j = i + 1; j < 17 && found.size < 6; j += 1) {
        replacementChars(text[i]).forEach(function (a) {
          replacementChars(text[j]).forEach(function (b) {
            const next = text.slice(0, i) + a + text.slice(i + 1, j) + b + text.slice(j + 1);
            if (hasValidVinChecksum(next)) found.add(next);
          });
        });
      }
    }
  }

  return Array.from(found);
}

function addCandidate(map, value, meta) {
  const text = normalizeChassisInput(value);
  if (text.length < 11 || text.length > 17) return;

  let allowed = false;
  if (text.length === 17 && (isValidVinFormat(text) || hasValidVinChecksum(text))) allowed = true;
  if (meta.exactToken && text.length >= 11) allowed = true;
  if (meta.repaired && hasValidVinChecksum(text)) allowed = true;
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

function addRepairCandidates(map, value, meta) {
  repairVinByChecksum(value).forEach(function (repaired) {
    addCandidate(map, repaired, {
      ...meta,
      repaired: true,
      score: (meta.score || 0) + 300,
      source: `${meta.source || 'ocr'}:repair`
    });
  });
  generateOcrVariants(value, 32).forEach(function (variant) {
    if (hasValidVinChecksum(variant)) {
      addCandidate(map, variant, {
        ...meta,
        repaired: true,
        score: (meta.score || 0) + 180,
        source: `${meta.source || 'ocr'}:variant`
      });
    }
  });
}

function extractJoinedTokens(map, tokens, meta) {
  const clean = tokens.map(normalizeChassisInput).filter(Boolean);
  for (let i = 0; i < clean.length; i += 1) {
    let joined = '';
    for (let j = i; j < clean.length && joined.length <= 17; j += 1) {
      joined += clean[j];
      if (joined.length >= 11 && joined.length <= 17) {
        addCandidate(map, joined, { ...meta, exactToken: true, score: (meta.score || 0) + 35 });
      }
      if (joined.length === 17) {
        addRepairCandidates(map, joined, meta);
      }
    }
  }
}

function extractFromChunk(map, chunk, meta) {
  const raw = String(chunk || '').toUpperCase();
  if (!raw) return;

  const tokens = raw.split(/[^A-Z0-9]+/).filter(Boolean);
  tokens.forEach(function (token) {
    addCandidate(map, token, { ...meta, exactToken: true });
    if (token.length === 17) {
      addRepairCandidates(map, token, meta);
    }
  });
  extractJoinedTokens(map, tokens, meta);

  const compact = raw.replace(/[^A-Z0-9]/g, '');
  for (let len = 17; len >= 11; len -= 1) {
    for (let i = 0; i <= compact.length - len; i += 1) {
      const slice = compact.slice(i, i + len);
      if (len === 17) {
        addCandidate(map, slice, { ...meta, score: (meta.score || 0) + 50 });
        addRepairCandidates(map, slice, meta);
        continue;
      }
      if (len >= 15) {
        addCandidate(map, slice, { ...meta, exactToken: true, score: (meta.score || 0) + 15 });
      }
    }
  }
}

function finalizeCandidates(map) {
  return Array.from(map.values()).map(function (item) {
    let score = item.score;
    if (item.validChecksum) score += 2000;
    else if (item.validVin) score += 800;
    if (item.confidence >= 85) score += 80;
    else if (item.confidence >= 65) score += 30;
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
      score: 45,
      confidence: Number(line.confidence) || 0
    });
  });

  (data?.words || []).forEach(function (word) {
    const confidence = Number(word.confidence) || 0;
    extractFromChunk(map, word.text || '', {
      ...base,
      source: `${sourceName || 'ocr'}:word`,
      score: confidence >= 80 ? 80 : confidence >= 55 ? 45 : 25,
      confidence
    });
  });

  const lineTexts = (data?.lines || []).map(function (line) { return line.text || ''; });
  extractJoinedTokens(map, lineTexts, { ...base, score: 55, confidence: 70 });

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

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
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

function otsuThreshold(data) {
  const hist = new Array(256).fill(0);
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[data[i]] += 1;

  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let best = 128;

  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = pixels - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVar) {
      maxVar = variance;
      best = t;
    }
  }

  threshold(data, best);
}

function sharpen(data, width, height) {
  const src = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) src[p] = data[i];

  const dst = new Uint8ClampedArray(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      dst[i] = clampByte(
        5 * src[i]
        - src[i - 1] - src[i + 1]
        - src[i - width] - src[i + width]
      );
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const v = dst[p] || src[p];
      const i = p * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }
}

function renderCanvas(img, transform, scaleMultiplier) {
  const multiplier = scaleMultiplier || 1;
  const targetWidth = Math.min(Math.max(img.width * 2.5 * multiplier, 2600), 4200);
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

function withGrayContrast(ctx, width, height, extra) {
  const imageData = ctx.getImageData(0, 0, width, height);
  toGray(imageData.data);
  stretchContrast(imageData.data);
  if (extra) extra(imageData.data, width, height);
  ctx.putImageData(imageData, 0, 0);
}

async function buildImageVariants(blob) {
  const img = await loadImageElement(blob);
  return [
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height, function (data, w, h) {
        sharpen(data, w, h);
      });
    }),
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height);
    }, 1.15),
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height, function (data) {
        threshold(data, 130);
      });
    }),
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height, function (data) {
        threshold(data, 145);
      });
    }),
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height, function (data) {
        threshold(data, 160);
      });
    }),
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height, function (data, w, h) {
        sharpen(data, w, h);
        otsuThreshold(data);
      });
    }),
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height, function (data) {
        invert(data);
        otsuThreshold(data);
      });
    }),
    renderCanvas(img, function (ctx, width, height) {
      withGrayContrast(ctx, width, height, function (data) {
        invert(data);
        threshold(data, 135);
      });
    })
  ];
}

async function recognizeLocal(worker, image, label, psm) {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789',
    preserve_interword_spaces: '0'
  });
  const result = await worker.recognize(image);
  return extractChassisCandidatesFromOcr(result?.data || {}, `${label}:psm${psm}`);
}

function pickBestCandidate(candidates) {
  return candidates.find(function (item) { return item.validChecksum; })
    || candidates.find(function (item) { return item.validVin && item.confidence >= 75; })
    || candidates.find(function (item) { return item.validVin; })
    || candidates.find(function (item) { return item.value.length >= 15; })
    || candidates[0]
    || null;
}

function mergeCandidateLists(map, lists) {
  lists.forEach(function (list) {
    (list || []).forEach(function (item) {
      const existing = map.get(item.value);
      if (!existing) {
        map.set(item.value, { ...item });
        return;
      }
      existing.score += item.score + 25;
      existing.confidence = Math.max(existing.confidence || 0, item.confidence || 0);
      existing.validVin = existing.validVin || item.validVin;
      existing.validChecksum = existing.validChecksum || item.validChecksum;
    });
  });
}

async function readChassisLocally(croppedBlob) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { logger: function () {} });
  try {
    const variants = await buildImageVariants(croppedBlob);
    const map = new Map();

    for (let i = 0; i < variants.length; i += 1) {
      const label = `local:v${i + 1}`;
      const passResults = [];
      for (let p = 0; p < PSM_MODES.length; p += 1) {
        passResults.push(await recognizeLocal(worker, variants[i], label, PSM_MODES[p]));
      }
      mergeCandidateLists(map, passResults);

      const interim = Array.from(map.values());
      if (interim.some(function (item) { return item.validChecksum; })) break;
    }

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

export async function readChassisFromImage(croppedBlob) {
  if (!(croppedBlob instanceof Blob)) {
    throw new Error('Ugyldig bildeutsnitt.');
  }
  return readChassisLocally(croppedBlob);
}
