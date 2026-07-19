import { useState, useEffect, useCallback, useRef } from 'react';
import Login from './components/Login.jsx';
import SignatureEditor, { buildSignaturePreviewHtml } from './components/SignatureEditor.jsx';
import MailComposer, { buildMailPreviewHtml, htmlIsEmpty } from './components/MailComposer.jsx';
import {
  DEFAULT_INNSTILLINGER, SFARGE, KFARGE, TAB_PERMISSIONS, canAccess,
  buildModulTabs, normalizeModulOppsett, DEFAULT_MODUL_OPPSATT, MODUL_ICONS
} from './constants.js';
import {
  getToken, logout,
  getMe,
  getDashboard, getHenvendelser, patchHenvendelse,
  getInnbytte, patchInnbytte,
  getBiler, postBil, patchBil,
  getKalender, postKalender, patchKalender,
  lookupKjoretoy, getInnstillinger, patchInnstillinger,
  getInnboks, syncInnboks, patchEpost, sendEpostMultipart, getEpostUtkast, getEpostUtkastById, saveEpostUtkast, deleteEpostUtkast, opprettHenvFraEpost,
  sendHenvendelseSvar, getMailKontoer, postMailKonto, patchMailKonto, deleteMailKonto, testMailKonto,
  getEpostMaler, postEpostMal, patchEpostMal, deleteEpostMal,
  getBrukereMeta, getBrukere, postBruker, patchBruker, deleteBruker
} from './api.js';

// ─── DATE HELPERS ────────────────────────────────────────────────────────────
function idag() {
  return new Date().toISOString().slice(0, 10);
}

function formatDatoLang() {
  return new Date().toLocaleDateString('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
}

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  let startOffset = first.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const gridStart = new Date(year, month, 1 - startOffset);
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({
      iso: toIsoDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month
    });
  }

  while (cells.length > 35 && cells.slice(-7).every(function (c) { return !c.inMonth; })) {
    cells.splice(-7);
  }

  return cells;
}

function isSameMonth(iso, year, month) {
  const parts = String(iso || '').split('-');
  if (parts.length < 2) return false;
  return Number(parts[0]) === year && Number(parts[1]) - 1 === month;
}

const IDAG = idag();
const DAGER = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function formatKalTid(e) {
  if (!e?.tid) return '—';
  if (e.tidSlutt) return `${e.tid}–${e.tidSlutt}`;
  return e.tid;
}

function SignaturePreview({ body, signatur, label }) {
  const html = buildSignaturePreviewHtml(body, signatur);
  if (!html) return null;
  return (
    <div className="mail-signatur-preview">
      <div className="mail-signatur-preview__label">{label}</div>
      <div className="mail-signatur-preview__html" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
export function Badge({ s }) {
  const c = SFARGE[s] || '#6B7280';
  return (
    <span className="badge" style={{ background: c + '18', color: c, border: `1px solid ${c}30` }}>
      {s}
    </span>
  );
}

export function KBadge({ type }) {
  const c = KFARGE[type] || '#6B7280';
  return <span className="badge" style={{ background: c + '18', color: c }}>{type}</span>;
}

export function nok(v) {
  return `kr ${Number(v || 0).toLocaleString('nb-NO')}`;
}

function svvFarge(c) {
  const m = {
    HVIT: '#f9fafb', SORT: '#111827', SØLV: '#9ca3af', GRÅ: '#6b7280',
    BLÅ: '#1d4ed8', RØD: '#dc2626', GRØNN: '#16a34a', BRUN: '#78350f',
    GULL: '#b45309', ORANSJE: '#ea580c', FIOLETT: '#7c3aed', BEIGE: '#d4c5a9'
  };
  return m[c?.toUpperCase()] || '#6b7280';
}

function fmtKm(km) {
  const n = Number(km);
  return Number.isFinite(n) ? n.toLocaleString('nb-NO') : String(km || '—');
}

function matchesBilRef(ref, reg) {
  if (!ref || !reg) return false;
  return String(ref).trim().toUpperCase() === String(reg).trim().toUpperCase();
}

function kanbanStatuses(lists, biler) {
  const base = Array.isArray(lists?.bilStatuser) ? [...lists.bilStatuser] : [];
  (biler || []).forEach(function (bil) {
    if (bil.status && !base.includes(bil.status)) base.push(bil.status);
  });
  return base;
}

function bilMerker(biler, lists) {
  const names = new Set();
  (lists?.merker || []).forEach(function (m) { names.add(m); });
  (biler || []).forEach(function (b) {
    if (b.merke) names.add(b.merke);
  });
  return ['Alle', ...Array.from(names).sort(function (a, b) {
    if (a === 'Annet') return 1;
    if (b === 'Annet') return -1;
    return a.localeCompare(b, 'nb');
  })];
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [tab, setTab] = useState('dashboard');
  const [biler, setBiler] = useState([]);
  const [henv, setHenv] = useState([]);
  const [innbytte, setInnbytte] = useState([]);
  const [kal, setKal] = useState([]);
  const [epost, setEpost] = useState([]);
  const [mailStatus, setMailStatus] = useState({});
  const [stats, setStats] = useState({});
  const [innstillinger, setInnstillinger] = useState(DEFAULT_INNSTILLINGER);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const visTost = useCallback((m) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const dash = await getDashboard();
      setStats(dash.stats || {});
    } catch { /* ignore */ }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    let authError = null;

    async function safeLoad(loader, onSuccess) {
      try {
        const data = await loader();
        onSuccess(data);
      } catch (err) {
        if (err.status === 401) authError = err;
      }
    }

    await Promise.all([
      safeLoad(getDashboard, (d) => setStats(d.stats || {})),
      safeLoad(getBiler, (b) => setBiler(b.items || [])),
      safeLoad(getHenvendelser, (h) => setHenv(h.items || [])),
      safeLoad(getInnbytte, (i) => setInnbytte(i.items || [])),
      safeLoad(getKalender, (k) => setKal(k.items || [])),
      safeLoad(getInnboks, (data) => {
        setEpost(data.items || []);
        setMailStatus(data.status || {});
      })
    ]);

    if (authError) {
      logout();
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const cfg = await getInnstillinger();
      if (cfg.settings) setInnstillinger(cfg.settings);
    } catch {
      setInnstillinger(DEFAULT_INNSTILLINGER);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      getMe()
        .then(function (res) {
          setUser(res.user);
          return loadData();
        })
        .catch(function () {
          logout();
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [loadData]);

  const reloadInnboks = useCallback(async () => {
    try {
      const data = await getInnboks();
      setEpost(data.items || []);
      setMailStatus(data.status || {});
      refreshStats();
    } catch {
      visTost('Kunne ikke laste innboks ✗');
    }
  }, [refreshStats, visTost]);

  const syncMailStatus = useCallback((status) => {
    if (status) setMailStatus(status);
  }, []);

  useEffect(function () {
    if (!user || loading) return;
    const perm = TAB_PERMISSIONS[tab];
    if (perm && canAccess(user, perm)) return;
    const fallback = Object.keys(TAB_PERMISSIONS).find(function (id) {
      return canAccess(user, TAB_PERMISSIONS[id]);
    });
    if (fallback && fallback !== tab) setTab(fallback);
  }, [user, tab, loading]);

  const handleLogin = (u) => {
    setUser(u);
    loadData();
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setBiler([]);
    setHenv([]);
    setInnbytte([]);
    setKal([]);
    setEpost([]);
    setMailStatus({});
    setStats({});
    setInnstillinger(DEFAULT_INNSTILLINGER);
  };

  if (!user && !loading) return <Login onSuccess={handleLogin} />;
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spin" style={{ width: 24, height: 24 }} />
        Laster CRM…
      </div>
    );
  }

  const nyeHenv = stats.nyeHenv ?? henv.filter(h => h.status === 'Ny').length;
  const nyeInnbytte = stats.nyeInnbytte ?? innbytte.filter(i => i.status === 'Ny').length;
  const paaLager = stats.paaLager ?? biler.filter(b => b.status !== 'Solgt').length;
  const reservert = stats.reservert ?? biler.filter(b => b.status === 'Reservert').length;
  const iDagKal = stats.iDagKal ?? kal.filter(k => k.dato === IDAG).length;
  const aapneOppgaver = stats.aapneOppgaver ?? biler.reduce(
    (s, b) => s + (b.sjekkliste || []).filter(x => !x.f).length, 0
  );
  const ulestEpost = stats.ulestEpost ?? mailStatus.ulest ?? epost.filter(e => e.retning === 'inn' && !e.lest).length;

  const lists = innstillinger;

  const modulBadges = {
    henvendelser: nyeHenv,
    innboks: ulestEpost || 0,
    innbytte: nyeInnbytte,
    oppgaver: aapneOppgaver || 0
  };

  const TABS = buildModulTabs(innstillinger.modulOppsett, modulBadges, user);

  const updateBil = async (id, patch, localMsg) => {
    setBiler(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    try {
      const res = await patchBil(id, patch);
      if (res.item) setBiler(prev => prev.map(b => b.id === id ? res.item : b));
      if (localMsg) visTost(localMsg);
      refreshStats();
    } catch {
      visTost('Kunne ikke lagre bil ✗');
      loadData();
    }
  };

  const updateHenv = async (id, patch, localMsg) => {
    setHenv(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
    try {
      const res = await patchHenvendelse(id, patch);
      if (res.item) setHenv(prev => prev.map(h => h.id === id ? res.item : h));
      if (localMsg) visTost(localMsg);
      refreshStats();
    } catch {
      visTost('Kunne ikke lagre henvendelse ✗');
      loadData();
    }
  };

  const updateInnbytte = async (id, patch, localMsg) => {
    setInnbytte(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    try {
      const res = await patchInnbytte(id, patch);
      if (res.item) setInnbytte(prev => prev.map(i => i.id === id ? res.item : i));
      if (localMsg) visTost(localMsg);
      refreshStats();
    } catch {
      visTost('Kunne ikke lagre innbytte ✗');
      loadData();
    }
  };

  const updateKal = async (id, patch, localMsg) => {
    setKal(prev => prev.map(k => k.id === id ? { ...k, ...patch } : k));
    try {
      const res = await patchKalender(id, patch);
      if (res.item) {
        setKal(prev => prev.map(k => k.id === id ? res.item : k)
          .sort((a, b) => a.dato.localeCompare(b.dato) || a.tid.localeCompare(b.tid)));
      }
      if (localMsg) visTost(localMsg);
      refreshStats();
    } catch {
      visTost('Kunne ikke lagre avtale ✗');
      loadData();
    }
  };

  const sendHenvSvar = async (id, svar) => {
    try {
      const res = await sendHenvendelseSvar(id, { svar });
      if (res.item) setHenv(prev => prev.map(h => h.id === id ? res.item : h));
      visTost('Svar sendt ✓');
      refreshStats();
      await reloadInnboks();
      return res.item;
    } catch (err) {
      visTost(err.message || 'Kunne ikke sende svar ✗');
      throw err;
    }
  };

  return (
    <>
      <div className="app">
        <aside className="sb">
          <div className="sb-logo-wrap">
            <div className="sb-logo">X <em>Bilsenter AS</em></div>
            <div className="sb-tagline">Internt driftssystem</div>
          </div>
          <div className="sb-sec">Navigasjon</div>
          {TABS.map(t => (
            <div key={t.id} className={`sb-link${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              <span className="sb-ic">{t.ic}</span> {t.lbl}
              {t.badge > 0 && <span className="sb-badge">{t.badge}</span>}
            </div>
          ))}
          <div className="sb-foot">
            <div className="sb-user">{user?.name || 'Admin'}</div>
            <div className="sb-role">{user?.role || 'Administrator'}</div>
            <div className="sb-status">
              <div className="sb-dot" />
              <span className="sb-online">Innlogget</span>
            </div>
            <button type="button" className="sb-logout" onClick={handleLogout}>Logg ut</button>
          </div>
        </aside>

        <main className="main">
          {tab === 'dashboard' && (
            <Dashboard
              biler={biler} henv={henv} kal={kal}
              paaLager={paaLager} reservert={reservert}
              nyeHenv={nyeHenv} nyeInnbytte={nyeInnbytte}
              iDagKal={iDagKal} setTab={setTab}
            />
          )}
          {tab === 'biler' && (
            <BilerView biler={biler} setModal={setModal} lists={lists} kal={kal} henv={henv} updateBil={updateBil} />
          )}
          {tab === 'henvendelser' && (
            <HenvendelserView henv={henv} setModal={setModal} updateHenv={updateHenv} visTost={visTost} lists={lists} />
          )}
          {tab === 'innboks' && (
            <InnboksView
              epost={epost}
              mailStatus={mailStatus}
              setEpost={setEpost}
              setMailStatus={setMailStatus}
              setHenv={setHenv}
              visTost={visTost}
              refreshStats={refreshStats}
              setTab={setTab}
            />
          )}
          {tab === 'innbytte' && (
            <InnbytteView innbytte={innbytte} setModal={setModal} lists={lists} />
          )}
          {tab === 'kalender' && (
            <KalenderView kal={kal} setModal={setModal} biler={biler} lists={lists} />
          )}
          {tab === 'oppgaver' && (
            <OppgaverView biler={biler} updateBil={updateBil} visTost={visTost} />
          )}
          {tab === 'vegvesen' && (
            <VegvesenView
              biler={biler}
              setBiler={setBiler}
              visTost={visTost}
              refreshStats={refreshStats}
              lists={lists}
              setTab={setTab}
            />
          )}
          {tab === 'innstillinger' && (
            <InnstillingerView
              settings={innstillinger}
              currentUser={user}
              onSave={async (next) => {
                try {
                  const res = await patchInnstillinger(next);
                  if (res.settings) setInnstillinger(res.settings);
                  visTost('Innstillinger lagret ✓');
                } catch {
                  visTost('Kunne ikke lagre innstillinger ✗');
                }
              }}
              onModulOppsettChange={(modulOppsett) => setInnstillinger(function (prev) {
                return { ...prev, modulOppsett };
              })}
              onStatusChange={syncMailStatus}
              visTost={visTost}
            />
          )}
        </main>
      </div>

      {modal?.t === 'visBil' && (
        <BilModal
          data={modal.d}
          onClose={() => setModal(null)}
          updateBil={updateBil}
          visTost={visTost}
          lists={lists}
          kal={kal}
          henv={henv}
          setModal={setModal}
        />
      )}
      {modal?.t === 'nyBil' && (
        <NyBilModal
          onClose={() => setModal(null)}
          lists={lists}
          onSave={async (b) => {
            try {
              const res = await postBil(b);
              if (res.item) {
                setBiler(p => [res.item, ...p]);
                setTab('biler');
              }
              setModal(null);
              visTost('Bil lagt til ✓');
              refreshStats();
            } catch {
              visTost('Kunne ikke legge til bil ✗');
            }
          }}
        />
      )}
      {modal?.t === 'visHenv' && (
        <HenvModal
          data={modal.d}
          onClose={() => setModal(null)}
          updateHenv={updateHenv}
          onSendSvar={sendHenvSvar}
          visTost={visTost}
          lists={lists}
          mailStatus={mailStatus}
        />
      )}
      {modal?.t === 'visInb' && (
        <InbModal
          data={modal.d}
          onClose={() => setModal(null)}
          updateInnbytte={updateInnbytte}
          visTost={visTost}
          lists={lists}
        />
      )}
      {modal?.t === 'nyKal' && (
        <KalModal
          onClose={() => setModal(null)}
          biler={biler}
          lists={lists}
          title="Ny kalenderavtale"
          onSave={async (e) => {
            try {
              const res = await postKalender(e);
              if (res.item) setKal(p => [...p, res.item].sort((a, b) => a.dato.localeCompare(b.dato) || a.tid.localeCompare(b.tid)));
              setModal(null);
              visTost('Avtale lagt til ✓');
              refreshStats();
            } catch {
              visTost('Kunne ikke lagre avtale ✗');
            }
          }}
        />
      )}
      {modal?.t === 'visKal' && (
        <KalModal
          data={modal.d}
          onClose={() => setModal(null)}
          biler={biler}
          lists={lists}
          title="Rediger avtale"
          onSave={async (e) => {
            await updateKal(modal.d.id, e, 'Avtale oppdatert ✓');
            setModal(null);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ biler, henv, kal, paaLager, reservert, nyeHenv, nyeInnbytte, iDagKal, setTab }) {
  const iDagEvt = kal.filter(k => k.dato === IDAG).sort((a, b) => a.tid.localeCompare(b.tid));

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Oversikt</div>
          <div className="ph-sub">{formatDatoLang()} · X Bilsenter AS · Fetsund · AUTOREG-godkjent forhandler</div>
        </div>
      </div>
      <div className="stats">
        {[
          { ico: '🚗', lbl: 'Biler på lager', val: paaLager, sub: 'av 75 kapasitet' },
          { ico: '🔴', lbl: 'Nye henvendelser', val: nyeHenv, sub: 'Krever svar', red: true },
          { ico: '⇄', lbl: 'Innbytte (nye)', val: nyeInnbytte, sub: 'Venter på tilbud', orange: true },
          { ico: '✅', lbl: 'Reserverte biler', val: reservert, sub: 'Klar for utlevering', green: true },
          { ico: '📅', lbl: 'Avtaler i dag', val: iDagKal, sub: 'Se kalender' }
        ].map(s => (
          <div className="stat" key={s.lbl}>
            <div className="stat-ico">{s.ico}</div>
            <div className="stat-lbl">{s.lbl}</div>
            <div
              className="stat-val"
              style={{ color: s.red ? 'var(--red)' : s.orange ? 'var(--orange)' : s.green ? 'var(--acc)' : 'var(--t1)' }}
            >
              {s.val}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-h">
            <span className="card-ht">Nye henvendelser</span>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setTab('henvendelser')}>Se alle →</button>
          </div>
          <table>
            <thead><tr><th>Fra</th><th>Emne</th><th>Bil</th><th>Kilde</th><th>Status</th></tr></thead>
            <tbody>
              {henv.filter(h => h.status === 'Ny').map(h => (
                <tr key={h.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 12 }}>{h.navn}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)' }}>{h.epost}</div>
                  </td>
                  <td style={{ maxWidth: 160 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{h.emne}</div>
                  </td>
                  <td><span className="tag">{h.bilRef || '—'}</span></td>
                  <td><span className="tag">{h.kilde}</span></td>
                  <td><Badge s={h.status} /></td>
                </tr>
              ))}
              {henv.filter(h => h.status === 'Ny').length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Ingen nye henvendelser</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-h">
            <span className="card-ht">Dagens avtaler</span>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setTab('kalender')}>Kalender →</button>
          </div>
          <div style={{ padding: '0 14px' }}>
            {iDagEvt.length === 0 && (
              <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--t4)' }}>Ingen avtaler i dag.</div>
            )}
            {iDagEvt.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--b1)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: KFARGE[e.type] || '#888', flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{e.tittel}</div>
                  <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>
                    {formatKalTid(e)} · {e.ansvarlig}{e.bilRef ? ` · ${e.bilRef}` : ''}
                  </div>
                </div>
                <KBadge type={e.type} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── BILER VIEW ──────────────────────────────────────────────────────────────
function BilerView({ biler, setModal, lists, kal, henv, updateBil }) {
  const [mFilter, setMFilter] = useState('Alle');
  const [dragId, setDragId] = useState(null);
  const [dropStatus, setDropStatus] = useState(null);
  const skipClick = useRef(false);
  const merker = bilMerker(biler, lists);
  const vis = mFilter === 'Alle' ? biler : biler.filter(b => b.merke === mFilter);
  const statuser = kanbanStatuses(lists, biler);
  const skjult = biler.length - vis.length;

  const handleDragStart = (e, bil) => {
    skipClick.current = false;
    setDragId(bil.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(bil.id));
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDropStatus(null);
    skipClick.current = true;
    window.setTimeout(function () { skipClick.current = false; }, 0);
  };

  const handleDrop = (e, status) => {
    e.preventDefault();
    setDropStatus(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    const bil = biler.find(function (b) { return b.id === id; });
    if (!bil || bil.status === status) return;
    updateBil(id, { status: status }, 'Flyttet til ' + status + ' ✓');
    setDragId(null);
  };

  const openBil = (bil) => {
    if (skipClick.current) return;
    setModal({ t: 'visBil', d: bil });
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Biler på lager</div>
          <div className="ph-sub">
            {biler.length} biler totalt · {biler.filter(b => b.status !== 'Solgt').length} aktive ·{' '}
            {biler.filter(b => b.status === 'Annonsert').length} annonsert på FINN · dra bil mellom kolonner
          </div>
        </div>
        <button type="button" className="btn btn-p" onClick={() => setModal({ t: 'nyBil' })}>+ Legg til bil</button>
      </div>
      {skjult > 0 && (
        <div style={{ fontSize: 11, color: 'var(--orange)', marginBottom: 10 }}>
          {skjult} bil{skjult > 1 ? 'er' : ''} skjult av merke-filter · <button type="button" className="btn btn-g btn-sm" onClick={() => setMFilter('Alle')}>Vis alle</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {merker.map(m => (
          <button key={m} type="button" className={`btn btn-sm ${mFilter === m ? 'btn-p' : 'btn-g'}`} onClick={() => setMFilter(m)}>{m}</button>
        ))}
      </div>
      {biler.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>
          Ingen biler i lager ennå. Legg til via <strong>+ Legg til bil</strong> eller importer fra <strong>Vegvesen-oppslag</strong>.
        </div>
      ) : (
      <div className="kanban">
        {statuser.map(status => {
          const kbiler = vis.filter(b => b.status === status);
          return (
            <div className="kan-col" key={status}>
              <div className="kan-hd">
                <div className="kan-dot" style={{ background: SFARGE[status] || '#888' }} />
                <span className="kan-title">{status}</span>
                <span className="kan-n">{kbiler.length}</span>
              </div>
              <div
                className={`kan-body${dropStatus === status ? ' kan-body--drop' : ''}`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDragEnter={() => setDropStatus(status)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setDropStatus(null);
                }}
                onDrop={(e) => handleDrop(e, status)}
              >
                {kbiler.map(bil => {
                  const list = bil.sjekkliste || [];
                  const f = list.filter(s => s.f).length;
                  const t = list.length;
                  const pst = t ? Math.round(f / t * 100) : 0;
                  const linkKal = (kal || []).filter(function (e) { return matchesBilRef(e.bilRef, bil.reg); }).length;
                  const linkHenv = (henv || []).filter(function (h) { return matchesBilRef(h.bilRef, bil.reg); }).length;
                  return (
                    <div
                      className={`bil-card${dragId === bil.id ? ' bil-card--dragging' : ''}`}
                      key={bil.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, bil)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openBil(bil)}
                    >
                      <div className="bil-reg">{bil.reg}</div>
                      <div className="bil-name">{bil.merke} {bil.modell}</div>
                      <div className="bil-sub">{bil.aar} · {fmtKm(bil.km)} km · {bil.farge}</div>
                      {(linkKal > 0 || linkHenv > 0) && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          {linkKal > 0 && <span className="chip chip-gray">{linkKal} avtale{linkKal > 1 ? 'r' : ''}</span>}
                          {linkHenv > 0 && <span className="chip chip-gray">{linkHenv} henv.</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
                        <span className="bil-pris">{nok(bil.salg)}</span>
                        <span className="bil-ans">{bil.ansvarlig}</span>
                      </div>
                      {t > 0 && (
                        <>
                          <div className="prog-lbl" style={{ marginTop: 7 }}>{f}/{t} oppgaver · {pst}%</div>
                          <div className="prog-bar"><div className="prog-fill" style={{ width: pst + '%' }} /></div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

// ─── BIL MODAL ───────────────────────────────────────────────────────────────
function BilModal({ data, onClose, updateBil, visTost, lists, kal, henv, setModal }) {
  const [bil, setBil] = useState(data);
  const [nyOppg, setNyOppg] = useState('');
  const [nyLogg, setNyLogg] = useState('');

  const avtaler = (kal || [])
    .filter(function (e) { return matchesBilRef(e.bilRef, bil.reg); })
    .sort(function (a, b) { return a.dato.localeCompare(b.dato) || a.tid.localeCompare(b.tid); });
  const henvendelser = (henv || [])
    .filter(function (h) { return matchesBilRef(h.bilRef, bil.reg); })
    .sort(function (a, b) { return String(b.dato || '').localeCompare(String(a.dato || '')); });

  const oppdater = (k, v, msg) => {
    const ny = { ...bil, [k]: v };
    setBil(ny);
    updateBil(bil.id, { [k]: v }, msg);
  };

  const toggleSjekk = (i) => {
    const ny = bil.sjekkliste.map((s, idx) => idx === i ? { ...s, f: !s.f } : s);
    oppdater('sjekkliste', ny, 'Oppgave oppdatert ✓');
  };

  const leggTilOppg = () => {
    if (!nyOppg.trim()) return;
    oppdater('sjekkliste', [...(bil.sjekkliste || []), { t: nyOppg, f: false }]);
    setNyOppg('');
  };

  const leggTilLogg = () => {
    if (!nyLogg.trim()) return;
    const dato = new Date().toLocaleString('nb-NO');
    oppdater('logg', [...(bil.logg || []), { tekst: nyLogg, dato, av: 'Waleed' }]);
    setNyLogg('');
  };

  const list = bil.sjekkliste || [];
  const f = list.filter(s => s.f).length;
  const t = list.length;

  const nesteStatus = () => {
    const idx = lists.bilStatuser.indexOf(bil.status);
    if (idx < lists.bilStatuser.length - 1) {
      oppdater('status', lists.bilStatuser[idx + 1], `Flyttet til ${lists.bilStatuser[idx + 1]} ✓`);
    }
  };

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>
              {bil.merke} {bil.modell}{' '}
              <span style={{ color: 'var(--acc)', fontSize: 14 }}>{bil.reg}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge s={bil.status} />
              {bil.euKontroll && <span className="chip chip-orange">EU-kontroll: {bil.euKontroll}</span>}
              {bil.svvData && <span className="chip chip-green">✓ Vegvesen-verifisert</span>}
            </div>
          </div>
          {bil.status !== 'Solgt' && bil.status !== 'Etteroppfølging' && (
            <button type="button" className="btn btn-p btn-sm" onClick={nesteStatus}>
              → {lists.bilStatuser[lists.bilStatuser.indexOf(bil.status) + 1]}
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div className="modal-sec">Bilinformasjon</div>
            <div className="form-row gap">
              <div>
                <div className="fl">Reg.nummer</div>
                <input value={bil.reg || ''} onChange={e => oppdater('reg', e.target.value.toUpperCase())} placeholder="AB12345" />
              </div>
              <div>
                <div className="fl">Merke</div>
                <select value={bil.merke || 'Annet'} onChange={e => oppdater('merke', e.target.value)}>
                  {lists.merker.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row gap">
              <div>
                <div className="fl">Modell</div>
                <input value={bil.modell || ''} onChange={e => oppdater('modell', e.target.value)} />
              </div>
              <div>
                <div className="fl">Farge</div>
                <input value={bil.farge || ''} onChange={e => oppdater('farge', e.target.value)} />
              </div>
            </div>
            <div className="form-row3 gap">
              <div>
                <div className="fl">Årsmodell</div>
                <input type="number" value={bil.aar || 0} onChange={e => oppdater('aar', +e.target.value)} />
              </div>
              <div>
                <div className="fl">Kilometerstand</div>
                <input type="number" value={bil.km || 0} onChange={e => oppdater('km', +e.target.value)} />
              </div>
              <div>
                <div className="fl">Status</div>
                <select value={bil.status} onChange={e => oppdater('status', e.target.value)}>
                  {lists.bilStatuser.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row gap">
              <div>
                <div className="fl">Innkjøpspris (kr)</div>
                <input type="number" value={bil.innkjop || 0} onChange={e => oppdater('innkjop', +e.target.value)} />
              </div>
              <div>
                <div className="fl">Salgspris (kr)</div>
                <input type="number" value={bil.salg || 0} onChange={e => oppdater('salg', +e.target.value)} />
              </div>
            </div>
            <div className="gap">
              <div className="fl">Margin</div>
              <div className="fv" style={{ color: 'var(--acc)', fontWeight: 700 }}>{nok(bil.salg - bil.innkjop)}</div>
            </div>
            <div className="form-row gap">
              <div>
                <div className="fl">EU-kontroll dato</div>
                <input type="date" value={bil.euKontroll || ''} onChange={e => oppdater('euKontroll', e.target.value)} />
              </div>
              <div>
                <div className="fl">Forsikringsselskap</div>
                <input value={bil.forsikring || ''} onChange={e => oppdater('forsikring', e.target.value)} />
              </div>
            </div>
            <div className="gap">
              <div className="fl">Ansvarlig</div>
              <select value={bil.ansvarlig} onChange={e => oppdater('ansvarlig', e.target.value)}>
                {lists.ansatte.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="gap">
              <div className="fl">Frist</div>
              <input type="date" value={bil.frist || ''} onChange={e => oppdater('frist', e.target.value)} />
            </div>
            <div className="gap">
              <div className="fl">Notater</div>
              <textarea rows={3} value={bil.notater || ''} onChange={e => oppdater('notater', e.target.value)} />
            </div>

            <div className="modal-sec">Intern logg</div>
            {(bil.logg || []).map((l, i) => (
              <div className="logg-item" key={i}>
                <div className="logg-tekst">{l.tekst}</div>
                <div className="logg-meta">{l.dato} · {l.av}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input placeholder="Legg til loggpost..." value={nyLogg} onChange={e => setNyLogg(e.target.value)} onKeyDown={e => e.key === 'Enter' && leggTilLogg()} />
              <button type="button" className="btn btn-g btn-sm" onClick={leggTilLogg}>+</button>
            </div>
          </div>

          <div>
            <div className="modal-sec">Sjekkliste ({f}/{t} fullført)</div>
            <div style={{ marginBottom: 10 }}>
              <div className="prog-bar" style={{ height: 5 }}>
                <div className="prog-fill" style={{ width: (t ? f / t * 100 : 0) + '%', height: 5 }} />
              </div>
            </div>
            {list.map((s, i) => (
              <div className="chk-item" key={i}>
                <div className={`chk-box${s.f ? ' done' : ''}`} onClick={() => toggleSjekk(i)}>
                  {s.f && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                </div>
                <span className={`chk-txt${s.f ? ' done' : ''}`}>{s.t}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input placeholder="Ny oppgave..." value={nyOppg} onChange={e => setNyOppg(e.target.value)} onKeyDown={e => e.key === 'Enter' && leggTilOppg()} />
              <button type="button" className="btn btn-g btn-sm" onClick={leggTilOppg}>+</button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <div className="modal-sec">Tilknyttet aktivitet</div>
          <div className="bil-links-grid">
            <div>
              <div className="bil-links-hd">Kalenderavtaler · {avtaler.length}</div>
              {avtaler.length === 0 ? (
                <div className="bil-links-empty">Ingen avtaler knyttet til {bil.reg}</div>
              ) : avtaler.map(function (e) {
                const color = KFARGE[e.type] || '#888';
                return (
                  <button
                    type="button"
                    key={e.id}
                    className="bil-link-item"
                    onClick={() => setModal({ t: 'visKal', d: e })}
                  >
                    <div className="bil-link-item__top">
                      <KBadge type={e.type} />
                      <span className="bil-link-item__meta">{e.dato} · {formatKalTid(e)}</span>
                    </div>
                    <div className="bil-link-item__title">{e.tittel}</div>
                    <div className="bil-link-item__sub" style={{ color: color }}>{e.ansvarlig}{e.notat ? ` · ${e.notat}` : ''}</div>
                  </button>
                );
              })}
            </div>
            <div>
              <div className="bil-links-hd">Henvendelser · {henvendelser.length}</div>
              {henvendelser.length === 0 ? (
                <div className="bil-links-empty">Ingen henvendelser knyttet til {bil.reg}</div>
              ) : henvendelser.map(function (h) {
                return (
                  <button
                    type="button"
                    key={h.id}
                    className="bil-link-item"
                    onClick={() => setModal({ t: 'visHenv', d: h })}
                  >
                    <div className="bil-link-item__top">
                      <Badge s={h.status} />
                      <span className="bil-link-item__meta">{h.dato}</span>
                    </div>
                    <div className="bil-link-item__title">{h.navn} · {h.emne}</div>
                    <div className="bil-link-item__sub">{h.ansvarlig || 'Ikke tildelt'} · {h.epost}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={onClose}>Lagre & lukk</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── NY BIL MODAL ────────────────────────────────────────────────────────────
function NyBilModal({ onClose, onSave, lists }) {
  const [f, setF] = useState({
    reg: '', merke: lists.merker[0] || 'Annet', modell: '', aar: 2022, km: 0, innkjop: 0, salg: 0,
    farge: '', status: lists.bilStatuser[0] || 'Innkjøpt', ansvarlig: lists.ansatte[0] || '', frist: '', notater: '',
    euKontroll: '', forsikring: ''
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Legg til ny bil</div>
        <div className="form-row">
          <div><div className="fl">Reg.nummer</div><input value={f.reg} onChange={e => s('reg', e.target.value)} placeholder="AB12345" /></div>
          <div><div className="fl">Merke</div><select value={f.merke} onChange={e => s('merke', e.target.value)}>{lists.merker.map(m => <option key={m}>{m}</option>)}</select></div>
        </div>
        <div className="form-row gap">
          <div><div className="fl">Modell</div><input value={f.modell} onChange={e => s('modell', e.target.value)} /></div>
          <div><div className="fl">Farge</div><input value={f.farge} onChange={e => s('farge', e.target.value)} /></div>
        </div>
        <div className="form-row3 gap">
          <div><div className="fl">Årsmodell</div><input type="number" value={f.aar} onChange={e => s('aar', +e.target.value)} /></div>
          <div><div className="fl">Kilometerstand</div><input type="number" value={f.km} onChange={e => s('km', +e.target.value)} /></div>
          <div><div className="fl">Status</div><select value={f.status} onChange={e => s('status', e.target.value)}>{lists.bilStatuser.map(x => <option key={x}>{x}</option>)}</select></div>
        </div>
        <div className="form-row gap">
          <div><div className="fl">Innkjøpspris (kr)</div><input type="number" value={f.innkjop} onChange={e => s('innkjop', +e.target.value)} /></div>
          <div><div className="fl">Salgspris (kr)</div><input type="number" value={f.salg} onChange={e => s('salg', +e.target.value)} /></div>
        </div>
        <div className="form-row gap">
          <div><div className="fl">EU-kontroll dato</div><input type="date" value={f.euKontroll} onChange={e => s('euKontroll', e.target.value)} /></div>
          <div><div className="fl">Forsikringsselskap</div><input value={f.forsikring} onChange={e => s('forsikring', e.target.value)} /></div>
        </div>
        <div className="gap"><div className="fl">Ansvarlig</div><select value={f.ansvarlig} onChange={e => s('ansvarlig', e.target.value)}>{lists.ansatte.map(a => <option key={a}>{a}</option>)}</select></div>
        <div className="gap"><div className="fl">Frist</div><input type="date" value={f.frist} onChange={e => s('frist', e.target.value)} /></div>
        <div className="gap"><div className="fl">Notater</div><textarea rows={2} value={f.notater} onChange={e => s('notater', e.target.value)} /></div>
        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={() => f.reg && f.modell && onSave({ ...f, sjekkliste: [], logg: [], svvData: null })}>Lagre bil</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── INNBOKS ─────────────────────────────────────────────────────────────────
function pickDefaultSendKonto(kontoer) {
  return kontoer.find(function (k) { return k.standard && k.smtpConfigured; })
    || kontoer.find(function (k) { return k.smtpConfigured; })
    || kontoer.find(function (k) { return k.standard; })
    || kontoer[0]
    || null;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const COMPOSE_DRAFT_KEY = 'xbilsenter-compose-draft';

function composeDraftKey(id) {
  return id ? `${COMPOSE_DRAFT_KEY}-${id}` : `${COMPOSE_DRAFT_KEY}-new`;
}

function isComposeDraftEmpty(draft) {
  if (!draft) return true;
  return !String(draft.to || '').trim()
    && !String(draft.subject || '').trim()
    && htmlIsEmpty(draft.html || '');
}

function readLocalComposeDraft(id) {
  try {
    const raw = localStorage.getItem(composeDraftKey(id));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return isComposeDraftEmpty(draft) ? null : draft;
  } catch {
    return null;
  }
}

function writeLocalComposeDraft(draft, id) {
  try {
    if (isComposeDraftEmpty(draft)) {
      localStorage.removeItem(composeDraftKey(id));
      return;
    }
    localStorage.setItem(composeDraftKey(id), JSON.stringify({
      ...draft,
      savedAt: new Date().toISOString()
    }));
  } catch {
    /* ignore storage errors */
  }
}

function clearLocalComposeDraft(id) {
  try {
    localStorage.removeItem(composeDraftKey(id));
  } catch {
    /* ignore */
  }
}

function replyDraftKey(id) {
  return `xbilsenter-reply-draft-${id}`;
}

function readReplyDraft(id) {
  try {
    const raw = localStorage.getItem(replyDraftKey(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { html: raw };
    }
  } catch {
    return null;
  }
}

function writeReplyDraft(id, draft) {
  try {
    const payload = typeof draft === 'string' ? { html: draft } : (draft || {});
    if (isComposeDraftEmpty(payload)) {
      localStorage.removeItem(replyDraftKey(id));
      return;
    }
    localStorage.setItem(replyDraftKey(id), JSON.stringify({
      ...payload,
      savedAt: new Date().toISOString()
    }));
  } catch {
    /* ignore */
  }
}

function clearReplyDraft(id) {
  try {
    localStorage.removeItem(replyDraftKey(id));
  } catch {
    /* ignore */
  }
}

const EMPTY_REPLY_BODY = '<p><br></p><p><br></p>';

function isEmptyComposeBody(html) {
  return htmlIsEmpty(html) || String(html || '').trim() === EMPTY_REPLY_BODY.trim();
}

function insertTemplateContent(currentHtml, templateHtml) {
  const insert = String(templateHtml || '').trim();
  if (!insert) return currentHtml || '';
  if (isEmptyComposeBody(currentHtml)) return insert;
  return `${insert}<p><br></p>${String(currentHtml || '').trim()}`;
}

function stripReplyQuoteFromHtml(html) {
  const str = String(html || '');
  const idx = str.indexOf('data-xbilsenter-quote="1"');
  if (idx !== -1) {
    const start = str.lastIndexOf('<div', idx);
    return (start > -1 ? str.slice(0, start) : str.slice(0, idx)).trim();
  }
  const legacy = str.match(/<div\b[^>]*class="[^"]*\bmail-reply-quote\b(?!__)/i);
  if (legacy && legacy.index != null) {
    return str.slice(0, legacy.index).trim();
  }
  return str;
}

function hasReplyDraft(id) {
  const draft = readReplyDraft(id);
  if (!draft || isComposeDraftEmpty(draft)) return false;
  return !htmlIsEmpty(stripReplyQuoteFromHtml(draft.html || ''));
}

function buildReplyQuoteHtml(mail) {
  if (!mail) return '';
  const fromLine = mail.fraNavn
    ? `${escapeHtmlLite(mail.fraNavn)} &lt;${escapeHtmlLite(mail.fraEpost)}&gt;`
    : escapeHtmlLite(mail.fraEpost || 'Ukjent');
  const toLine = escapeHtmlLite(mail.tilEpost || mail.kontoEpost || '—');
  const dateLine = escapeHtmlLite(mail.dato || '');
  const subjectLine = escapeHtmlLite(mail.emne || '');

  let originalBody = '';
  if (mail.innholdHtml && String(mail.innholdHtml).trim()) {
    originalBody = String(mail.innholdHtml);
  } else if (mail.innhold && String(mail.innhold).trim()) {
    originalBody = `<div style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">${plainTextToHtml(mail.innhold)}</div>`;
  } else {
    originalBody = '<div style="color:#888;font-style:italic;">(Tom melding)</div>';
  }

  return [
    '<p><br></p>',
    '<p><br></p>',
    '<div class="mail-reply-quote" data-xbilsenter-quote="1" style="margin-top:16px;padding-top:12px;border-top:1px solid #d9d9d9;">',
    '<div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#666;margin-bottom:10px;">',
    `<div><strong>Fra:</strong> ${fromLine}</div>`,
    dateLine ? `<div><strong>Sendt:</strong> ${dateLine}</div>` : '',
    `<div><strong>Til:</strong> ${toLine}</div>`,
    `<div><strong>Emne:</strong> ${subjectLine}</div>`,
    '</div>',
    `<div class="mail-reply-quote__body" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#333;">${originalBody}</div>`,
    '</div>'
  ].filter(Boolean).join('');
}

function escapeHtmlLite(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainTextToHtml(text) {
  return escapeHtmlLite(text).replace(/\n/g, '<br>');
}

function getReplyUserHtml(html) {
  return stripReplyQuoteFromHtml(html);
}

function isReplyBodyEmpty(html) {
  return htmlIsEmpty(stripReplyQuoteFromHtml(html));
}

function buildReplyDefaults(mail) {
  if (!mail) return null;
  const subject = /^Re:/i.test(String(mail.emne || ''))
    ? mail.emne
    : `Re: ${mail.emne || 'Melding'}`;
  return {
    to: mail.fraEpost || '',
    toName: mail.fraNavn || '',
    cc: '',
    bcc: '',
    subject,
    kontoId: mail.kontoId || null,
    html: EMPTY_REPLY_BODY
  };
}

function formatDraftTime(iso) {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 16);
}

function ComposeMailModal({ kontoer, draftId: initialDraftId, replyTo, onClose, onSent, onDraftChange, visTost }) {
  const sendKontoer = kontoer.filter(function (k) { return k.smtpConfigured; });
  const defaultKonto = pickDefaultSendKonto(sendKontoer);
  const replyDefaults = replyTo ? buildReplyDefaults(replyTo) : null;
  const replyQuoteHtml = replyTo ? buildReplyQuoteHtml(replyTo) : '';
  const [draftId, setDraftId] = useState(initialDraftId || null);
  const [kontoId, setKontoId] = useState(
    replyDefaults?.kontoId
      ? String(replyDefaults.kontoId)
      : (defaultKonto ? String(defaultKonto.id) : '')
  );
  const [to, setTo] = useState(replyDefaults?.to || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(replyDefaults?.subject || '');
  const [bodyHtml, setBodyHtml] = useState(replyTo ? EMPTY_REPLY_BODY : '');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const attachRef = useRef(null);
  const saveTimerRef = useRef(null);
  const [maler, setMaler] = useState([]);
  const [valgtMalId, setValgtMalId] = useState('');
  const valgtKonto = sendKontoer.find(function (k) { return String(k.id) === String(kontoId); }) || defaultKonto;

  const applyDraft = (draft) => {
    if (!draft || isComposeDraftEmpty(draft)) return false;
    if (draft.kontoId) setKontoId(String(draft.kontoId));
    setTo(draft.to || '');
    setCc(draft.cc || '');
    setBcc(draft.bcc || '');
    setSubject(draft.subject || '');
    setBodyHtml(stripReplyQuoteFromHtml(draft.html || ''));
    setDraftRestored(true);
    return true;
  };

  useEffect(function () {
    let cancelled = false;
    (async function () {
      if (replyTo) {
        const defaults = buildReplyDefaults(replyTo);
        const localDraft = readReplyDraft(replyTo.id);
        if (localDraft && !isComposeDraftEmpty(localDraft)) {
          if (!cancelled) {
            applyDraft({
              ...defaults,
              ...localDraft,
              html: stripReplyQuoteFromHtml(localDraft.html || defaults.html),
              kontoId: localDraft.kontoId || defaults.kontoId
            });
            setDraftStatus('Svarutkast gjenopprettet');
          }
        } else if (!cancelled && defaults) {
          setTo(defaults.to);
          setSubject(defaults.subject);
          if (defaults.kontoId) setKontoId(String(defaults.kontoId));
          setBodyHtml(EMPTY_REPLY_BODY);
        }
        if (!cancelled) setDraftReady(true);
        return;
      }
      if (!initialDraftId) {
        if (!cancelled) setDraftReady(true);
        return;
      }
      const localDraft = readLocalComposeDraft(initialDraftId);
      try {
        const res = await getEpostUtkastById(initialDraftId);
        const serverDraft = res.item || null;
        const localTime = localDraft?.savedAt || localDraft?.updatedAt || '';
        const serverTime = serverDraft?.updatedAt || '';
        const useDraft = (localTime && (!serverTime || localTime >= serverTime)) ? localDraft : serverDraft;
        if (!cancelled && useDraft) {
          applyDraft(useDraft);
          if (useDraft.id) setDraftId(useDraft.id);
          setDraftStatus(`Utkast gjenopprettet${formatDraftTime(useDraft.updatedAt || useDraft.savedAt) ? ` · ${formatDraftTime(useDraft.updatedAt || useDraft.savedAt)}` : ''}`);
        }
      } catch {
        if (!cancelled && localDraft) applyDraft(localDraft);
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    })();
    return function () {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [initialDraftId, replyTo?.id]);

  useEffect(function () {
    getEpostMaler().then(function (res) {
      setMaler(res.items || []);
    }).catch(function () { /* ignore */ });
  }, []);

  useEffect(function () {
    if (!draftReady) return;
    const draft = {
      id: draftId || undefined,
      kontoId: kontoId ? Number(kontoId) : null,
      to,
      cc,
      bcc,
      subject,
      html: bodyHtml
    };

    if (replyTo) {
      writeReplyDraft(replyTo.id, draft);
      return;
    }

    writeLocalComposeDraft(draft, draftId);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async function () {
      if (isComposeDraftEmpty(draft)) {
        setDraftStatus('');
        if (draftId) {
          try {
            const res = await deleteEpostUtkast(draftId);
            clearLocalComposeDraft(draftId);
            setDraftId(null);
            if (onDraftChange) onDraftChange(res);
          } catch { /* ignore */ }
        }
        return;
      }
      setDraftStatus('Lagrer utkast…');
      try {
        const res = await saveEpostUtkast(draft);
        const item = res.item || null;
        if (item?.id && item.id !== draftId) {
          clearLocalComposeDraft(draftId);
          setDraftId(item.id);
          writeLocalComposeDraft({
            kontoId: item.kontoId,
            to: item.to,
            cc: item.cc,
            bcc: item.bcc,
            subject: item.subject,
            html: item.html
          }, item.id);
        }
        const stamp = item?.updatedAt || new Date().toISOString();
        setDraftStatus(`Utkast lagret · ${formatDraftTime(stamp)}`);
        if (onDraftChange) onDraftChange(res);
      } catch {
        setDraftStatus('Utkast lagret lokalt');
      }
    }, 1200);
    return function () {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draftReady, draftId, kontoId, to, cc, bcc, subject, bodyHtml, onDraftChange, replyTo?.id]);

  const addAttachments = (fileList) => {
    const next = Array.from(fileList || []).map(function (file) {
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size
      };
    });
    if (!next.length) return;
    setAttachments(function (prev) { return [...prev, ...next]; });
  };

  const removeAttachment = (id) => {
    setAttachments(function (prev) { return prev.filter(function (a) { return a.id !== id; }); });
  };

  const insertMal = () => {
    const mal = maler.find(function (m) { return String(m.id) === String(valgtMalId); });
    if (!mal) {
      visTost('Velg en mal først ✗');
      return;
    }
    setBodyHtml(function (prev) { return insertTemplateContent(prev, mal.html); });
    if (mal.emne && !replyTo && !subject.trim()) setSubject(mal.emne);
    visTost(`Mal «${mal.navn}» satt inn ✓`);
  };

  const send = async () => {
    const bodyEmpty = replyTo ? isReplyBodyEmpty(bodyHtml) : htmlIsEmpty(bodyHtml);
    if (!to.trim() || !subject.trim() || bodyEmpty || sending) return;
    if (!valgtKonto) {
      visTost('Ingen sendekonto med SMTP er konfigurert ✗');
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append('to', to.trim());
      form.append('cc', cc.trim());
      form.append('bcc', bcc.trim());
      form.append('subject', subject.trim());
      form.append('html', bodyHtml);
      form.append('kontoId', String(valgtKonto.id));
      if (replyTo) {
        form.append('replyToId', String(replyTo.id));
        form.append('replyQuoteHtml', replyQuoteHtml);
        if (replyTo.fraNavn) form.append('toName', replyTo.fraNavn);
        if (replyTo.henvendelseId) form.append('henvendelseId', String(replyTo.henvendelseId));
      }
      if (draftId) form.append('draftId', String(draftId));
      attachments.forEach(function (item) {
        form.append('vedlegg', item.file, item.name);
      });
      const res = await sendEpostMultipart(form);
      if (replyTo) clearReplyDraft(replyTo.id);
      else clearLocalComposeDraft(draftId);
      visTost('E-post sendt ✓');
      if (onDraftChange) {
        try {
          const utkastRes = await getEpostUtkast();
          onDraftChange(utkastRes);
        } catch { /* ignore */ }
      }
      if (res.item && onSent) onSent(res.item);
      onClose();
    } catch (err) {
      visTost(err.message || 'Kunne ikke sende e-post ✗');
    } finally {
      setSending(false);
    }
  };

  const previewHtml = buildMailPreviewHtml(bodyHtml, valgtKonto?.signatur || '', replyQuoteHtml);

  const slettUtkast = async () => {
    if (replyTo) {
      clearReplyDraft(replyTo.id);
      visTost('Svarutkast slettet ✓');
      onClose();
      return;
    }
    if (!draftId) return;
    try {
      const res = await deleteEpostUtkast(draftId);
      clearLocalComposeDraft(draftId);
      if (onDraftChange) onDraftChange(res);
      visTost('Utkast slettet ✓');
      onClose();
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette utkast ✗');
    }
  };

  const lagreUtkast = async () => {
    const draft = {
      id: draftId || undefined,
      kontoId: kontoId ? Number(kontoId) : null,
      to,
      cc,
      bcc,
      subject,
      html: bodyHtml
    };
    if (isComposeDraftEmpty(draft)) {
      visTost('Skriv noe i utkastet før du lagrer ✗');
      return;
    }
    if (replyTo) {
      writeReplyDraft(replyTo.id, draft);
      visTost('Svarutkast lagret ✓');
      onClose();
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSavingDraft(true);
    setDraftStatus('Lagrer utkast…');
    try {
      writeLocalComposeDraft(draft, draftId);
      const res = await saveEpostUtkast(draft);
      const item = res.item || null;
      if (item?.id && item.id !== draftId) {
        clearLocalComposeDraft(draftId);
        setDraftId(item.id);
        writeLocalComposeDraft({
          kontoId: item.kontoId,
          to: item.to,
          cc: item.cc,
          bcc: item.bcc,
          subject: item.subject,
          html: item.html
        }, item.id);
      }
      const stamp = item?.updatedAt || new Date().toISOString();
      setDraftStatus(`Utkast lagret · ${formatDraftTime(stamp)}`);
      if (onDraftChange) onDraftChange(res);
      visTost('Utkast lagret ✓');
      onClose();
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre utkast ✗');
    } finally {
      setSavingDraft(false);
    }
  };

  const draftIsEmpty = replyTo
    ? isReplyBodyEmpty(bodyHtml)
    : isComposeDraftEmpty({ to, subject, html: bodyHtml });

  const modalTitle = replyTo
    ? 'Svar på e-post'
    : (initialDraftId ? 'Rediger utkast' : 'Ny e-post');
  const sendLabel = replyTo ? 'Send svar' : 'Send e-post';

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal xl compose-modal" onClick={e => e.stopPropagation()}>
        <div className="compose-modal-header">
          <div className="compose-modal-header__main">
            <div className="modal-title" style={{ marginBottom: 0 }}>{modalTitle}</div>
            {draftStatus && <div className="compose-draft-status">{draftStatus}</div>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Lukk" title="Lukk">
            ×
          </button>
        </div>
        {draftRestored && (
          <div className="compose-draft-note">
            {replyTo
              ? 'Svarutkastet ditt er gjenopprettet. Innhold lagres automatisk mens du skriver.'
              : <>Utkastet ditt er gjenopprettet. Innhold lagres fortløpende mens du skriver og vises under <strong>Utkast</strong> i innboksen.</>}
          </div>
        )}
        {replyTo && (
          <div className="compose-reply-context">
            Svar til <strong>{replyTo.fraNavn || replyTo.fraEpost}</strong>
            {replyTo.emne ? ` · ${replyTo.emne}` : ''}
          </div>
        )}

        {!sendKontoer.length ? (
          <div className="inbox-config">Legg til minst én mailkonto med SMTP under Innstillinger før du kan sende e-post.</div>
        ) : (
          <>
            <div className="compose-field">
              <div className="fl">Fra</div>
              <select value={kontoId} onChange={e => setKontoId(e.target.value)}>
                {sendKontoer.map(function (k) {
                  return <option key={k.id} value={k.id}>{k.navn} ({k.epost})</option>;
                })}
              </select>
            </div>
            <div className="compose-field">
              <div className="fl">Til</div>
              <input type="text" value={to} onChange={e => setTo(e.target.value)} placeholder="mottaker@example.com" />
              <div className="compose-field-hint">Flere mottakere: skill med komma</div>
            </div>
            <div className="form-row gap">
              <div className="compose-field">
                <div className="fl">Kopi (Cc)</div>
                <input type="text" value={cc} onChange={e => setCc(e.target.value)} placeholder="valgfritt" />
              </div>
              <div className="compose-field">
                <div className="fl">Blindkopi (Bcc)</div>
                <input type="text" value={bcc} onChange={e => setBcc(e.target.value)} placeholder="valgfritt" />
              </div>
            </div>
            <div className="compose-field">
              <div className="fl">Emne</div>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Emne på e-posten" />
            </div>
            {maler.length > 0 && (
              <div className="compose-field">
                <div className="fl">E-postmal</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={valgtMalId} onChange={e => setValgtMalId(e.target.value)} style={{ minWidth: 220, flex: 1 }}>
                    <option value="">Velg mal…</option>
                    {maler.map(function (m) {
                      return <option key={m.id} value={m.id}>{m.navn}</option>;
                    })}
                  </select>
                  <button type="button" className="btn btn-g btn-sm" onClick={insertMal} disabled={!valgtMalId}>
                    Sett inn mal
                  </button>
                </div>
                <div className="compose-field-hint">Malen settes inn øverst i meldingen. Signatur og sitert e-post legges til automatisk ved sending.</div>
              </div>
            )}
            <div className="compose-field">
              <div className="fl">Melding</div>
              <MailComposer
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder={replyTo
                  ? 'Skriv svaret ditt her. Original e-post vises nedenfor og legges automatisk til ved sending.'
                  : 'Skriv meldingen her. Bruk verktøylinjen for teksttype, avstand, lister, farger, bilder og mer…'}
              />
            </div>
            {replyQuoteHtml && (
              <div className="compose-field">
                <div className="fl">Original e-post (legges til automatisk under signatur)</div>
                <div
                  className="compose-reply-quote-readonly"
                  dangerouslySetInnerHTML={{ __html: replyQuoteHtml }}
                />
              </div>
            )}
            <div className="compose-field">
              <div className="fl">Vedlegg</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="btn btn-g btn-sm" onClick={() => attachRef.current?.click()}>
                  + Legg til vedlegg
                </button>
                <span className="compose-field-hint">PDF, Word, bilder m.m. (maks 8 MB per fil)</span>
              </div>
              <input
                ref={attachRef}
                type="file"
                hidden
                multiple
                onChange={e => {
                  addAttachments(e.target.files);
                  e.target.value = '';
                }}
              />
              {attachments.length > 0 && (
                <ul className="compose-attachments">
                  {attachments.map(function (item) {
                    return (
                      <li key={item.id} className="compose-attachment">
                        <span className="compose-attachment__name">{item.name}</span>
                        <span className="compose-attachment__size">{formatFileSize(item.size)}</span>
                        <button type="button" className="btn btn-g btn-xs" onClick={() => removeAttachment(item.id)}>Fjern</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {previewHtml && (
              <div className="mail-signatur-preview">
                <div className="mail-signatur-preview__label">
                  Forhåndsvisning{valgtKonto?.signatur ? ` (med signatur fra ${valgtKonto.navn})` : ''}
                </div>
                <div
                  className="mail-signatur-preview__html"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            )}
          </>
        )}

        <div className="modal-footer">
          {(draftId || replyTo) && (
            <button type="button" className="btn btn-g" style={{ marginRight: 'auto' }} onClick={slettUtkast}>
              Slett utkast
            </button>
          )}
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
          <button
            type="button"
            className="btn btn-g"
            onClick={lagreUtkast}
            disabled={sending || savingDraft || !sendKontoer.length || draftIsEmpty}
          >
            {savingDraft ? 'Lagrer…' : 'Lagre utkast'}
          </button>
          <button
            type="button"
            className="btn btn-p"
            onClick={send}
            disabled={sending || !sendKontoer.length || !to.trim() || !subject.trim() || draftIsEmpty}
          >
            {sending ? 'Sender…' : sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function InnboksView({ epost, mailStatus, setEpost, setMailStatus, setHenv, visTost, refreshStats, setTab }) {
  const [filter, setFilter] = useState('Inngående');
  const [kontoFilter, setKontoFilter] = useState('alle');
  const [valgt, setValgt] = useState(null);
  const [valgtUtkast, setValgtUtkast] = useState(null);
  const [utkast, setUtkast] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraftId, setComposeDraftId] = useState(null);
  const [composeReplyTo, setComposeReplyTo] = useState(null);
  const kontoer = mailStatus.kontoer || [];

  const loadUtkast = async () => {
    try {
      const res = await getEpostUtkast();
      setUtkast(res.items || []);
      if (res.status) setMailStatus(res.status);
    } catch {
      /* ignore */
    }
  };

  useEffect(function () {
    loadUtkast();
  }, []);

  useEffect(function () {
    if (kontoFilter !== 'alle' && !kontoer.some(function (k) { return String(k.id) === String(kontoFilter); })) {
      setKontoFilter('alle');
    }
  }, [kontoer, kontoFilter]);

  useEffect(function () {
    if (valgt && !epost.some(function (e) { return e.id === valgt.id; })) {
      setValgt(null);
    }
  }, [epost, valgt]);

  useEffect(function () {
    if (valgtUtkast && !utkast.some(function (u) { return u.id === valgtUtkast.id; })) {
      setValgtUtkast(null);
    }
  }, [utkast, valgtUtkast]);

  const setInboxFilter = (s) => {
    setFilter(s);
    if (s === 'Utkast') {
      setValgt(null);
    } else {
      setValgtUtkast(null);
    }
  };

  const vis = epost.filter(function (e) {
    if (kontoFilter !== 'alle' && String(e.kontoId) !== String(kontoFilter)) return false;
    if (filter === 'Ulest') return e.retning === 'inn' && !e.lest;
    if (filter === 'Utgående') return e.retning === 'ut';
    if (filter === 'Inngående') return e.retning === 'inn';
    return true;
  });

  const visUtkast = utkast.filter(function (u) {
    if (kontoFilter !== 'alle' && String(u.kontoId) !== String(kontoFilter)) return false;
    return true;
  });

  const openNewCompose = () => {
    setComposeDraftId(null);
    setComposeReplyTo(null);
    setComposeOpen(true);
  };

  const openReplyCompose = (mail) => {
    if (!mail || mail.retning !== 'inn') return;
    setComposeDraftId(null);
    setComposeReplyTo(mail);
    setComposeOpen(true);
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setComposeDraftId(null);
    setComposeReplyTo(null);
  };

  const openDraftEditor = (draft) => {
    if (!draft?.id) return;
    setComposeDraftId(draft.id);
    setComposeOpen(true);
  };

  const handleDraftChange = (res) => {
    if (res?.items) setUtkast(res.items);
    else loadUtkast();
    if (res?.status) setMailStatus(res.status);
  };

  const slettUtkast = async (id) => {
    try {
      const res = await deleteEpostUtkast(id);
      setUtkast(function (prev) { return prev.filter(function (u) { return u.id !== id; }); });
      if (valgtUtkast?.id === id) setValgtUtkast(null);
      if (res.status) setMailStatus(res.status);
      visTost('Utkast slettet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette utkast ✗');
    }
  };

  const openMail = async (mail) => {
    setValgt(mail);
    if (mail.retning === 'inn' && !mail.lest) {
      try {
        const res = await patchEpost(mail.id, { lest: true });
        if (res.item) {
          setEpost(prev => prev.map(e => e.id === mail.id ? res.item : e));
          setValgt(res.item);
          refreshStats();
        }
      } catch {
        /* ignore */
      }
    }
  };

  const syncMail = async () => {
    setSyncing(true);
    try {
      const body = kontoFilter !== 'alle' ? { kontoId: Number(kontoFilter) } : {};
      const res = await syncInnboks(body);
      if (res.status) setMailStatus(res.status);
      const data = await getInnboks();
      setEpost(data.items || []);
      if (data.status) setMailStatus(data.status);
      refreshStats();
      visTost(`${res.imported || 0} nye e-poster hentet ✓`);
    } catch (err) {
      visTost(err.message || 'Synkronisering feilet ✗');
    } finally {
      setSyncing(false);
    }
  };

  const opprettHenv = async () => {
    if (!valgt) return;
    try {
      const res = await opprettHenvFraEpost(valgt.id);
      if (res.epost) {
        setEpost(prev => prev.map(e => e.id === valgt.id ? res.epost : e));
        setValgt(res.epost);
      }
      if (res.henvendelse) setHenv(prev => [res.henvendelse, ...prev]);
      visTost('Henvendelse opprettet ✓');
      refreshStats();
    } catch (err) {
      visTost(err.message || 'Kunne ikke opprette henvendelse ✗');
    }
  };

  const kontoLabel = kontoer.length
    ? `${kontoer.filter(k => k.aktiv).length} aktive kontoer`
    : 'Ingen mailkontoer';

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">E-postinnboks</div>
          <div className="ph-sub">
            {kontoLabel} · {epost.filter(e => e.retning === 'inn' && !e.lest).length} ulest
            {mailStatus.lastSync ? ` · Sist synk: ${mailStatus.lastSync.replace('T', ' ').slice(0, 16)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-p"
            onClick={openNewCompose}
            disabled={!mailStatus.smtpConfigured}
          >
            ✉ Ny e-post
          </button>
          <button type="button" className="btn btn-g" onClick={() => setTab('innstillinger')}>Mailkontoer</button>
          <button type="button" className="btn btn-p" onClick={syncMail} disabled={syncing || !mailStatus.imapConfigured}>
            {syncing ? 'Synkroniserer…' : '↻ Synkroniser'}
          </button>
        </div>
      </div>

      {(!mailStatus.imapConfigured || !mailStatus.smtpConfigured) && (
        <div className="inbox-config">
          {!mailStatus.kontoCount && (
            <div><strong>Ingen mailkontoer</strong> – gå til <button type="button" className="btn btn-g btn-xs" style={{ marginLeft: 6 }} onClick={() => setTab('innstillinger')}>Innstillinger</button> og legg til minst én konto.</div>
          )}
          {!!mailStatus.kontoCount && !mailStatus.imapConfigured && (
            <div><strong>IMAP mangler</strong> – minst én aktiv konto trenger IMAP-oppsett for å hente e-post.</div>
          )}
          {!!mailStatus.kontoCount && !mailStatus.smtpConfigured && (
            <div><strong>SMTP mangler</strong> – minst én aktiv konto trenger SMTP-oppsett for å sende svar.</div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['Inngående', 'Ulest', 'Utgående', 'Utkast', 'Alle'].map(function (s) {
          const count = s === 'Utkast' ? (mailStatus.utkastCount || visUtkast.length || 0) : 0;
          return (
            <button key={s} type="button" className={`btn btn-sm ${filter === s ? 'btn-p' : 'btn-g'}`} onClick={() => setInboxFilter(s)}>
              {s}{count ? ` (${count})` : ''}
            </button>
          );
        })}
        {kontoer.length > 0 && (
          <select value={kontoFilter} onChange={e => setKontoFilter(e.target.value)} style={{ marginLeft: 'auto', minWidth: 180 }}>
            <option value="alle">Alle kontoer</option>
            {kontoer.map(function (k) {
              return <option key={k.id} value={k.id}>{k.navn} ({k.epost})</option>;
            })}
          </select>
        )}
      </div>

      <div className="inbox-layout">
        <div className="inbox-list">
          <div className="inbox-list-hd">
            <span className="card-ht">{filter === 'Utkast' ? 'Utkast' : 'Meldinger'}</span>
            <span style={{ fontSize: 10, color: 'var(--t4)' }}>{filter === 'Utkast' ? visUtkast.length : vis.length}</span>
          </div>
          <div className="inbox-list-body">
            {filter === 'Utkast' ? (
              <>
                {visUtkast.length === 0 && <div className="inbox-empty">Ingen utkast lagret ennå. Klikk <strong>Ny e-post</strong> for å starte et nytt utkast.</div>}
                {visUtkast.map(function (u) {
                  return (
                    <div
                      key={u.id}
                      className={`inbox-item draft${valgtUtkast?.id === u.id ? ' on' : ''}`}
                      onClick={() => setValgtUtkast(u)}
                    >
                      <div className="inbox-item-top">
                        <div className="inbox-item-from">{u.to ? `Til ${u.to}` : '(Ingen mottaker)'}</div>
                        <div className="inbox-item-date">{u.dato}</div>
                      </div>
                      {u.kontoNavn && <div className="inbox-konto-tag">{u.kontoNavn}</div>}
                      <div className="inbox-item-subj">{u.subject || '(Uten emne)'}</div>
                      <div className="inbox-item-snippet">{u.snippet || ''}</div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {vis.length === 0 && <div className="inbox-empty">Ingen e-poster i denne visningen.</div>}
                {vis.map(function (e) {
                  return (
                    <div
                      key={e.id}
                      className={`inbox-item${valgt?.id === e.id ? ' on' : ''}${e.retning === 'inn' && !e.lest ? ' unread' : ''}`}
                      onClick={() => openMail(e)}
                    >
                      <div className="inbox-item-top">
                        <div className="inbox-item-from">
                          {e.retning === 'ut' ? `Til ${e.tilEpost}` : (e.fraNavn || e.fraEpost || 'Ukjent')}
                        </div>
                        <div className="inbox-item-date">{e.dato}</div>
                      </div>
                      {e.kontoNavn && <div className="inbox-konto-tag">{e.kontoNavn}</div>}
                      <div className="inbox-item-subj">{e.emne}</div>
                      <div className="inbox-item-snippet">{e.innhold || e.innholdHtml || ''}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div className="inbox-detail">
          {filter === 'Utkast' ? (
            !valgtUtkast ? (
              <div className="inbox-empty">
                Velg et utkast for forhåndsvisning, eller klikk <strong>Ny e-post</strong> for å skrive en ny melding.
              </div>
            ) : (
              <>
                <div className="inbox-detail-hd">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>{valgtUtkast.subject || '(Uten emne)'}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>
                      Utkast · {valgtUtkast.dato}
                      {valgtUtkast.kontoNavn ? ` · ${valgtUtkast.kontoNavn}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-p btn-sm" onClick={() => openDraftEditor(valgtUtkast)}>Fortsett redigering</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => slettUtkast(valgtUtkast.id)}>Slett utkast</button>
                  </div>
                </div>
                <div className="inbox-detail-body">
                  <div className="inbox-meta">
                    <div><strong>Til:</strong> {valgtUtkast.to || '—'}</div>
                    {valgtUtkast.cc && <div><strong>Kopi:</strong> {valgtUtkast.cc}</div>}
                    {valgtUtkast.bcc && <div><strong>Blindkopi:</strong> {valgtUtkast.bcc}</div>}
                    {valgtUtkast.kontoNavn && <div><strong>Fra:</strong> {valgtUtkast.kontoNavn} ({valgtUtkast.kontoEpost})</div>}
                  </div>
                  <div className="inbox-body">
                    {valgtUtkast.html ? (
                      <div className="inbox-body--html" dangerouslySetInnerHTML={{ __html: valgtUtkast.html }} />
                    ) : (
                      '(Tom melding)'
                    )}
                  </div>
                </div>
              </>
            )
          ) : !valgt ? (
            <div className="inbox-empty">
              Velg en e-post for å lese og svare, eller klikk <strong>Ny e-post</strong> for å skrive en ny melding.
            </div>
          ) : (
            <>
              <div className="inbox-detail-hd">
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>{valgt.emne}</div>
                  <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>
                    {valgt.retning === 'ut' ? 'Utgående' : 'Inngående'} · {valgt.dato}
                    {valgt.kontoNavn ? ` · ${valgt.kontoNavn}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {valgt.retning === 'inn' && !valgt.henvendelseId && (
                    <button type="button" className="btn btn-g btn-sm" onClick={opprettHenv}>Opprett henvendelse</button>
                  )}
                  {valgt.henvendelseId && (
                    <button type="button" className="btn btn-g btn-sm" onClick={() => setTab('henvendelser')}>Gå til henvendelser</button>
                  )}
                  {valgt.retning === 'inn' && (
                    <button
                      type="button"
                      className="btn btn-p btn-sm"
                      onClick={() => openReplyCompose(valgt)}
                      disabled={!mailStatus.smtpConfigured}
                    >
                      ↩ Svar{hasReplyDraft(valgt.id) ? ' · utkast' : ''}
                    </button>
                  )}
                </div>
              </div>
              <div className="inbox-detail-body">
                <div className="inbox-meta">
                  <div><strong>Fra:</strong> {valgt.fraNavn ? `${valgt.fraNavn} <${valgt.fraEpost}>` : valgt.fraEpost}</div>
                  <div><strong>Til:</strong> {valgt.tilEpost || valgt.kontoEpost || '—'}</div>
                  {valgt.kontoNavn && <div><strong>Konto:</strong> {valgt.kontoNavn} ({valgt.kontoEpost})</div>}
                </div>
                <div className="inbox-body">
                  {valgt.innholdHtml ? (
                    <div className="inbox-body--html" dangerouslySetInnerHTML={{ __html: valgt.innholdHtml }} />
                  ) : (
                    valgt.innhold || '(Tom melding)'
                  )}
                </div>

                {valgt.retning === 'inn' && (
                  <div className="inbox-reply-hint">
                    Klikk <strong>Svar</strong> for å skrive svar med formatering, vedlegg, kopi og blindkopi — samme som ved ny e-post.
                    {hasReplyDraft(valgt.id) ? ' Du har et lagret svarutkast.' : ''}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {composeOpen && (
        <ComposeMailModal
          kontoer={kontoer}
          draftId={composeReplyTo ? null : composeDraftId}
          replyTo={composeReplyTo}
          onClose={closeCompose}
          onDraftChange={handleDraftChange}
          visTost={visTost}
          onSent={function (item) {
            setEpost(function (prev) { return [item, ...prev]; });
            setFilter('Utgående');
            setValgt(item);
            refreshStats();
            loadUtkast();
          }}
        />
      )}
    </>
  );
}

// ─── HENVENDELSER ────────────────────────────────────────────────────────────
function HenvendelserView({ henv, setModal, updateHenv, visTost, lists }) {
  const [filter, setFilter] = useState('Alle');
  const vis = filter === 'Alle' ? henv : henv.filter(h => h.status === filter);

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Henvendelser</div>
          <div className="ph-sub">{henv.filter(h => h.status === 'Ny').length} nye · {henv.length} totalt</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['Alle', ...lists.henvStatuser].map(s => (
          <button key={s} type="button" className={`btn btn-sm ${filter === s ? 'btn-p' : 'btn-g'}`} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Fra</th><th>Emne</th><th>Bil</th><th>Kilde</th><th>Dato</th><th>Status</th><th>Ansvarlig</th><th></th></tr></thead>
          <tbody>
            {vis.map(h => (
              <tr key={h.id}>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 12 }}>{h.navn}</div>
                  <div style={{ fontSize: 10, color: 'var(--t4)' }}>{h.epost}</div>
                </td>
                <td style={{ maxWidth: 180 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{h.emne}</div>
                </td>
                <td><span className="tag">{h.bilRef || '—'}</span></td>
                <td><span className="tag">{h.kilde}</span></td>
                <td style={{ fontSize: 10, color: 'var(--t4)', whiteSpace: 'nowrap' }}>{h.dato}</td>
                <td><Badge s={h.status} /></td>
                <td style={{ fontSize: 11 }}>{h.ansvarlig || <span style={{ color: 'var(--t4)' }}>Ikke tildelt</span>}</td>
                <td>
                  <div className="row-act">
                    <button type="button" className="btn btn-p btn-xs" onClick={() => setModal({ t: 'visHenv', d: h })}>Åpne</button>
                    {h.status === 'Ny' && (
                      <button
                        type="button"
                        className="btn btn-g btn-xs"
                        onClick={() => updateHenv(h.id, { status: 'Tildelt', ansvarlig: lists.ansatte[0] || '' }, 'Tildelt ✓')}
                      >
                        Tildel meg
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HenvModal({ data, onClose, updateHenv, onSendSvar, visTost, lists, mailStatus }) {
  const [h, setH] = useState(data);
  const [svar, setSvar] = useState(h.svar || '');
  const [nyKom, setNyKom] = useState('');
  const [sending, setSending] = useState(false);
  const sendKonto = (mailStatus?.kontoer || []).find(function (k) { return k.standard; })
    || (mailStatus?.kontoer || [])[0];

  const opp = (k, v, msg) => {
    const ny = { ...h, [k]: v };
    setH(ny);
    updateHenv(h.id, { [k]: v }, msg);
  };

  const sendSvar = async () => {
    if (!svar.trim() || sending) return;
    if (mailStatus?.smtpConfigured && onSendSvar) {
      setSending(true);
      try {
        const updated = await onSendSvar(h.id, svar);
        if (updated) setH(updated);
      } finally {
        setSending(false);
      }
      return;
    }
    const ny = { ...h, svar, status: 'Besvart' };
    setH(ny);
    updateHenv(h.id, { svar, status: 'Besvart' }, 'Svar registrert ✓');
  };

  const leggKom = () => {
    if (!nyKom.trim()) return;
    const kommentarer = [...(h.kommentarer || []), `${new Date().toLocaleString('nb-NO')}: ${nyKom}`];
    opp('kommentarer', kommentarer);
    setNyKom('');
  };

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{h.emne}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div className="modal-sec">Avsender</div>
            <div className="form-row gap">
              <div><div className="fl">Navn</div><div className="fv">{h.navn}</div></div>
              <div><div className="fl">Telefon</div><div className="fv">{h.tlf}</div></div>
            </div>
            <div className="gap"><div className="fl">E-post</div><div className="fv">{h.epost}</div></div>
            <div className="gap"><div className="fl">Tilknyttet bil</div><span className="tag">{h.bilRef || '—'}</span></div>
            <div className="modal-sec">Mottatt melding</div>
            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--t2)', lineHeight: 1.65 }}>{h.melding}</div>
            <div className="modal-sec">Interne kommentarer</div>
            {(h.kommentarer || []).map((k, i) => <div className="logg-item" key={i}><div className="logg-tekst">{k}</div></div>)}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input placeholder="Intern kommentar..." value={nyKom} onChange={e => setNyKom(e.target.value)} onKeyDown={e => e.key === 'Enter' && leggKom()} />
              <button type="button" className="btn btn-g btn-sm" onClick={leggKom}>+</button>
            </div>
          </div>
          <div>
            <div className="modal-sec">Behandling</div>
            <div>
              <div className="fl">Status</div>
              <select value={h.status} onChange={e => opp('status', e.target.value)}>
                {lists.henvStatuser.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="gap">
              <div className="fl">Ansvarlig</div>
              <select value={h.ansvarlig || ''} onChange={e => opp('ansvarlig', e.target.value)}>
                <option value="">Ikke tildelt</option>
                {lists.ansatte.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="modal-sec">Svar til kunde</div>
            {!mailStatus?.smtpConfigured && (
              <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 8 }}>
                SMTP er ikke satt opp – svaret lagres kun i CRM.
              </div>
            )}
            <textarea rows={8} value={svar} onChange={e => setSvar(e.target.value)} placeholder="Skriv svar her..." />
            {sendKonto?.signatur && mailStatus?.smtpConfigured && (
              <SignaturePreview
                body={svar}
                signatur={sendKonto.signatur}
                label={`Signatur fra ${sendKonto.navn} legges til automatisk`}
              />
            )}
            <button type="button" className="btn btn-p btn-sm" style={{ marginTop: 8 }} onClick={sendSvar} disabled={sending || !svar.trim()}>
              {sending ? 'Sender…' : (mailStatus?.smtpConfigured ? 'Send svar på e-post' : 'Lagre svar')}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={onClose}>Lagre & lukk</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── INNBYTTE ────────────────────────────────────────────────────────────────
function InnbytteView({ innbytte, setModal, lists }) {
  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Innbytteforespørsler</div>
          <div className="ph-sub">Fra xbilsenter.no/innbytte · {innbytte.filter(i => i.status === 'Ny').length} nye</div>
        </div>
      </div>
      <div style={{ background: 'var(--orangel)', border: '1px solid #FDE68A', borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--orange)' }}>
        <strong>Nettside-kobling:</strong> Nye innbytteforespørsler fra xbilsenter.no nettside opprettes automatisk her via API. Skjemaet sender til{' '}
        <code style={{ background: '#0000001A', padding: '1px 5px', borderRadius: 3 }}>POST /api/ingest/innbytte</code>
      </div>
      {innbytte.map(inn => (
        <div className="inb-card" key={inn.id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{inn.navn}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {inn.merke} {inn.modell} {inn.aar} · {fmtKm(inn.km)} km · {inn.reg}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge s={inn.status} />
              <button type="button" className="btn btn-p btn-sm" onClick={() => setModal({ t: 'visInb', d: inn })}>Behandle</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['Ønsket bil', inn.onsketBil || '—'], ['Tilstand', inn.tilstand], ['Tilbud', inn.tilbud ? nok(inn.tilbud) : 'Ikke gitt'], ['Ansvarlig', inn.ansvarlig || 'Ikke tildelt'], ['Dato', inn.dato]].map(([l, v]) => (
              <div key={l}>
                <div className="fl">{l}</div>
                <div className="fv" style={{ fontSize: 12, color: l === 'Tilbud' && inn.tilbud ? 'var(--gold)' : 'var(--t2)' }}>{v}</div>
              </div>
            ))}
          </div>
          {inn.beskrivelse && <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 8, fontStyle: 'italic' }}>{inn.beskrivelse}</div>}
        </div>
      ))}
      {innbytte.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--t4)', padding: 40, fontSize: 13 }}>Ingen innbytteforespørsler ennå.</div>
      )}
    </>
  );
}

function InbModal({ data, onClose, updateInnbytte, visTost, lists }) {
  const [inn, setInn] = useState(data);
  const [tilbud, setTilbud] = useState(inn.tilbud || '');
  const [nyKom, setNyKom] = useState('');

  const opp = (k, v, msg) => {
    const ny = { ...inn, [k]: v };
    setInn(ny);
    updateInnbytte(inn.id, { [k]: v }, msg);
  };

  const sendTilbud = () => {
    opp('tilbud', tilbud);
    opp('status', 'Tilbud sendt', 'Tilbud registrert ✓');
  };

  const leggKom = () => {
    if (!nyKom.trim()) return;
    const kommentarer = [...(inn.kommentarer || []), `${new Date().toLocaleString('nb-NO')}: ${nyKom}`];
    opp('kommentarer', kommentarer);
    setNyKom('');
  };

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal lg" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Innbytte: {inn.merke} {inn.modell} {inn.aar}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div className="modal-sec">Kjøretøy</div>
            <div className="form-row3">
              <div><div className="fl">Reg</div><div className="fv">{inn.reg}</div></div>
              <div><div className="fl">Km</div><div className="fv">{fmtKm(inn.km)}</div></div>
              <div><div className="fl">Tilstand</div><div className="fv">{inn.tilstand}</div></div>
            </div>
            <div className="gap">
              <div className="fl">Beskrivelse fra kunde</div>
              <div style={{ background: 'var(--s2)', borderRadius: 8, padding: 11, fontSize: 12, color: 'var(--t2)', lineHeight: 1.6, marginTop: 4 }}>{inn.beskrivelse}</div>
            </div>
            <div className="modal-sec">Kunde</div>
            <div className="form-row">
              <div><div className="fl">Navn</div><div className="fv">{inn.navn}</div></div>
              <div><div className="fl">Tlf</div><div className="fv">{inn.tlf}</div></div>
            </div>
            <div className="gap"><div className="fl">E-post</div><div className="fv">{inn.epost}</div></div>
            <div className="gap"><div className="fl">Ønsker å kjøpe</div><div className="fv" style={{ color: 'var(--acc)', fontWeight: 600 }}>{inn.onsketBil || '—'}</div></div>
          </div>
          <div>
            <div className="modal-sec">Behandling</div>
            <div>
              <div className="fl">Status</div>
              <select value={inn.status} onChange={e => opp('status', e.target.value)}>
                {lists.innbytteStatuser.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="gap">
              <div className="fl">Ansvarlig</div>
              <select value={inn.ansvarlig || ''} onChange={e => opp('ansvarlig', e.target.value)}>
                <option value="">Ikke tildelt</option>
                {lists.ansatte.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="modal-sec">Tilbud</div>
            <div className="gap">
              <div className="fl">Tilbudspris (kr)</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" placeholder="f.eks. 85000" value={tilbud} onChange={e => setTilbud(e.target.value)} />
                <button type="button" className="btn btn-p btn-sm" onClick={sendTilbud}>Send tilbud</button>
              </div>
            </div>
            <div className="modal-sec">Kommentarer</div>
            {(inn.kommentarer || []).map((k, i) => <div className="logg-item" key={i}><div className="logg-tekst">{k}</div></div>)}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input placeholder="Kommentar..." value={nyKom} onChange={e => setNyKom(e.target.value)} onKeyDown={e => e.key === 'Enter' && leggKom()} />
              <button type="button" className="btn btn-g btn-sm" onClick={leggKom}>+</button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={onClose}>Lagre & lukk</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── KALENDER ────────────────────────────────────────────────────────────────
function KalenderView({ kal, setModal, biler, lists }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const cells = monthMatrix(viewYear, viewMonth);
  const monthKal = kal.filter(function (e) { return isSameMonth(e.dato, viewYear, viewMonth); });

  const shiftMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const gaTilIdag = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Kalender</div>
          <div className="ph-sub">Månedsvisning · {monthKal.length} avtaler</div>
        </div>
        <button type="button" className="btn btn-p" onClick={() => setModal({ t: 'nyKal' })}>+ Ny avtale</button>
      </div>

      <div className="kal-month-nav">
        <button type="button" className="btn btn-g btn-sm" onClick={() => shiftMonth(-1)}>← Forrige</button>
        <div className="kal-month-title">{monthLabel(viewYear, viewMonth)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-g btn-sm" onClick={gaTilIdag}>I dag</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => shiftMonth(1)}>Neste →</button>
        </div>
      </div>

      <div className="kal-grid kal-grid--month" style={{ marginBottom: 20 }}>
        {DAGER.map(function (d) {
          return <div key={d} className="kal-dag-hd">{d}</div>;
        })}
        {cells.map(function (cell) {
          const dayEvents = kal
            .filter(function (e) { return e.dato === cell.iso; })
            .sort(function (a, b) { return a.tid.localeCompare(b.tid); });

          return (
            <div
              key={cell.iso}
              className={`kal-cell${cell.iso === IDAG ? ' today' : ''}${cell.inMonth ? '' : ' kal-cell--muted'}`}
            >
              <div className={`kal-dag-nr${cell.iso === IDAG ? ' kal-dag-nr--today' : ''}`}>{cell.day}</div>
              {dayEvents.map(function (e) {
                const color = KFARGE[e.type] || '#888';
                return (
                  <div
                    key={e.id}
                    className="kal-event"
                    style={{
                      background: color + '20',
                      color: color,
                      borderLeft: `2px solid ${color}`
                    }}
                    onClick={() => setModal({ t: 'visKal', d: e })}
                  >
                    <div style={{ fontSize: 9, opacity: .7 }}>{formatKalTid(e)}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, marginTop: 1 }}>{e.tittel}</div>
                    <div style={{ fontSize: 9, opacity: .6, marginTop: 1 }}>{e.ansvarlig}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-h">
          <span className="card-ht">Alle avtaler i {monthLabel(viewYear, viewMonth)}</span>
        </div>
        <table>
          <thead><tr><th>Tittel</th><th>Type</th><th>Dato</th><th>Tid</th><th>Ansvarlig</th><th>Bil</th><th>Notat</th></tr></thead>
          <tbody>
            {monthKal.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Ingen avtaler denne måneden</td></tr>
            )}
            {[...monthKal].sort(function (a, b) {
              return a.dato.localeCompare(b.dato) || a.tid.localeCompare(b.tid);
            }).map(function (e) {
              return (
                <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => setModal({ t: 'visKal', d: e })}>
                  <td style={{ fontWeight: 600, color: 'var(--t1)', fontSize: 12 }}>{e.tittel}</td>
                  <td><KBadge type={e.type} /></td>
                  <td style={{ fontSize: 11, color: e.dato === IDAG ? 'var(--acc)' : 'var(--t2)', fontWeight: e.dato === IDAG ? 700 : 400 }}>
                    {e.dato}{e.dato === IDAG ? ' (i dag)' : ''}
                  </td>
                  <td style={{ fontSize: 11 }}>{formatKalTid(e)}</td>
                  <td style={{ fontSize: 11 }}>{e.ansvarlig}</td>
                  <td><span className="tag">{e.bilRef || '—'}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--t4)' }}>{e.notat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function KalModal({ data, onClose, onSave, biler, lists, title }) {
  const [f, setF] = useState({
    tittel: data?.tittel || '',
    type: data?.type || lists.kalTyper[0] || 'Annet',
    dato: data?.dato || IDAG,
    tid: data?.tid || '10:00',
    tidSlutt: data?.tidSlutt || '',
    ansvarlig: data?.ansvarlig || lists.ansatte[0] || '',
    bilRef: data?.bilRef || '',
    notat: data?.notat || ''
  });
  const [err, setErr] = useState('');
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const lagre = () => {
    if (!f.tittel || !f.dato) return;
    if (f.tidSlutt && f.tidSlutt <= f.tid) {
      setErr('Sluttid må være etter starttid.');
      return;
    }
    setErr('');
    onSave(f);
  };

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal sm" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title || 'Kalenderavtale'}</div>
        <div><div className="fl">Tittel</div><input value={f.tittel} onChange={e => s('tittel', e.target.value)} /></div>
        <div className="form-row gap">
          <div><div className="fl">Type</div><select value={f.type} onChange={e => s('type', e.target.value)}>{lists.kalTyper.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><div className="fl">Ansvarlig</div><select value={f.ansvarlig} onChange={e => s('ansvarlig', e.target.value)}>{lists.ansatte.map(a => <option key={a}>{a}</option>)}</select></div>
        </div>
        <div className="form-row gap">
          <div><div className="fl">Dato</div><input type="date" value={f.dato} onChange={e => s('dato', e.target.value)} /></div>
          <div><div className="fl">Starttid</div><input type="time" value={f.tid} onChange={e => s('tid', e.target.value)} /></div>
          <div><div className="fl">Sluttid</div><input type="time" value={f.tidSlutt} onChange={e => s('tidSlutt', e.target.value)} /></div>
        </div>
        <div className="gap">
          <div className="fl">Tilknyttet bil</div>
          <select value={f.bilRef} onChange={e => s('bilRef', e.target.value)}>
            <option value="">Ingen</option>
            {biler.map(b => <option key={b.id} value={b.reg}>{b.reg} – {b.merke} {b.modell}</option>)}
          </select>
        </div>
        <div className="gap"><div className="fl">Notat</div><textarea rows={2} value={f.notat} onChange={e => s('notat', e.target.value)} /></div>
        {err && <div className="login-err" style={{ marginTop: 10 }}>{err}</div>}
        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={lagre}>Lagre</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── OPPGAVER ────────────────────────────────────────────────────────────────
function OppgaverView({ biler, updateBil, visTost }) {
  const aktive = biler.filter(b => (b.sjekkliste || []).some(s => !s.f));

  const toggle = (bilId, idx) => {
    const bil = biler.find(b => b.id === bilId);
    if (!bil) return;
    const sjekkliste = bil.sjekkliste.map((s, i) => i === idx ? { ...s, f: !s.f } : s);
    updateBil(bilId, { sjekkliste }, 'Oppdatert ✓');
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Oppgavestyring</div>
          <div className="ph-sub">{aktive.length} biler med åpne oppgaver</div>
        </div>
      </div>
      {aktive.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--t4)', padding: 40, fontSize: 13 }}>Alle oppgaver er fullført.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {aktive.map(bil => {
          const list = bil.sjekkliste || [];
          const f = list.filter(s => s.f).length;
          const t = list.length;
          const pst = t ? Math.round(f / t * 100) : 0;
          const hasFrist = bil.frist && bil.frist < IDAG;
          return (
            <div className="card" key={bil.id}>
              <div className="card-h">
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--acc)', letterSpacing: 1 }}>{bil.reg}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{bil.merke} {bil.modell}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <Badge s={bil.status} />
                  {hasFrist && <span className="chip chip-red" style={{ fontSize: 9 }}>Frist passert</span>}
                </div>
              </div>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div className="prog-lbl">{f}/{t} fullført</div>
                  <div className="prog-lbl" style={{ fontWeight: 700, color: pst === 100 ? 'var(--acc)' : 'var(--t3)' }}>{pst}%</div>
                </div>
                <div className="prog-bar" style={{ height: 5, marginBottom: 10 }}>
                  <div className="prog-fill" style={{ width: pst + '%', height: 5 }} />
                </div>
                {list.map((s, i) => (
                  <div className="chk-item" key={i}>
                    <div className={`chk-box${s.f ? ' done' : ''}`} onClick={() => toggle(bil.id, i)}>
                      {s.f && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span className={`chk-txt${s.f ? ' done' : ''}`}>{s.t}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, fontSize: 10, color: 'var(--t4)' }}>
                  Ansvarlig: <strong style={{ color: 'var(--t2)' }}>{bil.ansvarlig}</strong>
                  {' · '}Frist: <strong style={{ color: hasFrist ? 'var(--red)' : 'var(--t2)' }}>{bil.frist || '—'}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── VEGVESEN ────────────────────────────────────────────────────────────────
const SVV_FIELD_GROUPS = [
  ['Identitet', [
    ['regNr', 'Registreringsnummer'],
    ['understell', 'Understellsnummer'],
    ['merke', 'Merke'],
    ['modell', 'Modell'],
    ['typebetegnelse', 'Typebetegnelse'],
    ['variant', 'Variant'],
    ['versjon', 'Versjon'],
    ['arsmodell', 'Årsmodell'],
    ['farge', 'Farge'],
    ['kjoretoyGruppe', 'Kjøretøygruppe'],
    ['kjoretoyType', 'Teknisk kode'],
    ['karosseriType', 'Karosseri']
  ]],
  ['Motor & drivlinje', [
    ['drivstoff', 'Drivstoff'],
    ['girkasse', 'Girkasse'],
    ['hjuldrift', 'Hjuldrift'],
    ['effektKw', 'Effekt (kW)', v => v + ' kW'],
    ['effektHk', 'Effekt (hk)', v => v + ' hk'],
    ['antallGir', 'Antall gir'],
    ['antallSylindre', 'Antall sylindre'],
    ['slagvolum', 'Slagvolum', v => v + ' cm³'],
    ['maksHastighet', 'Maks hastighet', v => v + ' km/t']
  ]],
  ['Dimensjoner & kapasitet', [
    ['sitteplasser', 'Sitteplasser'],
    ['antallDorer', 'Antall dører'],
    ['lengde', 'Lengde', v => v + ' mm'],
    ['bredde', 'Bredde', v => v + ' mm'],
    ['hoyde', 'Høyde', v => v + ' mm'],
    ['antallAksler', 'Antall aksler']
  ]],
  ['Vekter', [
    ['egenvekt', 'Egenvekt', v => v + ' kg'],
    ['tillattTotalvekt', 'Tillatt totalvekt', v => v + ' kg'],
    ['nyttelast', 'Nyttelast', v => v + ' kg'],
    ['vogntogvekt', 'Vogntogvekt', v => v + ' kg']
  ]],
  ['Miljø', [
    ['euroKlasse', 'Euro-klasse'],
    ['co2Utslipp', 'CO₂-utslipp', v => v + ' g/km'],
    ['forbrukBlandet', 'Forbruk blandet', v => v + ' l/100 km']
  ]],
  ['EU-kontroll', [
    ['sisteEuKontroll', 'Siste EU-kontroll'],
    ['nesteEuKontroll', 'Neste EU-kontroll']
  ]],
  ['Registrering', [
    ['registreringsstatus', 'Registreringsstatus'],
    ['forstegangsregNorge', '1. registrering Norge'],
    ['registrertDato', 'Registrert dato']
  ]]
];

function buildSvvSectionsFromVehicle(vehicle) {
  if (!vehicle) return [];
  return SVV_FIELD_GROUPS.map(function (entry) {
    const title = entry[0];
    const fields = entry[1]
      .map(function (def) {
        const key = def[0];
        const label = def[1];
        const fmt = def[2];
        const raw = vehicle[key];
        if (raw === null || raw === undefined || raw === '') return null;
        return { label: label, value: fmt ? fmt(raw) : String(raw) };
      })
      .filter(Boolean);
    return { title: title, fields: fields };
  }).filter(function (section) { return section.fields.length > 0; });
}

function formatNoPlate(regNr) {
  const clean = String(regNr || '').toUpperCase().replace(/\s/g, '');
  const match = clean.match(/^([A-ZÆØÅ]{1,3})(\d{1,5})$/);
  return match ? `${match[1]} ${match[2]}` : clean;
}

function NoPlate({ regNr }) {
  return (
    <div className="svv-plate">
      <div className="svv-plate__band">
        <svg className="svv-plate__flag" viewBox="0 0 22 16" aria-hidden="true">
          <rect width="22" height="16" fill="#BA0C2F" />
          <rect x="6" width="4" height="16" fill="#fff" />
          <rect y="6" width="22" height="4" fill="#fff" />
          <rect x="7" width="2" height="16" fill="#00205B" />
          <rect y="7" width="22" height="2" fill="#00205B" />
        </svg>
        <span className="svv-plate__country">N</span>
      </div>
      <span className="svv-plate__text">{formatNoPlate(regNr)}</span>
    </div>
  );
}

function VegvesenView({ biler, setBiler, visTost, refreshStats, lists, setTab }) {
  const [reg, setReg] = useState('');
  const [laster, setLaster] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [sections, setSections] = useState([]);
  const [rawData, setRawData] = useState(null);
  const [feil, setFeil] = useState('');

  const slaOpp = async () => {
    const regnr = reg.trim().toUpperCase().replace(/\s/g, '');
    if (!regnr || regnr.length < 5) {
      setFeil('Skriv inn et gyldig registreringsnummer.');
      return;
    }
    setLaster(true);
    setFeil('');
    setResultat(null);
    setSections([]);
    setRawData(null);
    try {
      const data = await lookupKjoretoy(regnr);
      setResultat(data.vehicle);
      const apiSections = Array.isArray(data.sections) ? data.sections : [];
      setSections(apiSections.length ? apiSections : buildSvvSectionsFromVehicle(data.vehicle));
      setRawData(data.raw || null);
    } catch (err) {
      setFeil(err.message || 'Oppslag feilet.');
    } finally {
      setLaster(false);
    }
  };

  const leggTilBil = async () => {
    if (!resultat) return;
    const v = resultat;
    const nyBil = {
      reg: v.regNr || reg.toUpperCase(),
      merke: v.merke || 'Ukjent',
      modell: v.modell || 'Ukjent',
      aar: Number(v.arsmodell) || 0,
      km: 0,
      innkjop: 0,
      salg: 0,
      farge: v.farge || 'Ukjent',
      status: lists.bilStatuser[0] || 'Innkjøpt',
      ansvarlig: lists.ansatte[0] || '',
      frist: '',
      notater: [
        'Importert fra Statens vegvesen.',
        v.drivstoff ? `Drivstoff: ${v.drivstoff}.` : '',
        v.euroKlasse ? `Euro: ${v.euroKlasse}.` : '',
        v.hjuldrift ? `Hjuldrift: ${v.hjuldrift}.` : '',
        v.effektHk ? `Effekt: ${v.effektHk} hk.` : ''
      ].filter(Boolean).join(' '),
      euKontroll: v.nesteEuKontroll || '',
      forsikring: '',
      sjekkliste: [
        { t: 'Vasket', f: false },
        { t: 'Fotografert', f: false },
        { t: 'Tilstandsrapport', f: false },
        { t: 'FINN-annonse', f: false }
      ],
      logg: [{ tekst: 'Importert fra Statens vegvesen', dato: new Date().toLocaleString('nb-NO'), av: 'System' }],
      svvData: rawData || v
    };
    try {
      const res = await postBil(nyBil);
      if (res.item) {
        setBiler(p => [res.item, ...p]);
        setTab('biler');
      }
      visTost(`${nyBil.merke} ${nyBil.modell} lagt til i lager ✓`);
      setResultat(null);
      setSections([]);
      setRawData(null);
      setReg('');
      refreshStats();
    } catch {
      visTost('Kunne ikke legge til bil ✗');
    }
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Statens vegvesen — Kjøretøyoppslag</div>
          <div className="ph-sub">Autosys API · Full teknisk kjøretøydata · Inntil 50 000 oppslag/døgn</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><span className="card-ht">Slå opp kjøretøy</span></div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div className="fl">Registreringsnummer</div>
              <input
                value={reg}
                onChange={e => setReg(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && slaOpp()}
                placeholder="F.eks. AB12345"
                style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2 }}
              />
            </div>
            <button type="button" className="btn btn-p" onClick={slaOpp} disabled={laster || !reg}>
              {laster ? <><span className="spin" /> Søker...</> : '🔍 Slå opp'}
            </button>
          </div>
          {feil && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8, background: 'var(--redl)', padding: '8px 12px', borderRadius: 7 }}>
              {feil}
            </div>
          )}
        </div>
      </div>

      {resultat && (
        <div className="card">
          <div className="card-h">
            <span className="card-ht">Kjøretøydata · {sections.reduce(function (n, s) { return n + s.fields.length; }, 0)} felt</span>
            <button type="button" className="btn btn-p btn-sm" onClick={leggTilBil}>+ Legg til i lager</button>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              <NoPlate regNr={resultat.regNr} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>
                  {resultat.merke} {resultat.modell}
                </div>
                <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>
                  {[resultat.arsmodell, resultat.kjoretoyGruppe || resultat.kjoretoyType].filter(Boolean).join(' · ') || 'Kjøretøy funnet'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {resultat.registreringsstatus && (
                  <span className={`chip ${resultat.registreringsstatus === 'Registrert' ? 'chip-green' : 'chip-orange'}`}>
                    {resultat.registreringsstatus}
                  </span>
                )}
                {resultat.farge && (
                  <span className="chip chip-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: svvFarge(resultat.farge), border: '1px solid var(--b2)' }} />
                    {resultat.farge}
                  </span>
                )}
              </div>
            </div>

            {sections.map(section => (
              <div key={section.title} style={{ marginBottom: 24 }}>
                <div className="modal-sec">{section.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                  {section.fields.map(field => (
                    <div className="svv-field" key={section.title + field.label}>
                      <div className="fl">{field.label}</div>
                      <div className="fv">{field.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {biler.some(b => b.svvData) && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 10 }}>
            Biler verifisert via Vegvesen
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {biler.filter(b => b.svvData).map(b => (
              <span key={b.id} className="chip chip-green">{b.reg} – {b.merke} {b.modell}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── INNSTILLINGER ───────────────────────────────────────────────────────────
const EMPTY_MAIL_KONTO = {
  navn: '',
  epost: '',
  fromName: 'X Bilsenter AS',
  signatur: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  imapUser: '',
  imapPass: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  aktiv: true,
  standard: false
};

function MailKontoerSection({ onStatusChange, visTost }) {
  const [kontoer, setKontoer] = useState([]);
  const [form, setForm] = useState(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getMailKontoer();
      setKontoer(data.items || []);
      if (data.status && onStatusChange) onStatusChange(data.status);
    } catch {
      visTost('Kunne ikke laste mailkontoer ✗');
    } finally {
      setLoading(false);
    }
  }, [onStatusChange, visTost]);

  useEffect(function () { load(); }, [load]);

  const s = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const startNy = () => setForm({ ...EMPTY_MAIL_KONTO, standard: kontoer.length === 0 });

  const startEdit = (k) => setForm({
    id: k.id,
    navn: k.navn,
    epost: k.epost,
    fromName: k.fromName,
    signatur: k.signatur || '',
    imapHost: k.imapHost,
    imapPort: k.imapPort,
    imapSecure: k.imapSecure,
    imapUser: k.imapUser,
    imapPass: k.imapPass || '••••••••',
    smtpHost: k.smtpHost,
    smtpPort: k.smtpPort,
    smtpSecure: k.smtpSecure,
    smtpUser: k.smtpUser,
    smtpPass: k.smtpPass || '••••••••',
    aktiv: k.aktiv,
    standard: k.standard
  });

  const lagre = async () => {
    if (!form?.navn?.trim() || !form?.epost?.trim()) {
      visTost('Navn og e-post er påkrevd ✗');
      return;
    }
    try {
      const payload = { ...form };
      delete payload.id;
      if (payload.imapPass === '••••••••') delete payload.imapPass;
      if (payload.smtpPass === '••••••••') delete payload.smtpPass;

      const wasEdit = !!form.id;
      const res = wasEdit
        ? await patchMailKonto(form.id, payload)
        : await postMailKonto(payload);

      setForm(null);
      await load();
      visTost(wasEdit ? 'Mailkonto oppdatert ✓' : 'Mailkonto lagt til ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre mailkonto ✗');
    }
  };

  const slett = async (id) => {
    if (!window.confirm('Slette denne mailkontoen?')) return;
    try {
      const res = await deleteMailKonto(id);
      if (form?.id === id) setForm(null);
      await load();
      visTost('Mailkonto slettet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette ✗');
    }
  };

  const test = async (id) => {
    setTesting(true);
    try {
      const res = await testMailKonto(id);
      const parts = [];
      if (res.result?.imap) parts.push(`IMAP: ${res.result.imap}`);
      if (res.result?.smtp) parts.push(`SMTP: ${res.result.smtp}`);
      visTost(parts.join(' · ') || 'Test fullført ✓');
    } catch (err) {
      visTost(err.message || 'Tilkobling feilet ✗');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-h">
        <span className="card-ht">E-postkontoer</span>
        <button type="button" className="btn btn-p btn-sm" onClick={startNy}>+ Ny konto</button>
      </div>
      <div style={{ padding: 16 }}>
        <p className="settings-desc">
          Legg til flere mailkontoer (f.eks. post@, salg@, verksted@). Hver konto har eget IMAP/SMTP-oppsett.
          Passord lagres i databasen på serveren.
        </p>

        {loading && <div className="inbox-empty">Laster mailkontoer…</div>}
        {!loading && kontoer.length === 0 && !form && (
          <div className="inbox-empty">Ingen mailkontoer ennå. Klikk «Ny konto» for å komme i gang.</div>
        )}

        {!loading && kontoer.length > 0 && (
          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr><th>Navn</th><th>E-post</th><th>Status</th><th>Sist synk</th><th></th></tr>
            </thead>
            <tbody>
              {kontoer.map(function (k) {
                return (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 700, fontSize: 12 }}>
                      {k.navn}{k.standard ? ' ★' : ''}
                    </td>
                    <td style={{ fontSize: 11 }}>{k.epost}</td>
                    <td style={{ fontSize: 10 }}>
                      {!k.aktiv && <span className="chip chip-red">Deaktivert</span>}
                      {k.aktiv && k.imapConfigured && k.smtpConfigured && <span className="chip chip-green">Klar</span>}
                      {k.aktiv && (!k.imapConfigured || !k.smtpConfigured) && <span className="chip chip-orange">Ufullstendig</span>}
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--t4)' }}>{k.lastSync ? k.lastSync.replace('T', ' ').slice(0, 16) : '—'}</td>
                    <td>
                      <div className="row-act">
                        <button type="button" className="btn btn-g btn-xs" onClick={() => startEdit(k)}>Rediger</button>
                        <button type="button" className="btn btn-g btn-xs" onClick={() => test(k.id)} disabled={testing}>Test</button>
                        <button type="button" className="btn btn-g btn-xs" onClick={() => slett(k.id)}>Slett</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {form && (
          <div className="mail-konto-form">
            <div className="modal-sec">Grunninfo</div>
            <div className="form-row gap">
              <div><div className="fl">Navn</div><input value={form.navn} onChange={e => s('navn', e.target.value)} placeholder="Hovedkonto" /></div>
              <div><div className="fl">E-postadresse</div><input value={form.epost} onChange={e => s('epost', e.target.value)} placeholder="post@xbilsenter.no" /></div>
            </div>
            <div className="gap"><div className="fl">Avsendernavn</div><input value={form.fromName} onChange={e => s('fromName', e.target.value)} /></div>
            <div className="gap">
              <div className="fl">E-postsignatur</div>
              <SignatureEditor
                value={form.signatur}
                onChange={v => s('signatur', v)}
                accountName={form.fromName}
                accountEmail={form.epost}
              />
              <p className="settings-desc" style={{ marginTop: 6 }}>
                Rik HTML-signatur med logo, lenker og farger. Legges automatisk til på utgående e-post fra denne kontoen.
              </p>
            </div>

            <div className="modal-sec">IMAP (innboks)</div>
            <div className="form-row gap">
              <div><div className="fl">Server</div><input value={form.imapHost} onChange={e => s('imapHost', e.target.value)} placeholder="imap.domeneshop.no" /></div>
              <div><div className="fl">Port</div><input type="number" value={form.imapPort} onChange={e => s('imapPort', Number(e.target.value))} /></div>
            </div>
            <div className="form-row gap">
              <div><div className="fl">Bruker</div><input value={form.imapUser} onChange={e => s('imapUser', e.target.value)} /></div>
              <div><div className="fl">Passord</div><input type="password" value={form.imapPass} onChange={e => s('imapPass', e.target.value)} placeholder="App-passord" /></div>
            </div>
            <label className="mail-check"><input type="checkbox" checked={form.imapSecure} onChange={e => s('imapSecure', e.target.checked)} /> SSL/TLS (IMAP)</label>

            <div className="modal-sec">SMTP (utgående)</div>
            <div className="form-row gap">
              <div><div className="fl">Server</div><input value={form.smtpHost} onChange={e => s('smtpHost', e.target.value)} placeholder="send.one.com" /></div>
              <div><div className="fl">Port</div><input type="number" value={form.smtpPort} onChange={e => s('smtpPort', Number(e.target.value))} /></div>
              <div className="compose-field-hint" style={{ gridColumn: '1 / -1' }}>One.com: 465 (SSL) eller 587 (STARTTLS)</div>
            </div>
            <div className="form-row gap">
              <div><div className="fl">Bruker</div><input value={form.smtpUser} onChange={e => s('smtpUser', e.target.value)} /></div>
              <div><div className="fl">Passord</div><input type="password" value={form.smtpPass} onChange={e => s('smtpPass', e.target.value)} placeholder="App-passord" /></div>
            </div>
            <label className="mail-check"><input type="checkbox" checked={form.smtpSecure} onChange={e => s('smtpSecure', e.target.checked)} /> SSL/TLS (SMTP)</label>

            <div className="form-row gap" style={{ marginTop: 12 }}>
              <label className="mail-check"><input type="checkbox" checked={form.aktiv} onChange={e => s('aktiv', e.target.checked)} /> Aktiv</label>
              <label className="mail-check"><input type="checkbox" checked={form.standard} onChange={e => s('standard', e.target.checked)} /> Standardkonto for utsending</label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn-p btn-sm" onClick={lagre}>Lagre konto</button>
              <button type="button" className="btn btn-g btn-sm" onClick={() => setForm(null)}>Avbryt</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_EPOST_MAL = { navn: '', emne: '', html: '' };

function EpostMalerSection({ visTost }) {
  const [maler, setMaler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getEpostMaler();
      setMaler(res.items || []);
    } catch {
      visTost('Kunne ikke laste e-postmaler ✗');
    } finally {
      setLoading(false);
    }
  }, [visTost]);

  useEffect(function () { load(); }, [load]);

  const startNy = () => setForm({ ...EMPTY_EPOST_MAL });
  const startEdit = (mal) => setForm({
    id: mal.id,
    navn: mal.navn,
    emne: mal.emne || '',
    html: mal.html || ''
  });

  const save = async () => {
    if (!form?.navn?.trim()) {
      visTost('Malnavn er påkrevd ✗');
      return;
    }
    setSaving(true);
    try {
      const body = {
        navn: form.navn.trim(),
        emne: form.emne.trim(),
        html: form.html
      };
      const res = form.id
        ? await patchEpostMal(form.id, body)
        : await postEpostMal(body);
      if (res.item) {
        setMaler(function (prev) {
          if (form.id) {
            return prev.map(function (m) { return m.id === res.item.id ? res.item : m; });
          }
          return [...prev, res.item].sort(function (a, b) {
            return a.navn.localeCompare(b.navn, 'nb');
          });
        });
      } else {
        await load();
      }
      visTost(form.id ? 'Mal oppdatert ✓' : 'Mal opprettet ✓');
      setForm(null);
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre mal ✗');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Slette denne malen?')) return;
    try {
      await deleteEpostMal(id);
      setMaler(function (prev) { return prev.filter(function (m) { return m.id !== id; }); });
      if (form?.id === id) setForm(null);
      visTost('Mal slettet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette mal ✗');
    }
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="inbox-list-hd">
        <div>
          <span className="card-ht">E-postmaler</span>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>
            Faste tekster du kan sette inn ved «Ny e-post» og «Svar».
          </div>
        </div>
        {!form && (
          <button type="button" className="btn btn-p btn-sm" onClick={startNy}>+ Ny mal</button>
        )}
      </div>
      <div style={{ padding: 16 }}>
        {loading && <div className="inbox-empty">Laster maler…</div>}
        {!loading && !maler.length && !form && (
          <div className="inbox-empty">Ingen maler ennå. Opprett maler for ofte brukte svar og tilbud.</div>
        )}
        {!loading && maler.length > 0 && !form && (
          <div className="epost-maler-list">
            {maler.map(function (mal) {
              return (
                <div key={mal.id} className="epost-mal-item">
                  <div className="epost-mal-item__main">
                    <div className="epost-mal-item__name">{mal.navn}</div>
                    {mal.emne && <div className="epost-mal-item__meta">Emne: {mal.emne}</div>}
                    {mal.snippet && <div className="epost-mal-item__snippet">{mal.snippet}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => startEdit(mal)}>Rediger</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => remove(mal.id)}>Slett</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {form && (
          <div className="mail-konto-form">
            <div className="form-row gap">
              <div>
                <div className="fl">Malnavn</div>
                <input value={form.navn} onChange={e => setForm({ ...form, navn: e.target.value })} placeholder="F.eks. Tilbud sendt" />
              </div>
              <div>
                <div className="fl">Standard emne (valgfritt)</div>
                <input value={form.emne} onChange={e => setForm({ ...form, emne: e.target.value })} placeholder="Fylles inn hvis emne er tomt" />
              </div>
            </div>
            <div className="compose-field" style={{ marginTop: 12 }}>
              <div className="fl">Maltekst</div>
              <MailComposer
                value={form.html}
                onChange={html => setForm({ ...form, html })}
                placeholder="Skriv malen med formatering, lister, lenker…"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-p btn-sm" onClick={save} disabled={saving}>
                {saving ? 'Lagrer…' : (form.id ? 'Lagre endringer' : 'Opprett mal')}
              </button>
              <button type="button" className="btn btn-g btn-sm" onClick={() => setForm(null)}>Avbryt</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_BRUKER = {
  username: '',
  name: '',
  email: '',
  password: '',
  role: 'Selger',
  permissions: [],
  aktiv: true,
  isAdmin: false
};

function BrukereSection({ currentUser, visTost }) {
  const [brukere, setBrukere] = useState([]);
  const [meta, setMeta] = useState({ permissions: [], roleTemplates: {} });
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [brukereRes, metaRes] = await Promise.all([getBrukere(), getBrukereMeta()]);
      setBrukere(brukereRes.items || []);
      setMeta({
        permissions: metaRes.permissions || [],
        roleTemplates: metaRes.roleTemplates || {}
      });
    } catch {
      visTost('Kunne ikke laste brukere ✗');
    } finally {
      setLoading(false);
    }
  }, [visTost]);

  useEffect(function () { load(); }, [load]);

  const applyRoleTemplate = (role) => {
    const perms = meta.roleTemplates[role] || [];
    setForm(function (prev) {
      if (!prev) return prev;
      return { ...prev, role, permissions: [...perms] };
    });
  };

  const togglePermission = (permId) => {
    setForm(function (prev) {
      if (!prev) return prev;
      const has = prev.permissions.includes(permId);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter(function (p) { return p !== permId; })
          : [...prev.permissions, permId]
      };
    });
  };

  const startNy = () => {
    const role = 'Selger';
    setForm({
      ...EMPTY_BRUKER,
      role,
      permissions: [...(meta.roleTemplates[role] || [])]
    });
  };

  const startEdit = (b) => setForm({
    id: b.id,
    username: b.username,
    name: b.name,
    email: b.email || '',
    password: '',
    role: b.role,
    permissions: [...(b.permissions || [])],
    aktiv: b.aktiv,
    isAdmin: !!b.isAdmin
  });

  const lagre = async () => {
    if (!form?.username?.trim() || !form?.name?.trim()) {
      visTost('Brukernavn og navn er påkrevd ✗');
      return;
    }
    if (!form.id && !form.password?.trim()) {
      visTost('Passord er påkrevd for nye brukere ✗');
      return;
    }

    setSaving(true);
    try {
      const body = {
        username: form.username.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        permissions: form.permissions,
        aktiv: form.aktiv,
        isAdmin: form.isAdmin
      };
      if (form.password?.trim()) body.password = form.password.trim();

      const res = form.id
        ? await patchBruker(form.id, body)
        : await postBruker(body);

      if (res.item) {
        setBrukere(function (prev) {
          if (form.id) {
            return prev.map(function (b) { return b.id === res.item.id ? res.item : b; });
          }
          return [...prev, res.item].sort(function (a, b) {
            return a.name.localeCompare(b.name, 'nb');
          });
        });
      } else {
        await load();
      }
      visTost(form.id ? 'Bruker oppdatert ✓' : 'Bruker opprettet ✓');
      setForm(null);
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre bruker ✗');
    } finally {
      setSaving(false);
    }
  };

  const slett = async (id) => {
    if (!window.confirm('Slette denne brukeren? Tilgangen fjernes permanent.')) return;
    try {
      await deleteBruker(id);
      setBrukere(function (prev) { return prev.filter(function (b) { return b.id !== id; }); });
      if (form?.id === id) setForm(null);
      visTost('Bruker slettet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette bruker ✗');
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-h">
        <div>
          <span className="card-ht">Brukere og tilgang</span>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>
            Opprett brukere, velg rolle og styr hva de har tilgang til i CRM-et.
          </div>
        </div>
        {!form && (
          <button type="button" className="btn btn-p btn-sm" onClick={startNy}>+ Ny bruker</button>
        )}
      </div>
      <div style={{ padding: 16 }}>
        {loading && <div className="inbox-empty">Laster brukere…</div>}

        {!loading && brukere.length > 0 && !form && (
          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr><th>Navn</th><th>Brukernavn</th><th>Rolle</th><th>Tilganger</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {brukere.map(function (b) {
                return (
                  <tr key={b.id}>
                    <td><strong>{b.name}</strong>{b.isAdmin ? ' · Admin' : ''}</td>
                    <td>{b.username}</td>
                    <td>{b.role}</td>
                    <td>{(b.permissions || []).length} moduler</td>
                    <td>{b.aktiv ? 'Aktiv' : 'Deaktivert'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-g btn-sm" onClick={() => startEdit(b)}>Rediger</button>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-g btn-sm"
                        onClick={() => slett(b.id)}
                        disabled={b.id === currentUser?.id}
                      >
                        Slett
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && brukere.length === 0 && !form && (
          <div className="inbox-empty">Ingen brukere funnet.</div>
        )}

        {form && (
          <div className="mail-konto-form">
            <div className="form-row gap">
              <div>
                <div className="fl">Navn</div>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="F.eks. Sara Nordmann" />
              </div>
              <div>
                <div className="fl">Brukernavn</div>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="f.eks. sara" autoComplete="off" />
              </div>
            </div>
            <div className="form-row gap" style={{ marginTop: 12 }}>
              <div>
                <div className="fl">E-post (valgfritt)</div>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="sara@xbilsenter.no" />
              </div>
              <div>
                <div className="fl">{form.id ? 'Nytt passord (valgfritt)' : 'Passord'}</div>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              </div>
            </div>
            <div className="form-row gap" style={{ marginTop: 12 }}>
              <div>
                <div className="fl">Rolle</div>
                <select
                  value={form.role}
                  onChange={e => applyRoleTemplate(e.target.value)}
                >
                  {Object.keys(meta.roleTemplates).map(function (role) {
                    return <option key={role} value={role}>{role}</option>;
                  })}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, paddingBottom: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <input type="checkbox" checked={form.aktiv} onChange={e => setForm({ ...form, aktiv: e.target.checked })} />
                  Aktiv bruker
                </label>
                {currentUser?.isAdmin && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <input type="checkbox" checked={form.isAdmin} onChange={e => setForm({ ...form, isAdmin: e.target.checked })} />
                    Administrator
                  </label>
                )}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="fl">Tilgang til moduler</div>
              <div className="bruker-perm-grid">
                {meta.permissions.map(function (perm) {
                  return (
                    <label key={perm.id} className="bruker-perm-item">
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(perm.id)}
                        onChange={() => togglePermission(perm.id)}
                      />
                      <span>{perm.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-p btn-sm" onClick={lagre} disabled={saving}>
                {saving ? 'Lagrer…' : (form.id ? 'Lagre endringer' : 'Opprett bruker')}
              </button>
              <button type="button" className="btn btn-g btn-sm" onClick={() => setForm(null)}>Avbryt</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModulOppsettSection({ modulOppsett, onChange, onSave, visTost }) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(modulOppsett || DEFAULT_MODUL_OPPSATT);

  useEffect(function () {
    if (!editMode) setDraft(normalizeModulOppsett(modulOppsett));
  }, [modulOppsett, editMode]);

  const flytt = (idx, dir) => {
    setDraft(function (prev) {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const settNavn = (idx, label) => {
    setDraft(function (prev) {
      return prev.map(function (item, i) {
        return i === idx ? { ...item, label } : item;
      });
    });
  };

  const reset = () => {
    setDraft(DEFAULT_MODUL_OPPSATT.map(function (item) { return { ...item }; }));
  };

  const lagre = async () => {
    const normalized = normalizeModulOppsett(draft);
    setSaving(true);
    try {
      await onSave(normalized);
      onChange(normalized);
      visTost('Moduler lagret ✓');
      setEditMode(false);
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre moduler ✗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-h">
        <div>
          <span className="card-ht">Moduler i menyen</span>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>
            Endre rekkefølge og navn på modulene i venstremenyen.
          </div>
        </div>
        {!editMode ? (
          <button type="button" className="btn btn-g btn-sm" onClick={() => setEditMode(true)}>
            Rediger moduler
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-g btn-sm" onClick={reset}>Tilbakestill</button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setEditMode(false)}>Avbryt</button>
            <button type="button" className="btn btn-p btn-sm" onClick={lagre} disabled={saving}>
              {saving ? 'Lagrer…' : 'Lagre moduler'}
            </button>
          </div>
        )}
      </div>
      <div style={{ padding: 16 }}>
        {!editMode && (
          <div className="modul-oppsett-preview">
            {normalizeModulOppsett(modulOppsett).map(function (mod) {
              return (
                <div key={mod.id} className="modul-oppsett-preview__item">
                  <span className="modul-oppsett-preview__ic">{MODUL_ICONS[mod.id]}</span>
                  <span>{mod.label}</span>
                </div>
              );
            })}
          </div>
        )}
        {editMode && (
          <div className="modul-oppsett-edit">
            {draft.map(function (mod, idx) {
              return (
                <div key={mod.id} className="modul-oppsett-edit__row">
                  <span className="modul-oppsett-edit__ic">{MODUL_ICONS[mod.id]}</span>
                  <input
                    value={mod.label}
                    onChange={e => settNavn(idx, e.target.value)}
                    placeholder="Modulnavn"
                  />
                  <div className="modul-oppsett-edit__actions">
                    <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, -1)} disabled={idx === 0}>↑</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, 1)} disabled={idx === draft.length - 1}>↓</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ListEditor({ title, desc, items, onChange, placeholder }) {
  const [ny, setNy] = useState('');

  const leggTil = () => {
    const v = ny.trim();
    if (!v || items.some(item => item.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setNy('');
  };

  const fjern = (idx) => onChange(items.filter((_, i) => i !== idx));

  const flytt = (idx, dir) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div className="card settings-card">
      <div className="card-h"><span className="card-ht">{title}</span></div>
      <div style={{ padding: 16 }}>
        {desc && <p className="settings-desc">{desc}</p>}
        <div className="settings-list">
          {items.map((item, idx) => (
            <div className="settings-item" key={item + idx}>
              <span className="settings-item__label">{item}</span>
              <div className="settings-item__actions">
                <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, -1)} disabled={idx === 0}>↑</button>
                <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, 1)} disabled={idx === items.length - 1}>↓</button>
                <button type="button" className="btn btn-g btn-sm" onClick={() => fjern(idx)} disabled={items.length <= 1}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <div className="settings-add">
          <input
            value={ny}
            onChange={e => setNy(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && leggTil()}
            placeholder={placeholder || 'Legg til...'}
          />
          <button type="button" className="btn btn-g btn-sm" onClick={leggTil}>+ Legg til</button>
        </div>
      </div>
    </div>
  );
}

function InnstillingerView({ settings, currentUser, onSave, onModulOppsettChange, onStatusChange, visTost }) {
  const [draft, setDraft] = useState(settings);

  useEffect(function () {
    setDraft(settings);
  }, [settings]);

  const setList = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  const showBrukere = canAccess(currentUser, 'brukere');
  const showInnstillinger = canAccess(currentUser, 'innstillinger');

  const lagreModulOppsett = async (modulOppsett) => {
    const res = await patchInnstillinger({ modulOppsett });
    if (res.settings) {
      setDraft(function (prev) { return { ...prev, modulOppsett: res.settings.modulOppsett }; });
    }
    return res;
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Innstillinger</div>
          <div className="ph-sub">Brukere, moduler, mailkontoer, ansvarlige, merker og statuser</div>
        </div>
        {showInnstillinger && (
          <button type="button" className="btn btn-p" onClick={() => onSave(draft)}>Lagre lister</button>
        )}
      </div>

      {showBrukere && (
        <BrukereSection currentUser={currentUser} visTost={visTost} />
      )}

      {showInnstillinger && (
        <>
          <ModulOppsettSection
            modulOppsett={draft.modulOppsett}
            onChange={onModulOppsettChange}
            onSave={lagreModulOppsett}
            visTost={visTost}
          />
          <MailKontoerSection onStatusChange={onStatusChange} visTost={visTost} />
          <EpostMalerSection visTost={visTost} />
          <div className="settings-grid">
        <ListEditor
          title="Ansvarlige"
          desc="Vises i nedtrekkslister for biler, henvendelser, innbytte og kalender."
          items={draft.ansatte}
          onChange={v => setList('ansatte', v)}
          placeholder="Navn på ansatt"
        />
        <ListEditor
          title="Bilmerker"
          desc="Brukes ved registrering og filtrering av biler."
          items={draft.merker}
          onChange={v => setList('merker', v)}
          placeholder="F.eks. Porsche"
        />
        <ListEditor
          title="Bilstatuser"
          desc="Kolonner i lager-kanban og status på biler."
          items={draft.bilStatuser}
          onChange={v => setList('bilStatuser', v)}
          placeholder="F.eks. Klargjøring"
        />
        <ListEditor
          title="Henvendelsesstatuser"
          items={draft.henvStatuser}
          onChange={v => setList('henvStatuser', v)}
          placeholder="F.eks. Oppfølging"
        />
        <ListEditor
          title="Innbytte-statuser"
          items={draft.innbytteStatuser}
          onChange={v => setList('innbytteStatuser', v)}
          placeholder="F.eks. Vurderes"
        />
        <ListEditor
          title="Kalendertyper"
          items={draft.kalTyper}
          onChange={v => setList('kalTyper', v)}
          placeholder="F.eks. Møte"
        />
          </div>
        </>
      )}
    </>
  );
}
