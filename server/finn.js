'use strict';

const FINN_SEARCH_BASE = 'https://www.finn.no/mobility/search/car';
const FINN_UA = 'XBilsenterAdmin/1.0 (+https://xbilsenter.no)';
const FINN_KM_SLACK = 30000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const MAKE_ALIASES = {
  vw: 'volkswagen',
  mb: 'mercedes benz',
  merc: 'mercedes benz',
  mercedes: 'mercedes benz',
  citroen: 'citroen',
  skoda: 'skoda'
};

const MODEL_TRIM_WORDS = new Set([
  'cdi', 'tdi', 'tfsi', 'tsi', 'gdi', 'hybrid', 'plug', 'in', 'phev', 'hev',
  'awd', '4wd', '4x4', 'quattro', 'xdrive', '4matic', 'aut', 'auto', 'manual',
  'dsg', 'tiptronic', 'st', 'rs', 'gt', 'gti', 'r', 'line', 'sport', 'cross',
  'country', 'variant', 'avant', 'tourer', 'estate', 'stasjonsvogn', 'kombi'
]);

const MODEL_BODY_STYLES = new Set([
  'sportback', 'coupe', 'cabriolet', 'cabrio', 'sedan', 'suv', 'kombi',
  'stasjonsvogn', 'avant', 'tourer', 'country', 'cross', 'alltrack',
  'roadster', 'spyder', 'pickup', 'van', 'minivan', 'mpv'
]);

const makeCache = { at: 0, items: null };
const modelCache = new Map();

function parseFinnItemId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const urlMatch = s.match(/finn\.no\/mobility\/item\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  const digits = s.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

function finnItemUrl(id) {
  return id ? `https://www.finn.no/mobility/item/${id}` : null;
}

function cleanFinnTitle(raw) {
  let title = String(raw || '').trim();
  if (!title) return '';
  title = title.replace(/^Bruktbil til salgs:\s*/i, '').trim();
  title = title.replace(/\s*[|\-–—]\s*FINN\.no\s*$/i, '').trim();
  title = title.replace(/\s*\|\s*FINN\s*$/i, '').trim();
  const yearSplit = title.match(/^(.+?)\s+-\s+(19|20)\d{2}\b/);
  if (yearSplit) title = yearSplit[1].trim();
  return title;
}

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[æ]/gi, 'ae')
    .replace(/[ø]/gi, 'o')
    .replace(/[å]/gi, 'a');
}

function normalizeFinnSearchTerm(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (upper.length <= 3 || /^(BMW|VW|MG|DS)$/i.test(upper)) return upper;
  return s.toLowerCase().replace(/(?:^|[\s\-/])\w/g, function (ch) {
    return ch.toUpperCase();
  });
}

function normalizeFinnMatchKey(value) {
  let key = stripAccents(String(value || '').trim()).toLowerCase();
  key = key.replace(/[-_/]+/g, ' ');
  key = key.replace(/[^a-z0-9\s]/gi, ' ');
  key = key.replace(/\s+/g, ' ').trim();
  if (MAKE_ALIASES[key]) key = MAKE_ALIASES[key];
  return key;
}

function tokenizeFinnName(value) {
  const key = normalizeFinnMatchKey(value);
  return key ? key.split(' ').filter(Boolean) : [];
}

function scoreFinnNameMatch(query, candidate) {
  const q = normalizeFinnMatchKey(query);
  const c = normalizeFinnMatchKey(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.startsWith(q)) return 85;
  if (q.startsWith(c)) return 75;

  const qNoSerie = q.replace(/\s+serie$/, '').trim();
  const cNoSerie = c.replace(/\s+serie$/, '').trim();
  if (qNoSerie && cNoSerie) {
    if (qNoSerie === cNoSerie) return 90;
    if (cNoSerie.startsWith(qNoSerie)) return 82;
    if (qNoSerie.startsWith(cNoSerie)) return 72;
  }

  const qTokens = tokenizeFinnName(query);
  const cTokens = tokenizeFinnName(candidate);
  if (!qTokens.length || !cTokens.length) return 0;

  const qSet = new Set(qTokens);
  const matched = cTokens.filter(function (t) { return qSet.has(t); }).length;
  if (matched === qTokens.length) return 65 + Math.min(10, matched * 2);
  if (matched > 0) return 35 + matched * 8;
  return 0;
}

function isModelNoiseToken(token) {
  if (!token) return true;
  if (MODEL_TRIM_WORDS.has(token)) return true;
  if (/^\d+$/.test(token)) return true;
  if (/^\d+[a-z]{1,2}$/i.test(token)) return true;
  return false;
}

function significantModelTokens(modell) {
  return tokenizeFinnName(modell).filter(function (token) {
    return !isModelNoiseToken(token);
  });
}

function modelBodyStyleTokens(modell) {
  return significantModelTokens(modell).filter(function (token) {
    return MODEL_BODY_STYLES.has(token);
  });
}

function scoreFinnModelMatch(query, candidate, originalModell) {
  let score = scoreFinnNameMatch(query, candidate);
  const origSig = significantModelTokens(originalModell || query);
  const candTokens = new Set(tokenizeFinnName(candidate));

  if (origSig.length) {
    const matchedSig = origSig.filter(function (token) { return candTokens.has(token); });
    score += matchedSig.length * 14;
    score -= (origSig.length - matchedSig.length) * 28;
  }

  score += Math.min(candTokens.size, 6) * 2;
  return score;
}

function pickBestFinnMatch(query, options, originalModell) {
  let best = null;
  for (const [id, label] of options.entries()) {
    const score = scoreFinnModelMatch(query, label, originalModell || query);
    if (!best || score > best.score || (score === best.score && String(label).length > String(best.label).length)) {
      best = { id, label, score };
    }
  }
  if (!best || best.score < 35) return null;
  return best;
}

function cleanModelForMatch(modell) {
  return String(modell || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function modelMatchQueries(modell) {
  const raw = String(modell || '').trim();
  if (!raw) return [];

  const cleaned = cleanModelForMatch(raw);
  const sigTokens = significantModelTokens(cleaned);
  const bodyStyles = modelBodyStyleTokens(cleaned);
  const queries = [];

  function add(query) {
    const q = String(query || '').trim();
    if (!q) return;
    if (!queries.includes(q)) queries.push(q);
  }

  add(cleaned);
  if (sigTokens.length) add(sigTokens.join(' '));

  for (let n = sigTokens.length; n >= 2; n -= 1) {
    const prefix = sigTokens.slice(0, n);
    if (bodyStyles.length && !bodyStyles.every(function (token) { return prefix.includes(token); })) {
      continue;
    }
    add(prefix.join(' '));
  }

  return queries;
}

function pickBestFinnMatchFromQueries(queries, options, originalModell) {
  let best = null;
  for (const query of queries) {
    const match = pickBestFinnMatch(query, options, originalModell || query);
    if (!match) continue;
    if (
      !best
      || match.score > best.score
      || (match.score === best.score && String(match.label).length > String(best.label).length)
    ) {
      best = match;
    }
  }
  return best;
}

function parseFinnVariantLinks(html, variantPattern) {
  const map = new Map();
  const re = new RegExp(
    'href="' + FINN_SEARCH_BASE.replace(/\./g, '\\.') + '\\?variant=(' + variantPattern + ')"[^>]*><span class="">([^<]+)<',
    'g'
  );
  let match;
  while ((match = re.exec(html)) !== null) {
    const id = match[1];
    const label = match[2].replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (id && label && !map.has(id)) map.set(id, label);
  }
  return map;
}

function extractVariantFromFinnHtml(html) {
  const canonical = html.match(
    /rel="canonical" href="https:\/\/www\.finn\.no\/mobility\/search\/car\?variant=([^"]+)"/
  );
  if (canonical) {
    const crumbs = [...html.matchAll(
      /"name":"([^"]+)","item":"https:\/\/www\.finn\.no\/mobility\/search\/car\?variant=([^"]+)"/g
    )];
    const last = crumbs[crumbs.length - 1];
    return {
      id: canonical[1],
      label: last ? last[1] : null
    };
  }
  return null;
}

async function fetchFinnSearchPage(params) {
  const url = FINN_SEARCH_BASE + '?' + new URLSearchParams(params).toString();
  const response = await fetch(url, {
    headers: {
      'User-Agent': FINN_UA,
      Accept: 'text/html'
    },
    redirect: 'follow'
  });
  if (!response.ok) {
    throw new Error('FINN svarte med HTTP ' + response.status);
  }
  return response.text();
}

async function fetchFinnSearchHtml(variant) {
  return fetchFinnSearchPage(variant ? { variant } : {});
}

async function getFinnMakes() {
  const now = Date.now();
  if (makeCache.items && now - makeCache.at < CACHE_TTL_MS) {
    return makeCache.items;
  }
  const html = await fetchFinnSearchHtml(null);
  const makes = parseFinnVariantLinks(html, '0\\.[0-9]+');
  makeCache.items = makes;
  makeCache.at = now;
  return makes;
}

async function resolveMakeViaQSearch(merke) {
  const q = String(merke || '').trim();
  if (!q) return null;
  const html = await fetchFinnSearchPage({ q: q.toLowerCase() });
  const found = extractVariantFromFinnHtml(html);
  if (!found?.id || !String(found.id).startsWith('0.')) return null;
  return { id: found.id, label: found.label || q, score: 100 };
}

function makeModelVariantPattern(makeVariant) {
  const parts = String(makeVariant || '').split('.');
  const makeNum = parts[1];
  return makeNum ? `1\\.${makeNum}\\.[0-9]+` : null;
}

async function getFinnModels(makeVariant) {
  const now = Date.now();
  const cached = modelCache.get(makeVariant);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.items;
  }
  const modelPattern = makeModelVariantPattern(makeVariant);
  if (!modelPattern) return new Map();
  const html = await fetchFinnSearchHtml(makeVariant);
  const models = parseFinnVariantLinks(html, modelPattern);
  modelCache.set(makeVariant, { at: now, items: models });
  return models;
}

async function resolveFinnVariant(merke, modell) {
  const merkeRaw = String(merke || '').trim();
  const modellRaw = String(modell || '').trim();
  if (!merkeRaw && !modellRaw) return null;

  const makes = await getFinnMakes();
  let makeMatch = merkeRaw ? pickBestFinnMatch(merkeRaw, makes) : null;
  if (merkeRaw && !makeMatch) {
    makeMatch = await resolveMakeViaQSearch(merkeRaw);
  }
  if (merkeRaw && !makeMatch) return null;

  let makeVariant = makeMatch ? makeMatch.id : null;
  let makeLabel = makeMatch ? makeMatch.label : null;
  let modelVariant = null;
  let modelLabel = null;

  if (modellRaw) {
    const modelQueries = modelMatchQueries(modellRaw);
    if (!makeVariant) {
      let bestModelMatch = null;
      let bestMake = null;
      for (const [candidateMakeId, candidateMakeLabel] of makes.entries()) {
        const models = await getFinnModels(candidateMakeId);
        const modelMatch = pickBestFinnMatchFromQueries(modelQueries, models, modellRaw);
        if (!modelMatch) continue;
        if (!bestModelMatch || modelMatch.score > bestModelMatch.score) {
          bestModelMatch = modelMatch;
          bestMake = { id: candidateMakeId, label: candidateMakeLabel };
        }
      }
      if (!bestModelMatch || !bestMake) return null;
      makeVariant = bestMake.id;
      makeLabel = bestMake.label;
      modelVariant = bestModelMatch.id;
      modelLabel = bestModelMatch.label;
    } else {
      const models = await getFinnModels(makeVariant);
      const modelMatch = pickBestFinnMatchFromQueries(modelQueries, models, modellRaw);
      if (modelMatch) {
        modelVariant = modelMatch.id;
        modelLabel = modelMatch.label;
      }
    }
  }

  if (!makeVariant && !modelVariant) return null;

  return {
    makeVariant,
    modelVariant,
    makeLabel,
    modelLabel,
    variant: modelVariant || makeVariant,
    mode: 'filter'
  };
}

function buildFinnMarkedsSokParams(inn) {
  const params = new URLSearchParams();
  params.set('sales_form', '1');
  params.set('sort', 'PRICE_ASC');
  const aar = Number(inn?.aar);
  if (aar > 1980) {
    params.set('year_from', String(Math.max(1980, aar - 1)));
  }
  const km = Number(inn?.km);
  const slack = Number(inn?.kmSlack) > 0 ? Number(inn.kmSlack) : FINN_KM_SLACK;
  if (Number.isFinite(km) && km > 0) {
    params.set('mileage_to', String(Math.round(km + slack)));
  }
  return params;
}

function buildFinnMarkedsSokUrl(inn, variant) {
  const filterVariant = String(variant || '').trim();
  if (!filterVariant) return null;

  const params = buildFinnMarkedsSokParams(inn);
  params.set('variant', filterVariant);
  return `${FINN_SEARCH_BASE}?${params.toString()}`;
}

function buildFinnMarkedsSokUrlQ(inn) {
  const merke = normalizeFinnSearchTerm(inn?.merke);
  const modell = normalizeFinnSearchTerm(inn?.modell);
  const q = [merke, modell].filter(Boolean).join(' ').trim();
  if (!q) return null;

  const params = buildFinnMarkedsSokParams(inn);
  params.set('q', q);
  return `${FINN_SEARCH_BASE}?${params.toString()}`;
}

async function resolveFinnMarkedsSok(inn) {
  const resolved = await resolveFinnVariant(inn?.merke, inn?.modell);
  if (resolved?.variant) {
    const url = buildFinnMarkedsSokUrl(inn, resolved.variant);
    if (url) return { url, ...resolved, mode: 'filter' };
  }

  const fallbackUrl = buildFinnMarkedsSokUrlQ(inn);
  if (!fallbackUrl) return null;
  return {
    url: fallbackUrl,
    makeVariant: null,
    modelVariant: null,
    makeLabel: normalizeFinnSearchTerm(inn?.merke) || null,
    modelLabel: normalizeFinnSearchTerm(inn?.modell) || null,
    variant: null,
    mode: 'search'
  };
}

async function lookupFinnAnnonse(ref) {
  const id = parseFinnItemId(ref);
  const url = finnItemUrl(id);
  if (!id || !url) {
    return { id: null, url: null, title: null };
  }

  let title = '';
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': FINN_UA,
        Accept: 'text/html'
      },
      redirect: 'follow'
    });
    if (response.ok) {
      const html = await response.text();
      const ogMatch = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)
        || html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i);
      if (ogMatch) {
        title = cleanFinnTitle(ogMatch[1]);
      } else {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = cleanFinnTitle(titleMatch[1]);
      }
    }
  } catch (_err) {
    /* Bruk URL uten tittel hvis oppslag feiler */
  }

  return { id: id, url: url, title: title || null };
}

module.exports = {
  parseFinnItemId,
  finnItemUrl,
  buildFinnMarkedsSokUrl,
  buildFinnMarkedsSokUrlQ,
  resolveFinnMarkedsSok,
  resolveFinnVariant,
  lookupFinnAnnonse
};
