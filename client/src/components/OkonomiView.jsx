import { Fragment, useMemo, useState } from 'react';
import {
  aggregateMaanedligProfitt,
  aggregateUkentligProfitt,
  calcBilOkonomi,
  formatProfittMaanedLabel,
  formatProfittUkeLabel,
  getCurrentProfittMaaned,
  getCurrentProfittUke,
  getIsoWeekInfo,
  normalizeBilOkonomi
} from '../constants.js';

function nok(v, large) {
  const n = Number(v || 0);
  const tone = n >= 0 ? 'var(--acc)' : 'var(--red)';
  return (
    <span
      className={large ? 'okonomi-profit-value okonomi-profit-value--lg' : 'okonomi-profit-value'}
      style={{ color: tone }}
    >
      {`kr ${n.toLocaleString('nb-NO')}`}
    </span>
  );
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
  const [expandedMonth, setExpandedMonth] = useState(null);
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
  const currentMonthKey = getCurrentProfittMaaned();

  const { weeks, utenUke } = useMemo(function () {
    return aggregateUkentligProfitt(biler, {
      year: year === 'alle' ? null : Number(year)
    });
  }, [biler, year]);

  const { months } = useMemo(function () {
    return aggregateMaanedligProfitt(biler, {
      year: year === 'alle' ? null : Number(year)
    });
  }, [biler, year]);

  const currentMonth = useMemo(function () {
    const { months: allMonths } = aggregateMaanedligProfitt(biler, { year: null });
    const row = allMonths.find(function (m) { return m.profittMaaned === currentMonthKey; });
    return {
      profittMaaned: currentMonthKey,
      label: formatProfittMaanedLabel(currentMonthKey),
      nettoMargin: row?.nettoMargin ?? 0,
      antall: row?.biler?.length ?? 0,
      biler: row?.biler ?? []
    };
  }, [biler, currentMonthKey]);

  const currentWeek = useMemo(function () {
    const { weeks: allWeeks } = aggregateUkentligProfitt(biler, { year: null });
    const row = allWeeks.find(function (w) { return w.profittUke === currentWeekKey; });
    return {
      label: formatProfittUkeLabel(currentWeekKey),
      nettoMargin: row?.nettoMargin ?? 0,
      antall: row?.biler?.length ?? 0,
      biler: row?.biler ?? []
    };
  }, [biler, currentWeekKey]);

  const arTotal = useMemo(function () {
    return weeks.reduce(function (acc, row) {
      acc.nettoMargin += row.nettoMargin;
      acc.antall += row.biler.length;
      return acc;
    }, { nettoMargin: 0, antall: 0 });
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

  const toggleMonth = function (maaned) {
    setExpandedMonth(function (prev) { return prev === maaned ? null : maaned; });
  };

  const currentMonthExpanded = expandedMonth === currentMonthKey;

  function renderBilRows(entries, stopPropagation) {
    return entries.map(function (entry) {
      const bil = entry.bil;
      const stats = entry.stats || calcBilOkonomi(bil.innkjop, bil.salg, bil.okonomi);
      return (
        <button
          key={bil.id}
          type="button"
          className="okonomi-bil-row"
          onClick={function (e) {
            if (stopPropagation) e.stopPropagation();
            openBil(bil);
          }}
        >
          <div>
            <strong>{bil.reg || '—'}</strong>
            <span>{bil.merke} {bil.modell}</span>
          </div>
          <div className="okonomi-bil-row__stats">
            {entry.profittUke ? <span>{formatProfittUkeLabel(entry.profittUke)}</span> : null}
            <span>Netto {marginCell(stats.nettoMargin)}</span>
          </div>
        </button>
      );
    });
  }

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Økonomi</div>
          <div className="ph-sub">
            Netto profitt per måned og uke · {formatProfittMaanedLabel(currentMonthKey)} er inneværende måned
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

      <section className="okonomi-current-month" aria-label="Inneværende måned">
        <div className="okonomi-current-month__head">
          <div>
            <div className="okonomi-current-month__eyebrow">Inneværende måned</div>
            <div className="okonomi-current-month__title">{currentMonth.label}</div>
          </div>
          {currentMonth.antall > 0 ? (
            <button
              type="button"
              className="okonomi-current-month__toggle"
              onClick={function () { toggleMonth(currentMonthKey); }}
            >
              {currentMonthExpanded ? 'Skjul biler' : `Vis ${currentMonth.antall} bil${currentMonth.antall === 1 ? '' : 'er'}`}
            </button>
          ) : (
            <span className="okonomi-current-month__empty">Ingen biler registrert denne måneden</span>
          )}
        </div>
        <div className="okonomi-current-month__hero">
          <div className="okonomi-current-month__profit">
            <div className="fl">Netto profitt</div>
            {nok(currentMonth.nettoMargin, true)}
          </div>
          <div className="okonomi-current-month__meta">
            <div className="okonomi-current-month__meta-item">
              <span className="fl">Biler denne måneden</span>
              <strong>{currentMonth.antall}</strong>
            </div>
            <div className="okonomi-current-month__meta-item okonomi-current-month__meta-item--week">
              <span className="fl">Inneværende uke</span>
              <strong>{marginCell(currentWeek.nettoMargin)}</strong>
              <span className="okonomi-current-month__week-detail">
                {currentWeek.label}{currentWeek.antall > 0 ? ` · ${currentWeek.antall} bil${currentWeek.antall === 1 ? '' : 'er'}` : ''}
              </span>
            </div>
          </div>
        </div>
        {currentMonthExpanded && currentMonth.biler.length > 0 ? (
          <div className="okonomi-week-detail okonomi-current-month__biler">
            {renderBilRows(currentMonth.biler)}
          </div>
        ) : null}
      </section>

      {months.length > 0 ? (
        <>
          <h3 className="okonomi-section-title">Alle måneder</h3>
          <div className="okonomi-week-table-wrap okonomi-month-table-wrap">
            <table className="tbl okonomi-week-table okonomi-month-table">
              <thead>
                <tr>
                  <th>Måned</th>
                  <th>Biler</th>
                  <th className="okonomi-col-profit">Netto profitt</th>
                </tr>
              </thead>
              <tbody>
                {months.map(function (row) {
                  const open = expandedMonth === row.profittMaaned;
                  return (
                    <Fragment key={row.profittMaaned}>
                      <tr
                        className={'okonomi-week-row'
                          + (open ? ' okonomi-week-row--open' : '')
                          + (row.profittMaaned === currentMonthKey ? ' okonomi-week-row--current' : '')}
                        onClick={function () { toggleMonth(row.profittMaaned); }}
                      >
                        <td>
                          <strong>{formatProfittMaanedLabel(row.profittMaaned)}</strong>
                          {row.profittMaaned === currentMonthKey ? (
                            <span className="okonomi-week-row__badge">Denne måneden</span>
                          ) : null}
                        </td>
                        <td>{row.biler.length}</td>
                        <td className="okonomi-col-profit">{marginCell(row.nettoMargin)}</td>
                      </tr>
                      {open ? (
                        <tr className="okonomi-week-detail-row">
                          <td colSpan={3}>
                            <div className="okonomi-week-detail">
                              {renderBilRows(row.biler, true)}
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
        </>
      ) : null}

      {!weeks.length ? (
        <div className="inbox-empty" style={{ padding: 32 }}>
          Ingen biler med profittuke{year !== 'alle' ? ` i ${year}` : ''} ennå.
          <div style={{ marginTop: 8, fontSize: 11 }}>
            Sett profittuke under Økonomi på bilkortet.
          </div>
        </div>
      ) : (
        <div className="okonomi-week-table-wrap okonomi-week-table-wrap--secondary">
          <h3 className="okonomi-section-title okonomi-section-title--muted">Per uke</h3>
          <table className="tbl okonomi-week-table">
            <thead>
              <tr>
                <th>Uke</th>
                <th>Biler</th>
                <th className="okonomi-col-profit">Netto profitt</th>
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
                      <td className="okonomi-col-profit">{marginCell(row.nettoMargin)}</td>
                    </tr>
                    {open ? (
                      <tr className="okonomi-week-detail-row">
                        <td colSpan={3}>
                          <div className="okonomi-week-detail">
                            {renderBilRows(row.biler, true)}
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

      {weeks.length > 0 ? (
        <p className="okonomi-year-total" aria-label="Årsoppsummering">
          {year !== 'alle' ? `${year}: ` : 'Totalt: '}
          netto profitt {marginCell(arTotal.nettoMargin)}
          {' · '}
          {arTotal.antall} bil{arTotal.antall === 1 ? '' : 'er'}
          {' · '}
          {weeks.length} uke{weeks.length === 1 ? '' : 'r'}
        </p>
      ) : null}

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
              {renderBilRows(utenUke)}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
