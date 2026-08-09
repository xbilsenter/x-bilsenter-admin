'use strict';

const DEFAULT_TILBUD_EPOST_MALER = {
  innbytteTilbud: [
    'Hei {{navn}},',
    '',
    '{{intro}}',
    '',
    'Vi er nærmere {{pris}} for din bil i innbytte.',
    '',
    'Ønsker du å avtale visning av vår bil?'
  ].join('\n'),
  innbytteVisning: [
    'Hei {{navn}},',
    '',
    '{{intro}}',
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

const TILBUD_EPOST_MAL_KEYS = Object.keys(DEFAULT_TILBUD_EPOST_MALER);

const TILBUD_EPOST_MAL_DEFS = [
  {
    key: 'innbytteTilbud',
    title: 'Innbytte – tilbud',
    desc: 'Brukes når du sender innbyttetilbud på e-post fra innbytte-modulen.',
    placeholders: ['{{navn}}', '{{intro}}', '{{pris}}', '{{kundeBil}}', '{{varBil}}']
  },
  {
    key: 'innbytteVisning',
    title: 'Innbytte – avtale visning',
    desc: 'Brukes når du inviterer kunden til visning av bil i innbytte-modulen.',
    placeholders: ['{{navn}}', '{{intro}}', '{{kundeBil}}', '{{varBil}}']
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

function normalizeTilbudEpostMaler(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  TILBUD_EPOST_MAL_KEYS.forEach(function (key) {
    const val = String(src[key] != null ? src[key] : DEFAULT_TILBUD_EPOST_MALER[key] || '').trim();
    out[key] = val || DEFAULT_TILBUD_EPOST_MALER[key];
  });
  return out;
}

function applyTilbudEpostMal(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, function (_match, key) {
    const val = vars && vars[key];
    return val != null ? String(val) : '';
  });
}

module.exports = {
  DEFAULT_TILBUD_EPOST_MALER,
  TILBUD_EPOST_MAL_KEYS,
  TILBUD_EPOST_MAL_DEFS,
  normalizeTilbudEpostMaler,
  applyTilbudEpostMal
};
