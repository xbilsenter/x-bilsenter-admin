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
    const twoWord = `${words[0]} ${words[1]}`;
    if (/^(mørk|lys|metallic)\s+(grå|blå|grønn|rød|sort|hvit|sølv)$/i.test(twoWord)) {
      return twoWord.split(/\s+/).map(function (w, i) {
        return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase();
      }).join(' ');
    }
  }

  const firstColor = words.find(function (w) {
    return /^(grå|sort|hvit|sølv|blå|rød|grønn|gull|oransje|brun|beige|fiolett|gul|rosa)$/i.test(w);
  });
  if (firstColor) {
    return firstColor.charAt(0).toUpperCase() + firstColor.slice(1).toLowerCase();
  }

  return words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase() : s;
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
