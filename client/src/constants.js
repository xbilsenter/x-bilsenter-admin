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

/** Bevarer tom tekst under redigering – brukes kun i innstillings-editor. */
export function coerceSjekklisteMalRow(item) {
  if (typeof item === 'string') {
    return { t: String(item), obligatorisk: true, forhandsvalgt: false };
  }
  if (item && typeof item === 'object') {
    return {
      t: String(item.t ?? item.text ?? ''),
      obligatorisk: item.obligatorisk !== false,
      forhandsvalgt: !!item.forhandsvalgt
    };
  }
  return null;
}

export function coerceSjekklisteMalRows(items) {
  return (Array.isArray(items) ? items : [])
    .map(coerceSjekklisteMalRow)
    .filter(Boolean);
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

export function getSisteKryssedeSjekklisteItem(items) {
  const list = normalizeSjekklisteItems(items);
  let siste = '';
  list.forEach(function (item) {
    if (item.f && item.t) siste = item.t;
  });
  return siste || null;
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

export function syncSjekklisteFromMal(existingItems, mal) {
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

export function mergeOrphanSjekklisteItemsIntoMal(bilSjekklister, biler, statuser) {
  const mal = { ...(bilSjekklister || {}) };
  (Array.isArray(statuser) ? statuser : []).forEach(function (status) {
    const malItems = finalizeSjekklisteMalItems(mal[status] || []);
    const malTexts = {};
    malItems.forEach(function (item) {
      malTexts[trimSjekklisteMalTekst(item.t).toLowerCase()] = true;
    });
    const orphans = [];
    (Array.isArray(biler) ? biler : []).forEach(function (bil) {
      const per = bil.sjekklister;
      if (!per || typeof per !== 'object' || Array.isArray(per)) return;
      const list = per[status];
      if (!Array.isArray(list)) return;
      normalizeSjekklisteItems(list).forEach(function (item) {
        const key = trimSjekklisteMalTekst(item.t).toLowerCase();
        if (!key || malTexts[key]) return;
        malTexts[key] = true;
        orphans.push({
          t: item.t,
          obligatorisk: item.obligatorisk !== false,
          forhandsvalgt: false
        });
      });
    });
    mal[status] = orphans.length
      ? finalizeSjekklisteMalItems([...malItems, ...orphans])
      : malItems;
  });
  return mal;
}

export function syncBilSjekklisterFromMal(bil, malPerStatus) {
  const status = bil.status || 'Innkjøpt';
  const per = {};
  const src = bil.sjekklister && typeof bil.sjekklister === 'object' && !Array.isArray(bil.sjekklister)
    ? bil.sjekklister
    : {};
  Object.keys(src).forEach(function (key) { per[key] = src[key]; });
  if (!Object.keys(per).length && Array.isArray(bil.sjekkliste) && bil.sjekkliste.length) {
    per[status] = bil.sjekkliste;
  }
  const mal = malPerStatus || {};
  Object.keys(mal).forEach(function (st) {
    per[st] = syncSjekklisteFromMal(per[st], mal[st] || []);
  });
  Object.keys(per).forEach(function (st) {
    if (!Object.prototype.hasOwnProperty.call(mal, st)) delete per[st];
  });
  return {
    sjekklister: per,
    sjekkliste: normalizeSjekklisteItems(per[status] || [])
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

import merkerJson from '../../merker.json';
import { DEFAULT_TILBUD_EPOST_MALER } from './lib/tilbudEpostMaler.js';

export const MERKER = merkerJson;

export function normalizeMerkerList(stored, defaults) {
  const defaultsList = Array.isArray(defaults) && defaults.length ? defaults : MERKER;
  const base = Array.isArray(stored)
    ? stored.map(function (m) { return String(m || '').trim(); }).filter(Boolean)
    : [];
  const seen = new Set(base.map(function (m) { return m.toLowerCase(); }));

  defaultsList.forEach(function (m) {
    const label = String(m || '').trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    base.push(label);
  });

  const annet = base.filter(function (m) { return m.toLowerCase() === 'annet'; });
  const rest = base.filter(function (m) { return m.toLowerCase() !== 'annet'; });
  rest.sort(function (a, b) { return a.localeCompare(b, 'nb'); });
  return annet.length ? rest.concat(['Annet']) : rest;
}

/** Slå sammen innstillinger, biler i bruk og valgt merke til komplett nedtrekksliste. */
export function buildMerkeOptions(merker, biler, currentMerke) {
  const extras = [];
  (biler || []).forEach(function (b) { extras.push(b.merke); });
  if (currentMerke) extras.push(currentMerke);

  const merged = normalizeMerkerList(merker, []);
  const seen = new Set(merged.map(function (m) { return m.toLowerCase(); }));
  const toAdd = [];

  extras.forEach(function (item) {
    const s = String(item || '').trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    toAdd.push(s);
  });

  if (!toAdd.length) return merged;

  const withoutAnnet = merged.filter(function (m) { return m.toLowerCase() !== 'annet'; });
  const hasAnnet = merged.some(function (m) { return m.toLowerCase() === 'annet'; });
  withoutAnnet.push(...toAdd.sort(function (a, b) { return a.localeCompare(b, 'nb'); }));
  if (hasAnnet) withoutAnnet.push('Annet');
  return withoutAnnet;
}

export function resolveMerkeFromLists(merke, merker) {
  const normalized = String(merke || '').trim();
  if (!normalized) return 'Annet';

  const exact = merker.find(function (m) {
    return m.toLowerCase() === normalized.toLowerCase();
  });
  if (exact) return exact;

  return normalized;
}

/** Handelsbetegnelse (modell) fra Autosys/Vegvesen — kun merke og modell, ikke typebetegnelse. */
export function buildFullBilModellFromVehicle(v) {
  if (!v || typeof v !== 'object') return '';
  return String(v.modell || '').trim();
}

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

export function buildNyeHenvendelserItems(opts) {
  const henv = opts.henv || [];
  const innbytte = opts.innbytte || [];
  const selgBil = opts.selgBil || [];
  const ulestEpost = opts.ulestEpost || [];
  const inkluderEpost = !!opts.inkluderEpost;
  const items = [];

  henv.filter(function (h) { return h.status === 'Ny'; }).forEach(function (h) {
    items.push({
      key: 'henv-' + h.id,
      type: 'henvendelse',
      typeLabel: 'Kontaktskjema',
      dato: h.dato || '',
      navn: h.navn || '—',
      sub: h.epost || '',
      emne: h.emne || '—',
      detalj: h.bilRef || '—',
      status: h.status,
      data: h
    });
  });

  innbytte.filter(function (i) { return i.status === 'Ny'; }).forEach(function (i) {
    items.push({
      key: 'inb-' + i.id,
      type: 'innbytte',
      typeLabel: 'Innbytte',
      dato: i.dato || '',
      navn: i.navn || '—',
      sub: i.epost || i.tlf || '',
      emne: [i.merke, i.modell, i.aar].filter(Boolean).join(' ') || 'Innbyttebil',
      detalj: i.onsketBil || i.reg || '—',
      status: i.status,
      data: i
    });
  });

  selgBil.filter(function (s) { return s.status === 'Ny'; }).forEach(function (s) {
    items.push({
      key: 'selg-' + s.id,
      type: 'selgbil',
      typeLabel: 'Selg bil',
      dato: s.dato || '',
      navn: s.navn || '—',
      sub: s.epost || s.tlf || '',
      emne: [s.merke, s.modell, s.aar].filter(Boolean).join(' ') || 'Bil til salg',
      detalj: s.reg || '—',
      status: s.status,
      data: s
    });
  });

  if (inkluderEpost) {
    ulestEpost.forEach(function (e) {
      items.push({
        key: 'epost-' + e.id,
        type: 'epost',
        typeLabel: 'E-post',
        dato: e.dato || e.sortDato || '',
        navn: e.fraNavn || e.fraEpost || '—',
        sub: e.fraEpost || e.kontoNavn || '',
        emne: e.emne || '(Uten emne)',
        detalj: e.kontoNavn || 'Innboks',
        status: 'Ulest',
        data: e
      });
    });
  }

  return items.sort(function (a, b) {
    return String(b.dato || '').localeCompare(String(a.dato || ''));
  });
}

export function canAccess(user, permission) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return (user.permissions || []).includes(permission);
}

export function canViewVedlikehold(user) {
  if (!user) return false;
  if (canToggleVedlikehold(user) || canAccess(user, 'innstillinger')) return true;
  const role = resolveRoleKey(user.role);
  return role === 'Innkjøpssjef' || role === 'Selger';
}

export function canToggleVedlikehold(user) {
  return !!user?.isAdmin;
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

export const KALKYLE_AUKSJON_PLATTFORMER = [
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

export const KALKYLE_ANDRE_KILDER = [
  'FINN.no',
  'Privat/Annet'
];

export const KALKYLE_KILDER = [
  ...KALKYLE_AUKSJON_PLATTFORMER,
  ...KALKYLE_ANDRE_KILDER
];

/** @deprecated Bruk KALKYLE_AUKSJON_PLATTFORMER */
export const AUKSJON_PLATTFORMER = KALKYLE_AUKSJON_PLATTFORMER;

export function isKalkyleAuksjon(kilde) {
  return KALKYLE_AUKSJON_PLATTFORMER.includes(String(kilde || '').trim());
}

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
  lakkstiftLakkboksUtfort: false
};

export function normalizeBilTilstandsrapport(raw) {
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
    lakkstiftLakkboksUtfort: !!o.lakkstiftLakkboksUtfort
  };
}

export function tilstandsrapportDelerChips(raw) {
  const tr = normalizeBilTilstandsrapport(raw);
  const chips = [];
  if (tr.stylingDelerNodvendig) chips.push({ label: 'Styling deler nødvendig', tone: 'red' });
  if (tr.stylingDelerBestilt) chips.push({ label: 'Styling deler bestilt', tone: 'green' });
  if (tr.reparasjonsdelerNodvendig) chips.push({ label: 'Reparasjonsdeler nødvendig', tone: 'red' });
  if (tr.reparasjonsdelerBestilt) chips.push({ label: 'Reparasjonsdeler bestilt', tone: 'green' });
  if (tr.felglakkeringNodvendig) chips.push({ label: 'Felglakkering nødvendig', tone: 'red' });
  if (tr.felglakkeringUtfort) chips.push({ label: 'Felglakkering utført', tone: 'green' });
  if (tr.lakkeringNodvendig) chips.push({ label: 'Lakkering nødvendig', tone: 'red' });
  if (tr.lakkeringUtfort) chips.push({ label: 'Lakkering utført', tone: 'green' });
  if (tr.lakkstiftLakkboksNodvendig) chips.push({ label: 'Lakkstift/lakkboks nødvendig', tone: 'red' });
  if (tr.lakkstiftLakkboksUtfort) chips.push({ label: 'Lakkstift/lakkboks utført', tone: 'green' });
  return chips;
}

export function tilstandsrapportNodvendigLabels(raw) {
  const tr = normalizeBilTilstandsrapport(raw);
  const labels = [];
  if (tr.stylingDelerNodvendig) labels.push('Styling deler nødvendig');
  if (tr.reparasjonsdelerNodvendig) labels.push('Reparasjonsdeler nødvendig');
  if (tr.felglakkeringNodvendig) labels.push('Felglakkering nødvendig');
  if (tr.lakkeringNodvendig) labels.push('Lakkering nødvendig');
  if (tr.lakkstiftLakkboksNodvendig) labels.push('Lakkstift/lakkboks nødvendig');
  return labels;
}

export function bilHarTilstandsrapportNodvendig(bil) {
  if (!bil || bil.archived || bil.status === 'Solgt') return false;
  return tilstandsrapportNodvendigLabels(bil.tilstandsrapport).length > 0;
}

export function bilTilstandsrapportNodvendigRader(biler) {
  const rows = [];
  (biler || []).forEach(function (bil) {
    if (!bilHarTilstandsrapportNodvendig(bil)) return;
    tilstandsrapportNodvendigLabels(bil.tilstandsrapport).forEach(function (label) {
      rows.push({ bil: bil, label: label });
    });
  });
  return rows.sort(function (a, b) {
    return String(a.bil.reg || '').localeCompare(String(b.bil.reg || ''), 'nb')
      || String(a.label).localeCompare(String(b.label), 'nb');
  });
}

export function bilManglerTilstandsrapport(bil) {
  if (!bil || bil.archived || bil.status === 'Solgt') return false;
  return normalizeBilTilstandsrapport(bil.tilstandsrapport).status === 'ikke_utfort';
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

/** Parsed kjøretøy fra lagret Autosys/Vegvesen-payload. */
export function getVehicleFromSvvData(svvData) {
  if (!svvData || typeof svvData !== 'object') return null;
  if (svvData.regNr || (svvData.merke && svvData.modell)) return svvData;
  if (svvData.vehicle && typeof svvData.vehicle === 'object') return svvData.vehicle;
  return null;
}

export function getRegistreringsstatusFromSvvData(svvData) {
  const vehicle = getVehicleFromSvvData(svvData);
  if (!vehicle) return '';
  return String(vehicle.registreringsstatus || '').trim();
}

/** true = påregistrert, false = avregistrert, null = ukjent. */
export function erBilParegistrert(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('avregistr') || s.includes('uregistr')) return false;
  if (s.includes('registrert')) return true;
  return null;
}

/** Chip for header: grønn påregistrert, grå avregistrert. */
export function registreringsstatusChip(status) {
  const raw = String(status || '').trim();
  if (!raw) return null;
  const pareg = erBilParegistrert(raw);
  if (pareg === true) return { label: 'Påregistrert', className: 'chip-green' };
  if (pareg === false) return { label: 'Avregistrert', className: 'chip-gray' };
  return { label: raw, className: 'chip-gray' };
}

/** Enkel fargebetegnelse fra Vegvesen (f.eks. «Grå», ikke «Grå herunder …»). */
export function formatSvvFargeNavn(farge) {
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

/** Visningsverdi for lagret bil.farge. */
export function formatBilFarge(farge) {
  return formatSvvFargeNavn(farge) || String(farge || '').trim();
}

/** Normaliser norsk reg.nr (samme logikk som Vegvesen-oppslag på server). */
export function normalizeBilReg(reg) {
  return String(reg || '').trim().toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9ÆØÅ]/g, '');
}

export function isValidBilReg(reg) {
  const normalized = normalizeBilReg(reg);
  return normalized.length >= 4 && normalized.length <= 7;
}

/** Sjekk om lagret Autosys/Vegvesen-data faktisk inneholder kjøretøy. */
export function hasAutosysVehicleData(svvData) {
  const vehicle = getVehicleFromSvvData(svvData);
  if (!vehicle || typeof vehicle !== 'object') return false;
  return !!(vehicle.regNr || vehicle.merke || vehicle.modell || vehicle.registreringsstatus || vehicle.understell);
}

/** Felt Autosys kan fylle ut på bil — manuelle endringer låses med overstyrt-flagg. */
export const BIL_AUTOSYS_FELTER = ['reg', 'merke', 'modell', 'aar', 'farge', 'euKontroll'];

export function getBilAutosysOverstyrt(source, explicit) {
  if (explicit && typeof explicit === 'object') return { ...explicit };
  const svv = source?.svvData || source;
  if (svv && typeof svv === 'object' && svv.overstyrt && typeof svv.overstyrt === 'object') {
    return { ...svv.overstyrt };
  }
  return {};
}

export function markBilAutosysOverstyrt(overstyrt, field) {
  if (!BIL_AUTOSYS_FELTER.includes(field)) return overstyrt || {};
  return { ...(overstyrt || {}), [field]: true };
}

export function mergeAutosysOverstyrtIntoSvvData(svvData, overstyrt) {
  const o = overstyrt || {};
  if (!svvData || typeof svvData !== 'object') {
    return Object.keys(o).length ? { overstyrt: o } : svvData;
  }
  return { ...svvData, overstyrt: o };
}

export function buildAutosysBilFelt(vehicle, rawData, lists, prev, overstyrt) {
  const v = vehicle || {};
  const o = getBilAutosysOverstyrt(prev, overstyrt);
  const fullMerke = String(v.merke || '').trim();
  const fullModell = buildFullBilModellFromVehicle(v);
  const merker = buildMerkeOptions(lists.merker, null, fullMerke || prev.merke);
  const aarRaw = v.arsmodell != null ? String(v.arsmodell).trim() : '';
  const aarParsed = aarRaw ? Number(aarRaw) : NaN;

  const autosys = {
    reg: v.regNr ? normalizeBilReg(v.regNr) : prev.reg,
    merke: fullMerke ? resolveMerkeFromLists(fullMerke, merker) : prev.merke,
    modell: fullModell || prev.modell,
    aar: Number.isFinite(aarParsed) && aarParsed > 0 ? aarParsed : prev.aar,
    farge: formatSvvFargeNavn(v.farge) || prev.farge,
    euKontroll: normalizeEuKontrollDato(v.nesteEuKontroll) || prev.euKontroll
  };

  const result = {};
  BIL_AUTOSYS_FELTER.forEach(function (key) {
    result[key] = o[key] ? prev[key] : autosys[key];
  });

  result.notater = prev.notater || '';
  result.svvData = mergeAutosysOverstyrtIntoSvvData({
    vehicle: v,
    raw: rawData && typeof rawData === 'object' ? rawData : null,
    fetchedAt: new Date().toISOString()
  }, o);

  return result;
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

export function parseNumberInput(raw) {
  const value = String(raw ?? '').trim();
  if (value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

export function numberInputDisplay(value) {
  if (value === '' || value === null || value === undefined) return '';
  return value;
}

export function numberInputForSave(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export const BIL_NUMERIC_FIELDS = new Set(['aar', 'km', 'innkjop', 'salg']);

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
  { id: 'henvendelser', label: 'Kontaktskjema' },
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

  result.forEach(function (item) {
    if (item.id === 'henvendelser' && item.label === 'Henvendelser') {
      item.label = 'Kontaktskjema';
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
    if (t.id === 'innstillinger') return !!user;
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
  modulOppsett: DEFAULT_MODUL_OPPSATT,
  tilbudEpostMaler: DEFAULT_TILBUD_EPOST_MALER
};
