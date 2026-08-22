import { useMemo, useState } from 'react';
import {
  RESERVASJON_FIRMA,
  BETALINGSMATE_BANKOVERFORING,
  BETALINGSMATE_BANKTERMINAL,
  addDaysIso,
  buildBilVisningsnavn,
  buildFinnItemUrl,
  buildReservasjonPreviewData,
  getReservasjonFromOkonomi,
  isoDateOnly
} from '../lib/reservasjon.js';
import { downloadReservasjonPdf } from '../api.js';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ReservasjonPreview({ bil, kunde, reservasjon }) {
  const data = buildReservasjonPreviewData(bil, kunde, reservasjon);
  const finnUrl = buildFinnItemUrl(bil?.finnKode);
  const hilsen = data.kundeNavn ? `Hei ${escapeHtml(data.kundeNavn)}` : 'Hei';

  return (
    <div className="bil-reservasjon-preview">
      <div className="bil-reservasjon-preview__head">
        <div className="bil-reservasjon-preview__brand">{RESERVASJON_FIRMA.navn}</div>
        <div className="bil-reservasjon-preview__sub">Reservasjonsbekreftelse</div>
      </div>
      <div className="bil-reservasjon-preview__body">
        <p>{hilsen}</p>
        <p>
          Takk for en hyggelig avtale vedr. kjøp av vår {escapeHtml(data.bilNavn)}
          {finnUrl ? (
            <> (<a href={finnUrl} target="_blank" rel="noopener noreferrer">{finnUrl}</a>)</>
          ) : null}
          .
        </p>

        <h4>Kjøpesum</h4>
        <p>Avtalt kjøpesum på vår {escapeHtml(data.bilNavn)} er {data.kjopesumTekst}.</p>

        <h4>Depositum</h4>
        <p>{data.depositumIntro}</p>
        <p>{data.depositumVilkar}</p>

        <h4>Forbehold</h4>
        <p>
          Bilen reserveres til deg ut {data.reservasjonTilTekst}. Mottar vi ikke fullt oppgjør eller at handel ikke er ferdigstilt før denne tid,
          anses det som en kansellering fra din side – ved tilfelle vil depositum ikke være refunderbart.
        </p>

        <h4>Annet</h4>
        <p>{data.annetTekst}</p>

        <p className="bil-reservasjon-preview__thanks">Takk for en hyggelig handel!</p>
        <p>Med vennlig hilsen,<br /><strong>{RESERVASJON_FIRMA.navn}</strong><br /><em>{RESERVASJON_FIRMA.tagline}</em></p>
        <div className="bil-reservasjon-preview__footer">
          {RESERVASJON_FIRMA.adresse} | Mobil {RESERVASJON_FIRMA.mobil} | {RESERVASJON_FIRMA.epost} | {RESERVASJON_FIRMA.web}
        </div>
      </div>
    </div>
  );
}

export default function BilReservasjonTab({ bil, kunder, oppdaterOkonomi, visTost }) {
  const reservasjon = getReservasjonFromOkonomi(bil.okonomi, bil);
  const kundeIds = bil.kundeIds || (bil.kundeId ? [bil.kundeId] : []);
  const kunde = useMemo(function () {
    const id = kundeIds[0];
    if (!id) return null;
    return (kunder || []).find(function (k) { return k.id === id; }) || null;
  }, [kundeIds, kunder]);

  const [lasterPdf, setLasterPdf] = useState(false);
  const bilNavn = buildBilVisningsnavn(bil);
  const erBankoverforing = reservasjon.betalingsmate === BETALINGSMATE_BANKOVERFORING;

  const oppdater = function (patch, msg) {
    oppdaterOkonomi({ reservasjon: { ...reservasjon, ...patch } }, msg);
  };

  const settStandardVarighet = function () {
    oppdater({
      reservasjonTil: addDaysIso(isoDateOnly(new Date()), RESERVASJON_FIRMA.reservasjonDager)
    }, `Reservasjon satt til ${RESERVASJON_FIRMA.reservasjonDager} dager ✓`);
  };

  const lastNedPdf = async function () {
    if (!bil?.id) return;
    setLasterPdf(true);
    try {
      const blob = await downloadReservasjonPdf(bil.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filnavn = ['Reservasjon', bil.reg || bil.id, kunde?.navn || ''].filter(Boolean).join('-').replace(/\s+/g, '-');
      a.href = url;
      a.download = `${filnavn}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      visTost('PDF lastet ned ✓');
    } catch (err) {
      visTost((err?.message || 'Kunne ikke lage PDF') + ' ✗');
    } finally {
      setLasterPdf(false);
    }
  };

  return (
    <div className="bil-reservasjon">
      <div className="bil-reservasjon__layout">
        <div className="bil-reservasjon__panel">
          <div className="modal-sec">Avtaledetaljer</div>
          <p className="bil-reservasjon__hint">
            Fyll inn kjøpesum, depositum og datoer. Velg hvordan kunden skal betale depositum — teksten i PDF-en tilpasses valget.
          </p>

          <div className="gap">
            <div className="fl">Kunde</div>
            {kunde ? (
              <div className="fv">
                <strong>{kunde.navn}</strong>
                {kunde.tlf ? ` · ${kunde.tlf}` : ''}
                {kunde.epost ? ` · ${kunde.epost}` : ''}
              </div>
            ) : (
              <div className="fv" style={{ color: 'var(--t4)' }}>Koble kunde under Informasjon-fanen først.</div>
            )}
          </div>

          <div className="gap">
            <div className="fl">Bil</div>
            <div className="fv">{bilNavn}{bil.reg ? ` · ${bil.reg}` : ''}</div>
          </div>

          <div className="gap">
            <div className="fl">Betaling av depositum</div>
            <div className="view-toggle" role="group" aria-label="Betaling av depositum">
              <button
                type="button"
                className={`btn btn-sm ${erBankoverforing ? 'btn-p' : 'btn-g'}`}
                onClick={function () { oppdater({ betalingsmate: BETALINGSMATE_BANKOVERFORING }, 'Betaling satt til bankoverføring ✓'); }}
              >
                Bankoverføring
              </button>
              <button
                type="button"
                className={`btn btn-sm ${!erBankoverforing ? 'btn-p' : 'btn-g'}`}
                onClick={function () { oppdater({ betalingsmate: BETALINGSMATE_BANKTERMINAL }, 'Betaling satt til bankterminal ✓'); }}
              >
                Bankterminal i butikk
              </button>
            </div>
          </div>

          <div className="form-row gap">
            <div>
              <div className="fl">Kjøpesum (kr)</div>
              <input
                type="number"
                min="0"
                placeholder={bil.salg != null && bil.salg !== '' ? String(bil.salg) : 'f.eks. 189000'}
                value={reservasjon.kjopesum ?? ''}
                onChange={function (e) {
                  const val = e.target.value;
                  oppdater({ kjopesum: val === '' ? null : Number(val) }, 'Kjøpesum oppdatert ✓');
                }}
              />
            </div>
            <div>
              <div className="fl">Depositum (kr)</div>
              <input
                type="number"
                min="0"
                placeholder="f.eks. 30000"
                value={reservasjon.depositum ?? ''}
                onChange={function (e) {
                  const val = e.target.value;
                  oppdater({ depositum: val === '' ? null : Number(val) }, 'Depositum oppdatert ✓');
                }}
              />
            </div>
          </div>

          <div className="form-row gap">
            <div>
              <div className="fl">Depositum forfall</div>
              <input
                type="date"
                value={reservasjon.depositumForfall || ''}
                onChange={function (e) { oppdater({ depositumForfall: e.target.value }, 'Depositum-forfall oppdatert ✓'); }}
              />
            </div>
            <div>
              <div className="fl">Reservert til</div>
              <input
                type="date"
                value={reservasjon.reservasjonTil || ''}
                onChange={function (e) { oppdater({ reservasjonTil: e.target.value }, 'Reservasjonstid oppdatert ✓'); }}
              />
            </div>
          </div>

          <div className="bil-reservasjon__actions">
            <button type="button" className="btn btn-g btn-sm" onClick={settStandardVarighet}>
              +{RESERVASJON_FIRMA.reservasjonDager} dager reservasjon
            </button>
            <button
              type="button"
              className="btn btn-p"
              disabled={lasterPdf || !reservasjon.kjopesum}
              onClick={lastNedPdf}
            >
              {lasterPdf ? 'Lager PDF…' : 'Last ned PDF'}
            </button>
          </div>
          {!reservasjon.kjopesum ? (
            <p className="bil-reservasjon__warn">Legg inn kjøpesum for å generere PDF.</p>
          ) : null}
        </div>

        <ReservasjonPreview bil={bil} kunde={kunde} reservasjon={reservasjon} />
      </div>
    </div>
  );
}
