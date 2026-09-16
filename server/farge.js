'use strict';

/** Enkel fargebetegnelse fra Vegvesen (f.eks. «Grå», «Blåsvart» — ikke «herunder: …»). */
function formatSvvFargeNavn(farge) {
  let s = String(farge || '').trim();
  if (!s) return '';

  if (/^herunder\s*:/i.test(s)) {
    s = s.replace(/^herunder\s*:\s*/i, '').trim();
  } else {
    const herunderIdx = s.search(/\bherunder\b/i);
    if (herunderIdx > 0) {
      s = s.slice(0, herunderIdx).trim();
    }
  }

  s = s.replace(/\s*\([^)]*\)/g, ' ').trim();
  s = s.split(/[,;/]/)[0].trim();
  if (!s) return '';

  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  if (words.length <= 3 && s.length <= 32) {
    return words.map(function (w, i) {
      return i === 0
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase();
    }).join(' ');
  }

  const firstColor = words.find(function (w) {
    return /^(grå|sort|hvit|sølv|blå|rød|grønn|gull|oransje|brun|beige|fiolett|gul|rosa)$/i.test(w);
  });
  if (firstColor) {
    return firstColor.charAt(0).toUpperCase() + firstColor.slice(1).toLowerCase();
  }

  const w = words[0];
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
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
