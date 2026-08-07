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

export function normalizeBilSjekklister(statuser, sjekklister, legacyMal) {
  const src = sjekklister && typeof sjekklister === 'object' && !Array.isArray(sjekklister)
    ? sjekklister
    : {};
  const fallback = Array.isArray(legacyMal) ? legacyMal : DEFAULT_SJEKKLISTE_MAL;
  return (Array.isArray(statuser) ? statuser : []).reduce(function (acc, status) {
    const items = src[status];
    if (Array.isArray(items)) {
      acc[status] = items.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
    } else if (Array.isArray(DEFAULT_BIL_SJEKKLISTER[status])) {
      acc[status] = DEFAULT_BIL_SJEKKLISTER[status].slice();
    } else {
      acc[status] = fallback.slice();
    }
    return acc;
  }, {});
}

export function sjekklisteFraMal(mal) {
  return (Array.isArray(mal) ? mal : DEFAULT_SJEKKLISTE_MAL).map(function (t) {
    return { t: String(t || '').trim(), f: false };
  }).filter(function (item) { return item.t; });
}

export function getAktivSjekkliste(bil) {
  if (!bil) return [];
  const per = bil.sjekklister;
  if (per && typeof per === 'object' && !Array.isArray(per)) {
    const list = per[bil.status];
    if (Array.isArray(list)) return list;
  }
  return Array.isArray(bil.sjekkliste) ? bil.sjekkliste : [];
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
  per[status] = newList;
  return {
    sjekklister: per,
    sjekkliste: newList
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
  if (!role) return 'Administrator';
  const legacy = { 'Daglig leder': 'Admin', Regnskap: 'Innkjøpssjef' };
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
