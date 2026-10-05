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

const DAG_ORDINAR_MIN = 9 * 60;
const UKE_ORDINAR_MIN = 40 * 60;
const MIN_OVERTIDSPROSENT = 40;

function normalizeOvertidsprosent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_OVERTIDSPROSENT) return MIN_OVERTIDSPROSENT;
  return n;
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
  const prosent = normalizeOvertidsprosent(entry.overtidsprosent);
  const lonnKr = timelonn > 0 ? Math.round((nettoMin / 60) * timelonn) : 0;

  return {
    bruttoMin,
    pauseMin,
    pauseMinutter: pauseMin,
    nettoMin,
    faktiskMin: nettoMin,
    timer: minutesToDecimalHours(nettoMin),
    timesats: timelonn,
    ordinarMin: nettoMin,
    ordinarTimer: minutesToDecimalHours(nettoMin),
    overtidMin: 0,
    overtidTimer: 0,
    overtidDagMin: 0,
    overtidUkeMin: 0,
    overtidsprosent: prosent,
    overtidsbelop: 0,
    lonnKr,
    display: minutesToDisplay(nettoMin),
    pauseDisplay: minutesToDisplay(pauseMin)
  };
}

function settOvertidStats(item, ordinarMin, dagOt, ukeOt) {
  const nettoMin = Math.max(0, Number(item.stats?.nettoMin) || 0);
  const overtidMin = Math.max(0, dagOt) + Math.max(0, ukeOt);
  const prosent = normalizeOvertidsprosent(item.overtidsprosent);
  const timesats = Math.max(0, Math.round(Number(item.timelonn) || 0));
  const overtidsbelop = timesats > 0
    ? Math.round((overtidMin / 60) * timesats * (prosent / 100))
    : 0;
  const grunnlag = timesats > 0 ? Math.round((nettoMin / 60) * timesats) : 0;
  item.overtidsprosent = prosent;
  item.stats = {
    ...item.stats,
    timesats: timesats,
    ordinarMin: ordinarMin,
    ordinarTimer: minutesToDecimalHours(ordinarMin),
    overtidMin: overtidMin,
    overtidTimer: minutesToDecimalHours(overtidMin),
    overtidDagMin: dagOt,
    overtidUkeMin: ukeOt,
    overtidsprosent: prosent,
    overtidsbelop: overtidsbelop,
    lonnKr: grunnlag + overtidsbelop
  };
}

function erTimeregFerdige(item) {
  return item && item.stats && item.status !== 'aktiv' && item.status !== 'pause';
}

/**
 * Overtid for timelønnede.
 * Faktisk tid er allerede netto etter ubetalte pauser.
 * Over 9 timer i døgnet og over 40 ordinære timer man–søn blir overtid.
 * Timer som allerede er døgn-overtid telles ikke på nytt mot 40-timersgrensen.
 */
function beregnOvertidForAnsatt(poster) {
  const ferdige = (poster || []).filter(erTimeregFerdige);
  const timelonnet = ferdige.some(function (item) { return Number(item.timelonn) > 0; });
  if (!timelonnet) {
    ferdige.forEach(function (item) {
      settOvertidStats(item, item.stats.nettoMin || 0, 0, 0);
    });
    return;
  }

  const byWeek = {};
  ferdige.forEach(function (item) {
    const start = weekStartIso(item.dato);
    if (!byWeek[start]) byWeek[start] = [];
    byWeek[start].push(item);
  });

  Object.keys(byWeek).forEach(function (start) {
    const byDay = {};
    byWeek[start].forEach(function (item) {
      if (!byDay[item.dato]) byDay[item.dato] = [];
      byDay[item.dato].push(item);
    });
    const dager = Object.keys(byDay).sort();
    let ukeOrdinær = 0;
    dager.forEach(function (dato) {
      const dagPoster = byDay[dato].slice().sort(function (a, b) {
        return String(a.startTid || '').localeCompare(String(b.startTid || ''))
          || Number(a.id) - Number(b.id);
      });
      let dagBrukt = 0;
      dagPoster.forEach(function (item) {
        const netto = Math.max(0, Number(item.stats.nettoMin) || 0);
        const plassDag = Math.max(0, DAG_ORDINAR_MIN - dagBrukt);
        const dagOt = Math.max(0, netto - plassDag);
        item._kandidatOrdinær = netto - dagOt;
        item._dagOt = dagOt;
        dagBrukt += netto;
      });
      dagPoster.forEach(function (item) {
        const plassUke = Math.max(0, UKE_ORDINAR_MIN - ukeOrdinær);
        const ukeOt = Math.max(0, item._kandidatOrdinær - plassUke);
        const ordinær = item._kandidatOrdinær - ukeOt;
        ukeOrdinær += ordinær;
        settOvertidStats(item, ordinær, item._dagOt, ukeOt);
        delete item._kandidatOrdinær;
        delete item._dagOt;
      });
    });
  });
}

function beregnOvertidForPoster(items) {
  const byUser = {};
  (Array.isArray(items) ? items : []).forEach(function (item) {
    if (!item) return;
    const uid = Number(item.userId);
    if (!Number.isFinite(uid)) return;
    if (!byUser[uid]) byUser[uid] = [];
    byUser[uid].push(item);
  });
  Object.keys(byUser).forEach(function (key) {
    beregnOvertidForAnsatt(byUser[key]);
  });
  return items;
}

function isTimeregLaast(row) {
  return (row?.status || '') === 'godkjent';
}

function mapTimeregistreringRow(row) {
  if (!row) return null;
  const pauser = parsePauser(row.pauser);
  const status = row.status || 'fullfort';
  const item = {
    id: Number(row.id),
    userId: Number(row.user_id),
    brukerNavn: row.bruker_navn || '',
    dato: row.dato || '',
    status,
    laast: isTimeregLaast({ status }),
    startTid: row.start_tid || '',
    sluttTid: row.slutt_tid || '',
    pauser,
    notat: row.notat || '',
    timelonn: Number(row.timelonn) || 0,
    overtidsprosent: normalizeOvertidsprosent(row.overtidsprosent),
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

function monthRangeIso(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const fra = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const til = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { ar: y, maaned: m, fra, til };
}

function currentOsloYearMonth() {
  const parts = nowOsloDate().split('-');
  return { ar: Number(parts[0]), maaned: Number(parts[1]) };
}

function aggregateTimeregByUser(rows, mapItem) {
  const byUser = {};
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const item = mapItem(row);
    if (!item || item.status === 'aktiv' || item.status === 'pause') return;
    const uid = Number(item.userId);
    if (!Number.isFinite(uid)) return;
    if (!byUser[uid]) {
      byUser[uid] = {
        userId: uid,
        brukerNavn: item.brukerNavn || '',
        nettoMin: 0,
        pauseMin: 0,
        ordinarMin: 0,
        overtidMin: 0,
        overtidsbelop: 0,
        lonnKr: 0,
        registreringer: 0,
        dagerSet: {}
      };
    }
    const u = byUser[uid];
    u.nettoMin += item.stats.nettoMin;
    u.pauseMin += item.stats.pauseMin;
    u.ordinarMin += item.stats.ordinarMin || 0;
    u.overtidMin += item.stats.overtidMin || 0;
    u.overtidsbelop += item.stats.overtidsbelop || 0;
    u.lonnKr += item.stats.lonnKr;
    u.registreringer += 1;
    u.dagerSet[item.dato] = true;
    if (!u.brukerNavn && item.brukerNavn) u.brukerNavn = item.brukerNavn;
  });

  const statsByUserId = {};
  Object.keys(byUser).forEach(function (key) {
    const u = byUser[key];
    statsByUserId[Number(key)] = {
      userId: u.userId,
      brukerNavn: u.brukerNavn,
      dager: Object.keys(u.dagerSet).length,
      registreringer: u.registreringer,
      nettoMin: u.nettoMin,
      pauseMin: u.pauseMin,
      ordinarMin: u.ordinarMin,
      ordinarTimer: minutesToDecimalHours(u.ordinarMin),
      overtidMin: u.overtidMin,
      overtidTimer: minutesToDecimalHours(u.overtidMin),
      overtidsbelop: u.overtidsbelop,
      lonnKr: u.lonnKr,
      timer: minutesToDecimalHours(u.nettoMin),
      pauseTimer: minutesToDecimalHours(u.pauseMin)
    };
  });
  return statsByUserId;
}

function buildMaanedAnsatteList(users, statsByUserId, canIncludeUser) {
  const emptyStats = {
    dager: 0,
    registreringer: 0,
    nettoMin: 0,
    pauseMin: 0,
    ordinarMin: 0,
    ordinarTimer: 0,
    overtidMin: 0,
    overtidTimer: 0,
    overtidsbelop: 0,
    lonnKr: 0,
    timer: 0,
    pauseTimer: 0
  };
  const seen = new Set();
  const ansatte = [];

  (Array.isArray(users) ? users : []).forEach(function (user) {
    if (!user || !user.aktiv) return;
    if (typeof canIncludeUser === 'function' && !canIncludeUser(user)) return;
    const uid = Number(user.id);
    if (!Number.isFinite(uid) || seen.has(uid)) return;
    seen.add(uid);
    const stats = statsByUserId[uid] || emptyStats;
    ansatte.push({
      userId: uid,
      brukerNavn: user.name || user.username || stats.brukerNavn || 'Ukjent',
      ...stats
    });
  });

  Object.keys(statsByUserId || {}).forEach(function (key) {
    const uid = Number(key);
    if (seen.has(uid)) return;
    const stats = statsByUserId[uid];
    if (!stats) return;
    seen.add(uid);
    ansatte.push({
      userId: uid,
      brukerNavn: stats.brukerNavn || 'Ukjent',
      ...stats
    });
  });

  ansatte.sort(function (a, b) {
    return String(a.brukerNavn || '').localeCompare(String(b.brukerNavn || ''), 'nb');
  });
  return ansatte;
}

function summarizeMaanedAnsatte(ansatte) {
  const sum = (Array.isArray(ansatte) ? ansatte : []).reduce(function (acc, row) {
    return {
      dager: acc.dager + Number(row.dager || 0),
      registreringer: acc.registreringer + Number(row.registreringer || 0),
      nettoMin: acc.nettoMin + Number(row.nettoMin || 0),
      pauseMin: acc.pauseMin + Number(row.pauseMin || 0),
      ordinarMin: acc.ordinarMin + Number(row.ordinarMin || 0),
      overtidMin: acc.overtidMin + Number(row.overtidMin || 0),
      overtidsbelop: acc.overtidsbelop + Number(row.overtidsbelop || 0),
      lonnKr: acc.lonnKr + Number(row.lonnKr || 0)
    };
  }, {
    dager: 0,
    registreringer: 0,
    nettoMin: 0,
    pauseMin: 0,
    ordinarMin: 0,
    overtidMin: 0,
    overtidsbelop: 0,
    lonnKr: 0
  });
  return {
    ...sum,
    ordinarTimer: minutesToDecimalHours(sum.ordinarMin),
    overtidTimer: minutesToDecimalHours(sum.overtidMin),
    timer: minutesToDecimalHours(sum.nettoMin),
    pauseTimer: minutesToDecimalHours(sum.pauseMin)
  };
}

function canViewAllTimereg(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return Array.isArray(user.permissions) && user.permissions.includes('brukere');
}

function canApproveTimereg(user) {
  return !!user?.isAdmin;
}

function maskTimeregStatusForViewer(item, viewer) {
  if (!item) return item;
  if (!canApproveTimereg(viewer) && item.status === 'godkjent') {
    return { ...item, status: 'fullfort' };
  }
  return item;
}

function maskTimeregLonnForViewer(item, viewer) {
  if (!item) return item;
  if (canViewAllTimereg(viewer)) return item;
  const next = { ...item, timelonn: 0, overtidsprosent: 0 };
  if (next.stats && typeof next.stats === 'object') {
    next.stats = {
      ...next.stats,
      lonnKr: 0,
      overtidsbelop: 0,
      timesats: 0,
      overtidsprosent: 0
    };
  }
  return next;
}

function maskTimeregForViewer(item, viewer) {
  return maskTimeregLonnForViewer(maskTimeregStatusForViewer(item, viewer), viewer);
}

function normalizeTimeregNotat(value) {
  return String(value || '').trim();
}

module.exports = {
  NORSK_TIDSSONE,
  nowOsloDate,
  nowOsloTime,
  parsePauser,
  parseTimeToMinutes,
  minutesToDisplay,
  minutesToDecimalHours,
  MIN_OVERTIDSPROSENT,
  normalizeOvertidsprosent,
  calcTimeregStats,
  beregnOvertidForPoster,
  isTimeregLaast,
  mapTimeregistreringRow,
  weekStartIso,
  addDaysIso,
  monthRangeIso,
  currentOsloYearMonth,
  aggregateTimeregByUser,
  buildMaanedAnsatteList,
  summarizeMaanedAnsatte,
  canViewAllTimereg,
  canApproveTimereg,
  maskTimeregStatusForViewer,
  maskTimeregLonnForViewer,
  maskTimeregForViewer,
  normalizeTimeregNotat
};
