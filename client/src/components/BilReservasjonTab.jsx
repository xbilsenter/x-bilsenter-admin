import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RESERVASJON_FIRMA,
  BETALINGSMATE_BANKOVERFORING,
  BETALINGSMATE_BANKTERMINAL,
  DOKUMENT_TYPE_TILBUD,
  DOKUMENT_TYPE_RESERVASJON,
  addDaysIso,
  buildBilVisningsnavn,
  buildReservasjonPreviewModel,
  buildReservasjonEpostMelding,
  getRawReservasjonFromOkonomi,
  getReservasjonFromOkonomi,
  isoDateOnly,
  normalizeAvtaleForholdPunkter,
  splitAvtaleKommentarTilPunkter,
  resolveKundeForDokument,
  patchKundeTilReservasjon
} from '../lib/reservasjon.js';
import { downloadReservasjonPdf, sendReservasjonDokument } from '../api.js';

function parseBelop(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseKm(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/\D/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function readReservasjonTekst(okonomi) {
  const src = okonomi?.reservasjon && typeof okonomi.reservasjon === 'object' ? okonomi.reservasjon : {};
  return {
    avtaleKommentar: src.avtaleKommentar ?? '',
    avtaleForholdPunkter: Array.isArray(src.avtaleForholdPunkter)
      ? src.avtaleForholdPunkter.map(function (item) { return String(item ?? ''); })
      : [],
    innbytteKommentar: src.innbytteKommentar ?? '',
    kundeNavn: src.kundeNavn ?? '',
    kundeEpost: src.kundeEpost ?? ''
  };
}

function AvtaleForholdEditor({ tekstDraft, oppdaterTekst }) {
  const [skrivSomPunkter, setSkrivSomPunkter] = useState(function () {
    return normalizeAvtaleForholdPunkter(tekstDraft.avtaleForholdPunkter).length > 0;
  });
  const punktInputs = skrivSomPunkter
    ? (Array.isArray(tekstDraft.avtaleForholdPunkter) && tekstDraft.avtaleForholdPunkter.length
      ? tekstDraft.avtaleForholdPunkter
      : [''])
    : [];

  useEffect(function () {
    if (normalizeAvtaleForholdPunkter(tekstDraft.avtaleForholdPunkter).length > 0) {
      setSkrivSomPunkter(true);
    }
  }, [tekstDraft.avtaleForholdPunkter]);

  function byttTilPunkter() {
    const lines = splitAvtaleKommentarTilPunkter(tekstDraft.avtaleKommentar);
    oppdaterTekst({
      avtaleForholdPunkter: lines.length ? lines : [''],
      avtaleKommentar: ''
    });
    setSkrivSomPunkter(true);
  }

  function byttTilFritekst() {
    const joined = normalizeAvtaleForholdPunkter(tekstDraft.avtaleForholdPunkter).join('\n');
    oppdaterTekst({
      avtaleKommentar: joined,
      avtaleForholdPunkter: []
    });
    setSkrivSomPunkter(false);
  }

  function oppdaterPunkt(index, value) {
    const next = [...punktInputs];
    next[index] = value;
    oppdaterTekst({ avtaleForholdPunkter: next, avtaleKommentar: '' });
  }

  function leggTilPunkt() {
    oppdaterTekst({
      avtaleForholdPunkter: [...punktInputs, ''],
      avtaleKommentar: ''
    });
  }

  function fjernPunkt(index) {
    const next = punktInputs.filter(function (_, i) { return i !== index; });
    oppdaterTekst({
      avtaleForholdPunkter: next.length ? next : [''],
      avtaleKommentar: ''
    });
  }

  return (
    <div className="gap bil-reservasjon__forhold">
      <div className="bil-reservasjon__forhold-head">
        <div>
          <div className="fl">Avtalte forhold</div>
          <p className="bil-reservasjon__hint bil-reservasjon__hint--tight">Valgfritt. Vises i dokumentet under avtalen.</p>
        </div>
        <label className="bil-reservasjon__toggle">
          <input
            type="checkbox"
            checked={skrivSomPunkter}
            onChange={function (e) {
              if (e.target.checked) byttTilPunkter();
              else byttTilFritekst();
            }}
          />
          <span>Skriv som punkter</span>
        </label>
      </div>

      {skrivSomPunkter ? (
        <div className="bil-reservasjon__forhold-punkter">
          {punktInputs.map(function (punkt, index) {
            return (
              <div className="bil-reservasjon__forhold-punkt" key={'avtale-punkt-' + index}>
                <span className="bil-reservasjon__forhold-punkt-mark" aria-hidden="true">•</span>
                <input
                  type="text"
                  value={punkt}
                  placeholder={'Punkt ' + (index + 1)}
                  onChange={function (e) { oppdaterPunkt(index, e.target.value); }}
                />
                <button
                  type="button"
                  className="btn btn-g btn-sm bil-reservasjon__forhold-punkt-remove"
                  onClick={function () { fjernPunkt(index); }}
                  aria-label={'Fjern punkt ' + (index + 1)}
                  disabled={punktInputs.length <= 1}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button type="button" className="btn btn-g btn-sm bil-reservasjon__forhold-add" onClick={leggTilPunkt}>
            + Legg til punkt
          </button>
        </div>
      ) : (
        <textarea
          rows={3}
          placeholder="F.eks. avtalte tillegg, forbehold, leveringsdato eller annet som skal med i dokumentet"
          value={tekstDraft.avtaleKommentar}
          onChange={function (e) { oppdaterTekst({ avtaleKommentar: e.target.value, avtaleForholdPunkter: [] }); }}
        />
      )}
    </div>
  );
}

function patchFromInnbytte(inn) {
  if (!inn) return { harInnbytte: true };
  return {
    harInnbytte: true,
    innbytteReg: String(inn.reg || '').trim().toUpperCase(),
    innbytteKm: parseKm(inn.km),
    innbyttePris: parseBelop(inn.tilbud),
    innbytteKommentar: String(inn.beskrivelse || '').trim()
  };
}

function ReservasjonPreview({ bil, kunde, reservasjonVisning }) {
  const model = buildReservasjonPreviewModel(bil, kunde, reservasjonVisning);

  return (
    <div className="bil-reservasjon-preview">
      <div className="bil-reservasjon-preview__accent" />
      <div className="bil-reservasjon-preview__head">
        <div>
          <img
            className="bil-reservasjon-preview__logo"
            src="/assets/logo.svg"
            alt="X Bilsenter AS"
          />
        </div>
        <div className="bil-reservasjon-preview__meta">
          <div className="bil-reservasjon-preview__meta-label">{model.metaLabel}</div>
          <div className="bil-reservasjon-preview__meta-row">
            <span>Dato</span>
            <strong>{model.dokument.dato}</strong>
          </div>
          <div className="bil-reservasjon-preview__meta-row">
            <span>Referanse</span>
            <strong>{model.dokument.referanse || '—'}</strong>
          </div>
          <div className="bil-reservasjon-preview__meta-row bil-reservasjon-preview__meta-row--customer">
            <span>Kunde</span>
            <strong>{model.kundeNavn}</strong>
          </div>
        </div>
      </div>

      <div className="bil-reservasjon-preview__body">
        <div className="bil-reservasjon-preview__doc-title">{model.dokument.tittel}</div>
        <div className="bil-reservasjon-preview__doc-subtitle">{model.dokument.undertittel}</div>
        <p className="bil-reservasjon-preview__intro">{model.intro}</p>
        {model.finnUrl ? (
          <p className="bil-reservasjon-preview__finn">
            <span>FINN-annonse</span>
            <a href={model.finnUrl} target="_blank" rel="noopener noreferrer">{model.finnUrl}</a>
          </p>
        ) : null}

        <div className="bil-reservasjon-preview__section">
          <h4>Avtalen i korthet</h4>
          <div className="bil-reservasjon-preview__grid bil-reservasjon-preview__grid--grouped">
            {(model.summaryGroups || []).map(function (group) {
              return (
                <div className="bil-reservasjon-preview__summary-group" key={group.title}>
                  <div className="bil-reservasjon-preview__summary-group-title">{group.title}</div>
                  <div className="bil-reservasjon-preview__summary-pairs">
                    {group.rows.map(function (row) {
                      return (
                        <div className={`bil-reservasjon-preview__summary-item${row.highlight ? ' is-highlight' : ''}`} key={group.title + ':' + row.label}>
                          <span>{row.label}</span>
                          <strong>{row.value}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(model.avtaleForholdPunkter?.length || model.avtaleKommentar) ? (
              <div className="bil-reservasjon-preview__cell bil-reservasjon-preview__cell--comment">
                <div className="bil-reservasjon-preview__innbytte-kommentar-label">Avtalte forhold</div>
                {model.avtaleForholdPunkter?.length ? (
                  <ul className="bil-reservasjon-preview__forhold-list">
                    {model.avtaleForholdPunkter.map(function (punkt, index) {
                      return <li key={'forhold-' + index}>{punkt}</li>;
                    })}
                  </ul>
                ) : (
                  <p>{model.avtaleKommentar}</p>
                )}
              </div>
            ) : null}
            {model.innbytte?.kommentar ? (
              <div className="bil-reservasjon-preview__cell bil-reservasjon-preview__cell--comment">
                <div className="bil-reservasjon-preview__innbytte-kommentar-label">Kommentar til innbyttebil</div>
                <p>{model.innbytte.kommentar}</p>
              </div>
            ) : null}
          </div>
        </div>

        {!model.skipPayment ? (
          <div className="bil-reservasjon-preview__section">
            <h4>Depositum og betaling</h4>
            <div className="bil-reservasjon-preview__payment">
              <div className="bil-reservasjon-preview__payment-title">{model.payment.title}</div>
              {model.payment.lines.map(function (line) {
                return <p key={line}>{line}</p>;
              })}
            </div>
          </div>
        ) : null}

        <div className="bil-reservasjon-preview__section">
          <h4>Vilkår og neste steg</h4>
          <div className="bil-reservasjon-preview__columns">
            <div className="bil-reservasjon-preview__list-box">
              <div className="bil-reservasjon-preview__list-head">Vilkår</div>
              <ul className="bil-reservasjon-preview__list bil-reservasjon-preview__list-body">
                {model.vilkar.map(function (item) {
                  return <li key={item}>{item}</li>;
                })}
              </ul>
            </div>
            <div className="bil-reservasjon-preview__list-box">
              <div className="bil-reservasjon-preview__list-head">Neste steg</div>
              <ol className="bil-reservasjon-preview__steps bil-reservasjon-preview__list-body">
                {model.nesteSteg.map(function (item) {
                  return <li key={item}>{item}</li>;
                })}
              </ol>
            </div>
          </div>
        </div>

        <div className="bil-reservasjon-preview__closing-row">
          <p className="bil-reservasjon-preview__closing">{model.avslutning}</p>
          <div className="bil-reservasjon-preview__signature">
            <div className="bil-reservasjon-preview__signature-line" />
            <div className="bil-reservasjon-preview__signature-label">Signatur kunde</div>
          </div>
        </div>
      </div>

      <div className="bil-reservasjon-preview__footer">
        {RESERVASJON_FIRMA.navn} · {RESERVASJON_FIRMA.adresse} · {RESERVASJON_FIRMA.mobil} · {RESERVASJON_FIRMA.epost} · {RESERVASJON_FIRMA.web}
      </div>
    </div>
  );
}

export default function BilReservasjonTab({ bil, kunder, knyttetInnbytte, oppdaterReservasjon, visTost, mailStatus }) {
  const [tekstDraft, setTekstDraft] = useState(function () {
    return readReservasjonTekst(bil.okonomi);
  });
  const tekstDraftRef = useRef(tekstDraft);
  const tekstSaveTimerRef = useRef(null);
  const tekstSyncKeyRef = useRef('');

  const rawReservasjon = getRawReservasjonFromOkonomi(bil.okonomi);
  const reservasjonVisning = useMemo(function () {
    return {
      ...getReservasjonFromOkonomi(bil.okonomi, bil),
      ...tekstDraft
    };
  }, [bil, tekstDraft]);
  const kundeIds = bil.kundeIds || (bil.kundeId ? [bil.kundeId] : []);
  const kunde = useMemo(function () {
    const id = kundeIds[0];
    if (!id) return null;
    return (kunder || []).find(function (k) { return k.id === id; }) || null;
  }, [kundeIds, kunder]);

  const [lasterPdf, setLasterPdf] = useState(false);
  const [senderEpost, setSenderEpost] = useState(false);
  const [melding, setMelding] = useState(function () {
    return buildReservasjonEpostMelding(bil, kunde, reservasjonVisning);
  });

  const bilNavn = buildBilVisningsnavn(bil);
  const kundeDok = useMemo(function () {
    return resolveKundeForDokument(kunde, { ...rawReservasjon, ...tekstDraft });
  }, [kunde, rawReservasjon, tekstDraft]);
  const erTilbud = rawReservasjon.dokumentType === DOKUMENT_TYPE_TILBUD;
  const erBankoverforing = rawReservasjon.betalingsmate === BETALINGSMATE_BANKOVERFORING;
  const harInnbytte = !!rawReservasjon.harInnbytte;
  const sendKonto = (mailStatus?.kontoer || []).find(function (k) { return k.standard; })
    || (mailStatus?.kontoer || [])[0];

  useEffect(function () {
    tekstDraftRef.current = tekstDraft;
  }, [tekstDraft]);

  useEffect(function () {
    const stored = readReservasjonTekst(bil.okonomi);
    const syncKey = bil.id + ':' + JSON.stringify(stored);
    if (syncKey === tekstSyncKeyRef.current) return;
    if (tekstSaveTimerRef.current) return;
    setTekstDraft(stored);
    tekstDraftRef.current = stored;
    tekstSyncKeyRef.current = syncKey;
  }, [bil.id, bil.okonomi]);

  useEffect(function () {
    return function () {
      if (tekstSaveTimerRef.current) {
        clearTimeout(tekstSaveTimerRef.current);
        tekstSaveTimerRef.current = null;
        oppdaterReservasjon(tekstDraftRef.current);
      }
    };
  }, [oppdaterReservasjon]);

  useEffect(function () {
    setMelding(buildReservasjonEpostMelding(bil, kunde, reservasjonVisning));
  }, [rawReservasjon.dokumentType, bil.id, kunde?.id, tekstDraft.kundeNavn, reservasjonVisning.kundeNavn]);

  const oppdater = function (patch, msg) {
    oppdaterReservasjon(patch, msg);
  };

  const oppdaterTekst = function (patch) {
    const next = { ...tekstDraftRef.current, ...patch };
    tekstDraftRef.current = next;
    setTekstDraft(next);
    clearTimeout(tekstSaveTimerRef.current);
    tekstSaveTimerRef.current = setTimeout(function () {
      tekstSaveTimerRef.current = null;
      oppdaterReservasjon(next);
      tekstSyncKeyRef.current = bil.id + ':' + JSON.stringify(next);
    }, 250);
  };

  const oppdaterTekstUmiddelbart = function (patch, msg) {
    clearTimeout(tekstSaveTimerRef.current);
    tekstSaveTimerRef.current = null;
    const next = { ...tekstDraftRef.current, ...patch };
    tekstDraftRef.current = next;
    setTekstDraft(next);
    oppdaterReservasjon(next, msg);
    tekstSyncKeyRef.current = bil.id + ':' + JSON.stringify(next);
  };

  const settDokumentType = function (type) {
    if (type === rawReservasjon.dokumentType) return;
    const patch = { dokumentType: type };
    if (type === DOKUMENT_TYPE_TILBUD && !rawReservasjon.tilbudGyldigTil) {
      patch.tilbudGyldigTil = addDaysIso(isoDateOnly(new Date()), 7);
    }
    oppdater(patch, type === DOKUMENT_TYPE_TILBUD ? 'Dokumenttype satt til tilbudsbrev ✓' : 'Dokumenttype satt til reservasjonsbekreftelse ✓');
  };

  const settStandardVarighet = function () {
    oppdater({
      reservasjonTil: addDaysIso(isoDateOnly(new Date()), RESERVASJON_FIRMA.reservasjonDager)
    }, `Reservasjon satt til ${RESERVASJON_FIRMA.reservasjonDager} dager ✓`);
  };

  const fyllFraInnbytte = function () {
    if (!knyttetInnbytte) return;
    const patch = patchFromInnbytte(knyttetInnbytte);
    oppdater({
      harInnbytte: patch.harInnbytte,
      innbytteReg: patch.innbytteReg,
      innbytteKm: patch.innbytteKm,
      innbyttePris: patch.innbyttePris
    }, 'Innbyttebil hentet fra forespørsel ✓');
    oppdaterTekstUmiddelbart({ innbytteKommentar: patch.innbytteKommentar });
  };

  const fyllFraKunde = function () {
    if (!kunde) return;
    oppdaterTekstUmiddelbart(patchKundeTilReservasjon(kunde), 'Kundenavn hentet fra kundekort ✓');
  };

  const pdfFilnavnPrefix = erTilbud ? 'Tilbud' : 'Reservasjon';

  const lastNedPdf = async function () {
    if (!bil?.id) return;
    setLasterPdf(true);
    try {
      const blob = await downloadReservasjonPdf(bil.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filnavn = [pdfFilnavnPrefix, bil.reg || bil.id, kunde?.navn || ''].filter(Boolean).join('-').replace(/\s+/g, '-');
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

  const sendPaEpost = async function () {
    if (!bil?.id) return;
    const epostMottaker = kundeDok.epost || kunde?.epost;
    if (!epostMottaker) {
      visTost('Legg inn e-postadresse på kunden ✗');
      return;
    }
    if (!melding.trim()) {
      visTost('Meldingen kan ikke være tom ✗');
      return;
    }
    if (!mailStatus?.smtpConfigured) {
      visTost('E-post er ikke konfigurert ✗');
      return;
    }
    setSenderEpost(true);
    try {
      await sendReservasjonDokument(bil.id, {
        melding: melding.trim(),
        kontoId: sendKonto?.id || null
      });
      visTost(erTilbud ? 'Tilbudsbrev sendt ✓' : 'Reservasjonsbekreftelse sendt ✓');
    } catch (err) {
      visTost((err?.message || 'Kunne ikke sende e-post') + ' ✗');
    } finally {
      setSenderEpost(false);
    }
  };

  return (
    <div className="bil-reservasjon">
      <div className="bil-reservasjon__layout">
        <div className="bil-reservasjon__panel">
          <div className="modal-sec">Dokumenttype</div>
          <div className="view-toggle gap" role="group" aria-label="Dokumenttype">
            <button
              type="button"
              className={`btn btn-sm ${erTilbud ? 'btn-p' : 'btn-g'}`}
              onClick={function () { settDokumentType(DOKUMENT_TYPE_TILBUD); }}
            >
              Tilbudsbrev
            </button>
            <button
              type="button"
              className={`btn btn-sm ${!erTilbud ? 'btn-p' : 'btn-g'}`}
              onClick={function () { settDokumentType(DOKUMENT_TYPE_RESERVASJON); }}
            >
              Reservasjonsbekreftelse
            </button>
          </div>
          <p className="bil-reservasjon__hint">
            {erTilbud
              ? 'Generer uforpliktende tilbudsbrev til kunden. Depositum og reservasjonsfrister hoppes over i dokumentet.'
              : 'Generer bindende reservasjonsbekreftelse med depositum og betalingsinformasjon.'}
          </p>

          <div className="modal-sec">Avtaledetaljer</div>

          <div className="bil-reservasjon__kunde">
            <div className="bil-reservasjon__innbytte-head">
              <div className="modal-sec" style={{ marginBottom: 0 }}>Kundenavn på dokument</div>
              {kunde ? (
                <button type="button" className="btn btn-g btn-sm" onClick={fyllFraKunde}>
                  Hent fra kunde
                </button>
              ) : null}
            </div>
            {!kunde ? (
              <p className="bil-reservasjon__hint bil-reservasjon__hint--tight">
                Koble kunde under Informasjon-fanen for å hente navn automatisk, eller fyll inn manuelt.
              </p>
            ) : null}

            <div className="gap">
              <div className="fl">Navn</div>
              <input
                type="text"
                placeholder={kunde?.navn || 'Kundens navn'}
                value={tekstDraft.kundeNavn}
                onChange={function (e) { oppdaterTekst({ kundeNavn: e.target.value }); }}
              />
            </div>
          </div>

          <div className="gap">
            <div className="fl">Bil</div>
            <div className="fv">{bilNavn}{bil.reg ? ` · ${bil.reg}` : ''}</div>
          </div>

          <div className="form-row gap">
            <div>
              <div className="fl">{erTilbud ? 'Tilbudspris (kr)' : 'Kjøpesum (kr)'}</div>
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
            {erTilbud ? (
              <div className="bil-reservasjon__gyldighet">
                <div className="fl">Tilbud gyldig til</div>
                <div className="form-row gap bil-reservasjon__gyldighet-row">
                  <input
                    type="date"
                    value={rawReservasjon.tilbudGyldigTil || ''}
                    onChange={function (e) { oppdater({ tilbudGyldigTil: e.target.value }); }}
                  />
                  <input
                    type="time"
                    value={rawReservasjon.tilbudGyldigTilKlokkeslett || ''}
                    onChange={function (e) { oppdater({ tilbudGyldigTilKlokkeslett: e.target.value }); }}
                    aria-label="Klokkeslett for tilbudsgyldighet"
                  />
                </div>
              </div>
            ) : (
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
            )}
          </div>

          {!erTilbud ? (
            <>
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
            </>
          ) : null}

          <AvtaleForholdEditor tekstDraft={tekstDraft} oppdaterTekst={oppdaterTekst} />

          <div className="bil-reservasjon__innbytte">
            <div className="bil-reservasjon__innbytte-head">
              <div className="modal-sec" style={{ marginBottom: 0 }}>Innbyttebil</div>
              <label className="bil-reservasjon__toggle">
                <input
                  type="checkbox"
                  checked={harInnbytte}
                  onChange={function (e) {
                    if (e.target.checked && knyttetInnbytte && !rawReservasjon.innbytteReg && rawReservasjon.innbytteKm == null && rawReservasjon.innbyttePris == null) {
                      const patch = patchFromInnbytte(knyttetInnbytte);
                      oppdater({
                        harInnbytte: patch.harInnbytte,
                        innbytteReg: patch.innbytteReg,
                        innbytteKm: patch.innbytteKm,
                        innbyttePris: patch.innbyttePris
                      }, 'Innbyttebil lagt til avtalen ✓');
                      oppdaterTekstUmiddelbart({ innbytteKommentar: patch.innbytteKommentar });
                      return;
                    }
                    oppdater({ harInnbytte: e.target.checked }, e.target.checked ? 'Innbyttebil lagt til avtalen ✓' : 'Innbyttebil fjernet fra avtalen ✓');
                  }}
                />
                <span>Kunde har innbyttebil</span>
              </label>
            </div>

            {harInnbytte ? (
              <>
                {knyttetInnbytte ? (
                  <div className="bil-reservasjon__innbytte-kilde">
                    <span>
                      Forespørsel: {[knyttetInnbytte.merke, knyttetInnbytte.modell, knyttetInnbytte.aar].filter(Boolean).join(' ')}
                      {knyttetInnbytte.reg ? ` · ${knyttetInnbytte.reg}` : ''}
                    </span>
                    <button type="button" className="btn btn-g btn-sm" onClick={fyllFraInnbytte}>
                      Hent fra forespørsel
                    </button>
                  </div>
                ) : null}

                <div className="form-row gap">
                  <div>
                    <div className="fl">Reg.nr.</div>
                    <input
                      type="text"
                      placeholder="AB12345"
                      value={rawReservasjon.innbytteReg || ''}
                      onChange={function (e) { oppdater({ innbytteReg: e.target.value.toUpperCase() }); }}
                    />
                  </div>
                  <div>
                    <div className="fl">Kilometerstand</div>
                    <input
                      type="number"
                      min="0"
                      placeholder="f.eks. 145000"
                      value={rawReservasjon.innbytteKm ?? ''}
                      onChange={function (e) {
                        const val = e.target.value;
                        oppdater({ innbytteKm: val === '' ? null : Number(val) });
                      }}
                    />
                  </div>
                </div>

                <div className="gap">
                  <div className="fl">Innbyttepris (kr)</div>
                  <input
                    type="number"
                    min="0"
                    placeholder="f.eks. 80000"
                    value={rawReservasjon.innbyttePris ?? ''}
                    onChange={function (e) {
                      const val = e.target.value;
                      oppdater({ innbyttePris: val === '' ? null : Number(val) });
                    }}
                  />
                </div>

                <div className="gap">
                  <div className="fl">Kommentar til innbyttebil</div>
                  <textarea
                    rows={3}
                    placeholder="F.eks. tilstand, utstyr eller forbehold knyttet til innbyttebilen"
                    value={tekstDraft.innbytteKommentar}
                    onChange={function (e) { oppdaterTekst({ innbytteKommentar: e.target.value }); }}
                  />
                </div>
              </>
            ) : (
              <p className="bil-reservasjon__hint bil-reservasjon__hint--tight">
                Aktiver hvis kunden bytter inn egen bil. Reg.nr., kilometerstand og pris vises i avtalen.
              </p>
            )}
          </div>

          <div className="bil-reservasjon__actions">
            {!erTilbud ? (
              <button type="button" className="btn btn-g btn-sm" onClick={settStandardVarighet}>
                +{RESERVASJON_FIRMA.reservasjonDager} dager reservasjon
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-g"
              disabled={lasterPdf || !reservasjonVisning.kjopesum}
              onClick={lastNedPdf}
            >
              {lasterPdf ? 'Lager PDF…' : 'Last ned PDF'}
            </button>
          </div>
          {!reservasjonVisning.kjopesum ? (
            <p className="bil-reservasjon__warn">Legg inn {erTilbud ? 'tilbudspris' : 'kjøpesum'} for å generere PDF.</p>
          ) : null}

          <div className="bil-reservasjon__epost">
            <div className="modal-sec">Send på e-post</div>
            {!mailStatus?.smtpConfigured ? (
              <p className="bil-reservasjon__hint bil-reservasjon__hint--tight">
                E-post er ikke konfigurert. Gå til Innstillinger for å sette opp SMTP.
              </p>
            ) : null}
            <div className="gap">
              <div className="fl">E-post til kunde</div>
              <input
                type="email"
                placeholder={kunde?.epost || 'post@eksempel.no'}
                value={tekstDraft.kundeEpost}
                onChange={function (e) { oppdaterTekst({ kundeEpost: e.target.value }); }}
                disabled={!mailStatus?.smtpConfigured}
              />
            </div>
            <div className="gap">
              <div className="fl">Melding til kunde</div>
              <textarea
                rows={8}
                value={melding}
                onChange={function (e) { setMelding(e.target.value); }}
                disabled={!mailStatus?.smtpConfigured}
              />
            </div>
            {mailStatus?.smtpConfigured && sendKonto ? (
              <p className="bil-reservasjon__hint bil-reservasjon__hint--tight">
                Sendes fra {sendKonto.epost || sendKonto.navn} med PDF vedlagt.
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-p"
              disabled={
                senderEpost
                || !reservasjonVisning.kjopesum
                || !(kundeDok.epost || kunde?.epost)
                || !mailStatus?.smtpConfigured
              }
              onClick={sendPaEpost}
            >
              {senderEpost ? 'Sender…' : (erTilbud ? 'Send tilbudsbrev' : 'Send reservasjonsbekreftelse')}
            </button>
            {!(kundeDok.epost || kunde?.epost) ? (
              <p className="bil-reservasjon__warn">Legg inn e-postadresse for å sende.</p>
            ) : null}
          </div>
        </div>

        <ReservasjonPreview bil={bil} kunde={kunde} reservasjonVisning={reservasjonVisning} />
      </div>
    </div>
  );
}
