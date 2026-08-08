import { useCallback, useEffect, useMemo, useState } from 'react';
import { lookupKjoretoy, lookupOmregistreringsavgift, postInnkjopskalkyle, patchInnkjopskalkyle, deleteInnkjopskalkyle } from '../api.js';
import { AUKSJON_PLATTFORMER, calcInnkjopspris, formatSvvFargeNavn } from '../constants.js';
import {
  buildKalkyleFinnSok,
  canKalkyleFinnMarkedsSok,
  FINN_KM_SLACK_KALKYLE,
  finnMarkedsSokFilterText,
  finnMarkedsSokLabel,
  openFinnMarkedsSok
} from '../finnMarkedssok.js';

function nok(v) {
  return `kr ${Number(v || 0).toLocaleString('nb-NO')}`;
}

function parseKr(value) {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function calcAvanseFromUtsalgspris(utsalgspris) {
  const pris = parseKr(utsalgspris);
  if (pris <= 0) return '';
  const raw = Math.max(pris * 0.12, 50000);
  const avanse = Math.ceil(raw / 10000) * 10000;
  return String(avanse);
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('nb-NO', {
    timeZone: 'Europe/Oslo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function lastEditedLabel(item) {
  if (!item) return null;
  const name = item.updatedByName || item.createdByName;
  const date = item.updatedAt || item.createdAt;
  if (!name && !date) return null;
  const parts = [];
  if (name) parts.push(name);
  if (date) parts.push(fmtDateTime(date));
  return parts.join(' · ');
}

function normalizeReg(reg) {
  return String(reg || '').trim().toUpperCase().replace(/\s/g, '');
}

function buildModellFromAutosys(v) {
  return [v?.merke, v?.modell, v?.arsmodell].filter(Boolean).join(' ');
}

function formatDrivstoff(v) {
  if (!v) return '—';
  const base = v.drivstoff || '—';
  if (v.hybridKategori && !/hybrid|el|elektr/i.test(base)) {
    return `${base} · ${v.hybridKategori}`;
  }
  return base;
}

function formatMotoreffekt(data) {
  const motorer = Array.isArray(data?.motorer) ? data.motorer.filter(Boolean) : [];
  if (motorer.length > 1) {
    return motorer.map(function (m) {
      const eff = m.effektHk ? `${m.effektHk} hk` : (m.effektKw ? `${m.effektKw} kW` : '—');
      return `Motor ${m.nr}: ${eff}`;
    }).join(' · ');
  }
  if (motorer.length === 1) {
    const m = motorer[0];
    if (m.effektHk) return `${m.effektHk} hk${m.effektKw ? ` (${m.effektKw} kW)` : ''}`;
    if (m.effektKw) return `${m.effektKw} kW`;
  }
  if (data?.effektHk) return `${data.effektHk} hk${data.effektKw ? ` (${data.effektKw} kW)` : ''}`;
  if (data?.effektKw) return `${data.effektKw} kW`;
  return null;
}

function formatRekkevidde(data) {
  if (!data) return null;
  const parts = [];
  if (data.rekkeviddeKmBlandet) parts.push(`${data.rekkeviddeKmBlandet} km (WLTP blandet)`);
  else if (data.rekkeviddeKm) parts.push(`${data.rekkeviddeKm} km`);
  else if (data.rekkeviddeKmNedc) parts.push(`${data.rekkeviddeKmNedc} km (NEDC)`);
  if (data.rekkeviddeKmBy) parts.push(`${data.rekkeviddeKmBy} km (WLTP by)`);
  return parts.length ? parts.join(' · ') : null;
}

function buildAutosysRows(data) {
  const rows = [
    ['Merke / modell', buildModellFromAutosys(data) || '—'],
    ['Drivstoff', formatDrivstoff(data)],
    ['Girkasse', data.girkasse || '—'],
    ['Aksler med drift', data.hjuldrift || '—']
  ];

  if (data.sitteplasser != null && data.sitteplasser !== '') {
    rows.push(['Antall seter', String(data.sitteplasser)]);
  }
  if (data.antallMotorer) {
    rows.push(['Antall motorer', String(data.antallMotorer)]);
  }

  const effekt = formatMotoreffekt(data);
  if (effekt) {
    rows.push([data.antallMotorer > 1 ? 'Effekt per motor' : 'Effekt', effekt]);
  }

  const rekkevidde = formatRekkevidde(data);
  if (rekkevidde) {
    rows.push(['Rekkevidde', rekkevidde]);
  }

  rows.push(
    ['Førstegangsregistrert', data.forstegangsregistrert || '—'],
    ['1. reg. Norge', data.forstegangsregNorge || '—'],
    ['Bruktimport', data.bruktimport || '—'],
    ['Neste EU-kontroll', data.nesteEuKontroll || '—'],
    ['Siste EU-kontroll', data.sisteEuKontroll || '—'],
    ['Farge', formatSvvFargeNavn(data.farge) || '—'],
    ['Karosseri', data.karosseriType || '—'],
    ['Registreringsstatus', data.registreringsstatus || '—']
  );

  return rows;
}

const EMPTY_FORM = {
  auksjon: '',
  auksjonsslutt: '',
  partinummer: '',
  regnr: '',
  kmstand: '',
  modell: '',
  utsalgspris: '',
  pakost: '',
  aukGebyr: '',
  garantikost: '3000',
  omregAvgift: '',
  avanse: '',
  kommentarer: '',
  autosysData: null
};

function formFromItem(item) {
  if (!item) return { ...EMPTY_FORM };
  return {
    auksjon: item.auksjon || '',
    auksjonsslutt: item.auksjonsslutt ? String(item.auksjonsslutt).slice(0, 16) : '',
    partinummer: item.partinummer || '',
    regnr: item.regnr || '',
    kmstand: item.kmstand ? String(item.kmstand) : '',
    modell: item.modell || '',
    utsalgspris: item.utsalgspris ? String(item.utsalgspris) : '',
    pakost: item.pakost ? String(item.pakost) : '',
    aukGebyr: item.aukGebyr ? String(item.aukGebyr) : '',
    garantikost: item.garantikost != null && item.garantikost !== '' ? String(item.garantikost) : '3000',
    omregAvgift: item.omregAvgift ? String(item.omregAvgift) : '',
    avanse: item.avanse != null && item.avanse !== '' ? String(item.avanse) : '',
    kommentarer: item.kommentarer || '',
    autosysData: item.autosysData || null
  };
}

function formToPayload(form) {
  return {
    auksjon: form.auksjon,
    auksjonsslutt: form.auksjonsslutt || null,
    partinummer: form.partinummer,
    regnr: normalizeReg(form.regnr),
    kmstand: parseKr(form.kmstand),
    modell: form.modell,
    utsalgspris: parseKr(form.utsalgspris),
    pakost: parseKr(form.pakost),
    aukGebyr: parseKr(form.aukGebyr),
    garantikost: parseKr(form.garantikost),
    omregAvgift: parseKr(form.omregAvgift),
    avanse: parseKr(form.avanse),
    kommentarer: form.kommentarer,
    autosysData: form.autosysData || null
  };
}

function AutosysInfoPanel({ data, loading, error, onRefresh }) {
  if (loading) {
    return (
      <div className="kalkyle-autosys">
        <div className="kalkyle-autosys-hd">Autosys · Statens vegvesen</div>
        <div className="kalkyle-autosys-empty">Henter kjøretøydata…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kalkyle-autosys kalkyle-autosys--error">
        <div className="kalkyle-autosys-hd">Autosys · Statens vegvesen</div>
        <div className="kalkyle-autosys-empty">{error}</div>
        {onRefresh && (
          <button type="button" className="btn btn-g btn-xs" onClick={onRefresh}>Prøv igjen</button>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="kalkyle-autosys">
        <div className="kalkyle-autosys-hd">Autosys · Statens vegvesen</div>
        <div className="kalkyle-autosys-empty">
          Skriv reg.nr. og klikk «Hent Autosys» for teknisk info om bilen.
        </div>
      </div>
    );
  }

  const rows = buildAutosysRows(data);

  return (
    <div className="kalkyle-autosys">
      <div className="kalkyle-autosys-hd">
        <span>Autosys · Statens vegvesen</span>
        {onRefresh && (
          <button type="button" className="btn btn-g btn-xs" onClick={onRefresh}>Oppdater</button>
        )}
      </div>
      <div className="kalkyle-autosys-title">
        {data.regNr || '—'}
        {data.registreringsstatus ? (
          <span className={`chip ${data.registreringsstatus === 'Registrert' ? 'chip-green' : 'chip-orange'}`}>
            {data.registreringsstatus}
          </span>
        ) : null}
      </div>
      <div className="kalkyle-autosys-grid">
        {rows.map(function (row) {
          return (
            <div key={row[0]} className="kalkyle-autosys-row">
              <span>{row[0]}</span>
              <strong>{row[1]}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KrField({ label, value, onChange, highlight, hint }) {
  return (
    <label className="kalkyle-field">
      <span className={`kalkyle-label${highlight ? ' kalkyle-label--green' : ''}`}>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={highlight ? 'kalkyle-input kalkyle-input--green' : 'kalkyle-input'}
      />
      {hint && <span className="kalkyle-hint">{hint}</span>}
    </label>
  );
}

function KalkyleForm({ form, setForm, onSave, onDelete, onReset, saving, editMode, createdByName, createdAt, visTost }) {
  const [autosysLoading, setAutosysLoading] = useState(false);
  const [autosysError, setAutosysError] = useState('');
  const [omregHint, setOmregHint] = useState('');
  const [omregError, setOmregError] = useState('');
  const [avanseOverstyrt, setAvanseOverstyrt] = useState(false);
  const [finnSokLaster, setFinnSokLaster] = useState(false);

  const finnSok = buildKalkyleFinnSok(form);
  const finnKlar = canKalkyleFinnMarkedsSok(form);
  const finnFilterText = finnKlar ? finnMarkedsSokFilterText(finnSok, FINN_KM_SLACK_KALKYLE) : '';

  useEffect(function () {
    setAvanseOverstyrt(editMode);
  }, [editMode]);

  const numbers = useMemo(function () {
    return formToPayload(form);
  }, [form]);

  const innkjopspris = calcInnkjopspris(numbers);
  const sumKostnader = numbers.pakost + numbers.aukGebyr + numbers.garantikost + numbers.omregAvgift + numbers.avanse;

  const hentAutosys = useCallback(async function () {
    const reg = normalizeReg(form.regnr);
    if (reg.length < 5) {
      visTost('Skriv et gyldig registreringsnummer ✗');
      return;
    }
    setAutosysLoading(true);
    setAutosysError('');
    setOmregError('');
    setOmregHint('');

    const autosysPromise = lookupKjoretoy(reg).catch(function (err) {
      return { error: err };
    });
    const omregPromise = lookupOmregistreringsavgift(reg).catch(function (err) {
      return { error: err };
    });

    try {
      const [autosysResult, omregResult] = await Promise.all([autosysPromise, omregPromise]);

      if (autosysResult.error) {
        throw autosysResult.error;
      }

      const vehicle = autosysResult.vehicle;
      if (!vehicle) throw new Error('Fant ingen kjøretøydata.');

      let omregAvgift = form.omregAvgift;
      if (omregResult.error) {
        const code = omregResult.error.code || '';
        if (code !== 'MISSING_CONFIG') {
          setOmregError(omregResult.error.message || 'Kunne ikke hente omregistreringsavgift.');
        }
      } else if (Number.isFinite(Number(omregResult.omregistreringsavgift))) {
        omregAvgift = String(omregResult.omregistreringsavgift);
        const dato = omregResult.datoOmregistreringsavgift;
        setOmregHint(dato
          ? `Hentet fra Skatteetaten · gjelder ${dato}`
          : 'Hentet fra Skatteetaten');
      }

      setForm(function (prev) {
        const modell = buildModellFromAutosys(vehicle);
        return {
          ...prev,
          regnr: vehicle.regNr || reg,
          modell: modell || prev.modell,
          omregAvgift,
          autosysData: vehicle
        };
      });

      if (omregResult.error?.code === 'MISSING_CONFIG') {
        visTost('Autosys-data hentet ✓');
      } else if (omregResult.error) {
        visTost('Autosys hentet, men omreg.avgift feilet ✗');
      } else {
        visTost('Autosys og omreg.avgift hentet ✓');
      }
    } catch (err) {
      const message = err.message || 'Autosys-oppslag feilet.';
      setAutosysError(message);
      setForm(function (prev) { return { ...prev, autosysData: null }; });
      visTost(message + ' ✗');
    } finally {
      setAutosysLoading(false);
    }
  }, [form.regnr, form.omregAvgift, setForm, visTost]);

  const handleUtsalgsprisChange = function (value) {
    setForm(function (prev) {
      const next = { ...prev, utsalgspris: value };
      if (!avanseOverstyrt) {
        next.avanse = calcAvanseFromUtsalgspris(value);
      }
      return next;
    });
  };

  const handleAvanseChange = function (value) {
    setAvanseOverstyrt(true);
    setForm(function (prev) { return { ...prev, avanse: value }; });
  };

  const handleReset = function () {
    setAvanseOverstyrt(false);
    onReset();
  };

  const handleRegBlur = function () {
    const reg = normalizeReg(form.regnr);
    if (reg.length < 5) return;
    const savedReg = normalizeReg(form.autosysData?.regNr);
    if (savedReg && savedReg === reg) return;
    hentAutosys();
  };

  const handleFinnMarkedsSok = async function () {
    if (!finnKlar || finnSokLaster) return;
    setFinnSokLaster(true);
    try {
      const ok = await openFinnMarkedsSok(finnSok, { kmSlack: FINN_KM_SLACK_KALKYLE });
      if (!ok) visTost('Fant ikke merke/modell på FINN – sjekk stavemåte ✗');
    } catch (err) {
      visTost((err?.message || 'Kunne ikke åpne FINN-markedssøk') + ' ✗');
    } finally {
      setFinnSokLaster(false);
    }
  };

  return (
    <div className="kalkyle-sheet">
      <div className="kalkyle-sheet-hd">
        <div>
          <div className="kalkyle-sheet-title">INNKJØP – X BILSENTER AS</div>
          {editMode && (
            <div className="kalkyle-sheet-meta">
              Lagret {fmtDateTime(createdAt)}{createdByName ? ` · ${createdByName}` : ''}
            </div>
          )}
        </div>
        <div className="kalkyle-sheet-actions">
          <button type="button" className="btn btn-g btn-sm" onClick={handleReset}>Ny kalkyle</button>
          {editMode && onDelete && (
            <button type="button" className="btn btn-g btn-sm" onClick={onDelete}>Slett</button>
          )}
          <button type="button" className="btn btn-p btn-sm" onClick={() => onSave(numbers)} disabled={saving}>
            {saving ? 'Lagrer…' : (editMode ? 'Oppdater' : 'Lagre kalkyle')}
          </button>
        </div>
      </div>

      <div className="kalkyle-grid">
        <div className="kalkyle-col">
          <label className="kalkyle-field">
            <span className="kalkyle-label">Auksjon</span>
            <select value={form.auksjon} onChange={(e) => setForm(function (prev) { return { ...prev, auksjon: e.target.value }; })}>
              <option value="">Velg plattform…</option>
              {AUKSJON_PLATTFORMER.map(function (p) {
                return <option key={p} value={p}>{p}</option>;
              })}
            </select>
          </label>
          <label className="kalkyle-field">
            <span className="kalkyle-label">Auksjonsslutt</span>
            <input
              type="datetime-local"
              value={form.auksjonsslutt}
              onChange={(e) => setForm(function (prev) { return { ...prev, auksjonsslutt: e.target.value }; })}
            />
          </label>
          <label className="kalkyle-field">
            <span className="kalkyle-label">Partinummer</span>
            <input value={form.partinummer} onChange={(e) => setForm(function (p) { return { ...p, partinummer: e.target.value }; })} />
          </label>
          <label className="kalkyle-field">
            <span className="kalkyle-label">Reg.nr.</span>
            <div className="kalkyle-reg-row">
              <input
                value={form.regnr}
                onChange={(e) => setForm(function (p) {
                  setOmregHint('');
                  setOmregError('');
                  return { ...p, regnr: e.target.value.toUpperCase(), autosysData: null };
                })}
                onBlur={handleRegBlur}
                placeholder="AB12345"
              />
              <button type="button" className="btn btn-g btn-sm" onClick={hentAutosys} disabled={autosysLoading}>
                {autosysLoading ? 'Henter…' : 'Hent Autosys'}
              </button>
            </div>
          </label>
          <label className="kalkyle-field">
            <span className="kalkyle-label">Km.stand</span>
            <div className="kalkyle-reg-row">
              <input inputMode="numeric" value={form.kmstand} onChange={(e) => setForm(function (p) { return { ...p, kmstand: e.target.value }; })} />
              <button
                type="button"
                className="btn btn-g btn-sm"
                disabled={!finnKlar || finnSokLaster}
                title={finnKlar
                  ? `Filtrer ${finnMarkedsSokLabel(finnSok)} på FINN.no – pris lav til høy`
                  : 'Legg inn km.stand og merke/modell (Autosys) for FINN-sammenligning'}
                onClick={handleFinnMarkedsSok}
              >
                {finnSokLaster ? 'Åpner FINN…' : 'Sammenlign på FINN'}
              </button>
            </div>
            {finnKlar ? (
              <span className="kalkyle-hint">
                FINN: {finnMarkedsSokLabel(finnSok)}{finnFilterText ? ` (${finnFilterText})` : ''} · pris lav → høy
              </span>
            ) : parseKr(form.kmstand) > 0 ? (
              <span className="kalkyle-hint">Hent Autosys eller fyll inn modell for FINN-sammenligning.</span>
            ) : null}
          </label>
          <label className="kalkyle-field">
            <span className="kalkyle-label">Modell</span>
            <input value={form.modell} onChange={(e) => setForm(function (p) { return { ...p, modell: e.target.value }; })} />
          </label>

          <KrField label="Utsalgspris" highlight value={form.utsalgspris} onChange={handleUtsalgsprisChange} />
          <KrField label="Påkost" value={form.pakost} onChange={(v) => setForm(function (p) { return { ...p, pakost: v }; })} />
          <KrField label="Auk. gebyr" value={form.aukGebyr} onChange={(v) => setForm(function (p) { return { ...p, aukGebyr: v }; })} />
          <KrField label="Garantikost" value={form.garantikost} onChange={(v) => setForm(function (p) { return { ...p, garantikost: v }; })} />
          <KrField
            label="Omreg.avgift"
            value={form.omregAvgift}
            onChange={(v) => {
              setOmregHint('');
              setOmregError('');
              setForm(function (p) { return { ...p, omregAvgift: v }; });
            }}
            hint={omregError || omregHint}
          />
          <KrField
            label="Avanse/profitt"
            value={form.avanse}
            onChange={handleAvanseChange}
            hint={avanseOverstyrt ? undefined : 'Min. kr 50 000 · 12 % av utsalgspris · rundet opp til nærmeste titusen'}
          />

          <div className="kalkyle-result">
            <div className="kalkyle-label kalkyle-label--green">Innkjøpspris (maks bud)</div>
            <div className="kalkyle-result-value">{nok(innkjopspris)}</div>
            <div className="kalkyle-hint">
              {nok(numbers.utsalgspris)} − {nok(sumKostnader)} = {nok(innkjopspris)}
            </div>
          </div>
        </div>

        <div className="kalkyle-col kalkyle-col--side">
          <AutosysInfoPanel
            data={form.autosysData}
            loading={autosysLoading}
            error={autosysError}
            onRefresh={hentAutosys}
          />
          <div className="kalkyle-label">Eventuelle kommentarer</div>
          <textarea
            className="kalkyle-comments"
            value={form.kommentarer}
            onChange={(e) => setForm(function (p) { return { ...p, kommentarer: e.target.value }; })}
            placeholder="Notater om bil, skader, utstyr, risiko …"
          />
        </div>
      </div>
    </div>
  );
}

export default function InnkjopskalkyleView({ items, setItems, visTost, currentUser }) {
  const [platform, setPlatform] = useState(AUKSJON_PLATTFORMER[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(function () {
    return { ...EMPTY_FORM, auksjon: AUKSJON_PLATTFORMER[0] };
  });
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(function () {
    return (items || [])
      .filter(function (item) { return !platform || item.auksjon === platform; })
      .sort(function (a, b) {
        const da = a.auksjonsslutt || a.createdAt || '';
        const db = b.auksjonsslutt || b.createdAt || '';
        return db.localeCompare(da);
      });
  }, [items, platform]);

  const selected = selectedId ? (items || []).find(function (i) { return i.id === selectedId; }) : null;

  const resetForm = function (auksjonOverride) {
    setSelectedId(null);
    setForm({ ...EMPTY_FORM, auksjon: auksjonOverride || platform });
  };

  const selectItem = function (item) {
    setSelectedId(item.id);
    setForm(formFromItem(item));
  };

  const handlePlatformChange = function (next) {
    setPlatform(next);
    if (!selectedId) {
      setForm(function (prev) { return { ...prev, auksjon: next }; });
    }
  };

  const saveItem = async function (payload) {
    if (!payload.auksjon) {
      visTost('Velg auksjonsplattform ✗');
      return;
    }
    setSaving(true);
    try {
      if (selectedId) {
        const res = await patchInnkjopskalkyle(selectedId, payload);
        if (res.item) {
          setItems(function (prev) {
            return prev.map(function (row) { return row.id === selectedId ? res.item : row; });
          });
          setForm(formFromItem(res.item));
        }
        visTost('Kalkyle oppdatert ✓');
      } else {
        const res = await postInnkjopskalkyle(payload);
        if (res.item) {
          setItems(function (prev) { return [res.item, ...prev]; });
          setSelectedId(res.item.id);
          setForm(formFromItem(res.item));
        }
        visTost('Kalkyle lagret ✓');
      }
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre kalkyle ✗');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async function () {
    if (!selectedId || !window.confirm('Slette denne kalkylen?')) return;
    setSaving(true);
    try {
      await deleteInnkjopskalkyle(selectedId);
      setItems(function (prev) { return prev.filter(function (row) { return row.id !== selectedId; }); });
      resetForm(platform);
      visTost('Kalkyle slettet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette ✗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Innkjøpskalkyle</div>
          <div className="ph-sub">
            Beregn maks innkjøpspris · Autosys-kobling på reg.nr. · {filtered.length} kalkyler
            {currentUser?.name ? ` · ${currentUser.name}` : ''}
          </div>
        </div>
        <button type="button" className="btn btn-p" onClick={() => resetForm(platform)}>+ Ny kalkyle</button>
      </div>

      <div className="kalkyle-platforms">
        {AUKSJON_PLATTFORMER.map(function (p) {
          const count = (items || []).filter(function (i) { return i.auksjon === p; }).length;
          return (
            <button
              key={p}
              type="button"
              className={`kalkyle-platform${platform === p ? ' on' : ''}`}
              onClick={() => handlePlatformChange(p)}
            >
              {p}{count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      <div className="kalkyle-layout">
        <aside className="kalkyle-list">
          <div className="kalkyle-list-hd">Lagrede kalkyler · {platform}</div>
          <div className="kalkyle-list-body">
            {!filtered.length && (
              <div className="inbox-empty" style={{ padding: 20 }}>Ingen kalkyler for {platform} ennå.</div>
            )}
            {filtered.map(function (item) {
              const edited = lastEditedLabel(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`kalkyle-list-item${selectedId === item.id ? ' on' : ''}`}
                  onClick={() => selectItem(item)}
                >
                  <div className="kalkyle-list-item-top">
                    <strong>{item.regnr || item.partinummer || 'Uten reg.nr.'}</strong>
                    <span>{nok(item.innkjopspris)}</span>
                  </div>
                  <div className="kalkyle-list-item-sub">
                    {item.modell || item.autosysData?.drivstoff || '—'}
                    {item.auksjonsslutt ? ` · ${fmtDateTime(item.auksjonsslutt)}` : ''}
                  </div>
                  {edited ? (
                    <div className="kalkyle-list-item-meta">Sist redigert: {edited}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="kalkyle-main">
          <KalkyleForm
            form={form}
            setForm={setForm}
            onSave={saveItem}
            onDelete={selectedId ? deleteItem : null}
            onReset={() => resetForm(platform)}
            saving={saving}
            editMode={!!selectedId}
            createdByName={selected?.createdByName}
            createdAt={selected?.createdAt}
            visTost={visTost}
          />
        </div>
      </div>
    </>
  );
}
