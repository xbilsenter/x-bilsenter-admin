export const BIL_STATUSER = [
  'Innkjøpt', 'Transport', 'Klargjøring', 'Lakkering',
  'Fotografering', 'Verksted', 'Tilstandsrapport',
  'Annonsert', 'Reservert', 'Utlevering', 'Solgt', 'Etteroppfølging'
];

export const HENV_STATUSER = ['Ny', 'Tildelt', 'Besvart', 'Venter på kunde', 'Avsluttet'];

export const DEFAULT_HENV_STATUS_FARGER = {
  Ny: '#DC2626',
  Tildelt: '#D97706',
  Besvart: '#2563EB',
  'Venter på kunde': '#7C3AED',
  Avsluttet: '#6B7280'
};

export function normalizeHenvStatusFarger(statuser, farger) {
  const src = farger && typeof farger === 'object' ? farger : {};
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    acc[status] = src[status] || DEFAULT_HENV_STATUS_FARGER[status] || '#6B7280';
    return acc;
  }, {});
}

export const DEFAULT_BIL_STATUS_FARGER = {
  Innkjøpt: '#6B7280', Transport: '#7C3AED', Klargjøring: '#2563EB',
  Lakkering: '#DB2777', Fotografering: '#D97706', Verksted: '#DC2626',
  Tilstandsrapport: '#EA580C', Annonsert: '#059669', Reservert: '#0891B2',
  Utlevering: '#65A30D', Solgt: '#16A34A', Etteroppfølging: '#7C3AED'
};

export function normalizeBilStatusFarger(statuser, farger) {
  const src = farger && typeof farger === 'object' ? farger : {};
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    acc[status] = src[status] || DEFAULT_BIL_STATUS_FARGER[status] || SFARGE[status] || '#6B7280';
    return acc;
  }, {});
}

export const DEFAULT_SJEKKLISTE_MAL = [
  'Vasket innvendig', 'Polert', 'Fotografert', 'FINN-annonse', 'Tilstandsrapport'
];

export const DEFAULT_BIL_SJEKKLISTER = {
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

export function normalizeSjekklisteMalItem(item) {
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

export function trimSjekklisteMalTekst(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

export function finalizeSjekklisteMalItems(items) {
  return normalizeSjekklisteMalItems(items).map(function (item) {
    return { ...item, t: trimSjekklisteMalTekst(item.t) };
  }).filter(function (item) { return item.t; });
}

export function normalizeSjekklisteMalItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeSjekklisteMalItem)
    .filter(Boolean);
}

export function normalizeSjekklisteItem(item) {
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

export function normalizeSjekklisteItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeSjekklisteItem)
    .filter(Boolean);
}

export function calcSjekklisteFremdrift(list) {
  const items = normalizeSjekklisteItems(list);
  const oblig = items.filter(function (s) { return s.obligatorisk; });
  const f = oblig.filter(function (s) { return s.f; }).length;
  const t = oblig.length;
  const pst = t ? Math.round(f / t * 100) : (items.length ? 100 : 0);
  return { f: f, t: t, pst: pst, total: items.length };
}

export function harApneObligatoriskeOppgaver(list) {
  return normalizeSjekklisteItems(list).some(function (s) {
    return s.obligatorisk && !s.f;
  });
}

export function normalizeBilSjekklister(statuser, sjekklister, legacyMal) {
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

export function sjekklisteFraMal(mal) {
  return normalizeSjekklisteMalItems(mal).map(function (item) {
    return { t: item.t, f: !!item.forhandsvalgt, obligatorisk: item.obligatorisk };
  });
}

export function getAktivSjekkliste(bil) {
  if (!bil) return [];
  const per = bil.sjekklister;
  if (per && typeof per === 'object' && !Array.isArray(per)) {
    const list = per[bil.status];
    if (Array.isArray(list)) return normalizeSjekklisteItems(list);
  }
  return normalizeSjekklisteItems(bil.sjekkliste);
}

export function withSjekklisteUpdate(bil, newList) {
  const status = bil.status || 'Innkjøpt';
  const per = {};
  const src = bil.sjekklister && typeof bil.sjekklister === 'object' && !Array.isArray(bil.sjekklister)
    ? bil.sjekklister
    : {};
  Object.keys(src).forEach(function (key) { per[key] = src[key]; });
  if (!Object.keys(per).length && Array.isArray(bil.sjekkliste) && bil.sjekkliste.length) {
    per[status] = bil.sjekkliste;
  }
  per[status] = normalizeSjekklisteItems(newList);
  return {
    sjekklister: per,
    sjekkliste: per[status]
  };
}

export function withStatusChange(bil, newStatus, bilSjekklisterMal) {
  const per = {};
  const src = bil.sjekklister && typeof bil.sjekklister === 'object' && !Array.isArray(bil.sjekklister)
    ? bil.sjekklister
    : {};
  Object.keys(src).forEach(function (key) { per[key] = src[key]; });
  const oldStatus = bil.status || 'Innkjøpt';
  if (!Object.keys(per).length && Array.isArray(bil.sjekkliste) && bil.sjekkliste.length) {
    per[oldStatus] = bil.sjekkliste;
  }
  if (!Array.isArray(per[newStatus]) || !per[newStatus].length) {
    const mal = bilSjekklisterMal?.[newStatus] || [];
    per[newStatus] = sjekklisteFraMal(mal);
  }
  return {
    status: newStatus,
    sjekklister: per,
    sjekkliste: per[newStatus] || []
  };
}

export function initBilSjekklister(status, bilSjekklisterMal) {
  const mal = bilSjekklisterMal?.[status] || [];
  const list = sjekklisteFraMal(mal);
  return {
    sjekklister: { [status]: list },
    sjekkliste: list
  };
}

export function statusColor(status, colors) {
  return (colors && colors[status]) || SFARGE[status] || '#6B7280';
}

export function statusBadgeStyle(status, colors) {
  const c = statusColor(status, colors);
  return { background: c + '18', color: c, border: `1px solid ${c}30` };
}

export function statusCardStyle(status, colors) {
  const c = statusColor(status, colors);
  return {
    background: `linear-gradient(135deg, ${c}16 0%, ${c}08 42%, var(--s1) 100%)`,
    borderColor: c + '30',
    boxShadow: `inset 4px 0 0 ${c}`
  };
}

export function resolveListStatus(statuser, key) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return String(key || '').trim();
  const list = Array.isArray(statuser) ? statuser : [];
  const match = list.find(function (s) {
    return String(s || '').trim().toLowerCase() === normalized;
  });
  return match || String(key || '').trim();
}

export const INNBYTTE_STATUSER = ['Ny', 'Under vurdering', 'Tilbud sendt', 'Akseptert', 'Avslått'];

export const DEFAULT_INNBYTTE_STATUS_FARGER = {
  Ny: '#DC2626',
  'Under vurdering': '#D97706',
  'Tilbud sendt': '#2563EB',
  Akseptert: '#16A34A',
  Avslått: '#DC2626'
};

export function normalizeInnbytteStatusFarger(statuser, farger) {
  const src = farger && typeof farger === 'object' ? farger : {};
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    acc[status] = src[status] || DEFAULT_INNBYTTE_STATUS_FARGER[status] || SFARGE[status] || '#6B7280';
    return acc;
  }, {});
}

export const KAL_TYPER = [
  'Visning', 'Prøvekjøring', 'Utlevering', 'Verksted',
  'Fotografering', 'Klargjøring', 'Internt', 'Annet'
];

export const ANSATTE = ['Waleed', 'Ahmed', 'Sara', 'Mikael', 'Lena'];

export const MERKER = [
  'Audi', 'BMW', 'Chevrolet', 'Citroën', 'Dacia', 'Ford', 'Honda', 'Hyundai',
  'Kia', 'Mazda', 'Mercedes', 'Mitsubishi', 'Nissan', 'Opel', 'Peugeot', 'Renault',
  'Seat', 'Skoda', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo', 'Annet'
];

export const SFARGE = {
  Innkjøpt: '#6B7280', Transport: '#7C3AED', Klargjøring: '#2563EB',
  Lakkering: '#DB2777', Fotografering: '#D97706', Verksted: '#DC2626',
  Tilstandsrapport: '#EA580C', Annonsert: '#059669', Reservert: '#0891B2',
  Utlevering: '#65A30D', Solgt: '#16A34A', Etteroppfølging: '#7C3AED',
  Ny: '#DC2626', Tildelt: '#D97706', Besvart: '#2563EB', 'Venter på kunde': '#7C3AED',
  Avsluttet: '#6B7280', 'Under vurdering': '#D97706', 'Tilbud sendt': '#2563EB',
  Akseptert: '#16A34A', Avslått: '#DC2626',
  Visning: '#2563EB', Prøvekjøring: '#7C3AED', Utlevering2: '#16A34A',
  Verksted2: '#DC2626', Fotografering2: '#D97706', Klargjøring2: '#0891B2',
  Internt: '#6B7280', Annet: '#6B7280'
};

export const KFARGE = {
  Visning: '#2563EB', Prøvekjøring: '#7C3AED', Utlevering: '#16A34A',
  Verksted: '#DC2626', Fotografering: '#D97706', Klargjøring: '#0891B2',
  Internt: '#6B7280', Annet: '#9CA3AF'
};

export const TOKEN_KEY = 'xbilsenter_admin_token';
export const ACTIVE_TAB_KEY = 'xbilsenter_admin_tab';
export const BILER_VIEW_KEY = 'xbilsenter_admin_biler_view';
export const BILER_SECTION_KEY = 'xbilsenter_admin_biler_section';

export function getSavedTab() {
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    if (saved && TAB_PERMISSIONS[saved]) return saved;
  } catch {
    /* ignore */
  }
  return 'dashboard';
}

export function saveActiveTab(tab) {
  try {
    if (tab && TAB_PERMISSIONS[tab]) {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    }
  } catch {
    /* ignore */
  }
}

export function getSavedBilerView() {
  try {
    const saved = localStorage.getItem(BILER_VIEW_KEY);
    if (saved === 'kanban' || saved === 'liste') return saved;
  } catch {
    /* ignore */
  }
  return 'kanban';
}

export function saveBilerView(view) {
  try {
    if (view === 'kanban' || view === 'liste') {
      localStorage.setItem(BILER_VIEW_KEY, view);
    }
  } catch {
    /* ignore */
  }
}

export function getSavedBilerSection() {
  try {
    const saved = localStorage.getItem(BILER_SECTION_KEY);
    if (saved === 'lager' || saved === 'arkiv') return saved;
  } catch {
    /* ignore */
  }
  return 'lager';
}

export function saveBilerSection(section) {
  try {
    if (section === 'lager' || section === 'arkiv') {
      localStorage.setItem(BILER_SECTION_KEY, section);
    }
  } catch {
    /* ignore */
  }
}

export function displayRole(role) {
  if (!role) return 'Daglig leder';
  const legacy = { Admin: 'Daglig leder', Regnskap: 'Innkjøpssjef' };
  return legacy[role] || role;
}

export const TAB_PERMISSIONS = {
  dashboard: 'dashboard',
  biler: 'biler',
  kunder: 'kunder',
  henvendelser: 'henvendelser',
  innboks: 'innboks',
  innbytte: 'innbytte',
  selgbil: 'selgbil',
  kalender: 'kalender',
  innkjopskalkyle: 'innkjopskalkyle',
  oppgaver: 'oppgaver',
  vegvesen: 'vegvesen',
  innstillinger: 'innstillinger'
};

export function canAccess(user, permission) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return (user.permissions || []).includes(permission);
}

const LEGACY_ROLE_ALIASES = { Admin: 'Daglig leder', Regnskap: 'Innkjøpssjef' };

export function resolveRoleKey(role) {
  const key = String(role || '').trim();
  return LEGACY_ROLE_ALIASES[key] || key;
}

export function canDeleteBil(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return resolveRoleKey(user.role) === 'Innkjøpssjef';
}

export const AUKSJON_PLATTFORMER = [
  'Rebil',
  'AYVENS',
  'BCA',
  'DNB',
  'Autoringen',
  'Nettbil',
  'Autoproff',
  'Drivalia',
  'Auksjonen.no',
  'Stadssalg'
];

export function calcInnkjopspris(input) {
  const utsalgspris = Number(input?.utsalgspris) || 0;
  const kostnader = (Number(input?.pakost) || 0)
    + (Number(input?.aukGebyr) || 0)
    + (Number(input?.garantikost) || 0)
    + (Number(input?.omregAvgift) || 0)
    + (Number(input?.avanse) || 0);
  return utsalgspris - kostnader;
}

export const DEFAULT_BIL_OKONOMI = {
  pakost: 0,
  aukGebyr: 0,
  garantikost: 0,
  omregAvgift: 0,
  kostnader: []
};

export function normalizeBilOkonomi(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    pakost: Number(o.pakost) || 0,
    aukGebyr: Number(o.aukGebyr) || 0,
    garantikost: Number(o.garantikost) || 0,
    omregAvgift: Number(o.omregAvgift) || 0,
    kostnader: (Array.isArray(o.kostnader) ? o.kostnader : []).map(function (item, index) {
      return {
        id: String(item?.id || `kost-${index}`),
        label: String(item?.label || '').trim(),
        belop: Number(item?.belop) || 0
      };
    }).filter(function (item) { return item.label || item.belop; })
  };
}

export const DEFAULT_BIL_TILSTANDSRAPPORT = {
  medfolger: false,
  nybilgaranti: false,
  status: 'ikke_utfort'
};

export function normalizeBilTilstandsrapport(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  let status = null;
  if (o.status === 'utfort') status = 'utfort';
  else if (o.status === 'ikke_utfort') status = 'ikke_utfort';
  return {
    medfolger: !!o.medfolger,
    nybilgaranti: !!o.nybilgaranti,
    status: status
  };
}

export function normalizeEuKontrollDato(value) {
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

export function formatEuKontrollVisning(value) {
  const iso = normalizeEuKontrollDato(value);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(value || '');
  const parts = iso.split('-');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/** Måneder igjen til EU-frist (kalender, Europe/Oslo). Negativ = passert. */
export function euKontrollManederIgjen(value) {
  const iso = normalizeEuKontrollDato(value);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [ey, em, ed] = iso.split('-').map(Number);

  let months = (ey - ty) * 12 + (em - tm);
  if (ed < td) months -= 1;
  return months;
}

/** Grønn >15 mnd, oransje 3–15 mnd, rød <3 mnd (eller passert). */
export function euKontrollChipClass(value) {
  const months = euKontrollManederIgjen(value);
  if (months == null) return 'chip-gray';
  if (months < 3) return 'chip-red';
  if (months > 15) return 'chip-green';
  return 'chip-orange';
}

export const DEFAULT_BIL_ARSPROVEKJENNEMERKE = {
  skiltnummer: '',
  fraDato: '',
  tilDato: '',
  status: 'ingen',
  notater: ''
};

export const ARSPROVEKJENNEMERKE_STATUSER = [
  { id: 'ingen', label: 'Ingen' },
  { id: 'bestilt', label: 'Bestilt' },
  { id: 'aktiv', label: 'Aktiv' },
  { id: 'utlopt', label: 'Utløpt' }
];

/** Faste prøveskilt-sett i bedriften */
export const PROVASKILT_SETT = [
  { id: 'AGZ51', label: 'AGZ 51' },
  { id: 'AJB82', label: 'AJB 82' }
];

export function normalizeProvaskiltId(value) {
  return String(value || '').trim().toUpperCase().replace(/\s/g, '');
}

export function formatProvaskiltLabel(value) {
  const id = normalizeProvaskiltId(value);
  const found = PROVASKILT_SETT.find(function (s) { return s.id === id; });
  if (found) return found.label;
  const match = id.match(/^([A-ZÆØÅ]{2,3})(\d{1,5})$/);
  return match ? `${match[1]} ${match[2]}` : id;
}

export function finnBilMedProvaskilt(biler, skiltId, excludeBilId) {
  const target = normalizeProvaskiltId(skiltId);
  if (!target) return null;
  return (Array.isArray(biler) ? biler : []).find(function (b) {
    if (excludeBilId != null && Number(b.id) === Number(excludeBilId)) return false;
    const ap = normalizeBilArsprovekjennemerke(b.arsprovekjennemerke);
    if (!ap.skiltnummer) return false;
    if (normalizeProvaskiltId(ap.skiltnummer) !== target) return false;
    return ap.status === 'aktiv' || ap.status === 'bestilt';
  }) || null;
}

export function normalizeBilArsprovekjennemerke(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const status = ['ingen', 'bestilt', 'aktiv', 'utlopt'].includes(o.status) ? o.status : 'ingen';
  const skiltRaw = String(o.skiltnummer || '').trim();
  const skiltId = normalizeProvaskiltId(skiltRaw);
  const known = PROVASKILT_SETT.find(function (s) { return s.id === skiltId; });
  return {
    skiltnummer: known ? known.label : (skiltRaw ? formatProvaskiltLabel(skiltRaw) : ''),
    fraDato: normalizeEuKontrollDato(o.fraDato),
    tilDato: normalizeEuKontrollDato(o.tilDato),
    status: status,
    notater: String(o.notater || '')
  };
}

export function arsprovekjennemerkeStatusLabel(status) {
  const item = ARSPROVEKJENNEMERKE_STATUSER.find(function (row) { return row.id === status; });
  return item ? item.label : 'Ingen';
}

/** Vis chip øverst i bilmodal kun når årsprøvekjennemerke faktisk er i bruk */
export function erArsprovekjennemerkeIbruk(raw) {
  const ap = normalizeBilArsprovekjennemerke(raw);
  if (ap.status !== 'aktiv') return false;
  if (ap.tilDato) {
    const tilMs = new Date(`${ap.tilDato}T23:59:59`).getTime();
    if (!Number.isNaN(tilMs) && tilMs < Date.now()) return false;
  }
  return true;
}

export function calcBilOkonomi(innkjop, salg, okonomi) {
  const o = normalizeBilOkonomi(okonomi);
  const inn = Number(innkjop) || 0;
  const ut = Number(salg) || 0;
  const fasteKostnader = o.pakost + o.aukGebyr + o.garantikost + o.omregAvgift;
  const ekstraKostnader = o.kostnader.reduce(function (sum, item) {
    return sum + (Number(item.belop) || 0);
  }, 0);
  const totaltKostnader = fasteKostnader + ekstraKostnader;
  const bruttoMargin = ut - inn;
  const nettoMargin = bruttoMargin - totaltKostnader;
  const marginProsent = ut > 0 ? Math.round((nettoMargin / ut) * 1000) / 10 : 0;
  return {
    bruttoMargin,
    nettoMargin,
    totaltKostnader,
    fasteKostnader,
    ekstraKostnader,
    marginProsent
  };
}

export function canDeleteHenvKommentar(comment, user) {
  if (!user || !comment) return false;
  if (user.isAdmin) return true;
  if (comment.userId == null) return false;
  return Number(comment.userId) === Number(user.id);
}

export function createHenvKommentar(text, user) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text: String(text || '').trim(),
    userId: user?.id ?? null,
    userName: user?.name || user?.username || 'Ukjent',
    createdAt: new Date().toISOString()
  };
}

export function normalizeInternKommentarer(list) {
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

export function formatKommentarDato(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('nb-NO', {
      timeZone: 'Europe/Oslo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return String(value);
}

export function ansvarligSelectOptions(lists, currentValue) {
  const options = Array.isArray(lists?.ansatte) ? [...lists.ansatte] : [];
  const current = String(currentValue || '').trim();
  if (current && !options.includes(current)) {
    options.unshift(current);
  }
  return options;
}

export function bilMatchesSearch(bil, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !bil) return false;
  const hay = [
    bil.reg,
    bil.merke,
    bil.modell,
    bil.farge,
    bil.status,
    bil.ansvarlig,
    bil.notater,
    bil.internInfo,
    bil.finnKode,
    bil.chassisnr,
    bil.drivstoff,
    bil.girkasse,
    bil.utstyr,
    bil.forsikring,
    bil.tilstandsrapport?.status === 'utfort' ? 'tilstandsrapport utfort' : 'tilstandsrapport ikke utfort',
    bil.tilstandsrapport?.medfolger ? 'medfolger' : '',
    bil.tilstandsrapport?.nybilgaranti ? 'nybilgaranti' : '',
    bil.arsprovekjennemerke?.skiltnummer,
    bil.arsprovekjennemerke?.status,
    bil.archived ? 'arkiv' : 'lager',
    ...(bil.kommentarer || []).map(function (item) { return item.text; }),
    ...(bil.dokumenter || []).map(function (item) { return item.name; })
  ].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every(function (term) { return hay.includes(term); });
}

export const MODUL_ICONS = {
  dashboard: '▦',
  biler: '🚗',
  kunder: '👤',
  henvendelser: '✉',
  innboks: '📥',
  innbytte: '⇄',
  selgbil: '💰',
  kalender: '📅',
  innkjopskalkyle: '🧮',
  oppgaver: '☑',
  vegvesen: '🔍',
  innstillinger: '⚙'
};

export const DEFAULT_MODUL_OPPSATT = [
  { id: 'dashboard', label: 'Oversikt' },
  { id: 'biler', label: 'Biler' },
  { id: 'kunder', label: 'Kunder' },
  { id: 'henvendelser', label: 'Henvendelser' },
  { id: 'innboks', label: 'Innboks' },
  { id: 'innbytte', label: 'Innbytte' },
  { id: 'selgbil', label: 'Selg bil' },
  { id: 'kalender', label: 'Kalender' },
  { id: 'innkjopskalkyle', label: 'Innkjøpskalkyle' },
  { id: 'oppgaver', label: 'Oppgaver' },
  { id: 'vegvesen', label: 'Vegvesen-oppslag' },
  { id: 'innstillinger', label: 'Innstillinger' }
];

export function normalizeModulOppsett(list) {
  const defaults = DEFAULT_MODUL_OPPSATT;
  const defaultById = {};
  defaults.forEach(function (item) { defaultById[item.id] = item; });

  const byId = {};
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (!item || !item.id || !defaultById[item.id]) return;
    byId[item.id] = {
      id: item.id,
      label: String(item.label || '').trim() || defaultById[item.id].label
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

  return result;
}

export function buildModulTabs(oppsett, badges, user) {
  return normalizeModulOppsett(oppsett).map(function (mod) {
    return {
      id: mod.id,
      ic: MODUL_ICONS[mod.id] || '•',
      lbl: mod.label,
      badge: badges[mod.id] || 0
    };
  }).filter(function (t) {
    return canAccess(user, TAB_PERMISSIONS[t.id]);
  });
}

export const DEFAULT_INNSTILLINGER = {
  vedlikeholdModus: {
    aktiv: false,
    melding: 'Vi jobber med nettsiden og er snart tilbake. Takk for tålmodigheten!'
  },
  ansatte: ANSATTE,
  merker: MERKER,
  bilStatuser: BIL_STATUSER,
  bilStatusFarger: DEFAULT_BIL_STATUS_FARGER,
  bilSjekklister: DEFAULT_BIL_SJEKKLISTER,
  sjekklisteMal: DEFAULT_SJEKKLISTE_MAL,
  henvStatuser: HENV_STATUSER,
  henvStatusFarger: DEFAULT_HENV_STATUS_FARGER,
  innbytteStatuser: INNBYTTE_STATUSER,
  innbytteStatusFarger: DEFAULT_INNBYTTE_STATUS_FARGER,
  kalTyper: KAL_TYPER,
  modulOppsett: DEFAULT_MODUL_OPPSATT
};
