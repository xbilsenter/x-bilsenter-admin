const RESERVASJON_FIRMA = {
  navn: 'X Bilsenter AS',
  tagline: 'Bilhandel gjort trygt og enkelt.',
  kontonummer: '1813.47.39459',
  adresse: 'Postboks 1730 Vika, 0121 OSLO',
  mobil: '920 50 990',
  epost: 'post@xbilsenter.no',
  web: 'www.xbilsenter.no',
  reservasjonDager: 14
};

function isoDateOnly(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const base = isoDateOnly(iso) || isoDateOnly(new Date());
  if (!base) return '';
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function formatNorskDato(iso) {
  const d = isoDateOnly(iso);
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

function formatNok(amount) {
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

function resolveKjopesum(reservasjon, bil) {
  const fraReservasjon = belopForLagring(reservasjon?.kjopesum);
  if (fraReservasjon != null) return fraReservasjon;
  if (bil?.salg != null && bil.salg !== '') {
    const fraSalg = Number(bil.salg);
    if (Number.isFinite(fraSalg) && fraSalg > 0) return fraSalg;
  }
  return null;
}

function normalizeBilReservasjon(raw, defaults, bil) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  const normalized = {
    kjopesum: belopForLagring(o.kjopesum ?? base.kjopesum),
    depositum: belopForLagring(o.depositum ?? base.depositum),
    depositumForfall: isoDateOnly(o.depositumForfall || base.depositumForfall || isoDateOnly(new Date())),
    reservasjonTil: isoDateOnly(o.reservasjonTil || base.reservasjonTil || addDaysIso(new Date(), RESERVASJON_FIRMA.reservasjonDager)),
    kontonummer: String(o.kontonummer || base.kontonummer || RESERVASJON_FIRMA.kontonummer).trim()
  };
  if (normalized.kjopesum == null) {
    normalized.kjopesum = resolveKjopesum(null, bil);
  }
  return normalized;
}

function buildBilVisningsnavn(bil) {
  if (!bil) return 'bilen';
  const parts = [bil.merke, bil.modell, bil.aar].filter(Boolean);
  return parts.length ? parts.join(' ') : (bil.reg || 'bilen');
}

function buildFinnItemUrl(finnKode) {
  const digits = String(finnKode || '').replace(/\D/g, '');
  return digits.length >= 6 ? `https://www.finn.no/mobility/item/${digits}` : '';
}

function buildReservasjonDocumentData(bil, kunde, reservasjonRaw) {
  const reservasjon = normalizeBilReservasjon(reservasjonRaw, null, bil);
  const bilNavn = buildBilVisningsnavn(bil);
  const finnUrl = buildFinnItemUrl(bil?.finnKode);
  const kundeNavn = String(kunde?.navn || '').trim();
  const kjopesum = resolveKjopesum(reservasjon, bil);

  return {
    firma: { ...RESERVASJON_FIRMA },
    kundeNavn,
    bilNavn,
    finnUrl,
    kjopesum,
    kjopesumTekst: kjopesum != null && Number.isFinite(kjopesum) ? formatNok(kjopesum) : '—',
    depositum: reservasjon.depositum,
    depositumTekst: reservasjon.depositum != null ? formatNok(reservasjon.depositum) : '—',
    depositumForfall: reservasjon.depositumForfall,
    depositumForfallTekst: formatNorskDato(reservasjon.depositumForfall),
    reservasjonTil: reservasjon.reservasjonTil,
    reservasjonTilTekst: formatNorskDato(reservasjon.reservasjonTil),
    kontonummer: reservasjon.kontonummer
  };
}

function reservasjonSeksjoner(data) {
  const finnDel = data.finnUrl
    ? ` (${data.finnUrl})`
    : '';

  return [
    {
      title: null,
      body: [
        data.kundeNavn ? `Hei ${data.kundeNavn}` : 'Hei',
        '',
        `Takk for en hyggelig avtale vedr. kjøp av vår ${data.bilNavn}${finnDel}.`
      ].join('\n')
    },
    {
      title: 'Kjøpesum',
      body: `Avtalt kjøpesum på vår ${data.bilNavn} er ${data.kjopesumTekst}.`
    },
    {
      title: 'Depositum',
      body: [
        `Vi har avtalt et depositum på ${data.depositumTekst} for bilen med forfall i dag ${data.depositumForfallTekst}. Vårt kontonummer er ${data.kontonummer} (${data.firma.navn}).`,
        '',
        'Depositumet blir selvfølgelig trukket fra kjøpesum/egenkapital ved gjennomføring av handel. Ved kansellering fra din side vil depositum ikke være refunderbart. Ved sen betaling av depositum, forbeholder X Bilsenter AS seg retten til å refundere depositum og kansellere handel.'
      ].join('\n')
    },
    {
      title: 'Forbehold',
      body: `Bilen reserveres til deg ut ${data.reservasjonTilTekst}. Mottar vi ikke fullt oppgjør eller at handel ikke er ferdigstilt før denne tid, anses det som en kansellering fra din side – ved tilfelle vil depositum ikke være refunderbart.`
    },
    {
      title: 'Annet',
      body: 'Så snart vi mottar en bekreftelse fra deg på ovenstående avtale, samt kvittering på utført betaling av depositum, settes bilen som solgt på FINN- og holdes av til deg.'
    }
  ];
}

module.exports = {
  RESERVASJON_FIRMA,
  isoDateOnly,
  addDaysIso,
  formatNorskDato,
  formatNok,
  normalizeBilReservasjon,
  resolveKjopesum,
  buildBilVisningsnavn,
  buildFinnItemUrl,
  buildReservasjonDocumentData,
  reservasjonSeksjoner
};
