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

const DEFAULT_DAG_GRENSE_MIN = 9 * 60;
const DEFAULT_UKE_GRENSE_MIN = 40 * 60;
const MIN_OVERTIDSPROSENT = 40;

function normalizeOvertidsprosent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_OVERTIDSPROSENT) return MIN_OVERTIDSPROSENT;
  return n;
}

function normalizeDagligGrenseMin(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 60 || n > 24 * 60) return DEFAULT_DAG_GRENSE_MIN;
  return n;
}

function normalizeUentligGrenseMin(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 60 || n > 7 * 24 * 60) return DEFAULT_UKE_GRENSE_MIN;
  return n;
}

function timerTilMinutter(timer, fallbackMin) {
  const n = Number(String(timer ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return fallbackMin;
  return Math.round(n * 60);
}

function normalizeUkeStart(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'sunday' || key === 'søndag' || key === 'sondag') return 'sunday';
  if (key === 'saturday' || key === 'lørdag' || key === 'lordag') return 'saturday';
  return 'monday';
}

function lesDagligGrenseMin(data) {
  if (!data) return DEFAULT_DAG_GRENSE_MIN;
  if (data.dagligOvertidMin != null && data.dagligOvertidMin !== '') return normalizeDagligGrenseMin(data.dagligOvertidMin);
  if (data.daglig_overtid_min != null && data.daglig_overtid_min !== '') return normalizeDagligGrenseMin(data.daglig_overtid_min);
  if (data.dagligOvertidTimer != null && data.dagligOvertidTimer !== '') {
    return normalizeDagligGrenseMin(timerTilMinutter(data.dagligOvertidTimer, DEFAULT_DAG_GRENSE_MIN));
  }
  return DEFAULT_DAG_GRENSE_MIN;
}

function lesUentligGrenseMin(data) {
  if (!data) return DEFAULT_UKE_GRENSE_MIN;
  if (data.ukentligOvertidMin != null && data.ukentligOvertidMin !== '') return normalizeUentligGrenseMin(data.ukentligOvertidMin);
  if (data.ukentlig_overtid_min != null && data.ukentlig_overtid_min !== '') return normalizeUentligGrenseMin(data.ukentlig_overtid_min);
  if (data.ukentligOvertidTimer != null && data.ukentligOvertidTimer !== '') {
    return normalizeUentligGrenseMin(timerTilMinutter(data.ukentligOvertidTimer, DEFAULT_UKE_GRENSE_MIN));
  }
  return DEFAULT_UKE_GRENSE_MIN;
}

function belopOre(minutter, timesatsKr) {
  const min = Math.max(0, Math.round(Number(minutter) || 0));
  const sats = Math.max(0, Math.round(Number(timesatsKr) || 0));
  if (!min || !sats) return 0;
  return Math.round(min * sats * 100 / 60);
}

function tilleggOre(overtidMin, timesatsKr, prosent) {
  const min = Math.max(0, Math.round(Number(overtidMin) || 0));
  const sats = Math.max(0, Math.round(Number(timesatsKr) || 0));
  const pst = normalizeOvertidsprosent(prosent);
  if (!min || !sats) return 0;
  return Math.round(min * sats * pst / 60);
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
  const ordinarLonnOre = belopOre(nettoMin, timelonn);

  return {
    bruttoMin,
    pauseMin,
    pauseMinutter: pauseMin,
    nettoMin,
    faktiskMin: nettoMin,
    workedMin: nettoMin,
    timer: minutesToDecimalHours(nettoMin),
    timesats: timelonn,
    dagligGrenseMin: normalizeDagligGrenseMin(entry.dagligGrenseMin),
    ukentligGrenseMin: normalizeUentligGrenseMin(entry.ukentligGrenseMin),
    ordinarMin: nettoMin,
    ordinarTimer: minutesToDecimalHours(nettoMin),
    overtidMin: 0,
    overtidTimer: 0,
    overtidDagMin: 0,
    overtidUkeMin: 0,
    overtidsprosent: prosent,
    ordinærLonnOre: ordinarLonnOre,
    overtidsbelopOre: 0,
    lonnOre: ordinarLonnOre,
    overtidsbelop: 0,
    lonnKr: ordinarLonnOre / 100,
    display: minutesToDisplay(nettoMin),
    pauseDisplay: minutesToDisplay(pauseMin)
  };
}

function settOvertidStats(item, dagOt, ukeOt) {
  const nettoMin = Math.max(0, Number(item.stats?.nettoMin) || 0);
  const dag = Math.max(0, Math.round(dagOt) || 0);
  const uke = Math.max(0, Math.round(ukeOt) || 0);
  const overtidMin = dag + uke;
  const ordinarMin = Math.max(0, nettoMin - overtidMin);
  const prosent = normalizeOvertidsprosent(item.overtidsprosent);
  const timesats = Math.max(0, Math.round(Number(item.timelonn) || 0));
  const ordinærLonnOre = belopOre(nettoMin, timesats);
  const overtidsbelopOre = tilleggOre(overtidMin, timesats, prosent);
  item.overtidsprosent = prosent;
  item.stats = {
    ...item.stats,
    timesats: timesats,
    workedMin: nettoMin,
    ordinarMin: ordinarMin,
    ordinarTimer: minutesToDecimalHours(ordinarMin),
    overtidMin: overtidMin,
    overtidTimer: minutesToDecimalHours(overtidMin),
    overtidDagMin: dag,
    overtidUkeMin: uke,
    overtidsprosent: prosent,
    ordinærLonnOre: ordinærLonnOre,
    overtidsbelopOre: overtidsbelopOre,
    lonnOre: ordinærLonnOre + overtidsbelopOre,
    overtidsbelop: overtidsbelopOre / 100,
    lonnKr: (ordinærLonnOre + overtidsbelopOre) / 100
  };
}

function erTimeregFerdige(item) {
  return item && item.stats && item.status !== 'aktiv' && item.status !== 'pause';
}

function sorterTimeregPoster(poster) {
  return poster.slice().sort(function (a, b) {
    return String(a.dato).localeCompare(String(b.dato))
      || String(a.startTid || '').localeCompare(String(b.startTid || ''))
      || Number(a.id) - Number(b.id);
  });
}

/**
 * Daglig overtid = maks(0, arbeidstid - daggrense).
 * Ukeoverskudd = maks(0, ukesum - ukegrense).
 * Ekstra ukentlig overtid = maks(0, ukeoverskudd - sum daglig overtid).
 * Lønn = alle minutter × timesats + overtidminutter × prosent × timesats.
 */
function beregnOvertidForUke(poster) {
  const sortert = sorterTimeregPoster(poster);
  const byDay = {};
  sortert.forEach(function (item) {
    if (!byDay[item.dato]) byDay[item.dato] = [];
    byDay[item.dato].push(item);
  });
  const dager = Object.keys(byDay).sort();
  const ukeGrense = sortert.reduce(function (grense, item) {
    const n = Number(item.ukentligGrenseMin);
    return n > 0 ? n : grense;
  }, DEFAULT_UKE_GRENSE_MIN);

  let weekWorked = 0;
  let weekDaily = 0;
  const dayInfo = dager.map(function (dato) {
    const dagPoster = byDay[dato];
    const grense = normalizeDagligGrenseMin(dagPoster[0] && dagPoster[0].dagligGrenseMin);
    let brukt = 0;
    let dayWorked = 0;
    dagPoster.forEach(function (item) {
      const netto = Math.max(0, Number(item.stats.nettoMin) || 0);
      dayWorked += netto;
      const plass = Math.max(0, grense - brukt);
      item._dagOt = Math.max(0, netto - plass);
      item._vanlig = netto - item._dagOt;
      brukt += netto;
      item.stats = { ...item.stats, dagligGrenseMin: grense, ukentligGrenseMin: ukeGrense };
    });
    weekWorked += dayWorked;
    weekDaily += Math.max(0, dayWorked - grense);
    return { dagPoster: dagPoster };
  });

  const weeklyExcess = Math.max(0, weekWorked - ukeGrense);
  let additional = Math.max(0, weeklyExcess - weekDaily);
  for (let i = dayInfo.length - 1; i >= 0 && additional > 0; i -= 1) {
    const dagPoster = dayInfo[i].dagPoster;
    for (let j = dagPoster.length - 1; j >= 0 && additional > 0; j -= 1) {
      const item = dagPoster[j];
      const take = Math.min(item._vanlig, additional);
      item._ukeOt = take;
      additional -= take;
    }
  }
  dayInfo.forEach(function (info) {
    info.dagPoster.forEach(function (item) {
      settOvertidStats(item, item._dagOt || 0, item._ukeOt || 0);
      delete item._dagOt;
      delete item._ukeOt;
      delete item._vanlig;
    });
  });
}

function beregnOvertidForAnsatt(poster) {
  const ferdige = (poster || []).filter(erTimeregFerdige);
  const timelonnet = ferdige.some(function (item) { return Number(item.timelonn) > 0; });
  if (!timelonnet) {
    ferdige.forEach(function (item) { settOvertidStats(item, 0, 0); });
    return;
  }

  const ukeStart = normalizeUkeStart((ferdige.find(function (item) { return item.ukeStart; }) || {}).ukeStart);
  const byWeek = {};
  ferdige.forEach(function (item) {
    const start = weekStartIso(item.dato, ukeStart);
    if (!byWeek[start]) byWeek[start] = [];
    byWeek[start].push(item);
  });
  Object.keys(byWeek).forEach(function (start) {
    beregnOvertidForUke(byWeek[start]);
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
    merkTimeregAvvik(byUser[key]);
  });
  return items;
}

function datoTilDagNr(iso) {
  const d = new Date(String(iso) + 'T12:00:00Z');
  return Math.floor(d.getTime() / 86400000);
}

function vaktIntervall(dato, startTid, sluttTid) {
  const day = datoTilDagNr(dato) * 1440;
  const start = day + parseTimeToMinutes(startTid);
  let end = day + parseTimeToMinutes(sluttTid);
  const krysser = end < start;
  if (krysser) end += 1440;
  return { day: day, start: start, end: end, krysser: krysser };
}

function validerTimeregPost(post, andre) {
  const feil = [];
  if (!post || !post.dato || !post.startTid || !post.sluttTid) return feil;
  const startMin = parseTimeToMinutes(post.startTid);
  const sluttMin = parseTimeToMinutes(post.sluttTid);
  if (sluttMin === startMin) feil.push('Ut-tid kan ikke være lik inn-tid.');
  if (sluttMin < startMin && !post.overMidnatt) {
    feil.push('Ut-tid er før inn-tid. Bekreft at vakten går over midnatt.');
  }
  const vakt = vaktIntervall(post.dato, post.startTid, post.sluttTid);
  const pauser = Array.isArray(post.pauser) ? post.pauser : [];
  const pInts = [];
  pauser.forEach(function (p, idx) {
    const label = 'Pause ' + (idx + 1);
    if (!p || !p.start || !p.slutt) {
      feil.push(label + ' må ha både fra og til.');
      return;
    }
    let ps = vakt.day + parseTimeToMinutes(p.start);
    let pe = vakt.day + parseTimeToMinutes(p.slutt);
    if (vakt.krysser && ps < vakt.start) ps += 1440;
    if (vakt.krysser && pe < vakt.start) pe += 1440;
    if (pe <= ps) {
      feil.push(label + ' kan ikke være negativ eller uten varighet.');
      return;
    }
    if (ps < vakt.start || pe > vakt.end) {
      feil.push('Pause kan ikke ligge utenfor registrert arbeidstid.');
      return;
    }
    pInts.push({ ps: ps, pe: pe });
  });
  pInts.sort(function (a, b) { return a.ps - b.ps; });
  for (let i = 1; i < pInts.length; i += 1) {
    if (pInts[i].ps < pInts[i - 1].pe) {
      feil.push('Pauser kan ikke overlappe hverandre.');
      break;
    }
  }
  let overlapp = false;
  (andre || []).forEach(function (annen) {
    if (overlapp || !annen) return;
    if (post.id != null && Number(annen.id) === Number(post.id)) return;
    if (!annen.dato || !annen.startTid || !annen.sluttTid) return;
    if (annen.status === 'aktiv' || annen.status === 'pause') return;
    const b = vaktIntervall(annen.dato, annen.startTid, annen.sluttTid);
    if (vakt.start < b.end && b.start < vakt.end) overlapp = true;
  });
  if (overlapp) feil.push('Arbeidspass kan ikke overlappe en annen registrering.');
  return Array.from(new Set(feil));
}

function merkTimeregAvvik(items) {
  (items || []).forEach(function (item) {
    if (!erTimeregFerdige(item)) {
      item.avvik = [];
      return;
    }
    item.avvik = validerTimeregPost({
      id: item.id,
      dato: item.dato,
      startTid: item.startTid,
      sluttTid: item.sluttTid,
      pauser: item.pauser,
      overMidnatt: true
    }, items);
  });
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
    dagligGrenseMin: normalizeDagligGrenseMin(row.daily_threshold_minutes),
    ukentligGrenseMin: normalizeUentligGrenseMin(row.weekly_threshold_minutes),
    ukeStart: normalizeUkeStart(row.uke_start),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  return { ...item, stats: calcTimeregStats(item) };
}

function weekStartIso(dateIso, ukeStart) {
  const target = normalizeUkeStart(ukeStart) === 'sunday'
    ? 0
    : normalizeUkeStart(ukeStart) === 'saturday'
      ? 6
      : 1;
  const d = new Date(String(dateIso || nowOsloDate()) + 'T12:00:00');
  const day = d.getDay();
  const diff = (day - target + 7) % 7;
  d.setDate(d.getDate() - diff);
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
        overtidsbelopOre: 0,
        lonnOre: 0,
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
    u.overtidsbelopOre += item.stats.overtidsbelopOre || 0;
    u.lonnOre += item.stats.lonnOre || 0;
    u.overtidsbelop += (item.stats.overtidsbelopOre || 0) / 100;
    u.lonnKr += (item.stats.lonnOre || 0) / 100;
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
      overtidsbelopOre: u.overtidsbelopOre,
      lonnOre: u.lonnOre,
      ordinærLonnOre: u.lonnOre - u.overtidsbelopOre,
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
    overtidsbelopOre: 0,
    lonnOre: 0,
    ordinærLonnOre: 0,
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
      overtidsbelopOre: acc.overtidsbelopOre + Number(row.overtidsbelopOre || 0),
      lonnOre: acc.lonnOre + Number(row.lonnOre || 0)
    };
  }, {
    dager: 0,
    registreringer: 0,
    nettoMin: 0,
    pauseMin: 0,
    ordinarMin: 0,
    overtidMin: 0,
    overtidsbelopOre: 0,
    lonnOre: 0
  });
  return {
    ...sum,
    ordinærLonnOre: sum.lonnOre - sum.overtidsbelopOre,
    overtidsbelop: sum.overtidsbelopOre / 100,
    lonnKr: sum.lonnOre / 100,
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
      lonnOre: 0,
      ordinærLonnOre: 0,
      overtidsbelop: 0,
      overtidsbelopOre: 0,
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
  DEFAULT_DAG_GRENSE_MIN,
  DEFAULT_UKE_GRENSE_MIN,
  normalizeOvertidsprosent,
  normalizeDagligGrenseMin,
  normalizeUentligGrenseMin,
  normalizeUkeStart,
  lesDagligGrenseMin,
  lesUentligGrenseMin,
  timerTilMinutter,
  belopOre,
  tilleggOre,
  calcTimeregStats,
  beregnOvertidForPoster,
  validerTimeregPost,
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
