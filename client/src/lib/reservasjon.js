export const RESERVASJON_FIRMA = {
  navn: 'X Bilsenter AS',
  tagline: 'Bilhandel gjort trygt og enkelt.',
  kontonummer: '1813.47.39459',
  adresse: 'Postboks 1730 Vika, 0121 OSLO',
  mobil: '920 50 990',
  epost: 'post@xbilsenter.no',
  web: 'www.xbilsenter.no',
  reservasjonDager: 14
};

export const BETALINGSMATE_BANKOVERFORING = 'bankoverforing';
export const BETALINGSMATE_BANKTERMINAL = 'bankterminal';

export function isoDateOnly(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso, days) {
  const base = isoDateOnly(iso) || isoDateOnly(new Date());
  if (!base) return '';
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function formatNorskDato(iso) {
  const d = isoDateOnly(iso);
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export function formatNokBelop(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `kr ${n.toLocaleString('nb-NO')}`;
}

function belopForLagring(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function normalizeBetalingsmate(value) {
  return value === BETALINGSMATE_BANKTERMINAL ? BETALINGSMATE_BANKTERMINAL : BETALINGSMATE_BANKOVERFORING;
}

export function resolveKjopesum(reservasjon, bil) {
  const fraReservasjon = belopForLagring(reservasjon?.kjopesum);
  if (fraReservasjon != null) return fraReservasjon;
  if (bil?.salg != null && bil.salg !== '') {
    const fraSalg = Number(bil.salg);
    if (Number.isFinite(fraSalg) && fraSalg > 0) return fraSalg;
  }
  return null;
}

export function normalizeBilReservasjon(raw, defaults, bil) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  const normalized = {
    kjopesum: belopForLagring(o.kjopesum ?? base.kjopesum),
    depositum: belopForLagring(o.depositum ?? base.depositum),
    depositumForfall: isoDateOnly(o.depositumForfall || base.depositumForfall || isoDateOnly(new Date())),
    reservasjonTil: isoDateOnly(o.reservasjonTil || base.reservasjonTil || addDaysIso(new Date(), RESERVASJON_FIRMA.reservasjonDager)),
    betalingsmate: normalizeBetalingsmate(o.betalingsmate ?? base.betalingsmate)
  };
  if (bil && normalized.kjopesum == null) {
    normalized.kjopesum = resolveKjopesum(null, bil);
  }
  return normalized;
}

export function getRawReservasjonFromOkonomi(okonomi) {
  const o = okonomi && typeof okonomi === 'object' ? okonomi : {};
  return normalizeBilReservasjon(o.reservasjon, null, null);
}

export function getReservasjonFromOkonomi(okonomi, bil) {
  const o = okonomi && typeof okonomi === 'object' ? okonomi : {};
  return normalizeBilReservasjon(o.reservasjon, null, bil);
}

export function buildBilVisningsnavn(bil) {
  if (!bil) return 'bilen';
  const parts = [bil.merke, bil.modell, bil.aar].filter(Boolean);
  return parts.length ? parts.join(' ') : (bil.reg || 'bilen');
}

export function buildFinnItemUrl(finnKode) {
  const digits = String(finnKode || '').replace(/\D/g, '');
  return digits.length >= 6 ? `https://www.finn.no/mobility/item/${digits}` : '';
}

export function buildDepositumIntro(data) {
  if (data.betalingsmate === BETALINGSMATE_BANKTERMINAL) {
    return `Vi har avtalt et depositum på ${data.depositumTekst} for bilen med forfall i dag ${data.depositumForfallTekst}. Depositum betales med bankterminal i butikk hos ${RESERVASJON_FIRMA.navn}.`;
  }
  return `Vi har avtalt et depositum på ${data.depositumTekst} for bilen med forfall i dag ${data.depositumForfallTekst}. Vårt kontonummer er ${RESERVASJON_FIRMA.kontonummer} (${RESERVASJON_FIRMA.navn}).`;
}

export function buildDepositumVilkar() {
  return 'Depositumet blir selvfølgelig trukket fra kjøpesum/egenkapital ved gjennomføring av handel. Ved kansellering fra din side vil depositum ikke være refunderbart. Ved sen betaling av depositum, forbeholder X Bilsenter AS seg retten til å refundere depositum og kansellere handel.';
}

export function buildAnnetTekst(betalingsmate) {
  if (betalingsmate === BETALINGSMATE_BANKTERMINAL) {
    return 'Så snart vi mottar en bekreftelse fra deg på ovenstående avtale, samt at depositum er betalt i butikk, settes bilen som solgt på FINN- og holdes av til deg.';
  }
  return 'Så snart vi mottar en bekreftelse fra deg på ovenstående avtale, samt kvittering på utført betaling av depositum, settes bilen som solgt på FINN- og holdes av til deg.';
}

export function buildReservasjonPreviewModel(bil, kunde, reservasjon) {
  const bilNavn = buildBilVisningsnavn(bil);
  const finnUrl = buildFinnItemUrl(bil?.finnKode);
  const kundeNavn = String(kunde?.navn || '').trim();
  const kjopesum = resolveKjopesum(reservasjon, bil);
  const betalingsmate = normalizeBetalingsmate(reservasjon.betalingsmate);
  const erTerminal = betalingsmate === BETALINGSMATE_BANKTERMINAL;
  const kjopesumTekst = kjopesum != null && Number.isFinite(kjopesum) ? formatNokBelop(kjopesum) : '—';
  const depositumTekst = reservasjon.depositum != null ? formatNokBelop(reservasjon.depositum) : '—';
  const depositumForfallTekst = formatNorskDato(reservasjon.depositumForfall);
  const reservasjonTilTekst = formatNorskDato(reservasjon.reservasjonTil);

  const summaryRows = [
    { label: 'Kjøretøy', value: bilNavn },
    bil?.reg ? { label: 'Registreringsnr.', value: String(bil.reg).toUpperCase() } : null,
    { label: 'Kjøpesum', value: kjopesumTekst, highlight: true },
    { label: 'Depositum', value: depositumTekst, highlight: true },
    { label: 'Depositum senest', value: depositumForfallTekst },
    { label: 'Reservert til', value: reservasjonTilTekst },
    { label: 'Betaling', value: erTerminal ? 'Bankterminal i butikk' : 'Bankoverføring' }
  ].filter(Boolean);

  const payment = {
    title: erTerminal ? 'Betaling i butikk' : 'Betaling via bankoverføring',
    lines: erTerminal
      ? [
          `Depositum på ${depositumTekst} betales med bankterminal i butikk hos ${RESERVASJON_FIRMA.navn}.`,
          `Betaling må være registrert senest ${depositumForfallTekst}.`
        ]
      : [
          `Depositum på ${depositumTekst} overføres til konto ${RESERVASJON_FIRMA.kontonummer}.`,
          `Mottaker: ${RESERVASJON_FIRMA.navn}.`,
          `Betalingsfrist: ${depositumForfallTekst}.`
        ]
  };

  return {
    dokument: {
      tittel: 'Reservasjonsbekreftelse',
      undertittel: 'Avtale om reservasjon av kjøretøy',
      dato: formatNorskDato(isoDateOnly(new Date())),
      referanse: bil?.reg ? String(bil.reg).toUpperCase() : ''
    },
    kundeNavn: kundeNavn || 'Kunde',
    intro: kundeNavn
      ? `Hei ${kundeNavn}, takk for avtalen om kjøp av ${bilNavn}.`
      : `Hei, takk for avtalen om kjøp av ${bilNavn}.`,
    finnUrl,
    summaryRows,
    payment,
    vilkar: [
      'Depositum trekkes fra kjøpesum ved gjennomført handel.',
      'Ved kansellering fra kundens side refunderes ikke depositum.',
      `Bilen holdes reservert til ${reservasjonTilTekst}. Manglende oppgjør innen fristen anses som kansellering.`,
      'Ved vesentlig forsinket depositum kan X Bilsenter AS kansellere avtalen og refundere depositum.'
    ],
    nesteSteg: erTerminal
      ? [
          'Bekreft at du aksepterer vilkårene i dette dokumentet.',
          'Betale avtalt depositum med bankterminal i butikk innen fristen.',
          'Vi markerer bilen som reservert og holder den av til deg.'
        ]
      : [
          'Bekreft at du aksepterer vilkårene i dette dokumentet.',
          'Overfør avtalt depositum innen fristen og send oss kvittering.',
          'Vi markerer bilen som reservert og holder den av til deg.'
        ],
    avslutning: 'Vi ser frem til å fullføre handelen sammen med deg.'
  };
}

export function buildReservasjonPreviewData(bil, kunde, reservasjon) {
  return buildReservasjonPreviewModel(bil, kunde, reservasjon);
}
