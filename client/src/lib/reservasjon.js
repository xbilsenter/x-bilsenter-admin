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

export function normalizeBilReservasjon(raw, defaults) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  return {
    depositum: belopForLagring(o.depositum ?? base.depositum),
    depositumForfall: isoDateOnly(o.depositumForfall || base.depositumForfall || isoDateOnly(new Date())),
    reservasjonTil: isoDateOnly(o.reservasjonTil || base.reservasjonTil || addDaysIso(new Date(), RESERVASJON_FIRMA.reservasjonDager)),
    kontonummer: String(o.kontonummer || base.kontonummer || RESERVASJON_FIRMA.kontonummer).trim()
  };
}

export function getReservasjonFromOkonomi(okonomi) {
  const o = okonomi && typeof okonomi === 'object' ? okonomi : {};
  return normalizeBilReservasjon(o.reservasjon);
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

export function buildReservasjonPreviewData(bil, kunde, reservasjon) {
  const bilNavn = buildBilVisningsnavn(bil);
  const finnUrl = buildFinnItemUrl(bil?.finnKode);
  const kundeNavn = String(kunde?.navn || '').trim();
  const kjopesum = bil?.salg != null && bil.salg !== '' ? Number(bil.salg) : null;

  return {
    kundeNavn,
    bilNavn,
    finnUrl,
    kjopesumTekst: kjopesum != null && Number.isFinite(kjopesum) ? formatNokBelop(kjopesum) : '—',
    depositumTekst: reservasjon.depositum != null ? formatNokBelop(reservasjon.depositum) : '—',
    depositumForfallTekst: formatNorskDato(reservasjon.depositumForfall),
    reservasjonTilTekst: formatNorskDato(reservasjon.reservasjonTil),
    kontonummer: reservasjon.kontonummer
  };
}
