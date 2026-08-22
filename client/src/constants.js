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

export function clearActiveTab() {
  try {
    localStorage.removeItem(ACTIVE_TAB_KEY);
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
  okonomi: 'okonomi',
  oppgaver: 'oppgaver',
  timeregistrering: 'timeregistrering',
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
      sortDato: h.sortDato || h.dato || '',
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
      sortDato: i.sortDato || i.dato || '',
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
      sortDato: s.sortDato || s.dato || '',
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
        sortDato: e.sortDato || e.dato || '',
        navn: e.fraNavn || e.fraEpost || '—',
        sub: e.fraEpost || e.kontoNavn || '',
        emne: e.emne || '(Uten emne)',
        detalj: e.kontoNavn || 'Innboks',
        status: 'Ulest',
        data: e
      });
    });
  }

  return sortItemsNyestFirst(items);
}

export function sortItemsNyestFirst(items) {
  return (items || []).slice().sort(function (a, b) {
    const diff = itemSortTimestamp(b) - itemSortTimestamp(a);
    if (diff !== 0) return diff;
    return String(b.key || '').localeCompare(String(a.key || ''));
  });
}

function itemSortTimestamp(item) {
  const raw = item?.sortDato || item?.dato || '';
  const ts = Date.parse(String(raw));
  if (!Number.isNaN(ts)) return ts;
  return Number(item?.id || 0);
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

export function canAddBil(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const role = resolveRoleKey(user.role);
  return role === 'Daglig leder' || role === 'Innkjøpssjef' || role === 'Selger';
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
  pakost: null,
  aukGebyr: null,
  garantikost: null,
  omregAvgift: null,
  kostnader: [],
  profittUke: null,
  reservasjon: null
};

export function okonomiBelopValue(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function okonomiBelopDisplay(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

export function okonomiBelopForSave(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function monetaryInputDisplay(value) {
  return okonomiBelopDisplay(value);
}

function normalizeBilOkonomiKostnader(kostnader) {
  return (Array.isArray(kostnader) ? kostnader : []).map(function (item, index) {
    return {
      id: String(item?.id || `kost-${index}`),
      label: String(item?.label || '').trim(),
      belop: okonomiBelopForSave(item?.belop)
    };
  }).filter(function (item) { return item.label || item.belop != null; });
}

export function mergeBilOkonomi(prev, patch) {
  const base = prev && typeof prev === 'object' ? { ...prev } : { ...DEFAULT_BIL_OKONOMI };
  const next = { ...base, ...patch };
  if (patch?.reservasjon && typeof patch.reservasjon === 'object') {
    next.reservasjon = { ...(base.reservasjon && typeof base.reservasjon === 'object' ? base.reservasjon : {}), ...patch.reservasjon };
  }
  if (Array.isArray(patch?.kostnader)) {
    next.kostnader = patch.kostnader.map(function (item, index) {
      const belop = item?.belop;
      return {
        id: String(item?.id || `kost-${index}`),
        label: String(item?.label || '').trim(),
        belop: belop === '' ? '' : okonomiBelopForSave(belop)
      };
    });
  } else if (!Array.isArray(next.kostnader)) {
    next.kostnader = [];
  }
  return next;
}

export function getIsoWeekInfo(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return { year: isoYear, week };
}

export function formatProfittUke(year, week) {
  const y = Number(year);
  const w = Number(week);
  if (!Number.isFinite(y) || !Number.isFinite(w) || w < 1 || w > 53) return null;
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export function parseProfittUke(value) {
  const m = String(value || '').trim().match(/^(\d{4})-W(\d{1,2})$/i);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) return null;
  return { year, week };
}

export function normalizeProfittUke(value) {
  const parsed = parseProfittUke(value);
  if (!parsed) return null;
  return formatProfittUke(parsed.year, parsed.week);
}

export function getCurrentProfittUke(date) {
  const info = getIsoWeekInfo(date || new Date());
  return info ? formatProfittUke(info.year, info.week) : null;
}

export function formatProfittUkeLabel(value) {
  const parsed = parseProfittUke(value);
  if (!parsed) return '—';
  return `Uke ${parsed.week}, ${parsed.year}`;
}

export function getIsoWeeksInYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return 52;
  const dec28 = new Date(Date.UTC(y, 11, 28));
  const info = getIsoWeekInfo(dec28);
  return info && info.year === y ? info.week : 52;
}

export function normalizeBilOkonomi(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  let reservasjon = null;
  if (o.reservasjon && typeof o.reservasjon === 'object') {
    reservasjon = { ...o.reservasjon };
    if (reservasjon.depositum != null) {
      reservasjon.depositum = okonomiBelopForSave(reservasjon.depositum);
    }
  }
  return {
    pakost: okonomiBelopForSave(o.pakost),
    aukGebyr: okonomiBelopForSave(o.aukGebyr),
    garantikost: okonomiBelopForSave(o.garantikost),
    omregAvgift: okonomiBelopForSave(o.omregAvgift),
    kostnader: normalizeBilOkonomiKostnader(o.kostnader),
    profittUke: normalizeProfittUke(o.profittUke),
    reservasjon
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
  lakkstiftLakkboksUtfort: false,
  bulkopprettingNodvendig: false,
  bulkopprettingUtfort: false,
  chromeDeleteNodvendig: false,
  chromeDeleteUtfort: false
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
    lakkstiftLakkboksUtfort: !!o.lakkstiftLakkboksUtfort,
    bulkopprettingNodvendig: !!o.bulkopprettingNodvendig,
    bulkopprettingUtfort: !!o.bulkopprettingUtfort,
    chromeDeleteNodvendig: !!o.chromeDeleteNodvendig,
    chromeDeleteUtfort: !!o.chromeDeleteUtfort
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
  if (tr.bulkopprettingNodvendig) chips.push({ label: 'Bulkoppretting nødvendig', tone: 'red' });
  if (tr.bulkopprettingUtfort) chips.push({ label: 'Bulkoppretting utført', tone: 'green' });
  if (tr.chromeDeleteNodvendig) chips.push({ label: 'Chrome delete nødvendig', tone: 'red' });
  if (tr.chromeDeleteUtfort) chips.push({ label: 'Chrome delete utført', tone: 'green' });
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
  if (tr.bulkopprettingNodvendig) labels.push('Bulkoppretting nødvendig');
  if (tr.chromeDeleteNodvendig) labels.push('Chrome delete nødvendig');
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

export const TILSTANDSRAPPORT_NODVENDIG_TYPER = [
  'Styling deler nødvendig',
  'Reparasjonsdeler nødvendig',
  'Felglakkering nødvendig',
  'Lakkering nødvendig',
  'Lakkstift/lakkboks nødvendig',
  'Bulkoppretting nødvendig',
  'Chrome delete nødvendig'
];

export function bilTilstandsrapportNodvendigFilterOptions(biler) {
  const counts = {};
  bilTilstandsrapportNodvendigRader(biler).forEach(function (row) {
    counts[row.label] = (counts[row.label] || 0) + 1;
  });
  return TILSTANDSRAPPORT_NODVENDIG_TYPER
    .filter(function (label) { return counts[label] > 0; })
    .map(function (label) { return { label: label, count: counts[label] }; });
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

export function normalizeKmValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n;
}

export function kmInputDisplay(value) {
  const km = normalizeKmValue(value);
  return km === '' ? '' : km;
}

export function kmInputForSave(value) {
  const km = normalizeKmValue(value);
  return km === '' ? 0 : km;
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

/** Tekstfelt på bilkort som lagres med debounce for å unngå tapte tegn ved raske PATCH-kall. */
export const BIL_DEBOUNCED_TEXT_FIELDS = new Set(['modell', 'notater', 'utstyr', 'farge', 'finnKode']);

export function mergeBilDebouncedTextFields(saved, local) {
  if (!saved) return local;
  if (!local) return saved;
  const next = { ...saved };
  BIL_DEBOUNCED_TEXT_FIELDS.forEach(function (key) {
    if (local[key] !== undefined) next[key] = local[key];
  });
  if (local.innkjop !== undefined && local.innkjop !== '') next.innkjop = local.innkjop;
  if (local.salg !== undefined && local.salg !== '') next.salg = local.salg;
  if (local.okonomi && typeof local.okonomi === 'object') {
    next.okonomi = mergeBilOkonomi(saved.okonomi, local.okonomi);
  }
  return next;
}

export function patchIsDebouncedTextOnly(patch) {
  const keys = Object.keys(patch || {});
  return keys.length > 0 && keys.every(function (key) { return BIL_DEBOUNCED_TEXT_FIELDS.has(key); });
}

export function calcBilOkonomi(innkjop, salg, okonomi) {
  const o = normalizeBilOkonomi(okonomi);
  const inn = okonomiBelopValue(innkjop);
  const ut = okonomiBelopValue(salg);
  const fasteKostnader = okonomiBelopValue(o.pakost)
    + okonomiBelopValue(o.aukGebyr)
    + okonomiBelopValue(o.garantikost)
    + okonomiBelopValue(o.omregAvgift);
  const ekstraKostnader = o.kostnader.reduce(function (sum, item) {
    return sum + okonomiBelopValue(item.belop);
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

export function aggregateUkentligProfitt(biler, options) {
  const yearFilter = options?.year != null && options.year !== '' ? Number(options.year) : null;
  const byWeek = {};
  const utenUke = [];

  (Array.isArray(biler) ? biler : []).forEach(function (bil) {
    const okonomi = normalizeBilOkonomi(bil.okonomi);
    const stats = calcBilOkonomi(bil.innkjop, bil.salg, okonomi);
    const entry = { bil, stats, profittUke: okonomi.profittUke };
    const harOkonomi = okonomiBelopValue(bil.innkjop) > 0
      || okonomiBelopValue(bil.salg) > 0
      || stats.totaltKostnader > 0;

    if (!okonomi.profittUke) {
      if (harOkonomi) utenUke.push(entry);
      return;
    }

    const parsed = parseProfittUke(okonomi.profittUke);
    if (!parsed) return;
    if (yearFilter != null && Number.isFinite(yearFilter) && parsed.year !== yearFilter) return;

    if (!byWeek[okonomi.profittUke]) {
      byWeek[okonomi.profittUke] = {
        profittUke: okonomi.profittUke,
        year: parsed.year,
        week: parsed.week,
        biler: [],
        bruttoMargin: 0,
        nettoMargin: 0,
        totaltKostnader: 0
      };
    }

    const group = byWeek[okonomi.profittUke];
    group.biler.push(entry);
    group.bruttoMargin += stats.bruttoMargin;
    group.nettoMargin += stats.nettoMargin;
    group.totaltKostnader += stats.totaltKostnader;
  });

  const weeks = Object.values(byWeek).sort(function (a, b) {
    if (a.year !== b.year) return b.year - a.year;
    return b.week - a.week;
  });

  return { weeks, utenUke };
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
  if (!bil || !String(query || '').trim()) return false;

  if (looksLikeRegnrQuery(query)) {
    return bilMatchesRegSearch(bil, query);
  }

  const terms = extractSearchTerms(query);
  if (!terms.length) return false;

  const fields = bilSearchFieldValues(bil);
  const hay = fields.join(' ');
  const hayCompact = hay.replace(/\s+/g, '');

  return terms.every(function (term) {
    return searchTermMatches(term, fields, hay, hayCompact);
  });
}

function looksLikeRegnrQuery(query) {
  const compact = normalizeBilReg(query);
  if (compact.length < 2) return false;
  if (/^[A-ZÆØÅ]{2}\d{0,5}$/.test(compact)) return true;
  if (/^[A-ZÆØÅ]{1,2}$/.test(compact)) return true;
  if (/^\d{2,6}$/.test(compact)) return true;
  return false;
}

function bilMatchesRegSearch(bil, query) {
  const q = normalizeBilReg(query);
  const reg = normalizeBilReg(bil.reg);
  if (!q || !reg) return false;
  return reg.includes(q);
}

function extractSearchTerms(query) {
  return normalizeSearchQuery(query)
    .split(/[^a-z0-9æøå]+/i)
    .map(function (term) { return term.trim(); })
    .filter(Boolean);
}

function searchFieldWords(field) {
  return String(field || '')
    .split(/[^a-z0-9æøå]+/i)
    .filter(Boolean);
}

function searchTermMatches(term, fields, hay, hayCompact) {
  if (!term) return true;
  if (hay.includes(term)) return true;
  if (hayCompact.includes(term.replace(/\s+/g, ''))) return true;

  return fields.some(function (field) {
    if (field.includes(term)) return true;
    return searchFieldWords(field).some(function (word) {
      return word.includes(term);
    });
  });
}

function normalizeSearchQuery(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bilSearchFieldValues(bil) {
  const tr = normalizeBilTilstandsrapport(bil.tilstandsrapport);
  const ap = normalizeBilArsprovekjennemerke(bil.arsprovekjennemerke);
  return [
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
    tr.status === 'utfort' ? 'tilstandsrapport utfort' : 'tilstandsrapport ikke utfort',
    tr.medfolger ? 'medfolger' : '',
    tr.nybilgaranti ? 'nybilgaranti' : '',
    ap.skiltnummer,
    ap.status,
    ap.notater,
    bil.archived ? 'arkiv' : 'lager',
    ...(bil.kommentarer || []).map(function (item) { return item.text; }),
    ...(bil.dokumenter || []).map(function (item) { return item.name; }),
    ...(bil.logg || []).map(function (item) { return item.tekst; })
  ]
    .filter(function (value) { return value != null && value !== ''; })
    .map(normalizeSearchQuery);
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
  okonomi: '📊',
  oppgaver: '☑',
  timeregistrering: '⏱',
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
  { id: 'okonomi', label: 'Økonomi' },
  { id: 'oppgaver', label: 'Oppgaver' },
  { id: 'timeregistrering', label: 'Timeregistrering' },
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
    if (result.some(function (row) { return row.id === item.id; })) return;
    let insertAt = result.length;
    const defaultIndex = defaults.findIndex(function (d) { return d.id === item.id; });
    for (let i = defaultIndex + 1; i < defaults.length; i += 1) {
      const laterPos = result.findIndex(function (row) { return row.id === defaults[i].id; });
      if (laterPos !== -1) {
        insertAt = laterPos;
        break;
      }
    }
    result.splice(insertAt, 0, byId[item.id] || { ...item });
  });

  const trIdx = result.findIndex(function (row) { return row.id === 'timeregistrering'; });
  const innIdx = result.findIndex(function (row) { return row.id === 'innstillinger'; });
  if (trIdx !== -1 && innIdx !== -1 && trIdx > innIdx) {
    const tr = result.splice(trIdx, 1)[0];
    const newInnIdx = result.findIndex(function (row) { return row.id === 'innstillinger'; });
    result.splice(newInnIdx, 0, tr);
  }

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

export function getDefaultTabForUser(user, modulOppsett) {
  const tabs = buildModulTabs(modulOppsett, {}, user);
  return tabs[0]?.id || 'dashboard';
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
