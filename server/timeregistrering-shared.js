'use strict';

const NORSK_TIDSSONE = 'Europe/Oslo';

function nowOsloDate(d) {
  const base = d || new Date();
  return base.toLocaleDateString('sv-SE', { timeZone: NORSK_TIDSSONE });
}

function nowOsloTime(d) {
  const base = d || new Date();
  return base.toLocaleTimeString('sv-SE', {
    timeZone: NORSK_TIDSSONE,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parsePauser(raw) {
  const list = parseJson(raw, []);
  if (!Array.isArray(list)) return [];
  return list.map(function (item, idx) {
    return {
      id: item?.id || `p${idx + 1}`,
      start: String(item?.start || '').slice(0, 5),
      slutt: String(item?.slutt || '').slice(0, 5),
      type: item?.type || 'pause',
      notat: String(item?.notat || '')
    };
  }).filter(function (item) { return item.start; });
}

function parseTimeToMinutes(value) {
  const parts = String(value || '').split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

function minutesToDisplay(totalMin) {
  const min = Math.max(0, Math.round(Number(totalMin) || 0));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} t`;
  return `${h} t ${m} min`;
}

function minutesToDecimalHours(totalMin) {
  return Math.round((Math.max(0, Number(totalMin) || 0) / 60) * 100) / 100;
}

function calcTimeregStats(entry, nowTime) {
  const start = parseTimeToMinutes(entry.startTid || entry.start_tid);
  let end = entry.sluttTid || entry.slutt_tid
    ? parseTimeToMinutes(entry.sluttTid || entry.slutt_tid)
    : parseTimeToMinutes(nowTime || nowOsloTime());
  if (end < start) end += 24 * 60;

  let pauseMin = 0;
  const pauser = entry.pauser || parsePauser(entry.pauser);
  pauser.forEach(function (p) {
    const pStart = parseTimeToMinutes(p.start);
    let pEnd = p.slutt ? parseTimeToMinutes(p.slutt) : parseTimeToMinutes(nowTime || nowOsloTime());
    if (pEnd < pStart) pEnd += 24 * 60;
    pauseMin += Math.max(0, pEnd - pStart);
  });

  const bruttoMin = Math.max(0, end - start);
  const nettoMin = Math.max(0, bruttoMin - pauseMin);
  const timelonn = Number(entry.timelonn) || 0;
  const lonnKr = timelonn > 0 ? Math.round((nettoMin / 60) * timelonn) : 0;

  return {
    bruttoMin,
    pauseMin,
    nettoMin,
    timer: minutesToDecimalHours(nettoMin),
    lonnKr,
    display: minutesToDisplay(nettoMin),
    pauseDisplay: minutesToDisplay(pauseMin)
  };
}

function mapTimeregistreringRow(row) {
  if (!row) return null;
  const pauser = parsePauser(row.pauser);
  const item = {
    id: Number(row.id),
    userId: Number(row.user_id),
    brukerNavn: row.bruker_navn || '',
    dato: row.dato || '',
    status: row.status || 'fullfort',
    startTid: row.start_tid || '',
    sluttTid: row.slutt_tid || '',
    pauser,
    notat: row.notat || '',
    timelonn: Number(row.timelonn) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  return { ...item, stats: calcTimeregStats(item) };
}

function weekStartIso(dateIso) {
  const d = new Date(String(dateIso || nowOsloDate()) + 'T12:00:00');
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

function canViewAllTimereg(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return Array.isArray(user.permissions) && user.permissions.includes('brukere');
}

module.exports = {
  NORSK_TIDSSONE,
  nowOsloDate,
  nowOsloTime,
  parsePauser,
  parseTimeToMinutes,
  minutesToDisplay,
  minutesToDecimalHours,
  calcTimeregStats,
  mapTimeregistreringRow,
  weekStartIso,
  addDaysIso,
  canViewAllTimereg
};
