'use strict';

const KLAR_STATUS = 'Klar til annonsering';
const ANNONSERT_STATUS = 'Annonsert';

function normToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normMake(value) {
  const token = normToken(value);
  if (token.startsWith('mercedes')) return 'mercedes';
  if (token === 'vw') return 'volkswagen';
  return token;
}

function normModel(value) {
  return normToken(value)
    .replace(/xdrive/g, 'x')
    .replace(/quattro/g, 'q');
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function bilChassis(bil) {
  const direct = String(bil.chassisnr || '').trim().toUpperCase();
  if (direct) return direct;
  const svv = parseJson(bil.svv_data, null);
  const understell = svv?.vehicle?.understell;
  return understell ? String(understell).trim().toUpperCase() : '';
}

function finnChassis(car) {
  const specs = Array.isArray(car?.specs) ? car.specs : [];
  const hit = specs.find(function (s) { return s && s.key === 'chassis_number'; });
  return hit?.value ? String(hit.value).trim().toUpperCase() : '';
}

function bilYear(bil) {
  const n = Number(bil.aar || bil.arsmodell || 0);
  return Number.isFinite(n) && n > 1900 ? n : null;
}

function scoreBilFinnMatch(bil, car) {
  if (!bil || !car || car.sold || car.availability === 'sold') return -1;

  const finnId = String(car.id || '').trim();
  if (finnId && String(bil.finn_kode || bil.finnKode || '').trim() === finnId) {
    return 1000;
  }

  const bilVin = bilChassis(bil);
  const finnVin = finnChassis(car);
  if (bilVin && finnVin && bilVin === finnVin) {
    return 900;
  }

  const makeOk = normMake(bil.merke) === normMake(car.make);
  if (!makeOk) return -1;

  const bilModel = normModel(bil.modell);
  const finnModel = normModel([car.model, car.modelSpec, car.title].filter(Boolean).join(' '));
  if (!bilModel || !finnModel) return -1;
  if (!(finnModel.includes(bilModel) || bilModel.includes(finnModel))) return -1;

  let score = 400;
  const year = bilYear(bil);
  const finnYear = Number(String(car.year || '').slice(0, 4));
  if (year && finnYear) {
    const diff = Math.abs(year - finnYear);
    if (diff === 0) score += 120;
    else if (diff === 1) score += 60;
    else if (diff <= 2) score += 20;
    else return -1;
  }

  const bilKm = Number(bil.km || 0);
  const finnKm = Number(car.mileage || 0);
  if (bilKm > 0 && finnKm > 0) {
    const kmDiff = Math.abs(bilKm - finnKm);
    if (kmDiff <= 3000) score += 80;
    else if (kmDiff <= 8000) score += 40;
    else if (kmDiff <= 15000) score += 10;
  }

  return score;
}

function findBestFinnMatch(bil, finnCars) {
  let best = null;
  let bestScore = -1;

  finnCars.forEach(function (car) {
    const score = scoreBilFinnMatch(bil, car);
    if (score > bestScore) {
      bestScore = score;
      best = car;
    }
  });

  if (bestScore < 400) return null;
  return { car: best, score: bestScore };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ' for ' + url);
  }
  return response.json();
}

async function loadFinnInventory(siteOrigin, options) {
  const origin = String(siteOrigin || '').replace(/\/$/, '');
  const refresh = options && options.refresh;
  const listUrl = origin + '/api/biler' + (refresh ? '?refresh=1' : '');
  const listData = await fetchJson(listUrl);
  const cars = (listData.cars || []).filter(function (c) {
    return c && !c.sold && c.availability !== 'sold';
  });

  const concurrency = 6;
  const detailed = [];
  for (let i = 0; i < cars.length; i += concurrency) {
    const batch = cars.slice(i, i + concurrency);
    const part = await Promise.all(batch.map(async function (car) {
      try {
        const detail = await fetchJson(origin + '/api/biler/' + encodeURIComponent(car.id));
        return detail.car || detail;
      } catch (_err) {
        return car;
      }
    }));
    detailed.push(...part);
  }

  return detailed;
}

function matchKlarBilerToFinn(klarBiler, finnCars) {
  const usedFinnIds = new Set();
  const matches = [];
  const unmatched = [];

  klarBiler.forEach(function (bil) {
    const candidates = finnCars.filter(function (car) {
      return car && car.id && !usedFinnIds.has(String(car.id));
    });
    const hit = findBestFinnMatch(bil, candidates);
    if (hit?.car?.id) {
      usedFinnIds.add(String(hit.car.id));
      matches.push({
        bil: bil,
        finn: hit.car,
        score: hit.score,
        method: hit.score >= 900 ? 'chassis/finn-kode' : 'modell'
      });
    } else {
      unmatched.push(bil);
    }
  });

  return { matches, unmatched };
}

module.exports = {
  KLAR_STATUS,
  ANNONSERT_STATUS,
  bilChassis,
  finnChassis,
  scoreBilFinnMatch,
  findBestFinnMatch,
  loadFinnInventory,
  matchKlarBilerToFinn
};
