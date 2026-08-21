'use strict';

const { formatSvvFargeNavn, normalizeSvvDataFarge } = require('./farge');
const VEGVESEN_URL = 'https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata';
const ATLAS_URL = 'https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata';

function normalizeRegNr(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '');
}

function getAt(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce(function (o, k) {
    if (o == null) return null;
    if (/^\d+$/.test(k)) return o[Number(k)];
    return o[k];
  }, obj);
}

function firstItem(list, key) {
  if (!Array.isArray(list) || !list.length) return null;
  const item = list[0];
  if (key) return item?.[key] ?? null;
  if (typeof item === 'string' || typeof item === 'number') return item;
  return item?.handelsbetegnelse || item?.merke || item?.kodeBeskrivelse || item?.kodeNavn || null;
}

/** Vegvesen returnerer ofte både [{ merke: 'X' }] og { merke: 'X' } – normaliser begge. */
function normalizeListEntry(listOrItem, key) {
  if (listOrItem == null || listOrItem === '') return null;
  if (Array.isArray(listOrItem)) return firstItem(listOrItem, key);
  if (typeof listOrItem === 'object') {
    if (key && listOrItem[key] != null && listOrItem[key] !== '') {
      return listOrItem[key];
    }
    return codeValue(listOrItem);
  }
  return displayValue(listOrItem);
}

/** Slå sammen alle handelsbetegnelser — aldri bruk merke som modell. */
function normalizeHandelsbetegnelse(value, typebetegnelse, merke) {
  const parts = [];

  function pushPart(text) {
    const t = String(text || '').trim();
    if (!t) return;
    const lower = t.toLowerCase();
    if (parts.some(function (p) { return p.toLowerCase() === lower; })) return;
    parts.push(t);
  }

  if (value != null && value !== '') {
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (typeof item === 'string' || typeof item === 'number') {
          pushPart(item);
          return;
        }
        if (item && typeof item === 'object' && item.handelsbetegnelse != null && item.handelsbetegnelse !== '') {
          pushPart(item.handelsbetegnelse);
        }
      });
    } else if (typeof value === 'object') {
      pushPart(value.handelsbetegnelse);
    } else {
      pushPart(displayValue(value));
    }
  }

  if (parts.length) return parts.join(' ');

  const type = String(typebetegnelse || '').trim();
  if (!type) return null;

  const brand = String(merke || '').trim();
  if (brand && type.toLowerCase().startsWith(brand.toLowerCase())) {
    const stripped = type.slice(brand.length).trim();
    return stripped || type;
  }

  return type;
}

function pick(obj, paths) {
  for (let i = 0; i < paths.length; i++) {
    const val = getAt(obj, paths[i]);
    const out = displayValue(val);
    if (out) return out;
  }
  return null;
}

function lookupOvrigTekniskData(ovrige, name) {
  if (!Array.isArray(ovrige)) return null;
  const entry = ovrige.find(function (item) {
    return String(item?.datafeltNavn || '').toLowerCase() === String(name).toLowerCase();
  });
  return entry?.datafeltVerdi || null;
}

function codeValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return value.kodeNavn || value.kodeBeskrivelse || value.kodeVerdi || value.beskrivelse || value.merke || null;
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nei';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatNorwegianDate(value);
    return value.trim() || null;
  }
  if (Array.isArray(value)) {
    if (!value.length) return null;
    if (value.every(function (x) { return typeof x !== 'object'; })) {
      return value.filter(Boolean).join(', ');
    }
    const parts = value.map(displayValue).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  return codeValue(value);
}

function kwToHestekrefter(kw) {
  if (kw === null || kw === undefined || kw === '') return null;
  const value = Number(kw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1.35962);
}

function parseMotorer(motor) {
  const list = Array.isArray(motor?.motor) ? motor.motor : [];
  const parsed = list.map(function (mot, idx) {
    const df = firstItem(mot.drivstoff) || getAt(mot, 'drivstoff.0') || {};
    const effektKw = df.maksNettoEffekt ?? null;
    return {
      nr: idx + 1,
      effektKw: effektKw != null ? Number(effektKw) : null,
      effektHk: kwToHestekrefter(effektKw),
      drivstoff: codeValue(df.drivstoffKode),
      motorNummer: mot.motorNummer || null
    };
  }).filter(function (m) {
    return m.effektKw || m.drivstoff || m.motorNummer;
  });

  if (parsed.length) return parsed;

  const topKw = motor?.effektKraftuttakKW;
  if (topKw != null && Number(topKw) > 0) {
    return [{
      nr: 1,
      effektKw: Number(topKw),
      effektHk: kwToHestekrefter(topKw),
      drivstoff: null,
      motorNummer: null
    }];
  }

  return [];
}

function parseRekkeviddeKm(miljo) {
  const out = {
    rekkeviddeKm: null,
    rekkeviddeKmBlandet: null,
    rekkeviddeKmBy: null,
    rekkeviddeKmNedc: null
  };

  getMiljoGrupper(miljo).forEach(function (gruppe) {
    const list = Array.isArray(gruppe?.forbrukOgUtslipp) ? gruppe.forbrukOgUtslipp : [];
    list.forEach(function (forbruk) {
      if (!out.rekkeviddeKm && forbruk?.rekkeviddeKm) out.rekkeviddeKm = forbruk.rekkeviddeKm;
      const wltp = forbruk?.wltpKjoretoyspesifikk
        || forbruk?.wltpTypegodkjenningMaks
        || forbruk?.wltpTypegodkjenningMedium
        || {};
      if (!out.rekkeviddeKmBlandet && wltp.rekkeviddeKmBlandetkjoring) {
        out.rekkeviddeKmBlandet = wltp.rekkeviddeKmBlandetkjoring;
      }
      if (!out.rekkeviddeKmBy && wltp.rekkeviddeKmBykjoring) out.rekkeviddeKmBy = wltp.rekkeviddeKmBykjoring;
      if (!out.rekkeviddeKmNedc && wltp.nedcRekkeviddeKm) out.rekkeviddeKmNedc = wltp.nedcRekkeviddeKm;
    });
  });

  return out;
}

function formatNorwegianDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('nb-NO', {
    timeZone: 'Europe/Oslo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function toIsoDateFromNorwegian(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const nb = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (nb) return `${nb[3]}-${nb[2]}-${nb[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  }
  return '';
}

function nesteEuKontrollIso(parsed) {
  return toIsoDateFromNorwegian(parsed?.nesteEuKontroll);
}

function resolveVehicleFromStoredSvvData(svvData) {
  if (!svvData || typeof svvData !== 'object') return null;
  if (svvData.regNr || (svvData.merke && svvData.modell)) return svvData;
  if (svvData.vehicle && typeof svvData.vehicle === 'object') return svvData.vehicle;
  return null;
}

function getVehicleEntry(raw) {
  return raw?.kjoretoydataListe?.[0] || raw;
}

function getTekniskeData(vehicle) {
  return getAt(vehicle, 'godkjenning.tekniskGodkjenning.tekniskeData') || vehicle?.tekniskeData || {};
}

function getKjoretoyklassifisering(vehicle) {
  return getAt(vehicle, 'godkjenning.tekniskGodkjenning.kjoretoyklassifisering') || {};
}

function getMiljoGrupper(miljo) {
  const grupper = miljo?.miljoOgdrivstoffGruppe || miljo?.miljoOgDrivstoffGruppe;
  return Array.isArray(grupper) ? grupper : [];
}

function getMiljoGruppe(miljo) {
  return getMiljoGrupper(miljo)[0] || {};
}

function getForbruk(gruppe) {
  const list = gruppe?.forbrukOgUtslipp;
  return Array.isArray(list) && list.length ? list[0] : {};
}

function flattenAksler(akslinger) {
  if (!akslinger || typeof akslinger !== 'object') return [];

  if (Array.isArray(akslinger.aksler)) return akslinger.aksler;

  const out = [];
  const grupper = akslinger.akselGruppe || akslinger.akselgruppe || [];
  (Array.isArray(grupper) ? grupper : [grupper]).forEach(function (gruppe) {
    if (!gruppe) return;
    const liste = gruppe.akselListe || gruppe.akselListe;
    const aksler = liste?.aksel;
    if (Array.isArray(aksler)) out.push.apply(out, aksler);
    else if (aksler) out.push(aksler);
  });
  return out;
}

function parseEuKontroll(pkk) {
  const siste = pkk.sistGodkjent || pkk.sistGodkjentDato || pkk.sisteKontroll || pkk.kontrollUtfort || pkk.sisteGodkjenning || null;
  const neste = pkk.kontrollfrist || pkk.kontrollFristDato || pkk.nesteKontroll || null;
  return {
    sisteEuKontroll: formatNorwegianDate(siste),
    nesteEuKontroll: formatNorwegianDate(neste),
    kontrollsted: pkk.kontrollsted || null,
    kontrollType: codeValue(pkk.kontrollType)
  };
}

function parseHjuldrift(motor, akslinger, ovrige) {
  const aksler = flattenAksler(akslinger);
  const driveAxles = aksler.filter(function (aksel) {
    return aksel?.drivAksel === true
      || aksel?.drivAksel === 1
      || String(aksel?.drivAksel).toLowerCase() === 'true';
  });

  if (driveAxles.length > 0) {
    return driveAxles.length === 1 ? '1 aksel' : `${driveAxles.length} aksler`;
  }

  const antallHjul = Number(motor?.antallHjulDrift);
  if (antallHjul >= 4) return '2 aksler';
  if (antallHjul === 2 || antallHjul === 1) return '1 aksel';

  return null;
}

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function yearFromDateValue(value) {
  const d = parseIsoDate(value);
  return d ? d.getFullYear() : null;
}

function parseArsmodellYear(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return null;
  return n;
}

/** Modellår fra tekniske data; ellers år fra 1. gangs registrering — aldri 1. reg. Norge. */
function resolveArsmodell({ generelt, ovrige, kg, forstegangRegistrertRaw }) {
  const explicitRaw = generelt.arModell
    || generelt.arsmodell
    || generelt.aarsmodell
    || lookupOvrigTekniskData(ovrige, 'modellår')
    || lookupOvrigTekniskData(ovrige, 'årsmodell')
    || lookupOvrigTekniskData(ovrige, 'modellaar');
  const explicitYear = parseArsmodellYear(explicitRaw);

  const firstRegYear = yearFromDateValue(forstegangRegistrertRaw);
  const godkjenningsAr = parseArsmodellYear(kg.nasjonalGodkjenning?.nasjonaltGodkjenningsAr);

  if (explicitYear != null) return String(explicitYear);
  if (firstRegYear != null) return String(firstRegYear);
  if (godkjenningsAr != null) return String(godkjenningsAr);
  return null;
}

function parseBruktimport(vehicle, forstegang, registrering, generelt) {
  const godkjenning = vehicle.godkjenning || {};
  const undertype = codeValue(godkjenning.godkjenningsUndertype)
    || codeValue(godkjenning.godkjenningUndertype)
    || codeValue(getAt(vehicle, 'godkjenning.godkjenningsUndertype'));
  if (undertype && /brukt/i.test(undertype)) return 'Ja';
  if (undertype && /nytt|coc|ef.?type/i.test(undertype) && !/brukt/i.test(undertype)) return 'Nei';

  const bruktFlag = godkjenning.bruktImport ?? godkjenning.bruktimport ?? vehicle.bruktImport;
  if (typeof bruktFlag === 'boolean') return bruktFlag ? 'Ja' : 'Nei';
  if (bruktFlag === 1 || bruktFlag === '1') return 'Ja';
  if (bruktFlag === 0 || bruktFlag === '0') return 'Nei';

  const forstegangRegistrertRaw = forstegang.forstegangRegistrertDato
    || forstegang.registrertForstegangUtlandDato
    || forstegang.forstegangsregistrertDato
    || getAt(vehicle, 'godkjenning.forstegangsGodkjenning.forstegangRegistrertDato');

  const forstegangNorgeRaw = vehicle.forstegangsregistrering?.registrertForstegangNorgeDato
    || forstegang.registrertForstegangNorgeDato
    || registrering.registrertForstegangNorge;

  const forstegangRegistrert = parseIsoDate(forstegangRegistrertRaw);
  const forstegangNorge = parseIsoDate(forstegangNorgeRaw);

  if (forstegangRegistrert && forstegangNorge) {
    const diffDays = (forstegangNorge.getTime() - forstegangRegistrert.getTime()) / 86400000;
    if (diffDays > 30) return 'Ja';
    if (diffDays <= 2) return 'Nei';
  }

  const fabrikkLand = codeValue(firstItem(generelt.fabrikkLand, 'kodeNavn'))
    || codeValue(generelt.fabrikant?.fabrikantLand);
  if (forstegangNorge && fabrikkLand && !/norge/i.test(fabrikkLand)) return 'Ja';
  if (forstegangNorge && !forstegangRegistrert) return 'Nei';

  return null;
}

function parseVehicle(raw) {
  const vehicle = getVehicleEntry(raw);
  if (!vehicle || typeof vehicle !== 'object') return null;

  const tekniske = getTekniskeData(vehicle);
  const generelt = tekniske.generelt || {};
  const karosseri = tekniske.karosseriOgLasteplan || {};
  const persontall = tekniske.persontall || {};
  const dimensjoner = tekniske.dimensjoner || {};
  const motor = tekniske.motorOgDrivverk || {};
  const akslinger = tekniske.akslinger || tekniske.aksler || {};
  const miljo = tekniske.miljodata || {};
  const miljoGruppe = getMiljoGruppe(miljo);
  const forbruk = getForbruk(miljoGruppe);
  const wltp = forbruk.wltpKjoretoyspesifikk || forbruk.wltpTypegodkjenningMaks || {};
  const kg = getKjoretoyklassifisering(vehicle);
  const ef = kg.efTypegodkjenning || {};
  const registrering = vehicle.registrering || {};
  const pkk = vehicle.periodiskKjoretoyKontroll || {};
  const ovrige = tekniske.ovrigeTekniskeData || [];
  const forstegang = vehicle.forstegangsregistrering
    || getAt(vehicle, 'godkjenning.forstegangsGodkjenning')
    || {};
  const vekter = tekniske.vekter || {};
  const aksler = flattenAksler(akslinger);

  const motorEntry = firstItem(motor.motor) || getAt(motor, 'motor.0') || {};
  const drivstoffEntry = firstItem(motorEntry?.drivstoff) || firstItem(motor.drivstoff) || getAt(motorEntry, 'drivstoff.0') || {};
  const motorer = parseMotorer(motor);
  const rekkevidde = parseRekkeviddeKm(miljo);

  let effektKw = motor.effektKraftuttakKW || motorEntry?.drivstoff?.[0]?.maksNettoEffekt || null;
  if (drivstoffEntry?.maksNettoEffekt) effektKw = drivstoffEntry.maksNettoEffekt;
  if (!effektKw && motorer.length === 1) effektKw = motorer[0].effektKw;

  const euKontrollData = parseEuKontroll(pkk);

  const forstegangRegistrertRaw = forstegang.forstegangRegistrertDato
    || forstegang.registrertForstegangUtlandDato
    || forstegang.forstegangsregistrertDato
    || getAt(vehicle, 'godkjenning.forstegangsGodkjenning.forstegangRegistrertDato');

  const regNr = vehicle.kjoretoyId?.kjennemerke
    || firstItem(vehicle.kjennemerke, 'kjennemerke')
    || registrering.kjennemerke
    || vehicle.kjennemerke
    || null;

  const arsmodell = resolveArsmodell({
    generelt,
    ovrige,
    kg,
    forstegangRegistrertRaw
  });

  return {
    regNr: regNr ? normalizeRegNr(regNr) : null,
    merke: normalizeListEntry(generelt.merke, 'merke'),
    modell: normalizeHandelsbetegnelse(
      generelt.handelsbetegnelse,
      generelt.typebetegnelse,
      normalizeListEntry(generelt.merke, 'merke')
    ),
    variant: ef.variant || normalizeListEntry(generelt.variant, 'variant') || displayValue(generelt.variant),
    versjon: ef.versjon || normalizeListEntry(generelt.versjon, 'versjon') || displayValue(generelt.versjon),
    arsmodell,
    farge: formatSvvFargeNavn(
      codeValue(normalizeListEntry(karosseri.rFarge, 'kodeNavn'))
      || codeValue(normalizeListEntry(karosseri.rFarge, 'kodeBeskrivelse'))
      || codeValue(normalizeListEntry(karosseri.rFarge))
    ),
    drivstoff: codeValue(miljoGruppe.drivstoffKodeMiljodata) || codeValue(drivstoffEntry?.drivstoffKode) || codeValue(drivstoffEntry),
    girkasse: codeValue(motor.girkassetype) || codeValue(firstItem(motor.girkassetype, 'kodeBeskrivelse')),
    hjuldrift: parseHjuldrift(motor, akslinger, ovrige),
    effektKw,
    effektHk: kwToHestekrefter(effektKw),
    antallMotorer: motorer.length || null,
    motorer,
    rekkeviddeKm: rekkevidde.rekkeviddeKmBlandet || rekkevidde.rekkeviddeKm || rekkevidde.rekkeviddeKmNedc || null,
    rekkeviddeKmBlandet: rekkevidde.rekkeviddeKmBlandet,
    rekkeviddeKmBy: rekkevidde.rekkeviddeKmBy,
    rekkeviddeKmNedc: rekkevidde.rekkeviddeKmNedc,
    antallGir: motor.antallGir,
    antallSylindre: motorEntry?.antallSylindre,
    slagvolum: motorEntry?.slagvolum,
    hybridKategori: codeValue(motor.hybridKategori) || codeValue(motorEntry?.hybridKategori),
    kjoretoyType: codeValue(kg.tekniskKode) || codeValue(generelt.tekniskKode),
    kjoretoyGruppe: codeValue(kg.beskrivelse) || codeValue(kg.kodeBeskrivelse),
    karosseriType: codeValue(karosseri.karosseritype) || codeValue(firstItem(karosseri.karosseritype, 'kodeBeskrivelse')),
    sitteplasser: persontall.sitteplasserTotalt || generelt.sitteplasser || dimensjoner.sitteplasserTotalt,
    antallDorer: karosseri.antallDorer,
    egenvekt: vekter.egenvekt || vekter.egenvektMinimum,
    tillattTotalvekt: vekter.tillattTotalvekt || vekter.tekniskTillattTotalvekt,
    nyttelast: vekter.nyttelast || vekter.maksNyttelast,
    vogntogvekt: vekter.vogntogvekt || vekter.tillattVogntogvekt,
    antallAksler: akslinger.antallAksler || (aksler.length || null),
    akselavstand: dimensjoner.akselavstand,
    lengde: dimensjoner.lengde || karosseri.lengde,
    bredde: dimensjoner.bredde || karosseri.bredde,
    hoyde: dimensjoner.hoyde || karosseri.hoyde,
    euroKlasse: codeValue(miljo.euroKlasse) || codeValue(miljoGruppe.euroKlasse),
    co2Utslipp: forbruk.co2BlandetKjoring || wltp.co2Kombinert || forbruk.vektetKombinertDrivstoffCO2,
    forbrukBlandet: forbruk.forbrukBlandetKjoring || wltp.forbrukKombinert,
    forbrukBy: forbruk.forbrukBykjoring || wltp.forbrukLav,
    forbrukLandevei: forbruk.forbrukLandeveiskjoring || wltp.forbrukHoy,
    wltpForbruk: wltp.forbrukKombinert || wltp.forbrukVektetKombinert,
    sisteEuKontroll: euKontrollData.sisteEuKontroll,
    nesteEuKontroll: euKontrollData.nesteEuKontroll,
    kontrollsted: euKontrollData.kontrollsted,
    kontrollType: euKontrollData.kontrollType,
    understell: vehicle.kjoretoyId?.understellsnummer || generelt.understellsnummer || vehicle.understellsnummer,
    registrertDato: formatNorwegianDate(registrering.registrertForstegangPaEierskap || registrering.fomTidspunkt),
    forstegangsregistrert: formatNorwegianDate(forstegangRegistrertRaw),
    forstegangsregNorge: formatNorwegianDate(
      vehicle.forstegangsregistrering?.registrertForstegangNorgeDato
      || forstegang.registrertForstegangNorgeDato
      || forstegang.forstegangRegistrertDato
      || registrering.registrertForstegangNorge
    ),
    bruktimport: parseBruktimport(vehicle, forstegang, registrering, generelt),
    registreringsstatus: codeValue(registrering.registreringsstatus?.kodeBeskrivelse) || codeValue(registrering.registreringsstatus),
    fabrikkLand: codeValue(firstItem(generelt.fabrikkLand, 'kodeNavn')) || codeValue(generelt.fabrikant?.fabrikantLand),
    typebetegnelse: generelt.typebetegnelse,
    unntakRoz: codeValue(generelt.unntakRoz),
    egenvektMedForer: vekter.egenvektMedForer,
    tillattHjulLast: vekter.tillattHjulLast,
    tillattTaklast: vekter.tillattTaklast,
    tillattVogntogvekt: vekter.tillattVogntogvekt,
    tillattTilhengervektMedBrems: vekter.tillattTilhengervektMedBrems,
    tillattTilhengervektUtenBrems: vekter.tillattTilhengervektUtenBrems,
    maksHastighet: motor.maksimumHastighet || motorEntry?.maksimumHastighet,
    antallHjulDrift: motor.antallHjulDrift,
    partikkelutslipp: forbruk.utslippPartiklerMgPrKm || forbruk.partikkelfilterUtslipp,
    miljoOvertredelse: codeValue(miljoGruppe.miljoklasse)
  };
}

function addField(map, group, label, value) {
  const val = displayValue(value);
  if (!val) return;
  if (!map[group]) map[group] = [];
  const exists = map[group].some(function (f) { return f.label === label; });
  if (exists) return;
  map[group].push({ label: label, value: val });
}

function buildDisplaySections(rawVehicle, parsed) {
  const v = rawVehicle || {};
  const t = getTekniskeData(v);
  const kg = getKjoretoyklassifisering(v);
  const miljo = t.miljodata || {};
  const m = t.motorOgDrivverk || {};
  const akslinger = t.akslinger || t.aksler || {};
  const aksler = flattenAksler(akslinger);
  const map = {};

  const defs = [
    ['Identitet', 'Registreringsnummer', parsed?.regNr || pick(v, ['kjoretoyId.kjennemerke', 'registrering.kjennemerke'])],
    ['Identitet', 'Understellsnummer', parsed?.understell],
    ['Identitet', 'Merke', parsed?.merke],
    ['Identitet', 'Modell / handelsbetegnelse', parsed?.modell],
    ['Identitet', 'Typebetegnelse', parsed?.typebetegnelse],
    ['Identitet', 'Variant', parsed?.variant],
    ['Identitet', 'Versjon', parsed?.versjon],
    ['Identitet', 'Årsmodell', parsed?.arsmodell],
    ['Identitet', 'Fabrikkland', parsed?.fabrikkLand],
    ['Identitet', 'Kjøretøygruppe', parsed?.kjoretoyGruppe],
    ['Identitet', 'Teknisk kode', parsed?.kjoretoyType],
    ['Identitet', 'Karosseri', parsed?.karosseriType],
    ['Identitet', 'Farge', parsed?.farge],
    ['Motor & drivlinje', 'Drivstoff', parsed?.drivstoff],
    ['Motor & drivlinje', 'Girkasse', parsed?.girkasse],
    ['Motor & drivlinje', 'Aksler med drift', parsed?.hjuldrift],
    ['Motor & drivlinje', 'Antall hjul med drift', parsed?.antallHjulDrift],
    ['Motor & drivlinje', 'Effekt (kW)', parsed?.effektKw ? parsed.effektKw + ' kW' : null],
    ['Motor & drivlinje', 'Effekt (hk)', parsed?.effektHk ? parsed.effektHk + ' hk' : null],
    ['Motor & drivlinje', 'Antall motorer', parsed?.antallMotorer],
    ['Motor & drivlinje', 'Antall gir', parsed?.antallGir],
    ['Motor & drivlinje', 'Antall sylindre', parsed?.antallSylindre],
    ['Motor & drivlinje', 'Slagvolum', parsed?.slagvolum ? parsed.slagvolum + ' cm³' : null],
    ['Motor & drivlinje', 'Hybridkategori', parsed?.hybridKategori],
    ['Motor & drivlinje', 'Maks hastighet', parsed?.maksHastighet ? parsed.maksHastighet + ' km/t' : null],
    ['Dimensjoner & kapasitet', 'Sitteplasser', parsed?.sitteplasser],
    ['Dimensjoner & kapasitet', 'Antall dører', parsed?.antallDorer],
    ['Dimensjoner & kapasitet', 'Lengde', parsed?.lengde ? parsed.lengde + ' mm' : null],
    ['Dimensjoner & kapasitet', 'Bredde', parsed?.bredde ? parsed.bredde + ' mm' : null],
    ['Dimensjoner & kapasitet', 'Høyde', parsed?.hoyde ? parsed.hoyde + ' mm' : null],
    ['Dimensjoner & kapasitet', 'Akselavstand', parsed?.akselavstand ? parsed.akselavstand + ' mm' : null],
    ['Dimensjoner & kapasitet', 'Antall aksler', parsed?.antallAksler],
    ['Vekter', 'Egenvekt', parsed?.egenvekt ? parsed.egenvekt + ' kg' : null],
    ['Vekter', 'Egenvekt m/fører', parsed?.egenvektMedForer ? parsed.egenvektMedForer + ' kg' : null],
    ['Vekter', 'Tillatt totalvekt', parsed?.tillattTotalvekt ? parsed.tillattTotalvekt + ' kg' : null],
    ['Vekter', 'Nyttelast', parsed?.nyttelast ? parsed.nyttelast + ' kg' : null],
    ['Vekter', 'Vogntogvekt', parsed?.vogntogvekt ? parsed.vogntogvekt + ' kg' : null],
    ['Vekter', 'Tillatt vogntogvekt', parsed?.tillattVogntogvekt ? parsed.tillattVogntogvekt + ' kg' : null],
    ['Vekter', 'Tillatt taklast', parsed?.tillattTaklast ? parsed.tillattTaklast + ' kg' : null],
    ['Vekter', 'Tillatt tilhenger m/brems', parsed?.tillattTilhengervektMedBrems ? parsed.tillattTilhengervektMedBrems + ' kg' : null],
    ['Vekter', 'Tillatt tilhenger u/brems', parsed?.tillattTilhengervektUtenBrems ? parsed.tillattTilhengervektUtenBrems + ' kg' : null],
    ['Miljø', 'Euro-klasse', parsed?.euroKlasse],
    ['Miljø', 'CO₂-utslipp', parsed?.co2Utslipp ? parsed.co2Utslipp + ' g/km' : null],
    ['Miljø', 'Forbruk blandet', parsed?.forbrukBlandet ? parsed.forbrukBlandet + ' l/100 km' : null],
    ['Miljø', 'Forbruk by', parsed?.forbrukBy ? parsed.forbrukBy + ' l/100 km' : null],
    ['Miljø', 'Forbruk landevei', parsed?.forbrukLandevei ? parsed.forbrukLandevei + ' l/100 km' : null],
    ['Miljø', 'WLTP forbruk', parsed?.wltpForbruk ? parsed.wltpForbruk + ' l/100 km' : null],
    ['Miljø', 'Rekkevidde', parsed?.rekkeviddeKm ? parsed.rekkeviddeKm + ' km' : null],
    ['Miljø', 'Rekkevidde WLTP blandet', parsed?.rekkeviddeKmBlandet ? parsed.rekkeviddeKmBlandet + ' km' : null],
    ['Miljø', 'Rekkevidde WLTP by', parsed?.rekkeviddeKmBy ? parsed.rekkeviddeKmBy + ' km' : null],
    ['Miljø', 'Rekkevidde NEDC', parsed?.rekkeviddeKmNedc ? parsed.rekkeviddeKmNedc + ' km' : null],
    ['Miljø', 'Partikkelutslipp', parsed?.partikkelutslipp],
    ['EU-kontroll', 'Siste EU-kontroll', parsed?.sisteEuKontroll],
    ['EU-kontroll', 'Neste EU-kontroll', parsed?.nesteEuKontroll],
    ['EU-kontroll', 'Kontrollsted', parsed?.kontrollsted],
    ['EU-kontroll', 'Kontrolltype', parsed?.kontrollType],
    ['Registrering', 'Registreringsstatus', parsed?.registreringsstatus],
    ['Registrering', 'Førstegangsregistrert', parsed?.forstegangsregistrert],
    ['Registrering', '1. registrering Norge', parsed?.forstegangsregNorge],
    ['Registrering', 'Bruktimport', parsed?.bruktimport],
    ['Registrering', 'Registrert dato', parsed?.registrertDato],
    ['Registrering', 'Unntak ROZ', parsed?.unntakRoz]
  ];

  defs.forEach(function (d) { addField(map, d[0], d[1], d[2]); });

  (Array.isArray(t.ovrigeTekniskeData) ? t.ovrigeTekniskeData : []).forEach(function (item) {
    addField(map, 'Øvrig teknisk', item.datafeltNavn, item.datafeltVerdi);
  });

  getMiljoGrupper(miljo).forEach(function (grp, idx) {
    const prefix = getMiljoGrupper(miljo).length > 1 ? ' (' + (idx + 1) + ')' : '';
    const fb = getForbruk(grp);
    addField(map, 'Miljø', 'Drivstoff' + prefix, codeValue(grp.drivstoffKodeMiljodata));
    addField(map, 'Miljø', 'Euro-klasse' + prefix, codeValue(miljo.euroKlasse) || codeValue(grp.euroKlasse));
    addField(map, 'Miljø', 'CO₂' + prefix, fb.co2BlandetKjoring || fb.wltpKjoretoyspesifikk?.co2Kombinert);
    addField(map, 'Miljø', 'Forbruk blandet' + prefix, fb.forbrukBlandetKjoring || fb.wltpKjoretoyspesifikk?.forbrukKombinert);
  });

  (Array.isArray(m.motor) ? m.motor : []).forEach(function (mot, idx) {
    const prefix = m.motor.length > 1 ? ' motor ' + (idx + 1) : '';
    addField(map, 'Motor & drivlinje', 'Motornummer' + prefix, mot.motorNummer);
    addField(map, 'Motor & drivlinje', 'Sylindervolum' + prefix, mot.slagvolum ? mot.slagvolum + ' cm³' : null);
    addField(map, 'Motor & drivlinje', 'Drivstoff' + prefix, codeValue(firstItem(mot.drivstoff, 'drivstoffKode')));
    addField(map, 'Motor & drivlinje', 'Effekt' + prefix, mot.drivstoff?.[0]?.maksNettoEffekt ? mot.drivstoff[0].maksNettoEffekt + ' kW' : null);
  });

  aksler.forEach(function (aksel, idx) {
    addField(map, 'Aksler', 'Aksel ' + (idx + 1) + ' – plassering', aksel.plasseringAksel);
    addField(map, 'Aksler', 'Aksel ' + (idx + 1) + ' – drivaksel', aksel.drivAksel ? 'Ja' : aksel.drivAksel === false ? 'Nei' : null);
    addField(map, 'Aksler', 'Aksel ' + (idx + 1) + ' – antall hjul', aksel.antallHjul);
    addField(map, 'Aksler', 'Aksel ' + (idx + 1) + ' – last', aksel.tekniskTillattAkselLast ? aksel.tekniskTillattAkselLast + ' kg' : null);
  });

  const tg = v.godkjenning?.tekniskGodkjenning || {};
  addField(map, 'Godkjenning', 'Godkjenningsnr', tg.godkjenningsId || kg.efTypegodkjenning?.typegodkjenningNrTekst);
  addField(map, 'Godkjenning', 'Godkjenningsår', kg.nasjonalGodkjenning?.nasjonaltGodkjenningsAr);
  addField(map, 'Godkjenning', 'Kjøretøyklassifisering', codeValue(kg.beskrivelse));

  return Object.keys(map).map(function (title) {
    return { title: title, fields: map[title] };
  }).filter(function (s) { return s.fields.length > 0; });
}

function sectionsFromParsed(parsed) {
  if (!parsed) return [];
  const labels = {
    regNr: 'Registreringsnummer',
    understell: 'Understellsnummer',
    merke: 'Merke',
    modell: 'Modell',
    typebetegnelse: 'Typebetegnelse',
    variant: 'Variant',
    versjon: 'Versjon',
    arsmodell: 'Årsmodell',
    farge: 'Farge',
    drivstoff: 'Drivstoff',
    girkasse: 'Girkasse',
    hjuldrift: 'Aksler med drift',
    effektKw: 'Effekt (kW)',
    effektHk: 'Effekt (hk)',
    kjoretoyType: 'Teknisk kode',
    kjoretoyGruppe: 'Kjøretøygruppe',
    karosseriType: 'Karosseri',
    sitteplasser: 'Sitteplasser',
    antallDorer: 'Antall dører',
    egenvekt: 'Egenvekt (kg)',
    tillattTotalvekt: 'Tillatt totalvekt (kg)',
    euroKlasse: 'Euro-klasse',
    sisteEuKontroll: 'Siste EU-kontroll',
    nesteEuKontroll: 'Neste EU-kontroll',
    registreringsstatus: 'Registreringsstatus',
    forstegangsregNorge: '1. registrering Norge',
    forstegangsregistrert: 'Førstegangsregistrert',
    bruktimport: 'Bruktimport'
  };
  const map = { Identitet: [], 'Motor & drivlinje': [], Miljø: [], 'EU-kontroll': [], Registrering: [] };
  Object.keys(labels).forEach(function (key) {
    const val = parsed[key];
    if (val === null || val === undefined || val === '') return;
    const group = ['drivstoff', 'girkasse', 'hjuldrift', 'effektKw', 'effektHk'].includes(key)
      ? 'Motor & drivlinje'
      : ['euroKlasse'].includes(key) ? 'Miljø'
      : ['sisteEuKontroll', 'nesteEuKontroll'].includes(key) ? 'EU-kontroll'
      : ['registreringsstatus', 'forstegangsregNorge', 'forstegangsregistrert', 'bruktimport'].includes(key) ? 'Registrering'
      : 'Identitet';
    map[group].push({ label: labels[key], value: String(val) });
  });
  return Object.keys(map).map(function (title) {
    return { title: title, fields: map[title] };
  }).filter(function (s) { return s.fields.length > 0; });
}

async function fetchFromVegvesen(url, paramName, paramValue, apiKey) {
  const endpoint = new URL(url);
  endpoint.searchParams.set(paramName, paramValue);
  return fetch(endpoint.toString(), {
    headers: { Accept: 'application/json', 'SVV-Authorization': 'Apikey ' + apiKey }
  });
}

function normalizeUnderstellsnummer(value) {
  return String(value || '').toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '');
}

async function lookupVehicleFullByParam(paramName, paramValue, options) {
  const apiKey = options.apiKey;
  const notFoundMessage = options.notFoundMessage;
  const invalidMessage = options.invalidMessage;
  const invalidCode = options.invalidCode;

  if (!apiKey) {
    const error = new Error('Vegvesen API-nøkkel er ikke konfigurert på serveren.');
    error.code = 'MISSING_API_KEY';
    throw error;
  }

  const normalized = String(paramValue || '').trim();
  if (!normalized) {
    const error = new Error(invalidMessage);
    error.code = invalidCode;
    throw error;
  }

  let response = await fetchFromVegvesen(VEGVESEN_URL, paramName, normalized, apiKey);
  if (response.status === 404 || response.status === 204) {
    response = await fetchFromVegvesen(ATLAS_URL, paramName, normalized, apiKey);
  }

  if (response.status === 403) {
    const error = new Error('Ugyldig eller inaktiv API-nøkkel');
    error.code = 'FORBIDDEN';
    throw error;
  }

  if (response.status === 404 || response.status === 204) {
    const error = new Error(notFoundMessage);
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (!response.ok) {
    const error = new Error('Kjøretøyregisteret svarte med en feil');
    error.code = 'UPSTREAM_ERROR';
    throw error;
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    const error = new Error(notFoundMessage);
    error.code = 'NOT_FOUND';
    throw error;
  }

  const data = JSON.parse(rawBody);
  const rawVehicle = getVehicleEntry(data);
  const parsed = parseVehicle(data);

  if (!parsed || (!parsed.merke && !parsed.modell && !parsed.regNr && !parsed.understell)) {
    const error = new Error(notFoundMessage);
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (paramName === 'kjennemerke') {
    parsed.regNr = parsed.regNr || normalized;
  }
  if (paramName === 'understellsnummer' && !parsed.understell) {
    parsed.understell = normalized;
  }

  let sections = buildDisplaySections(rawVehicle, parsed);
  if (!sections.length) sections = sectionsFromParsed(parsed);

  return { parsed: parsed, raw: rawVehicle, sections: sections };
}

async function lookupVehicleFull(regNrInput, apiKey) {
  const kjennemerke = normalizeRegNr(regNrInput);
  if (!kjennemerke || kjennemerke.length < 4) {
    const error = new Error('Ugyldig registreringsnummer');
    error.code = 'INVALID_REGNR';
    throw error;
  }

  return lookupVehicleFullByParam('kjennemerke', kjennemerke, {
    apiKey,
    invalidMessage: 'Ugyldig registreringsnummer',
    invalidCode: 'INVALID_REGNR',
    notFoundMessage: 'Fant ingen bil med dette registreringsnummeret'
  });
}

async function lookupVehicleFullByUnderstell(understellInput, apiKey) {
  const understellsnummer = normalizeUnderstellsnummer(understellInput);
  if (!understellsnummer || understellsnummer.length < 5) {
    const error = new Error('Ugyldig understellsnummer');
    error.code = 'INVALID_UNDERSTELL';
    throw error;
  }

  return lookupVehicleFullByParam('understellsnummer', understellsnummer, {
    apiKey,
    invalidMessage: 'Ugyldig understellsnummer',
    invalidCode: 'INVALID_UNDERSTELL',
    notFoundMessage: 'Fant ingen bil med dette understellsnummeret'
  });
}

async function lookupVehicle(regNrInput, apiKey) {
  const result = await lookupVehicleFull(regNrInput, apiKey);
  return result.parsed;
}

function formatRekkeviddeDisplay(parsed) {
  if (!parsed) return '';
  const parts = [];
  if (parsed.rekkeviddeKmBlandet) parts.push(`${parsed.rekkeviddeKmBlandet} km (WLTP blandet)`);
  else if (parsed.rekkeviddeKm) parts.push(`${parsed.rekkeviddeKm} km`);
  else if (parsed.rekkeviddeKmNedc) parts.push(`${parsed.rekkeviddeKmNedc} km (NEDC)`);
  if (parsed.rekkeviddeKmBy) parts.push(`${parsed.rekkeviddeKmBy} km (WLTP by)`);
  return parts.join(' · ');
}

module.exports = {
  lookupVehicle,
  lookupVehicleFull,
  lookupVehicleFullByUnderstell,
  normalizeRegNr,
  normalizeUnderstellsnummer,
  parseVehicle,
  normalizeHandelsbetegnelse,
  buildDisplaySections,
  sectionsFromParsed,
  toIsoDateFromNorwegian,
  nesteEuKontrollIso,
  resolveVehicleFromStoredSvvData,
  formatRekkeviddeDisplay
};
