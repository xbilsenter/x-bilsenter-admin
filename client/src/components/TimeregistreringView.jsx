import { useCallback, useEffect, useMemo, useState } from 'react';
import useIsMobile from '../useIsMobile.js';
import {
  deleteTimeregistrering,
  getBrukere,
  getTimeregistrering,
  getTimeregistreringAktiv,
  getTimeregistreringOppsummering,
  patchTimeregistrering,
  postTimeregistrering,
  sluttPauseTimereg,
  startPauseTimereg,
  stempleInnTimereg,
  stempleUtTimereg
} from '../api.js';

const NORSK_TIDSSONE = 'Europe/Oslo';

function idag() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: NORSK_TIDSSONE });
}

function klokke() {
  return new Date().toLocaleTimeString('sv-SE', {
    timeZone: NORSK_TIDSSONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function weekStartIso(dateIso) {
  const d = new Date(String(dateIso || idag()) + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(dateIso, days) {
  const d = new Date(String(dateIso) + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDato(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' });
}

function fmtUke(fra, til) {
  const f = new Date(fra + 'T12:00:00');
  const t = new Date(til + 'T12:00:00');
  const fmt = function (d) {
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  };
  return `${fmt(f)} – ${fmt(t)}`;
}

function nok(v) {
  return `kr ${Number(v || 0).toLocaleString('nb-NO')}`;
}

function statusLabel(status) {
  if (status === 'aktiv') return 'Jobber';
  if (status === 'pause') return 'Pause';
  if (status === 'godkjent') return 'Godkjent';
  if (status === 'fullfort') return 'Fullført';
  return status || '—';
}

function statusClass(status) {
  if (status === 'aktiv') return 'timereg-status--aktiv';
  if (status === 'pause') return 'timereg-status--pause';
  if (status === 'godkjent') return 'timereg-status--godkjent';
  return 'timereg-status--fullfort';
}

const EMPTY_MANUAL = {
  dato: idag(),
  startTid: '08:00',
  sluttTid: '16:00',
  notat: '',
  pauser: []
};

function newPause() {
  return {
    id: `p${Date.now()}`,
    start: '12:00',
    slutt: '12:30',
    type: 'pause',
    notat: ''
  };
}

function normalizePauserList(list) {
  return (Array.isArray(list) ? list : []).map(function (item, idx) {
    return {
      id: item?.id || `p${idx + 1}`,
      start: String(item?.start || '').slice(0, 5),
      slutt: String(item?.slutt || '').slice(0, 5),
      type: item?.type || 'pause',
      notat: String(item?.notat || '')
    };
  });
}

function PauseEditor({ pauser, onChange, allowOpenEnd }) {
  const list = normalizePauserList(pauser);

  const update = function (idx, field, value) {
    onChange(list.map(function (p, i) {
      if (i !== idx) return p;
      return { ...p, [field]: value };
    }));
  };

  const add = function () {
    onChange([...list, newPause()]);
  };

  const remove = function (idx) {
    onChange(list.filter(function (_, i) { return i !== idx; }));
  };

  return (
    <div className="timereg-pauser">
      <div className="timereg-pauser-hd">
        <div className="fl">Pauser</div>
        <button type="button" className="btn btn-g btn-sm" onClick={add}>+ Legg til pause</button>
      </div>
      {!list.length && (
        <div className="timereg-pauser-empty">Ingen pauser. Legg til hvis det var pause under arbeidsdagen.</div>
      )}
      {list.map(function (p, idx) {
        return (
          <div key={p.id || idx} className="timereg-pause-row">
            <div>
              <div className="fl">Fra</div>
              <input type="time" value={p.start} onChange={function (e) { update(idx, 'start', e.target.value); }} />
            </div>
            <div>
              <div className="fl">Til</div>
              <input
                type="time"
                value={p.slutt || ''}
                onChange={function (e) { update(idx, 'slutt', e.target.value); }}
                placeholder={allowOpenEnd ? 'Pågår' : ''}
              />
            </div>
            <div>
              <div className="fl">Type</div>
              <select value={p.type || 'pause'} onChange={function (e) { update(idx, 'type', e.target.value); }}>
                <option value="pause">Pause</option>
                <option value="lunsj">Lunsj</option>
                <option value="annet">Annet</option>
              </select>
            </div>
            <div className="timereg-pause-notat">
              <div className="fl">Notat</div>
              <input
                type="text"
                value={p.notat || ''}
                placeholder="Valgfritt"
                onChange={function (e) { update(idx, 'notat', e.target.value); }}
              />
            </div>
            <button type="button" className="btn btn-g btn-sm timereg-pause-remove" onClick={function () { remove(idx); }} title="Fjern pause">
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

function pauseSummary(item) {
  const pauser = item?.pauser || [];
  if (!pauser.length) return '—';
  return pauser.map(function (p) {
    const span = p.slutt ? `${p.start}–${p.slutt}` : `${p.start}–…`;
    const type = p.type && p.type !== 'pause' ? ` (${p.type})` : '';
    return span + type;
  }).join(', ');
}

export default function TimeregistreringView({ currentUser, visTost }) {
  const isMobile = useIsMobile();
  const [now, setNow] = useState(function () { return klokke(); });
  const [ukeFra, setUkeFra] = useState(function () { return weekStartIso(idag()); });
  const [items, setItems] = useState([]);
  const [aktiv, setAktiv] = useState(null);
  const [oppsummering, setOppsummering] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [brukere, setBrukere] = useState([]);
  const [valgtUserId, setValgtUserId] = useState(null);

  const kanSeAlle = !!(currentUser?.isAdmin || (currentUser?.permissions || []).includes('brukere'));
  const ukeTil = useMemo(function () { return addDaysIso(ukeFra, 6); }, [ukeFra]);
  const targetUserId = kanSeAlle && valgtUserId ? valgtUserId : currentUser?.id;

  useEffect(function () {
    const t = setInterval(function () { setNow(klokke()); }, 1000);
    return function () { clearInterval(t); };
  }, []);

  useEffect(function () {
    if (!kanSeAlle) return;
    getBrukere()
      .then(function (res) { setBrukere(res.items || []); })
      .catch(function () { /* stille */ });
  }, [kanSeAlle]);

  const reload = useCallback(async function () {
    setLoading(true);
    try {
      const params = { fra: ukeFra, til: ukeTil };
      if (targetUserId) params.userId = targetUserId;
      const [listRes, aktivRes, sumRes] = await Promise.all([
        getTimeregistrering(params),
        getTimeregistreringAktiv(targetUserId),
        getTimeregistreringOppsummering(params)
      ]);
      setItems(listRes.items || []);
      setAktiv(aktivRes.item || null);
      setOppsummering(sumRes.oppsummering || null);
    } catch (err) {
      visTost(err.message || 'Kunne ikke laste timeregistrering ✗');
    } finally {
      setLoading(false);
    }
  }, [ukeFra, ukeTil, targetUserId, visTost]);

  useEffect(function () { reload(); }, [reload]);

  useEffect(function () {
    if (!aktiv) return;
    const t = setInterval(function () { reload(); }, 30000);
    return function () { clearInterval(t); };
  }, [aktiv, reload]);

  const egenAktiv = aktiv && Number(aktiv.userId) === Number(currentUser?.id);
  const visStempling = !kanSeAlle || !valgtUserId || Number(valgtUserId) === Number(currentUser?.id);

  const idagPoster = useMemo(function () {
    const today = idag();
    return items.filter(function (item) { return item.dato === today; });
  }, [items]);

  const runAction = async function (fn, okMsg) {
    setBusy(true);
    try {
      await fn();
      visTost(okMsg);
      await reload();
    } catch (err) {
      visTost(err.message || 'Handling feilet ✗');
    } finally {
      setBusy(false);
    }
  };

  const lagreManual = async function () {
    if (!manual) return;
    setBusy(true);
    try {
      await postTimeregistrering({
        dato: manual.dato,
        startTid: manual.startTid,
        sluttTid: manual.sluttTid,
        notat: manual.notat,
        pauser: manual.pauser,
        userId: kanSeAlle && valgtUserId ? valgtUserId : undefined
      });
      visTost('Timeregistrering lagt til ✓');
      setManual(null);
      await reload();
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre ✗');
    } finally {
      setBusy(false);
    }
  };

  const lagreEdit = async function () {
    if (!editItem) return;
    setBusy(true);
    try {
      const body = editItem.kunPauser
        ? { pauser: editItem.pauser }
        : {
          dato: editItem.dato,
          startTid: editItem.startTid,
          sluttTid: editItem.sluttTid,
          notat: editItem.notat,
          pauser: editItem.pauser,
          status: editItem.status
        };
      await patchTimeregistrering(editItem.id, body);
      visTost('Registrering oppdatert ✓');
      setEditItem(null);
      await reload();
    } catch (err) {
      visTost(err.message || 'Kunne ikke oppdatere ✗');
    } finally {
      setBusy(false);
    }
  };

  const slett = async function (id) {
    if (!window.confirm('Slette denne registreringen?')) return;
    setBusy(true);
    try {
      await deleteTimeregistrering(id);
      visTost('Registrering slettet ✓');
      await reload();
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette ✗');
    } finally {
      setBusy(false);
    }
  };

  const openPauseEdit = function (item) {
    setEditItem({
      ...item,
      pauser: normalizePauserList(item.pauser),
      kunPauser: item.status === 'aktiv' || item.status === 'pause'
    });
  };

  const visLonn = (currentUser?.timelonn > 0 || kanSeAlle) && oppsummering?.lonnKr > 0;

  const kanRedigere = function (item) {
    if (item.status === 'fullfort' || item.status === 'godkjent' || kanSeAlle) return true;
    if ((item.status === 'aktiv' || item.status === 'pause') && Number(item.userId) === Number(currentUser?.id)) {
      return true;
    }
    return false;
  };

  return (
    <div className="timereg">
      <div className="timereg-header">
        <div>
          <h1 className="page-title">Timeregistrering</h1>
          <p className="page-sub">Registrer arbeidstid, pauser og få oversikt over uken.</p>
        </div>
        <div className="timereg-header-actions">
          {kanSeAlle && (
            <select
              className="timereg-user-select"
              value={valgtUserId || ''}
              onChange={function (e) {
                setValgtUserId(e.target.value ? Number(e.target.value) : null);
              }}
            >
              <option value="">Min registrering</option>
              {brukere.map(function (b) {
                return <option key={b.id} value={b.id}>{b.name}</option>;
              })}
            </select>
          )}
          <button type="button" className="btn btn-g btn-sm" onClick={function () { setManual({ ...EMPTY_MANUAL }); }}>
            + Manuell registrering
          </button>
        </div>
      </div>

      <div className={`timereg-top ${isMobile ? 'timereg-top--mobile' : ''}`}>
        {visStempling && (
          <div className="timereg-clock-card card">
            <div className="timereg-clock">{now.slice(0, 5)}</div>
            <div className="timereg-clock-sub">{fmtDato(idag())}</div>

            {egenAktiv ? (
              <>
                <div className={`timereg-status-pill ${statusClass(aktiv.status)}`}>
                  {statusLabel(aktiv.status)}
                  {aktiv.stats?.display ? ` · ${aktiv.stats.display}` : ''}
                </div>
                <div className="timereg-actions">
                  {aktiv.status === 'aktiv' && (
                    <>
                      <button type="button" className="btn btn-g" disabled={busy} onClick={function () {
                        runAction(startPauseTimereg, 'Pause startet ✓');
                      }}>
                        Start pause
                      </button>
                      <button type="button" className="btn btn-p" disabled={busy} onClick={function () {
                        runAction(stempleUtTimereg, 'Stemplet ut ✓');
                      }}>
                        Stemple ut
                      </button>
                    </>
                  )}
                  {aktiv.status === 'pause' && (
                    <>
                      <button type="button" className="btn btn-p" disabled={busy} onClick={function () {
                        runAction(sluttPauseTimereg, 'Pause avsluttet ✓');
                      }}>
                        Avslutt pause
                      </button>
                      <button type="button" className="btn btn-g" disabled={busy} onClick={function () {
                        runAction(stempleUtTimereg, 'Stemplet ut ✓');
                      }}>
                        Stemple ut
                      </button>
                    </>
                  )}
                </div>
                <div className="timereg-meta">
                  Inn: {aktiv.startTid}
                  {aktiv.stats?.pauseDisplay && aktiv.stats.pauseMin > 0 ? ` · Pause: ${aktiv.stats.pauseDisplay}` : ''}
                </div>
                <button type="button" className="btn btn-g btn-sm" disabled={busy} onClick={function () { openPauseEdit(aktiv); }}>
                  Rediger pauser
                </button>
              </>
            ) : (
              <>
                <div className="timereg-status-pill timereg-status--idle">Ikke stemplet inn</div>
                <button type="button" className="btn btn-p timereg-stemple-inn" disabled={busy} onClick={function () {
                  runAction(stempleInnTimereg, 'Stemplet inn ✓');
                }}>
                  Stemple inn
                </button>
              </>
            )}
          </div>
        )}

        <div className="timereg-stats-grid">
          <div className="timereg-stat card">
            <div className="timereg-stat-label">Denne uken</div>
            <div className="timereg-stat-value">{oppsummering ? `${oppsummering.timer} t` : '—'}</div>
            <div className="timereg-stat-sub">{oppsummering ? `${oppsummering.dager} dag${oppsummering.dager === 1 ? '' : 'er'}` : ''}</div>
          </div>
          <div className="timereg-stat card">
            <div className="timereg-stat-label">Pause totalt</div>
            <div className="timereg-stat-value">
              {oppsummering ? `${Math.round(oppsummering.pauseMin / 60 * 10) / 10} t` : '—'}
            </div>
          </div>
          {visLonn && (
            <div className="timereg-stat card timereg-stat--accent">
              <div className="timereg-stat-label">Estimert lønn</div>
              <div className="timereg-stat-value">{nok(oppsummering?.lonnKr)}</div>
              <div className="timereg-stat-sub">Basert på timelønn</div>
            </div>
          )}
          <div className="timereg-stat card">
            <div className="timereg-stat-label">I dag</div>
            <div className="timereg-stat-value">
              {idagPoster.length
                ? `${Math.round(idagPoster.reduce(function (s, i) { return s + (i.stats?.nettoMin || 0); }, 0) / 60 * 10) / 10} t`
                : '0 t'}
            </div>
            <div className="timereg-stat-sub">{idagPoster.length ? `${idagPoster.length} registrering${idagPoster.length === 1 ? '' : 'er'}` : 'Ingen poster'}</div>
          </div>
        </div>
      </div>

      <div className="card timereg-list-card">
        <div className="card-h">
          <div>
            <span className="card-ht">Ukeoversikt</span>
            <div className="timereg-week-label">{fmtUke(ukeFra, ukeTil)}</div>
          </div>
          <div className="timereg-week-nav">
            <button type="button" className="btn btn-g btn-sm" onClick={function () {
              setUkeFra(addDaysIso(ukeFra, -7));
            }}>
              ← Forrige
            </button>
            <button type="button" className="btn btn-g btn-sm" onClick={function () {
              setUkeFra(weekStartIso(idag()));
            }}>
              Denne uken
            </button>
            <button type="button" className="btn btn-g btn-sm" onClick={function () {
              setUkeFra(addDaysIso(ukeFra, 7));
            }}>
              Neste →
            </button>
          </div>
        </div>

        {loading ? (
          <div className="inbox-empty">Laster timeregistrering…</div>
        ) : items.length === 0 ? (
          <div className="inbox-empty">Ingen registreringer denne uken.</div>
        ) : (
          <div className="timereg-table-wrap">
            <table className="timereg-table">
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Status</th>
                  <th>Inn</th>
                  <th>Ut</th>
                  <th>Pause</th>
                  <th>Timer</th>
                  {visLonn && <th>Lønn</th>}
                  <th>Notat</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(function (item) {
                  const pauserTxt = pauseSummary(item);
                  return (
                    <tr key={item.id}>
                      <td>{fmtDato(item.dato)}</td>
                      <td><span className={`timereg-status-pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                      <td>{item.startTid || '—'}</td>
                      <td>{item.sluttTid || (item.status === 'aktiv' || item.status === 'pause' ? '…' : '—')}</td>
                      <td className="timereg-notat" title={pauserTxt}>{pauserTxt}</td>
                      <td><strong>{item.stats?.display || '—'}</strong></td>
                      {visLonn && <td>{item.stats?.lonnKr ? nok(item.stats.lonnKr) : '—'}</td>}
                      <td className="timereg-notat">{item.notat || '—'}</td>
                      <td className="timereg-row-actions">
                        {kanRedigere(item) && (
                          <>
                            <button type="button" className="btn btn-g btn-sm" onClick={function () { openPauseEdit(item); }}>
                              Rediger
                            </button>
                            {' '}
                            {(item.status === 'fullfort' || item.status === 'godkjent' || kanSeAlle) && (
                              <button type="button" className="btn btn-g btn-sm" disabled={busy} onClick={function () { slett(item.id); }}>
                                Slett
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manual && (
        <div className="modal-overlay" onClick={function () { if (!busy) setManual(null); }}>
          <div className="modal timereg-modal" onClick={function (e) { e.stopPropagation(); }}>
            <div className="modal-h">
              <strong>Manuell registrering</strong>
              <button type="button" className="modal-x" onClick={function () { setManual(null); }}>×</button>
            </div>
            <div className="modal-b">
              <div className="form-row gap">
                <div>
                  <div className="fl">Dato</div>
                  <input type="date" value={manual.dato} onChange={function (e) { setManual({ ...manual, dato: e.target.value }); }} />
                </div>
                <div>
                  <div className="fl">Start</div>
                  <input type="time" value={manual.startTid} onChange={function (e) { setManual({ ...manual, startTid: e.target.value }); }} />
                </div>
                <div>
                  <div className="fl">Slutt</div>
                  <input type="time" value={manual.sluttTid} onChange={function (e) { setManual({ ...manual, sluttTid: e.target.value }); }} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <PauseEditor
                  pauser={manual.pauser}
                  onChange={function (next) { setManual({ ...manual, pauser: next }); }}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="fl">Notat (valgfritt)</div>
                <textarea rows={3} value={manual.notat} onChange={function (e) { setManual({ ...manual, notat: e.target.value }); }} placeholder="F.eks. ekstra vask, verksted..." />
              </div>
            </div>
            <div className="modal-f">
              <button type="button" className="btn btn-g" onClick={function () { setManual(null); }}>Avbryt</button>
              <button type="button" className="btn btn-p" disabled={busy} onClick={lagreManual}>Lagre</button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={function () { if (!busy) setEditItem(null); }}>
          <div className="modal timereg-modal" onClick={function (e) { e.stopPropagation(); }}>
            <div className="modal-h">
              <strong>{editItem.kunPauser ? 'Rediger pauser' : 'Rediger registrering'}</strong>
              <button type="button" className="modal-x" onClick={function () { setEditItem(null); }}>×</button>
            </div>
            <div className="modal-b">
              {!editItem.kunPauser && (
                <div className="form-row gap">
                  <div>
                    <div className="fl">Dato</div>
                    <input type="date" value={editItem.dato} onChange={function (e) { setEditItem({ ...editItem, dato: e.target.value }); }} />
                  </div>
                  <div>
                    <div className="fl">Start</div>
                    <input type="time" value={editItem.startTid} onChange={function (e) { setEditItem({ ...editItem, startTid: e.target.value }); }} />
                  </div>
                  <div>
                    <div className="fl">Slutt</div>
                    <input type="time" value={editItem.sluttTid || ''} onChange={function (e) { setEditItem({ ...editItem, sluttTid: e.target.value }); }} />
                  </div>
                </div>
              )}
              {editItem.kunPauser && (
                <div className="timereg-pauser-hint">
                  Juster pauser for dagens arbeidsøkt. Inn- og utstempling endres via klokken.
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <PauseEditor
                  pauser={editItem.pauser}
                  allowOpenEnd={editItem.kunPauser}
                  onChange={function (next) { setEditItem({ ...editItem, pauser: next }); }}
                />
              </div>
              {!editItem.kunPauser && kanSeAlle && (
                <div style={{ marginTop: 12 }}>
                  <div className="fl">Status</div>
                  <select value={editItem.status} onChange={function (e) { setEditItem({ ...editItem, status: e.target.value }); }}>
                    <option value="fullfort">Fullført</option>
                    <option value="godkjent">Godkjent</option>
                  </select>
                </div>
              )}
              {!editItem.kunPauser && (
                <div style={{ marginTop: 12 }}>
                  <div className="fl">Notat</div>
                  <textarea rows={3} value={editItem.notat || ''} onChange={function (e) { setEditItem({ ...editItem, notat: e.target.value }); }} />
                </div>
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="btn btn-g" onClick={function () { setEditItem(null); }}>Avbryt</button>
              <button type="button" className="btn btn-p" disabled={busy} onClick={lagreEdit}>Lagre</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
