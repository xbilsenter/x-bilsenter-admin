'use strict';

/** Enkel fargebetegnelse fra Vegvesen (f.eks. «Grå», ikke «Grå herunder …»). */
function formatSvvFargeNavn(farge) {
  let s = String(farge || '').trim();
  if (!s) return '';

  const herunderIdx = s.search(/\bherunder\b/i);
  if (herunderIdx >= 0) {
    s = s.slice(0, herunderIdx).trim();
  }

  s = s.replace(/\s*\([^)]*\)/g, ' ').trim();
  s = s.split(/[,;/]/)[0].trim();

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const w = words[0];
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  const knownMulti = [
    'Mørk blå', 'Lys blå', 'Mørk grå', 'Lys grå', 'Mørk grønn', 'Lys grønn',
    'Mørk rød', 'Lys rød', 'Metallic grå', 'Metallic blå', 'Metallic sort'
  ];
  const lower = s.toLowerCase();
  const multi = knownMulti.find(function (k) { return lower === k.toLowerCase(); });
  if (multi) return multi;

  if (words.length > 1) {
    const first = words[0];
    if (/^(grå|sort|hvit|sølv|blå|rød|grønn|gull|oransje|brun|beige|fiolett|gul|rosa)$/i.test(first)) {
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
  }

  return s;
}

function normalizeSvvDataFarge(svvData) {
  if (!svvData || typeof svvData !== 'object') return svvData;
  const next = { ...svvData };
  if (next.vehicle && typeof next.vehicle === 'object' && next.vehicle.farge) {
    next.vehicle = {
      ...next.vehicle,
      farge: formatSvvFargeNavn(next.vehicle.farge)
    };
  }
  if (next.farge && !next.vehicle) {
    next.farge = formatSvvFargeNavn(next.farge);
  }
  return next;
}

module.exports = {
  formatSvvFargeNavn,
  normalizeSvvDataFarge
};
