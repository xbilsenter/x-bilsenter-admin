'use strict';

const { formatSvvFargeNavn } = require('./farge');
const { lookupVehicleFull, formatRekkeviddeDisplay } = require('./vegvesen');

function hasValue(value) {
  return value != null && String(value).trim() !== '';
}

async function enrichIngestVehicleBody(body) {
  const next = { ...(body || {}) };
  next.farge = formatSvvFargeNavn(next.farge) || next.farge || '';

  const apiKey = process.env.VEGVESEN_API_KEY || '';
  if (!next.regnr || !apiKey) return next;

  try {
    const result = await lookupVehicleFull(next.regnr, apiKey);
    const v = result?.parsed;
    if (!v) return next;

    if (!hasValue(next.nesteEuKontroll)) next.nesteEuKontroll = v.nesteEuKontroll || '';
    if (!hasValue(next.sisteEuKontroll)) next.sisteEuKontroll = v.sisteEuKontroll || '';
    if (!hasValue(next.effektHk) && v.effektHk != null) next.effektHk = v.effektHk;
    if (!hasValue(next.effektKw) && v.effektKw != null) next.effektKw = v.effektKw;
    if (!hasValue(next.hjuldrift)) next.hjuldrift = v.hjuldrift || '';
    if (!hasValue(next.forstegangsregistrert)) next.forstegangsregistrert = v.forstegangsregistrert || '';
    if (!hasValue(next.antallMotorer) && v.antallMotorer != null) next.antallMotorer = v.antallMotorer;
    if (!hasValue(next.rekkevidde)) next.rekkevidde = formatRekkeviddeDisplay(v) || '';
    if (!Array.isArray(next.motorer) || !next.motorer.length) next.motorer = Array.isArray(v.motorer) ? v.motorer : [];
    if (!hasValue(next.farge)) next.farge = formatSvvFargeNavn(v.farge) || v.farge || '';
    if (!hasValue(next.drivstoff)) next.drivstoff = v.drivstoff || '';
    if (!hasValue(next.girkasse)) next.girkasse = v.girkasse || '';
    if (!hasValue(next.bruktimport)) next.bruktimport = v.bruktimport || '';
  } catch (err) {
    console.warn('[ingest/vegvesen]', next.regnr, err.message);
  }

  return next;
}

function ingestVehicleDbFields(body) {
  const b = body || {};
  const motorer = Array.isArray(b.motorer) ? b.motorer : [];
  return {
    farge: formatSvvFargeNavn(b.farge) || b.farge || '',
    hjuldrift: b.hjuldrift || '',
    effekt_hk: b.effektHk != null && b.effektHk !== '' ? String(b.effektHk) : '',
    effekt_kw: b.effektKw != null && b.effektKw !== '' ? String(b.effektKw) : '',
    siste_eu_kontroll: b.sisteEuKontroll || '',
    neste_eu_kontroll: b.nesteEuKontroll || '',
    forstegangsregistrert: b.forstegangsregistrert || '',
    antall_motorer: b.antallMotorer != null && b.antallMotorer !== '' ? String(b.antallMotorer) : '',
    rekkevidde: b.rekkevidde || '',
    bruktimport: b.bruktimport || '',
    motorer: JSON.stringify(motorer)
  };
}

module.exports = {
  enrichIngestVehicleBody,
  ingestVehicleDbFields
};
