import { Fragment, useMemo, useState } from 'react';
import {
  aggregateUkentligProfitt,
  calcBilOkonomi,
  formatProfittUkeLabel,
  getCurrentProfittUke,
  getIsoWeekInfo,
  normalizeBilOkonomi
} from '../constants.js';

function nok(v) {
  const n = Number(v || 0);
  const tone = n >= 0 ? 'var(--acc)' : 'var(--red)';
  return <span style={{ color: tone, fontWeight: 700 }}>{`kr ${n.toLocaleString('nb-NO')}`}</span>;
}

function marginCell(v) {
  const n = Number(v || 0);
  return (
    <span style={{ color: n >= 0 ? 'var(--acc)' : 'var(--red)', fontWeight: 700 }}>
      {`kr ${n.toLocaleString('nb-NO')}`}
    </span>
  );
}

export default function OkonomiView({ biler, setModal }) {
  const currentYear = getIsoWeekInfo(new Date())?.year || new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [utenUkeOpen, setUtenUkeOpen] = useState(false);

  const years = useMemo(function () {
    const set = new Set([currentYear]);
    (biler || []).forEach(function (bil) {
      const uke = normalizeBilOkonomi(bil.okonomi).profittUke;
      const m = String(uke || '').match(/^(\d{4})-/);
      if (m) set.add(Number(m[1]));
    });
    return Array.from(set).sort(function (a, b) { return b - a; });
  }, [biler, currentYear]);

  const currentWeekKey = getCurrentProfittUke();

  const { weeks, utenUke } = useMemo(function () {
    return aggregateUkentligProfitt(biler, {
      year: year === 'alle' ? null : Number(year)
    });
  }, [biler, year]);

  const currentWeek = useMemo(function () {
    const { weeks: allWeeks } = aggregateUkentligProfitt(biler, { year: null });
    const row = allWeeks.find(function (w) { return w.profittUke === currentWeekKey; });
    return {
      profittUke: currentWeekKey,
      label: formatProfittUkeLabel(currentWeekKey),
      nettoMargin: row?.nettoMargin ?? 0,
      bruttoMargin: row?.bruttoMargin ?? 0,
      totaltKostnader: row?.totaltKostnader ?? 0,
      antall: row?.biler?.length ?? 0,
      biler: row?.biler ?? []
    };
  }, [biler, currentWeekKey]);

  const arTotal = useMemo(function () {
    return weeks.reduce(function (acc, row) {
      acc.nettoMargin += row.nettoMargin;
      acc.totaltKostnader += row.totaltKostnader;
      acc.antall += row.biler.length;
      return acc;
    }, { nettoMargin: 0, totaltKostnader: 0, antall: 0 });
  }, [weeks]);

  const utenUkeNetto = useMemo(function () {
    return utenUke.reduce(function (sum, entry) {
      return sum + (entry.stats?.nettoMargin || 0);
    }, 0);
  }, [utenUke]);

  const openBil = function (bil) {
    if (setModal) setModal({ t: 'visBil', d: bil });
  };

  const toggleWeek = function (uke) {
    setExpandedWeek(function (prev) { return prev === uke ? null : uke; });
  };

  const currentWeekExpanded = expandedWeek === currentWeekKey;

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Økonomi</div>
          <div className="ph-sub">
            Ukentlig profitt og margin · {formatProfittUkeLabel(currentWeekKey)} er inneværende uke
          </div>
        </div>
        <div className="okonomi-year-filter">
          <label className="fl" htmlFor="okonomi-year">År</label>
          <select id="okonomi-year" value={year} onChange={e => setYear(e.target.value)}>
            <option value="alle">Alle år</option>
            {years.map(function (y) {
              return <option key={y} value={String(y)}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      <section className="okonomi-current-week" aria-label="Inneværende uke">
        <div className="okonomi-current-week__head">
          <div>
            <div className="okonomi-current-week__eyebrow">Inneværende uke</div>
            <div className="okonomi-current-week__title">{currentWeek.label}</div>
          </div>
          {currentWeek.antall > 0 ? (
            <button
              type="button"
              className="okonomi-current-week__toggle"
              onClick={function () { toggleWeek(currentWeekKey); }}
            >
              {currentWeekExpanded ? 'Skjul biler' : `Vis ${currentWeek.antall} bil${currentWeek.antall === 1 ? '' : 'er'}`}
            </button>
          ) : (
            <span className="okonomi-current-week__empty">Ingen biler registrert denne uken</span>
          )}
        </div>
        <div className="okonomi-current-week__stats">
          <div className="okonomi-current-week__stat okonomi-current-week__stat--highlight">
            <div className="fl">Netto profitt</div>
            <div className="okonomi-current-week__value">{nok(currentWeek.nettoMargin)}</div>
          </div>
          <div className="okonomi-current-week__stat">
            <div className="fl">Antall biler</div>
            <div className="okonomi-current-week__value" style={{ color: 'var(--t1)' }}>{currentWeek.antall}</div>
          </div>
          <div className="okonomi-current-week__stat">
            <div className="fl">Totale kostnader</div>
            <div className="okonomi-current-week__value" style={{ color: 'var(--t1)' }}>
              {`kr ${currentWeek.totaltKostnader.toLocaleString('nb-NO')}`}
            </div>
          </div>
          <div className="okonomi-current-week__stat">
            <div className="fl">Brutto margin</div>
            <div className="okonomi-current-week__value">{marginCell(currentWeek.bruttoMargin)}</div>
          </div>
        </div>
        {currentWeekExpanded && currentWeek.biler.length > 0 ? (
          <div className="okonomi-week-detail okonomi-current-week__biler">
            {currentWeek.biler.map(function (entry) {
              const bil = entry.bil;
              const stats = entry.stats || calcBilOkonomi(bil.innkjop, bil.salg, bil.okonomi);
              return (
                <button
                  key={bil.id}
                  type="button"
                  className="okonomi-bil-row"
                  onClick={function () { openBil(bil); }}
                >
                  <div>
                    <strong>{bil.reg || '—'}</strong>
                    <span>{bil.merke} {bil.modell}</span>
                  </div>
                  <div className="okonomi-bil-row__stats">
                    <span>Salg {`kr ${Number(bil.salg || 0).toLocaleString('nb-NO')}`}</span>
                    <span>Netto {marginCell(stats.nettoMargin)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <div className="okonomi-summary-cards">
        <div className="okonomi-summary-card okonomi-summary-card--highlight">
          <div className="fl">Netto profitt {year !== 'alle' ? year : 'totalt'}</div>
          <div className="okonomi-summary-card__value">{nok(arTotal.nettoMargin)}</div>
        </div>
        <div className="okonomi-summary-card">
          <div className="fl">Totale kostnader {year !== 'alle' ? year : ''}</div>
          <div className="okonomi-summary-card__value" style={{ color: 'var(--t1)' }}>
            {`kr ${arTotal.totaltKostnader.toLocaleString('nb-NO')}`}
          </div>
        </div>
        <div className="okonomi-summary-card">
          <div className="fl">Biler med profittuke {year !== 'alle' ? year : ''}</div>
          <div className="okonomi-summary-card__value okonomi-summary-card__value--meta">
            <span>{arTotal.antall} biler</span>
            <span>{weeks.length} uker</span>
          </div>
        </div>
      </div>

      {!weeks.length ? (
        <div className="inbox-empty" style={{ padding: 32 }}>
          Ingen biler med profittuke{year !== 'alle' ? ` i ${year}` : ''} ennå.
          <div style={{ marginTop: 8, fontSize: 11 }}>
            Sett profittuke under Økonomi på bilkortet.
          </div>
        </div>
      ) : (
        <div className="okonomi-week-table-wrap">
          <table className="tbl okonomi-week-table">
            <thead>
              <tr>
                <th>Uke</th>
                <th>Biler</th>
                <th>Kostnader</th>
                <th>Netto profitt</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map(function (row) {
                const open = expandedWeek === row.profittUke;
                return (
                  <Fragment key={row.profittUke}>
                    <tr
                      className={'okonomi-week-row'
                        + (open ? ' okonomi-week-row--open' : '')
                        + (row.profittUke === currentWeekKey ? ' okonomi-week-row--current' : '')}
                      onClick={function () { toggleWeek(row.profittUke); }}
                    >
                      <td>
                        <strong>{formatProfittUkeLabel(row.profittUke)}</strong>
                        {row.profittUke === currentWeekKey ? (
                          <span className="okonomi-week-row__badge">Denne uken</span>
                        ) : null}
                      </td>
                      <td>{row.biler.length}</td>
                      <td>{`kr ${row.totaltKostnader.toLocaleString('nb-NO')}`}</td>
                      <td>{marginCell(row.nettoMargin)}</td>
                    </tr>
                    {open ? (
                      <tr className="okonomi-week-detail-row">
                        <td colSpan={4}>
                          <div className="okonomi-week-detail">
                            {row.biler.map(function (entry) {
                              const bil = entry.bil;
                              const stats = entry.stats || calcBilOkonomi(bil.innkjop, bil.salg, bil.okonomi);
                              return (
                                <button
                                  key={bil.id}
                                  type="button"
                                  className="okonomi-bil-row"
                                  onClick={function (e) {
                                    e.stopPropagation();
                                    openBil(bil);
                                  }}
                                >
                                  <div>
                                    <strong>{bil.reg || '—'}</strong>
                                    <span>{bil.merke} {bil.modell}</span>
                                  </div>
                                  <div className="okonomi-bil-row__stats">
                                    <span>Salg {`kr ${Number(bil.salg || 0).toLocaleString('nb-NO')}`}</span>
                                    <span>Netto {marginCell(stats.nettoMargin)}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {utenUke.length > 0 ? (
        <div className="okonomi-uten-uke">
          <button
            type="button"
            className={'okonomi-uten-uke__toggle' + (utenUkeOpen ? ' okonomi-uten-uke__toggle--open' : '')}
            aria-expanded={utenUkeOpen}
            onClick={function () { setUtenUkeOpen(function (v) { return !v; }); }}
          >
            <span>Uten profittuke ({utenUke.length})</span>
            <span className="okonomi-uten-uke__toggle-meta">
              Netto {`kr ${utenUkeNetto.toLocaleString('nb-NO')}`}
            </span>
            <span className="okonomi-uten-uke__chevron" aria-hidden="true">▾</span>
          </button>
          {utenUkeOpen ? (
            <div className="okonomi-week-detail okonomi-uten-uke__panel">
              {utenUke.map(function (entry) {
                const bil = entry.bil;
                const stats = entry.stats;
                return (
                  <button
                    key={bil.id}
                    type="button"
                    className="okonomi-bil-row okonomi-bil-row--muted"
                    onClick={function () { openBil(bil); }}
                  >
                    <div>
                      <strong>{bil.reg || '—'}</strong>
                      <span>{bil.merke} {bil.modell}</span>
                    </div>
                    <div className="okonomi-bil-row__stats">
                      <span>Netto {marginCell(stats.nettoMargin)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
