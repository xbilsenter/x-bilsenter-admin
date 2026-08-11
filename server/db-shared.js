'use strict';

const { MERKER, normalizeMerkerList } = require('./merker');

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Serveren kjører i UTC på Vercel, så tidssonen må settes eksplisitt for at
// klokkeslettene skal stemme med norsk tid.
const NORSK_TIDSSONE = 'Europe/Oslo';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('nb-NO', {
    timeZone: NORSK_TIDSSONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).replace(',', '');
}

const DEFAULT_VEDLIKEHOLD = {
  aktiv: false,
  melding: 'Vi jobber med nettsiden og er snart tilbake. Takk for tålmodigheten!'
};

const DEFAULT_BIL_STATUS_FARGER = {
  Innkjøpt: '#6B7280', Transport: '#7C3AED', Klargjøring: '#2563EB',
  Lakkering: '#DB2777', Fotografering: '#D97706', Verksted: '#DC2626',
  Tilstandsrapport: '#EA580C', Annonsert: '#059669', Reservert: '#0891B2',
  Utlevering: '#65A30D', Solgt: '#16A34A', Etteroppfølging: '#7C3AED'
};

const DEFAULT_HENV_STATUS_FARGER = {
  Ny: '#DC2626',
  Tildelt: '#D97706',
  Besvart: '#2563EB',
  'Venter på kunde': '#7C3AED',
  Avsluttet: '#6B7280'
};

const DEFAULT_SJEKKLISTE_MAL = [
  'Vasket innvendig', 'Polert', 'Fotografert', 'FINN-annonse', 'Tilstandsrapport'
];

const DEFAULT_BIL_SJEKKLISTER = {
  Innkjøpt: ['Mottatt bil', 'Registrert i system'],
  Transport: ['Transport bestilt', 'Ankomst bekreftet'],
  Klargjøring: ['Vasket innvendig', 'Polert'],
  Lakkering: ['Lakkering bestilt', 'Lakkering ferdig'],
  Fotografering: ['Fotografert', 'Bilder godkjent'],
  Verksted: ['Verkstedssjekk', 'Feil utbedret'],
  Tilstandsrapport: ['Tilstandsrapport bestilt', 'Tilstandsrapport mottatt'],
  Annonsert: ['FINN-annonse', 'Pris og tekst oppdatert'],
  Reservert: ['Reservasjon bekreftet', 'Depositum mottatt'],
  Utlevering: ['Klargjort til utlevering', 'Overlevert nøkler'],
  Solgt: [],
  Etteroppfølging: ['Oppfølgingssamtale']
};

const SFARGE = DEFAULT_BIL_STATUS_FARGER;

const DEFAULT_INNBYTTE_STATUS_FARGER = {
  Ny: '#DC2626',
  'Under vurdering': '#D97706',
  'Tilbud sendt': '#2563EB',
  Akseptert: '#16A34A',
  Avslått: '#DC2626'
};

const {
  DEFAULT_TILBUD_EPOST_MALER,
  normalizeTilbudEpostMaler
} = require('../shared/tilbud-epost-maler');

const DEFAULT_INNSTILLINGER = {
  ansatte: ['Waleed', 'Ahmed', 'Sara', 'Mikael', 'Lena'],
  merker: MERKER,
  bilStatuser: [
    'Innkjøpt', 'Transport', 'Klargjøring', 'Lakkering',
    'Fotografering', 'Verksted', 'Tilstandsrapport',
    'Annonsert', 'Reservert', 'Utlevering', 'Solgt', 'Etteroppfølging'
  ],
  bilStatusFarger: DEFAULT_BIL_STATUS_FARGER,
  bilSjekklister: DEFAULT_BIL_SJEKKLISTER,
  sjekklisteMal: DEFAULT_SJEKKLISTE_MAL,
  henvStatuser: ['Ny', 'Tildelt', 'Besvart', 'Venter på kunde', 'Avsluttet'],
  henvStatusFarger: DEFAULT_HENV_STATUS_FARGER,
  innbytteStatuser: ['Ny', 'Under vurdering', 'Tilbud sendt', 'Akseptert', 'Avslått'],
  innbytteStatusFarger: DEFAULT_INNBYTTE_STATUS_FARGER,
  kalTyper: [
    'Visning', 'Prøvekjøring', 'Utlevering', 'Verksted',
    'Fotografering', 'Klargjøring', 'Internt', 'Annet'
  ],
  modulOppsett: [
    { id: 'dashboard', label: 'Oversikt' },
    { id: 'biler', label: 'Biler' },
    { id: 'kunder', label: 'Kunder' },
    { id: 'henvendelser', label: 'Kontaktskjema' },
    { id: 'innboks', label: 'Innboks' },
    { id: 'innbytte', label: 'Innbytte' },
    { id: 'selgbil', label: 'Selg bil' },
    { id: 'kalender', label: 'Kalender' },
    { id: 'innkjopskalkyle', label: 'Innkjøpskalkyle' },
    { id: 'oppgaver', label: 'Oppgaver' },
    { id: 'timeregistrering', label: 'Timeregistrering' },
    { id: 'vegvesen', label: 'Vegvesen-oppslag' },
    { id: 'innstillinger', label: 'Innstillinger' }
  ],
  tilbudEpostMaler: DEFAULT_TILBUD_EPOST_MALER
};

const SETTINGS_KEYS = {
  ansatte: 'ansatte',
  merker: 'merker',
  bilStatuser: 'bil_statuser',
  henvStatuser: 'henv_statuser',
  innbytteStatuser: 'innbytte_statuser',
  kalTyper: 'kal_typer'
};

const PASS_MASK = '••••••••';

const PERMISSION_DEFS = [
  { id: 'dashboard', label: 'Oversikt' },
  { id: 'biler', label: 'Biler' },
  { id: 'kunder', label: 'Kunder' },
  { id: 'henvendelser', label: 'Kontaktskjema' },
  { id: 'innboks', label: 'Innboks' },
  { id: 'innbytte', label: 'Innbytte' },
  { id: 'selgbil', label: 'Selg bil' },
  { id: 'kalender', label: 'Kalender' },
  { id: 'innkjopskalkyle', label: 'Innkjøpskalkyle' },
  { id: 'oppgaver', label: 'Oppgaver' },
  { id: 'timeregistrering', label: 'Timeregistrering' },
  { id: 'vegvesen', label: 'Vegvesen-oppslag' },
  { id: 'innstillinger', label: 'Innstillinger' },
  { id: 'brukere', label: 'Brukerstyring' }
];

const ALL_PERMISSION_IDS = PERMISSION_DEFS.map(function (p) { return p.id; });

const ROLE_TEMPLATES = {
  'Daglig leder': ALL_PERMISSION_IDS,
  Innkjøpssjef: ['dashboard', 'biler', 'kunder', 'henvendelser', 'innbytte', 'selgbil', 'innkjopskalkyle', 'kalender', 'vegvesen'],
  Selger: ['dashboard', 'biler', 'kunder', 'henvendelser', 'innboks', 'innbytte', 'selgbil', 'kalender', 'vegvesen'],
  Klargjører: ['dashboard', 'biler', 'oppgaver', 'timeregistrering', 'vegvesen'],
  Verksted: ['dashboard', 'biler', 'oppgaver', 'timeregistrering', 'vegvesen'],
  'Kun leser': ['dashboard', 'biler', 'kunder', 'henvendelser', 'innbytte', 'selgbil', 'kalender']
};

const LEGACY_ROLE_ALIASES = {
  Admin: 'Daglig leder',
  Regnskap: 'Innkjøpssjef'
};

function resolveRoleKey(role) {
  const key = String(role || '').trim();
  return LEGACY_ROLE_ALIASES[key] || key;
}

function resolveRoleTemplate(role) {
  return ROLE_TEMPLATES[resolveRoleKey(role)] || ROLE_TEMPLATES.Selger;
}

function canDeleteBil(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return resolveRoleKey(user.role) === 'Innkjøpssjef';
}

function normalizeModulOppsett(list) {
  const defaults = DEFAULT_INNSTILLINGER.modulOppsett;
  const defaultById = {};
  defaults.forEach(function (item) { defaultById[item.id] = item; });

  const byId = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (!item || !item.id || !defaultById[item.id]) return;
    const fallback = defaultById[item.id].label;
    byId[item.id] = {
      id: item.id,
      label: String(item.label || '').trim() || fallback
    };
  });

  const result = [];
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (!item?.id || !byId[item.id]) return;
    if (result.some(function (row) { return row.id === item.id; })) return;
    result.push(byId[item.id]);
  });

  defaults.forEach(function (item) {
    if (!result.some(function (row) { return row.id === item.id; })) {
      result.push(byId[item.id] || { ...item });
    }
  });

  result.forEach(function (item) {
    if (item.id === 'henvendelser' && item.label === 'Henvendelser') {
      item.label = 'Kontaktskjema';
    }
  });

  return result;
}

function permissionDefsWithModulLabels(modulOppsett) {
  const labelById = {};
  normalizeModulOppsett(modulOppsett).forEach(function (mod) {
    labelById[mod.id] = mod.label;
  });
  return PERMISSION_DEFS.map(function (perm) {
    return { id: perm.id, label: labelById[perm.id] || perm.label };
  });
}

function normalizeVedlikeholdModus(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const melding = String(src.melding || DEFAULT_VEDLIKEHOLD.melding).trim()
    || DEFAULT_VEDLIKEHOLD.melding;
  return {
    aktiv: !!src.aktiv,
    melding
  };
}

function normalizeBilStatusFarger(statuser, farger) {
  const src = farger && typeof farger === 'object' ? farger : {};
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    acc[status] = src[status] || DEFAULT_BIL_STATUS_FARGER[status] || SFARGE[status] || '#6B7280';
    return acc;
  }, {});
}

function normalizeHenvStatusFarger(statuser, farger) {
  const src = farger && typeof farger === 'object' ? farger : {};
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    acc[status] = src[status] || DEFAULT_HENV_STATUS_FARGER[status] || '#6B7280';
    return acc;
  }, {});
}

function normalizeInnbytteStatusFarger(statuser, farger) {
  const src = farger && typeof farger === 'object' ? farger : {};
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    acc[status] = src[status] || DEFAULT_INNBYTTE_STATUS_FARGER[status] || '#6B7280';
    return acc;
  }, {});
}

function normalizeSjekklisteMalItem(item) {
  if (typeof item === 'string') {
    const raw = String(item);
    if (!raw.trim()) return null;
    return { t: raw, obligatorisk: true, forhandsvalgt: false };
  }
  if (item && typeof item === 'object') {
    const raw = String(item.t ?? item.text ?? '');
    if (!raw.trim()) return null;
    return {
      t: raw,
      obligatorisk: item.obligatorisk !== false,
      forhandsvalgt: !!item.forhandsvalgt
    };
  }
  return null;
}

function trimSjekklisteMalTekst(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

function finalizeSjekklisteMalItems(items) {
  return normalizeSjekklisteMalItems(items).map(function (item) {
    return { ...item, t: trimSjekklisteMalTekst(item.t) };
  }).filter(function (item) { return item.t; });
}

function normalizeSjekklisteMalItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeSjekklisteMalItem)
    .filter(Boolean);
}

function normalizeSjekklisteItem(item) {
  if (typeof item === 'string') {
    const t = item.trim();
    return t ? { t: t, f: false, obligatorisk: true } : null;
  }
  if (item && typeof item === 'object') {
    const t = String(item.t || '').trim();
    if (!t) return null;
    return {
      t: t,
      f: !!item.f,
      obligatorisk: item.obligatorisk !== false
    };
  }
  return null;
}

function normalizeSjekklisteItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeSjekklisteItem)
    .filter(Boolean);
}

function harApneObligatoriskeOppgaver(list) {
  return normalizeSjekklisteItems(list).some(function (s) {
    return s.obligatorisk && !s.f;
  });
}

function normalizeBilSjekklister(statuser, sjekklister, legacyMal) {
  const src = sjekklister && typeof sjekklister === 'object' && !Array.isArray(sjekklister)
    ? sjekklister
    : {};
  const fallback = normalizeSjekklisteMalItems(legacyMal).length
    ? finalizeSjekklisteMalItems(legacyMal)
    : finalizeSjekklisteMalItems(DEFAULT_SJEKKLISTE_MAL);
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    const items = src[status];
    if (Array.isArray(items)) {
      acc[status] = finalizeSjekklisteMalItems(items);
    } else if (Array.isArray(DEFAULT_BIL_SJEKKLISTER[status])) {
      acc[status] = finalizeSjekklisteMalItems(DEFAULT_BIL_SJEKKLISTER[status]);
    } else {
      acc[status] = fallback.slice();
    }
    return acc;
  }, {});
}

function sjekklisteFraMalServer(mal) {
  return normalizeSjekklisteMalItems(mal).map(function (item) {
    return { t: item.t, f: !!item.forhandsvalgt, obligatorisk: item.obligatorisk };
  });
}

function parseBilSjekklisterObject(row) {
  const perStatus = parseJson(row?.sjekklister, null);
  if (perStatus && typeof perStatus === 'object' && !Array.isArray(perStatus)) {
    return perStatus;
  }
  const legacy = parseJson(row?.sjekkliste, []);
  if (Array.isArray(legacy) && legacy.length && row?.status) {
    return { [row.status]: legacy };
  }
  return {};
}

function getAktivSjekklisteFromRow(row, sjekklister) {
  const per = sjekklister || parseBilSjekklisterObject(row);
  const list = per[row.status];
  if (Array.isArray(list)) return normalizeSjekklisteItems(list);
  return normalizeSjekklisteItems(parseJson(row.sjekkliste, []));
}

function ensureSjekklisterForStatus(sjekklister, status, malPerStatus) {
  const per = {};
  Object.keys(sjekklister || {}).forEach(function (key) {
    per[key] = sjekklister[key];
  });
  if (!Array.isArray(per[status]) || !per[status].length) {
    const mal = (malPerStatus && malPerStatus[status]) || [];
    per[status] = sjekklisteFraMalServer(mal);
  }
  return per;
}

function syncSjekklisteFromMalServer(existingItems, mal) {
  const existing = normalizeSjekklisteItems(existingItems);
  const doneByText = {};
  existing.forEach(function (item) {
    const key = trimSjekklisteMalTekst(item.t).toLowerCase();
    doneByText[key] = !!item.f;
  });
  return normalizeSjekklisteMalItems(mal).map(function (malItem) {
    const t = trimSjekklisteMalTekst(malItem.t);
    const key = t.toLowerCase();
    const hadBefore = Object.prototype.hasOwnProperty.call(doneByText, key);
    return {
      t: t,
      f: hadBefore ? doneByText[key] : !!malItem.forhandsvalgt,
      obligatorisk: malItem.obligatorisk !== false
    };
  });
}

function syncBilSjekklisterFromMalServer(bilOrRow, malPerStatus) {
  const status = bilOrRow.status || 'Innkjøpt';
  const per = {};
  const src = parseBilSjekklisterObject(bilOrRow);
  Object.keys(src || {}).forEach(function (key) {
    per[key] = src[key];
  });
  const mal = malPerStatus || {};
  Object.keys(mal).forEach(function (st) {
    per[st] = syncSjekklisteFromMalServer(per[st], mal[st] || []);
  });
  Object.keys(per).forEach(function (st) {
    if (!Object.prototype.hasOwnProperty.call(mal, st)) delete per[st];
  });
  return {
    sjekklister: per,
    sjekkliste: normalizeSjekklisteItems(per[status] || [])
  };
}

function normalizeKundeEpost(epost) {
  return String(epost || '').trim().toLowerCase();
}

function canDeleteHenvKommentar(comment, user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (comment.userId == null) return false;
  return Number(comment.userId) === Number(user.sub || user.id);
}

function normalizeHenvKommentarer(list) {
  return (Array.isArray(list) ? list : []).map(function (item, index) {
    if (item && typeof item === 'object' && item.text != null) {
      return {
        id: String(item.id || `legacy-${index}`),
        text: String(item.text),
        userId: item.userId != null ? Number(item.userId) : null,
        userName: String(item.userName || 'Ukjent'),
        createdAt: String(item.createdAt || '')
      };
    }

    const raw = String(item || '');
    const match = raw.match(/^(.+?):\s*(.+)$/s);
    if (match) {
      return {
        id: `legacy-${index}`,
        text: match[2].trim(),
        userId: null,
        userName: 'Ukjent',
        createdAt: match[1].trim()
      };
    }

    return {
      id: `legacy-${index}`,
      text: raw,
      userId: null,
      userName: 'Ukjent',
      createdAt: ''
    };
  });
}

function createInternKommentar(text, user) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text: String(text || '').trim(),
    userId: user != null ? Number(user.sub || user.id) : null,
    userName: user != null ? String(user.name || user.username || 'Ukjent') : 'System',
    createdAt: new Date().toISOString()
  };
}

function mergeHenvKommentarer(existingJson, incoming, user) {
  const oldList = normalizeHenvKommentarer(parseJson(existingJson, []));
  const newList = normalizeHenvKommentarer(incoming);
  const oldById = {};
  oldList.forEach(function (item) { oldById[item.id] = item; });

  oldList.forEach(function (old) {
    if (!newList.some(function (item) { return item.id === old.id; })) {
      if (!canDeleteHenvKommentar(old, user)) {
        throw new Error('Du kan ikke slette denne kommentaren.');
      }
    }
  });

  return newList.map(function (item) {
    const prev = oldById[item.id];
    if (prev) {
      if (
        prev.text !== item.text
        || prev.userId !== item.userId
        || prev.userName !== item.userName
        || prev.createdAt !== item.createdAt
      ) {
        throw new Error('Kommentarer kan ikke redigeres.');
      }
      return prev;
    }

    const text = String(item.text || '').trim();
    if (!text) throw new Error('Kommentaren kan ikke være tom.');

    return {
      id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      text,
      userId: Number(user.sub || user.id),
      userName: String(user.name || user.username || 'Ukjent'),
      createdAt: item.createdAt || new Date().toISOString()
    };
  });
}

function normalizeSmtpPortForStorage(port) {
  const value = Number(port || 587);
  if (value === 463) return 465;
  return value;
}

function normalizePermissions(list) {
  const allowed = new Set(ALL_PERMISSION_IDS);
  return Array.from(new Set((list || []).filter(function (p) { return allowed.has(p); })));
}

function jsonStringify(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function normalizeKmField(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n;
}

const DEFAULT_BIL_TILSTANDSRAPPORT = {
  medfolger: false,
  nybilgaranti: false,
  status: 'ikke_utfort',
  stylingDelerNodvendig: false,
  stylingDelerBestilt: false,
  reparasjonsdelerNodvendig: false,
  reparasjonsdelerBestilt: false,
  felglakkeringNodvendig: false,
  felglakkeringUtfort: false,
  lakkeringNodvendig: false,
  lakkeringUtfort: false,
  lakkstiftLakkboksNodvendig: false,
  lakkstiftLakkboksUtfort: false,
  bulkopprettingNodvendig: false,
  bulkopprettingUtfort: false,
  chromeDeleteNodvendig: false,
  chromeDeleteUtfort: false
};

function normalizeBilTilstandsrapport(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  let status = null;
  if (o.status === 'utfort') status = 'utfort';
  else if (o.status === 'ikke_utfort') status = 'ikke_utfort';
  return {
    medfolger: !!o.medfolger,
    nybilgaranti: !!o.nybilgaranti,
    status: status,
    stylingDelerNodvendig: !!o.stylingDelerNodvendig,
    stylingDelerBestilt: !!o.stylingDelerBestilt,
    reparasjonsdelerNodvendig: !!(o.reparasjonsdelerNodvendig || o.reparasjonsdelerMaBestilles),
    reparasjonsdelerBestilt: !!o.reparasjonsdelerBestilt,
    felglakkeringNodvendig: !!o.felglakkeringNodvendig,
    felglakkeringUtfort: !!o.felglakkeringUtfort,
    lakkeringNodvendig: !!o.lakkeringNodvendig,
    lakkeringUtfort: !!o.lakkeringUtfort,
    lakkstiftLakkboksNodvendig: !!o.lakkstiftLakkboksNodvendig,
    lakkstiftLakkboksUtfort: !!o.lakkstiftLakkboksUtfort,
    bulkopprettingNodvendig: !!o.bulkopprettingNodvendig,
    bulkopprettingUtfort: !!o.bulkopprettingUtfort,
    chromeDeleteNodvendig: !!o.chromeDeleteNodvendig,
    chromeDeleteUtfort: !!o.chromeDeleteUtfort
  };
}

const DEFAULT_BIL_ARSPROVEKJENNEMERKE = {
  skiltnummer: '',
  fraDato: '',
  tilDato: '',
  status: 'ingen',
  notater: ''
};

function normalizeBilArsprovekjennemerke(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const status = ['ingen', 'bestilt', 'aktiv', 'utlopt'].includes(o.status) ? o.status : 'ingen';
  const iso = function (value) {
    if (!value) return '';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const nb = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (nb) return `${nb[3]}-${nb[2]}-${nb[1]}`;
    return '';
  };
  return {
    skiltnummer: String(o.skiltnummer || '').trim().toUpperCase(),
    fraDato: iso(o.fraDato),
    tilDato: iso(o.tilDato),
    status: status,
    notater: String(o.notater || '')
  };
}

const NYE_INNKOMMENDE_EPOST_DAGER = 14;

function nyeInnkommendeEpostSince() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - NYE_INNKOMMENDE_EPOST_DAGER);
  return d.toISOString();
}

function epostThreadKeySql(alias) {
  const a = alias || 'e';
  return `COALESCE(NULLIF(${a}.thread_id, ''), ${a}.message_id, 'id-' || CAST(${a}.id AS TEXT))`;
}

module.exports = {
  parseJson,
  formatDate,
  DEFAULT_VEDLIKEHOLD,
  DEFAULT_BIL_STATUS_FARGER,
  DEFAULT_HENV_STATUS_FARGER,
  DEFAULT_INNBYTTE_STATUS_FARGER,
  DEFAULT_SJEKKLISTE_MAL,
  DEFAULT_BIL_SJEKKLISTER,
  DEFAULT_INNSTILLINGER,
  SETTINGS_KEYS,
  PASS_MASK,
  PERMISSION_DEFS,
  ALL_PERMISSION_IDS,
  ROLE_TEMPLATES,
  LEGACY_ROLE_ALIASES,
  resolveRoleKey,
  resolveRoleTemplate,
  canDeleteBil,
  normalizeModulOppsett,
  permissionDefsWithModulLabels,
  normalizeVedlikeholdModus,
  normalizeBilStatusFarger,
  normalizeHenvStatusFarger,
  normalizeInnbytteStatusFarger,
  normalizeBilSjekklister,
  sjekklisteFraMalServer,
  parseBilSjekklisterObject,
  getAktivSjekklisteFromRow,
  ensureSjekklisterForStatus,
  syncSjekklisteFromMalServer,
  syncBilSjekklisterFromMalServer,
  harApneObligatoriskeOppgaver,
  normalizeKundeEpost,
  canDeleteHenvKommentar,
  normalizeHenvKommentarer,
  createInternKommentar,
  mergeHenvKommentarer,
  normalizeSmtpPortForStorage,
  normalizePermissions,
  jsonStringify,
  DEFAULT_BIL_TILSTANDSRAPPORT,
  normalizeBilTilstandsrapport,
  DEFAULT_BIL_ARSPROVEKJENNEMERKE,
  normalizeBilArsprovekjennemerke,
  normalizeMerkerList,
  NYE_INNKOMMENDE_EPOST_DAGER,
  nyeInnkommendeEpostSince,
  epostThreadKeySql,
  DEFAULT_TILBUD_EPOST_MALER,
  normalizeTilbudEpostMaler,
  normalizeKmField
};
