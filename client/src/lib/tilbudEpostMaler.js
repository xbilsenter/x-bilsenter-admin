const INNBYTTE_INTRO_MAL =
  'Viser til innbytteskjema hvor du ønsker å bytte inn din {{kundeBil}} med {{varBil}}.';

export const DEFAULT_TILBUD_EPOST_MALER = {
  innbytteTilbud: [
    'Hei {{navn}},',
    '',
    INNBYTTE_INTRO_MAL,
    '',
    'Vi er nærmere {{pris}} for din bil i innbytte.',
    '',
    'Ønsker du å avtale visning av vår bil?'
  ].join('\n'),
  innbytteVisning: [
    'Hei {{navn}},',
    '',
    INNBYTTE_INTRO_MAL,
    '',
    'Vi er nok ikke så langt unna hverandre på innbytteverdi av din bil. Kom gjerne innom for å titte på vår bil – faller den i smak blir vi enige.',
    '',
    'Ønsker du å avtale visning av vår bil?'
  ].join('\n'),
  selgBilTilbud: [
    'Hei {{fornavn}},',
    '',
    'Takk for henvendelsen om salg av {{bil}}{{regSuffix}}.',
    '',
    'Vi kan tilby kr {{pris}} for direkte oppkjøp av bilen.',
    '',
    'Ta gjerne kontakt dersom du har spørsmål eller ønsker å avtale tid for gjennomgang.',
    '',
    'Med vennlig hilsen',
    'X Bilsenter AS'
  ].join('\n'),
  selgBilVisning: [
    'Hei {{fornavn}},',
    '',
    'Takk for henvendelsen om salg av {{bil}}{{regSuffix}}.',
    '',
    'Vi er nok ikke så langt unna hverandre på pris. Kom gjerne innom så vi kan se på bilen sammen – da finner vi raskt ut om vi blir enige.',
    '',
    'Ønsker du å avtale tid for befaring?',
    '',
    'Med vennlig hilsen',
    'X Bilsenter AS'
  ].join('\n')
};

export const TILBUD_EPOST_MAL_DEFS = [
  {
    key: 'innbytteTilbud',
    title: 'Innbytte – tilbud',
    desc: 'Brukes når du sender innbyttetilbud på e-post fra innbytte-modulen.',
    placeholders: ['{{navn}}', '{{pris}}', '{{kundeBil}}', '{{varBil}}']
  },
  {
    key: 'innbytteVisning',
    title: 'Innbytte – avtale visning',
    desc: 'Brukes når du inviterer kunden til visning av bil i innbytte-modulen.',
    placeholders: ['{{navn}}', '{{kundeBil}}', '{{varBil}}']
  },
  {
    key: 'selgBilTilbud',
    title: 'Selg bil – oppkjøpstilbud',
    desc: 'Brukes når du sender oppkjøpstilbud fra selg-bil-modulen.',
    placeholders: ['{{fornavn}}', '{{bil}}', '{{regSuffix}}', '{{pris}}', '{{reg}}']
  },
  {
    key: 'selgBilVisning',
    title: 'Selg bil – avtale befaring',
    desc: 'Brukes når du inviterer kunden til befaring i selg-bil-modulen.',
    placeholders: ['{{fornavn}}', '{{bil}}', '{{regSuffix}}', '{{reg}}']
  }
];

function expandInnbytteIntroPlaceholder(text) {
  return String(text || '').replace(/\{\{intro\}\}/g, INNBYTTE_INTRO_MAL);
}

export function normalizeTilbudEpostMaler(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  Object.keys(DEFAULT_TILBUD_EPOST_MALER).forEach(function (key) {
    let val = String(src[key] != null ? src[key] : DEFAULT_TILBUD_EPOST_MALER[key] || '').trim();
    if (!val) val = DEFAULT_TILBUD_EPOST_MALER[key];
    if (key === 'innbytteTilbud' || key === 'innbytteVisning') {
      val = expandInnbytteIntroPlaceholder(val);
    }
    out[key] = val;
  });
  return out;
}

export function applyTilbudEpostMal(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, function (_match, key) {
    const val = vars && vars[key];
    return val != null ? String(val) : '';
  });
}

function formatPrisKr(value) {
  if (value == null || value === '') return '…';
  const n = Number(String(value).replace(/\s/g, '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return String(value).trim() || '…';
  return n.toLocaleString('nb-NO');
}

function innbytteKundeBil(inn) {
  const bil = [inn.merke, inn.modell, inn.aar].filter(Boolean).join(' ');
  if (bil && inn.reg) return `${bil} (${inn.reg})`;
  return bil || inn.reg || 'bilen din';
}

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

function formatVarBilForEpost(finnMeta, rawFinn) {
  const id = finnMeta?.id || parseFinnItemId(rawFinn);
  const url = finnMeta?.url || finnItemUrl(id);
  const navn = finnMeta?.title ? String(finnMeta.title).trim() : '';
  if (navn && url) return `vår ${navn} (${url})`;
  if (navn) return `vår ${navn}`;
  if (url) return `vår bil (${url})`;
  return 'vår bil';
}

function buildInnbytteIntroAvsnitt(inn, finnMeta) {
  const kundeBil = innbytteKundeBil(inn);
  const varBil = formatVarBilForEpost(finnMeta, inn.onsketBil);
  return `Viser til innbytteskjema hvor du ønsker å bytte inn din ${kundeBil} med ${varBil}.`;
}

function selgBilLabel(inn) {
  return [inn.merke, inn.modell, inn.aar].filter(Boolean).join(' ') || 'bilen din';
}

function pickMal(maler, key) {
  const normalized = normalizeTilbudEpostMaler(maler);
  return normalized[key] || DEFAULT_TILBUD_EPOST_MALER[key];
}

export function buildInnbytteTilbudMelding(inn, tilbudKr, finnMeta, maler) {
  const intro = buildInnbytteIntroAvsnitt(inn, finnMeta);
  return applyTilbudEpostMal(pickMal(maler, 'innbytteTilbud'), {
    navn: inn.navn || '',
    intro: intro,
    pris: tilbudKr ? `kr ${formatPrisKr(tilbudKr)}` : '…',
    kundeBil: innbytteKundeBil(inn),
    varBil: formatVarBilForEpost(finnMeta, inn.onsketBil)
  });
}

export function buildInnbytteVisningMelding(inn, finnMeta, maler) {
  const intro = buildInnbytteIntroAvsnitt(inn, finnMeta);
  return applyTilbudEpostMal(pickMal(maler, 'innbytteVisning'), {
    navn: inn.navn || '',
    intro: intro,
    kundeBil: innbytteKundeBil(inn),
    varBil: formatVarBilForEpost(finnMeta, inn.onsketBil)
  });
}

export function buildSelgBilTilbudMelding(inn, pris, maler) {
  const bil = selgBilLabel(inn);
  const fornavn = String(inn.navn || '').trim().split(/\s+/)[0] || 'du';
  const regSuffix = inn.reg ? ` (${inn.reg})` : '';
  return applyTilbudEpostMal(pickMal(maler, 'selgBilTilbud'), {
    fornavn: fornavn,
    bil: bil,
    regSuffix: regSuffix,
    reg: inn.reg || '',
    pris: formatPrisKr(pris)
  });
}

export function buildSelgBilVisningMelding(inn, maler) {
  const bil = selgBilLabel(inn);
  const fornavn = String(inn.navn || '').trim().split(/\s+/)[0] || 'du';
  const regSuffix = inn.reg ? ` (${inn.reg})` : '';
  return applyTilbudEpostMal(pickMal(maler, 'selgBilVisning'), {
    fornavn: fornavn,
    bil: bil,
    regSuffix: regSuffix,
    reg: inn.reg || ''
  });
}
