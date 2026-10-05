import { useCallback, useEffect, useMemo, useState } from 'react';
import useIsMobile from '../useIsMobile.js';
import {
  deleteTimeregistrering,
  getBrukere,
  getTimeregistrering,
  getTimeregistreringMaanedOppsummering,
  getTimeregistreringOppsummering,
  patchTimeregistrering,
  postTimeregistrering
} from '../api.js';

const NORSK_TIDSSONE = 'Europe/Oslo';

function idag() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: NORSK_TIDSSONE });
}

function monthRangeIso(ar, maaned) {
  const y = Number(ar);
  const m = Number(maaned);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const fra = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const til = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { ar: y, maaned: m, fra, til };
}

function fmtDato(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' });
}

function currentYearMonth() {
  const parts = idag().split('-');
  return { ar: Number(parts[0]), maaned: Number(parts[1]) };
}

function shiftMonth(ar, maaned, delta) {
  let y = Number(ar);
  let m = Number(maaned) + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { ar: y, maaned: m };
}

function fmtMaaned(ar, maaned) {
  const d = new Date(Number(ar), Number(maaned) - 1, 1);
  return d.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
}

function nokOre(ore) {
  const kr = (Number(ore) || 0) / 100;
  return `kr ${kr.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMinutter(total) {
  const min = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} t`;
  return `${h} t ${m} min`;
}

function fmtTimerDesimal(min) {
  const n = Math.max(0, Number(min) || 0) / 60;
  return `${n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
}

function fmtGrenseTimer(min, fallbackMin) {
  const raw = Number(min);
  const hours = (Number.isFinite(raw) && raw > 0 ? raw : fallbackMin) / 60;
  return Number.isInteger(hours) ? String(hours) : String(hours).replace('.', ',');
}

function krysserMidnatt(startTid, sluttTid) {
  if (!startTid || !sluttTid) return false;
  return String(sluttTid) < String(startTid);
}

function kreverTimeregNotat(notat) {
  return !!String(notat || '').trim();
}

function statusLabel(status, kanGodkjenne) {
  if (status === 'aktiv') return 'Jobber';
  if (status === 'pause') return 'Pause';
  if (status === 'godkjent' && kanGodkjenne) return 'Godkjent';
  if (status === 'fullfort' || status === 'godkjent') return 'Fullført';
  return status || '—';
}

function statusClass(status, kanGodkjenne) {
  if (status === 'aktiv') return 'timereg-status--aktiv';
  if (status === 'pause') return 'timereg-status--pause';
  if (status === 'godkjent' && kanGodkjenne) return 'timereg-status--godkjent';
  return 'timereg-status--fullfort';
}

function visTimeregStatus(item, kanGodkjenne) {
  if (!kanGodkjenne && item.status === 'godkjent') return 'fullfort';
  return item.status;
}

const EMPTY_MANUAL = {
  dato: idag(),
  startTid: '08:00',
  sluttTid: '16:00',
  notat: '',
  pauser: [],
  overMidnatt: false
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

function pauseSummary(item) {
  const pauser = item?.pauser || [];
  const min = Number(item?.stats?.pauseMin) || 0;
  if (!pauser.length) return min ? `${min} min` : '—';
  const ranges = pauser.map(function (p) {
    const span = p.slutt ? `${p.start}–${p.slutt}` : `${p.start}–…`;
    const type = p.type && p.type !== 'pause' ? ` (${p.type})` : '';
    return span + type;
  }).join(', ');
  return min ? `${ranges} · ${min} min` : ranges;
}

function overtidTittel(stats) {
  if (!stats?.overtidMin) return 'Ingen overtid';
  return `Over 9 timer i døgnet: ${fmtTimerFraMin(stats.overtidDagMin)}. Over 40 timer i uken: ${fmtTimerFraMin(stats.overtidUkeMin)}.`;
}

function fmtTimerFraMin(min) {
  const timer = Math.round((Number(min || 0) / 60) * 10) / 10;
  return `${String(timer).replace('.', ',')} t`;
}

function skrivUtTimereg() {
  const node = document.querySelector('.timereg-print');
  if (!node || !node.parentNode) return;
  const parent = node.parentNode;
  const placeholder = document.createComment('timereg-print');
  parent.insertBefore(placeholder, node);
  document.body.appendChild(node);
  document.body.classList.add('timereg-printing');
  let ferdig = false;
  const done = function () {
    if (ferdig) return;
    ferdig = true;
    document.body.classList.remove('timereg-printing');
    if (placeholder.parentNode) placeholder.parentNode.insertBefore(node, placeholder);
    placeholder.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function fmtDatoUtskrift(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  const ukedag = d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace('.', '');
  const parts = String(iso).split('-');
  return `${ukedag} ${parts[2]}.${parts[1]}.${parts[0]}`;
}

function enTallverdi(map) {
  const keys = Object.keys(map);
  if (keys.length !== 1) return null;
  return Number(keys[0]);
}

function summerTimeregPoster(poster) {
  return poster.reduce(function (acc, item) {
    const s = item.stats || {};
    acc.nettoMin += s.nettoMin || 0;
    acc.pauseMin += s.pauseMin || 0;
    acc.overtidMin += s.overtidMin || 0;
    acc.ordinærLonnOre += s.ordinærLonnOre || 0;
    acc.overtidsbelopOre += s.overtidsbelopOre || 0;
    acc.lonnOre += s.lonnOre || 0;
    const sats = Number(s.timesats || item.timelonn) || 0;
    if (sats > 0) acc.satser[sats] = true;
    const pst = Number(s.overtidsprosent || item.overtidsprosent) || 0;
    if (pst > 0) acc.prosenter[pst] = true;
    return acc;
  }, {
    nettoMin: 0,
    pauseMin: 0,
    overtidMin: 0,
    ordinærLonnOre: 0,
    overtidsbelopOre: 0,
    lonnOre: 0,
    satser: {},
    prosenter: {}
  });
}

function TimeregUtskrift({ ansattNavn, periodeLabel, poster }) {
  const sortert = poster.slice().sort(function (a, b) {
    return String(a.dato).localeCompare(String(b.dato)) || String(a.startTid || '').localeCompare(String(b.startTid || ''));
  });
  const dager = [];
  sortert.forEach(function (item) {
    let dag = dager[dager.length - 1];
    if (!dag || dag.dato !== item.dato) {
      dag = { dato: item.dato, poster: [] };
      dager.push(dag);
    }
    dag.poster.push(item);
  });
  const total = summerTimeregPoster(sortert);
  const timesats = enTallverdi(total.satser);
  const prosent = enTallverdi(total.prosenter);
  const harLonn = Object.keys(total.satser).length > 0;

  return (
    <div className="timereg-print">
      <div className="timereg-print__accent" />
      <header className="timereg-print__head">
        <img className="timereg-print__logo" src="/assets/logo.svg" alt="X Bilsenter AS" />
        <div className="timereg-print__firm">
          <strong>X Bilsenter AS</strong>
          <span>Postboks 1730 Vika, 0121 Oslo</span>
          <span>920 50 990 · post@xbilsenter.no</span>
        </div>
      </header>
      <div className="timereg-print__intro">
        <div>
          <h1 className="timereg-print__title">Timeliste</h1>
          <p className="timereg-print__lead">Lønnsgrunnlag med ordinær lønn og overtidstillegg</p>
        </div>
        <dl className="timereg-print__meta">
          <div><dt>Ansatt</dt><dd>{ansattNavn}</dd></div>
          <div><dt>Periode</dt><dd>{periodeLabel}</dd></div>
          <div><dt>Utskriftsdato</dt><dd>{fmtDatoUtskrift(idag())}</dd></div>
          <div><dt>Timesats</dt><dd>{timesats ? nokOre(timesats * 100) : (harLonn ? 'Ulik' : '—')}</dd></div>
          <div><dt>Overtid</dt><dd>{prosent ? `${prosent} %` : (harLonn ? 'Ulik' : '—')}</dd></div>
        </dl>
      </div>
      {dager.length === 0 ? (
        <p className="timereg-print__empty">Ingen registreringer i valgt periode.</p>
      ) : (
        <>
          <table className="timereg-print__table">
            <thead>
              <tr>
                <th>Dato</th>
                <th>Inn / ut</th>
                <th>Pause</th>
                <th className="timereg-print__num">Arbeidstid</th>
                <th className="timereg-print__num">Overtid</th>
                <th className="timereg-print__num">Ordinær lønn</th>
                <th className="timereg-print__num">Tillegg</th>
                <th className="timereg-print__num">Sum</th>
              </tr>
            </thead>
            <tbody>
              {dager.map(function (dag) {
                const sum = summerTimeregPoster(dag.poster);
                const dagHarLonn = Object.keys(sum.satser).length > 0;
                return (
                  <tr key={dag.dato}>
                    <td>
                      <strong>{fmtDatoUtskrift(dag.dato)}</strong>
                      {dag.poster.some(function (item) { return item.notat; }) ? (
                        <span className="timereg-print__note">
                          {dag.poster.map(function (item) { return item.notat; }).filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {dag.poster.map(function (item) {
                        const ut = item.sluttTid || (item.status === 'aktiv' || item.status === 'pause' ? '…' : '—');
                        return <span key={item.id} className="timereg-print__line">{item.startTid || '—'}–{ut}</span>;
                      })}
                    </td>
                    <td>
                      {dag.poster.map(function (item) {
                        return <span key={item.id} className="timereg-print__line">{pauseSummary(item)}</span>;
                      })}
                    </td>
                    <td className="timereg-print__num">{fmtMinutter(sum.nettoMin)}</td>
                    <td className="timereg-print__num">{sum.overtidMin ? fmtMinutter(sum.overtidMin) : '—'}</td>
                    <td className="timereg-print__num">{dagHarLonn ? nokOre(sum.ordinærLonnOre) : '—'}</td>
                    <td className="timereg-print__num">{dagHarLonn ? nokOre(sum.overtidsbelopOre) : '—'}</td>
                    <td className="timereg-print__num"><strong>{dagHarLonn ? nokOre(sum.lonnOre) : '—'}</strong></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totalt · {dager.length} dag{dager.length === 1 ? '' : 'er'}</td>
                <td className="timereg-print__num">{fmtMinutter(total.nettoMin)}</td>
                <td className="timereg-print__num">{total.overtidMin ? fmtMinutter(total.overtidMin) : '—'}</td>
                <td className="timereg-print__num">{harLonn ? nokOre(total.ordinærLonnOre) : '—'}</td>
                <td className="timereg-print__num">{harLonn ? nokOre(total.overtidsbelopOre) : '—'}</td>
                <td className="timereg-print__num">{harLonn ? nokOre(total.lonnOre) : '—'}</td>
              </tr>
            </tfoot>
          </table>
          <section className="timereg-print__sum">
            <h2>Oppsummering</h2>
            <dl>
              <div><dt>Arbeidstimer</dt><dd>{fmtTimerDesimal(total.nettoMin)}</dd></div>
              <div><dt>Overtid</dt><dd>{fmtTimerDesimal(total.overtidMin)}</dd></div>
              <div><dt>Timesats</dt><dd>{timesats ? nokOre(timesats * 100) : (harLonn ? 'Ulik' : '—')}</dd></div>
              <div><dt>Overtidsprosent</dt><dd>{prosent ? `${prosent} %` : (harLonn ? 'Ulik' : '—')}</dd></div>
              <div><dt>Ordinær lønn</dt><dd>{harLonn ? nokOre(total.ordinærLonnOre) : '—'}</dd></div>
              <div><dt>Overtidstillegg</dt><dd>{harLonn ? nokOre(total.overtidsbelopOre) : '—'}</dd></div>
              <div className="timereg-print__sum-total"><dt>Totalt lønnsgrunnlag</dt><dd>{harLonn ? nokOre(total.lonnOre) : '—'}</dd></div>
            </dl>
            <p>Ordinær lønn er alle arbeidstimer ganger timesats. Overtidstillegg kommer i tillegg og telles ikke dobbelt.</p>
          </section>
        </>
      )}
    </div>
  );
}

function pauseTypeLabel(type) {
  if (type === 'lunsj') return 'Lunsj';
  if (type === 'annet') return 'Annet';
  return 'Pause';
}

function TimeregField({ label, hint, children }) {
  return (
    <label className="timereg-field">
      <span className="timereg-field-label">{label}</span>
      {children}
      {hint ? <span className="timereg-field-hint">{hint}</span> : null}
    </label>
  );
}

function TimeregSheet({ title, subtitle, onClose, onSave, saveLabel, busy, children }) {
  return (
    <div className="ov" onClick={function () { if (!busy) onClose(); }}>
      <div className="modal timereg-sheet" onClick={function (e) { e.stopPropagation(); }}>
        <div className="timereg-sheet-hd">
          <div className="timereg-sheet-intro">
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="timereg-sheet-sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Lukk">×</button>
        </div>
        <div className="timereg-sheet-body">{children}</div>
        <div className="modal-footer timereg-sheet-footer">
          <button type="button" className="btn btn-g" onClick={onClose} disabled={busy}>Avbryt</button>
          <button type="button" className="btn btn-p" onClick={onSave} disabled={busy}>
            {busy ? 'Lagrer…' : (saveLabel || 'Lagre')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PauseEditor({ pauser, onChange, allowOpenEnd }) {
  const list = normalizePauserList(pauser);

  const update = function (idx, field, value) {
    onChange(list.map(function (p, i) {
      if (i !== idx) return p;
      return { ...p, [field]: value };
    }));
  };

  return (
    <div className="timereg-pauser">
      <div className="timereg-pauser-hd">
        <div>
          <div className="modal-sec timereg-pauser-sec">Pauser</div>
          <div className="timereg-pauser-copy">Pauser trekkes fra arbeidstiden før overtid beregnes.</div>
        </div>
        <button type="button" className="btn btn-g btn-sm timereg-pauser-add" onClick={function () {
          onChange([...list, newPause()]);
        }}>
          + Legg til
        </button>
      </div>

      {!list.length ? (
        <div className="timereg-pauser-empty">
          <strong>Ingen pauser</strong>
          <span>Trykk «Legg til» hvis det var pause i løpet av dagen.</span>
        </div>
      ) : (
        <div className="timereg-pause-list">
          {list.map(function (p, idx) {
            return (
              <div key={p.id || idx} className="timereg-pause-card">
                <div className="timereg-pause-card-hd">
                  <span className="timereg-pause-card-title">Pause {idx + 1}</span>
                  <span className="timereg-pause-type-chip">{pauseTypeLabel(p.type)}</span>
                  <button
                    type="button"
                    className="btn btn-g btn-xs timereg-pause-remove"
                    onClick={function () { onChange(list.filter(function (_, i) { return i !== idx; })); }}
                  >
                    Fjern
                  </button>
                </div>
                <div className="timereg-pause-card-grid">
                  <TimeregField label="Fra">
                    <input type="time" value={p.start} onChange={function (e) { update(idx, 'start', e.target.value); }} />
                  </TimeregField>
                  <TimeregField label={allowOpenEnd && !p.slutt ? 'Til (pågår)' : 'Til'}>
                    <input
                      type="time"
                      value={p.slutt || ''}
                      onChange={function (e) { update(idx, 'slutt', e.target.value); }}
                    />
                  </TimeregField>
                  <TimeregField label="Type">
                    <select value={p.type || 'pause'} onChange={function (e) { update(idx, 'type', e.target.value); }}>
                      <option value="pause">Pause</option>
                      <option value="lunsj">Lunsj</option>
                      <option value="annet">Annet</option>
                    </select>
                  </TimeregField>
                  <TimeregField label="Notat" hint="Valgfritt">
                    <input
                      type="text"
                      value={p.notat || ''}
                      placeholder="F.eks. lunsj ute"
                      onChange={function (e) { update(idx, 'notat', e.target.value); }}
                    />
                  </TimeregField>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimeregEntryActions({ item, busy, kanSeAlle, kanGodkjenne, kanRedigere, onEdit, onDelete, onGodkjenn, onAngreGodkjenning, compact }) {
  if (!kanRedigere(item) && !kanGodkjenne) return null;
  const kanGodkjennePost = kanGodkjenne && item.status === 'fullfort';
  const kanAngreGodkjenning = kanGodkjenne && item.status === 'godkjent';
  const size = compact ? 'btn-xs' : 'btn-sm';
  return (
    <div className={`timereg-entry-actions${compact ? ' timereg-entry-actions--compact' : ''}`}>
      {kanGodkjennePost && (
        <button type="button" className={`btn btn-p ${size}`} disabled={busy} onClick={function () { onGodkjenn(item.id); }}>
          Godkjenn
        </button>
      )}
      {kanAngreGodkjenning && (
        <button type="button" className={`btn btn-g ${size}`} disabled={busy} onClick={function () { onAngreGodkjenning(item.id); }}>
          Angre
        </button>
      )}
      {kanRedigere(item) && (
        <button type="button" className={`btn btn-g ${size}`} onClick={function () { onEdit(item); }}>
          Rediger
        </button>
      )}
      {kanRedigere(item) && (item.status === 'fullfort' || item.status === 'godkjent' || kanSeAlle) && (
        <button type="button" className={`btn btn-g ${size}`} disabled={busy} onClick={function () { onDelete(item.id); }}>
          Slett
        </button>
      )}
    </div>
  );
}

export default function TimeregistreringView({ currentUser, visTost }) {
  const isMobile = useIsMobile();
  const [maanedAr, setMaanedAr] = useState(function () { return currentYearMonth().ar; });
  const [maanedNum, setMaanedNum] = useState(function () { return currentYearMonth().maaned; });
  const [items, setItems] = useState([]);
  const [oppsummering, setOppsummering] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [brukere, setBrukere] = useState([]);
  const [valgtUserId, setValgtUserId] = useState(null);
  const [maanedData, setMaanedData] = useState(null);
  const [maanedLoading, setMaanedLoading] = useState(false);
  const [utskrift, setUtskrift] = useState(null);

  const kanSeAlle = !!(currentUser?.isAdmin || (currentUser?.permissions || []).includes('brukere'));
  const kanGodkjenne = !!currentUser?.isAdmin;
  const maanedRange = useMemo(function () {
    return monthRangeIso(maanedAr, maanedNum);
  }, [maanedAr, maanedNum]);
  const targetUserId = kanSeAlle && valgtUserId ? valgtUserId : currentUser?.id;
  const sheetOpen = !!(manual || editItem);

  useEffect(function () {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return function () { document.body.style.overflow = prev; };
  }, [sheetOpen]);

  useEffect(function () {
    if (!kanSeAlle) return;
    getBrukere()
      .then(function (res) { setBrukere(res.items || []); })
      .catch(function () { /* stille */ });
  }, [kanSeAlle]);

  const reload = useCallback(async function () {
    if (!maanedRange) return;
    setLoading(true);
    try {
      const params = { fra: maanedRange.fra, til: maanedRange.til };
      if (targetUserId) params.userId = targetUserId;
      const [listRes, sumRes] = await Promise.all([
        getTimeregistrering(params),
        getTimeregistreringOppsummering(params)
      ]);
      setItems(listRes.items || []);
      setOppsummering(sumRes.oppsummering || null);
    } catch (err) {
      visTost(err.message || 'Kunne ikke laste timeregistrering ✗');
    } finally {
      setLoading(false);
    }
  }, [maanedRange, targetUserId, visTost]);

  useEffect(function () { reload(); }, [reload]);

  const reloadMaaned = useCallback(async function () {
    if (!kanSeAlle) return;
    setMaanedLoading(true);
    try {
      const res = await getTimeregistreringMaanedOppsummering({ ar: maanedAr, maaned: maanedNum });
      setMaanedData(res);
    } catch (err) {
      visTost(err.message || 'Kunne ikke laste månedsoversikt ✗');
      setMaanedData(null);
    } finally {
      setMaanedLoading(false);
    }
  }, [kanSeAlle, maanedAr, maanedNum, visTost]);

  useEffect(function () {
    reloadMaaned();
  }, [reloadMaaned]);

  const velgAnsattFraMaaned = function (userId) {
    if (!userId) return;
    setValgtUserId(userId);
    visTost('Viser valgt ansatt i månedsoversikten ✓');
  };

  const byttMaaned = function (delta) {
    const next = shiftMonth(maanedAr, maanedNum, delta);
    setMaanedAr(next.ar);
    setMaanedNum(next.maaned);
  };

  const gaTilDenneMaaned = function () {
    const now = currentYearMonth();
    setMaanedAr(now.ar);
    setMaanedNum(now.maaned);
  };

  const idagPoster = useMemo(function () {
    const today = idag();
    return items.filter(function (item) { return item.dato === today; });
  }, [items]);

  const lagreManual = async function () {
    if (!manual) return;
    if (!kreverTimeregNotat(manual.notat)) {
      visTost('Notat er påkrevd ved timeregistrering ✗');
      return;
    }
    setBusy(true);
    try {
      await postTimeregistrering({
        dato: manual.dato,
        startTid: manual.startTid,
        sluttTid: manual.sluttTid,
        notat: manual.notat,
        pauser: manual.pauser,
        overMidnatt: !!manual.overMidnatt,
        userId: kanSeAlle && valgtUserId ? valgtUserId : undefined
      });
      visTost('Timeregistrering lagt til ✓');
      setManual(null);
      await reload();
      if (kanSeAlle) await reloadMaaned();
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre ✗');
    } finally {
      setBusy(false);
    }
  };

  const lagreEdit = async function () {
    if (!editItem) return;
    if (!kreverTimeregNotat(editItem.notat)) {
      visTost('Notat er påkrevd ved timeregistrering ✗');
      return;
    }
    setBusy(true);
    try {
      const body = {
        dato: editItem.dato,
        startTid: editItem.startTid,
        sluttTid: editItem.sluttTid,
        notat: editItem.notat,
        pauser: editItem.pauser,
        overMidnatt: !!editItem.overMidnatt
      };
      await patchTimeregistrering(editItem.id, body);
      visTost('Registrering oppdatert ✓');
      setEditItem(null);
      await reload();
      if (kanSeAlle) await reloadMaaned();
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
      if (kanSeAlle) await reloadMaaned();
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette ✗');
    } finally {
      setBusy(false);
    }
  };

  const endreGodkjenning = async function (id, status) {
    setBusy(true);
    try {
      await patchTimeregistrering(id, { status });
      visTost(status === 'godkjent' ? 'Timer godkjent ✓' : 'Godkjenning angret ✓');
      await reload();
      if (kanSeAlle) await reloadMaaned();
    } catch (err) {
      visTost(err.message || 'Kunne ikke oppdatere godkjenning ✗');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = function (item) {
    setEditItem({
      ...item,
      pauser: normalizePauserList(item.pauser),
      overMidnatt: krysserMidnatt(item.startTid, item.sluttTid)
    });
  };

  const ansattNavn = kanSeAlle && valgtUserId
    ? ((brukere.find(function (b) { return Number(b.id) === Number(valgtUserId); }) || {}).name || 'Ansatt')
    : (currentUser?.name || 'Ansatt');
  const utskriftDato = utskrift?.dato && utskrift.dato >= maanedRange.fra && utskrift.dato <= maanedRange.til
    ? utskrift.dato
    : (idag() >= maanedRange.fra && idag() <= maanedRange.til ? idag() : maanedRange.fra);
  const utskriftPoster = utskrift?.modus === 'dag'
    ? items.filter(function (item) { return item.dato === utskriftDato; })
    : items;
  const utskriftPeriode = utskrift?.modus === 'dag'
    ? fmtDato(utskriftDato)
    : fmtMaaned(maanedAr, maanedNum);

  const visLonn = kanSeAlle && (oppsummering?.lonnKr > 0 || items.some(function (item) { return item.stats?.lonnKr > 0; }));
  const visLonnMaaned = kanSeAlle && (maanedData?.totalt?.lonnKr > 0 || maanedData?.ansatte?.some(function (row) { return row.lonnKr > 0; }));
  const maanedAnsatte = maanedData?.ansatte || [];
  const maanedTotalt = maanedData?.totalt || null;

  const kanRedigere = function (item) {
    if (item.laast) return false;
    if (item.status === 'fullfort' || kanSeAlle) return true;
    if ((item.status === 'aktiv' || item.status === 'pause') && Number(item.userId) === Number(currentUser?.id)) {
      return true;
    }
    return false;
  };
  const posterSortert = items.slice().sort(function (a, b) {
    const byDate = String(b.dato).localeCompare(String(a.dato));
    if (byDate) return byDate;
    return String(a.startTid || '').localeCompare(String(b.startTid || ''));
  });

  return (
    <div className="timereg">
      <div className="ph timereg-ph">
        <div>
          <div className="ph-title">Timeregistrering</div>
          <div className="ph-sub">{currentUser?.name || 'Mine timer'}</div>
        </div>
        <div className="ph-actions timereg-ph-actions">
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
          <button type="button" className="btn btn-p" onClick={function () { setManual({ ...EMPTY_MANUAL }); }}>
            + Registrer timer
          </button>
        </div>
      </div>

      <div className={`timereg-top ${isMobile ? 'timereg-top--mobile' : ''}`}>
        <div className="timereg-stats-grid">
          <div className="timereg-stat card">
            <div className="timereg-stat-label">Denne måneden</div>
            <div className="timereg-stat-value">{oppsummering ? `${oppsummering.timer} t` : '—'}</div>
            <div className="timereg-stat-sub">{oppsummering ? `${oppsummering.dager} dag${oppsummering.dager === 1 ? '' : 'er'}` : ''}</div>
          </div>
          <div className="timereg-stat card">
            <div className="timereg-stat-label">Overtid</div>
            <div className="timereg-stat-value">{oppsummering ? fmtTimerDesimal(oppsummering.overtidMin) : '—'}</div>
            <div className="timereg-stat-sub">
              Over {fmtGrenseTimer(posterSortert[0]?.stats?.dagligGrenseMin, 540)} timer/dag og {fmtGrenseTimer(posterSortert[0]?.stats?.ukentligGrenseMin, 2400)} timer/uke
            </div>
          </div>
          {visLonn && (
            <div className="timereg-stat card">
              <div className="timereg-stat-label">Lønn</div>
              <div className="timereg-stat-value">{nokOre(oppsummering?.lonnOre)}</div>
              <div className="timereg-stat-sub">
                {oppsummering ? `${nokOre(oppsummering.ordinærLonnOre)} + ${nokOre(oppsummering.overtidsbelopOre)} tillegg` : ''}
              </div>
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
        <div className="card-h timereg-list-hd">
          <div>
            <span className="card-ht">{kanSeAlle && valgtUserId ? 'Månedsoversikt – ansatt' : 'Månedsoversikt'}</span>
            <div className="timereg-week-label">{fmtMaaned(maanedAr, maanedNum)}</div>
          </div>
          <div className="timereg-week-nav">
            {kanSeAlle ? (
              <button
                type="button"
                className="btn btn-g btn-sm"
                onClick={function () {
                  setUtskrift({ modus: 'maaned', dato: idag() >= maanedRange.fra && idag() <= maanedRange.til ? idag() : maanedRange.fra });
                }}
              >
                Skriv ut
              </button>
            ) : null}
            <button type="button" className="btn btn-g btn-sm" onClick={function () { byttMaaned(-1); }}>
              ←
            </button>
            <button type="button" className="btn btn-g btn-sm timereg-week-current" onClick={gaTilDenneMaaned}>
              Denne måneden
            </button>
            <button type="button" className="btn btn-g btn-sm" onClick={function () { byttMaaned(1); }}>
              →
            </button>
          </div>
        </div>

        {loading ? (
          <div className="inbox-empty">Laster timeregistrering…</div>
        ) : items.length === 0 ? (
          <div className="inbox-empty">Ingen registreringer denne måneden.</div>
        ) : isMobile ? (
          <div className="timereg-lines">
            {posterSortert.map(function (item) {
              const itemStatus = visTimeregStatus(item, kanGodkjenne);
              const otMin = item.stats?.overtidMin || 0;
              const avvik = item.avvik || [];
              return (
                <article key={item.id} className="timereg-line">
                  <div className="timereg-line__top">
                    <strong>{fmtDato(item.dato)}</strong>
                    <span>{fmtMinutter(item.stats?.nettoMin || 0)}</span>
                  </div>
                  <div className="timereg-line__sub">
                    {item.startTid || '—'}–{item.sluttTid || (item.status === 'aktiv' || item.status === 'pause' ? '…' : '—')}
                    {' · pause '}{pauseSummary(item)}
                    {otMin ? ` · overtid ${fmtMinutter(otMin)}` : ''}
                  </div>
                  {item.notat ? <div className="timereg-line__note">{item.notat}</div> : null}
                  {avvik.map(function (msg) {
                    return <p key={msg} className="timereg-avvik">{msg}</p>;
                  })}
                  <div className="timereg-line__foot">
                    <span className={`timereg-status-pill ${statusClass(itemStatus, kanGodkjenne)}`}>{statusLabel(itemStatus, kanGodkjenne)}</span>
                    <TimeregEntryActions
                      item={item}
                      busy={busy}
                      compact
                      kanSeAlle={kanSeAlle}
                      kanGodkjenne={kanGodkjenne}
                      kanRedigere={kanRedigere}
                      onEdit={openEdit}
                      onDelete={slett}
                      onGodkjenn={function (id) { endreGodkjenning(id, 'godkjent'); }}
                      onAngreGodkjenning={function (id) { endreGodkjenning(id, 'fullfort'); }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="timereg-table-wrap">
            <table className="timereg-table timereg-days">
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Inn</th>
                  <th>Ut</th>
                  <th>Pause</th>
                  <th>Arbeidstid</th>
                  <th>Overtid</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {posterSortert.map(function (item) {
                  const itemStatus = visTimeregStatus(item, kanGodkjenne);
                  const otMin = item.stats?.overtidMin || 0;
                  const avvik = item.avvik || [];
                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{fmtDato(item.dato)}</strong>
                        {item.notat ? <span className="timereg-day-note">{item.notat}</span> : null}
                        {avvik.map(function (msg) {
                          return <span key={msg} className="timereg-avvik">{msg}</span>;
                        })}
                      </td>
                      <td>{item.startTid || '—'}</td>
                      <td>{item.sluttTid || (item.status === 'aktiv' || item.status === 'pause' ? '…' : '—')}</td>
                      <td>{pauseSummary(item)}</td>
                      <td>{fmtMinutter(item.stats?.nettoMin || 0)}</td>
                      <td>{otMin ? fmtMinutter(otMin) : '—'}</td>
                      <td><span className={`timereg-status-pill ${statusClass(itemStatus, kanGodkjenne)}`}>{statusLabel(itemStatus, kanGodkjenne)}</span></td>
                      <td className="timereg-row-actions">
                        <TimeregEntryActions
                          item={item}
                          busy={busy}
                          compact
                          kanSeAlle={kanSeAlle}
                          kanGodkjenne={kanGodkjenne}
                          kanRedigere={kanRedigere}
                          onEdit={openEdit}
                          onDelete={slett}
                          onGodkjenn={function (id) { endreGodkjenning(id, 'godkjent'); }}
                          onAngreGodkjenning={function (id) { endreGodkjenning(id, 'fullfort'); }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {kanSeAlle && (
        <div className="card timereg-list-card timereg-month-card">
          <div className="card-h timereg-list-hd">
            <div>
              <span className="card-ht">Månedsoversikt – alle ansatte</span>
              <div className="timereg-week-label">{fmtMaaned(maanedAr, maanedNum)}</div>
            </div>
            <div className="timereg-week-nav">
              <button type="button" className="btn btn-g btn-sm" onClick={function () { byttMaaned(-1); }}>
                ←
              </button>
              <button
                type="button"
                className="btn btn-g btn-sm timereg-week-current"
                onClick={gaTilDenneMaaned}
              >
                Denne måneden
              </button>
              <button type="button" className="btn btn-g btn-sm" onClick={function () { byttMaaned(1); }}>
                →
              </button>
            </div>
          </div>

          {maanedLoading ? (
            <div className="inbox-empty">Laster månedsoversikt…</div>
          ) : maanedAnsatte.length === 0 ? (
            <div className="inbox-empty">Ingen ansatte med timeregistrering.</div>
          ) : isMobile ? (
            <div className="timereg-entry-list">
              {maanedAnsatte.map(function (row) {
                return (
                  <article key={row.userId} className="timereg-entry-card timereg-month-card-item">
                    <div className="timereg-entry-card-top">
                      <div>
                        <div className="timereg-entry-date">{row.brukerNavn}</div>
                        <div className="timereg-month-meta">{row.dager} dag{row.dager === 1 ? '' : 'er'} · {row.registreringer} post{row.registreringer === 1 ? '' : 'er'}</div>
                      </div>
                      <div className="timereg-entry-hours">{row.timer} t</div>
                    </div>
                    <div className="timereg-entry-meta">
                      <div><span>Pause</span><strong>{row.pauseTimer} t</strong></div>
                      <div><span>Overtid</span><strong>{row.overtidTimer || 0} t</strong></div>
                      {visLonnMaaned && (
                        <div><span>Lønn</span><strong>{row.lonnOre ? nokOre(row.lonnOre) : '—'}</strong></div>
                      )}
                    </div>
                    <div className="timereg-entry-actions">
                      <button type="button" className="btn btn-g btn-sm" onClick={function () { velgAnsattFraMaaned(row.userId); }}>
                        Vis poster
                      </button>
                    </div>
                  </article>
                );
              })}
              {maanedTotalt ? (
                <article className="timereg-entry-card timereg-month-card-item timereg-month-card-item--total">
                  <div className="timereg-entry-card-top">
                    <div>
                      <div className="timereg-entry-date">Totalt</div>
                      <div className="timereg-month-meta">{maanedTotalt.registreringer} poster</div>
                    </div>
                    <div className="timereg-entry-hours">{maanedTotalt.timer} t</div>
                  </div>
                  {visLonnMaaned && maanedTotalt.lonnKr > 0 ? (
                    <div className="timereg-entry-meta">
                      <div><span>Estimert lønn</span><strong>{nokOre(maanedTotalt.lonnOre)}</strong></div>
                    </div>
                  ) : null}
                </article>
              ) : null}
            </div>
          ) : (
            <div className="timereg-table-wrap">
              <table className="timereg-table timereg-month-table">
                <thead>
                  <tr>
                    <th>Ansatt</th>
                    <th>Dager</th>
                    <th>Poster</th>
                    <th>Timer</th>
                    <th>Overtid</th>
                    <th>Pause</th>
                    {visLonnMaaned && <th>Tillegg</th>}
                    {visLonnMaaned && <th>Lønn</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {maanedAnsatte.map(function (row) {
                    const aktiv = Number(valgtUserId) === Number(row.userId);
                    return (
                      <tr key={row.userId} className={aktiv ? 'timereg-month-row--active' : ''}>
                        <td><strong>{row.brukerNavn}</strong></td>
                        <td>{row.dager}</td>
                        <td>{row.registreringer}</td>
                        <td><strong>{row.timer} t</strong></td>
                        <td>{row.overtidTimer || 0} t</td>
                        <td>{row.pauseTimer} t</td>
                        {visLonnMaaned && <td>{row.overtidsbelopOre ? nokOre(row.overtidsbelopOre) : '—'}</td>}
                        {visLonnMaaned && <td>{row.lonnOre ? nokOre(row.lonnOre) : '—'}</td>}
                        <td className="timereg-row-actions">
                          <button type="button" className="btn btn-g btn-xs" onClick={function () { velgAnsattFraMaaned(row.userId); }}>
                            Vis poster
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {maanedTotalt ? (
                  <tfoot>
                    <tr className="timereg-month-total-row">
                      <td><strong>Totalt</strong></td>
                      <td>{maanedTotalt.dager}</td>
                      <td>{maanedTotalt.registreringer}</td>
                      <td><strong>{maanedTotalt.timer} t</strong></td>
                      <td>{maanedTotalt.overtidTimer || 0} t</td>
                      <td>{maanedTotalt.pauseTimer} t</td>
                      {visLonnMaaned && <td>{maanedTotalt.overtidsbelopOre ? nokOre(maanedTotalt.overtidsbelopOre) : '—'}</td>}
                      {visLonnMaaned && <td>{maanedTotalt.lonnOre ? nokOre(maanedTotalt.lonnOre) : '—'}</td>}
                      <td></td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </div>
      )}

      {manual && (
        <TimeregSheet
          title="Registrer timer"
          subtitle="Legg inn dato, arbeidstid og eventuelle pauser."
          busy={busy}
          onClose={function () { setManual(null); }}
          onSave={lagreManual}
          saveLabel="Lagre registrering"
        >
          <div className="timereg-form-section">
            <div className="modal-sec">Arbeidstid</div>
            <div className="form-row3 timereg-form-grid">
              <TimeregField label="Dato">
                <input type="date" value={manual.dato} onChange={function (e) { setManual({ ...manual, dato: e.target.value }); }} />
              </TimeregField>
              <TimeregField label="Start">
                <input type="time" value={manual.startTid} onChange={function (e) { setManual({ ...manual, startTid: e.target.value }); }} />
              </TimeregField>
              <TimeregField label="Slutt">
                <input type="time" value={manual.sluttTid} onChange={function (e) { setManual({ ...manual, sluttTid: e.target.value }); }} />
              </TimeregField>
            </div>
            {krysserMidnatt(manual.startTid, manual.sluttTid) ? (
              <label className="timereg-midnight">
                <input
                  type="checkbox"
                  checked={!!manual.overMidnatt}
                  onChange={function (e) { setManual({ ...manual, overMidnatt: e.target.checked }); }}
                />
                Ut-tid er før inn-tid. Bekreft at vakten går over midnatt.
              </label>
            ) : null}
          </div>

          <div className="timereg-form-section">
            <PauseEditor
              pauser={manual.pauser}
              onChange={function (next) { setManual({ ...manual, pauser: next }); }}
            />
          </div>

          <div className="timereg-form-section">
            <div className="modal-sec">Notat</div>
            <TimeregField label="Kommentar" hint="Påkrevd — beskriv hva som ble gjort">
              <textarea
                rows={3}
                className="timereg-textarea"
                value={manual.notat}
                onChange={function (e) { setManual({ ...manual, notat: e.target.value }); }}
                placeholder="F.eks. klargjøring av bil, verksted, vask…"
                required
              />
            </TimeregField>
          </div>
        </TimeregSheet>
      )}

      {editItem && (
        <TimeregSheet
          title="Rediger registrering"
          subtitle={`${fmtDato(editItem.dato)} · ${editItem.startTid || '—'}–${editItem.sluttTid || '—'}`}
          busy={busy}
          onClose={function () { setEditItem(null); }}
          onSave={lagreEdit}
          saveLabel="Lagre endringer"
        >
          <div className="timereg-form-section">
            <div className="modal-sec">Arbeidstid</div>
            <div className="form-row3 timereg-form-grid">
              <TimeregField label="Dato">
                <input type="date" value={editItem.dato} onChange={function (e) { setEditItem({ ...editItem, dato: e.target.value }); }} />
              </TimeregField>
              <TimeregField label="Start">
                <input type="time" value={editItem.startTid} onChange={function (e) { setEditItem({ ...editItem, startTid: e.target.value }); }} />
              </TimeregField>
              <TimeregField label="Slutt">
                <input type="time" value={editItem.sluttTid || ''} onChange={function (e) { setEditItem({ ...editItem, sluttTid: e.target.value }); }} />
              </TimeregField>
            </div>
            {krysserMidnatt(editItem.startTid, editItem.sluttTid) ? (
              <label className="timereg-midnight">
                <input
                  type="checkbox"
                  checked={!!editItem.overMidnatt}
                  onChange={function (e) { setEditItem({ ...editItem, overMidnatt: e.target.checked }); }}
                />
                Ut-tid er før inn-tid. Bekreft at vakten går over midnatt.
              </label>
            ) : null}
          </div>

          <div className="timereg-form-section">
            <PauseEditor
              pauser={editItem.pauser}
              onChange={function (next) { setEditItem({ ...editItem, pauser: next }); }}
            />
          </div>

          <div className="timereg-form-section">
            <div className="modal-sec">Notat</div>
            <TimeregField label="Kommentar" hint="Påkrevd — beskriv hva som ble gjort">
              <textarea
                rows={3}
                className="timereg-textarea"
                value={editItem.notat || ''}
                onChange={function (e) { setEditItem({ ...editItem, notat: e.target.value }); }}
                placeholder="Beskriv arbeidet som ble utført"
                required
              />
            </TimeregField>
          </div>
        </TimeregSheet>
      )}

      {kanSeAlle && utskrift ? (
        <div className="ov" onClick={function () { setUtskrift(null); }}>
          <div className="modal timereg-print-modal" onClick={function (e) { e.stopPropagation(); }}>
            <div className="timereg-sheet-hd">
              <div>
                <div className="modal-title">Skriv ut timeregistrering</div>
                <div className="timereg-sheet-sub">{ansattNavn}</div>
              </div>
              <button type="button" className="modal-close" onClick={function () { setUtskrift(null); }} aria-label="Lukk">×</button>
            </div>
            <div className="timereg-print-controls">
              <div className="timereg-print-mode">
                <button
                  type="button"
                  className={`btn btn-sm ${utskrift.modus === 'dag' ? 'btn-p' : 'btn-g'}`}
                  onClick={function () { setUtskrift(function (prev) { return { ...prev, modus: 'dag', dato: utskriftDato }; }); }}
                >
                  Dag
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${utskrift.modus === 'maaned' ? 'btn-p' : 'btn-g'}`}
                  onClick={function () { setUtskrift(function (prev) { return { ...prev, modus: 'maaned' }; }); }}
                >
                  Måned
                </button>
              </div>
              {utskrift.modus === 'dag' ? (
                <label className="timereg-field">
                  <span className="timereg-field-label">Dato</span>
                  <input
                    type="date"
                    min={maanedRange.fra}
                    max={maanedRange.til}
                    value={utskriftDato}
                    onChange={function (e) { setUtskrift(function (prev) { return { ...prev, dato: e.target.value }; }); }}
                  />
                </label>
              ) : (
                <div className="timereg-sheet-sub">{fmtMaaned(maanedAr, maanedNum)}</div>
              )}
              <p className="timereg-print-hint">
                Utskriften viser timer, overtid og lønn per dag, med totalsum for perioden.
                {kanSeAlle && !valgtUserId ? ' Velg ansatt i listen øverst hvis arket skal gjelde noen andre enn deg.' : ''}
              </p>
            </div>
            <TimeregUtskrift ansattNavn={ansattNavn} periodeLabel={utskriftPeriode} poster={utskriftPoster} />
            <div className="modal-footer">
              <button type="button" className="btn btn-g" onClick={function () { setUtskrift(null); }}>Lukk</button>
              <button type="button" className="btn btn-p" onClick={skrivUtTimereg}>Skriv ut</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
