export const BIL_STATUSER = [
  'Innkjøpt', 'Transport', 'Klargjøring', 'Lakkering',
  'Fotografering', 'Verksted', 'Tilstandsrapport',
  'Annonsert', 'Reservert', 'Utlevering', 'Solgt', 'Etteroppfølging'
];

export const HENV_STATUSER = ['Ny', 'Tildelt', 'Besvart', 'Venter på kunde', 'Avsluttet'];

export const INNBYTTE_STATUSER = ['Ny', 'Under vurdering', 'Tilbud sendt', 'Akseptert', 'Avslått'];

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

export const TAB_PERMISSIONS = {
  dashboard: 'dashboard',
  biler: 'biler',
  henvendelser: 'henvendelser',
  innboks: 'innboks',
  innbytte: 'innbytte',
  kalender: 'kalender',
  oppgaver: 'oppgaver',
  vegvesen: 'vegvesen',
  innstillinger: 'innstillinger'
};

export function canAccess(user, permission) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return (user.permissions || []).includes(permission);
}

export const MODUL_ICONS = {
  dashboard: '▦',
  biler: '🚗',
  henvendelser: '✉',
  innboks: '📥',
  innbytte: '⇄',
  kalender: '📅',
  oppgaver: '☑',
  vegvesen: '🔍',
  innstillinger: '⚙'
};

export const DEFAULT_MODUL_OPPSATT = [
  { id: 'dashboard', label: 'Oversikt' },
  { id: 'biler', label: 'Biler' },
  { id: 'henvendelser', label: 'Henvendelser' },
  { id: 'innboks', label: 'Innboks' },
  { id: 'innbytte', label: 'Innbytte' },
  { id: 'kalender', label: 'Kalender' },
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
  ansatte: ANSATTE,
  merker: MERKER,
  bilStatuser: BIL_STATUSER,
  henvStatuser: HENV_STATUSER,
  innbytteStatuser: INNBYTTE_STATUSER,
  kalTyper: KAL_TYPER,
  modulOppsett: DEFAULT_MODUL_OPPSATT
};
