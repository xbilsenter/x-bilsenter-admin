import { getFinnMarkedssok } from './api.js';

export const FINN_KM_SLACK = 30000;
export const FINN_KM_SLACK_KALKYLE = 20000;

export function normalizeFinnSearchTerm(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (upper.length <= 3 || /^(BMW|VW|MG|DS)$/i.test(upper)) return upper;
  return s.toLowerCase().replace(/(?:^|[\s\-/])\w/g, function (ch) {
    return ch.toUpperCase();
  });
}

export function canFinnMarkedsSok(inn) {
  return !!(String(inn?.merke || '').trim() || String(inn?.modell || '').trim());
}

export function fmtKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toLocaleString('nb-NO');
}

export function finnMarkedsSokFilterText(inn, kmSlack = FINN_KM_SLACK) {
  const parts = [];
  const aar = Number(inn?.aar);
  if (aar > 1980) parts.push(`fra ${aar - 1}, nyere uten tak`);
  const km = Number(inn?.km);
  if (Number.isFinite(km) && km > 0) {
    parts.push(`maks ${fmtKm(km + kmSlack)} km`);
  }
  return parts.join(' · ');
}

export function finnMarkedsSokLabel(inn) {
  const merke = normalizeFinnSearchTerm(inn?.merke);
  const modell = normalizeFinnSearchTerm(inn?.modell);
  if (merke && modell) return `${merke} ${modell}`;
  if (merke) return merke;
  if (modell) return modell;
  return 'tilsvarende biler';
}

export async function openFinnMarkedsSok(inn, options) {
  if (!canFinnMarkedsSok(inn)) return false;
  const kmSlack = options?.kmSlack != null ? options.kmSlack : FINN_KM_SLACK;
  const res = await getFinnMarkedssok({
    merke: inn?.merke,
    modell: inn?.modell,
    aar: inn?.aar,
    km: inn?.km,
    kmSlack
  });
  const url = res?.item?.url;
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

function parseModellField(modell) {
  const parts = String(modell || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { merke: '', modell: '', aar: null };
  let aar = null;
  const last = parts[parts.length - 1];
  if (/^\d{4}$/.test(last) && Number(last) > 1980) {
    aar = Number(last);
    parts.pop();
  }
  const merke = parts[0] || '';
  const modellNavn = parts.slice(1).join(' ');
  return { merke, modell: modellNavn, aar };
}

function parseKm(value) {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function buildKalkyleFinnSok(form) {
  const autosys = form?.autosysData || {};
  const km = parseKm(form?.kmstand) || null;

  if (autosys.merke || autosys.modell) {
    return {
      merke: autosys.merke || '',
      modell: autosys.modell || '',
      aar: autosys.arsmodell || null,
      km
    };
  }

  return { ...parseModellField(form?.modell), km };
}

export function canKalkyleFinnMarkedsSok(form) {
  const km = parseKm(form?.kmstand);
  if (!km || km <= 0) return false;
  return canFinnMarkedsSok(buildKalkyleFinnSok(form));
}
