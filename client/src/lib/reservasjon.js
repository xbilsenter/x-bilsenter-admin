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
export const DOKUMENT_TYPE_TILBUD = 'tilbud';
export const DOKUMENT_TYPE_RESERVASJON = 'reservasjon';

export function normalizeDokumentType(value) {
  return value === DOKUMENT_TYPE_TILBUD ? DOKUMENT_TYPE_TILBUD : DOKUMENT_TYPE_RESERVASJON;
}

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

export function normalizeKlokkeslett(value) {
  if (value === '' || value === null || value === undefined) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return '';
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatTilbudGyldigTilTekst(datoIso, klokkeslett) {
  const dato = formatNorskDato(datoIso);
  const kl = normalizeKlokkeslett(klokkeslett);
  if (dato === '—') return '—';
  if (!kl) return dato;
  return `${dato} kl. ${kl}`;
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

function normalizeInnbytteFields(o) {
  const src = o && typeof o === 'object' ? o : {};
  const kmRaw = src.innbytteKm;
  let innbytteKm = null;
  if (kmRaw !== '' && kmRaw !== null && kmRaw !== undefined) {
    const n = Number(kmRaw);
    if (Number.isFinite(n) && n > 0) innbytteKm = n;
  }

  return {
    harInnbytte: !!src.harInnbytte,
    innbytteReg: String(src.innbytteReg || '').trim().toUpperCase(),
    innbytteKm,
    innbyttePris: belopForLagring(src.innbyttePris),
    innbytteKommentar: String(src.innbytteKommentar ?? '')
  };
}

export function formatKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n.toLocaleString('nb-NO')} km`;
}

export function formatCaKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `Ca. ${n.toLocaleString('nb-NO')} km`;
}

export function buildInnbytteDocumentData(reservasjon) {
  const innbytte = normalizeInnbytteFields(reservasjon);
  if (!innbytte.harInnbytte) return null;

  return {
    reg: innbytte.innbytteReg || '—',
    kmTekst: formatKm(innbytte.innbytteKm),
    prisTekst: innbytte.innbyttePris != null ? formatNokBelop(innbytte.innbyttePris) : '—',
    kommentar: String(innbytte.innbytteKommentar || '').trim()
  };
}

export function buildInnbytteSummaryRows(innbytte) {
  if (!innbytte) return [];
  return [
    { label: 'Registreringsnr.', value: innbytte.reg },
    { label: 'Kilometerstand', value: innbytte.kmTekst },
    { label: 'Innbyttepris', value: innbytte.prisTekst, highlight: true }
  ];
}

export function formatKundeAdresse(kunde) {
  if (!kunde) return '';
  const post = [kunde.postnr, kunde.poststed].filter(Boolean).join(' ').trim();
  return [String(kunde.adresse || '').trim(), post].filter(Boolean).join(', ');
}

export function extractKundeFornavn(navn) {
  const s = String(navn || '').trim();
  if (!s || s === 'Kunde') return '';
  return s.split(/\s+/)[0] || s;
}

export function resolveKundeForDokument(kunde, reservasjon) {
  const pick = function (override, fallback) {
    if (override != null && String(override).trim() !== '') return String(override).trim();
    return String(fallback || '').trim();
  };

  return {
    navn: pick(reservasjon?.kundeNavn, kunde?.navn) || 'Kunde',
    epost: pick(reservasjon?.kundeEpost, kunde?.epost),
    tlf: pick(reservasjon?.kundeTlf, kunde?.tlf),
    adresse: pick(reservasjon?.kundeAdresse, formatKundeAdresse(kunde)),
    orgNr: pick(reservasjon?.kundeOrgNr, kunde?.organisasjonsnummer)
  };
}

export function buildKundeSummaryRows() {
  return [];
}

export function patchKundeTilReservasjon(kunde) {
  if (!kunde) return {};
  return {
    kundeNavn: String(kunde.navn || '').trim(),
    kundeEpost: String(kunde.epost || '').trim()
  };
}

export function normalizeBilReservasjon(raw, defaults, bil) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  const normalized = {
    dokumentType: normalizeDokumentType(o.dokumentType ?? base.dokumentType),
    avtaleKommentar: String(o.avtaleKommentar ?? base.avtaleKommentar ?? ''),
    tilbudGyldigTil: isoDateOnly(o.tilbudGyldigTil || base.tilbudGyldigTil || addDaysIso(new Date(), 7)),
    tilbudGyldigTilKlokkeslett: normalizeKlokkeslett(o.tilbudGyldigTilKlokkeslett ?? base.tilbudGyldigTilKlokkeslett ?? ''),
    kundeNavn: String(o.kundeNavn ?? base.kundeNavn ?? ''),
    kundeEpost: String(o.kundeEpost ?? base.kundeEpost ?? ''),
    kundeTlf: String(o.kundeTlf ?? base.kundeTlf ?? ''),
    kundeAdresse: String(o.kundeAdresse ?? base.kundeAdresse ?? ''),
    kundeOrgNr: String(o.kundeOrgNr ?? base.kundeOrgNr ?? ''),
    kjopesum: belopForLagring(o.kjopesum ?? base.kjopesum),
    depositum: belopForLagring(o.depositum ?? base.depositum),
    depositumForfall: isoDateOnly(o.depositumForfall || base.depositumForfall || isoDateOnly(new Date())),
    reservasjonTil: isoDateOnly(o.reservasjonTil || base.reservasjonTil || addDaysIso(new Date(), RESERVASJON_FIRMA.reservasjonDager)),
    betalingsmate: normalizeBetalingsmate(o.betalingsmate ?? base.betalingsmate),
    ...normalizeInnbytteFields({ ...base, ...o })
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

export function buildBilAvtaleNavn(bil) {
  if (!bil) return 'bilen';
  const parts = [bil.merke, bil.modell].filter(Boolean);
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

export function buildNesteSteg(erTerminal, depositumForfallTekst) {
  const steg3 = 'Vi markerer bilen som solgt, holder den av til deg og gjør den klar for overlevering.';
  if (erTerminal) {
    return [
      'Bekreft ved signering at du aksepterer vilkårene i dette dokumentet.',
      `Betal avtalt depositum med bankterminal i butikk senest ${depositumForfallTekst}.`,
      steg3
    ];
  }
  return [
    'Bekreft ved signering at du aksepterer vilkårene i dette dokumentet.',
    `Overfør avtalt depositum senest ${depositumForfallTekst} og send oss kvittering på ${RESERVASJON_FIRMA.epost}.`,
    steg3
  ];
}

function buildTilbudVilkar() {
  return [
    'Tilbudet i seg selv er ikke bindende. Bindende avtale foreligger først når reservasjonsbekreftelse eller kjøpekontrakt er signert av begge parter og dess innhold er oppfylt.',
    'Slik reservasjonsbekreftelse eller kjøpekontrakt sendes ut etter at kunden har akseptert tilbudet.',
    `Frem til bindende avtale foreligger, står ${RESERVASJON_FIRMA.navn} fritt til å selge eller reservere kjøretøyet til annen interessent.`,
    'Eventuelle endringer eller tillegg til tilbudet må avtales skriftlig.'
  ];
}

function buildTilbudNesteSteg() {
  return [
    'Les gjennom tilbudet og ta gjerne kontakt dersom dere har spørsmål eller ønsker avklaringer.',
    `Dersom tilbudet er av interesse, ber vi dere bekrefte dette skriftlig til ${RESERVASJON_FIRMA.epost} innen tilbudets gyldighetsfrist.`,
    'Ved enighet oversender vi reservasjonsbekreftelse med informasjon om eventuelt depositum og videre prosess.'
  ];
}

export function buildReservasjonPreviewModel(bil, kunde, reservasjon) {
  const bilNavn = buildBilAvtaleNavn(bil);
  const finnUrl = buildFinnItemUrl(bil?.finnKode);
  const kundeNavn = String(kunde?.navn || '').trim();
  const kjopesum = resolveKjopesum(reservasjon, bil);
  const erTilbud = reservasjon.dokumentType === DOKUMENT_TYPE_TILBUD;
  const betalingsmate = normalizeBetalingsmate(reservasjon.betalingsmate);
  const erTerminal = betalingsmate === BETALINGSMATE_BANKTERMINAL;
  const kjopesumTekst = kjopesum != null && Number.isFinite(kjopesum) ? formatNokBelop(kjopesum) : '—';
  const depositumTekst = reservasjon.depositum != null ? formatNokBelop(reservasjon.depositum) : '—';
  const depositumForfallTekst = formatNorskDato(reservasjon.depositumForfall);
  const reservasjonTilTekst = formatNorskDato(reservasjon.reservasjonTil);
  const tilbudGyldigTilTekst = formatTilbudGyldigTilTekst(
    reservasjon.tilbudGyldigTil,
    reservasjon.tilbudGyldigTilKlokkeslett
  );
  const kundeDok = resolveKundeForDokument(kunde, reservasjon);
  const kundeFornavn = extractKundeFornavn(kundeDok.navn);
  const kundeRows = buildKundeSummaryRows(kundeDok);

  const bilKmTekst = formatCaKm(bil?.km);
  const summaryRows = [
    { label: 'Kjøretøy', value: bilNavn },
    bil?.reg ? { label: 'Registreringsnr.', value: String(bil.reg).toUpperCase() } : null,
    bilKmTekst ? { label: 'Kilometerstand', value: bilKmTekst } : null,
    { label: erTilbud ? 'Tilbudspris' : 'Kjøpesum', value: kjopesumTekst, highlight: true }
  ].filter(Boolean);

  if (erTilbud) {
    summaryRows.push({ label: 'Tilbud gyldig til', value: tilbudGyldigTilTekst });
  } else {
    summaryRows.push(
      { label: 'Depositum', value: depositumTekst, highlight: true },
      { label: 'Depositum senest', value: depositumForfallTekst },
      { label: 'Reservert til', value: reservasjonTilTekst },
      { label: 'Betaling', value: erTerminal ? 'Bankterminal i butikk' : 'Bankoverføring' }
    );
  }

  const payment = {
    title: erTerminal ? 'Betaling i butikk' : 'Betaling via bankoverføring',
    lines: erTerminal
      ? [
          `Depositum på ${depositumTekst} betales med bankterminal i butikk hos ${RESERVASJON_FIRMA.navn}.`,
          `Betaling må være registrert senest ${depositumForfallTekst}.`
        ]
      : [
          `Depositum på ${depositumTekst} overføres til konto ${RESERVASJON_FIRMA.kontonummer}.`,
          `Mottaker: ${RESERVASJON_FIRMA.navn}. Betalingsfrist: ${depositumForfallTekst}.`
        ]
  };

  const innbytte = buildInnbytteDocumentData(reservasjon);

  return {
    dokumentType: reservasjon.dokumentType,
    skipPayment: erTilbud,
    metaLabel: erTilbud ? 'Tilbudsbrev' : 'Reservasjonsbekreftelse',
    dokument: {
      tittel: erTilbud ? 'Tilbudsbrev' : 'Reservasjonsbekreftelse',
      undertittel: erTilbud ? 'Tilbud på kjøretøy' : 'Avtale om reservasjon av kjøretøy',
      dato: formatNorskDato(isoDateOnly(new Date())),
      referanse: bil?.reg ? String(bil.reg).toUpperCase() : ''
    },
    kundeNavn: kundeDok.navn,
    kunde: kundeDok,
    kundeRows,
    intro: erTilbud
      ? (kundeFornavn
        ? `Hei ${kundeFornavn}, takk for interessen for vår ${bilNavn}.`
        : `Hei, takk for interessen for vår ${bilNavn}.`)
      : (kundeFornavn
        ? `Hei ${kundeFornavn}, takk for avtalen om kjøp av ${bilNavn}.`
        : `Hei, takk for avtalen om kjøp av ${bilNavn}.`),
    finnUrl,
    summaryRows,
    avtaleKommentar: String(reservasjon.avtaleKommentar || '').trim(),
    innbytte,
    innbytteRows: buildInnbytteSummaryRows(innbytte),
    payment,
    vilkar: erTilbud
      ? buildTilbudVilkar()
      : [
          'Depositum trekkes fra kjøpesum ved gjennomført handel.',
          'Ved kansellering fra kundens side refunderes ikke depositum.',
          `Bilen holdes reservert til ${reservasjonTilTekst}. Manglende oppgjør innen fristen anses som kansellering.`,
          'Ved vesentlig forsinket depositum kan X Bilsenter AS kansellere avtalen.'
        ],
    nesteSteg: erTilbud
      ? buildTilbudNesteSteg()
      : buildNesteSteg(erTerminal, depositumForfallTekst),
    avslutning: erTilbud
      ? 'Ta gjerne kontakt dersom du har spørsmål eller ønsker å avtale videre.'
      : 'Vi ser frem til å fullføre handelen sammen med deg.'
  };
}

export function buildReservasjonEpostMelding(bil, kunde, reservasjon) {
  const bilNavn = buildBilAvtaleNavn(bil);
  const kundeDok = resolveKundeForDokument(kunde, reservasjon || {});
  const fornavn = extractKundeFornavn(kundeDok.navn);
  const erTilbud = reservasjon?.dokumentType === DOKUMENT_TYPE_TILBUD;
  const hilsen = fornavn ? `Hei ${fornavn},` : 'Hei,';

  if (erTilbud) {
    return [
      hilsen,
      '',
      `Takk for interessen for vår ${bilNavn}. Som avtalt sender vi deg her tilbud på bilen.`,
      reservasjon.avtaleKommentar ? `\n${String(reservasjon.avtaleKommentar).trim()}\n` : '',
      'Ta gjerne kontakt dersom du har spørsmål eller ønsker å avtale videre.',
      '',
      'Med vennlig hilsen',
      RESERVASJON_FIRMA.navn
    ].filter(function (line) { return line !== ''; }).join('\n');
  }

  return [
    hilsen,
    '',
    `Takk for avtalen om kjøp av ${bilNavn}${bil?.reg ? ` (${String(bil.reg).toUpperCase()})` : ''}.`,
    '',
    'Vedlagt finner du reservasjonsbekreftelsen med avtalte vilkår og informasjon om depositum.',
    reservasjon.avtaleKommentar ? `\n${String(reservasjon.avtaleKommentar).trim()}\n` : '',
    'Ta kontakt dersom du har spørsmål.',
    '',
    'Med vennlig hilsen',
    RESERVASJON_FIRMA.navn
  ].filter(function (line) { return line !== ''; }).join('\n');
}

export function buildReservasjonPreviewData(bil, kunde, reservasjon) {
  return buildReservasjonPreviewModel(bil, kunde, reservasjon);
}
