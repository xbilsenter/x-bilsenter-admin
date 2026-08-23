import { useMemo, useState } from 'react';
import {
  RESERVASJON_FIRMA,
  BETALINGSMATE_BANKOVERFORING,
  BETALINGSMATE_BANKTERMINAL,
  addDaysIso,
  buildBilVisningsnavn,
  buildReservasjonPreviewModel,
  getRawReservasjonFromOkonomi,
  getReservasjonFromOkonomi,
  isoDateOnly
} from '../lib/reservasjon.js';
import { downloadReservasjonPdf } from '../api.js';

function ReservasjonPreview({ bil, kunde, reservasjonVisning }) {
  const model = buildReservasjonPreviewModel(bil, kunde, reservasjonVisning);

  return (
    <div className="bil-reservasjon-preview">
      <div className="bil-reservasjon-preview__accent" />
      <div className="bil-reservasjon-preview__head">
        <div>
          <div className="bil-reservasjon-preview__brand">X BILSENTER</div>
          <div className="bil-reservasjon-preview__tagline">{RESERVASJON_FIRMA.tagline}</div>
        </div>
        <div className="bil-reservasjon-preview__doc-type">
          <div>RESERVASJONSBEKREFTELSE</div>
          <span>{model.dokument.dato} · Ref. {model.dokument.referanse || '—'}</span>
          <strong>{model.kundeNavn}</strong>
        </div>
      </div>

      <div className="bil-reservasjon-preview__body">
        <p className="bil-reservasjon-preview__intro">{model.intro}</p>
        {model.finnUrl ? (
          <p className="bil-reservasjon-preview__finn">
            FINN: <a href={model.finnUrl} target="_blank" rel="noopener noreferrer">{model.finnUrl}</a>
          </p>
        ) : null}

        <div className="bil-reservasjon-preview__section">
          <h4>Avtalen i korthet</h4>
          <div className="bil-reservasjon-preview__grid">
            {model.summaryRows.map(function (row) {
              return (
                <div className={`bil-reservasjon-preview__cell${row.highlight ? ' is-highlight' : ''}`} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bil-reservasjon-preview__section">
          <h4>Depositum og betaling</h4>
          <div className="bil-reservasjon-preview__payment">
            <div className="bil-reservasjon-preview__payment-title">{model.payment.title}</div>
            {model.payment.lines.map(function (line) {
              return <p key={line}>{line}</p>;
            })}
          </div>
        </div>

        <div className="bil-reservasjon-preview__columns">
          <div className="bil-reservasjon-preview__section">
            <h4>Vilkår</h4>
            <ul className="bil-reservasjon-preview__list">
              {model.vilkar.map(function (item) {
                return <li key={item}>{item}</li>;
              })}
            </ul>
          </div>
          <div className="bil-reservasjon-preview__section">
            <h4>Neste steg</h4>
            <ol className="bil-reservasjon-preview__steps">
              {model.nesteSteg.map(function (item) {
                return <li key={item}>{item}</li>;
              })}
            </ol>
          </div>
        </div>

        <div className="bil-reservasjon-preview__closing-row">
          <p className="bil-reservasjon-preview__closing">{model.avslutning}</p>
          <p className="bil-reservasjon-preview__signoff">
            Med vennlig hilsen,<br />
            <strong>{RESERVASJON_FIRMA.navn}</strong><br />
            <em>{RESERVASJON_FIRMA.tagline}</em>
          </p>
        </div>
      </div>

      <div className="bil-reservasjon-preview__footer">
        {RESERVASJON_FIRMA.adresse} · Mobil {RESERVASJON_FIRMA.mobil} · {RESERVASJON_FIRMA.epost} · {RESERVASJON_FIRMA.web}
      </div>
    </div>
  );
}

export default function BilReservasjonTab({ bil, kunder, oppdaterReservasjon, visTost }) {
  const rawReservasjon = getRawReservasjonFromOkonomi(bil.okonomi);
  const reservasjonVisning = getReservasjonFromOkonomi(bil.okonomi, bil);
  const kundeIds = bil.kundeIds || (bil.kundeId ? [bil.kundeId] : []);
  const kunde = useMemo(function () {
    const id = kundeIds[0];
    if (!id) return null;
    return (kunder || []).find(function (k) { return k.id === id; }) || null;
  }, [kundeIds, kunder]);

  const [lasterPdf, setLasterPdf] = useState(false);
  const bilNavn = buildBilVisningsnavn(bil);
  const erBankoverforing = rawReservasjon.betalingsmate === BETALINGSMATE_BANKOVERFORING;

  const oppdater = function (patch, msg) {
    oppdaterReservasjon(patch, msg);
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
                value={rawReservasjon.kjopesum ?? ''}
                onChange={function (e) {
                  const val = e.target.value;
                  oppdater({ kjopesum: val === '' ? null : Number(val) });
                }}
              />
            </div>
            <div>
              <div className="fl">Depositum (kr)</div>
              <input
                type="number"
                min="0"
                placeholder="f.eks. 30000"
                value={rawReservasjon.depositum ?? ''}
                onChange={function (e) {
                  const val = e.target.value;
                  oppdater({ depositum: val === '' ? null : Number(val) });
                }}
              />
            </div>
          </div>

          <div className="form-row gap">
            <div>
              <div className="fl">Depositum forfall</div>
              <input
                type="date"
                value={rawReservasjon.depositumForfall || ''}
                onChange={function (e) { oppdater({ depositumForfall: e.target.value }); }}
              />
            </div>
            <div>
              <div className="fl">Reservert til</div>
              <input
                type="date"
                value={rawReservasjon.reservasjonTil || ''}
                onChange={function (e) { oppdater({ reservasjonTil: e.target.value }); }}
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
              disabled={lasterPdf || !reservasjonVisning.kjopesum}
              onClick={lastNedPdf}
            >
              {lasterPdf ? 'Lager PDF…' : 'Last ned PDF'}
            </button>
          </div>
          {!reservasjonVisning.kjopesum ? (
            <p className="bil-reservasjon__warn">Legg inn kjøpesum for å generere PDF.</p>
          ) : null}
        </div>

        <ReservasjonPreview bil={bil} kunde={kunde} reservasjonVisning={reservasjonVisning} />
      </div>
    </div>
  );
}
