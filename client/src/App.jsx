import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useIsMobile from './useIsMobile.js';
import Login from './components/Login.jsx';
import InnkjopskalkyleView from './components/InnkjopskalkyleView.jsx';
import OkonomiView from './components/OkonomiView.jsx';
import BilReservasjonTab from './components/BilReservasjonTab.jsx';
import TimeregistreringView from './components/TimeregistreringView.jsx';
import ChassisScanPanel from './components/ChassisScanPanel.jsx';
import {
  buildInnbytteTilbudMelding,
  buildInnbytteVisningMelding,
  buildSelgBilTilbudMelding,
  buildSelgBilVisningMelding,
  DEFAULT_TILBUD_EPOST_MALER,
  TILBUD_EPOST_MAL_DEFS,
  normalizeTilbudEpostMaler
} from './lib/tilbudEpostMaler.js';
import SignatureEditor, { buildSignaturePreviewHtml } from './components/SignatureEditor.jsx';
import MailComposer, { buildMailPreviewHtml, cleanComposeHtml, htmlIsEmpty } from './components/MailComposer.jsx';
import {
  canFinnMarkedsSok,
  finnMarkedsSokFilterText,
  finnMarkedsSokLabel,
  openFinnMarkedsSok
} from './finnMarkedssok.js';
import { matchesInnbytteTilBil } from './lib/innbytteBilMatch.js';
import {
  DEFAULT_INNSTILLINGER, SFARGE, KFARGE, TAB_PERMISSIONS, canAccess, canDeleteBil, canAddBil, displayRole,
  canDeleteHenvKommentar, createHenvKommentar, normalizeInternKommentarer, formatKommentarDato, bilMatchesSearch,
  normalizeHenvStatusFarger, normalizeBilStatusFarger, DEFAULT_HENV_STATUS_FARGER,
  DEFAULT_INNBYTTE_STATUS_FARGER, normalizeInnbytteStatusFarger,
  DEFAULT_BIL_STATUS_FARGER, DEFAULT_SJEKKLISTE_MAL, DEFAULT_BIL_SJEKKLISTER,
  getAktivSjekkliste, withSjekklisteUpdate, withStatusChange,
  initBilSjekklister, normalizeBilSjekklister, syncBilSjekklisterFromMal,
  mergeOrphanSjekklisteItemsIntoMal,
  calcSjekklisteFremdrift, harApneObligatoriskeOppgaver, getSisteKryssedeSjekklisteItem, normalizeSjekklisteMalItems,
  finalizeSjekklisteMalItems, trimSjekklisteMalTekst, coerceSjekklisteMalRows,
  statusBadgeStyle, statusCardStyle, resolveListStatus,
  getSavedTab, saveActiveTab, clearActiveTab, getSavedBilerView, saveBilerView,
  getSavedBilerSection, saveBilerSection,
  buildModulTabs, normalizeModulOppsett, DEFAULT_MODUL_OPPSATT, MODUL_ICONS, getDefaultTabForUser,
  buildNyeHenvendelserItems,
  sortItemsNyestFirst,
  ansvarligSelectOptions,   normalizeBilOkonomi, mergeBilOkonomi, calcBilOkonomi,
  okonomiBelopDisplay, monetaryInputDisplay, okonomiBelopValue,
  formatProfittUke, parseProfittUke, getCurrentProfittUke, getIsoWeeksInYear, formatProfittUkeLabel,
  normalizeEuKontrollDato, formatEuKontrollVisning, euKontrollChipClass,
  getVehicleFromSvvData, getRegistreringsstatusFromSvvData, registreringsstatusChip, formatSvvFargeNavn,
  normalizeBilReg, isValidBilReg, hasAutosysVehicleData,
  buildMerkeOptions, resolveMerkeFromLists, formatBilFarge,
  buildFullBilModellFromVehicle,
  BIL_AUTOSYS_FELTER, getBilAutosysOverstyrt, markBilAutosysOverstyrt,
  mergeAutosysOverstyrtIntoSvvData, buildAutosysBilFelt,
  parseNumberInput, numberInputDisplay, numberInputForSave, kmInputDisplay, kmInputForSave, normalizeKmValue, BIL_NUMERIC_FIELDS,
  BIL_AUTOSYS_TEXT_FIELDS, BIL_DEBOUNCED_TEXT_FIELDS, BIL_LOCAL_TEXT_PRESERVE_FIELDS,
  mergeBilDebouncedTextFields, patchIsDebouncedTextOnly, patchRequiresAtomicAutosysSave,
  DEFAULT_BIL_TILSTANDSRAPPORT, normalizeBilTilstandsrapport, bilManglerTilstandsrapport,
  tilstandsrapportDelerChips, bilTilstandsrapportNodvendigRader, bilTilstandsrapportNodvendigFilterOptions,
  DEFAULT_BIL_ARSPROVEKJENNEMERKE, normalizeBilArsprovekjennemerke,
  ARSPROVEKJENNEMERKE_STATUSER, arsprovekjennemerkeStatusLabel,
  PROVASKILT_SETT, normalizeProvaskiltId, finnBilMedProvaskilt, erArsprovekjennemerkeIbruk,
  canViewVedlikehold, canToggleVedlikehold
} from './constants.js';
import {
  getToken, logout,
  changeMyPassword,
  getDashboard, getBootstrap, getSyncRevision, getNettsideDrift, getSitePreviewUrl, getVedlikehold, getHenvendelser, patchHenvendelse, deleteHenvendelse,
  getInnbytte, patchInnbytte, deleteInnbytte, sendInnbytteTilbud as sendInnbytteTilbudApi, lookupFinnAnnonse as fetchFinnAnnonseApi,
  getSelgBil, patchSelgBil, deleteSelgBil, sendSelgBilTilbud as sendSelgBilTilbudApi,
  getKunder, getKundeAktivitet, postKunde, patchKunde, deleteKunde,
  getBiler, getBil, postBil, patchBil, deleteBil as deleteBilApi, getBilSlettelog, reorderBiler as reorderBilerApi, uploadBilDokumenter, syncBilerEuKontroll, syncFinnBilerStatus,
  getKalender, postKalender, patchKalender, deleteKalender,
  getInnkjopskalkyle,
  lookupKjoretoy, lookupKjoretoyByUnderstell, getInnstillinger, getLister, patchInnstillinger,
  getInnboks, getInnboksMapper, createInnboksMappe, flyttEpost, deleteEpost, downloadEpostVedlegg, getEpostById,
  getMailStatus,
  syncInnboks, patchEpost, sendEpostMultipart, getEpostUtkast, getEpostUtkastById, saveEpostUtkast, deleteEpostUtkast,
  sendHenvendelseSvar, getMailKontoer, postMailKonto, patchMailKonto, deleteMailKonto, testMailKonto,
  getEpostMaler, postEpostMal, patchEpostMal, deleteEpostMal,
  getBrukereMeta, getBrukere, postBruker, patchBruker, deleteBruker
} from './api.js';

// ─── DATE HELPERS ────────────────────────────────────────────────────────────
const NORSK_TIDSSONE = 'Europe/Oslo';

function idag() {
  // toISOString er UTC og gir feil dato rundt midnatt norsk tid.
  return new Date().toLocaleDateString('sv-SE', { timeZone: NORSK_TIDSSONE });
}

function formatDatoLang() {
  return new Date().toLocaleDateString('nb-NO', {
    timeZone: NORSK_TIDSSONE,
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
  const slutt = kalEffectiveSlutt(e);
  if (slutt && slutt !== e.tid) return `${e.tid}–${slutt}`;
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
export function Badge({ s, colors }) {
  return (
    <span className="badge" style={statusBadgeStyle(s, colors)}>
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

function formatForventningDisplay(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  const n = Number(digits);
  if (digits && Number.isFinite(n) && n > 0 && !raw.replace(/[\d\s.,]/g, '')) {
    return nok(n);
  }
  return raw;
}

function svvFarge(c) {
  const navn = formatSvvFargeNavn(c);
  const m = {
    HVIT: '#f9fafb', SORT: '#111827', SØLV: '#9ca3af', GRÅ: '#6b7280',
    BLÅ: '#1d4ed8', RØD: '#dc2626', GRØNN: '#16a34a', BRUN: '#78350f',
    GULL: '#b45309', ORANSJE: '#ea580c', FIOLETT: '#7c3aed', BEIGE: '#d4c5a9'
  };
  return m[navn?.toUpperCase()] || '#6b7280';
}

function fmtKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toLocaleString('nb-NO');
}

function fmtKmLabel(km) {
  const formatted = fmtKm(km);
  return formatted ? `${formatted} km` : '';
}

function matchesBilRef(ref, reg) {
  if (!ref || !reg) return false;
  return String(ref).trim().toUpperCase() === String(reg).trim().toUpperCase();
}

function matchesEpostTilBil(e, bil, henv) {
  if (!e || !bil?.reg) return false;
  if (e.henvendelseId) {
    const h = (henv || []).find(function (x) { return x.id === e.henvendelseId; });
    if (h && matchesBilRef(h.bilRef, bil.reg)) return true;
  }
  return false;
}

function countBilHenvendelser(bil, henv, innbytte, epost, inkluderEpost) {
  let total = (henv || []).filter(function (h) { return matchesBilRef(h.bilRef, bil.reg); }).length;
  total += (innbytte || []).filter(function (i) { return matchesInnbytteTilBil(i, bil); }).length;
  if (inkluderEpost) {
    total += (epost || []).filter(function (e) { return matchesEpostTilBil(e, bil, henv); }).length;
  }
  return total;
}

function buildBilHenvendelseItems(bil, henv, innbytte, epost, inkluderEpost) {
  const items = [];

  (henv || []).filter(function (h) { return matchesBilRef(h.bilRef, bil.reg); }).forEach(function (h) {
    items.push({
      key: 'henv-' + h.id,
      type: 'kontaktskjema',
      typeLabel: 'Kontaktskjema',
      dato: h.dato || '',
      title: h.emne || '—',
      sub: [h.navn, h.epost].filter(Boolean).join(' · ') || '—',
      meta: h.ansvarlig || 'Ikke tildelt',
      badge: h.status,
      badgeKind: 'henv',
      data: h,
      sortDato: h.dato || ''
    });
  });

  (innbytte || []).filter(function (i) { return matchesInnbytteTilBil(i, bil); }).forEach(function (i) {
    items.push({
      key: 'inb-' + i.id,
      type: 'innbytte',
      typeLabel: 'Innbytte',
      dato: i.dato || '',
      title: [i.merke, i.modell, i.aar].filter(Boolean).join(' ') || 'Innbytte',
      sub: i.reg ? `Innbyttebil: ${i.reg}` : (i.navn || '—'),
      meta: i.ansvarlig || 'Ikke tildelt',
      badge: i.status,
      badgeKind: 'innbytte',
      data: i,
      sortDato: i.dato || ''
    });
  });

  if (inkluderEpost) {
    (epost || []).filter(function (e) { return matchesEpostTilBil(e, bil, henv); }).forEach(function (e) {
      items.push({
        key: 'epost-' + e.id,
        type: 'epost',
        typeLabel: 'E-post',
        dato: e.dato || e.sortDato || '',
        title: e.emne || '(Uten emne)',
        sub: e.fraNavn || e.fraEpost || '—',
        meta: e.retning === 'ut' ? 'Utgående' : 'Innkommende',
        badge: e.lest ? 'Lest' : 'Ulest',
        badgeKind: 'epost',
        data: e,
        sortDato: e.sortDato || e.dato || ''
      });
    });
  }

  return items.sort(function (a, b) {
    return String(b.sortDato || '').localeCompare(String(a.sortDato || ''));
  });
}

function bilStatusFarge(status, lists) {
  return (lists?.bilStatusFarger && lists.bilStatusFarger[status])
    || SFARGE[status]
    || '#888';
}

function kanbanStatuses(lists, biler) {
  const base = Array.isArray(lists?.bilStatuser) ? [...lists.bilStatuser] : [];
  (biler || []).forEach(function (bil) {
    if (bil.status && !base.includes(bil.status)) base.push(bil.status);
  });
  return base;
}

function sortBilerListe(a, b) {
  const aNum = a.pipelineNummer;
  const bNum = b.pipelineNummer;
  const aHas = aNum != null && Number.isFinite(Number(aNum));
  const bHas = bNum != null && Number.isFinite(Number(bNum));
  if (aHas && bHas && Number(aNum) !== Number(bNum)) return Number(aNum) - Number(bNum);
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || normalizeBilId(a.id) - normalizeBilId(b.id);
}

function groupBilerByStatus(biler, statuser) {
  const groups = {};
  statuser.forEach(function (status) { groups[status] = []; });
  (biler || []).forEach(function (bil) {
    const key = bil.status;
    if (!groups[key]) groups[key] = [];
    groups[key].push(bil);
  });
  statuser.forEach(function (status) {
    groups[status].sort(sortBilerListe);
  });
  return groups;
}

function normalizeBilId(id) {
  return Number(id);
}

function computeListeReorder(allBiler, dragId, targetStatus, beforeId) {
  const dragNum = normalizeBilId(dragId);
  const dragged = allBiler.find(function (b) { return normalizeBilId(b.id) === dragNum; });
  if (!dragged) return [];

  const oldStatus = dragged.status;
  const targetItems = allBiler
    .filter(function (b) { return b.status === targetStatus && normalizeBilId(b.id) !== dragNum; })
    .sort(sortBilerListe);

  let insertIdx = beforeId == null
    ? targetItems.length
    : targetItems.findIndex(function (b) { return normalizeBilId(b.id) === normalizeBilId(beforeId); });
  if (insertIdx < 0) insertIdx = targetItems.length;

  targetItems.splice(insertIdx, 0, { ...dragged, status: targetStatus });

  const updates = [];
  targetItems.forEach(function (b, i) {
    const sortOrder = (i + 1) * 10;
    if (normalizeBilId(b.id) === dragNum || b.sortOrder !== sortOrder || b.status !== targetStatus) {
      updates.push({ id: normalizeBilId(b.id), status: targetStatus, sortOrder: sortOrder });
    }
  });

  if (oldStatus !== targetStatus) {
    allBiler
      .filter(function (b) { return b.status === oldStatus && normalizeBilId(b.id) !== dragNum; })
      .sort(sortBilerListe)
      .forEach(function (b, i) {
        const sortOrder = (i + 1) * 10;
        if (b.sortOrder !== sortOrder) {
          updates.push({ id: normalizeBilId(b.id), status: oldStatus, sortOrder: sortOrder });
        }
      });
  }

  return updates;
}

function bilLoggEntry(tekst) {
  return {
    tekst: tekst,
    dato: new Date().toLocaleString('nb-NO', { timeZone: NORSK_TIDSSONE }),
    av: 'Admin'
  };
}

function isBilAktiv(b) {
  return !b.archived;
}

function bilMerker(biler) {
  const names = new Set();
  (biler || []).forEach(function (b) {
    if (b.merke && isBilAktiv(b) && b.status !== 'Solgt') names.add(b.merke);
  });
  return ['Alle', ...Array.from(names).sort(function (a, b) {
    if (a === 'Annet') return 1;
    if (b === 'Annet') return -1;
    return a.localeCompare(b, 'nb');
  })];
}

const SESSION_CACHE_KEY = 'xbilsenter_admin_session_cache';

function readSessionCache() {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.user || !parsed?.lists) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(user, lists) {
  if (!user || !lists) return;
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ user, lists }));
  } catch {
    /* ignore */
  }
}

function clearSessionCache() {
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

const BILER_CACHE_KEY = 'xbilsenter_admin_biler_cache';
const STATS_CACHE_KEY = 'xbilsenter_admin_stats_cache';
const INNBOKS_CACHE_KEY = 'xbilsenter_admin_innboks_cache';
const INNBOKS_KONTO_KEY = 'xbilsenter_admin_innboks_konto';

function readInnboksCacheStore() {
  try {
    const raw = sessionStorage.getItem(INNBOKS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readInnboksCacheEntry(key) {
  const items = readInnboksCacheStore()[key];
  return Array.isArray(items) ? items : null;
}

function writeInnboksCacheEntry(key, items) {
  if (!Array.isArray(items)) return;
  try {
    const store = readInnboksCacheStore();
    store[key] = items;
    sessionStorage.setItem(INNBOKS_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function clearInnboksCacheStore(kontoId) {
  try {
    if (!kontoId) {
      sessionStorage.removeItem(INNBOKS_CACHE_KEY);
      return;
    }
    const store = readInnboksCacheStore();
    const prefix = String(kontoId) + ':';
    Object.keys(store).forEach(function (key) {
      if (key.startsWith(prefix)) delete store[key];
    });
    sessionStorage.setItem(INNBOKS_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function readInnboksKontoFallback() {
  try {
    const raw = sessionStorage.getItem(INNBOKS_KONTO_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function writeInnboksKontoFallback(kontoId) {
  if (!kontoId) return;
  try {
    sessionStorage.setItem(INNBOKS_KONTO_KEY, String(kontoId));
  } catch {
    /* ignore */
  }
}

function readBilerCache() {
  try {
    const raw = sessionStorage.getItem(BILER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeBilerCache(biler) {
  if (!Array.isArray(biler)) return;
  try {
    sessionStorage.setItem(BILER_CACHE_KEY, JSON.stringify(biler));
  } catch {
    /* ignore */
  }
}

function clearBilerCache() {
  try {
    sessionStorage.removeItem(BILER_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function readStatsCache() {
  try {
    const raw = sessionStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStatsCache(stats) {
  try {
    sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats || {}));
  } catch {
    /* ignore */
  }
}

function clearStatsCache() {
  try {
    sessionStorage.removeItem(STATS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function normalizeBilItems(items) {
  return (items || []).map(function (item) {
    return {
      ...item,
      id: normalizeBilId(item.id),
      sortOrder: Number(item.sortOrder ?? 0),
      pipelineNummer: item.pipelineNummer != null && item.pipelineNummer !== ''
        ? Number(item.pipelineNummer)
        : null,
      km: normalizeKmValue(item.km)
    };
  });
}

/** Bevarer manuelle endringer og debounced felt når serverdata merges inn. */
function mergeLocalBilFromServer(local, server) {
  if (!server) return local;
  if (!local) return server;
  const overstyrt = getBilAutosysOverstyrt(local);
  const next = mergeBilDebouncedTextFields(server, local);
  BIL_AUTOSYS_FELTER.forEach(function (key) {
    if (overstyrt[key]) next[key] = local[key];
  });
  if (Object.keys(overstyrt).length) {
    next.svvData = mergeAutosysOverstyrtIntoSvvData(server.svvData || local.svvData, overstyrt);
  } else if (local.svvData && !server.svvData) {
    next.svvData = local.svvData;
  }
  return next;
}

function autosysPatchHasPayload(filtered) {
  const patch = filtered?.patch || {};
  return Object.keys(patch).some(function (key) {
    return patch[key] != null;
  });
}

async function applyAutosysFetchResult(result, ctx) {
  const blockIfEdited = function () {
    return !ctx.allowWhileEditing && ctx.userEditedRef.current;
  };

  if (ctx.cancelled()) return { saved: false };
  if (blockIfEdited()) return { saved: false };

  const mergedOverstyrt = {
    ...(result.overstyrt || {}),
    ...(ctx.autosysOverstyrtRef.current || {})
  };
  ctx.autosysOverstyrtRef.current = mergedOverstyrt;
  ctx.setAutosysOverstyrt(mergedOverstyrt);

  if (ctx.cancelled() || blockIfEdited()) return { saved: false };

  const filteredForUi = filterAutosysPatchByOverstyrt(result.patch, result.localUpdate, ctx.autosysOverstyrtRef.current);
  if (!blockIfEdited() && autosysPatchHasPayload(filteredForUi)) {
    ctx.setBil(function (prev) {
      if (blockIfEdited()) return prev;
      const latest = filterAutosysPatchByOverstyrt(
        result.patch, result.localUpdate, ctx.autosysOverstyrtRef.current
      );
      const next = applyAutosysLocalUpdate(prev, latest.localUpdate, ctx.autosysOverstyrtRef.current);
      ctx.bilRef.current = next;
      return next;
    });
  }

  if (ctx.cancelled() || blockIfEdited()) return { saved: false };

  const filteredForSave = filterAutosysPatchByOverstyrt(
    result.patch, result.localUpdate, ctx.autosysOverstyrtRef.current
  );
  if (!autosysPatchHasPayload(filteredForSave)) return { saved: false };

  const saved = await ctx.saveImmediateRef.current(filteredForSave.patch);
  if (ctx.cancelled() || blockIfEdited()) return { saved: false };
  if (!saved) return { saved: false };

  ctx.setBil(function (prev) {
    const next = mergeBilAfterAutosysSave(prev, saved);
    ctx.bilRef.current = next;
    ctx.autosysOverstyrtRef.current = getBilAutosysOverstyrt(next);
    return next;
  });
  ctx.setAutosysOverstyrt(getBilAutosysOverstyrt(saved));
  return { saved: true };
}

function mergeAutosysOverstyrtFlags(fromAutosys, current) {
  return { ...(fromAutosys || {}), ...(current || {}) };
}

/** Bevarer lokale tekstfelt på bil som er åpen i modal under bakgrunnssync. */
function mergeBilerFromServer(prev, serverItems, openBilId) {
  const openId = openBilId != null ? normalizeBilId(openBilId) : null;
  return serverItems.map(function (serverBil) {
    const id = normalizeBilId(serverBil.id);
    if (!openId || openId !== id) return serverBil;
    const local = prev.find(function (b) { return normalizeBilId(b.id) === id; });
    return local ? mergeLocalBilFromServer(local, serverBil) : serverBil;
  });
}

const LIVE_SYNC_MS = 5000;

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [coreLoading, setCoreLoading] = useState(!!getToken());
  const [dataLoading, setDataLoading] = useState(false);
  const [tab, setTabState] = useState(getSavedTab);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const setTab = useCallback(function (next) {
    setTabState(next);
    saveActiveTab(next);
    setMobileNavOpen(false);
  }, []);
  const [biler, setBiler] = useState(function () {
    return normalizeBilItems(readBilerCache()) || [];
  });
  const bilerRef = useRef(biler);
  bilerRef.current = biler;
  const [kunder, setKunder] = useState([]);
  const [henv, setHenv] = useState([]);
  const [innbytte, setInnbytte] = useState([]);
  const [selgBil, setSelgBil] = useState([]);
  const [kal, setKal] = useState([]);
  const [innkjopskalkyle, setInnkjopskalkyle] = useState([]);
  const [epost, setEpost] = useState([]);
  const [mailStatus, setMailStatus] = useState({});
  const [stats, setStats] = useState(function () {
    return readStatsCache();
  });
  const [innstillinger, setInnstillinger] = useState(DEFAULT_INNSTILLINGER);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [innboksOpenEpost, setInnboksOpenEpost] = useState(null);

  const visTost = useCallback((m) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const dash = await getDashboard();
      const next = dash.stats || {};
      setStats(next);
      writeStatsCache(next);
    } catch { /* ignore */ }
  }, []);

  const refreshBiler = useCallback(async function () {
    const b = await getBiler({ lite: true });
    const items = normalizeBilItems(b.items);
    setBiler(items);
    writeBilerCache(items);
    return items;
  }, []);

  const hydrateBil = useCallback(function (item) {
    const next = normalizeBilItems([item])[0];
    if (!next) return;
    delete next.lite;
    setBiler(function (prev) {
      return prev.map(function (b) {
        if (b.id !== next.id) return b;
        return mergeLocalBilFromServer(b, next);
      });
    });
    setModal(function (prev) {
      if (prev?.t !== 'visBil' || normalizeBilId(prev.d?.id) !== normalizeBilId(next.id)) return prev;
      return { ...prev, d: mergeLocalBilFromServer(prev.d, next) };
    });
  }, []);

  const loadDashboardLists = useCallback(async function () {
    let authError = null;

    async function safeLoad(loader, onSuccess) {
      try {
        const data = await loader();
        onSuccess(data);
      } catch (err) {
        if (err.status === 401) authError = err;
      }
    }

    try {
      await Promise.all([
        safeLoad(getHenvendelser, (h) => setHenv(h.items || [])),
        safeLoad(getInnbytte, (i) => setInnbytte(i.items || [])),
        safeLoad(getSelgBil, (s) => setSelgBil(s.items || [])),
        safeLoad(getKalender, (k) => setKal(k.items || []))
      ]);
    } catch {
      /* ignore */
    }

    if (authError) {
      logout();
      setUser(null);
    }
  }, []);

  const loadSecondaryData = useCallback(async function () {
    setDataLoading(true);
    let authError = null;

    async function safeLoad(loader, onSuccess) {
      try {
        const data = await loader();
        onSuccess(data);
      } catch (err) {
        if (err.status === 401) authError = err;
      }
    }

    try {
      await Promise.all([
        safeLoad(getKunder, (k) => setKunder(k.items || [])),
        safeLoad(getInnkjopskalkyle, (k) => setInnkjopskalkyle(k.items || [])),
        safeLoad(getVedlikehold, (v) => {
          if (v.vedlikeholdModus) {
            setInnstillinger(function (prev) {
              return { ...prev, vedlikeholdModus: v.vedlikeholdModus };
            });
          }
        }),
        safeLoad(getInnstillinger, (s) => {
          if (s.settings) setInnstillinger(s.settings);
        })
      ]);
    } catch {
      /* ignore */
    }

    if (authError) {
      logout();
      setUser(null);
    }

    setDataLoading(false);

    syncBilerEuKontroll({ onlyMissing: true }).then(function (res) {
      if (!res?.items?.length) return;
      const items = normalizeBilItems(res.items);
      setBiler(items);
      writeBilerCache(items);
      if (res.updated > 0) {
        setToast(`EU-kontroll frist hentet for ${res.updated} bil${res.updated === 1 ? '' : 'er'} ✓`);
        setTimeout(function () { setToast(null); }, 2800);
      }
    }).catch(function () { /* stille bakgrunnssync */ });
  }, []);

  const applyBootstrap = useCallback(function (res) {
    setUser(res.user);
    if (res.lists) {
      setInnstillinger(function (prev) { return { ...prev, ...res.lists }; });
      writeSessionCache(res.user, res.lists);
    }
    if (res.stats && typeof res.stats === 'object') {
      setStats(function (prev) {
        const next = { ...prev, ...res.stats };
        writeStatsCache(next);
        return next;
      });
    }
    if (res.mailStatus && typeof res.mailStatus === 'object') {
      setMailStatus(res.mailStatus);
    }
    if (res.dashboardFeed) {
      if (Array.isArray(res.dashboardFeed.henv)) setHenv(res.dashboardFeed.henv);
      if (Array.isArray(res.dashboardFeed.selgBil)) setSelgBil(res.dashboardFeed.selgBil);
    }
  }, []);

  const scheduleDeferredLoads = useCallback(function () {
    window.setTimeout(function () {
      loadDashboardLists().catch(function () { /* stille bakgrunn */ });
    }, 1200);
    window.setTimeout(function () {
      loadSecondaryData();
    }, 2200);
  }, [loadDashboardLists, loadSecondaryData]);

  const initSession = useCallback(async function () {
    if (!getToken()) {
      setCoreLoading(false);
      return;
    }

    const cached = readSessionCache();
    const hadCache = !!cached;
    if (cached) {
      setUser(cached.user);
      setInnstillinger(function (prev) { return { ...prev, ...cached.lists }; });
      setCoreLoading(false);
    } else {
      setCoreLoading(true);
    }

    refreshBiler().catch(function (err) {
      if (err?.status === 401) {
        logout();
        setUser(null);
        clearSessionCache();
        clearBilerCache();
        clearStatsCache();
      }
    });

    try {
      const res = await getBootstrap();
      applyBootstrap(res);
    } catch {
      logout();
      setUser(null);
      clearSessionCache();
      clearBilerCache();
      clearStatsCache();
      setCoreLoading(false);
      return;
    }

    if (!hadCache) setCoreLoading(false);
    scheduleDeferredLoads();
  }, [applyBootstrap, scheduleDeferredLoads, refreshBiler]);

  const loadData = useCallback(async function () {
    if (!getToken()) return;

    await Promise.all([
      refreshStats().catch(function () {}),
      loadDashboardLists().catch(function () {})
    ]);
  }, [loadDashboardLists, refreshStats]);

  useEffect(function () {
    initSession();
  }, [initSession]);

  useEffect(function () {
    if (biler.length) writeBilerCache(biler);
  }, [biler]);

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

  const modalRef = useRef(modal);
  modalRef.current = modal;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const syncRevisionRef = useRef(null);
  const syncInFlightRef = useRef(false);

  const syncLiveData = useCallback(async function () {
    const openBilId = modalRef.current?.t === 'visBil' ? modalRef.current.d?.id : null;
    const [bilerRes] = await Promise.all([
      getBiler({ lite: true }),
      refreshStats(),
      loadDashboardLists()
    ]);
    const items = normalizeBilItems(bilerRes.items);
    setBiler(function (prev) {
      const next = mergeBilerFromServer(prev, items, openBilId);
      writeBilerCache(next);
      if (openBilId) {
        const serverBil = items.find(function (b) {
          return normalizeBilId(b.id) === normalizeBilId(openBilId);
        });
        const localBil = next.find(function (b) {
          return normalizeBilId(b.id) === normalizeBilId(openBilId);
        });
        if (serverBil && localBil) {
          setModal(function (prevModal) {
            if (prevModal?.t !== 'visBil') return prevModal;
            if (normalizeBilId(prevModal.d?.id) !== normalizeBilId(openBilId)) return prevModal;
            return { ...prevModal, d: mergeLocalBilFromServer(localBil, serverBil) };
          });
        }
      }
      return next;
    });
    if (tabRef.current === 'innboks') {
      reloadInnboks().catch(function () { /* stille */ });
    }
  }, [refreshStats, loadDashboardLists, reloadInnboks]);

  useEffect(function () {
    if (!user || coreLoading) return;

    let cancelled = false;
    let timer = null;

    getSyncRevision().then(function (data) {
      if (!cancelled && data?.revision) syncRevisionRef.current = data.revision;
    }).catch(function () { /* stille */ });

    async function poll() {
      if (cancelled || document.hidden || syncInFlightRef.current) return;
      try {
        const data = await getSyncRevision();
        if (cancelled) return;
        const rev = data?.revision;
        if (!rev) return;
        if (syncRevisionRef.current === null) {
          syncRevisionRef.current = rev;
          return;
        }
        if (rev === syncRevisionRef.current) return;

        syncInFlightRef.current = true;
        syncRevisionRef.current = rev;
        await syncLiveData();
      } catch {
        /* stille bakgrunnssync */
      } finally {
        syncInFlightRef.current = false;
      }
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        poll().finally(schedule);
      }, LIVE_SYNC_MS);
    }

    function onVisibility() {
      if (document.hidden || cancelled) return;
      syncRevisionRef.current = null;
      poll();
    }

    document.addEventListener('visibilitychange', onVisibility);
    schedule();

    return function () {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, coreLoading, syncLiveData]);

  const syncMailStatus = useCallback((status) => {
    if (status) setMailStatus(status);
  }, []);

  useEffect(function () {
    if (!user || coreLoading) return;
    if (tab === 'innstillinger') return;
    const perm = TAB_PERMISSIONS[tab];
    if (perm && canAccess(user, perm)) return;
    const fallback = getDefaultTabForUser(user, innstillinger.modulOppsett);
    if (fallback && fallback !== tab) {
      setTabState(fallback);
      saveActiveTab(fallback);
    }
  }, [user, tab, coreLoading, innstillinger.modulOppsett]);

  useEffect(function () {
    if (!mobileNavOpen) return;
    document.body.style.overflow = 'hidden';
    return function () { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  useEffect(function () {
    function onResize() {
      if (window.innerWidth > 900) setMobileNavOpen(false);
    }
    window.addEventListener('resize', onResize);
    return function () { window.removeEventListener('resize', onResize); };
  }, []);

  const handleLogin = async (u) => {
    setUser(u);
    setCoreLoading(true);
    try {
      const res = await getBootstrap();
      applyBootstrap(res);
      const defaultTab = getDefaultTabForUser(res.user, res.lists?.modulOppsett);
      setTabState(defaultTab);
      saveActiveTab(defaultTab);
      setCoreLoading(false);
      refreshBiler().catch(function () {});
      scheduleDeferredLoads();
    } catch {
      logout();
      setUser(null);
      setCoreLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    clearSessionCache();
    clearBilerCache();
    clearStatsCache();
    clearActiveTab();
    setUser(null);
    setMobileNavOpen(false);
    setBiler([]);
    setKunder([]);
    setHenv([]);
    setInnbytte([]);
    setSelgBil([]);
    setKal([]);
    setEpost([]);
    setMailStatus({});
    setStats({});
    setInnstillinger(DEFAULT_INNSTILLINGER);
  };

  const applyBilPatchLocal = useCallback(function (id, patch) {
    setBiler(function (prev) {
      return prev.map(function (b) {
        if (b.id !== id) return b;
        let next = { ...b, ...patch };
        if (patch.status && patch.status !== b.status && patch.sjekklister == null) {
          next = { ...next, ...withStatusChange(b, patch.status, innstillinger.bilSjekklister) };
        }
        if (patch.sjekklister) {
          next.sjekkliste = getAktivSjekkliste({ ...next, status: next.status });
        }
        return next;
      });
    });
  }, [innstillinger.bilSjekklister]);

  const refreshStatsRef = useRef(refreshStats);
  refreshStatsRef.current = refreshStats;

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  const updateBil = useCallback(async function (id, patch, localMsg) {
    const textOnly = patchIsDebouncedTextOnly(patch);
    if (!textOnly) applyBilPatchLocal(id, patch);
    try {
      const res = await patchBil(id, patch);
      let mergedItem = res.item || null;
      if (res.item) {
        setBiler(function (prev) {
          return prev.map(function (b) {
            if (b.id !== id) return b;
            mergedItem = mergeLocalBilFromServer(b, res.item);
            return mergedItem;
          });
        });
        setModal(function (prev) {
          if (prev?.t !== 'visBil' || normalizeBilId(prev.d?.id) !== normalizeBilId(id)) return prev;
          const localBil = mergedItem
            || bilerRef.current.find(function (b) { return b.id === id; })
            || prev.d;
          return { ...prev, d: mergeLocalBilFromServer(localBil, res.item) };
        });
      }
      if (localMsg) visTost(localMsg);
      if (!textOnly) refreshStatsRef.current();
      return mergedItem;
    } catch {
      visTost('Kunne ikke lagre bil ✗');
      loadDataRef.current();
      return null;
    }
  }, [applyBilPatchLocal, visTost]);

  if (!user && !coreLoading) return <Login onSuccess={handleLogin} />;
  if (coreLoading) {
    return (
      <div className="loading-screen">
        <div className="spin" style={{ width: 24, height: 24 }} />
        Laster driftssystem…
      </div>
    );
  }

  const nyeHenv = Number(stats.nyeHenv ?? henv.filter(h => h.status === 'Ny').length) || 0;
  const nyeInnbytte = Number(stats.nyeInnbytte ?? innbytte.filter(i => i.status === 'Ny').length) || 0;
  const nyeSelgBil = Number(stats.nyeSelgBil ?? selgBil.filter(i => i.status === 'Ny').length) || 0;
  const paaLager = Number(stats.paaLager ?? biler.filter(b => isBilAktiv(b) && b.status !== 'Solgt').length) || 0;
  const reservert = Number(stats.reservert ?? biler.filter(b => isBilAktiv(b) && b.status === 'Reservert').length) || 0;
  const iDagKal = Number(stats.iDagKal ?? kal.filter(k => k.dato === IDAG).length) || 0;
  const aapneOppgaver = Number(stats.aapneOppgaver ?? biler.filter(isBilAktiv).reduce(
    (s, b) => s + getAktivSjekkliste(b).filter(x => x.obligatorisk && !x.f).length, 0
  )) || 0;
  const ulestEpost = Math.max(
    Number(stats.ulestEpost) || 0,
    Number(mailStatus.ulest) || 0,
    epost.filter(function (e) { return e.retning === 'inn' && !e.lest; }).length
  );
  const harInnboks = canAccess(user, 'innboks');
  const nyeInnkommendeEpost = Number(stats.nyeInnkommendeEpost ?? 0) || 0;
  const ulestEpostListe = harInnboks ? (stats.ulestEpostListe || []) : [];
  const nyeHenvendelserTotal = nyeHenv + nyeSelgBil + (harInnboks ? ulestEpost : 0);

  const lists = innstillinger;

  const modulBadges = {
    henvendelser: nyeHenv,
    innboks: ulestEpost || 0,
    innbytte: nyeInnbytte,
    selgbil: nyeSelgBil,
    oppgaver: aapneOppgaver || 0
  };

  const TABS = buildModulTabs(innstillinger.modulOppsett, modulBadges, user);
  const activeTabLabel = TABS.find(function (t) { return t.id === tab; })?.lbl || 'CRM';

  const reorderBiler = async (updates, localMsg) => {
    if (!updates?.length) return;
    setBiler(function (prev) {
      const patchMap = Object.fromEntries(updates.map(function (u) {
        return [normalizeBilId(u.id), u];
      }));
      return prev.map(function (b) {
        const patch = patchMap[normalizeBilId(b.id)];
        return patch ? { ...b, status: patch.status, sortOrder: patch.sortOrder } : b;
      });
    });
    try {
      const res = await reorderBilerApi(updates);
      if (res.items?.length) {
        setBiler(function (prev) {
          const itemMap = Object.fromEntries(res.items.map(function (item) {
            return [normalizeBilId(item.id), { ...item, id: normalizeBilId(item.id) }];
          }));
          return prev.map(function (b) {
            const next = itemMap[normalizeBilId(b.id)];
            return next || b;
          });
        });
      }
      if (localMsg) visTost(localMsg);
    } catch {
      visTost('Kunne ikke lagre rekkefølge ✗');
      getBiler({ lite: true }).then(function (b) {
        const items = normalizeBilItems(b.items);
        setBiler(items);
        writeBilerCache(items);
      }).catch(function () {});
    }
  };

  const deleteBilItem = async (bil) => {
    if (!bil?.id) return false;
    if (!window.confirm(`Slette ${bil.reg} permanent?\n\nBilen fjernes helt fra systemet og kan ikke gjenopprettes.`)) return false;
    try {
      await deleteBilApi(bil.id);
      setBiler(function (prev) { return prev.filter(function (b) { return b.id !== bil.id; }); });
      setModal(function (prev) {
        if (prev?.t === 'visBil' && prev.d?.id === bil.id) return null;
        return prev;
      });
      visTost(`${bil.reg} slettet ✓`);
      refreshStats();
      return true;
    } catch (err) {
      visTost(err?.message || 'Kunne ikke slette bil ✗');
      return false;
    }
  };

  const syncFinnBilerTilAnnonsert = async function () {
    const klarCount = biler.filter(function (b) {
      return !b.archived && b.status === 'Klar til annonsering';
    }).length;
    if (!klarCount) {
      visTost('Ingen biler i «Klar til annonsering».');
      return null;
    }
    if (!window.confirm(
      'Sjekke ' + klarCount + ' bil(er) i «Klar til annonsering» mot FINN/nettsiden og flytte treff til «Annonsert»?'
    )) {
      return null;
    }
    try {
      const res = await syncFinnBilerStatus({ apply: true, refresh: true });
      if (Array.isArray(res.items) && res.items.length) {
        setBiler(function (prev) {
          const byId = Object.fromEntries(res.items.map(function (item) { return [item.id, item]; }));
          const next = prev.map(function (b) { return byId[b.id] || b; });
          writeBilerCache(next);
          return next;
        });
      }
      return res;
    } catch (err) {
      visTost(err?.message || 'FINN-synk feilet ✗');
      return null;
    }
  };

  const updateHenv = async (id, patch, localMsg) => {
    setHenv(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
    try {
      const res = await patchHenvendelse(id, patch);
      if (res.item) setHenv(prev => prev.map(h => h.id === id ? res.item : h));
      if (localMsg) visTost(localMsg);
      refreshStats();
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre kontaktskjema ✗');
      loadData();
    }
  };

  const deleteHenv = async (id) => {
    if (!window.confirm('Slette dette kontaktskjemaet permanent?')) return false;
    try {
      await deleteHenvendelse(id);
      setHenv(prev => prev.filter(h => h.id !== id));
      setModal(null);
      visTost('Kontaktskjema slettet ✓');
      refreshStats();
      return true;
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette kontaktskjema ✗');
      return false;
    }
  };

  const deleteInnbytteItem = async (id) => {
    if (!window.confirm('Slette denne innbytteforespørselen permanent?')) return false;
    try {
      await deleteInnbytte(id);
      setInnbytte(prev => prev.filter(i => i.id !== id));
      setModal(null);
      visTost('Innbytteforespørsel slettet ✓');
      refreshStats();
      return true;
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette innbytteforespørsel ✗');
      return false;
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

  const deleteSelgBilItem = async (id) => {
    if (!window.confirm('Slette denne oppkjøpsforespørselen permanent?')) return false;
    try {
      await deleteSelgBil(id);
      setSelgBil(prev => prev.filter(i => i.id !== id));
      setModal(null);
      visTost('Oppkjøpsforespørsel slettet ✓');
      refreshStats();
      return true;
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette oppkjøpsforespørsel ✗');
      return false;
    }
  };

  const updateSelgBil = async (id, patch, localMsg) => {
    setSelgBil(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    try {
      const res = await patchSelgBil(id, patch);
      if (res.item) setSelgBil(prev => prev.map(i => i.id === id ? res.item : i));
      if (localMsg) visTost(localMsg);
      refreshStats();
    } catch {
      visTost('Kunne ikke lagre oppkjøpsforespørsel ✗');
      loadData();
    }
  };

  const sendSelgBilTilbud = async (id, body) => {
    try {
      const res = await sendSelgBilTilbudApi(id, body);
      if (res.item) {
        setSelgBil(prev => prev.map(i => i.id === id ? res.item : i));
        setModal(prev => (
          prev?.t === 'visSelgBil' && prev.d?.id === id ? { ...prev, d: res.item } : prev
        ));
      }
      visTost(body?.type === 'visning' ? 'Invitasjon til befaring sendt ✓' : 'Oppkjøpstilbud sendt ✓');
      refreshStats();
      reloadInnboks().catch(function () { /* innboks-oppdatering er best-effort */ });
      return res.item;
    } catch (err) {
      visTost(err.message || 'Kunne ikke sende e-post ✗');
      throw err;
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

  const deleteKal = async (id, localMsg) => {
    setKal(prev => prev.filter(k => k.id !== id));
    try {
      await deleteKalender(id);
      if (localMsg) visTost(localMsg);
      refreshStats();
    } catch {
      visTost('Kunne ikke slette avtale ✗');
      loadData();
    }
  };

  const updateKunde = async (id, patch, localMsg) => {
    setKunder(prev => prev.map(k => k.id === id ? { ...k, ...patch } : k));
    try {
      const res = await patchKunde(id, patch);
      if (res.item) setKunder(prev => prev.map(k => k.id === id ? res.item : k));
      if (localMsg) visTost(localMsg);
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre kunde ✗');
      loadData();
    }
  };

  const sendHenvSvar = async (id, payload) => {
    const svar = typeof payload === 'string' ? payload : payload?.svar;
    const kontoId = typeof payload === 'object' ? payload?.kontoId : null;
    try {
      const res = await sendHenvendelseSvar(id, { svar, kontoId: kontoId || null });
      if (res.item) setHenv(prev => prev.map(h => h.id === id ? res.item : h));
      visTost('Svar sendt ✓');
      refreshStats();
      reloadInnboks().catch(function () { /* innboks-oppdatering er best-effort */ });
      return res.item;
    } catch (err) {
      visTost(err.message || 'Kunne ikke sende svar ✗');
      throw err;
    }
  };

  const sendInnbytteTilbud = async (id, body) => {
    try {
      const res = await sendInnbytteTilbudApi(id, body);
      if (res.item) {
        setInnbytte(prev => prev.map(i => i.id === id ? res.item : i));
        setModal(prev => (
          prev?.t === 'visInb' && prev.d?.id === id ? { ...prev, d: res.item } : prev
        ));
      }
      visTost(body?.type === 'visning' ? 'Invitasjon til visning sendt ✓' : 'Tilbud sendt på e-post ✓');
      refreshStats();
      reloadInnboks().catch(function () { /* innboks-oppdatering er best-effort */ });
      return res.item;
    } catch (err) {
      visTost(err.message || 'Kunne ikke sende e-post ✗');
      throw err;
    }
  };

  return (
    <>
      <div className="app">
        {mobileNavOpen && (
          <button
            type="button"
            className="sb-backdrop"
            aria-label="Lukk meny"
            onClick={function () { setMobileNavOpen(false); }}
          />
        )}
        <aside className={`sb${mobileNavOpen ? ' sb--open' : ''}`}>
          <div className="sb-logo-wrap">
            <div className="sb-logo">X <em>Bilsenter AS</em></div>
            <div className="sb-tagline">Internt driftssystem</div>
            <button
              type="button"
              className="sb-close"
              aria-label="Lukk meny"
              onClick={function () { setMobileNavOpen(false); }}
            >
              ×
            </button>
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
            <div className="sb-role">{displayRole(user?.role)}</div>
            <div className="sb-status">
              <div className="sb-dot" />
              <span className="sb-online">Innlogget</span>
            </div>
            <button type="button" className="sb-logout" onClick={handleLogout}>Logg ut</button>
          </div>
        </aside>

        <main className="main">
          {dataLoading && <div className="data-loading-bar" aria-hidden="true" />}
          <div className="mobile-topbar">
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label="Åpne meny"
              onClick={function () { setMobileNavOpen(true); }}
            >
              ☰
            </button>
            <div className="mobile-topbar__title">{activeTabLabel}</div>
          </div>
          {tab === 'dashboard' && (
            <Dashboard
              biler={biler} henv={henv} innbytte={innbytte} selgBil={selgBil} kal={kal}
              paaLager={paaLager} reservert={reservert}
              nyeInnbytte={nyeInnbytte}
              nyeHenvendelserTotal={nyeHenvendelserTotal}
              ulestEpostListe={ulestEpostListe}
              harInnboks={harInnboks}
              iDagKal={iDagKal} setTab={setTab} setModal={setModal}
              setInnboksOpenEpost={setInnboksOpenEpost}
              currentUser={user}
              stats={stats}
              vedlikeholdModus={innstillinger.vedlikeholdModus}
              henvStatusFarger={innstillinger.henvStatusFarger}
              bilStatusFarger={innstillinger.bilStatusFarger}
              innbytteStatusFarger={innstillinger.innbytteStatusFarger}
            />
          )}
          {tab === 'biler' && (
            <BilerView
              biler={biler}
              setModal={setModal}
              lists={lists}
              kal={kal}
              henv={henv}
              innbytte={innbytte}
              epost={epost}
              updateBil={updateBil}
              reorderBiler={reorderBiler}
              kunder={kunder}
              currentUser={user}
              visTost={visTost}
              onSyncFinnStatus={syncFinnBilerTilAnnonsert}
            />
          )}
          {tab === 'kunder' && (
            <KunderView
              kunder={kunder}
              setModal={setModal}
              visTost={visTost}
            />
          )}
          {tab === 'henvendelser' && (
            <HenvendelserView
              henv={henv}
              setModal={setModal}
              updateHenv={updateHenv}
              deleteHenv={deleteHenv}
              lists={lists}
            />
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
              lists={lists}
              kunder={kunder}
              setKunder={setKunder}
              setModal={setModal}
              initialOpenEpost={innboksOpenEpost}
              initialOpenEpostMode="preview"
              onInitialOpenEpostConsumed={function () { setInnboksOpenEpost(null); }}
            />
          )}
          {tab === 'innbytte' && (
            <InnbytteView innbytte={innbytte} setModal={setModal} lists={lists} kunder={kunder} visTost={visTost} />
          )}
          {tab === 'selgbil' && (
            <SelgBilView selgBil={selgBil} setModal={setModal} lists={lists} visTost={visTost} />
          )}
          {tab === 'kalender' && (
            <KalenderView
              kal={kal}
              setModal={setModal}
              biler={biler}
              lists={lists}
              kunder={kunder}
              updateKal={updateKal}
              deleteKal={deleteKal}
            />
          )}
          {tab === 'innkjopskalkyle' && (
            <InnkjopskalkyleView
              items={innkjopskalkyle}
              setItems={setInnkjopskalkyle}
              visTost={visTost}
              currentUser={user}
            />
          )}
          {tab === 'okonomi' && (
            <OkonomiView biler={biler} setModal={setModal} />
          )}
          {tab === 'oppgaver' && (
            <OppgaverView biler={biler} updateBil={updateBil} visTost={visTost} />
          )}
          {tab === 'timeregistrering' && (
            <TimeregistreringView currentUser={user} visTost={visTost} />
          )}
          {tab === 'vegvesen' && (
            <VegvesenView
              biler={biler}
              setBiler={setBiler}
              visTost={visTost}
              refreshStats={refreshStats}
              lists={lists}
              setTab={setTab}
              currentUser={user}
            />
          )}
          {tab === 'innstillinger' && (
            <InnstillingerView
              settings={innstillinger}
              biler={biler}
              currentUser={user}
              onSave={async (next) => {
                try {
                  const res = await patchInnstillinger(next);
                  if (res.settings) setInnstillinger(res.settings);
                  if (res.biler?.length) {
                    setBiler(res.biler.map(function (item) {
                      return { ...item, id: normalizeBilId(item.id), sortOrder: Number(item.sortOrder ?? 0) };
                    }));
                    setModal(function (prev) {
                      if (prev?.t !== 'visBil' || !prev.d?.id) return prev;
                      const updated = res.biler.find(function (b) {
                        return normalizeBilId(b.id) === normalizeBilId(prev.d.id);
                      });
                      return updated
                        ? { ...prev, d: { ...updated, id: normalizeBilId(updated.id) } }
                        : prev;
                    });
                    refreshStats();
                  } else if (next.bilSjekklister) {
                    const mal = res.settings?.bilSjekklister || next.bilSjekklister;
                    setBiler(function (prev) {
                      return prev.map(function (b) {
                        return { ...b, ...syncBilSjekklisterFromMal(b, mal) };
                      });
                    });
                    setModal(function (prev) {
                      if (prev?.t !== 'visBil' || !prev.d) return prev;
                      return {
                        ...prev,
                        d: { ...prev.d, ...syncBilSjekklisterFromMal(prev.d, mal) }
                      };
                    });
                    refreshStats();
                  }
                  const tilbudOnly = next.tilbudEpostMaler
                    && Object.keys(next).length === 1;
                  if (!tilbudOnly) visTost('Innstillinger lagret ✓');
                  return res;
                } catch (err) {
                  visTost(err.message || 'Kunne ikke lagre innstillinger ✗');
                  throw err;
                }
              }}
              onModulOppsettChange={(modulOppsett) => setInnstillinger(function (prev) {
                return { ...prev, modulOppsett };
              })}
              onVedlikeholdChange={(vedlikeholdModus) => setInnstillinger(function (prev) {
                return { ...prev, vedlikeholdModus };
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
          applyBilPatchLocal={applyBilPatchLocal}
          deleteBil={deleteBilItem}
          visTost={visTost}
          lists={lists}
          kal={kal}
          henv={henv}
          innbytte={innbytte}
          epost={epost}
          setModal={setModal}
          setTab={setTab}
          setInnboksOpenEpost={setInnboksOpenEpost}
          hydrateBil={hydrateBil}
          kunder={kunder}
          biler={biler}
          currentUser={user}
        />
      )}
      {modal?.t === 'nyBil' && canAddBil(user) && (
        <NyBilModal
          onClose={() => setModal(null)}
          lists={lists}
          biler={biler}
          visTost={visTost}
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
            } catch (err) {
              visTost(err.message || 'Kunne ikke legge til bil ✗');
            }
          }}
        />
      )}
      {modal?.t === 'visHenv' && (
        <HenvModal
          data={modal.d}
          onClose={() => setModal(null)}
          updateHenv={updateHenv}
          deleteHenv={deleteHenv}
          onSendSvar={sendHenvSvar}
          visTost={visTost}
          lists={lists}
          mailStatus={mailStatus}
          currentUser={user}
          kunder={kunder}
          setKunder={setKunder}
          setModal={setModal}
        />
      )}
      {modal?.t === 'visInb' && (
        <InbModal
          data={modal.d}
          onClose={() => setModal(null)}
          updateInnbytte={updateInnbytte}
          deleteInnbytte={deleteInnbytteItem}
          onSendTilbud={sendInnbytteTilbud}
          visTost={visTost}
          lists={lists}
          mailStatus={mailStatus}
          currentUser={user}
          kunder={kunder}
          setKunder={setKunder}
          setModal={setModal}
        />
      )}
      {modal?.t === 'visSelgBil' && (
        <SelgBilModal
          data={modal.d}
          onClose={() => setModal(null)}
          updateSelgBil={updateSelgBil}
          deleteSelgBil={deleteSelgBilItem}
          onSendTilbud={sendSelgBilTilbud}
          visTost={visTost}
          lists={lists}
          mailStatus={mailStatus}
          currentUser={user}
          kunder={kunder}
          setKunder={setKunder}
          setModal={setModal}
        />
      )}
      {modal?.t === 'nyKal' && (
        <KalModal
          data={(modal.dato || modal.tid) ? { dato: modal.dato, tid: modal.tid, tidSlutt: modal.tidSlutt } : null}
          onClose={() => setModal(null)}
          biler={biler}
          lists={lists}
          kunder={kunder}
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
          kunder={kunder}
          title="Rediger avtale"
          onSave={async (e) => {
            await updateKal(modal.d.id, e, 'Avtale oppdatert ✓');
            setModal(null);
          }}
          onDelete={async function () {
            if (!window.confirm('Slette denne avtalen?')) return;
            await deleteKal(modal.d.id, 'Avtale slettet ✓');
            setModal(null);
          }}
        />
      )}
      {modal?.t === 'visKunde' && (
        <KundeModal
          data={modal.d}
          onClose={() => setModal(null)}
          updateKunde={updateKunde}
          deleteKunde={async (id) => {
            try {
              await deleteKunde(id);
              setKunder(prev => prev.filter(k => k.id !== id));
              setModal(null);
              visTost('Kunde slettet ✓');
              return true;
            } catch (err) {
              visTost(err.message || 'Kunne ikke slette kunde ✗');
              return false;
            }
          }}
          setModal={setModal}
          visTost={visTost}
          lists={lists}
        />
      )}
      {modal?.t === 'nyKunde' && (
        <NyKundeModal
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={async (body) => {
            try {
              const res = await postKunde(body);
              if (res.item) {
                setKunder(prev => {
                  if (prev.some(function (k) { return k.id === res.item.id; })) return prev;
                  return [...prev, res.item].sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
                });
                if (modal.onCreated) {
                  modal.onCreated(res.item);
                  setModal(null);
                } else {
                  setModal({ t: 'visKunde', d: res.item });
                  visTost('Kunde opprettet ✓');
                }
              }
            } catch (err) {
              visTost(err.message || 'Kunne ikke opprette kunde ✗');
            }
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
const DRIFT_POLL_MS = 15000;

function formatDriftTid(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('nb-NO', {
    timeZone: NORSK_TIDSSONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function openNettside(url, { preview = false } = {}) {
  if (preview) {
    try {
      const res = await getSitePreviewUrl();
      window.open(res.url, '_blank', 'noopener,noreferrer');
      return;
    } catch (err) {
      window.alert(err.message || 'Kunne ikke åpne forhåndsvisning.');
      return;
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function NettsideDriftPanel({ setTab, currentUser, vedlikeholdModus }) {
  const [drift, setDrift] = useState(null);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState('');
  const kanToggleVedlikehold = canToggleVedlikehold(currentUser);
  const vedlikehold = vedlikeholdModus || DEFAULT_INNSTILLINGER.vedlikeholdModus;

  const oppdater = useCallback(async function (stille) {
    if (!stille) setLaster(true);
    try {
      const res = await getNettsideDrift();
      setDrift(res.status || null);
      setFeil('');
    } catch (err) {
      setFeil(err.message || 'Kunne ikke hente driftsstatus');
    } finally {
      if (!stille) setLaster(false);
    }
  }, []);

  useEffect(function () {
    oppdater(false);
    const id = setInterval(function () { oppdater(true); }, DRIFT_POLL_MS);
    return function () { clearInterval(id); };
  }, [oppdater]);

  const status = drift?.besokendeStatus || (vedlikehold.aktiv ? 'vedlikehold' : 'live');
  const statusMeta = {
    live: {
      icon: '🌐',
      title: 'Nettsiden er live',
      desc: 'Normal drift – besøkende kan bruke nettsiden som vanlig.',
      chip: 'Live',
      chipClass: 'chip-green',
      cardClass: ''
    },
    vedlikehold: {
      icon: '🚧',
      title: 'Vedlikeholdsmodus aktiv',
      desc: drift?.vedlikeholdMelding || vedlikehold.melding || 'Besøkende ser vedlikeholdsside.',
      chip: 'Vedlikehold',
      chipClass: 'chip-orange',
      cardClass: ' is-active'
    },
    nede: {
      icon: '⚠',
      title: 'Nettsiden svarer ikke',
      desc: drift?.error || 'Kunne ikke nå nettsideserveren. Sjekk at den kjører.',
      chip: 'Nede',
      chipClass: 'chip-red',
      cardClass: ' is-down'
    }
  };
  const meta = statusMeta[status] || statusMeta.live;

  const url = drift?.url || 'http://localhost:8080';
  const ping = drift?.online && drift.responseMs != null ? `${drift.responseMs} ms` : '—';
  const sjekket = formatDriftTid(drift?.checkedAt);

  return (
    <div className={`card maint-dash drift-dash${meta.cardClass}`} style={{ marginBottom: 16 }}>
      <div className="maint-dash__main">
        <div className="maint-dash__icon">{meta.icon}</div>
        <div className="drift-dash__body">
          <div className="drift-dash__head">
            <div>
              <div className="maint-dash__title">{meta.title}</div>
              <div className="maint-dash__desc">{meta.desc}</div>
            </div>
          </div>
          <div className="drift-dash__meta">
            <span>{url}</span>
            <span>·</span>
            <span>Svar: {ping}</span>
            <span>·</span>
            <span>Sjekket {sjekket}{laster ? ' …' : ''}</span>
            {drift?.adminOk === false && (
              <>
                <span>·</span>
                <span style={{ color: 'var(--orange)' }}>Admin-kobling feil</span>
              </>
            )}
          </div>
          {feil && !drift && (
            <div className="drift-dash__err">{feil}</div>
          )}
          {drift?.finn === 'configured' && (
            <div className="drift-dash__meta" style={{ marginTop: 6 }}>
              FINN-lager oppdateres automatisk hvert 2. minutt.
            </div>
          )}
        </div>
      </div>
      <div className="drift-dash__actions">
        <div className="drift-dash__status-wrap">
          <span className={`drift-dot drift-dot--${status}${laster ? ' is-pulse' : ''}`} />
          <span className={`chip ${meta.chipClass}`}>{meta.chip}</span>
        </div>
        {status === 'vedlikehold' ? (
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={function () { openNettside(url, { preview: true }); }}
          >
            Forhåndsvis nettsiden
          </button>
        ) : (
          <a className="btn btn-g btn-sm" href={url} target="_blank" rel="noopener noreferrer">Åpne nettside</a>
        )}
        <button type="button" className="btn btn-g btn-sm" onClick={function () { oppdater(false); }}>
          Oppdater
        </button>
        {kanToggleVedlikehold && (
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={function () { setTab('innstillinger'); }}
          >
            Vedlikehold
          </button>
        )}
      </div>
    </div>
  );
}

function Dashboard({
  biler, henv, innbytte, selgBil, kal, paaLager, reservert,
  nyeInnbytte, nyeHenvendelserTotal, ulestEpostListe, harInnboks,
  iDagKal, setTab, setModal, setInnboksOpenEpost,
  currentUser, vedlikeholdModus, henvStatusFarger, bilStatusFarger, innbytteStatusFarger,
  stats
}) {
  const [aktivDrilldown, setAktivDrilldown] = useState(null);
  const [nodvendigFilter, setNodvendigFilter] = useState('Alle');
  const iDagEvt = kal.filter(k => k.dato === IDAG).sort((a, b) => a.tid.localeCompare(b.tid));
  const lagerBiler = biler.filter(function (b) { return isBilAktiv(b) && b.status !== 'Solgt'; });
  const reserverteBiler = biler.filter(function (b) { return isBilAktiv(b) && b.status === 'Reservert'; });
  const nyeInnbytteListe = (innbytte || []).filter(function (i) { return i.status === 'Ny'; });
  const trMangler = biler.filter(bilManglerTilstandsrapport);
  const trAntall = Number(stats?.manglerTilstandsrapport ?? trMangler.length) || 0;
  const nodvendigRader = bilTilstandsrapportNodvendigRader(biler);
  const nodvendigAntall = Number(stats?.nodvendigPaBil ?? nodvendigRader.length) || 0;
  const nodvendigFilterOptions = useMemo(function () {
    return bilTilstandsrapportNodvendigFilterOptions(biler);
  }, [biler]);
  const filtrerteNodvendigRader = useMemo(function () {
    if (nodvendigFilter === 'Alle') return nodvendigRader;
    return nodvendigRader.filter(function (row) { return row.label === nodvendigFilter; });
  }, [nodvendigRader, nodvendigFilter]);
  const innbytteColors = innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER;

  const nyeHenvendelserListe = buildNyeHenvendelserItems({
    henv: henv,
    innbytte: [],
    selgBil: selgBil,
    ulestEpost: ulestEpostListe,
    inkluderEpost: harInnboks
  });

  const openNyeHenvendelse = function (item) {
    if (item.type === 'henvendelse') setModal({ t: 'visHenv', d: item.data });
    else if (item.type === 'innbytte') setModal({ t: 'visInb', d: item.data });
    else if (item.type === 'selgbil') setModal({ t: 'visSelgBil', d: item.data });
    else if (item.type === 'epost') {
      setInnboksOpenEpost(item.data);
      setTab('innboks');
    }
  };

  const typeChipClass = function (type) {
    if (type === 'epost') return 'chip chip-gray';
    if (type === 'innbytte') return 'chip chip-orange';
    if (type === 'selgbil') return 'chip chip-green';
    return 'chip chip-gray';
  };

  const renderNyeHenvendelserRows = function (items, emptyText) {
    if (!items.length) {
      return (
        <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>{emptyText}</td></tr>
      );
    }
    return items.map(function (item) {
      return (
        <tr
          key={item.key}
          className="dashboard-drill-row"
          onClick={function () { openNyeHenvendelse(item); }}
        >
          <td>
            <div style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 12 }}>{item.navn}</div>
            <div style={{ fontSize: 10, color: 'var(--t4)' }}>{item.sub || '—'}</div>
          </td>
          <td style={{ maxWidth: 220 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{item.emne}</div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>{item.detalj}</div>
          </td>
          <td><span className={typeChipClass(item.type)}>{item.typeLabel}</span></td>
          <td>{item.dato || '—'}</td>
          <td>
            {item.type === 'epost'
              ? <span className="chip chip-red">Ulest</span>
              : <Badge s={item.status} colors={item.type === 'innbytte' || item.type === 'selgbil' ? innbytteColors : henvStatusFarger} />}
          </td>
        </tr>
      );
    });
  };

  const toggleDrilldown = function (key) {
    setAktivDrilldown(function (prev) {
      const next = prev === key ? null : key;
      if (key === 'nodvendig') setNodvendigFilter('Alle');
      return next;
    });
  };

  const handleStatClick = function (key) {
    if (key === 'lager') {
      setTab('biler');
      return;
    }
    toggleDrilldown(key);
  };

  const drillSub = function (key, count) {
    if (key === 'lager') return 'Gå til biler';
    return aktivDrilldown === key ? 'Skjul liste' : (count ? 'Klikk for liste' : 'Se detaljer');
  };

  const statCards = [
    { key: 'lager', ico: '🚗', lbl: 'Biler på lager', val: paaLager, sub: drillSub('lager', paaLager) },
    { key: 'innbytte', ico: '⇄', lbl: 'Innbytteforespørsler', val: nyeInnbytte, sub: drillSub('innbytte', nyeInnbytte), orange: true },
    { key: 'reservert', ico: '✅', lbl: 'Reserverte biler', val: reservert, sub: drillSub('reservert', reservert), green: true },
    { key: 'kal', ico: '📅', lbl: 'Avtaler i dag', val: iDagKal, sub: drillSub('kal', iDagKal) },
    {
      key: 'tilstandsrapport',
      ico: '📋',
      lbl: 'Tilstandsrapport',
      val: trAntall,
      sub: drillSub('tilstandsrapport', trAntall),
      red: trAntall > 0
    },
    {
      key: 'nodvendig',
      ico: '⚠',
      lbl: 'Nødvendig på bil',
      val: nodvendigAntall,
      sub: drillSub('nodvendig', nodvendigAntall),
      red: nodvendigAntall > 0
    }
  ];

  const renderBilDrilldownRows = function (items, emptyText) {
    if (!items.length) {
      return (
        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>{emptyText}</td></tr>
      );
    }
    return items.map(function (bil) {
      return (
        <tr
          key={bil.id}
          className="dashboard-drill-row"
          onClick={function () { setModal({ t: 'visBil', d: bil }); }}
        >
          <td><strong>{bil.reg}</strong></td>
          <td>{bil.merke} {bil.modell} · {bil.aar || '—'}</td>
          <td><Badge s={bil.status} colors={bilStatusFarger} /></td>
          <td>{bil.ansvarlig || '—'}</td>
        </tr>
      );
    });
  };

  const renderDrilldownPanel = function () {
    if (!aktivDrilldown) return null;

    if (aktivDrilldown === 'lager') {
      return (
        <div className="card table-cards dashboard-drill-panel">
          <div className="card-h">
            <span className="card-ht">Biler på lager ({lagerBiler.length})</span>
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('biler'); }}>Gå til biler →</button>
          </div>
          <table className="table-cards">
            <thead><tr><th>Reg.nr</th><th>Bil</th><th>Status</th><th>Ansvarlig</th></tr></thead>
            <tbody>{renderBilDrilldownRows(lagerBiler, 'Ingen biler på lager.')}</tbody>
          </table>
        </div>
      );
    }

    if (aktivDrilldown === 'innbytte') {
      return (
        <div className="card table-cards dashboard-drill-panel">
          <div className="card-h">
            <span className="card-ht">Innbytteforespørsler ({nyeInnbytteListe.length})</span>
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('innbytte'); }}>Gå til innbytte →</button>
          </div>
          <table className="table-cards">
            <thead><tr><th>Kunde</th><th>Innbyttebil</th><th>Ønsket bil</th><th>Status</th><th>Dato</th></tr></thead>
            <tbody>
              {nyeInnbytteListe.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Ingen nye innbytteforespørsler.</td></tr>
              ) : nyeInnbytteListe.map(function (inn) {
                return (
                  <tr key={inn.id} className="dashboard-drill-row" onClick={function () { setModal({ t: 'visInb', d: inn }); }}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 12 }}>{inn.navn}</div>
                      <div style={{ fontSize: 10, color: 'var(--t4)' }}>{inn.epost || inn.tlf || '—'}</div>
                    </td>
                    <td>{inn.merke} {inn.modell} {inn.aar || ''} · {inn.reg || '—'}</td>
                    <td>{inn.onsketBil || '—'}</td>
                    <td><Badge s={inn.status} colors={innbytteColors} /></td>
                    <td>{inn.dato || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (aktivDrilldown === 'reservert') {
      return (
        <div className="card table-cards dashboard-drill-panel">
          <div className="card-h">
            <span className="card-ht">Reserverte biler ({reserverteBiler.length})</span>
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('biler'); }}>Gå til biler →</button>
          </div>
          <table className="table-cards">
            <thead><tr><th>Reg.nr</th><th>Bil</th><th>Status</th><th>Ansvarlig</th></tr></thead>
            <tbody>{renderBilDrilldownRows(reserverteBiler, 'Ingen reserverte biler.')}</tbody>
          </table>
        </div>
      );
    }

    if (aktivDrilldown === 'kal') {
      return (
        <div className="card table-cards dashboard-drill-panel">
          <div className="card-h">
            <span className="card-ht">Avtaler i dag ({iDagEvt.length})</span>
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('kalender'); }}>Gå til kalender →</button>
          </div>
          <table className="table-cards">
            <thead><tr><th>Tid</th><th>Tittel</th><th>Type</th><th>Ansvarlig</th><th>Bil</th></tr></thead>
            <tbody>
              {iDagEvt.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Ingen avtaler i dag.</td></tr>
              ) : iDagEvt.map(function (e) {
                return (
                  <tr key={e.id} className="dashboard-drill-row" onClick={function () { setModal({ t: 'visKal', d: e }); }}>
                    <td>{formatKalTid(e)}</td>
                    <td>{e.tittel}</td>
                    <td><KBadge type={e.type} /></td>
                    <td>{e.ansvarlig || '—'}</td>
                    <td>{e.bilRef || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (aktivDrilldown === 'tilstandsrapport') {
      return (
        <div className="card table-cards dashboard-drill-panel">
          <div className="card-h">
            <span className="card-ht">Biler uten tilstandsrapport ({trAntall})</span>
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('biler'); }}>Gå til biler →</button>
          </div>
          <table className="table-cards">
            <thead>
              <tr><th>Reg.nr</th><th>Bil</th><th>Status</th><th>Ansvarlig</th><th>Tilstandsrapport</th></tr>
            </thead>
            <tbody>
              {trAntall === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Alle biler har tilstandsrapport utført eller medfølger.</td></tr>
              ) : trMangler.map(function (bil) {
                return (
                  <tr
                    key={bil.id}
                    className="dashboard-drill-row"
                    onClick={function () { setModal({ t: 'visBil', d: bil }); }}
                  >
                    <td><strong>{bil.reg}</strong></td>
                    <td>{bil.merke} {bil.modell} · {bil.aar || '—'}</td>
                    <td><Badge s={bil.status} colors={bilStatusFarger} /></td>
                    <td>{bil.ansvarlig || '—'}</td>
                    <td><span className="chip chip-red">Ikke utført</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (aktivDrilldown === 'nodvendig') {
      return (
        <div className="card table-cards dashboard-drill-panel">
          <div className="card-h">
            <span className="card-ht">
              Nødvendig på bil ({filtrerteNodvendigRader.length}
              {nodvendigFilter !== 'Alle' ? ` · ${nodvendigFilter}` : ''})
            </span>
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('biler'); }}>Gå til biler →</button>
          </div>
          {nodvendigAntall > 0 && nodvendigFilterOptions.length > 0 && (
            <div className="henv-filters dashboard-nodvendig-filters">
              <button
                type="button"
                className={`henv-filter btn btn-sm ${nodvendigFilter === 'Alle' ? 'btn-p' : 'btn-g'}`}
                onClick={function () { setNodvendigFilter('Alle'); }}
              >
                Alle ({nodvendigAntall})
              </button>
              {nodvendigFilterOptions.map(function (opt) {
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={`henv-filter btn btn-sm ${nodvendigFilter === opt.label ? 'btn-p' : 'btn-g'}`}
                    onClick={function () { setNodvendigFilter(opt.label); }}
                  >
                    {opt.label} ({opt.count})
                  </button>
                );
              })}
            </div>
          )}
          <table className="table-cards">
            <thead>
              <tr><th>Reg.nr</th><th>Bil</th><th>Status</th><th>Ansvarlig</th><th>Nødvendig</th></tr>
            </thead>
            <tbody>
              {nodvendigAntall === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Ingen biler har markert nødvendig arbeid akkurat nå.</td></tr>
              ) : filtrerteNodvendigRader.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Ingen treff for «{nodvendigFilter}».</td></tr>
              ) : filtrerteNodvendigRader.map(function (row) {
                const bil = row.bil;
                return (
                  <tr
                    key={`${bil.id}-${row.label}`}
                    className="dashboard-drill-row"
                    onClick={function () { setModal({ t: 'visBil', d: bil }); }}
                  >
                    <td><strong>{bil.reg}</strong></td>
                    <td>{bil.merke} {bil.modell} · {bil.aar || '—'}</td>
                    <td><Badge s={bil.status} colors={bilStatusFarger} /></td>
                    <td>{bil.ansvarlig || '—'}</td>
                    <td><span className="chip chip-red">{row.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Oversikt</div>
          <div className="ph-sub">{formatDatoLang()} · X Bilsenter AS · Fetsund · AUTOREG-godkjent forhandler</div>
        </div>
      </div>

      <NettsideDriftPanel
        setTab={setTab}
        currentUser={currentUser}
        vedlikeholdModus={vedlikeholdModus}
      />

      <div className="stats">
        {statCards.map(function (s) {
          const active = aktivDrilldown === s.key;
          return (
            <div
              className={`stat stat--clickable${active ? ' stat--active' : ''}`}
              key={s.key}
              role="button"
              tabIndex={0}
              onClick={function () { handleStatClick(s.key); }}
              onKeyDown={function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleStatClick(s.key);
                }
              }}
            >
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
          );
        })}
      </div>

      {renderDrilldownPanel()}

      <div className="dash-grid">
        <div className="card table-cards">
          <div className="card-h">
            <span className="card-ht">Nye henvendelser ({nyeHenvendelserListe.length})</span>
            <div className="card-h-actions">
              {harInnboks && (
                <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('innboks'); }}>Innboks →</button>
              )}
              <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('henvendelser'); }}>Kontaktskjema →</button>
              <button type="button" className="btn btn-g btn-sm" onClick={function () { setTab('selgbil'); }}>Selg bil →</button>
            </div>
          </div>
          <table className="table-cards">
            <thead><tr><th>Fra</th><th>Emne / detalj</th><th>Type</th><th>Dato</th><th>Status</th></tr></thead>
            <tbody>
              {renderNyeHenvendelserRows(nyeHenvendelserListe.slice(0, 8), 'Ingen nye henvendelser å behandle.')}
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
function BilSlettelogPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    let cancelled = false;
    setLoading(true);
    getBilSlettelog()
      .then(function (res) {
        if (!cancelled) setItems(res.items || []);
      })
      .catch(function () {
        if (!cancelled) setItems([]);
      })
      .finally(function () {
        if (!cancelled) setLoading(false);
      });
    return function () { cancelled = true; };
  }, []);

  return (
    <div className="card bil-slettelog" style={{ marginBottom: 12 }}>
      <div className="card-h">
        <span className="card-ht">Slettelog for biler</span>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>Kun synlig for daglig leder/admin</span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>Laster slettelog…</div>
        ) : items.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>Ingen slettede biler er loggført ennå.</div>
        ) : (
          <div className="bil-slettelog-table-wrap">
            <table className="bil-slettelog-table">
              <thead>
                <tr>
                  <th>Tidspunkt</th>
                  <th>Bil</th>
                  <th>Status</th>
                  <th>Slettet av</th>
                </tr>
              </thead>
              <tbody>
                {items.map(function (row) {
                  const tid = row.slettetAt
                    ? new Date(row.slettetAt).toLocaleString('nb-NO', {
                      timeZone: NORSK_TIDSSONE,
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                    : '—';
                  return (
                    <tr key={row.id}>
                      <td>{tid}</td>
                      <td><strong>{row.reg}</strong> · {row.merke} {row.modell}</td>
                      <td>{row.status || '—'}</td>
                      <td>{row.slettetAvNavn}{row.slettetAvRolle ? ` (${displayRole(row.slettetAvRolle)})` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BilOrderBadge({ value, editing, onEditingChange, onSave, revealAdd }) {
  const [val, setVal] = useState(value != null ? String(value) : '');
  const inputRef = useRef(null);
  const ignoreBlurRef = useRef(false);
  const hasValue = value != null && Number.isFinite(Number(value)) && Number(value) > 0;

  useEffect(function () {
    if (!editing) return;
    ignoreBlurRef.current = true;
    const id = window.setTimeout(function () {
      ignoreBlurRef.current = false;
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
    return function () { window.clearTimeout(id); };
  }, [editing]);

  useEffect(function () {
    if (!editing) setVal(hasValue ? String(value) : '');
  }, [value, hasValue, editing]);

  const commit = function () {
    const trimmed = String(val || '').trim();
    if (!trimmed) {
      if (hasValue) onSave(null);
      onEditingChange(false);
      setVal('');
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 1) {
      setVal(hasValue ? String(value) : '');
      onEditingChange(false);
      return;
    }
    if (!hasValue || n !== Number(value)) onSave(n);
    else onEditingChange(false);
  };

  const startEditing = function (e) {
    e.preventDefault();
    e.stopPropagation();
    onEditingChange(true);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="bil-order-input"
        type="number"
        min={1}
        value={val}
        onChange={function (e) { setVal(e.target.value); }}
        onBlur={function () {
          if (ignoreBlurRef.current) return;
          commit();
        }}
        onKeyDown={function (e) {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onEditingChange(false);
            setVal(hasValue ? String(value) : '');
          }
        }}
        onMouseDown={function (e) { e.stopPropagation(); }}
        onClick={function (e) { e.stopPropagation(); }}
        aria-label="Pipelinenummer"
      />
    );
  }

  if (hasValue) {
    return (
      <button
        type="button"
        className="bil-order-badge"
        title="Klikk for å endre nummer (tøm feltet for å fjerne)"
        onMouseDown={function (e) { e.stopPropagation(); }}
        onClick={function (e) {
          e.stopPropagation();
          onEditingChange(true);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`bil-order-add${revealAdd ? ' bil-order-add--reveal' : ''}`}
      title="Sett nummer i pipelinen"
      onMouseDown={startEditing}
      onClick={function (e) { e.stopPropagation(); }}
    >
      Nr.
    </button>
  );
}

function BilerView({ biler, setModal, lists, kal, henv, innbytte, epost, updateBil, reorderBiler, currentUser, visTost, onSyncFinnStatus }) {
  const kanLeggeTilBil = canAddBil(currentUser);
  const [mFilter, setMFilter] = useState('Alle');
  const [sFilter, setSFilter] = useState('Alle');
  const [search, setSearch] = useState('');
  const [view, setViewState] = useState(getSavedBilerView);
  const [section, setSectionState] = useState(getSavedBilerSection);
  const [dragId, setDragId] = useState(null);
  const [dropStatus, setDropStatus] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [finnSyncing, setFinnSyncing] = useState(false);
  const skipClick = useRef(false);
  const harInnboks = canAccess(currentUser, 'innboks');
  const aktiveBiler = biler.filter(isBilAktiv);
  const arkivBiler = biler.filter(function (b) { return b.archived; });
  const sourceBiler = section === 'arkiv' ? arkivBiler : aktiveBiler;
  const merker = bilMerker(aktiveBiler);
  const pipelineStatuser = kanbanStatuses(lists, aktiveBiler);
  const filterStatuser = kanbanStatuses(lists, sourceBiler);
  const klarTilAnnonseringCount = aktiveBiler.filter(function (b) {
    return b.status === 'Klar til annonsering';
  }).length;
  const merkeFiltered = mFilter === 'Alle'
    ? sourceBiler
    : sourceBiler.filter(function (b) { return b.merke === mFilter; });
  const vis = sFilter === 'Alle'
    ? merkeFiltered
    : merkeFiltered.filter(function (b) { return b.status === sFilter; });
  const visibleStatuser = sFilter === 'Alle'
    ? pipelineStatuser
    : pipelineStatuser.filter(function (status) { return status === sFilter; });
  const statusCounts = {};
  merkeFiltered.forEach(function (b) {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  });
  const grouped = groupBilerByStatus(vis, visibleStatuser);
  const skjult = sourceBiler.length - vis.length;
  const filterActive = mFilter !== 'Alle' || sFilter !== 'Alle';
  const searchQuery = search.trim();
  const searchHits = searchQuery
    ? biler.filter(function (b) { return bilMatchesSearch(b, searchQuery); })
    : [];
  const searchActive = searchQuery.length > 0;
  const [visSlettelog, setVisSlettelog] = useState(false);
  const [orderEditId, setOrderEditId] = useState(null);
  const [hoveredBilId, setHoveredBilId] = useState(null);

  useEffect(function () {
    if (mFilter !== 'Alle' && !merker.includes(mFilter)) setMFilter('Alle');
  }, [merker, mFilter]);

  const setView = useCallback(function (next) {
    setViewState(next);
    saveBilerView(next);
  }, []);

  const setSection = useCallback(function (next) {
    setSectionState(next);
    saveBilerSection(next);
    setDragId(null);
    setDropStatus(null);
    setDropTarget(null);
  }, []);

  const restoreBil = (bil) => {
    updateBil(bil.id, {
      archived: false,
      logg: [...(bil.logg || []), bilLoggEntry('Gjenopprettet fra arkiv')]
    }, 'Gjenopprettet til lager ✓');
  };

  const handleDragStart = (e, bil) => {
    skipClick.current = false;
    setDragId(bil.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(bil.id));
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDropStatus(null);
    setDropTarget(null);
    skipClick.current = true;
    window.setTimeout(function () { skipClick.current = false; }, 0);
  };

  const handleKanbanDrop = (e, status) => {
    e.preventDefault();
    setDropStatus(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    const bil = aktiveBiler.find(function (b) { return normalizeBilId(b.id) === id; });
    if (!bil) {
      setDragId(null);
      return;
    }
    const updates = computeListeReorder(aktiveBiler, id, status, null);
    if (!updates.length) {
      setDragId(null);
      return;
    }
    const msg = bil.status !== status ? 'Flyttet til ' + status + ' ✓' : 'Rekkefølge oppdatert ✓';
    reorderBiler(updates, msg);
    setDragId(null);
  };

  const handleListeDrop = (e, status, beforeId) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id || beforeId === id) {
      setDragId(null);
      return;
    }
    const updates = computeListeReorder(aktiveBiler, id, status, beforeId);
    if (!updates.length) {
      setDragId(null);
      return;
    }
    const moved = aktiveBiler.find(function (b) { return normalizeBilId(b.id) === id; });
    const msg = moved && moved.status !== status
      ? 'Flyttet til ' + status + ' ✓'
      : 'Rekkefølge oppdatert ✓';
    reorderBiler(updates, msg);
    setDragId(null);
  };

  const openBil = (bil) => {
    if (skipClick.current) return;
    setModal({ t: 'visBil', d: bil });
  };

  const savePipelineNummer = function (bil, nummer) {
    updateBil(bil.id, { pipelineNummer: nummer }, nummer ? `Nummer ${nummer} lagret ✓` : 'Nummer fjernet ✓');
    setOrderEditId(null);
  };

  const renderBilKanbanCard = (bil) => {
    const list = getAktivSjekkliste(bil);
    const prog = calcSjekklisteFremdrift(list);
    const { f, t, pst } = prog;
    const sisteSjekk = getSisteKryssedeSjekklisteItem(list);
    const linkKal = (kal || []).filter(function (e) { return matchesBilRef(e.bilRef, bil.reg); }).length;
    const linkHenv = countBilHenvendelser(bil, henv, innbytte, epost, harInnboks);
    return (
      <div
        className={`bil-card${dragId === bil.id ? ' bil-card--dragging' : ''}${hoveredBilId === normalizeBilId(bil.id) ? ' bil-card--hover' : ''}`}
        key={bil.id}
        draggable
        onDragStart={(e) => handleDragStart(e, bil)}
        onDragEnd={handleDragEnd}
        onMouseEnter={function () { setHoveredBilId(normalizeBilId(bil.id)); }}
        onMouseLeave={function () { setHoveredBilId(function (prev) { return prev === normalizeBilId(bil.id) ? null : prev; }); }}
        onClick={() => openBil(bil)}
      >
        <div className="bil-card-head">
          <div className="bil-reg">{bil.reg}</div>
          <BilOrderBadge
            value={bil.pipelineNummer}
            editing={orderEditId === normalizeBilId(bil.id)}
            revealAdd={hoveredBilId === normalizeBilId(bil.id) || orderEditId === normalizeBilId(bil.id)}
            onEditingChange={function (next) {
              setOrderEditId(next ? normalizeBilId(bil.id) : null);
            }}
            onSave={function (n) { savePipelineNummer(bil, n); }}
          />
        </div>
        <div className="bil-name">{bil.merke} {bil.modell}</div>
        <div className="bil-sub">{bil.aar}{fmtKmLabel(bil.km) ? ` · ${fmtKmLabel(bil.km)}` : ''} · {formatBilFarge(bil.farge)}</div>
        {sisteSjekk ? (
          <div className="bil-card__siste-sjekk" title="Siste fullførte sjekkliste-punkt">
            {sisteSjekk}
          </div>
        ) : null}
        {(linkKal > 0 || linkHenv > 0) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {linkKal > 0 && <span className="chip chip-gray">{linkKal} avtale{linkKal > 1 ? 'r' : ''}</span>}
            {linkHenv > 0 && <span className="chip chip-gray">{linkHenv} henv.</span>}
          </div>
        )}
        {t > 0 && (
          <>
            <div className="prog-lbl" style={{ marginTop: 7 }}>{f}/{t} oblig. · {pst}%</div>
            <div className="prog-bar"><div className="prog-fill" style={{ width: pst + '%' }} /></div>
          </>
        )}
      </div>
    );
  };

  const renderBilPipelineRow = (bil, status) => {
    const list = getAktivSjekkliste(bil);
    const prog = calcSjekklisteFremdrift(list);
    const { f, t, pst } = prog;
    const sisteSjekk = getSisteKryssedeSjekklisteItem(list);
    const linkKal = (kal || []).filter(function (e) { return matchesBilRef(e.bilRef, bil.reg); }).length;
    const linkHenv = countBilHenvendelser(bil, henv, innbytte, epost, harInnboks);
    return (
      <div
        key={bil.id}
        className={`bil-pipeline-row${dragId === bil.id ? ' bil-pipeline-row--dragging' : ''}${hoveredBilId === normalizeBilId(bil.id) ? ' bil-pipeline-row--hover' : ''}`}
        draggable
        onDragStart={(e) => handleDragStart(e, bil)}
        onDragEnd={handleDragEnd}
        onMouseEnter={function () { setHoveredBilId(normalizeBilId(bil.id)); }}
        onMouseLeave={function () { setHoveredBilId(function (prev) { return prev === normalizeBilId(bil.id) ? null : prev; }); }}
        onDragOver={(e) => {
          if (dragId === bil.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropTarget({ status: status, beforeId: bil.id });
        }}
        onDrop={(e) => handleListeDrop(e, status, bil.id)}
        onClick={() => openBil(bil)}
      >
        <BilOrderBadge
          value={bil.pipelineNummer}
          editing={orderEditId === normalizeBilId(bil.id)}
          revealAdd={hoveredBilId === normalizeBilId(bil.id) || orderEditId === normalizeBilId(bil.id)}
          onEditingChange={function (next) {
            setOrderEditId(next ? normalizeBilId(bil.id) : null);
          }}
          onSave={function (n) { savePipelineNummer(bil, n); }}
        />
        <span className="bil-pipeline-grip" aria-hidden="true">⋮⋮</span>
        <div className="bil-pipeline-main">
          <div className="bil-pipeline-ident">
            <div className="bil-reg">{bil.reg}</div>
            <div className="bil-name">{bil.merke} {bil.modell}</div>
          </div>
          <div className="bil-pipeline-meta">{bil.aar}{fmtKmLabel(bil.km) ? ` · ${fmtKmLabel(bil.km)}` : ''} · {formatBilFarge(bil.farge) || '—'}</div>
          <div className="bil-pipeline-prog">
            {sisteSjekk ? (
              <div className="bil-pipeline-siste-sjekk" title="Siste fullførte sjekkliste-punkt">
                {sisteSjekk}
              </div>
            ) : null}
            {t > 0 ? (
              <>
                <div className="prog-lbl">{f}/{t} oblig. · {pst}%</div>
                <div className="prog-bar"><div className="prog-fill" style={{ width: pst + '%' }} /></div>
              </>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--t4)' }}>—</span>
            )}
          </div>
          <div className="bil-pipeline-links">
            {linkKal > 0 && <span className="chip chip-gray">{linkKal} avt.</span>}
            {linkHenv > 0 && <span className="chip chip-gray">{linkHenv} henv.</span>}
            {linkKal === 0 && linkHenv === 0 && <span style={{ fontSize: 11, color: 'var(--t4)' }}>—</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="ph ph--biler">
        <div>
          <div className="ph-title">{section === 'arkiv' ? 'Arkiv' : 'Biler på lager'}</div>
          <div className="ph-sub">
            {section === 'arkiv'
              ? `${arkivBiler.length} arkiverte bil${arkivBiler.length === 1 ? '' : 'er'} · gjenopprett til lager når du vil ha dem tilbake i oversikten`
              : `${aktiveBiler.length} biler i lager · ${aktiveBiler.filter(b => b.status !== 'Solgt').length} aktive · ${aktiveBiler.filter(b => b.status === 'Annonsert').length} annonsert på FINN · klikk «Nr.» på kortet for å sette nummer · ${view === 'kanban' ? 'dra bil mellom kolonner (bortover)' : 'dra bil mellom stasjoner og opp/ned i listen (nedover)'}`}
          </div>
        </div>
      </div>
      <div className="bil-search-bar card" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div className="fl">Søk i alle biler</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={search}
            onChange={function (e) { setSearch(e.target.value); }}
            placeholder="Reg.nr, merke, modell, status, notater, dokumenter…"
            style={{ flex: 1 }}
          />
          {searchActive && (
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setSearch(''); }}>
              Nullstill
            </button>
          )}
        </div>
        {searchActive && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
            {searchHits.length} treff på tvers av lager, løype og arkiv
          </div>
        )}
      </div>
      {skjult > 0 && !searchActive && (
        <div style={{ fontSize: 11, color: 'var(--orange)', marginBottom: 10 }}>
          {skjult} bil{skjult > 1 ? 'er' : ''} skjult av filter
          {' · '}
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={function () { setMFilter('Alle'); setSFilter('Alle'); }}
          >
            Vis alle
          </button>
        </div>
      )}
      <div className="bil-sticky-bar">
        {section === 'lager' && kanLeggeTilBil && (
          <button type="button" className="btn btn-p bil-add-btn" onClick={() => setModal({ t: 'nyBil' })}>+ Legg til bil</button>
        )}
        <div className="bil-toolbar">
          {section !== 'arkiv' && klarTilAnnonseringCount > 0 && onSyncFinnStatus && (
            <button
              type="button"
              className="btn btn-g btn-sm bil-finn-sync-btn"
              disabled={finnSyncing}
              onClick={async function () {
                setFinnSyncing(true);
                try {
                  const res = await onSyncFinnStatus();
                  if (!res) return;
                  const msg = res.updated
                    ? `Flyttet ${res.updated} bil${res.updated === 1 ? '' : 'er'} til Annonsert ✓`
                    : `Ingen nye treff mot FINN (${res.unmatchedCount || 0} står fortsatt i «Klar til annonsering»)`;
                  if (visTost) visTost(msg);
                } catch (err) {
                  if (visTost) visTost(err?.message || 'FINN-synk feilet ✗');
                } finally {
                  setFinnSyncing(false);
                }
              }}
            >
              {finnSyncing ? 'Sjekker FINN…' : `Synk FINN → Annonsert (${klarTilAnnonseringCount})`}
            </button>
          )}
          {currentUser?.isAdmin && (
            <button
              type="button"
              className="btn btn-g btn-sm bil-slettelog-toggle"
              onClick={function () { setVisSlettelog(function (v) { return !v; }); }}
            >
              {visSlettelog ? 'Skjul slettelog' : 'Slettelog'}
            </button>
          )}
          <div className="view-toggle" role="group" aria-label="Område">
            <button
              type="button"
              className={`btn btn-sm ${section === 'lager' ? 'btn-p' : 'btn-g'}`}
              onClick={() => setSection('lager')}
            >
              Lager{aktiveBiler.length > 0 ? ` (${aktiveBiler.length})` : ''}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${section === 'arkiv' ? 'btn-p' : 'btn-g'}`}
              onClick={() => setSection('arkiv')}
            >
              Arkiv{arkivBiler.length > 0 ? ` (${arkivBiler.length})` : ''}
            </button>
          </div>
          {section === 'lager' && (
          <div className="view-toggle" role="group" aria-label="Visning">
            <button
              type="button"
              className={`btn btn-sm ${view === 'kanban' ? 'btn-p' : 'btn-g'}`}
              onClick={() => setView('kanban')}
              title="Kolonner side om side"
            >
              Kolonner
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === 'liste' ? 'btn-p' : 'btn-g'}`}
              onClick={() => setView('liste')}
              title="Pipeline nedover"
            >
              Liste
            </button>
          </div>
          )}
          <label className="bil-status-filter">
            <span className="bil-status-filter__lbl">Status</span>
            <select
              value={sFilter}
              onChange={function (e) { setSFilter(e.target.value); }}
              aria-label="Filtrer etter lagerstatus"
            >
              <option value="Alle">Alle statuser ({merkeFiltered.length})</option>
              {filterStatuser.map(function (status) {
                const count = statusCounts[status] || 0;
                return (
                  <option key={status} value={status} disabled={count === 0}>
                    {status}{count > 0 ? ` (${count})` : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {merker.length > 1 && (
            <div className="bil-filters-wrap">
              <div className="bil-filters">
                {merker.map(m => (
                  <button key={m} type="button" className={`btn btn-sm ${mFilter === m ? 'btn-p' : 'btn-g'}`} onClick={() => setMFilter(m)}>{m}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {currentUser?.isAdmin && visSlettelog && <BilSlettelogPanel />}
      <div className="biler-content">
      {searchActive ? (
        searchHits.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>
            Ingen biler matcher «{searchQuery}».
          </div>
        ) : (
          <div className="bil-arkiv">
            {searchHits.sort(function (a, b) {
              return String(a.reg || '').localeCompare(String(b.reg || ''));
            }).map(function (bil) {
              return (
                <div
                  className="bil-arkiv-row bil-arkiv-row--clickable"
                  key={bil.id}
                  role="button"
                  tabIndex={0}
                  onClick={function () { openBil(bil); }}
                  onKeyDown={function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openBil(bil);
                    }
                  }}
                >
                  <div className="bil-arkiv-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className="bil-reg">{bil.reg}</span>
                      <Badge s={bil.status} />
                      {bil.archived
                        ? <span className="chip chip-gray">Arkivert</span>
                        : <span className="chip chip-green">I lager</span>}
                    </div>
                    <div className="bil-name">{bil.merke} {bil.modell}</div>
                    <div className="bil-sub">
                      {bil.aar}{fmtKmLabel(bil.km) ? ` · ${fmtKmLabel(bil.km)}` : ''} · {bil.status}
                      {(bil.dokumenter || []).length > 0 ? ` · ${bil.dokumenter.length} dokument${bil.dokumenter.length === 1 ? '' : 'er'}` : ''}
                    </div>
                  </div>
                  <div className="bil-arkiv-actions" onClick={function (e) { e.stopPropagation(); }}>
                    <button type="button" className="btn btn-p btn-sm" onClick={function () { openBil(bil); }}>Åpne</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : section === 'arkiv' ? (
        vis.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>
            {arkivBiler.length === 0
              ? 'Arkivet er tomt. Arkiver biler fra lageroversikten når de ikke lenger skal vises der.'
              : filterActive
                ? 'Ingen arkiverte biler matcher filteret.'
                : 'Ingen arkiverte biler matcher merke-filteret.'}
          </div>
        ) : (
          <div className="bil-arkiv">
            {[...vis].sort(function (a, b) {
              return String(b.archivedAt || '').localeCompare(String(a.archivedAt || '')) || b.id - a.id;
            }).map(function (bil) {
              const archivedLabel = bil.archivedAt
                ? new Date(bil.archivedAt).toLocaleDateString('nb-NO', {
                  timeZone: NORSK_TIDSSONE,
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })
                : '—';
              return (
                <div
                  className="bil-arkiv-row bil-arkiv-row--clickable"
                  key={bil.id}
                  role="button"
                  tabIndex={0}
                  onClick={function () { openBil(bil); }}
                  onKeyDown={function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openBil(bil);
                    }
                  }}
                >
                  <div className="bil-arkiv-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className="bil-reg">{bil.reg}</span>
                      <Badge s={bil.status} />
                    </div>
                    <div className="bil-name">{bil.merke} {bil.modell}</div>
                    <div className="bil-sub">{bil.aar}{fmtKmLabel(bil.km) ? ` · ${fmtKmLabel(bil.km)}` : ''} · Arkivert {archivedLabel}</div>
                  </div>
                  <div className="bil-arkiv-actions" onClick={function (e) { e.stopPropagation(); }}>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => openBil(bil)}>Åpne</button>
                    <button type="button" className="btn btn-p btn-sm" onClick={() => restoreBil(bil)}>Gjenopprett</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : aktiveBiler.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>
          {kanLeggeTilBil
            ? <>Ingen biler i lager ennå. Legg til via <strong>+ Legg til bil</strong> eller importer fra <strong>Vegvesen-oppslag</strong>.</>
            : 'Ingen biler i lager ennå.'}
        </div>
      ) : vis.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>
          Ingen biler matcher filteret.
          {' '}
          <button type="button" className="btn btn-g btn-sm" onClick={function () { setMFilter('Alle'); setSFilter('Alle'); }}>
            Vis alle
          </button>
        </div>
      ) : view === 'kanban' ? (
      <div className="kanban">
        {visibleStatuser.map(status => {
          const kbiler = vis.filter(b => b.status === status);
          return (
            <div className="kan-col" key={status}>
              <div className="kan-hd">
                <div className="kan-dot" style={{ background: bilStatusFarge(status, lists) }} />
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
                onDrop={(e) => handleKanbanDrop(e, status)}
              >
                {kbiler.sort(sortBilerListe).map(renderBilKanbanCard)}
              </div>
            </div>
          );
        })}
      </div>
      ) : (
      <div className="bil-pipeline">
        {visibleStatuser.map(function (status) {
          const sbiler = grouped[status] || [];
          const showEndDrop = dragId && dropTarget?.status === status && dropTarget.beforeId == null;
          return (
            <div className="bil-pipeline-section" key={status}>
              <div className="bil-pipeline-hd">
                <div className="kan-dot" style={{ background: bilStatusFarge(status, lists) }} />
                <span className="kan-title">{status}</span>
                <span className="kan-n">{sbiler.length}</span>
              </div>
              <div
                className={`bil-pipeline-body${showEndDrop ? ' bil-pipeline-body--drop' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTarget({ status: status, beforeId: null });
                }}
                onDrop={(e) => handleListeDrop(e, status, null)}
              >
                {sbiler.length === 0 && !dragId && (
                  <div className="bil-pipeline-empty">Ingen biler i denne stasjonen</div>
                )}
                {sbiler.map(function (bil) {
                  const showDropBefore = dragId && dropTarget?.status === status && dropTarget.beforeId === bil.id;
                  return (
                    <div key={bil.id}>
                      {showDropBefore && <div className="bil-pipeline-drop-line" />}
                      {renderBilPipelineRow(bil, status)}
                    </div>
                  );
                })}
                {showEndDrop && <div className="bil-pipeline-drop-line" />}
              </div>
            </div>
          );
        })}
      </div>
      )}
      </div>
    </>
  );
}

// ─── BIL MODAL ───────────────────────────────────────────────────────────────
function BilTilstandsrapportSeksjon({ tilstandsrapport, onChange }) {
  const tr = normalizeBilTilstandsrapport(tilstandsrapport);

  const patch = function (next) {
    onChange({ ...tr, ...next });
  };

  return (
    <div className="tilstandsrapport-seksjon">
      <div className="modal-sec">Tilstandsrapport</div>
      <div className="tilstandsrapport-grid">
        <label className="tilstandsrapport-check">
          <input
            type="checkbox"
            checked={tr.nybilgaranti}
            onChange={function (e) { patch({ nybilgaranti: e.target.checked }); }}
          />
          Nybilgaranti
        </label>
        <label className="tilstandsrapport-check">
          <input
            type="checkbox"
            checked={tr.medfolger}
            onChange={function (e) { patch({ medfolger: e.target.checked }); }}
          />
          Medfølger
        </label>
        <label className="tilstandsrapport-check">
          <input
            type="checkbox"
            checked={tr.status === 'utfort'}
            onChange={function (e) {
              patch({ status: e.target.checked ? 'utfort' : null });
            }}
          />
          Utført
        </label>
        <label className="tilstandsrapport-check">
          <input
            type="checkbox"
            checked={tr.status === 'ikke_utfort'}
            onChange={function (e) {
              patch({ status: e.target.checked ? 'ikke_utfort' : null });
            }}
          />
          Ikke utført
        </label>
      </div>
      <div className="tilstandsrapport-subsec">
        <div className="tilstandsrapport-subsec__title">Annet nødvendig</div>
        <div className="tilstandsrapport-grid">
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.stylingDelerNodvendig}
              onChange={function (e) { patch({ stylingDelerNodvendig: e.target.checked }); }}
            />
            Styling deler nødvendig
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.stylingDelerBestilt}
              onChange={function (e) { patch({ stylingDelerBestilt: e.target.checked }); }}
            />
            Styling deler bestilt
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.reparasjonsdelerNodvendig}
              onChange={function (e) { patch({ reparasjonsdelerNodvendig: e.target.checked }); }}
            />
            Reparasjonsdeler nødvendig
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.reparasjonsdelerBestilt}
              onChange={function (e) { patch({ reparasjonsdelerBestilt: e.target.checked }); }}
            />
            Reparasjonsdeler bestilt
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.felglakkeringNodvendig}
              onChange={function (e) { patch({ felglakkeringNodvendig: e.target.checked }); }}
            />
            Felglakkering nødvendig
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.felglakkeringUtfort}
              onChange={function (e) { patch({ felglakkeringUtfort: e.target.checked }); }}
            />
            Felglakkering utført
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.lakkeringNodvendig}
              onChange={function (e) { patch({ lakkeringNodvendig: e.target.checked }); }}
            />
            Lakkering nødvendig
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.lakkeringUtfort}
              onChange={function (e) { patch({ lakkeringUtfort: e.target.checked }); }}
            />
            Lakkering utført
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.lakkstiftLakkboksNodvendig}
              onChange={function (e) { patch({ lakkstiftLakkboksNodvendig: e.target.checked }); }}
            />
            Lakkstift/lakkboks nødvendig
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.lakkstiftLakkboksUtfort}
              onChange={function (e) { patch({ lakkstiftLakkboksUtfort: e.target.checked }); }}
            />
            Lakkstift/lakkboks utført
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.bulkopprettingNodvendig}
              onChange={function (e) { patch({ bulkopprettingNodvendig: e.target.checked }); }}
            />
            Bulkoppretting nødvendig
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.bulkopprettingUtfort}
              onChange={function (e) { patch({ bulkopprettingUtfort: e.target.checked }); }}
            />
            Bulkoppretting utført
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.chromeDeleteNodvendig}
              onChange={function (e) { patch({ chromeDeleteNodvendig: e.target.checked }); }}
            />
            Chrome delete nødvendig
          </label>
          <label className="tilstandsrapport-check">
            <input
              type="checkbox"
              checked={tr.chromeDeleteUtfort}
              onChange={function (e) { patch({ chromeDeleteUtfort: e.target.checked }); }}
            />
            Chrome delete utført
          </label>
        </div>
      </div>
    </div>
  );
}

function BilArsprovekjennemerkeTab({ bil, biler, oppdaterArsprove }) {
  const data = normalizeBilArsprovekjennemerke(bil.arsprovekjennemerke);
  const valgtSkiltId = normalizeProvaskiltId(data.skiltnummer);

  const patch = function (next) {
    oppdaterArsprove({ ...data, ...next });
  };

  return (
    <div className="bil-modal__arsprove">
      <div className="modal-sec">Prøveskilt i bedriften</div>
      <div className="arsprove-skilt-grid">
        {PROVASKILT_SETT.map(function (skilt) {
          const bruker = finnBilMedProvaskilt(biler, skilt.id, bil.id);
          const erValgt = valgtSkiltId === skilt.id;
          const erOpptatt = !!bruker;
          return (
            <button
              type="button"
              key={skilt.id}
              className={`arsprove-skilt-card${erValgt ? ' is-selected' : ''}${erOpptatt && !erValgt ? ' is-opptatt' : ''}`}
              onClick={function () {
                if (erOpptatt && !erValgt) return;
                patch({ skiltnummer: skilt.label });
              }}
              disabled={erOpptatt && !erValgt}
            >
              <div className="arsprove-skilt-card__nr">{skilt.label}</div>
              <div className="arsprove-skilt-card__meta">
                {erValgt ? (
                  <span className="chip chip-green">Valgt på denne bilen</span>
                ) : erOpptatt ? (
                  <span className="chip chip-orange">På {bruker.reg}</span>
                ) : (
                  <span className="chip chip-green">Ledig</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="arsprove-kommende">
        <div className="arsprove-kommende__title">Vegvesen-registrering (kommer)</div>
        <p className="arsprove-kommende__text">
          Her kommer det snart modul for API-kobling mot Statens vegvesen for registrering av årsprøvekjennemerke på{' '}
          <strong>{bil.reg || 'bilen'}</strong>.
        </p>
        <button type="button" className="btn btn-g btn-sm" disabled title="Vegvesen API kommer snart">
          Registrer via Vegvesen
        </button>
      </div>

      <div className="modal-sec">Registrering</div>
      <div className="form-row gap">
        <div>
          <div className="fl">Prøveskilt</div>
          <select
            value={valgtSkiltId}
            onChange={function (e) {
              const skilt = PROVASKILT_SETT.find(function (s) { return s.id === e.target.value; });
              patch({ skiltnummer: skilt ? skilt.label : '' });
            }}
          >
            <option value="">Velg prøveskilt…</option>
            {PROVASKILT_SETT.map(function (s) {
              const opptatt = finnBilMedProvaskilt(biler, s.id, bil.id);
              return (
                <option key={s.id} value={s.id} disabled={!!opptatt && valgtSkiltId !== s.id}>
                  {s.label}{opptatt && valgtSkiltId !== s.id ? ` (på ${opptatt.reg})` : ''}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <div className="fl">Status</div>
          <select value={data.status} onChange={function (e) { patch({ status: e.target.value }); }}>
            {ARSPROVEKJENNEMERKE_STATUSER.map(function (s) {
              return <option key={s.id} value={s.id}>{s.label}</option>;
            })}
          </select>
        </div>
      </div>
      <div className="form-row gap">
        <div>
          <div className="fl">Gyldig fra</div>
          <input type="date" value={data.fraDato} onChange={function (e) { patch({ fraDato: e.target.value }); }} />
        </div>
        <div>
          <div className="fl">Gyldig til</div>
          <input type="date" value={data.tilDato} onChange={function (e) { patch({ tilDato: e.target.value }); }} />
        </div>
      </div>
      <div className="gap">
        <div className="fl">Notater</div>
        <textarea
          rows={3}
          value={data.notater}
          onChange={function (e) { patch({ notater: e.target.value }); }}
          placeholder="Interne notater om årsprøvekjennemerke…"
        />
      </div>
    </div>
  );
}

function buildAutosysLagring(parsed, raw, lists, prevBil, overstyrt) {
  const o = getBilAutosysOverstyrt(prevBil, overstyrt);
  const autosysFields = buildAutosysBilFelt(parsed, raw, lists, prevBil, overstyrt);
  const patch = { svvData: autosysFields.svvData };
  const localUpdate = { svvData: autosysFields.svvData };

  BIL_AUTOSYS_FELTER.forEach(function (key) {
    if (o[key]) return;
    const val = autosysFields[key];
    if (val == null || val === '') return;
    if (key === 'aar' && !Number(val)) return;
    patch[key] = val;
    localUpdate[key] = val;
  });

  return { patch, localUpdate, parsed, overstyrt: getBilAutosysOverstyrt(autosysFields.svvData) };
}

function applyAutosysLocalUpdate(prevBil, localUpdate, overstyrt) {
  const o = getBilAutosysOverstyrt(prevBil, overstyrt);
  const next = {
    ...prevBil,
    svvData: localUpdate.svvData != null ? localUpdate.svvData : prevBil.svvData
  };
  BIL_AUTOSYS_FELTER.forEach(function (key) {
    if (o[key]) return;
    if (localUpdate[key] == null || localUpdate[key] === '') return;
    if (key === 'aar' && !Number(localUpdate[key])) return;
    next[key] = localUpdate[key];
  });
  return next;
}

function mergeBilAfterAutosysSave(prevBil, saved) {
  if (!saved) return prevBil;
  const o = {
    ...getBilAutosysOverstyrt(saved),
    ...getBilAutosysOverstyrt(prevBil)
  };
  const next = { ...saved };
  BIL_AUTOSYS_FELTER.forEach(function (key) {
    if (o[key]) next[key] = prevBil[key];
  });
  BIL_LOCAL_TEXT_PRESERVE_FIELDS.forEach(function (key) {
    next[key] = prevBil[key];
  });
  next.innkjop = prevBil.innkjop;
  next.salg = prevBil.salg;
  next.okonomi = mergeBilOkonomi(saved.okonomi, prevBil.okonomi);
  next.svvData = mergeAutosysOverstyrtIntoSvvData(saved.svvData, o);
  return next;
}

function filterAutosysPatchByOverstyrt(patch, localUpdate, overstyrt) {
  const o = overstyrt || {};
  const nextPatch = { ...(patch || {}) };
  const nextLocal = { ...(localUpdate || {}) };
  BIL_AUTOSYS_FELTER.forEach(function (key) {
    if (!o[key]) return;
    delete nextPatch[key];
    delete nextLocal[key];
  });
  return { patch: nextPatch, localUpdate: nextLocal };
}

function mergeBilServerItem(prevBil, saved) {
  if (!saved) return prevBil;
  const next = { ...saved };
  BIL_LOCAL_TEXT_PRESERVE_FIELDS.forEach(function (key) {
    next[key] = prevBil[key];
  });
  return mergeBilAfterAutosysSave(prevBil, next);
}

const BIL_HYDRATE_PRESERVE_FIELDS = [
  'reg', 'merke', 'modell', 'aar', 'km', 'innkjop', 'salg', 'farge', 'status', 'pipelineNummer',
  'ansvarlig', 'frist', 'notater', 'euKontroll', 'forsikring', 'finnKode', 'chassisnr',
  'drivstoff', 'girkasse', 'utstyr', 'internInfo', 'okonomi', 'tilstandsrapport',
  'arsprovekjennemerke', 'sjekkliste', 'sjekklister'
];

function bilFieldChangedSinceSnapshot(prev, snapshot, key) {
  if (!snapshot) return false;
  return JSON.stringify(prev?.[key]) !== JSON.stringify(snapshot?.[key]);
}

function mergeBilAfterHydrate(prev, server, snapshot) {
  let next = mergeLocalBilFromServer(prev, server);
  BIL_HYDRATE_PRESERVE_FIELDS.forEach(function (key) {
    if (bilFieldChangedSinceSnapshot(prev, snapshot, key)) {
      next[key] = prev[key];
    }
  });
  return next;
}

async function hentAutosysPayload(reg, lists, prevBil, overstyrt) {
  const normalized = normalizeBilReg(reg);
  if (!isValidBilReg(normalized)) {
    throw new Error('Mangler gyldig registreringsnummer på bilen.');
  }
  const data = await lookupKjoretoy(normalized);
  const parsed = data.vehicle;
  if (!parsed) throw new Error('Fant ingen kjøretøydata.');
  return buildAutosysLagring(parsed, data.raw || null, lists, prevBil, overstyrt);
}

function BilModal({ data, onClose, updateBil, applyBilPatchLocal, deleteBil, hydrateBil, visTost, lists, kal, henv, innbytte, epost, setModal, setTab, setInnboksOpenEpost, kunder, biler, currentUser }) {
  const [bil, setBil] = useState(data);
  const [autosysOverstyrt, setAutosysOverstyrt] = useState(function () {
    return getBilAutosysOverstyrt(data);
  });
  const [activeTab, setActiveTab] = useState('informasjon');
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef(null);
  const bilRef = useRef(bil);
  const autosysOverstyrtRef = useRef(autosysOverstyrt);
  const saveChainRef = useRef(Promise.resolve());
  const textSaveChainRef = useRef(Promise.resolve());
  const debounceTimerRef = useRef(null);
  const autosysTextDebounceRef = useRef(null);
  const pendingAutosysTextPatchRef = useRef(null);
  const composingRef = useRef(false);
  const pendingPatchRef = useRef({});
  const bilSnapshotRef = useRef(data);
  const [closing, setClosing] = useState(false);
  bilRef.current = bil;
  autosysOverstyrtRef.current = autosysOverstyrt;

  const collectPendingTextPatch = useCallback(function () {
    const pending = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!Object.keys(pending).length) return null;
    const current = bilRef.current || {};
    const toSend = { ...pending };
    BIL_DEBOUNCED_TEXT_FIELDS.forEach(function (key) {
      if (key in pending) toSend[key] = current[key];
    });
    return toSend;
  }, []);

  const enqueueTextSave = useCallback(function (patch, msg) {
    const id = bilRef.current?.id;
    if (!id || !patch || !Object.keys(patch).length) return textSaveChainRef.current;
    textSaveChainRef.current = textSaveChainRef.current
      .catch(function () {})
      .then(function () { return updateBil(id, patch, msg); });
    return textSaveChainRef.current;
  }, [updateBil]);

  const enqueueSave = useCallback(function (patch, msg) {
    const id = bilRef.current?.id;
    if (!id || !patch || !Object.keys(patch).length) return saveChainRef.current;
    saveChainRef.current = saveChainRef.current
      .catch(function () {})
      .then(function () { return updateBil(id, patch, msg); });
    return saveChainRef.current;
  }, [updateBil]);

  const splitPatchBySaveKind = useCallback(function (patch) {
    const textPatch = {};
    const otherPatch = {};
    Object.keys(patch || {}).forEach(function (key) {
      if (BIL_AUTOSYS_TEXT_FIELDS.has(key) || key === 'svvData') {
        otherPatch[key] = patch[key];
        return;
      }
      if (BIL_DEBOUNCED_TEXT_FIELDS.has(key)) textPatch[key] = patch[key];
      else otherPatch[key] = patch[key];
    });
    return { textPatch, otherPatch };
  }, []);

  const flushTextSave = useCallback(function (msg) {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    const toSend = collectPendingTextPatch();
    if (!toSend || !Object.keys(toSend).length) return textSaveChainRef.current;
    return enqueueTextSave(toSend, msg);
  }, [enqueueTextSave, collectPendingTextPatch]);

  const saveImmediate = useCallback(function (patch, msg) {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    const pending = collectPendingTextPatch();
    const merged = { ...(pending || {}), ...patch };
    if (!Object.keys(merged).length) return saveChainRef.current;

    if (patchRequiresAtomicAutosysSave(merged)) {
      saveChainRef.current = textSaveChainRef.current
        .catch(function () {})
        .then(function () {
          const id = bilRef.current?.id;
          return updateBil(id, merged, msg);
        });
      return saveChainRef.current;
    }

    const split = splitPatchBySaveKind(merged);
    let chain = textSaveChainRef.current;
    if (Object.keys(split.textPatch).length) {
      chain = enqueueTextSave(split.textPatch);
    }
    if (Object.keys(split.otherPatch).length) {
      saveChainRef.current = chain
        .catch(function () {})
        .then(function () {
          const id = bilRef.current?.id;
          return updateBil(id, split.otherPatch, msg);
        });
      return saveChainRef.current;
    }
    return chain;
  }, [enqueueTextSave, collectPendingTextPatch, splitPatchBySaveKind, updateBil]);

  const saveImmediateRef = useRef(saveImmediate);
  saveImmediateRef.current = saveImmediate;

  const flushAutosysTextSave = useCallback(function (msg) {
    clearTimeout(autosysTextDebounceRef.current);
    autosysTextDebounceRef.current = null;
    const toSend = pendingAutosysTextPatchRef.current;
    pendingAutosysTextPatchRef.current = null;
    if (!toSend || !Object.keys(toSend).length) return saveChainRef.current;
    return saveImmediate(toSend, msg);
  }, [saveImmediate]);

  const scheduleAutosysTextSave = useCallback(function (patch, msg) {
    pendingAutosysTextPatchRef.current = {
      ...(pendingAutosysTextPatchRef.current || {}),
      ...patch
    };
    clearTimeout(autosysTextDebounceRef.current);
    autosysTextDebounceRef.current = setTimeout(function () {
      autosysTextDebounceRef.current = null;
      const toSend = pendingAutosysTextPatchRef.current;
      pendingAutosysTextPatchRef.current = null;
      if (toSend && Object.keys(toSend).length) {
        saveImmediate(toSend, msg);
      }
    }, 350);
  }, [saveImmediate]);

  const bilTextCompositionHandlers = useMemo(function () {
    return {
      onCompositionStart: function () { composingRef.current = true; },
      onCompositionEnd: function () {
        composingRef.current = false;
        flushAutosysTextSave();
      }
    };
  }, [flushAutosysTextSave]);

  const listsRef = useRef(lists);
  listsRef.current = lists;

  const autosysInitKeyRef = useRef('');
  const userEditedRef = useRef(false);

  const queueTextSave = useCallback(function (patch, msg) {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(function () {
      debounceTimerRef.current = null;
      const toSend = collectPendingTextPatch();
      if (toSend && Object.keys(toSend).length) enqueueTextSave(toSend, msg);
    }, 350);
  }, [enqueueTextSave, collectPendingTextPatch]);

  const handleClose = useCallback(function () {
    if (closing) return;
    setClosing(true);
    Promise.all([
      flushTextSave(),
      flushAutosysTextSave(),
      saveChainRef.current.catch(function () {})
    ]).finally(function () {
      setClosing(false);
      onClose();
    });
  }, [closing, flushTextSave, flushAutosysTextSave, onClose]);

  useEffect(function () {
    return function () {
      clearTimeout(debounceTimerRef.current);
      clearTimeout(autosysTextDebounceRef.current);
      const toSend = collectPendingTextPatch();
      const id = bilRef.current?.id;
      if (id && toSend && Object.keys(toSend).length) {
        enqueueTextSave(toSend);
      }
      const autosysPatch = pendingAutosysTextPatchRef.current;
      pendingAutosysTextPatchRef.current = null;
      if (id && autosysPatch && Object.keys(autosysPatch).length) {
        saveImmediateRef.current(autosysPatch);
      }
    };
  }, [enqueueTextSave, collectPendingTextPatch]);

  useEffect(function () {
    const next = { ...data, okonomi: normalizeBilOkonomi(data.okonomi) };
    setBil(next);
    bilSnapshotRef.current = next;
    const o = getBilAutosysOverstyrt(next);
    setAutosysOverstyrt(o);
    bilRef.current = next;
    autosysOverstyrtRef.current = o;
    autosysInitKeyRef.current = '';
    userEditedRef.current = false;
  }, [data.id]);

  useEffect(function () {
    if (userEditedRef.current) return;
    setBil(function (prev) {
      const merged = mergeLocalBilFromServer(prev, data);
      bilRef.current = merged;
      autosysOverstyrtRef.current = getBilAutosysOverstyrt(merged);
      setAutosysOverstyrt(getBilAutosysOverstyrt(merged));
      return merged;
    });
  }, [data]);

  useEffect(function () {
    if (!data?.id || !data.lite) return;
    let cancelled = false;
    getBil(data.id).then(function (res) {
      if (cancelled || !res.item) return;
      const next = normalizeBilItems([res.item])[0];
      delete next.lite;
      next.okonomi = normalizeBilOkonomi(next.okonomi);
      setBil(function (prev) {
        const merged = mergeBilAfterHydrate(prev, next, bilSnapshotRef.current);
        bilRef.current = merged;
        autosysOverstyrtRef.current = getBilAutosysOverstyrt(merged);
        setAutosysOverstyrt(getBilAutosysOverstyrt(merged));
        return merged;
      });
      if (hydrateBil) hydrateBil(res.item);
    }).catch(function () { /* stille */ });
    return function () { cancelled = true; };
  }, [data.id, data.lite, hydrateBil]);

  const lagreAutosys = useCallback(async function (options) {
    const currentBil = bilRef.current;
    const currentOverstyrt = autosysOverstyrtRef.current;
    const reg = normalizeBilReg(currentBil.reg);
    const result = await hentAutosysPayload(reg, lists, currentBil, currentOverstyrt);
    const outcome = await applyAutosysFetchResult(result, {
      cancelled: function () { return false; },
      userEditedRef: userEditedRef,
      autosysOverstyrtRef: autosysOverstyrtRef,
      bilRef: bilRef,
      saveImmediateRef: saveImmediateRef,
      setBil: setBil,
      setAutosysOverstyrt: setAutosysOverstyrt,
      allowWhileEditing: true
    });
    if (!options?.silent && outcome?.saved) {
      visTost('Autosys-data oppdatert ✓');
    }
    return result.parsed;
  }, [lists, visTost]);

  useEffect(function () {
    const reg = normalizeBilReg(data.reg);
    if (!isValidBilReg(reg)) return;
    if (data.lite) return;

    const initKey = String(data.id) + ':' + reg;
    if (autosysInitKeyRef.current === initKey) return;
    if (hasAutosysVehicleData(bilRef.current?.svvData)) {
      autosysInitKeyRef.current = initKey;
      return;
    }

    autosysInitKeyRef.current = initKey;
    let cancelled = false;

    hentAutosysPayload(reg, listsRef.current, bilRef.current, autosysOverstyrtRef.current).then(function (result) {
      return applyAutosysFetchResult(result, {
        cancelled: function () { return cancelled; },
        userEditedRef: userEditedRef,
        autosysOverstyrtRef: autosysOverstyrtRef,
        bilRef: bilRef,
        saveImmediateRef: saveImmediateRef,
        setBil: setBil,
        setAutosysOverstyrt: setAutosysOverstyrt
      });
    }).catch(function () { /* stille bakgrunnshenting */ });

    return function () { cancelled = true; };
  }, [data.id, data.reg, data.lite]);

  const docCount = (bil.dokumenter || []).length;
  const bilTabs = [
    { id: 'informasjon', label: 'Informasjon' },
    { id: 'autosys', label: 'Autosys' },
    { id: 'okonomi', label: 'Økonomi' },
    { id: 'reservasjon', label: 'Reservasjon' },
    { id: 'arsprove', label: 'Årsprøvekjennemerke' },
    { id: 'vedlegg', label: docCount ? `Vedlegg (${docCount})` : 'Vedlegg' }
  ];

  const avtaler = (kal || [])
    .filter(function (e) { return matchesBilRef(e.bilRef, bil.reg); })
    .sort(function (a, b) { return a.dato.localeCompare(b.dato) || a.tid.localeCompare(b.tid); });
  const harInnboks = canAccess(currentUser, 'innboks');
  const henvendelser = buildBilHenvendelseItems(bil, henv, innbytte, epost, harInnboks);
  const knyttetInnbytte = useMemo(function () {
    return (innbytte || []).find(function (i) { return matchesInnbytteTilBil(i, bil); }) || null;
  }, [innbytte, bil?.reg, bil?.finnKode, bil?.chassisnr, bil?.svvData]);

  const openHenvendelseItem = function (item) {
    if (item.type === 'kontaktskjema') setModal({ t: 'visHenv', d: item.data });
    else if (item.type === 'innbytte') setModal({ t: 'visInb', d: item.data });
    else if (item.type === 'epost') {
      handleClose();
      setInnboksOpenEpost(item.data);
      setTab('innboks');
    }
  };

  const henvendelseTypeChip = function (kind) {
    if (kind === 'epost') return 'chip chip-gray';
    if (kind === 'innbytte') return 'chip chip-orange';
    return 'chip chip-gray';
  };

  const oppdater = (k, v, msg) => {
    userEditedRef.current = true;
    if (composingRef.current && (BIL_AUTOSYS_TEXT_FIELDS.has(k) || BIL_DEBOUNCED_TEXT_FIELDS.has(k))) {
      setBil(function (prev) {
        let nextOverstyrt = getBilAutosysOverstyrt(prev);
        if (BIL_AUTOSYS_FELTER.includes(k)) {
          nextOverstyrt = markBilAutosysOverstyrt(nextOverstyrt, k);
          autosysOverstyrtRef.current = nextOverstyrt;
          setAutosysOverstyrt(nextOverstyrt);
        }
        const patch = { [k]: v };
        if (BIL_AUTOSYS_FELTER.includes(k)) {
          patch.svvData = mergeAutosysOverstyrtIntoSvvData(prev.svvData, nextOverstyrt);
          pendingAutosysTextPatchRef.current = {
            ...(pendingAutosysTextPatchRef.current || {}),
            ...patch
          };
        }
        const next = { ...prev, ...patch };
        bilRef.current = next;
        applyBilPatchLocal(prev.id, patch);
        return next;
      });
      return;
    }
    if (k === 'status') {
      setBil(function (prev) {
        if (v === prev.status) return prev;
        const next = withStatusChange(prev, v, lists.bilSjekklister);
        saveImmediate(next, msg);
        return { ...prev, ...next };
      });
      return;
    }
    if (k === 'sjekkliste') {
      setBil(function (prev) {
        const next = withSjekklisteUpdate(prev, v);
        saveImmediate({ sjekklister: next.sjekklister, sjekkliste: next.sjekkliste }, msg);
        return { ...prev, ...next };
      });
      return;
    }
    setBil(function (prev) {
      const stored = v;
      const payload = BIL_NUMERIC_FIELDS.has(k) ? numberInputForSave(v) : v;
      const wasOverstyrt = !!getBilAutosysOverstyrt(prev)[k];
      let nextOverstyrt = getBilAutosysOverstyrt(prev);

      if (k === 'reg') {
        const fetchedReg = autosysRegFromStored(prev.svvData);
        if (fetchedReg && normalizeBilReg(payload) !== fetchedReg) {
          nextOverstyrt = {};
        } else {
          nextOverstyrt = markBilAutosysOverstyrt(nextOverstyrt, k);
        }
      } else if (BIL_AUTOSYS_FELTER.includes(k)) {
        nextOverstyrt = markBilAutosysOverstyrt(nextOverstyrt, k);
      }

      autosysOverstyrtRef.current = nextOverstyrt;
      setAutosysOverstyrt(nextOverstyrt);

      const patch = { [k]: payload };
      if (BIL_AUTOSYS_FELTER.includes(k)) {
        patch.svvData = mergeAutosysOverstyrtIntoSvvData(prev.svvData, nextOverstyrt);
      }

      if (BIL_AUTOSYS_TEXT_FIELDS.has(k)) {
        applyBilPatchLocal(prev.id, patch);
        const atomicPatch = {
          [k]: payload,
          ...(patch.svvData != null ? { svvData: patch.svvData } : {})
        };
        if (!wasOverstyrt) {
          saveImmediate(atomicPatch, msg);
        } else {
          scheduleAutosysTextSave(atomicPatch, msg);
        }
      } else if (BIL_DEBOUNCED_TEXT_FIELDS.has(k)) {
        applyBilPatchLocal(prev.id, patch);
        queueTextSave({ [k]: payload }, msg);
      } else {
        saveImmediate(patch, msg);
      }
      const next = {
        ...prev,
        [k]: stored,
        ...(patch.svvData != null ? { svvData: patch.svvData } : {})
      };
      if (k === 'innkjop' || k === 'salg') {
        bilSnapshotRef.current = { ...bilSnapshotRef.current, [k]: stored };
      }
      bilRef.current = next;
      return next;
    });
  };

  const oppdaterOkonomi = (patch, msg) => {
    const prev = bilRef.current || bil;
    const local = mergeBilOkonomi(prev.okonomi, patch);
    const normalized = normalizeBilOkonomi(local);
    const next = { ...prev, okonomi: normalized };
    bilRef.current = next;
    bilSnapshotRef.current = { ...bilSnapshotRef.current, okonomi: normalized };
    setBil(next);
    saveImmediate({ okonomi: normalized }, msg || 'Økonomi oppdatert ✓').then(function (saved) {
      if (!saved) return;
      setBil(function (current) {
        const merged = {
          ...current,
          okonomi: normalizeBilOkonomi(mergeBilOkonomi(saved.okonomi, (bilRef.current || current).okonomi))
        };
        bilRef.current = merged;
        return merged;
      });
    });
  };

  const oppdaterReservasjon = useCallback(function (patch, msg) {
    const prev = bilRef.current || bil;
    const base = prev.okonomi?.reservasjon && typeof prev.okonomi.reservasjon === 'object'
      ? prev.okonomi.reservasjon
      : {};
    oppdaterOkonomi({ reservasjon: { ...base, ...patch } }, msg);
  }, [bil, oppdaterOkonomi]);

  const oppdaterArsprove = (patch, msg) => {
    const arsprovekjennemerke = { ...normalizeBilArsprovekjennemerke(bil.arsprovekjennemerke), ...patch };
    oppdater('arsprovekjennemerke', arsprovekjennemerke, msg || 'Årsprøvekjennemerke oppdatert ✓');
  };

  const toggleSjekk = (i) => {
    const list = getAktivSjekkliste(bil);
    const ny = list.map((s, idx) => idx === i ? { ...s, f: !s.f } : s);
    oppdater('sjekkliste', ny, 'Oppgave oppdatert ✓');
  };

  const lastOppDokumenter = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const res = await uploadBilDokumenter(bil.id, files);
      if (res.item) {
        setBil(function (prev) {
          const next = mergeBilServerItem(prev, res.item);
          bilRef.current = next;
          return next;
        });
        saveImmediate({ dokumenter: res.item.dokumenter }, 'Dokumenter lastet opp ✓');
      }
    } catch (err) {
      visTost(err.message || 'Kunne ikke laste opp filer ✗');
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const slettDokument = (docKey) => {
    if (!window.confirm('Slette dette dokumentet?')) return;
    const dokumenter = (bil.dokumenter || []).filter(function (item) {
      return (item.id || item.path) !== docKey;
    });
    oppdater('dokumenter', dokumenter, 'Dokument slettet ✓');
  };

  const formatFileSize = (bytes) => {
    const size = Number(bytes) || 0;
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const list = getAktivSjekkliste(bil);
  const prog = calcSjekklisteFremdrift(list);
  const { f, t, pst } = prog;

  const flyttTilStatus = (nextStatus) => {
    if (!nextStatus || nextStatus === bil.status) return;
    oppdater('status', nextStatus, `Flyttet til ${nextStatus} ✓`);
  };

  const arkiver = async function () {
    if (!window.confirm(`Arkivere ${bil.reg}? Bilen fjernes fra lageroversikten, men kan gjenopprettes fra arkiv.`)) return;
    await flushTextSave();
    await updateBil(bil.id, {
      archived: true,
      logg: [...(bil.logg || []), bilLoggEntry('Arkivert fra lager')]
    }, 'Arkivert ✓');
    onClose();
  };

  const gjenopprett = async function () {
    await flushTextSave();
    await updateBil(bil.id, {
      archived: false,
      logg: [...(bil.logg || []), bilLoggEntry('Gjenopprettet fra arkiv')]
    }, 'Gjenopprettet til lager ✓');
    onClose();
  };

  const slettBilPermanent = async function () {
    if (!deleteBil) return;
    await flushTextSave();
    const ok = await deleteBil(bil);
    if (ok) onClose();
  };

  const kanSletteBil = canDeleteBil(currentUser);
  const merkeOptions = buildMerkeOptions(lists.merker, biler, bil.merke);

  return (
    <div className="ov ov--no-dismiss">
      <div className="modal xl bil-modal">
        <div className="bil-modal__header">
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>
              {bil.merke} {bil.modell}{' '}
              <span style={{ color: 'var(--acc)', fontSize: 14 }}>{bil.reg}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge s={bil.status} />
              {bil.archived && <span className="chip chip-gray">Arkivert</span>}
              {bil.euKontroll && (
                <span className={`chip ${euKontrollChipClass(bil.euKontroll)}`}>
                  Neste EU-kontroll: {formatEuKontrollVisning(bil.euKontroll)}
                </span>
              )}
              {(() => {
                const tr = normalizeBilTilstandsrapport(bil.tilstandsrapport);
                return (
                  <>
                    {tr.nybilgaranti && <span className="chip chip-green">Tilstandsrapport: Nybilgaranti</span>}
                    {tr.medfolger && <span className="chip chip-green">Tilstandsrapport: Medfølger</span>}
                    {tr.status === 'utfort' && <span className="chip chip-green">Tilstandsrapport: Utført</span>}
                    {tr.status === 'ikke_utfort' && <span className="chip chip-red">Tilstandsrapport: Ikke utført</span>}
                    {tilstandsrapportDelerChips(tr).map(function (chip) {
                      return (
                        <span key={chip.label} className={`chip chip-${chip.tone}`}>
                          {chip.label}
                        </span>
                      );
                    })}
                  </>
                );
              })()}
              {bil.svvData && <span className="chip chip-green">✓ Vegvesen-verifisert</span>}
              {(() => {
                const regChip = registreringsstatusChip(getRegistreringsstatusFromSvvData(bil.svvData));
                if (!regChip) return null;
                return <span className={`chip ${regChip.className}`}>{regChip.label}</span>;
              })()}
              {(() => {
                if (!erArsprovekjennemerkeIbruk(bil.arsprovekjennemerke)) return null;
                const ap = normalizeBilArsprovekjennemerke(bil.arsprovekjennemerke);
                const label = ap.skiltnummer ? `Årsprøve: ${ap.skiltnummer}` : 'Årsprøve: Aktiv';
                return <span className="chip chip-orange">{label}</span>;
              })()}
            </div>
          </div>
          <div className="bil-modal__actions">
            {!bil.archived && (
              <>
                <div className="bil-modal__flytt">
                  <div className="fl">Flytt bil</div>
                  <select
                    className="bil-modal__flytt-select"
                    value={bil.status}
                    onChange={function (e) { flyttTilStatus(e.target.value); }}
                  >
                    {lists.bilStatuser.map(function (s) {
                      return <option key={s} value={s}>{s}</option>;
                    })}
                  </select>
                </div>
                <button type="button" className="btn btn-g btn-sm bil-modal__arkiv-btn" onClick={arkiver}>
                  Arkiver bil
                </button>
              </>
            )}
            {bil.archived && (
              <button type="button" className="btn btn-p btn-sm bil-modal__arkiv-btn" onClick={gjenopprett}>
                Gjenopprett til lager
              </button>
            )}
          </div>
        </div>

        <ModalTabs tabs={bilTabs} active={activeTab} onChange={setActiveTab} />

        <div className="bil-modal__body">
        {activeTab === 'informasjon' && (
          <div className="bil-modal__grid">
            <div>
              <div className="modal-sec">Grunninfo</div>
              <div className="form-row gap">
                <div>
                  <div className="fl">Reg.nummer</div>
                  <input value={bil.reg || ''} onChange={e => oppdater('reg', e.target.value.toUpperCase())} placeholder="AB12345" />
                </div>
                <div>
                  <div className="fl">Merke</div>
                  <select value={bil.merke || 'Annet'} onChange={e => oppdater('merke', e.target.value)}>
                    {merkeOptions.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row gap">
                <div>
                  <div className="fl">Modell</div>
                  <input
                    value={bil.modell || ''}
                    onChange={e => oppdater('modell', e.target.value)}
                    {...bilTextCompositionHandlers}
                  />
                </div>
                <div>
                  <div className="fl">Farge</div>
                  <input
                    value={bil.farge || ''}
                    onChange={e => oppdater('farge', e.target.value)}
                    onBlur={function (e) {
                      const formatted = formatSvvFargeNavn(e.target.value);
                      if (formatted !== (bilRef.current?.farge || '')) {
                        oppdater('farge', formatted);
                      }
                    }}
                    {...bilTextCompositionHandlers}
                  />
                </div>
              </div>
              <div className="form-row gap">
                <div>
                  <div className="fl">Årsmodell</div>
                  <input type="number" value={numberInputDisplay(bil.aar)} onChange={e => oppdater('aar', parseNumberInput(e.target.value))} />
                </div>
                <div>
                  <div className="fl">Kilometerstand</div>
                  <input type="number" value={kmInputDisplay(bil.km)} onChange={e => oppdater('km', parseNumberInput(e.target.value))} />
                </div>
              </div>
              <div className="gap">
                <div className="fl">Frist neste EU-kontroll</div>
                <input type="date" value={normalizeEuKontrollDato(bil.euKontroll)} onChange={e => oppdater('euKontroll', e.target.value)} />
              </div>
              <BilTilstandsrapportSeksjon
                tilstandsrapport={bil.tilstandsrapport}
                onChange={function (next) { oppdater('tilstandsrapport', next, 'Tilstandsrapport oppdatert ✓'); }}
              />
              <div className="gap">
                <div className="fl">Ansvarlig</div>
                <select value={bil.ansvarlig} onChange={e => oppdater('ansvarlig', e.target.value)}>
                  {lists.ansatte.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <BilKunderVelger
                label="Kunder på bilen"
                kundeIds={bil.kundeIds || (bil.kundeId ? [bil.kundeId] : [])}
                kunder={kunder}
                setModal={setModal}
                onChange={function (ids) { oppdater('kundeIds', ids, 'Kunder oppdatert ✓'); }}
              />

              <div className="modal-sec">Utvidet informasjon</div>
              <div className="gap">
                <div className="fl">FINN-kode / annonse-ID</div>
                <input value={bil.finnKode || ''} onChange={e => oppdater('finnKode', e.target.value)} placeholder="F.eks. 123456789" />
              </div>
              <div className="gap">
                <div className="fl">Utstyr / ekstra info</div>
                <textarea rows={3} value={bil.utstyr || ''} onChange={e => oppdater('utstyr', e.target.value)} placeholder="Utstyrspakke, hengerfeste, vinterdekk medfølger…" {...bilTextCompositionHandlers} />
              </div>

              <InternKommentarerSeksjon
                kommentarer={bil.kommentarer}
                currentUser={currentUser}
                onChange={function (next, msg) { oppdater('kommentarer', next, msg); }}
              />
            </div>

            <div>
              <div className="modal-sec">Sjekkliste — {bil.status} ({f}/{t} obligatoriske fullført)</div>
              <div style={{ marginBottom: 10 }}>
                <div className="prog-bar" style={{ height: 5 }}>
                  <div className="prog-fill" style={{ width: pst + '%', height: 5 }} />
                </div>
              </div>
              {list.map((s, i) => (
                <div className="chk-item" key={i}>
                  <div className={`chk-box${s.f ? ' done' : ''}`} onClick={() => toggleSjekk(i)}>
                    {s.f && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                  </div>
                  <span className={`chk-txt${s.f ? ' done' : ''}`}>{s.t}</span>
                  {!s.obligatorisk && <span className="chip chip-gray" style={{ fontSize: 9, marginLeft: 6 }}>Frivillig</span>}
                </div>
              ))}

              <div className="bil-modal__notater gap">
                <div className="fl">Notater</div>
                <textarea
                  className="bil-modal__notater-field"
                  rows={6}
                  value={bil.notater || ''}
                  onChange={e => oppdater('notater', e.target.value)}
                  placeholder="Interne notater om bilen…"
                />
              </div>

              <div className="modal-sec" style={{ marginTop: 24 }}>Tilknyttet aktivitet</div>
              <div className="bil-links-stack">
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
                  ) : henvendelser.map(function (item) {
                    return (
                      <button
                        type="button"
                        key={item.key}
                        className="bil-link-item"
                        onClick={function () { openHenvendelseItem(item); }}
                      >
                        <div className="bil-link-item__top">
                          <span className={henvendelseTypeChip(item.badgeKind)} style={{ fontSize: 9 }}>{item.typeLabel}</span>
                          {item.badgeKind === 'henv' && (
                            <Badge s={item.badge} colors={lists.henvStatusFarger} />
                          )}
                          {item.badgeKind === 'innbytte' && (
                            <Badge s={item.badge} colors={lists.innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER} />
                          )}
                          {item.badgeKind === 'epost' && (
                            <span className={item.badge === 'Ulest' ? 'chip chip-red' : 'chip chip-gray'}>{item.badge}</span>
                          )}
                          <span className="bil-link-item__meta">{item.dato || '—'}</span>
                        </div>
                        <div className="bil-link-item__title">{item.title}</div>
                        <div className="bil-link-item__sub">{item.sub}{item.meta ? ` · ${item.meta}` : ''}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'autosys' && (
          <BilAutosysTab bil={bil} lagreAutosys={lagreAutosys} visTost={visTost} />
        )}

        {activeTab === 'okonomi' && (
          <BilOkonomiTab bil={bil} oppdater={oppdater} oppdaterOkonomi={oppdaterOkonomi} />
        )}

        {activeTab === 'reservasjon' && (
          <BilReservasjonTab bil={bil} kunder={kunder} knyttetInnbytte={knyttetInnbytte} oppdaterReservasjon={oppdaterReservasjon} visTost={visTost} />
        )}

        {activeTab === 'arsprove' && (
          <BilArsprovekjennemerkeTab bil={bil} biler={biler} oppdaterArsprove={oppdaterArsprove} />
        )}

        {activeTab === 'vedlegg' && (
          <div className="bil-modal__vedlegg">
            <div className="modal-sec">Dokumenter · {(bil.dokumenter || []).length}</div>
            {(bil.dokumenter || []).length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>Ingen dokumenter lastet opp ennå.</div>
            )}
            {(bil.dokumenter || []).map(function (doc) {
              const docKey = doc.id || doc.path;
              return (
                <div className="logg-item" key={docKey}>
                  <div className="logg-tekst">
                    <a href={doc.path} target="_blank" rel="noreferrer">{doc.name || 'Dokument'}</a>
                  </div>
                  <div className="logg-meta logg-meta--row">
                    <span>
                      {formatFileSize(doc.size)}
                      {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ''}
                      {formatKommentarDato(doc.uploadedAt) ? ` · ${formatKommentarDato(doc.uploadedAt)}` : ''}
                    </span>
                    <button type="button" className="btn btn-red btn-xs" onClick={function () { slettDokument(docKey); }}>
                      Slett
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="bil-upload-zone">
              <input
                ref={uploadRef}
                type="file"
                multiple
                onChange={lastOppDokumenter}
                disabled={uploading}
              />
              <span style={{ fontSize: 11, color: 'var(--t4)' }}>
                {uploading ? 'Laster opp…' : 'PDF, Word, bilder m.m. (maks 8 MB per fil)'}
              </span>
            </div>
          </div>
        )}
        </div>

        <div className="modal-footer bil-modal__footer">
          <button type="button" className="btn btn-p" onClick={handleClose} disabled={closing}>
            {closing ? 'Lagrer…' : 'Lagre & lukk'}
          </button>
          <button type="button" className="btn btn-g" onClick={handleClose} disabled={closing}>Avbryt</button>
          {kanSletteBil && (
            <button type="button" className="btn btn-red bil-modal__slett-btn" onClick={slettBilPermanent}>
              Slett bil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BilOkonomiTab({ bil, oppdater, oppdaterOkonomi }) {
  const okonomi = normalizeBilOkonomi(bil.okonomi);
  const stats = calcBilOkonomi(
    bil.innkjop,
    bil.salg,
    okonomi
  );
  const parsedUke = parseProfittUke(okonomi.profittUke);
  const ukeYear = parsedUke?.year || getCurrentProfittUke()?.slice(0, 4) || String(new Date().getFullYear());
  const ukeNum = parsedUke?.week || '';
  const maxWeek = getIsoWeeksInYear(Number(ukeYear));
  const [nyKostLabel, setNyKostLabel] = useState('');
  const [nyKostBelop, setNyKostBelop] = useState('');

  const settProfittUke = (year, week) => {
    if (!year || !week) {
      oppdaterOkonomi({ profittUke: null }, 'Profittuke fjernet ✓');
      return;
    }
    const next = formatProfittUke(year, week);
    oppdaterOkonomi({ profittUke: next }, 'Profittuke oppdatert ✓');
  };

  const settOkonomiFelt = (key, value) => {
    oppdaterOkonomi({ [key]: parseNumberInput(value) });
  };

  const leggTilKostnad = () => {
    if (!nyKostLabel.trim() && !nyKostBelop) return;
    const belop = parseNumberInput(nyKostBelop);
    if (belop === '' && !nyKostLabel.trim()) return;
    const kostnader = [
      ...okonomi.kostnader,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: nyKostLabel.trim() || 'Kostnad',
        belop: belop === '' ? null : belop
      }
    ];
    oppdaterOkonomi({ kostnader }, 'Kostnad lagt til ✓');
    setNyKostLabel('');
    setNyKostBelop('');
  };

  const oppdaterKostnad = (id, patch) => {
    const kostnader = okonomi.kostnader.map(function (item) {
      return item.id === id ? { ...item, ...patch } : item;
    });
    oppdaterOkonomi({ kostnader });
  };

  const slettKostnad = (id) => {
    oppdaterOkonomi({
      kostnader: okonomi.kostnader.filter(function (item) { return item.id !== id; })
    }, 'Kostnad slettet ✓');
  };

  return (
    <div className="bil-modal__okonomi">
      <div className="bil-okonomi-grid">
        <div>
          <div className="modal-sec">Innkjøp og salg</div>
          <div className="form-row gap">
            <div>
              <div className="fl">Innkjøpspris (kr)</div>
              <input type="number" value={monetaryInputDisplay(bil.innkjop)} onChange={e => oppdater('innkjop', parseNumberInput(e.target.value), 'Innkjøp oppdatert ✓')} />
            </div>
            <div>
              <div className="fl">Salgspris (kr)</div>
              <input type="number" value={monetaryInputDisplay(bil.salg)} onChange={e => oppdater('salg', parseNumberInput(e.target.value), 'Salgspris oppdatert ✓')} />
            </div>
          </div>
        </div>
        <div className="bil-okonomi-summary">
          <div className="bil-okonomi-summary__item">
            <div className="fl">Brutto margin</div>
            <div className="fv" style={{ fontWeight: 700 }}>{nok(stats.bruttoMargin)}</div>
          </div>
          <div className="bil-okonomi-summary__item">
            <div className="fl">Totale kostnader</div>
            <div className="fv">{nok(stats.totaltKostnader)}</div>
          </div>
          <div className="bil-okonomi-summary__item bil-okonomi-summary__item--highlight">
            <div className="fl">Netto margin</div>
            <div className="fv" style={{ color: stats.nettoMargin >= 0 ? 'var(--acc)' : 'var(--red)', fontWeight: 800, fontSize: 18 }}>
              {nok(stats.nettoMargin)}
            </div>
            {okonomiBelopValue(bil.salg) > 0 ? (
              <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>{stats.marginProsent}% av salgspris</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="modal-sec">Profittuke</div>
      <div className="bil-okonomi-uke">
        <div>
          <div className="fl">År</div>
          <select
            value={String(ukeYear)}
            onChange={e => settProfittUke(Number(e.target.value), ukeNum || 1)}
          >
            {Array.from({ length: 6 }, function (_, i) {
              const y = new Date().getFullYear() + 1 - i;
              return <option key={y} value={String(y)}>{y}</option>;
            })}
          </select>
        </div>
        <div>
          <div className="fl">Uke</div>
          <select
            value={ukeNum ? String(ukeNum) : ''}
            onChange={e => settProfittUke(ukeYear, Number(e.target.value))}
          >
            <option value="">Velg uke…</option>
            {Array.from({ length: maxWeek }, function (_, i) {
              const w = i + 1;
              return <option key={w} value={String(w)}>Uke {w}</option>;
            })}
          </select>
        </div>
        <div className="bil-okonomi-uke__actions">
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={function () {
              const current = getCurrentProfittUke();
              const parsed = parseProfittUke(current);
              if (parsed) settProfittUke(parsed.year, parsed.week);
            }}
          >
            Denne uken
          </button>
          {okonomi.profittUke ? (
            <button type="button" className="btn btn-g btn-sm" onClick={function () { settProfittUke(null, null); }}>
              Fjern
            </button>
          ) : null}
        </div>
        {okonomi.profittUke ? (
          <div className="bil-okonomi-uke__label">{formatProfittUkeLabel(okonomi.profittUke)}</div>
        ) : (
          <div className="bil-okonomi-uke__label bil-okonomi-uke__label--empty">Ikke satt — telles ikke i ukentlig profitt</div>
        )}
      </div>

      <div className="modal-sec">Faste kostnader</div>
      <div className="bil-okonomi-kostnader">
        {[
          ['pakost', 'Påkost / klargjøring'],
          ['aukGebyr', 'Auksjonsgebyr'],
          ['garantikost', 'Garantikost'],
          ['omregAvgift', 'Omregistreringsavgift']
        ].map(function (entry) {
          const key = entry[0];
          const label = entry[1];
          return (
            <div key={key}>
              <div className="fl">{label}</div>
              <input type="number" value={okonomiBelopDisplay(okonomi[key])} onChange={e => settOkonomiFelt(key, e.target.value)} />
            </div>
          );
        })}
      </div>

      <div className="modal-sec">Andre kostnader</div>
      {okonomi.kostnader.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>Ingen ekstra kostnader registrert.</div>
      ) : null}
      {okonomi.kostnader.map(function (item) {
        return (
          <div className="bil-kostnad-row" key={item.id}>
            <input
              value={item.label}
              placeholder="Beskrivelse"
              onChange={e => oppdaterKostnad(item.id, { label: e.target.value })}
            />
            <input
              type="number"
              value={okonomiBelopDisplay(item.belop)}
              placeholder="Beløp"
              onChange={e => oppdaterKostnad(item.id, { belop: parseNumberInput(e.target.value) })}
            />
            <button type="button" className="btn btn-red btn-xs" onClick={function () { slettKostnad(item.id); }}>
              Slett
            </button>
          </div>
        );
      })}
      <div className="bil-kostnad-row bil-kostnad-row--new">
        <input value={nyKostLabel} placeholder="Ny kostnad..." onChange={e => setNyKostLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && leggTilKostnad()} />
        <input type="number" value={nyKostBelop} placeholder="Beløp" onChange={e => setNyKostBelop(e.target.value)} onKeyDown={e => e.key === 'Enter' && leggTilKostnad()} />
        <button type="button" className="btn btn-g btn-sm" onClick={leggTilKostnad}>+</button>
      </div>
    </div>
  );
}

// ─── NY BIL MODAL ────────────────────────────────────────────────────────────
function autosysRegFromStored(svvData) {
  if (!svvData || typeof svvData !== 'object') return '';
  return normalizeBilReg(
    svvData.vehicle?.regNr
    || svvData.regNr
    || svvData.raw?.kjoretoyId?.kjennemerke
    || svvData.kjoretoyId?.kjennemerke
  );
}

function NyBilModal({ onClose, onSave, lists, biler, visTost }) {
  const initialMerkeOptions = buildMerkeOptions(lists.merker, biler, null);
  const [f, setF] = useState(function () {
    const status = lists.bilStatuser[0] || 'Innkjøpt';
    return {
      reg: '', merke: initialMerkeOptions.includes('Annet') ? 'Annet' : (initialMerkeOptions[0] || 'Annet'), modell: '', aar: 2022, km: '', innkjop: 0, salg: 0,
      farge: '', status, ansvarlig: lists.ansatte[0] || '', frist: '', notater: '',
      euKontroll: '', tilstandsrapport: { ...DEFAULT_BIL_TILSTANDSRAPPORT }, svvData: null,
      ...initBilSjekklister(status, lists.bilSjekklister)
    };
  });
  const merkeOptions = buildMerkeOptions(lists.merker, biler, f.merke);
  const [autosysOverstyrt, setAutosysOverstyrt] = useState({});
  const [autosysLoading, setAutosysLoading] = useState(false);
  const [autosysError, setAutosysError] = useState('');
  const [autosysPreview, setAutosysPreview] = useState('');
  const autosysReqRef = useRef(0);
  const autosysOverstyrtRef = useRef(autosysOverstyrt);
  autosysOverstyrtRef.current = autosysOverstyrt;

  const s = function (k, v) {
    if (BIL_AUTOSYS_FELTER.includes(k) && k !== 'reg') {
      setAutosysOverstyrt(function (prev) { return markBilAutosysOverstyrt(prev, k); });
    }
    setF(function (p) { return { ...p, [k]: v }; });
  };

  const hentAutosys = useCallback(async function (regInput, force) {
    const reg = normalizeBilReg(regInput != null ? regInput : f.reg);
    if (!isValidBilReg(reg)) {
      setAutosysError('Skriv inn et gyldig registreringsnummer.');
      setAutosysPreview('');
      return;
    }

    const savedReg = autosysRegFromStored(f.svvData);
    if (!force && savedReg && savedReg === reg) return;

    const reqId = ++autosysReqRef.current;
    setAutosysLoading(true);
    setAutosysError('');
    setAutosysPreview('');
    try {
      const data = await lookupKjoretoy(reg);
      if (reqId !== autosysReqRef.current) return;

      const vehicle = data.vehicle;
      if (!vehicle) throw new Error('Fant ingen kjøretøydata.');
      setF(function (prev) {
        if (normalizeBilReg(prev.reg) !== reg) return prev;
        return { ...prev, ...buildAutosysBilFelt(vehicle, data.raw || null, lists, prev, autosysOverstyrtRef.current) };
      });
      setAutosysPreview([
        String(vehicle.merke || '').trim(),
        buildFullBilModellFromVehicle(vehicle),
        vehicle.arsmodell
      ].filter(Boolean).join(' '));
      if (visTost) visTost('Autosys-data hentet ✓');
    } catch (err) {
      if (reqId !== autosysReqRef.current) return;
      setAutosysError(err.message || 'Autosys-oppslag feilet.');
      setF(function (prev) {
        if (normalizeBilReg(prev.reg) !== reg) return prev;
        return { ...prev, svvData: null };
      });
    } finally {
      if (reqId === autosysReqRef.current) setAutosysLoading(false);
    }
  }, [f.reg, f.svvData, lists, visTost]);

  const handleRegBlur = function () {
    const reg = normalizeBilReg(f.reg);
    if (!isValidBilReg(reg)) return;
    hentAutosys(reg);
  };

  const handleRegChange = function (value) {
    setAutosysError('');
    setAutosysPreview('');
    setAutosysOverstyrt({});
    setF(function (prev) {
      return { ...prev, reg: value.toUpperCase(), svvData: null };
    });
  };

  const handleStatusChange = function (newStatus) {
    setF(function (prev) {
      if (newStatus === prev.status) return prev;
      return { ...prev, ...withStatusChange(prev, newStatus, lists.bilSjekklister) };
    });
  };

  const toggleSjekk = function (i) {
    setF(function (prev) {
      const list = getAktivSjekkliste(prev);
      const ny = list.map(function (s, idx) { return idx === i ? { ...s, f: !s.f } : s; });
      return { ...prev, ...withSjekklisteUpdate(prev, ny) };
    });
  };

  const sjekkliste = getAktivSjekkliste(f);
  const sjekkProg = calcSjekklisteFremdrift(sjekkliste);

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Legg til ny bil</div>
        <div className="form-row">
          <div>
            <div className="fl">Reg.nummer</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={f.reg}
                onChange={e => handleRegChange(e.target.value)}
                onBlur={handleRegBlur}
                placeholder="AB12345"
              />
              <button type="button" className="btn btn-g btn-sm" onClick={() => hentAutosys(undefined, true)} disabled={autosysLoading}>
                {autosysLoading ? 'Henter…' : 'Hent Autosys'}
              </button>
            </div>
            {autosysError ? (
              <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{autosysError}</div>
            ) : null}
            {autosysPreview ? (
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>
                Autosys: {autosysPreview}
              </div>
            ) : null}
          </div>
          <div><div className="fl">Merke</div><select value={f.merke} onChange={e => s('merke', e.target.value)}>{merkeOptions.map(m => <option key={m}>{m}</option>)}</select></div>
        </div>
        <div className="form-row gap">
          <div><div className="fl">Modell</div><input value={f.modell} onChange={e => s('modell', e.target.value)} /></div>
          <div><div className="fl">Farge</div><input value={f.farge} onChange={e => s('farge', e.target.value)} /></div>
        </div>
        <div className="form-row3 gap">
          <div><div className="fl">Årsmodell</div><input type="number" value={numberInputDisplay(f.aar)} onChange={e => s('aar', parseNumberInput(e.target.value))} /></div>
          <div><div className="fl">Kilometerstand</div><input type="number" value={kmInputDisplay(f.km)} onChange={e => s('km', parseNumberInput(e.target.value))} placeholder="" /></div>
          <div><div className="fl">Status</div><select value={f.status} onChange={e => handleStatusChange(e.target.value)}>{lists.bilStatuser.map(x => <option key={x}>{x}</option>)}</select></div>
        </div>
        {sjekkliste.length > 0 && (
          <div className="gap">
            <div className="modal-sec">Sjekkliste — {f.status} ({sjekkProg.f}/{sjekkProg.t} obligatoriske fullført)</div>
            <div style={{ marginBottom: 6 }}>
              <div className="prog-bar" style={{ height: 5 }}>
                <div className="prog-fill" style={{ width: sjekkProg.pst + '%', height: 5 }} />
              </div>
            </div>
            {sjekkliste.map(function (s, i) {
              return (
                <div className="chk-item" key={i}>
                  <div className={`chk-box${s.f ? ' done' : ''}`} onClick={() => toggleSjekk(i)}>
                    {s.f && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                  </div>
                  <span className={`chk-txt${s.f ? ' done' : ''}`}>{s.t}</span>
                  {!s.obligatorisk && <span className="chip chip-gray" style={{ fontSize: 9, marginLeft: 6 }}>Frivillig</span>}
                </div>
              );
            })}
          </div>
        )}
        <div className="form-row gap">
          <div><div className="fl">Innkjøpspris (kr)</div><input type="number" value={numberInputDisplay(f.innkjop)} onChange={e => s('innkjop', parseNumberInput(e.target.value))} /></div>
          <div><div className="fl">Salgspris (kr)</div><input type="number" value={numberInputDisplay(f.salg)} onChange={e => s('salg', parseNumberInput(e.target.value))} /></div>
        </div>
        <div className="gap">
          <div className="fl">Frist neste EU-kontroll</div>
          <input type="date" value={normalizeEuKontrollDato(f.euKontroll)} onChange={e => s('euKontroll', e.target.value)} />
        </div>
        <BilTilstandsrapportSeksjon
          tilstandsrapport={f.tilstandsrapport}
          onChange={function (next) { s('tilstandsrapport', next); }}
        />
        <div className="gap"><div className="fl">Ansvarlig</div><select value={f.ansvarlig} onChange={e => s('ansvarlig', e.target.value)}>{lists.ansatte.map(a => <option key={a}>{a}</option>)}</select></div>
        <div className="gap"><div className="fl">Notater</div><textarea rows={2} value={f.notater} onChange={e => s('notater', e.target.value)} /></div>
        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={() => f.reg && f.modell && onSave({
            ...f,
            aar: numberInputForSave(f.aar),
            km: kmInputForSave(f.km),
            innkjop: numberInputForSave(f.innkjop),
            salg: numberInputForSave(f.salg),
            tilstandsrapport: normalizeBilTilstandsrapport(f.tilstandsrapport),
            svvData: f.svvData ? mergeAutosysOverstyrtIntoSvvData(f.svvData, autosysOverstyrt) : null,
            sjekklister: f.sjekklister,
            sjekkliste: f.sjekkliste,
            logg: f.svvData ? [{
              tekst: 'Hentet fra Autosys',
              dato: new Date().toLocaleString('nb-NO', { timeZone: NORSK_TIDSSONE }),
              av: 'System'
            }] : [],
            svvData: f.svvData || null
          })}>Lagre bil</button>
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

const EMPTY_REPLY_BODY = '<p><br></p>';

function isEmptyComposeBody(html) {
  return htmlIsEmpty(html) || String(html || '').trim() === EMPTY_REPLY_BODY.trim();
}

function insertTemplateContent(currentHtml, templateHtml) {
  const insert = cleanComposeHtml(templateHtml);
  if (!insert) return currentHtml || '';
  if (isEmptyComposeBody(currentHtml)) return insert;
  return `${insert}${String(currentHtml || '').trim() ? cleanComposeHtml(currentHtml) : ''}`.trim();
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

function buildForwardDefaults(mail) {
  if (!mail) return null;
  const emne = String(mail.emne || 'Melding');
  const subject = /^(Fwd|Fw):/i.test(emne) ? emne : `Fwd: ${emne}`;
  return {
    to: '',
    cc: '',
    bcc: '',
    subject,
    kontoId: mail.kontoId || null,
    html: ''
  };
}

function buildForwardQuoteHtml(mail) {
  if (!mail) return '';
  const quote = buildReplyQuoteHtml(mail);
  return quote.replace(
    'data-xbilsenter-quote="1"',
    'data-xbilsenter-quote="1" data-xbilsenter-forward="1"'
  );
}

function formatDraftTime(iso) {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 16);
}

function ComposeMailModal({ kontoer, draftId: initialDraftId, replyTo, forwardFrom, onClose, onSent, onDraftChange, visTost }) {
  const sendKontoer = kontoer.filter(function (k) { return k.smtpConfigured; });
  const defaultKonto = pickDefaultSendKonto(sendKontoer);
  const replyDefaults = replyTo ? buildReplyDefaults(replyTo) : null;
  const forwardDefaults = forwardFrom ? buildForwardDefaults(forwardFrom) : null;
  const composeDefaults = replyDefaults || forwardDefaults;
  const quoteHtml = forwardFrom
    ? buildForwardQuoteHtml(forwardFrom)
    : (replyTo ? buildReplyQuoteHtml(replyTo) : '');
  const [draftId, setDraftId] = useState(initialDraftId || null);
  const [kontoId, setKontoId] = useState(
    composeDefaults?.kontoId
      ? String(composeDefaults.kontoId)
      : (defaultKonto ? String(defaultKonto.id) : '')
  );
  const [to, setTo] = useState(composeDefaults?.to || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(composeDefaults?.subject || '');
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
    if (mal.emne && !replyTo && !forwardFrom && !subject.trim()) setSubject(mal.emne);
    visTost(`Mal «${mal.navn}» satt inn ✓`);
  };

  const send = async () => {
    const bodyEmpty = replyTo ? isReplyBodyEmpty(bodyHtml) : htmlIsEmpty(bodyHtml);
    if (!to.trim() || !subject.trim() || (bodyEmpty && !forwardFrom) || sending) return;
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
      form.append('html', cleanComposeHtml(bodyHtml));
      form.append('kontoId', String(valgtKonto.id));
      if (replyTo) {
        form.append('replyToId', String(replyTo.id));
        form.append('replyQuoteHtml', quoteHtml);
        if (replyTo.fraNavn) form.append('toName', replyTo.fraNavn);
        if (replyTo.henvendelseId) form.append('henvendelseId', String(replyTo.henvendelseId));
      } else if (forwardFrom) {
        form.append('replyQuoteHtml', quoteHtml);
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
      if (res.item && onSent) onSent(res);
      onClose();
    } catch (err) {
      visTost(err.message || 'Kunne ikke sende e-post ✗');
    } finally {
      setSending(false);
    }
  };

  const previewHtml = buildMailPreviewHtml(bodyHtml, valgtKonto?.signatur || '', quoteHtml);

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
    : (forwardFrom
      ? 'Videresend e-post'
      : (initialDraftId ? 'Rediger utkast' : 'Ny e-post'));
  const sendLabel = replyTo ? 'Send svar' : (forwardFrom ? 'Videresend' : 'Send e-post');

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
        {forwardFrom && (
          <div className="compose-reply-context">
            Videresender melding fra <strong>{forwardFrom.fraNavn || forwardFrom.fraEpost || forwardFrom.tilEpost || 'Ukjent'}</strong>
            {forwardFrom.emne ? ` · ${forwardFrom.emne}` : ''}
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
                  : (forwardFrom
                    ? 'Skriv en kort melding over videresendt e-post. Originalen legges til automatisk under signatur.'
                    : 'Skriv meldingen her. Bruk verktøylinjen for teksttype, avstand, lister, farger, bilder og mer…')}
              />
            </div>
            {quoteHtml && (
              <div className="compose-field">
                <div className="fl">{forwardFrom ? 'Videresendt e-post (legges til automatisk under signatur)' : 'Original e-post (legges til automatisk under signatur)'}</div>
                <div
                  className="compose-reply-quote-readonly"
                  dangerouslySetInnerHTML={{ __html: quoteHtml }}
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

function InboxMetaFields({ mail, lists, colors, onChange, compact, stopClick = true }) {
  const statuser = lists?.henvStatuser || [];
  const ansatte = lists?.ansatte || [];
  const statusColor = mail.status ? (colors[mail.status] || '#6B7280') : undefined;

  const fields = (
    <>
      <select
        className="inbox-meta-select"
        value={mail.status || ''}
        style={statusColor ? { borderColor: statusColor, color: statusColor, background: statusColor + '10' } : undefined}
        onChange={(e) => onChange(mail.id, { status: e.target.value })}
      >
        <option value="">Status</option>
        {statuser.map(function (s) {
          return <option key={s} value={s}>{s}</option>;
        })}
      </select>
      <select
        className="inbox-meta-select"
        value={mail.ansvarlig || ''}
        onChange={(e) => onChange(mail.id, { ansvarlig: e.target.value })}
      >
        <option value="">Ansvarlig</option>
        {ansatte.map(function (a) {
          return <option key={a} value={a}>{a}</option>;
        })}
      </select>
    </>
  );

  if (!stopClick) {
    return <div className={`inbox-meta-fields${compact ? ' inbox-meta-fields--compact' : ''}`}>{fields}</div>;
  }

  return (
    <div
      className={`inbox-meta-fields${compact ? ' inbox-meta-fields--compact' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {fields}
    </div>
  );
}

const MAPPE_TYPE_ICONS = {
  inbox: '📥',
  sent: '📤',
  drafts: '📝',
  trash: '🗑',
  junk: '⚠',
  archive: '📦',
  custom: '📁'
};

const MAPPE_TYPE_LABELS = {
  inbox: 'Innboks',
  sent: 'Sendt',
  drafts: 'Utkast',
  trash: 'Søppel',
  junk: 'Søppelpost',
  archive: 'Arkiv'
};

function kontaktHarKundedata(kontakt) {
  if (!kontakt) return false;
  return !!(String(kontakt.navn || '').trim() || normalizeKundeEpostKey(kontakt.epost));
}

function normalizeKundeEpostKey(epost) {
  return String(epost || '').trim().toLowerCase();
}

function findKundeByEpost(kunder, epost) {
  const key = normalizeKundeEpostKey(epost);
  if (!key) return null;
  return (kunder || []).find(function (k) {
    return normalizeKundeEpostKey(k.epost) === key;
  }) || null;
}

function apneLeggTilKundeForEpost({ mail, kunder, setModal, onKundeLink }) {
  if (!mail || mail.retning !== 'inn' || mail.kundeId || !onKundeLink) return false;
  if (!kontaktHarKundedata({ navn: mail.fraNavn, epost: mail.fraEpost })) return false;

  const match = findKundeByEpost(kunder, mail.fraEpost);
  if (match) {
    onKundeLink(mail.id, match.id);
    return true;
  }
  if (!setModal) return false;

  setModal({
    t: 'nyKunde',
    initial: {
      navn: String(mail.fraNavn || '').trim() || String(mail.fraEpost || '').split('@')[0],
      epost: mail.fraEpost || '',
      tlf: '',
      kilde: 'Manuell'
    },
    onCreated: function (kunde) {
      onKundeLink(mail.id, kunde.id);
    }
  });
  return true;
}

function InboxLeggTilKundeKnapp({ mail, kunder, setModal, onKundeLink }) {
  if (!mail || mail.retning !== 'inn' || mail.kundeId || !onKundeLink) return null;
  if (!kontaktHarKundedata({ navn: mail.fraNavn, epost: mail.fraEpost })) return null;

  const match = findKundeByEpost(kunder, mail.fraEpost);
  if (match) {
    return (
      <button
        type="button"
        className="btn btn-p btn-sm"
        onClick={function () { onKundeLink(mail.id, match.id); }}
      >
        Koble til {match.navn}
      </button>
    );
  }
  if (!setModal) return null;

  return (
    <button
      type="button"
      className="btn btn-p btn-sm"
      onClick={function () { apneLeggTilKundeForEpost({ mail, kunder, setModal, onKundeLink }); }}
    >
      + Legg til som kunde
    </button>
  );
}

function mappeDisplayName(mappe) {
  if (!mappe) return 'Alle';
  return MAPPE_TYPE_LABELS[mappe.mappeType] || mappe.navn || 'Mappe';
}

function InboxMailDetailView({
  mail,
  mapper,
  mailStatus,
  lists,
  colors,
  hasReplyDraft,
  onReply,
  onForward,
  onToggleFlag,
  onMarkRead,
  onMove,
  onDelete,
  onMetaChange,
  onExpand,
  onClose,
  isModal,
  kunder,
  setKunder,
  setModal,
  onKundeLink
}) {
  if (!mail) return null;

  const flyttMapper = mapper.filter(function (m) { return m.id !== mail.mappeId; });

  return (
    <>
      <div className="inbox-detail-hd">
        <div>
          <div style={{ fontSize: isModal ? 18 : 15, fontWeight: 800, color: 'var(--t1)' }}>{mail.emne}</div>
          <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>
            {mail.retning === 'ut' ? 'Utgående' : 'Inngående'} · {mail.dato}
            {mail.kontoNavn ? ` · ${mail.kontoNavn}` : ''}
            {mail.retning === 'inn' && !mail.lest && <span className="chip chip-red" style={{ marginLeft: 8 }}>Ulest</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {onExpand && (
            <button type="button" className="btn btn-g btn-sm" onClick={() => onExpand(mail)} title="Dobbeltklikk i listen">
              ⛶ Stor visning
            </button>
          )}
          <InboxLeggTilKundeKnapp
            mail={mail}
            kunder={kunder}
            setModal={setModal}
            onKundeLink={onKundeLink}
          />
          {mail.retning === 'inn' && (
            <button
              type="button"
              className="btn btn-p btn-sm"
              onClick={() => onReply(mail)}
              disabled={!mailStatus?.smtpConfigured}
            >
              ↩ Svar{hasReplyDraft(mail.id) ? ' · utkast' : ''}
            </button>
          )}
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={() => onForward(mail)}
            disabled={!mailStatus?.smtpConfigured}
          >
            ↪ Videresend
          </button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => onToggleFlag(mail)}>
            {mail.flagged ? '★ Fjern stjerne' : '☆ Stjerne'}
          </button>
          {!mail.lest && (
            <button type="button" className="btn btn-g btn-sm" onClick={() => onMarkRead(mail)}>Markér lest</button>
          )}
          {flyttMapper.length > 0 && (
            <select
              className="inbox-meta-select"
              defaultValue=""
              onChange={function (e) {
                if (e.target.value) onMove(mail, Number(e.target.value));
                e.target.value = '';
              }}
            >
              <option value="">Flytt til…</option>
              {flyttMapper.map(function (m) {
                return <option key={m.id} value={m.id}>{mappeDisplayName(m)}</option>;
              })}
            </select>
          )}
          <button type="button" className="btn btn-g btn-sm" onClick={() => onDelete(mail)}>Slett</button>
          {isModal && onClose && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Lukk" title="Lukk">×</button>
          )}
        </div>
      </div>
      <div className={`inbox-detail-body${isModal ? ' inbox-detail-body--modal' : ''}`}>
        <div className="inbox-meta">
          <div><strong>Fra:</strong> {mail.fraNavn ? `${mail.fraNavn} <${mail.fraEpost}>` : mail.fraEpost}</div>
          <div><strong>Til:</strong> {mail.tilEpost || mail.kontoEpost || '—'}</div>
          {mail.kontoNavn && <div><strong>Konto:</strong> {mail.kontoNavn} ({mail.kontoEpost})</div>}
        </div>

        <div className="inbox-behavior">
          <div className="modal-sec">Merking</div>
          <InboxMetaFields
            mail={mail}
            lists={lists}
            colors={colors}
            onChange={onMetaChange}
            stopClick={false}
          />
          {(mail.status || mail.ansvarlig) && (
            <div className="inbox-item-tags" style={{ marginTop: 10 }}>
              {mail.status && <Badge s={mail.status} colors={colors} />}
              {mail.ansvarlig && <span className="tag">{mail.ansvarlig}</span>}
            </div>
          )}
          {mail.kundeId && onKundeLink && (
            <div style={{ marginTop: 12 }}>
              <KundeVelger
                kundeId={mail.kundeId}
                kunder={kunder}
                setModal={setModal}
                setKunder={setKunder}
                kontakt={{ navn: mail.fraNavn, epost: mail.fraEpost }}
                kilde="Manuell"
                onChange={function (id) { onKundeLink(mail.id, id); }}
              />
            </div>
          )}
        </div>

        <div className={`inbox-body${isModal ? ' inbox-body--modal' : ''}`}>
          {mail.innholdHtml ? (
            <div className="inbox-body--html" dangerouslySetInnerHTML={{ __html: mail.innholdHtml }} />
          ) : (
            mail.innhold || '(Tom melding)'
          )}
        </div>

        {!!(mail.vedlegg && mail.vedlegg.length) && (
          <div className="inbox-attachments">
            <div className="modal-sec">Vedlegg</div>
            <div className="inbox-attachments-list">
              {mail.vedlegg.map(function (v) {
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="inbox-attachment-link"
                    onClick={function () {
                      downloadEpostVedlegg(mail.id, v.id, v.filnavn).catch(function (err) {
                        visTost(err.message || 'Kunne ikke laste ned ✗');
                      });
                    }}
                  >
                    📎 {v.filnavn} ({Math.max(1, Math.round(v.sizeBytes / 1024))} KB)
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mail.retning === 'inn' && (
          <div className="inbox-reply-hint">
            Klikk <strong>Svar</strong> for å skrive svar med formatering, vedlegg, kopi og blindkopi — samme som ved ny e-post.
            {hasReplyDraft(mail.id) ? ' Du har et lagret svarutkast.' : ''}
          </div>
        )}
      </div>
    </>
  );
}

function epostSortKey(item) {
  const raw = item?.sortDato || item?.updatedAt || item?.createdAt || '';
  const ts = Date.parse(String(raw));
  if (!Number.isNaN(ts)) return ts;
  return Number(item?.id || 0);
}

function sortEpostNyestFirst(items) {
  return (items || []).slice().sort(function (a, b) {
    const diff = epostSortKey(b) - epostSortKey(a);
    if (diff !== 0) return diff;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function groupEpostThreads(items) {
  const groups = {};
  sortEpostNyestFirst(items).forEach(function (item) {
    const key = item.threadId || item.messageId || String(item.id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return Object.keys(groups).map(function (key) {
    const messages = sortEpostNyestFirst(groups[key]);
    return { threadId: key, latest: messages[0], count: messages.length, messages };
  }).sort(function (a, b) {
    return epostSortKey(b.latest) - epostSortKey(a.latest);
  });
}

function InboxContextMenu({ menu, mapper, mailStatus, kunder, setModal, onKundeLink, onClose, onAction }) {
  const menuRef = useRef(null);
  const [submenu, setSubmenu] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(function () {
    if (!menu) {
      setSubmenu(null);
      return;
    }
    setSubmenu(null);
    const margin = 8;
    const maxW = 260;
    const maxH = 420;
    let x = menu.x;
    let y = menu.y;
    if (typeof window !== 'undefined') {
      if (x + maxW > window.innerWidth - margin) x = Math.max(margin, window.innerWidth - maxW - margin);
      if (y + maxH > window.innerHeight - margin) y = Math.max(margin, window.innerHeight - maxH - margin);
    }
    setPos({ x, y });
  }, [menu]);

  useEffect(function () {
    if (!menu) return;
    const close = function () { onClose(); };
    const onKey = function (e) {
      if (e.key === 'Escape') close();
    };
    const onPointer = function (e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return function () {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const mail = menu.mail || null;
  const draft = menu.draft || null;
  const vedlegg = mail?.vedlegg || [];
  const flyttMapper = mapper.filter(function (m) {
    return !mail || m.id !== mail.mappeId;
  });
  const canReply = mail && mail.retning === 'inn' && mailStatus.smtpConfigured;
  const canForward = mail && mailStatus.smtpConfigured;
  const canAddKunde = mail
    && mail.retning === 'inn'
    && !mail.kundeId
    && kontaktHarKundedata({ navn: mail.fraNavn, epost: mail.fraEpost })
    && onKundeLink;

  const run = function (action, payload) {
    onAction(action, payload);
    onClose();
  };

  const MenuItem = function ({ label, onClick, disabled, danger, hasSub, active }) {
    return (
      <button
        type="button"
        className={`inbox-ctx-item${disabled ? ' disabled' : ''}${danger ? ' danger' : ''}${active ? ' active' : ''}`}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        onMouseEnter={hasSub && !disabled ? function () { setSubmenu(hasSub); } : undefined}
      >
        <span>{label}</span>
        {hasSub && <span className="inbox-ctx-arrow">›</span>}
      </button>
    );
  };

  const Sep = () => <div className="inbox-ctx-sep" />;

  return (
    <div
      ref={menuRef}
      className="inbox-ctx-menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={function (e) { e.preventDefault(); }}
    >
      {menu.type === 'draft' ? (
        <>
          <MenuItem label="Fortsett redigering" onClick={() => run('continueDraft', draft)} />
          <Sep />
          <MenuItem label="Slett utkast" danger onClick={() => run('deleteDraft', draft)} />
        </>
      ) : (
        <>
          <MenuItem label="Åpne stor visning" onClick={() => run('open', mail)} />
          <Sep />
          <MenuItem label="Svar" disabled={!canReply} onClick={() => run('reply', mail)} />
          <MenuItem label="Videresend" disabled={!canForward} onClick={() => run('forward', mail)} />
          <Sep />
          <MenuItem
            label={mail?.lest ? 'Marker som ulest' : 'Marker som lest'}
            onClick={() => run('toggleRead', mail)}
          />
          <MenuItem
            label={mail?.flagged ? 'Fjern stjerne' : 'Stjerne'}
            onClick={() => run('toggleFlag', mail)}
          />
          <Sep />
          <div
            className="inbox-ctx-submenu-wrap"
            onMouseEnter={() => setSubmenu('vedlegg')}
            onMouseLeave={() => setSubmenu(function (prev) { return prev === 'vedlegg' ? null : prev; })}
          >
            <MenuItem
              label="Vedlegg"
              disabled={!vedlegg.length}
              hasSub="vedlegg"
              active={submenu === 'vedlegg'}
            />
            {submenu === 'vedlegg' && vedlegg.length > 0 && (
              <div className="inbox-ctx-submenu">
                {vedlegg.map(function (v) {
                  const kb = Math.max(1, Math.round((v.sizeBytes || 0) / 1024));
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className="inbox-ctx-item"
                      onClick={() => run('downloadAttachment', { mail, vedlegg: v })}
                    >
                      <span>📎 {v.filnavn} ({kb} KB)</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div
            className="inbox-ctx-submenu-wrap"
            onMouseEnter={() => setSubmenu('flytt')}
            onMouseLeave={() => setSubmenu(function (prev) { return prev === 'flytt' ? null : prev; })}
          >
            <MenuItem
              label="Flytt til"
              disabled={!flyttMapper.length}
              hasSub="flytt"
              active={submenu === 'flytt'}
            />
            {submenu === 'flytt' && flyttMapper.length > 0 && (
              <div className="inbox-ctx-submenu">
                {flyttMapper.map(function (m) {
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="inbox-ctx-item"
                      onClick={() => run('move', { mail, mappeId: m.id })}
                    >
                      <span>{MAPPE_TYPE_ICONS[m.mappeType] || MAPPE_TYPE_ICONS.custom} {mappeDisplayName(m)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {canAddKunde && (
            <>
              <Sep />
              <MenuItem
                label={findKundeByEpost(kunder, mail.fraEpost)
                  ? `Koble til ${findKundeByEpost(kunder, mail.fraEpost).navn}`
                  : 'Legg til som kunde'}
                onClick={function () {
                  apneLeggTilKundeForEpost({ mail, kunder, setModal, onKundeLink });
                }}
              />
            </>
          )}
          <Sep />
          <MenuItem label="Slett" danger onClick={() => run('delete', mail)} />
        </>
      )}
    </div>
  );
}

function InnboksView({ epost, mailStatus, setEpost, setMailStatus, setHenv, visTost, refreshStats, setTab, lists, kunder, setKunder, setModal, initialOpenEpost, initialOpenEpostMode, onInitialOpenEpostConsumed }) {
  const isMobile = useIsMobile();
  const [mobileFolders, setMobileFolders] = useState(false);
  const [filter, setFilter] = useState('Meldinger');
  const [statusFilter, setStatusFilter] = useState('Alle');
  const [kontoFilter, setKontoFilter] = useState('alle');
  const [mapper, setMapper] = useState([]);
  const [valgtMappeId, setValgtMappeId] = useState(null);
  const [listeEpost, setListeEpost] = useState([]);
  const [lasterEpost, setLasterEpost] = useState(false);
  const [threadView, setThreadView] = useState(true);
  const [nyMappeNavn, setNyMappeNavn] = useState('');
  const [visNyMappe, setVisNyMappe] = useState(false);
  const [valgt, setValgt] = useState(null);
  const [expandedMail, setExpandedMail] = useState(null);
  const [valgtUtkast, setValgtUtkast] = useState(null);
  const [utkast, setUtkast] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraftId, setComposeDraftId] = useState(null);
  const [composeReplyTo, setComposeReplyTo] = useState(null);
  const [composeForwardFrom, setComposeForwardFrom] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const epostCacheRef = useRef(readInnboksCacheStore());
  const fetchSeqRef = useRef(0);
  const kontoer = mailStatus.kontoer || [];
  const statusReady = Array.isArray(mailStatus.kontoer);
  const colors = lists?.henvStatusFarger || DEFAULT_HENV_STATUS_FARGER;

  const aktivKontoId = kontoFilter !== 'alle'
    ? Number(kontoFilter)
    : (kontoer.find(function (k) { return k.aktiv; })?.id || kontoer[0]?.id || readInnboksKontoFallback() || null);

  useEffect(function () {
    if (statusReady) return;
    getMailStatus()
      .then(function (res) {
        if (res.status) setMailStatus(res.status);
      })
      .catch(function () { /* ignore */ });
  }, [statusReady, setMailStatus]);

  const cacheKey = function (kontoId, mappeId) {
    return String(kontoId || '0') + ':' + String(mappeId || '0');
  };

  const applyListeEpost = useCallback(function (items) {
    setListeEpost(items);
    setEpost(items);
  }, [setEpost]);

  const patchListeEpost = useCallback(function (fn) {
    setListeEpost(function (prev) {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      setEpost(next);
      return next;
    });
  }, [setEpost]);

  const invalidateEpostCache = useCallback(function (kontoId) {
    if (!kontoId) {
      epostCacheRef.current = {};
      clearInnboksCacheStore();
      return;
    }
    const prefix = String(kontoId) + ':';
    Object.keys(epostCacheRef.current).forEach(function (key) {
      if (key.startsWith(prefix)) delete epostCacheRef.current[key];
    });
    clearInnboksCacheStore(kontoId);
  }, []);

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
    if (aktivKontoId) writeInnboksKontoFallback(aktivKontoId);
  }, [aktivKontoId]);

  const loadMapper = async function (forceRefresh) {
    if (!aktivKontoId) {
      setMapper([]);
      setValgtMappeId(null);
      return;
    }
    try {
      const res = await getInnboksMapper(aktivKontoId, !!forceRefresh);
      const items = res.items || [];
      setMapper(items);
      setValgtMappeId(function (prev) {
        if (prev && items.some(function (m) { return m.id === prev; })) return prev;
        const inbox = items.find(function (m) { return m.mappeType === 'inbox'; });
        return inbox?.id || items[0]?.id || null;
      });
    } catch (err) {
      setMapper([]);
      visTost(err.message || 'Kunne ikke hente mapper ✗');
    }
  };

  const reloadInnboks = useCallback(async function (mappeIdOverride, kontoIdOverride) {
    const kid = kontoIdOverride ?? aktivKontoId;
    const mid = mappeIdOverride ?? valgtMappeId;
    if (!kid) {
      applyListeEpost([]);
      return;
    }

    const key = cacheKey(kid, mid);
    const cached = epostCacheRef.current[key] || readInnboksCacheEntry(key);
    if (cached) {
      epostCacheRef.current[key] = cached;
      applyListeEpost(cached);
    } else {
      setLasterEpost(true);
    }

    const seq = ++fetchSeqRef.current;
    try {
      const params = { kontoId: kid, status: false };
      if (mid) params.mappeId = mid;
      const data = await getInnboks(params);
      if (seq !== fetchSeqRef.current) return;
      const items = sortEpostNyestFirst(data.items || []);
      epostCacheRef.current[key] = items;
      writeInnboksCacheEntry(key, items);
      applyListeEpost(items);
      if (data.status) setMailStatus(data.status);
      return data;
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      if (!cached) applyListeEpost([]);
      visTost(err.message || 'Kunne ikke laste e-post ✗');
    } finally {
      if (seq === fetchSeqRef.current) setLasterEpost(false);
    }
  }, [aktivKontoId, valgtMappeId, applyListeEpost, setMailStatus, visTost]);

  const selectMappe = useCallback(function (mappeId) {
    setValgt(null);
    setExpandedMail(null);
    setValgtMappeId(mappeId);
    if (isMobile) setMobileFolders(false);
    reloadInnboks(mappeId, aktivKontoId);
  }, [aktivKontoId, reloadInnboks, isMobile]);

  useEffect(function () {
    if (!aktivKontoId) {
      setMapper([]);
      setValgtMappeId(null);
      applyListeEpost([]);
      return;
    }
    loadMapper();
    reloadInnboks(null, aktivKontoId);
  }, [aktivKontoId]);

  useEffect(function () {
    if (kontoFilter !== 'alle' && !kontoer.some(function (k) { return String(k.id) === String(kontoFilter); })) {
      setKontoFilter('alle');
    }
  }, [kontoer, kontoFilter]);

  useEffect(function () {
    if (!valgt?.id) return;
    const valgtId = Number(valgt.id);
    if (!listeEpost.some(function (e) { return Number(e.id) === valgtId; })) {
      setValgt(null);
    }
  }, [listeEpost, valgt]);

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

  const valgtMappe = mapper.find(function (m) { return m.id === valgtMappeId; }) || null;

  const vis = sortEpostNyestFirst(listeEpost.filter(function (e) {
    if (kontoFilter !== 'alle' && String(e.kontoId) !== String(kontoFilter)) return false;
    if (filter === 'Ulest' && !(e.retning === 'inn' && !e.lest)) return false;
    if (statusFilter !== 'Alle' && (e.status || '') !== statusFilter) return false;
    return true;
  }));

  const visTråder = threadView
    ? groupEpostThreads(vis)
    : vis.map(function (e) {
      return { threadId: String(e.id), latest: e, count: 1, messages: [e] };
    });

  const visUtkast = sortEpostNyestFirst(utkast.filter(function (u) {
    if (kontoFilter !== 'alle' && String(u.kontoId) !== String(kontoFilter)) return false;
    return true;
  }));

  const openNewCompose = () => {
    setComposeDraftId(null);
    setComposeReplyTo(null);
    setComposeForwardFrom(null);
    setComposeOpen(true);
  };

  const openReplyCompose = (mail) => {
    if (!mail || mail.retning !== 'inn') return;
    setComposeDraftId(null);
    setComposeReplyTo(mail);
    setComposeForwardFrom(null);
    setComposeOpen(true);
  };

  const openForwardCompose = (mail) => {
    if (!mail) return;
    setComposeDraftId(null);
    setComposeReplyTo(null);
    setComposeForwardFrom(mail);
    setComposeOpen(true);
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setComposeDraftId(null);
    setComposeReplyTo(null);
    setComposeForwardFrom(null);
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

  const applyMailToViews = useCallback(function (item) {
    if (!item?.id) return;
    setValgt(item);
    setExpandedMail(function (prev) { return prev?.id === item.id ? item : prev; });
  }, []);

  const ensureMailBody = async function (mail) {
    if (!mail?.id) return mail;
    if (mail.innhold || mail.innholdHtml) return mail;
    const res = await getEpostById(mail.id);
    if (!res?.item) throw new Error('Kunne ikke hente e-post.');
    patchListeEpost(function (prev) {
      return prev.map(function (e) {
        return Number(e.id) === Number(res.item.id) ? res.item : e;
      });
    });
    return res.item;
  };

  const markMailRead = async function (mail) {
    if (!mail || mail.retning !== 'inn' || mail.lest) return mail;
    try {
      const res = await patchEpost(mail.id, { lest: true });
      if (res.item) {
        patchListeEpost(function (prev) {
          return prev.map(function (e) { return Number(e.id) === Number(mail.id) ? res.item : e; });
        });
        applyMailToViews(res.item);
        refreshStats();
        loadMapper().catch(function () { /* ignore */ });
        return res.item;
      }
    } catch (err) {
      visTost(err.message || 'Kunne ikke markere som lest ✗');
    }
    return mail;
  };

  const previewMail = async (mail) => {
    if (!mail?.id) return;
    setValgt(mail);
    if (isMobile) setMobileFolders(false);
    try {
      const current = await ensureMailBody(mail);
      setValgt(current);
    } catch (err) {
      visTost(err.message || 'Kunne ikke laste e-post ✗');
    }
  };

  const openMailExpanded = async (mail) => {
    if (!mail?.id) return;
    setValgt(mail);
    setExpandedMail(mail);
    if (isMobile) setMobileFolders(false);
    try {
      const current = await ensureMailBody(mail);
      setValgt(current);
      setExpandedMail(current);
      markMailRead(current).then(function (updated) {
        if (updated?.id) {
          setValgt(updated);
          setExpandedMail(function (prev) { return prev?.id === updated.id ? updated : prev; });
        }
      });
    } catch (err) {
      visTost(err.message || 'Kunne ikke åpne e-post ✗');
    }
  };

  const handleMailClick = async (mail) => {
    if (isMobile) {
      await previewMail(mail);
      markMailRead(mail);
      return;
    }
    previewMail(mail);
  };

  const handleMailDoubleClick = (mail) => {
    openMailExpanded(mail);
  };

  useEffect(function () {
    if (!initialOpenEpost?.id) return;
    if (initialOpenEpostMode === 'expand') openMailExpanded(initialOpenEpost);
    else previewMail(initialOpenEpost);
    if (onInitialOpenEpostConsumed) onInitialOpenEpostConsumed();
  }, [initialOpenEpost?.id, initialOpenEpostMode]);

  const syncMail = async () => {
    setSyncing(true);
    try {
      const body = aktivKontoId ? { kontoId: aktivKontoId } : {};
      const res = await syncInnboks(body);
      if (res.status) setMailStatus(res.status);
      invalidateEpostCache(aktivKontoId);
      await loadMapper(true);
      await reloadInnboks(valgtMappeId, aktivKontoId);
      refreshStats();
      visTost(`${res.imported || 0} nye · ${res.updated || 0} oppdatert ✓`);
    } catch (err) {
      visTost(err.message || 'Synkronisering feilet ✗');
    } finally {
      setSyncing(false);
    }
  };

  const opprettMappe = async () => {
    const navn = String(nyMappeNavn || '').trim();
    if (!navn || !aktivKontoId) return;
    try {
      const res = await createInnboksMappe({ kontoId: aktivKontoId, navn });
      setNyMappeNavn('');
      setVisNyMappe(false);
      await loadMapper();
      if (res.item?.id) selectMappe(res.item.id);
      visTost('Mappe opprettet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke opprette mappe ✗');
    }
  };

  const slettValgtEpost = async () => {
    if (!valgt) return;
    await slettEpostItem(valgt);
  };

  const slettEpostItem = async (mail) => {
    if (!mail) return;
    try {
      await deleteEpost(mail.id);
      patchListeEpost(function (prev) { return prev.filter(function (e) { return e.id !== mail.id; }); });
      invalidateEpostCache(aktivKontoId);
      setValgt(function (prev) { return prev?.id === mail.id ? null : prev; });
      setExpandedMail(function (prev) { return prev?.id === mail.id ? null : prev; });
      await loadMapper();
      refreshStats();
      visTost('E-post slettet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke slette ✗');
    }
  };

  const flyttValgtEpost = async (mappeId) => {
    if (!valgt || !mappeId) return;
    await flyttEpostItem(valgt, mappeId);
  };

  const flyttEpostItem = async (mail, mappeId) => {
    if (!mail || !mappeId) return;
    try {
      const res = await flyttEpost(mail.id, mappeId);
      if (res.item) {
        patchListeEpost(function (prev) {
          return prev.map(function (e) { return e.id === mail.id ? res.item : e; });
        });
        setValgt(function (prev) { return prev?.id === mail.id ? res.item : prev; });
      }
      invalidateEpostCache(aktivKontoId);
      await reloadInnboks(valgtMappeId, aktivKontoId);
      await loadMapper();
      visTost('E-post flyttet ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke flytte ✗');
    }
  };

  const handleContextMenuAction = async (action, payload) => {
    if (action === 'open') {
      openMailExpanded(payload);
      return;
    }
    if (action === 'reply') {
      openReplyCompose(payload);
      return;
    }
    if (action === 'forward') {
      openForwardCompose(payload);
      return;
    }
    if (action === 'toggleRead') {
      const mail = payload;
      updateEpostMeta(mail.id, { lest: !mail.lest }, mail.lest ? 'Markert som ulest ✓' : 'Markert som lest ✓');
      return;
    }
    if (action === 'toggleFlag') {
      const mail = payload;
      updateEpostMeta(mail.id, { flagged: !mail.flagged }, mail.flagged ? 'Stjerne fjernet ✓' : 'Merket med stjerne ✓');
      return;
    }
    if (action === 'downloadAttachment') {
      const { mail, vedlegg: v } = payload;
      try {
        await downloadEpostVedlegg(mail.id, v.id, v.filnavn);
      } catch (err) {
        visTost(err.message || 'Kunne ikke laste ned ✗');
      }
      return;
    }
    if (action === 'move') {
      await flyttEpostItem(payload.mail, payload.mappeId);
      return;
    }
    if (action === 'delete') {
      await slettEpostItem(payload);
      return;
    }
    if (action === 'continueDraft') {
      openDraftEditor(payload);
      return;
    }
    if (action === 'deleteDraft') {
      if (payload?.id) await slettUtkast(payload.id);
    }
  };

  const showMailContextMenu = (e, mail) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'mail', mail });
  };

  const showDraftContextMenu = (e, draft) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'draft', draft });
  };

  const updateEpostMeta = async (id, patch, msg) => {
    const applyPatch = function (item) {
      return { ...item, ...patch };
    };

    patchListeEpost(function (prev) {
      return prev.map(function (e) { return e.id === id ? applyPatch(e) : e; });
    });
    setValgt(function (prev) {
      return prev?.id === id ? applyPatch(prev) : prev;
    });
    setExpandedMail(function (prev) {
      return prev?.id === id ? applyPatch(prev) : prev;
    });

    try {
      const res = await patchEpost(id, patch);
      if (res.item) {
        patchListeEpost(function (prev) {
          return prev.map(function (e) { return e.id === id ? res.item : e; });
        });
        setValgt(function (prev) {
          return prev?.id === id ? res.item : prev;
        });
        setExpandedMail(function (prev) {
          return prev?.id === id ? res.item : prev;
        });
      }
      if (patch.lest != null) {
        refreshStats();
        await loadMapper();
      }
      if (msg) visTost(msg);
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre e-post ✗');
      try {
        await reloadInnboks(valgtMappeId, aktivKontoId);
        const fresh = listeEpost.find(function (e) { return e.id === id; });
        if (fresh) {
          setValgt(function (prev) { return prev?.id === id ? fresh : prev; });
        }
      } catch {
        /* ignore */
      }
    }
  };

  const linkEpostKunde = function (mailId, kundeId) {
    updateEpostMeta(
      mailId,
      { kundeId: kundeId || null },
      kundeId ? 'Kunde koblet ✓' : 'Kunde fjernet ✓'
    );
  };

  const kontoLabel = !statusReady
    ? 'Laster…'
    : (kontoer.length
      ? `${kontoer.filter(k => k.aktiv).length} aktive kontoer`
      : 'Ingen mailkontoer');

  const inboxDetailOpen = filter === 'Utkast' ? !!valgtUtkast : !!valgt;
  const inboxShellClass = 'inbox-shell'
    + (isMobile && inboxDetailOpen ? ' inbox-shell--detail' : '')
    + (isMobile && !inboxDetailOpen ? ' inbox-shell--list' : '')
    + (isMobile && mobileFolders ? ' inbox-shell--folders' : '');

  const inboxBack = function () {
    if (filter === 'Utkast') setValgtUtkast(null);
    else setValgt(null);
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">E-postinnboks</div>
          <div className="ph-sub">
            {kontoLabel} · {mailStatus.ulest ?? 0} ulest
            {mailStatus.lastSync ? ` · Sist synk: ${mailStatus.lastSync.replace('T', ' ').slice(0, 16)}` : ''}
          </div>
        </div>
        <div className="ph-actions">
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

      {statusReady && (!mailStatus.imapConfigured || !mailStatus.smtpConfigured) && (
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

      <div className="inbox-toolbar">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {['Meldinger', 'Ulest', 'Utkast'].map(function (s) {
            const count = s === 'Utkast' ? (mailStatus.utkastCount || visUtkast.length || 0) : 0;
            return (
              <button key={s} type="button" className={`btn btn-sm ${filter === s ? 'btn-p' : 'btn-g'}`} onClick={() => setInboxFilter(s)}>
                {s}{count ? ` (${count})` : ''}
              </button>
            );
          })}
          {filter !== 'Utkast' && (
            <button type="button" className={`btn btn-sm ${threadView ? 'btn-p' : 'btn-g'}`} onClick={() => setThreadView(function (v) { return !v; })}>
              Trådvis
            </button>
          )}
        </div>
        {kontoer.length > 0 && (
          <select value={kontoFilter} onChange={e => setKontoFilter(e.target.value)} className="inbox-konto-select">
            <option value="alle">Alle kontoer</option>
            {kontoer.map(function (k) {
              return <option key={k.id} value={k.id}>{k.navn} ({k.epost})</option>;
            })}
          </select>
        )}
      </div>

      {filter !== 'Utkast' && (
        <div className="henv-filters" style={{ marginTop: -6 }}>
          <HenvStatusFilter
            label="Alle statuser"
            active={statusFilter === 'Alle'}
            color="var(--acc)"
            onClick={() => setStatusFilter('Alle')}
          />
          {(lists?.henvStatuser || []).map(function (s) {
            return (
              <HenvStatusFilter
                key={s}
                label={s}
                active={statusFilter === s}
                color={colors[s] || '#6B7280'}
                onClick={() => setStatusFilter(s)}
              />
            );
          })}
        </div>
      )}

      {isMobile && (
        <div className="inbox-mobile-bar">
          {inboxDetailOpen ? (
            <button type="button" className="btn btn-g btn-sm inbox-mobile-back" onClick={inboxBack}>← Tilbake til liste</button>
          ) : filter !== 'Utkast' && (
            <button type="button" className="btn btn-g btn-sm" onClick={function () { setMobileFolders(function (v) { return !v; }); }}>
              {mobileFolders ? '✕ Lukk mapper' : '📁 Mapper'}
            </button>
          )}
        </div>
      )}

      <div className={inboxShellClass}>
        {filter !== 'Utkast' && (
          <aside className="inbox-folders">
            <div className="inbox-folders-hd">
              <span className="card-ht">Mapper</span>
              <button type="button" className="btn btn-g btn-xs" onClick={() => setVisNyMappe(function (v) { return !v; })} disabled={!aktivKontoId}>+</button>
            </div>
            {visNyMappe && (
              <div className="inbox-folder-create">
                <input
                  type="text"
                  value={nyMappeNavn}
                  onChange={e => setNyMappeNavn(e.target.value)}
                  placeholder="Nytt mappenavn"
                />
                <button type="button" className="btn btn-p btn-xs" onClick={opprettMappe}>Opprett</button>
              </div>
            )}
            <div className="inbox-folders-body">
              {!mapper.length && <div className="inbox-empty" style={{ padding: '16px 10px' }}>Synkroniser for å hente mapper.</div>}
              {mapper.map(function (m) {
                const icon = MAPPE_TYPE_ICONS[m.mappeType] || MAPPE_TYPE_ICONS.custom;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`inbox-folder-item${valgtMappeId === m.id ? ' on' : ''}`}
                    onClick={() => selectMappe(m.id)}
                  >
                    <span>{icon} {mappeDisplayName(m)}</span>
                    <span className="inbox-folder-count">{m.unreadCount > 0 ? m.unreadCount : (m.totalCount || '')}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

      <div className="inbox-layout">
        <div className="inbox-list">
          <div className="inbox-list-hd">
            <span className="card-ht">{filter === 'Utkast' ? 'Utkast' : (valgtMappe ? mappeDisplayName(valgtMappe) : 'Meldinger')}</span>
            <span style={{ fontSize: 10, color: 'var(--t4)' }}>{filter === 'Utkast' ? visUtkast.length : visTråder.length}</span>
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
                      onContextMenu={(e) => showDraftContextMenu(e, u)}
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
                {lasterEpost && visTråder.length === 0 && (
                  <div className="inbox-empty">Laster e-poster…</div>
                )}
                {!lasterEpost && visTråder.length === 0 && (
                  <div className="inbox-empty">Ingen e-poster i denne mappen.</div>
                )}
                {visTråder.map(function (tråd) {
                  const e = tråd.latest;
                  const statusColor = e.status ? (colors[e.status] || '#6B7280') : null;
                  const unread = tråd.messages.some(function (m) { return m.retning === 'inn' && !m.lest; });
                  return (
                    <div
                      key={tråd.threadId}
                      className={`inbox-item${valgt?.id === e.id ? ' on' : ''}${unread ? ' unread' : ''}${e.status ? ' has-status' : ''}`}
                      style={statusColor ? { borderLeft: `3px solid ${statusColor}` } : undefined}
                      onClick={() => handleMailClick(e)}
                      onDoubleClick={() => handleMailDoubleClick(e)}
                      onContextMenu={(ev) => showMailContextMenu(ev, e)}
                      title={unread ? 'Klikk for forhåndsvisning · dobbeltklikk for stor visning' : 'Klikk for forhåndsvisning · dobbeltklikk for stor visning'}
                    >
                      <div className="inbox-item-top">
                        <div className="inbox-item-from">
                          {unread && <span className="inbox-unread-dot" aria-hidden="true" />}
                          <span className="inbox-item-from-text">
                            {e.retning === 'ut' ? `Til ${e.tilEpost}` : (e.fraNavn || e.fraEpost || 'Ukjent')}
                            {tråd.count > 1 && <span className="inbox-thread-count">{tråd.count}</span>}
                          </span>
                        </div>
                        <div className="inbox-item-date">{e.dato}</div>
                      </div>
                      {e.kontoNavn && <div className="inbox-konto-tag">{e.kontoNavn}</div>}
                      <div className="inbox-item-subj">
                        {e.flagged ? '★ ' : ''}{e.emne}
                        {(e.vedleggCount > 0 || (e.vedlegg && e.vedlegg.length)) && <span className="inbox-attach-badge">📎</span>}
                      </div>
                      <InboxMetaFields
                        mail={e}
                        lists={lists}
                        colors={colors}
                        onChange={updateEpostMeta}
                        compact
                      />
                      <div className="inbox-item-snippet">{e.snippet || e.innhold || e.innholdHtml || ''}</div>
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
              Klikk en e-post for forhåndsvisning. Dobbeltklikk (eller <strong>Stor visning</strong>) for å åpne større og markere som lest.
            </div>
          ) : (
            <InboxMailDetailView
              mail={valgt}
              mapper={mapper}
              mailStatus={mailStatus}
              lists={lists}
              colors={colors}
              hasReplyDraft={hasReplyDraft}
              onReply={openReplyCompose}
              onForward={openForwardCompose}
              onToggleFlag={(mail) => updateEpostMeta(mail.id, { flagged: !mail.flagged }, mail.flagged ? 'Stjerne fjernet ✓' : 'Merket med stjerne ✓')}
              onMarkRead={(mail) => updateEpostMeta(mail.id, { lest: true }, 'Markert som lest ✓')}
              onMove={flyttEpostItem}
              onDelete={slettEpostItem}
              onMetaChange={(id, patch) => updateEpostMeta(id, patch, 'Lagret ✓')}
              onExpand={openMailExpanded}
              kunder={kunder}
              setKunder={setKunder}
              setModal={setModal}
              onKundeLink={linkEpostKunde}
            />
          )}
        </div>
      </div>
      </div>

      {expandedMail && (
        <div className="ov" onClick={() => setExpandedMail(null)}>
          <div className="modal xl mail-reader-modal" onClick={(e) => e.stopPropagation()}>
            <InboxMailDetailView
              mail={expandedMail}
              mapper={mapper}
              mailStatus={mailStatus}
              lists={lists}
              colors={colors}
              hasReplyDraft={hasReplyDraft}
              onReply={(mail) => { setExpandedMail(null); openReplyCompose(mail); }}
              onForward={(mail) => { setExpandedMail(null); openForwardCompose(mail); }}
              onToggleFlag={(mail) => updateEpostMeta(mail.id, { flagged: !mail.flagged }, mail.flagged ? 'Stjerne fjernet ✓' : 'Merket med stjerne ✓')}
              onMarkRead={(mail) => updateEpostMeta(mail.id, { lest: true }, 'Markert som lest ✓')}
              onMove={flyttEpostItem}
              onDelete={(mail) => { setExpandedMail(null); slettEpostItem(mail); }}
              onMetaChange={(id, patch) => updateEpostMeta(id, patch, 'Lagret ✓')}
              onClose={() => setExpandedMail(null)}
              isModal
              kunder={kunder}
              setKunder={setKunder}
              setModal={setModal}
              onKundeLink={linkEpostKunde}
            />
          </div>
        </div>
      )}

      {composeOpen && (
        <ComposeMailModal
          kontoer={kontoer}
          draftId={composeReplyTo || composeForwardFrom ? null : composeDraftId}
          replyTo={composeReplyTo}
          forwardFrom={composeForwardFrom}
          onClose={closeCompose}
          onDraftChange={handleDraftChange}
          visTost={visTost}
          onSent={function (res) {
            const item = res.item;
            if (!item) return;
            invalidateEpostCache(aktivKontoId);
            patchListeEpost(function (prev) {
              let next = [item, ...prev];
              if (res.replyToItem) {
                next = next.map(function (e) {
                  return e.id === res.replyToItem.id ? res.replyToItem : e;
                });
              }
              return next;
            });
            if (res.replyToItem) {
              setValgt(function (prev) {
                return prev?.id === res.replyToItem.id ? res.replyToItem : prev;
              });
            } else {
              setValgt(item);
            }
            if (res.henvendelseItem && setHenv) {
              setHenv(function (prev) {
                return prev.map(function (h) {
                  return h.id === res.henvendelseItem.id ? res.henvendelseItem : h;
                });
              });
            }
            setFilter('Meldinger');
            refreshStats();
            loadUtkast();
            reloadInnboks(valgtMappeId, aktivKontoId).catch(function () { /* ignore */ });
          }}
        />
      )}

      <InboxContextMenu
        menu={contextMenu}
        mapper={mapper}
        mailStatus={mailStatus}
        kunder={kunder}
        setModal={setModal}
        onKundeLink={linkEpostKunde}
        onClose={() => setContextMenu(null)}
        onAction={handleContextMenuAction}
      />
    </>
  );
}

// ─── KUNDER ──────────────────────────────────────────────────────────────────
function kundeLabel(k) {
  if (!k) return '—';
  const extra = k.epost || k.tlf || '';
  return extra ? `${k.navn} (${extra})` : k.navn;
}

function BilKunderVelger({ kundeIds, kunder, onChange, setModal, label = 'Kunder' }) {
  const ids = Array.isArray(kundeIds) ? kundeIds : (kundeIds ? [kundeIds] : []);
  const valgte = ids.map(function (id) {
    return (kunder || []).find(function (k) { return k.id === id; });
  }).filter(Boolean);
  const tilgjengelige = (kunder || []).filter(function (k) { return !ids.includes(k.id); });

  const leggTil = function (id) {
    if (!id || ids.includes(id)) return;
    onChange([...ids, id]);
  };

  const fjern = function (id) {
    onChange(ids.filter(function (x) { return x !== id; }));
  };

  return (
    <div className="gap">
      <div className="fl">{label}</div>
      <div className="bil-kunder-list">
        {valgte.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--t4)' }}>Ingen kunder koblet til bilen</span>
        )}
        {valgte.map(function (k) {
          return (
            <span className="bil-kunde-tag" key={k.id}>
              <button
                type="button"
                className="bil-kunde-tag__navn"
                onClick={function () { if (setModal) setModal({ t: 'visKunde', d: k }); }}
              >
                {k.navn}
              </button>
              <button type="button" className="bil-kunde-tag__fjern" onClick={function () { fjern(k.id); }} aria-label="Fjern kunde">
                ×
              </button>
            </span>
          );
        })}
      </div>
      {tilgjengelige.length > 0 && (
        <select
          value=""
          onChange={function (e) {
            const id = Number(e.target.value);
            if (id) leggTil(id);
            e.target.value = '';
          }}
        >
          <option value="">+ Legg til kunde</option>
          {tilgjengelige.map(function (k) {
            return <option key={k.id} value={k.id}>{kundeLabel(k)}</option>;
          })}
        </select>
      )}
    </div>
  );
}

function KundeVelger({
  kundeId,
  kunder,
  onChange,
  setModal,
  setKunder,
  label = 'Kunde',
  kontakt,
  kilde = 'Manuell'
}) {
  const valgt = (kunder || []).find(function (k) { return k.id === kundeId; });
  const match = !kundeId && kontaktHarKundedata(kontakt)
    ? findKundeByEpost(kunder, kontakt.epost)
    : null;

  const apneNyKunde = function () {
    if (!setModal || !kontaktHarKundedata(kontakt)) return;
    const navn = String(kontakt.navn || '').trim()
      || String(kontakt.epost || '').split('@')[0]
      || '';
    setModal({
      t: 'nyKunde',
      initial: {
        navn,
        epost: kontakt.epost || '',
        tlf: kontakt.tlf || '',
        kilde: kilde || 'Manuell'
      },
      onCreated: function (kunde) {
        if (setKunder && kunde) {
          setKunder(function (prev) {
            if (prev.some(function (k) { return k.id === kunde.id; })) return prev;
            return [...prev, kunde].sort(function (a, b) {
              return a.navn.localeCompare(b.navn, 'nb');
            });
          });
        }
        onChange(kunde.id);
      }
    });
  };

  const kobleEksisterende = function () {
    if (!match) return;
    onChange(match.id);
  };

  return (
    <div className="gap">
      <div className="fl">{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          style={{ flex: 1, minWidth: 180 }}
          value={kundeId || ''}
          onChange={function (e) { onChange(e.target.value ? Number(e.target.value) : null); }}
        >
          <option value="">Ingen kunde</option>
          {(kunder || []).map(function (k) {
            return <option key={k.id} value={k.id}>{kundeLabel(k)}</option>;
          })}
        </select>
        {valgt && setModal && (
          <button type="button" className="btn btn-g btn-xs" onClick={function () { setModal({ t: 'visKunde', d: valgt }); }}>
            Profil
          </button>
        )}
        {!kundeId && kontaktHarKundedata(kontakt) && (
          match ? (
            <button type="button" className="btn btn-p btn-xs" onClick={kobleEksisterende}>
              Koble til {match.navn}
            </button>
          ) : setModal ? (
            <button type="button" className="btn btn-p btn-xs" onClick={apneNyKunde}>
              + Legg til som kunde
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}

function KunderView({ kunder, setModal, visTost }) {
  const [q, setQ] = useState('');
  const [sokResultat, setSokResultat] = useState(null);
  const [laster, setLaster] = useState(false);

  useEffect(function () {
    const term = q.trim();
    if (!term) {
      setSokResultat(null);
      return;
    }
    const t = setTimeout(function () {
      setLaster(true);
      getKunder(term)
        .then(function (res) { setSokResultat(res.items || []); })
        .catch(function () { visTost('Søk feilet ✗'); })
        .finally(function () { setLaster(false); });
    }, 250);
    return function () { clearTimeout(t); };
  }, [q, visTost]);

  const vis = sokResultat != null ? sokResultat : kunder;

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Kunder</div>
          <div className="ph-sub">{kunder.length} kunder i databasen</div>
        </div>
        <button type="button" className="btn btn-p" onClick={function () { setModal({ t: 'nyKunde' }); }}>
          + Ny kunde
        </button>
      </div>
      <div style={{ marginBottom: 14 }} className="search-row">
        <input
          placeholder="Søk navn, e-post eller telefon..."
          value={q}
          onChange={function (e) { setQ(e.target.value); }}
        />
        {laster && <span style={{ fontSize: 11, color: 'var(--t4)' }}>Søker…</span>}
      </div>
      <div className="card table-cards">
        <table>
          <thead>
            <tr>
              <th>Navn</th>
              <th>Kontakt</th>
              <th>Type</th>
              <th>Kilde</th>
              <th>Aktivitet</th>
              <th>Opprettet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vis.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--t4)', padding: 24 }}>
                  Ingen kunder funnet.
                </td>
              </tr>
            )}
            {vis.map(function (k) {
              const stats = k.stats || {};
              const aktivitet = (stats.henvendelser || 0) + (stats.innbytte || 0) + (stats.eposter || 0)
                + (stats.kalender || 0) + (stats.biler || 0);
              return (
                <tr key={k.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 12 }}>{k.navn}</div>
                    {k.organisasjonsnummer && (
                      <div style={{ fontSize: 10, color: 'var(--t4)' }}>Org.nr {k.organisasjonsnummer}</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: 11 }}>{k.epost || '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)' }}>{k.tlf || '—'}</div>
                  </td>
                  <td><span className="tag">{k.type || 'Privat'}</span></td>
                  <td><span className="tag">{k.kilde || 'Manuell'}</span></td>
                  <td style={{ fontSize: 11 }}>{aktivitet} koblinger</td>
                  <td style={{ fontSize: 10, color: 'var(--t4)', whiteSpace: 'nowrap' }}>{k.dato}</td>
                  <td>
                    <button type="button" className="btn btn-p btn-xs" onClick={function () { setModal({ t: 'visKunde', d: k }); }}>
                      Åpne
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function NyKundeModal({ onClose, onSave, initial }) {
  const [f, setF] = useState({
    navn: initial?.navn || '',
    epost: initial?.epost || '',
    tlf: initial?.tlf || '',
    adresse: '',
    postnr: '',
    poststed: '',
    organisasjonsnummer: '',
    type: 'Privat',
    notater: ''
  });
  const [err, setErr] = useState('');
  const s = function (k, v) { setF(function (p) { return { ...p, [k]: v }; }); };

  const lagre = function () {
    if (!f.navn.trim()) {
      setErr('Navn er påkrevd.');
      return;
    }
    setErr('');
    onSave({
      ...f,
      kilde: initial?.kilde || 'Manuell'
    });
  };

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal sm" onClick={function (e) { e.stopPropagation(); }}>
        <div className="modal-title">Ny kunde</div>
        <div><div className="fl">Navn *</div><input value={f.navn} onChange={function (e) { s('navn', e.target.value); }} /></div>
        <div className="form-row gap">
          <div><div className="fl">E-post</div><input value={f.epost} onChange={function (e) { s('epost', e.target.value); }} /></div>
          <div><div className="fl">Telefon</div><input value={f.tlf} onChange={function (e) { s('tlf', e.target.value); }} /></div>
        </div>
        <div className="form-row gap">
          <div><div className="fl">Type</div>
            <select value={f.type} onChange={function (e) { s('type', e.target.value); }}>
              <option value="Privat">Privat</option>
              <option value="Bedrift">Bedrift</option>
            </select>
          </div>
          <div><div className="fl">Org.nr</div><input value={f.organisasjonsnummer} onChange={function (e) { s('organisasjonsnummer', e.target.value); }} /></div>
        </div>
        <div><div className="fl">Adresse</div><input value={f.adresse} onChange={function (e) { s('adresse', e.target.value); }} /></div>
        <div className="form-row gap">
          <div><div className="fl">Postnr</div><input value={f.postnr} onChange={function (e) { s('postnr', e.target.value); }} /></div>
          <div><div className="fl">Poststed</div><input value={f.poststed} onChange={function (e) { s('poststed', e.target.value); }} /></div>
        </div>
        <div className="gap"><div className="fl">Notater</div><textarea rows={2} value={f.notater} onChange={function (e) { s('notater', e.target.value); }} /></div>
        {err && <div className="login-err" style={{ marginTop: 10 }}>{err}</div>}
        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={lagre}>Opprett</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

function KundeModal({ data, onClose, updateKunde, deleteKunde, setModal, visTost, lists }) {
  const [k, setK] = useState(data);
  const [aktivitet, setAktivitet] = useState(null);
  const [laster, setLaster] = useState(true);
  const [tab, setTab] = useState('info');

  useEffect(function () {
    setK(data);
    setLaster(true);
    getKundeAktivitet(data.id)
      .then(function (res) { setAktivitet(res.aktivitet || {}); })
      .catch(function () { visTost('Kunne ikke laste aktivitet ✗'); })
      .finally(function () { setLaster(false); });
  }, [data.id]);

  const opp = function (patch, msg) {
    setK(function (prev) {
      updateKunde(prev.id, patch, msg);
      return { ...prev, ...patch };
    });
  };

  const slett = async function () {
    if (!window.confirm('Slette denne kunden permanent?')) return;
    await deleteKunde(k.id);
  };

  const a = aktivitet || {};

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal lg" onClick={function (e) { e.stopPropagation(); }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div className="modal-title">{k.navn}</div>
            <div style={{ fontSize: 11, color: 'var(--t4)' }}>
              Kunde siden {k.dato} · {k.kilde || 'Manuell'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-red btn-sm" onClick={slett}>Slett</button>
          </div>
        </div>

        <div className="henv-filters" style={{ marginBottom: 16 }}>
          {['info', 'henvendelser', 'innbytte', 'eposter', 'kalender', 'biler'].map(function (id) {
            const labels = {
              info: 'Profil',
              henvendelser: `Kontaktskjema (${(a.henvendelser || []).length})`,
              innbytte: `Innbytte (${(a.innbytte || []).length})`,
              eposter: `E-post (${(a.eposter || []).length})`,
              kalender: `Kalender (${(a.kalender || []).length})`,
              biler: `Biler (${(a.biler || []).length})`
            };
            return (
              <button
                key={id}
                type="button"
                className="henv-filter"
                style={tab === id
                  ? { background: 'var(--accl)', color: 'var(--acc2)', border: '1px solid rgba(25,186,96,.25)' }
                  : { background: 'var(--s1)', color: 'var(--t3)', border: '1px solid var(--b2)' }}
                onClick={function () { setTab(id); }}
              >
                {labels[id]}
              </button>
            );
          })}
        </div>

        {laster && tab !== 'info' && (
          <div style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Laster…</div>
        )}

        {tab === 'info' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div className="modal-sec">Kontaktinformasjon</div>
              <div><div className="fl">Navn</div><input value={k.navn || ''} onChange={function (e) { opp({ navn: e.target.value }); }} /></div>
              <div className="form-row gap">
                <div><div className="fl">E-post</div><input value={k.epost || ''} onChange={function (e) { opp({ epost: e.target.value }); }} /></div>
                <div><div className="fl">Telefon</div><input value={k.tlf || ''} onChange={function (e) { opp({ tlf: e.target.value }); }} /></div>
              </div>
              <div className="form-row gap">
                <div><div className="fl">Type</div>
                  <select value={k.type || 'Privat'} onChange={function (e) { opp({ type: e.target.value }, 'Type oppdatert ✓'); }}>
                    <option value="Privat">Privat</option>
                    <option value="Bedrift">Bedrift</option>
                  </select>
                </div>
                <div><div className="fl">Org.nr</div><input value={k.organisasjonsnummer || ''} onChange={function (e) { opp({ organisasjonsnummer: e.target.value }); }} /></div>
              </div>
            </div>
            <div>
              <div className="modal-sec">Adresse</div>
              <div><div className="fl">Gateadresse</div><input value={k.adresse || ''} onChange={function (e) { opp({ adresse: e.target.value }); }} /></div>
              <div className="form-row gap">
                <div><div className="fl">Postnr</div><input value={k.postnr || ''} onChange={function (e) { opp({ postnr: e.target.value }); }} /></div>
                <div><div className="fl">Poststed</div><input value={k.poststed || ''} onChange={function (e) { opp({ poststed: e.target.value }); }} /></div>
              </div>
              <div className="modal-sec">Notater</div>
              <textarea rows={4} value={k.notater || ''} onChange={function (e) { opp({ notater: e.target.value }); }} />
            </div>
          </div>
        )}

        {tab === 'henvendelser' && !laster && (
          <div className="card" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>Emne</th><th>Status</th><th>Dato</th><th></th></tr></thead>
              <tbody>
                {(a.henvendelser || []).map(function (h) {
                  return (
                    <tr key={h.id}>
                      <td>{h.emne}</td>
                      <td><Badge s={h.status} colors={lists.henvStatusFarger} /></td>
                      <td style={{ fontSize: 10, color: 'var(--t4)' }}>{h.dato}</td>
                      <td><button type="button" className="btn btn-p btn-xs" onClick={function () { setModal({ t: 'visHenv', d: h }); }}>Åpne</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'innbytte' && !laster && (
          <div className="card" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>Kjøretøy</th><th>Status</th><th>Dato</th><th></th></tr></thead>
              <tbody>
                {(a.innbytte || []).map(function (i) {
                  return (
                    <tr key={i.id}>
                      <td>{i.merke} {i.modell} ({i.reg})</td>
                      <td><Badge s={i.status} colors={lists.innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER} /></td>
                      <td style={{ fontSize: 10, color: 'var(--t4)' }}>{i.dato}</td>
                      <td><button type="button" className="btn btn-p btn-xs" onClick={function () { setModal({ t: 'visInb', d: i }); }}>Åpne</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'eposter' && !laster && (
          <div className="card" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>Emne</th><th>Retning</th><th>Dato</th></tr></thead>
              <tbody>
                {(a.eposter || []).map(function (e) {
                  return (
                    <tr key={e.id}>
                      <td>{e.emne}</td>
                      <td><span className="tag">{e.retning === 'ut' ? 'Ut' : 'Inn'}</span></td>
                      <td style={{ fontSize: 10, color: 'var(--t4)' }}>{e.dato}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'kalender' && !laster && (
          <div className="card" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>Avtale</th><th>Type</th><th>Dato</th><th></th></tr></thead>
              <tbody>
                {(a.kalender || []).map(function (ev) {
                  return (
                    <tr key={ev.id}>
                      <td>{ev.tittel}</td>
                      <td><span className="tag">{ev.type}</span></td>
                      <td style={{ fontSize: 10, color: 'var(--t4)' }}>{ev.dato} {ev.tid}</td>
                      <td><button type="button" className="btn btn-p btn-xs" onClick={function () { setModal({ t: 'visKal', d: ev }); }}>Åpne</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'biler' && !laster && (
          <div className="card" style={{ margin: 0 }}>
            <table>
              <thead><tr><th>Bil</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(a.biler || []).map(function (b) {
                  return (
                    <tr key={b.id}>
                      <td>{b.reg} – {b.merke} {b.modell}</td>
                      <td><Badge s={b.status} /></td>
                      <td><button type="button" className="btn btn-p btn-xs" onClick={function () { setModal({ t: 'visBil', d: b }); }}>Åpne</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={onClose}>Lukk</button>
        </div>
      </div>
    </div>
  );
}

// ─── HENVENDELSER ────────────────────────────────────────────────────────────
function HenvStatusFilter({ label, active, color, onClick }) {
  let style;
  if (active) {
    style = label === 'Alle'
      ? { background: 'var(--accl)', color: 'var(--acc2)', border: '1px solid rgba(25,186,96,.25)' }
      : statusBadgeStyle(label, { [label]: color });
  } else {
    style = { background: 'var(--s1)', color: 'var(--t3)', border: '1px solid var(--b2)' };
  }

  return (
    <button type="button" className="henv-filter" style={style} onClick={onClick}>
      {label}
    </button>
  );
}

function HenvendelserView({ henv, setModal, updateHenv, deleteHenv, lists }) {
  const [filter, setFilter] = useState('Alle');

  const vis = useMemo(function () {
    const list = filter === 'Alle' ? henv : henv.filter(function (h) { return h.status === filter; });
    return sortItemsNyestFirst(list.map(function (h) {
      return { key: 'henv-' + h.id, sortDato: h.sortDato || h.dato || '', data: h };
    })).map(function (row) { return row.data; });
  }, [henv, filter]);
  const colors = lists.henvStatusFarger || DEFAULT_HENV_STATUS_FARGER;

  const slett = async (h) => {
    const ok = await deleteHenv(h.id);
    if (ok && filter !== 'Alle' && !henv.filter(item => item.id !== h.id).some(item => item.status === filter)) {
      setFilter('Alle');
    }
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Kontaktskjema</div>
          <div className="ph-sub">{henv.filter(h => h.status === 'Ny').length} nye · {henv.length} totalt</div>
        </div>
      </div>
      <div className="henv-filters">
        <HenvStatusFilter
          label="Alle"
          active={filter === 'Alle'}
          color="var(--acc)"
          onClick={() => setFilter('Alle')}
        />
        {lists.henvStatuser.map(function (s) {
          return (
            <HenvStatusFilter
              key={s}
              label={s}
              active={filter === s}
              color={colors[s] || '#6B7280'}
              onClick={() => setFilter(s)}
            />
          );
        })}
      </div>
      <div className="card table-cards">
        <table className="table-cards">
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
                <td><Badge s={h.status} colors={colors} /></td>
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
                    <button type="button" className="btn btn-red btn-xs" onClick={() => slett(h)}>Slett</button>
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

function HenvModal({ data, onClose, updateHenv, deleteHenv, onSendSvar, visTost, lists, mailStatus, currentUser, kunder, setKunder, setModal }) {
  const [h, setH] = useState(data);
  const [svar, setSvar] = useState(h.svar || '');
  const [sending, setSending] = useState(false);
  const colors = lists.henvStatusFarger || DEFAULT_HENV_STATUS_FARGER;
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
        const updated = await onSendSvar(h.id, { svar, kontoId: sendKonto?.id || null });
        if (updated) {
          setH({
            ...updated,
            ansvarlig: updated.ansvarlig || currentUser?.name || currentUser?.username || h.ansvarlig || ''
          });
        }
      } finally {
        setSending(false);
      }
      return;
    }
    const ny = { ...h, svar, status: 'Besvart', ansvarlig: currentUser?.name || currentUser?.username || h.ansvarlig || '' };
    setH(ny);
    updateHenv(h.id, { svar, status: 'Besvart', ansvarlig: currentUser?.name || currentUser?.username || '' }, 'Svar registrert ✓');
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
            <KundeVelger
              kundeId={h.kundeId}
              kunder={kunder}
              setModal={setModal}
              setKunder={setKunder}
              kontakt={{ navn: h.navn, epost: h.epost, tlf: h.tlf }}
              kilde="Manuell"
              onChange={function (id) { opp('kundeId', id, 'Kunde koblet ✓'); }}
            />
            <div className="gap"><div className="fl">Tilknyttet bil</div><span className="tag">{h.bilRef || '—'}</span></div>
            <div className="modal-sec">Mottatt melding</div>
            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--t2)', lineHeight: 1.65 }}>{h.melding}</div>
            <InternKommentarerSeksjon
              kommentarer={h.kommentarer}
              currentUser={currentUser}
              onChange={function (next, msg) { opp('kommentarer', next, msg); }}
              marginBottom={0}
            />
          </div>
          <div>
            <div className="modal-sec">Behandling</div>
            <div>
              <div className="fl">Status</div>
              <select value={h.status} onChange={e => opp('status', e.target.value)}>
                {lists.henvStatuser.map(function (s) {
                  return (
                    <option key={s} value={s}>{s}</option>
                  );
                })}
              </select>
              <div style={{ marginTop: 8 }}>
                <Badge s={h.status} colors={colors} />
              </div>
            </div>
            <div className="gap">
              <div className="fl">Ansvarlig</div>
              <select value={h.ansvarlig || ''} onChange={e => opp('ansvarlig', e.target.value)}>
                <option value="">Ikke tildelt</option>
                {ansvarligSelectOptions(lists, h.ansvarlig).map(a => <option key={a}>{a}</option>)}
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
          <button type="button" className="btn btn-red" onClick={() => deleteHenv(h.id)}>Slett kontaktskjema</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── INNBYTTE ────────────────────────────────────────────────────────────────
function isIngestImageFile(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  const name = String(file?.name || file?.path || '').toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(name);
}

function InfoGrid({ items }) {
  const visible = (items || []).filter(function (item) {
    const value = item[1];
    return value != null && String(value).trim() !== '' && value !== '—';
  });

  if (!visible.length) {
    return <div className="fv" style={{ fontSize: 12, color: 'var(--t4)' }}>—</div>;
  }

  return (
    <div className="info-grid">
      {visible.map(function (item) {
        const mono = item[0] === 'Chassisnummer';
        return (
          <div key={item[0]} className={'info-grid__item' + (mono ? ' info-grid__item--mono' : '')}>
            <div className="fl">{item[0]}</div>
            <div className="fv">{item[1]}</div>
          </div>
        );
      })}
    </div>
  );
}

function formatIngestMotoreffekt(row) {
  const motorer = Array.isArray(row?.motorer) ? row.motorer.filter(Boolean) : [];
  if (motorer.length > 1) {
    return motorer.map(function (m) {
      const eff = m.effektHk ? `${m.effektHk} hk` : (m.effektKw ? `${m.effektKw} kW` : '—');
      return `Motor ${m.nr || ''}: ${eff}`.replace('Motor :', 'Motor');
    }).join(' · ');
  }
  if (motorer.length === 1) {
    const m = motorer[0];
    if (m.effektHk) return `${m.effektHk} hk${m.effektKw ? ` (${m.effektKw} kW)` : ''}`;
    if (m.effektKw) return `${m.effektKw} kW`;
  }
  if (row?.effektHk) return `${row.effektHk} hk${row.effektKw ? ` (${row.effektKw} kW)` : ''}`;
  if (row?.effektKw) return `${row.effektKw} kW`;
  return '';
}

function formatIngestRekkevidde(data) {
  if (!data) return '';
  const parts = [];
  if (data.rekkeviddeKmBlandet) parts.push(`${data.rekkeviddeKmBlandet} km (WLTP blandet)`);
  else if (data.rekkeviddeKm) parts.push(`${data.rekkeviddeKm} km`);
  else if (data.rekkeviddeKmNedc) parts.push(`${data.rekkeviddeKmNedc} km (NEDC)`);
  if (data.rekkeviddeKmBy) parts.push(`${data.rekkeviddeKmBy} km (WLTP by)`);
  return parts.join(' · ');
}

function mergeIngestVehicleRow(row, vehicle) {
  if (!vehicle) return row;
  const has = function (v) { return v != null && String(v).trim() !== ''; };
  return {
    ...row,
    aar: vehicle.arsmodell || row.aar || '',
    girkasse: vehicle.girkasse || row.girkasse || '',
    farge: has(row.farge) ? row.farge : (vehicle.farge || ''),
    drivstoff: has(row.drivstoff) ? row.drivstoff : (vehicle.drivstoff || ''),
    nesteEuKontroll: has(row.nesteEuKontroll) ? row.nesteEuKontroll : (vehicle.nesteEuKontroll || ''),
    forstegangsregistrert: has(row.forstegangsregistrert) ? row.forstegangsregistrert : (vehicle.forstegangsregistrert || ''),
    bruktimport: has(row.bruktimport) ? row.bruktimport : (vehicle.bruktimport || ''),
    effektHk: has(row.effektHk) ? row.effektHk : (vehicle.effektHk ?? ''),
    effektKw: has(row.effektKw) ? row.effektKw : (vehicle.effektKw ?? ''),
    antallMotorer: has(row.antallMotorer) ? row.antallMotorer : (vehicle.antallMotorer ?? ''),
    rekkevidde: has(row.rekkevidde) ? row.rekkevidde : formatIngestRekkevidde(vehicle),
    chassisnr: has(row.chassisnr) ? row.chassisnr : (vehicle.understell || row.understell || ''),
    motorer: (Array.isArray(row.motorer) && row.motorer.length)
      ? row.motorer
      : (Array.isArray(vehicle.motorer) ? vehicle.motorer : [])
  };
}

function IngestKundensBilSeksjon({ row, active }) {
  const [displayRow, setDisplayRow] = useState(row);
  const [laster, setLaster] = useState(false);

  useEffect(function () {
    setDisplayRow(row);
  }, [row]);

  useEffect(function () {
    if (!active) return undefined;
    const reg = String(row?.reg || '').trim().toUpperCase().replace(/\s/g, '');
    if (!reg || reg.length < 5) return undefined;
    let cancelled = false;
    setLaster(true);
    lookupKjoretoy(reg).then(function (data) {
      if (cancelled) return;
      setDisplayRow(function (prev) { return mergeIngestVehicleRow(prev, data?.vehicle); });
    }).catch(function () {
      if (!cancelled) setDisplayRow(row);
    }).finally(function () {
      if (!cancelled) setLaster(false);
    });
    return function () { cancelled = true; };
  }, [active, row?.id, row?.reg]);

  return (
    <>
      {laster ? (
        <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>Henter kjøretøydata fra Vegvesen…</div>
      ) : null}
      <InfoGrid items={buildIngestKundensBilItems(displayRow)} />
    </>
  );
}

function buildIngestKundensBilItems(row) {
  const effekt = formatIngestMotoreffekt(row);
  const antallMotorer = Number(row?.antallMotorer);
  const chassisnr = String(row?.chassisnr || row?.understell || '').trim().toUpperCase();
  const items = [
    ['Registreringsnr.', row.reg],
    ['Chassisnummer', chassisnr],
    ['Merke / modell', [row.merke, row.modell].filter(Boolean).join(' ')],
    ['Årsmodell', row.aar],
    ['Kilometerstand', row.km ? `${fmtKm(row.km)} km` : ''],
    ['Drivstoff', row.drivstoff],
    ['Girkasse', row.girkasse],
    ['Farge', formatSvvFargeNavn(row.farge)],
    ['Førstegangsregistrert', row.forstegangsregistrert],
    ['Bruktimport', row.bruktimport],
    ['Neste EU-kontroll', row.nesteEuKontroll ? formatEuKontrollVisning(row.nesteEuKontroll) : ''],
    ['Effekt', effekt],
  ];
  if (antallMotorer > 1) {
    items.push(['Antall motorer', String(antallMotorer)]);
  }
  if (row.rekkevidde) {
    items.push(['Rekkevidde', row.rekkevidde]);
  }
  items.push(
    ['Kjøretøytype', row.kjoretoyType],
    ['Servicehistorikk', row.servicehistorikk || row.tilstand],
    ['Siste service', row.sisteService],
    ['Sommerdekk', row.sommerdekk],
    ['Vinterdekk', row.vinterdekk]
  );
  return items;
}

function ModalTabs({ tabs, active, onChange }) {
  return (
    <div className="modal-tabs" role="tablist" aria-label="Visning">
      {tabs.map(function (tab) {
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`modal-tabs__btn${active === tab.id ? ' is-active' : ''}`}
            onClick={function () { onChange(tab.id); }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function InternKommentarerSeksjon({ kommentarer, currentUser, onChange, title, placeholder, marginBottom }) {
  const [nyKom, setNyKom] = useState('');
  const items = normalizeInternKommentarer(kommentarer);

  const leggKom = () => {
    if (!nyKom.trim()) return;
    onChange([...items, createHenvKommentar(nyKom, currentUser)], 'Kommentar lagt til ✓');
    setNyKom('');
  };

  const slettKom = (commentId) => {
    const target = items.find(function (item) { return item.id === commentId; });
    if (!target || !canDeleteHenvKommentar(target, currentUser)) return;
    onChange(items.filter(function (item) { return item.id !== commentId; }), 'Kommentar slettet ✓');
  };

  return (
    <>
      <div className="modal-sec">{title || 'Interne kommentarer'}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>Ingen interne kommentarer ennå.</div>
      ) : null}
      {items.map(function (k) {
        const kanSlette = canDeleteHenvKommentar(k, currentUser);
        return (
          <div className="logg-item logg-item--comment" key={k.id}>
            <div className="logg-tekst">{k.text}</div>
            <div className="logg-meta logg-meta--row">
              <span>{k.userName}{formatKommentarDato(k.createdAt) ? ` · ${formatKommentarDato(k.createdAt)}` : ''}</span>
              {kanSlette ? (
                <button type="button" className="btn btn-red btn-xs" onClick={function () { slettKom(k.id); }}>
                  Slett
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, marginBottom: marginBottom ?? 16 }}>
        <input
          placeholder={placeholder || 'Intern kommentar...'}
          value={nyKom}
          onChange={e => setNyKom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && leggKom()}
        />
        <button type="button" className="btn btn-g btn-sm" onClick={leggKom}>+</button>
      </div>
    </>
  );
}

function IngestKundeInfoPanel({ row, kundeId, kunder, setModal, setKunder, onKundeChange }) {
  const tlf = String(row.tlf || '').trim();
  const epost = String(row.epost || '').trim();
  const navn = String(row.navn || '').trim() || 'Ukjent kunde';
  const beskrivelse = String(row.beskrivelse || '').trim();

  return (
    <section className="inb-modal__panel inb-modal__panel--kunde">
      <div className="modal-sec">Info fra kunden</div>
      <div className="inb-kunde-card">
        <div className="inb-kunde-card__navn">{navn}</div>
        <div className="inb-kunde-card__kontakt">
          {tlf ? (
            <a className="inb-kunde-card__link" href={`tel:${tlf.replace(/\s/g, '')}`}>{tlf}</a>
          ) : (
            <span className="inb-kunde-card__muted">Ingen telefon</span>
          )}
          {epost ? (
            <a className="inb-kunde-card__link" href={`mailto:${epost}`}>{epost}</a>
          ) : (
            <span className="inb-kunde-card__muted">Ingen e-post</span>
          )}
        </div>
      </div>
      <div className="gap" style={{ marginTop: 14 }}>
        <div className="fl">Beskrivelse / kommentar</div>
        <div className={`inb-modal__quote${beskrivelse ? ' inb-modal__quote--kunde' : ''}`}>{beskrivelse || '—'}</div>
      </div>
      <IngestBilderSeksjon bilder={row.bilder} />
      <div style={{ marginTop: 12 }}>
        <KundeVelger
          kundeId={kundeId}
          kunder={kunder}
          setModal={setModal}
          setKunder={setKunder}
          kontakt={{ navn: row.navn, epost: row.epost, tlf: row.tlf }}
          kilde="Manuell"
          onChange={onKundeChange}
        />
      </div>
    </section>
  );
}

function IngestBilderSeksjon({ bilder }) {
  const files = Array.isArray(bilder) ? bilder : [];

  if (!files.length) {
    return (
      <>
        <div className="modal-sec">Bilder fra kunde</div>
        <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>Ingen bilder eller filer lastet opp.</div>
      </>
    );
  }

  const images = files.filter(isIngestImageFile);
  const other = files.filter(function (file) { return !isIngestImageFile(file); });

  return (
    <>
      <div className="modal-sec">Bilder fra kunde · {files.length}</div>
      {images.length ? (
        <div className="ingest-bilder-grid">
          {images.map(function (file, index) {
            const key = file.path || file.name || String(index);
            return (
              <a
                key={key}
                className="ingest-bilder-grid__item"
                href={file.path}
                target="_blank"
                rel="noopener noreferrer"
                title={file.name || 'Bilde'}
              >
                <img src={file.path} alt={file.name || 'Opplastet bilde'} loading="lazy" />
              </a>
            );
          })}
        </div>
      ) : null}
      {other.map(function (file, index) {
        const key = file.path || file.name || String(index);
        return (
          <div className="logg-item" key={key}>
            <div className="logg-tekst">
              <a href={file.path} target="_blank" rel="noopener noreferrer">{file.name || 'Fil'}</a>
            </div>
          </div>
        );
      })}
    </>
  );
}

function parseFinnItemId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const urlMatch = s.match(/finn\.no\/mobility\/item\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  const digits = s.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

function finnItemUrl(id) {
  return id ? `https://www.finn.no/mobility/item/${id}` : null;
}

function InnbytteView({ innbytte, setModal, lists, visTost }) {
  const [finnSokLasterId, setFinnSokLasterId] = useState(null);
  const innbytteColors = lists?.innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER;

  async function handleFinnMarkedsSok(inn) {
    if (!canFinnMarkedsSok(inn) || finnSokLasterId != null) return;
    setFinnSokLasterId(inn.id);
    try {
      const ok = await openFinnMarkedsSok(inn);
      if (!ok) visTost('Fant ikke merke/modell på FINN – sjekk stavemåte ✗');
    } catch (err) {
      visTost((err?.message || 'Kunne ikke åpne FINN-markedssøk') + ' ✗');
    } finally {
      setFinnSokLasterId(null);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Innbytteforespørsler</div>
          <div className="ph-sub">Fra xbilsenter.no/innbytte · {innbytte.filter(i => i.status === 'Ny').length} nye</div>
        </div>
      </div>
      {innbytte.map(inn => (
        <div className="inb-card" key={inn.id} style={statusCardStyle(inn.status, innbytteColors)}>
          <div className="inb-card__head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{inn.navn}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {inn.merke} {inn.modell} {inn.aar}{fmtKmLabel(inn.km) ? ` · ${fmtKmLabel(inn.km)}` : ''} · {inn.reg}
              </div>
            </div>
            <div className="inb-card__actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge s={inn.status} colors={innbytteColors} />
              <button
                type="button"
                className="btn btn-g btn-sm"
                disabled={!canFinnMarkedsSok(inn) || finnSokLasterId === inn.id}
                title={canFinnMarkedsSok(inn)
                  ? `Filtrer ${finnMarkedsSokLabel(inn)} på FINN.no – pris lav til høy`
                  : 'Mangler merke/modell på innbyttebilen'}
                onClick={() => handleFinnMarkedsSok(inn)}
              >
                {finnSokLasterId === inn.id ? 'Åpner FINN…' : 'Sammenlign på FINN'}
              </button>
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

function SelgBilView({ selgBil, setModal, lists, visTost }) {
  const [finnSokLasterId, setFinnSokLasterId] = useState(null);
  const statusColors = lists?.innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER;

  async function handleFinnMarkedsSok(inn) {
    if (!canFinnMarkedsSok(inn) || finnSokLasterId != null) return;
    setFinnSokLasterId(inn.id);
    try {
      const ok = await openFinnMarkedsSok(inn);
      if (!ok) visTost('Fant ikke merke/modell på FINN – sjekk stavemåte ✗');
    } catch (err) {
      visTost((err?.message || 'Kunne ikke åpne FINN-markedssøk') + ' ✗');
    } finally {
      setFinnSokLasterId(null);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Selg din bil</div>
          <div className="ph-sub">Fra xbilsenter.no/selg-bil · {selgBil.filter(i => i.status === 'Ny').length} nye</div>
        </div>
      </div>
      {selgBil.map(inn => (
        <div className="inb-card" key={inn.id} style={statusCardStyle(inn.status, statusColors)}>
          <div className="inb-card__head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{inn.navn}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {inn.merke} {inn.modell} {inn.aar}{fmtKmLabel(inn.km) ? ` · ${fmtKmLabel(inn.km)}` : ''} · {inn.reg}
              </div>
            </div>
            <div className="inb-card__actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Badge s={inn.status} colors={statusColors} />
              <button
                type="button"
                className="btn btn-g btn-sm"
                disabled={!canFinnMarkedsSok(inn) || finnSokLasterId === inn.id}
                title={canFinnMarkedsSok(inn)
                  ? `Filtrer ${finnMarkedsSokLabel(inn)} på FINN.no – pris lav til høy`
                  : 'Mangler merke/modell på bilen'}
                onClick={() => handleFinnMarkedsSok(inn)}
              >
                {finnSokLasterId === inn.id ? 'Åpner FINN…' : 'Sammenlign på FINN'}
              </button>
              <button type="button" className="btn btn-p btn-sm" onClick={() => setModal({ t: 'visSelgBil', d: inn })}>Behandle</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['Forventning', formatForventningDisplay(inn.forventning)], ['Tilstand', inn.tilstand], ['Tilbud', inn.tilbud ? nok(inn.tilbud) : 'Ikke gitt'], ['Ansvarlig', inn.ansvarlig || 'Ikke tildelt'], ['Dato', inn.dato]].map(([l, v]) => (
              <div key={l}>
                <div className="fl">{l}</div>
                <div className="fv" style={{ fontSize: 12, color: l === 'Tilbud' && inn.tilbud ? 'var(--gold)' : 'var(--t2)' }}>{v}</div>
              </div>
            ))}
          </div>
          {inn.beskrivelse && <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 8, fontStyle: 'italic' }}>{inn.beskrivelse}</div>}
        </div>
      ))}
      {selgBil.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--t4)', padding: 40, fontSize: 13 }}>Ingen oppkjøpsforespørsler ennå.</div>
      )}
    </>
  );
}

function SelgBilModal({ data, onClose, updateSelgBil, deleteSelgBil, onSendTilbud, visTost, lists, mailStatus, currentUser, kunder, setKunder, setModal }) {
  const [inn, setInn] = useState(data);
  const [activeTab, setActiveTab] = useState('foresporsel');
  const [svarType, setSvarType] = useState('tilbud');
  const [tilbud, setTilbud] = useState(inn.tilbud || '');
  const [finnSokLaster, setFinnSokLaster] = useState(false);
  const [melding, setMelding] = useState(function () {
    return buildSelgBilTilbudMelding(data, data.tilbud || '', lists?.tilbudEpostMaler);
  });
  const [sending, setSending] = useState(false);
  const sendKonto = (mailStatus?.kontoer || []).find(function (k) { return k.standard; })
    || (mailStatus?.kontoer || [])[0];

  useEffect(function () {
    if (svarType === 'visning') {
      setMelding(buildSelgBilVisningMelding(inn, lists?.tilbudEpostMaler));
    } else {
      setMelding(buildSelgBilTilbudMelding(inn, tilbud, lists?.tilbudEpostMaler));
    }
  }, [svarType, tilbud, inn, lists?.tilbudEpostMaler]);

  const setSvarModus = (type) => {
    setSvarType(type);
    setMelding(type === 'visning'
      ? buildSelgBilVisningMelding(inn, lists?.tilbudEpostMaler)
      : buildSelgBilTilbudMelding(inn, tilbud, lists?.tilbudEpostMaler));
  };

  const oppdaterMelding = () => {
    setMelding(svarType === 'visning'
      ? buildSelgBilVisningMelding(inn, lists?.tilbudEpostMaler)
      : buildSelgBilTilbudMelding(inn, tilbud, lists?.tilbudEpostMaler));
  };

  const opp = (k, v, msg) => {
    const ny = { ...inn, [k]: v };
    setInn(ny);
    updateSelgBil(inn.id, { [k]: v }, msg);
  };

  const sendSvar = async () => {
    if (svarType === 'tilbud' && !String(tilbud || '').trim()) {
      visTost('Skriv inn tilbudspris først ✗');
      return;
    }
    if (!melding.trim()) {
      visTost('Meldingen kan ikke være tom ✗');
      return;
    }
    const nyStatus = svarType === 'visning'
      ? resolveListStatus(lists.innbytteStatuser, 'Under vurdering')
      : resolveListStatus(lists.innbytteStatuser, 'Tilbud sendt');
    if (!mailStatus?.smtpConfigured) {
      const ansvarlig = currentUser?.name || currentUser?.username || '';
      const patch = { status: nyStatus, ansvarlig };
      if (svarType === 'tilbud') patch.tilbud = String(tilbud).trim();
      setInn({ ...inn, ...patch });
      updateSelgBil(inn.id, patch,
        svarType === 'visning' ? 'Befaring registrert (e-post ikke konfigurert) ✓' : 'Tilbud registrert (e-post ikke konfigurert) ✓');
      return;
    }
    if (!onSendTilbud || sending) return;
    setSending(true);
    try {
      const updated = await onSendTilbud(inn.id, {
        type: svarType,
        tilbud: svarType === 'tilbud' ? String(tilbud).trim() : undefined,
        melding: melding.trim(),
        kontoId: sendKonto?.id || null
      });
      if (updated) {
        const sender = currentUser?.name || currentUser?.username || '';
        setInn({
          ...updated,
          status: updated.status || nyStatus,
          ansvarlig: updated.ansvarlig || sender || inn.ansvarlig
        });
        if (updated.tilbud) setTilbud(updated.tilbud);
      }
    } finally {
      setSending(false);
    }
  };

  const statusColors = lists?.innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER;
  const kommentarCount = (inn.kommentarer || []).length;
  const utstyr = Array.isArray(inn.utstyr) ? inn.utstyr : [];

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal xl inb-modal" onClick={e => e.stopPropagation()}>
        <div className="inb-modal__head">
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>
              Oppkjøp · {inn.merke} {inn.modell} {inn.aar}
            </div>
            <div className="inb-modal__meta">
              {inn.navn} · {inn.reg}{fmtKmLabel(inn.km) ? ` · ${fmtKmLabel(inn.km)}` : ''} · mottatt {inn.dato}
            </div>
          </div>
          <Badge s={inn.status} colors={statusColors} />
        </div>

        <div className="inb-modal__toolbar">
          <div className="inb-modal__toolbar-fields">
            <label className="inb-modal__field">
              <span className="fl">Status</span>
              <select value={inn.status} onChange={e => opp('status', e.target.value)}>
                {lists.innbytteStatuser.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="inb-modal__field">
              <span className="fl">Ansvarlig</span>
              <select value={inn.ansvarlig || ''} onChange={e => opp('ansvarlig', e.target.value)}>
                <option value="">Ikke tildelt</option>
                {ansvarligSelectOptions(lists, inn.ansvarlig).map(a => <option key={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn btn-p btn-sm"
            disabled={!canFinnMarkedsSok(inn) || finnSokLaster}
            title="Åpner FINN.no filtrert på merke og modell, sortert pris lav til høy"
            onClick={async function () {
              if (!canFinnMarkedsSok(inn) || finnSokLaster) return;
              setFinnSokLaster(true);
              try {
                const ok = await openFinnMarkedsSok(inn);
                if (!ok) visTost('Fant ikke merke/modell på FINN – sjekk stavemåte ✗');
              } catch (err) {
                visTost((err?.message || 'Kunne ikke åpne FINN-markedssøk') + ' ✗');
              } finally {
                setFinnSokLaster(false);
              }
            }}
          >
            {finnSokLaster ? 'Åpner FINN…' : 'Sammenlign mot FINN'}
          </button>
        </div>

        <ModalTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'foresporsel', label: 'Forespørsel' },
            { id: 'autosys', label: 'Autosys' },
            { id: 'svar', label: 'Svar til kunde' },
            { id: 'intern', label: kommentarCount ? `Intern · ${kommentarCount}` : 'Intern' }
          ]}
        />

        <div className="inb-modal__body">
          {activeTab === 'foresporsel' ? (
            <div className="inb-modal__grid inb-modal__grid--ingest">
              <IngestKundeInfoPanel
                row={inn}
                kundeId={inn.kundeId}
                kunder={kunder}
                setModal={setModal}
                setKunder={setKunder}
                onKundeChange={function (id) { opp('kundeId', id, 'Kunde koblet ✓'); }}
              />

              <section className="inb-modal__panel inb-modal__panel--bil">
                <div className="modal-sec">Kundens bil</div>
                <IngestKundensBilSeksjon row={inn} active={activeTab === 'foresporsel'} />
                {utstyr.length ? (
                  <div className="gap" style={{ marginTop: 12 }}>
                    <div className="fl">Utstyr</div>
                    <div className="tag-list">
                      {utstyr.map(function (item) {
                        return <span key={item} className="tag">{item}</span>;
                      })}
                    </div>
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 12, lineHeight: 1.45 }}>
                  {canFinnMarkedsSok(inn)
                    ? <>FINN-markedssøk: {finnMarkedsSokLabel(inn)}{finnMarkedsSokFilterText(inn) ? ` (${finnMarkedsSokFilterText(inn)})` : ''} · pris lav → høy</>
                    : 'Legg inn merke og modell for å sammenligne mot FINN.'}
                </div>
              </section>

              <section className="inb-modal__panel inb-modal__panel--secondary">
                <div className="modal-sec">Oppkjøp</div>
                {inn.forventning ? (
                  <div className="gap">
                    <div className="fl">Kundens prisforventning</div>
                    <div className="fv" style={{ color: 'var(--gold)', fontWeight: 600 }}>{formatForventningDisplay(inn.forventning)}</div>
                  </div>
                ) : (
                  <div className="fv">Ingen prisforventning oppgitt.</div>
                )}
                {inn.tilbud ? (
                  <div className="gap" style={{ marginTop: 14 }}>
                    <div className="fl">Gitt tilbud</div>
                    <div className="fv" style={{ color: 'var(--gold)', fontWeight: 600 }}>{nok(inn.tilbud)}</div>
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 14, lineHeight: 1.45 }}>
                  Direkte oppkjøp fra xbilsenter.no/selg-bil · vurder bilen mot markedet på FINN før du sender tilbud.
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'autosys' ? (
            <div className="inb-modal__panel">
              <KjoretoyAutosysPanel regnr={inn.reg} active={activeTab === 'autosys'} />
            </div>
          ) : null}

          {activeTab === 'svar' ? (
            <div className="inb-modal__panel inb-modal__panel--svar">
              <div className="view-toggle" role="group" aria-label="Svartype" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${svarType === 'visning' ? 'btn-p' : 'btn-g'}`}
                  onClick={() => setSvarModus('visning')}
                >
                  Foreslå befaring
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${svarType === 'tilbud' ? 'btn-p' : 'btn-g'}`}
                  onClick={() => setSvarModus('tilbud')}
                >
                  Send tilbud
                </button>
              </div>
              {svarType === 'visning' ? (
                <p className="inb-modal__hint">
                  Når dere er nærme hverandre på pris – inviter kunden inn til befaring i stedet for å sende et konkret oppkjøpstilbud på e-post.
                </p>
              ) : (
                <div className="gap" style={{ marginBottom: 10 }}>
                  <div className="fl">Tilbudspris (kr)</div>
                  <input type="number" placeholder="f.eks. 85000" value={tilbud} onChange={e => setTilbud(e.target.value)} />
                </div>
              )}
              <div className="gap">
                <div className="inb-modal__svar-head">
                  <div className="fl" style={{ marginBottom: 0 }}>E-post til kunde</div>
                  <button type="button" className="btn btn-g btn-sm" onClick={oppdaterMelding}>
                    Oppdater tekst
                  </button>
                </div>
                {!mailStatus?.smtpConfigured && (
                  <div className="inb-modal__hint inb-modal__hint--warn">
                    SMTP er ikke satt opp – svaret lagres kun i CRM.
                  </div>
                )}
                <textarea
                  rows={12}
                  value={melding}
                  onChange={e => setMelding(e.target.value)}
                  placeholder="Skriv e-post til kunden..."
                  style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                />
                {sendKonto?.signatur && mailStatus?.smtpConfigured && (
                  <SignaturePreview
                    body={melding}
                    signatur={sendKonto.signatur}
                    label={`Signatur fra ${sendKonto.navn} legges til automatisk`}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-p"
                  style={{ marginTop: 10 }}
                  onClick={sendSvar}
                  disabled={sending || !melding.trim() || (svarType === 'tilbud' && !String(tilbud || '').trim())}
                >
                  {sending ? 'Sender…' : (
                    mailStatus?.smtpConfigured
                      ? (svarType === 'visning' ? 'Send invitasjon til befaring' : 'Send oppkjøpstilbud på e-post')
                      : (svarType === 'visning' ? 'Lagre befaring' : 'Lagre tilbud')
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'intern' ? (
            <div className="inb-modal__panel">
              <InternKommentarerSeksjon
                kommentarer={inn.kommentarer}
                currentUser={currentUser}
                onChange={function (next, msg) { opp('kommentarer', next, msg); }}
              />
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={onClose}>Lagre & lukk</button>
          <button type="button" className="btn btn-red" onClick={() => deleteSelgBil(inn.id)}>Slett forespørsel</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

function InbModal({ data, onClose, updateInnbytte, deleteInnbytte, onSendTilbud, visTost, lists, mailStatus, currentUser, kunder, setKunder, setModal }) {
  const [inn, setInn] = useState(data);
  const [activeTab, setActiveTab] = useState('foresporsel');
  const [svarType, setSvarType] = useState('tilbud');
  const [tilbud, setTilbud] = useState(inn.tilbud || '');
  const [finnMeta, setFinnMeta] = useState(null);
  const [finnLaster, setFinnLaster] = useState(false);
  const [finnSokLaster, setFinnSokLaster] = useState(false);
  const [melding, setMelding] = useState(function () {
    return buildInnbytteTilbudMelding(data, data.tilbud || '', null, lists?.tilbudEpostMaler);
  });
  const [sending, setSending] = useState(false);
  const sendKonto = (mailStatus?.kontoer || []).find(function (k) { return k.standard; })
    || (mailStatus?.kontoer || [])[0];

  useEffect(function () {
    const ref = String(inn.onsketBil || '').trim();
    if (!ref) {
      setFinnMeta(null);
      return;
    }
    let cancelled = false;
    setFinnLaster(true);
    fetchFinnAnnonseApi(ref).then(function (res) {
      if (cancelled) return;
      const meta = res.item || null;
      setFinnMeta(meta);
    }).catch(function () {
      if (cancelled) return;
      const id = parseFinnItemId(ref);
      setFinnMeta(id ? { id: id, url: finnItemUrl(id), title: null } : null);
      if (!id) visTost('Kunne ikke lese FINN-kode – sjekk at kunden har skrevet kode eller lenke ✗');
    }).finally(function () {
      if (!cancelled) setFinnLaster(false);
    });
    return function () { cancelled = true; };
  }, [inn.onsketBil, visTost]);

  useEffect(function () {
    if (svarType === 'visning') {
      if (finnLaster) return;
      setMelding(buildInnbytteVisningMelding(inn, finnMeta, lists?.tilbudEpostMaler));
    } else {
      setMelding(buildInnbytteTilbudMelding(inn, tilbud, finnMeta, lists?.tilbudEpostMaler));
    }
  }, [finnMeta, finnLaster, svarType, tilbud, inn, lists?.tilbudEpostMaler]);

  const setSvarModus = (type) => {
    setSvarType(type);
    setMelding(type === 'visning'
      ? buildInnbytteVisningMelding(inn, finnMeta, lists?.tilbudEpostMaler)
      : buildInnbytteTilbudMelding(inn, tilbud, finnMeta, lists?.tilbudEpostMaler));
  };

  const oppdaterMelding = () => {
    setMelding(svarType === 'visning'
      ? buildInnbytteVisningMelding(inn, finnMeta, lists?.tilbudEpostMaler)
      : buildInnbytteTilbudMelding(inn, tilbud, finnMeta, lists?.tilbudEpostMaler));
  };

  const opp = (k, v, msg) => {
    const ny = { ...inn, [k]: v };
    setInn(ny);
    updateInnbytte(inn.id, { [k]: v }, msg);
  };

  const sendSvar = async () => {
    if (svarType === 'tilbud' && !String(tilbud || '').trim()) {
      visTost('Skriv inn tilbudspris først ✗');
      return;
    }
    if (!melding.trim()) {
      visTost('Meldingen kan ikke være tom ✗');
      return;
    }
    const nyStatus = svarType === 'visning'
      ? resolveListStatus(lists.innbytteStatuser, 'Under vurdering')
      : resolveListStatus(lists.innbytteStatuser, 'Tilbud sendt');
    if (!mailStatus?.smtpConfigured) {
      const ansvarlig = currentUser?.name || currentUser?.username || '';
      const patch = { status: nyStatus, ansvarlig };
      if (svarType === 'tilbud') patch.tilbud = String(tilbud).trim();
      setInn({ ...inn, ...patch });
      updateInnbytte(inn.id, patch,
        svarType === 'visning' ? 'Visning registrert (e-post ikke konfigurert) ✓' : 'Tilbud registrert (e-post ikke konfigurert) ✓');
      return;
    }
    if (!onSendTilbud || sending) return;
    setSending(true);
    try {
      const updated = await onSendTilbud(inn.id, {
        type: svarType,
        tilbud: svarType === 'tilbud' ? String(tilbud).trim() : undefined,
        melding: melding.trim(),
        kontoId: sendKonto?.id || null
      });
      if (updated) {
        const sender = currentUser?.name || currentUser?.username || '';
        setInn({
          ...updated,
          status: updated.status || nyStatus,
          ansvarlig: updated.ansvarlig || sender || inn.ansvarlig
        });
        if (updated.tilbud) setTilbud(updated.tilbud);
      }
    } finally {
      setSending(false);
    }
  };

  const innbytteColors = lists?.innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER;
  const kommentarCount = (inn.kommentarer || []).length;
  const utstyr = Array.isArray(inn.utstyr) ? inn.utstyr : [];

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal xl inb-modal" onClick={e => e.stopPropagation()}>
        <div className="inb-modal__head">
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>
              Innbytte · {inn.merke} {inn.modell} {inn.aar}
            </div>
            <div className="inb-modal__meta">
              {inn.navn} · {inn.reg}{fmtKmLabel(inn.km) ? ` · ${fmtKmLabel(inn.km)}` : ''} · mottatt {inn.dato}
            </div>
          </div>
          <Badge s={inn.status} colors={innbytteColors} />
        </div>

        <div className="inb-modal__toolbar">
          <div className="inb-modal__toolbar-fields">
            <label className="inb-modal__field">
              <span className="fl">Status</span>
              <select value={inn.status} onChange={e => opp('status', e.target.value)}>
                {lists.innbytteStatuser.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="inb-modal__field">
              <span className="fl">Ansvarlig</span>
              <select value={inn.ansvarlig || ''} onChange={e => opp('ansvarlig', e.target.value)}>
                <option value="">Ikke tildelt</option>
                {ansvarligSelectOptions(lists, inn.ansvarlig).map(a => <option key={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn btn-p btn-sm"
            disabled={!canFinnMarkedsSok(inn) || finnSokLaster}
            title="Åpner FINN.no filtrert på merke og modell, sortert pris lav til høy"
            onClick={async function () {
              if (!canFinnMarkedsSok(inn) || finnSokLaster) return;
              setFinnSokLaster(true);
              try {
                const ok = await openFinnMarkedsSok(inn);
                if (!ok) visTost('Fant ikke merke/modell på FINN – sjekk stavemåte ✗');
              } catch (err) {
                visTost((err?.message || 'Kunne ikke åpne FINN-markedssøk') + ' ✗');
              } finally {
                setFinnSokLaster(false);
              }
            }}
          >
            {finnSokLaster ? 'Åpner FINN…' : 'Sammenlign mot FINN'}
          </button>
        </div>

        <ModalTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'foresporsel', label: 'Forespørsel' },
            { id: 'autosys', label: 'Autosys' },
            { id: 'svar', label: 'Svar til kunde' },
            { id: 'intern', label: kommentarCount ? `Intern · ${kommentarCount}` : 'Intern' }
          ]}
        />

        <div className="inb-modal__body">
          {activeTab === 'foresporsel' ? (
            <div className="inb-modal__grid inb-modal__grid--ingest">
              <IngestKundeInfoPanel
                row={inn}
                kundeId={inn.kundeId}
                kunder={kunder}
                setModal={setModal}
                setKunder={setKunder}
                onKundeChange={function (id) { opp('kundeId', id, 'Kunde koblet ✓'); }}
              />

              <section className="inb-modal__panel inb-modal__panel--bil">
                <div className="modal-sec">Kundens bil</div>
                <IngestKundensBilSeksjon row={inn} active={activeTab === 'foresporsel'} />
                {utstyr.length ? (
                  <div className="gap" style={{ marginTop: 12 }}>
                    <div className="fl">Utstyr</div>
                    <div className="tag-list">
                      {utstyr.map(function (item) {
                        return <span key={item} className="tag">{item}</span>;
                      })}
                    </div>
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 12, lineHeight: 1.45 }}>
                  {canFinnMarkedsSok(inn)
                    ? <>FINN-markedssøk: {finnMarkedsSokLabel(inn)}{finnMarkedsSokFilterText(inn) ? ` (${finnMarkedsSokFilterText(inn)})` : ''} · pris lav → høy</>
                    : 'Legg inn merke og modell for å sammenligne mot FINN.'}
                </div>
              </section>

              <section className="inb-modal__panel inb-modal__panel--secondary">
                <div className="modal-sec">Ønsket bil hos oss</div>
                {finnLaster ? (
                  <div className="fv" style={{ fontSize: 12, color: 'var(--t3)' }}>Henter annonse fra FINN…</div>
                ) : null}
                {!finnLaster && finnMeta?.title ? (
                  <>
                    <div className="fv" style={{ color: 'var(--acc)', fontWeight: 600 }}>{finnMeta.title}</div>
                    {finnMeta.url ? (
                      <a href={finnMeta.url} target="_blank" rel="noopener noreferrer" className="inb-modal__link">
                        {finnMeta.url}
                      </a>
                    ) : null}
                  </>
                ) : null}
                {!finnLaster && !finnMeta?.title && inn.onsketBil ? (
                  <div className="fv" style={{ color: 'var(--acc)', fontWeight: 600 }}>{inn.onsketBil}</div>
                ) : null}
                {!finnLaster && !finnMeta?.title && !inn.onsketBil ? (
                  <div className="fv">—</div>
                ) : null}
                {inn.forventning ? (
                  <div className="gap" style={{ marginTop: 14 }}>
                    <div className="fl">Kundens prisforventning</div>
                    <div className="fv" style={{ color: 'var(--gold)', fontWeight: 600 }}>{formatForventningDisplay(inn.forventning)}</div>
                  </div>
                ) : null}
                {inn.tilbud ? (
                  <div className="gap" style={{ marginTop: 14 }}>
                    <div className="fl">Gitt tilbud</div>
                    <div className="fv" style={{ color: 'var(--gold)', fontWeight: 600 }}>{nok(inn.tilbud)}</div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {activeTab === 'autosys' ? (
            <div className="inb-modal__panel">
              <KjoretoyAutosysPanel regnr={inn.reg} active={activeTab === 'autosys'} />
            </div>
          ) : null}

          {activeTab === 'svar' ? (
            <div className="inb-modal__panel inb-modal__panel--svar">
              <div className="view-toggle" role="group" aria-label="Svartype" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${svarType === 'visning' ? 'btn-p' : 'btn-g'}`}
                  onClick={() => setSvarModus('visning')}
                >
                  Foreslå visning
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${svarType === 'tilbud' ? 'btn-p' : 'btn-g'}`}
                  onClick={() => setSvarModus('tilbud')}
                >
                  Send tilbud
                </button>
              </div>
              {svarType === 'visning' ? (
                <p className="inb-modal__hint">
                  Når dere er nærme hverandre på pris – inviter kunden inn til visning i stedet for å sende et konkret tilbud på e-post.
                </p>
              ) : (
                <div className="gap" style={{ marginBottom: 10 }}>
                  <div className="fl">Tilbudspris (kr)</div>
                  <input type="number" placeholder="f.eks. 85000" value={tilbud} onChange={e => setTilbud(e.target.value)} />
                </div>
              )}
              <div className="gap">
                <div className="inb-modal__svar-head">
                  <div className="fl" style={{ marginBottom: 0 }}>E-post til kunde</div>
                  <button type="button" className="btn btn-g btn-sm" onClick={oppdaterMelding}>
                    Oppdater tekst
                  </button>
                </div>
                {!mailStatus?.smtpConfigured && (
                  <div className="inb-modal__hint inb-modal__hint--warn">
                    SMTP er ikke satt opp – svaret lagres kun i CRM.
                  </div>
                )}
                <textarea
                  rows={12}
                  value={melding}
                  onChange={e => setMelding(e.target.value)}
                  placeholder="Skriv e-post til kunden..."
                  style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                />
                {sendKonto?.signatur && mailStatus?.smtpConfigured && (
                  <SignaturePreview
                    body={melding}
                    signatur={sendKonto.signatur}
                    label={`Signatur fra ${sendKonto.navn} legges til automatisk`}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-p"
                  style={{ marginTop: 10 }}
                  onClick={sendSvar}
                  disabled={sending || !melding.trim() || (svarType === 'tilbud' && !String(tilbud || '').trim())}
                >
                  {sending ? 'Sender…' : (
                    mailStatus?.smtpConfigured
                      ? (svarType === 'visning' ? 'Send invitasjon til visning' : 'Send tilbud på e-post')
                      : (svarType === 'visning' ? 'Lagre visningsinvitasjon' : 'Lagre tilbud')
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'intern' ? (
            <div className="inb-modal__panel">
              <InternKommentarerSeksjon
                kommentarer={inn.kommentarer}
                currentUser={currentUser}
                onChange={function (next, msg) { opp('kommentarer', next, msg); }}
              />
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-p" onClick={onClose}>Lagre & lukk</button>
          <button type="button" className="btn btn-red" onClick={() => deleteInnbytte(inn.id)}>Slett innbytte</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── KALENDER ────────────────────────────────────────────────────────────────
function formatKalDag(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nb-NO', {
    timeZone: NORSK_TIDSSONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

const KAL_DAY_HOURS = 24;
const KAL_HOUR_HEIGHT = 56;

function kalTimeToMinutes(value) {
  if (!value) return null;
  const parts = String(value).trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] || 0);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function kalMinutesToTime(totalMinutes) {
  const mins = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function kalAddOneHour(tid) {
  const mins = kalTimeToMinutes(tid);
  if (mins == null) return '';
  return kalMinutesToTime(mins + 60);
}

function kalEffectiveSlutt(event) {
  if (!event?.tid) return '';
  return event.tidSlutt || kalAddOneHour(event.tid);
}

function kalFormatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function kalDayHourRange() {
  return { start: 0, end: KAL_DAY_HOURS };
}

function kalDayScheduleHeight() {
  return KAL_DAY_HOURS * KAL_HOUR_HEIGHT;
}

function kalFormatHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function kalEventBlockStyle(event, range) {
  const dayStartMin = range.start * 60;
  const dayEndMin = range.end * 60;
  const start = kalTimeToMinutes(event.tid);
  const endRaw = kalTimeToMinutes(kalEffectiveSlutt(event));
  const safeStart = start == null ? dayStartMin : Math.max(dayStartMin, start);
  const safeEnd = endRaw && endRaw > safeStart ? Math.min(dayEndMin, endRaw) : Math.min(dayEndMin, safeStart + 60);
  const top = ((safeStart - dayStartMin) / 60) * KAL_HOUR_HEIGHT;
  const height = Math.max(((safeEnd - safeStart) / 60) * KAL_HOUR_HEIGHT, 26);
  return { top, height, visible: safeStart < dayEndMin && safeEnd > dayStartMin };
}

function KalContextMenu({ menu, lists, onClose, onAction }) {
  const menuRef = useRef(null);
  const [submenu, setSubmenu] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(function () {
    if (!menu) {
      setSubmenu(null);
      return;
    }
    setSubmenu(null);
    const margin = 8;
    const maxW = 240;
    const maxH = 360;
    let x = menu.x;
    let y = menu.y;
    if (typeof window !== 'undefined') {
      if (x + maxW > window.innerWidth - margin) x = Math.max(margin, window.innerWidth - maxW - margin);
      if (y + maxH > window.innerHeight - margin) y = Math.max(margin, window.innerHeight - maxH - margin);
    }
    setPos({ x, y });
  }, [menu]);

  useEffect(function () {
    if (!menu) return;
    const close = function () { onClose(); };
    const onKey = function (e) {
      if (e.key === 'Escape') close();
    };
    const onPointer = function (e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return function () {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu, onClose]);

  if (!menu?.event) return null;

  const ev = menu.event;
  const run = function (action, payload) {
    onAction(action, payload);
    onClose();
  };

  const MenuItem = function ({ label, onClick, disabled, danger, hasSub, active }) {
    return (
      <button
        type="button"
        className={`inbox-ctx-item${disabled ? ' disabled' : ''}${danger ? ' danger' : ''}${active ? ' active' : ''}`}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        onMouseEnter={hasSub && !disabled ? function () { setSubmenu(hasSub); } : undefined}
      >
        <span>{label}</span>
        {hasSub && <span className="inbox-ctx-arrow">›</span>}
      </button>
    );
  };

  const Sep = () => <div className="inbox-ctx-sep" />;

  return (
    <div
      ref={menuRef}
      className="inbox-ctx-menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={function (e) { e.preventDefault(); }}
    >
      <MenuItem label="Rediger avtale" onClick={() => run('edit', ev)} />
      <MenuItem label="Endre tittel" onClick={() => run('rename', ev)} />
      <Sep />
      <div
        className="inbox-ctx-submenu-wrap"
        onMouseEnter={() => setSubmenu('type')}
        onMouseLeave={() => setSubmenu(function (prev) { return prev === 'type' ? null : prev; })}
      >
        <MenuItem label="Endre type" hasSub="type" active={submenu === 'type'} onClick={() => setSubmenu('type')} />
        {submenu === 'type' && (
          <div className="inbox-ctx-submenu">
            {(lists?.kalTyper || []).map(function (type) {
              return (
                <MenuItem
                  key={type}
                  label={type}
                  active={ev.type === type}
                  onClick={() => run('setType', { event: ev, type })}
                />
              );
            })}
          </div>
        )}
      </div>
      <div
        className="inbox-ctx-submenu-wrap"
        onMouseEnter={() => setSubmenu('ansvarlig')}
        onMouseLeave={() => setSubmenu(function (prev) { return prev === 'ansvarlig' ? null : prev; })}
      >
        <MenuItem label="Endre ansvarlig" hasSub="ansvarlig" active={submenu === 'ansvarlig'} onClick={() => setSubmenu('ansvarlig')} />
        {submenu === 'ansvarlig' && (
          <div className="inbox-ctx-submenu">
            {(lists?.ansatte || []).map(function (navn) {
              return (
                <MenuItem
                  key={navn}
                  label={navn}
                  active={ev.ansvarlig === navn}
                  onClick={() => run('setAnsvarlig', { event: ev, ansvarlig: navn })}
                />
              );
            })}
          </div>
        )}
      </div>
      <Sep />
      <MenuItem label="Slett avtale" danger onClick={() => run('delete', ev)} />
    </div>
  );
}

function KalDayPanel({ iso, events, onClose, setModal, onEventContextMenu }) {
  const scrollRef = useRef(null);
  const sorted = [...events].sort(function (a, b) { return a.tid.localeCompare(b.tid); });
  const range = kalDayHourRange();
  const hours = Array.from({ length: KAL_DAY_HOURS }, function (_, i) { return i; });
  const scheduleHeight = kalDayScheduleHeight();

  useEffect(function () {
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const focusHour = iso === IDAG ? Math.max(0, now.getHours() - 1) : 7;
    el.scrollTop = focusHour * KAL_HOUR_HEIGHT;
  }, [iso]);

  return (
    <div className="ov" onClick={onClose}>
      <div className="modal lg kal-day-panel" onClick={function (e) { e.stopPropagation(); }}>
        <div className="kal-day-panel-hd">
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>{formatKalDag(iso)}</div>
            <div className="ph-sub">
              {sorted.length} avtale{sorted.length === 1 ? '' : 'r'}
            </div>
          </div>
          <button type="button" className="btn btn-p btn-sm" onClick={function () { setModal({ t: 'nyKal', dato: iso }); onClose(); }}>
            + Ny avtale
          </button>
        </div>

        <div className="kal-day-scroll" ref={scrollRef}>
          <div
            className="kal-day-grid"
            style={{
              gridTemplateRows: `repeat(${KAL_DAY_HOURS}, ${KAL_HOUR_HEIGHT}px)`,
              height: scheduleHeight
            }}
          >
            {hours.map(function (hour) {
              return (
                <div
                  key={`label-${hour}`}
                  className={`kal-day-label${hour === 0 ? ' kal-day-label--first' : ''}`}
                  style={{ gridRow: hour + 1, gridColumn: 1 }}
                >
                  {kalFormatHourLabel(hour)}
                </div>
              );
            })}

            {hours.map(function (hour) {
              return (
                <button
                  key={`slot-${hour}`}
                  type="button"
                  className={`kal-day-slot${hour === 0 ? ' kal-day-slot--first' : ''}`}
                  style={{ gridRow: hour + 1, gridColumn: 2 }}
                  title={`Ny avtale kl. ${kalFormatHourLabel(hour)}`}
                  onClick={function () {
                    const tid = kalFormatHour(hour);
                    setModal({ t: 'nyKal', dato: iso, tid, tidSlutt: kalAddOneHour(tid) });
                    onClose();
                  }}
                />
              );
            })}

            <div className="kal-day-events" style={{ height: scheduleHeight }}>
              {sorted.map(function (e) {
                const layout = kalEventBlockStyle(e, range);
                if (!layout.visible) return null;
                const color = KFARGE[e.type] || '#888';
                return (
                  <div
                    key={e.id}
                    className="kal-day-event"
                    style={{
                      top: layout.top,
                      height: layout.height,
                      background: color + '28',
                      borderColor: color,
                      color: color
                    }}
                    onClick={function (evt) {
                      evt.stopPropagation();
                      setModal({ t: 'visKal', d: e });
                      onClose();
                    }}
                    onContextMenu={function (evt) {
                      evt.preventDefault();
                      evt.stopPropagation();
                      onEventContextMenu(evt, e);
                    }}
                  >
                    <div className="kal-day-event-title">{e.tittel}</div>
                    <div className="kal-day-event-time">{formatKalTid(e)}</div>
                    {layout.height >= 44 && e.ansvarlig ? (
                      <div className="kal-day-event-meta">{e.ansvarlig}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-g" onClick={onClose}>Lukk</button>
        </div>
      </div>
    </div>
  );
}

function KalenderView({ kal, setModal, biler, lists, updateKal, deleteKal }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [dayPanel, setDayPanel] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
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

  const openEventContextMenu = function (evt, event) {
    setCtxMenu({ x: evt.clientX, y: evt.clientY, event });
  };

  const handleCtxAction = async function (action, payload) {
    const ev = payload?.event || payload;
    if (!ev?.id) return;

    if (action === 'edit') {
      setModal({ t: 'visKal', d: ev });
      setDayPanel(null);
      return;
    }
    if (action === 'rename') {
      const next = window.prompt('Ny tittel:', ev.tittel || '');
      if (next == null) return;
      const tittel = String(next).trim();
      if (!tittel || tittel === ev.tittel) return;
      await updateKal(ev.id, { tittel }, 'Tittel oppdatert ✓');
      return;
    }
    if (action === 'setType') {
      if (!payload?.type || payload.type === ev.type) return;
      await updateKal(ev.id, { type: payload.type }, 'Type oppdatert ✓');
      return;
    }
    if (action === 'setAnsvarlig') {
      if (!payload?.ansvarlig || payload.ansvarlig === ev.ansvarlig) return;
      await updateKal(ev.id, { ansvarlig: payload.ansvarlig }, 'Ansvarlig oppdatert ✓');
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`Slette «${ev.tittel}»?`)) return;
      await deleteKal(ev.id, 'Avtale slettet ✓');
    }
  };

  const renderKalEvent = function (e) {
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
        onClick={function (evt) {
          evt.stopPropagation();
          setModal({ t: 'visKal', d: e });
        }}
        onContextMenu={function (evt) {
          evt.preventDefault();
          evt.stopPropagation();
          openEventContextMenu(evt, e);
        }}
      >
        <div style={{ fontSize: 9, opacity: .7 }}>{formatKalTid(e)}</div>
        <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, marginTop: 1 }}>{e.tittel}</div>
        <div style={{ fontSize: 9, opacity: .6, marginTop: 1 }}>{e.ansvarlig}</div>
      </div>
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Kalender</div>
          <div className="ph-sub">Månedsvisning · {monthKal.length} avtaler · klikk dag for oversikt</div>
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

      <div className="kal-month-wrap">
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
              className={`kal-cell kal-cell--clickable${cell.iso === IDAG ? ' today' : ''}${cell.inMonth ? '' : ' kal-cell--muted'}`}
              onClick={function () { setDayPanel(cell.iso); }}
              title="Klikk for å se alle avtaler"
            >
              <div className={`kal-dag-nr${cell.iso === IDAG ? ' kal-dag-nr--today' : ''}`}>{cell.day}</div>
              {dayEvents.slice(0, 4).map(renderKalEvent)}
              {dayEvents.length > 4 ? (
                <div className="kal-event-more">+{dayEvents.length - 4} til</div>
              ) : null}
            </div>
          );
        })}
      </div>
      </div>

      <div className="card table-cards">
        <div className="card-h">
          <span className="card-ht">Alle avtaler i {monthLabel(viewYear, viewMonth)}</span>
        </div>
        <table className="table-cards">
          <thead><tr><th>Tittel</th><th>Type</th><th>Dato</th><th>Tid</th><th>Ansvarlig</th><th>Bil</th><th>Notat</th></tr></thead>
          <tbody>
            {monthKal.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--t4)', padding: 20 }}>Ingen avtaler denne måneden</td></tr>
            )}
            {[...monthKal].sort(function (a, b) {
              return a.dato.localeCompare(b.dato) || a.tid.localeCompare(b.tid);
            }).map(function (e) {
              return (
                <tr
                  key={e.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setModal({ t: 'visKal', d: e })}
                  onContextMenu={function (evt) {
                    evt.preventDefault();
                    openEventContextMenu(evt, e);
                  }}
                >
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

      {dayPanel && (
        <KalDayPanel
          iso={dayPanel}
          events={kal.filter(function (e) { return e.dato === dayPanel; })}
          onClose={function () { setDayPanel(null); }}
          setModal={setModal}
          onEventContextMenu={openEventContextMenu}
        />
      )}

      <KalContextMenu
        menu={ctxMenu}
        lists={lists}
        onClose={function () { setCtxMenu(null); }}
        onAction={handleCtxAction}
      />
    </>
  );
}

function KalModal({ data, onClose, onSave, onDelete, biler, lists, kunder, title }) {
  const startTid = data?.tid || '10:00';
  const [tidSluttOverstyrt, setTidSluttOverstyrt] = useState(!!data?.tidSlutt);
  const [f, setF] = useState({
    tittel: data?.tittel || '',
    type: data?.type || lists.kalTyper[0] || 'Annet',
    dato: data?.dato || IDAG,
    tid: startTid,
    tidSlutt: data?.tidSlutt || kalAddOneHour(startTid),
    ansvarlig: data?.ansvarlig || lists.ansatte[0] || '',
    bilRef: data?.bilRef || '',
    kundeId: data?.kundeId || null,
    notat: data?.notat || ''
  });
  const [err, setErr] = useState('');
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const handleTidChange = function (value) {
    setF(function (prev) {
      return {
        ...prev,
        tid: value,
        tidSlutt: tidSluttOverstyrt ? prev.tidSlutt : kalAddOneHour(value)
      };
    });
  };

  const lagre = () => {
    if (!f.tittel || !f.dato) return;
    const tidSlutt = f.tidSlutt || kalAddOneHour(f.tid);
    if (tidSlutt && tidSlutt <= f.tid) {
      setErr('Sluttid må være etter starttid.');
      return;
    }
    setErr('');
    onSave({ ...f, tidSlutt });
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
          <div><div className="fl">Starttid</div><input type="time" value={f.tid} onChange={e => handleTidChange(e.target.value)} /></div>
          <div>
            <div className="fl">Sluttid</div>
            <input
              type="time"
              value={f.tidSlutt}
              onChange={function (e) {
                setTidSluttOverstyrt(true);
                s('tidSlutt', e.target.value);
              }}
            />
            {!tidSluttOverstyrt && <div className="kalkyle-hint" style={{ marginTop: 4 }}>Standard 1 time etter start</div>}
          </div>
        </div>
        <div className="gap">
          <div className="fl">Tilknyttet bil</div>
          <select value={f.bilRef} onChange={e => s('bilRef', e.target.value)}>
            <option value="">Ingen</option>
            {biler.map(b => <option key={b.id} value={b.reg}>{b.reg} – {b.merke} {b.modell}</option>)}
          </select>
        </div>
        <KundeVelger
          kundeId={f.kundeId}
          kunder={kunder}
          onChange={function (id) { s('kundeId', id); }}
        />
        <div className="gap"><div className="fl">Notat</div><textarea rows={2} value={f.notat} onChange={e => s('notat', e.target.value)} /></div>
        {err && <div className="login-err" style={{ marginTop: 10 }}>{err}</div>}
        <div className="modal-footer">
          {onDelete && (
            <button type="button" className="btn btn-g" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={onDelete}>
              Slett
            </button>
          )}
          <button type="button" className="btn btn-p" onClick={lagre}>Lagre</button>
          <button type="button" className="btn btn-g" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ─── OPPGAVER ────────────────────────────────────────────────────────────────
function OppgaverView({ biler, updateBil, visTost }) {
  const aktive = biler.filter(b => isBilAktiv(b) && harApneObligatoriskeOppgaver(getAktivSjekkliste(b)));

  const toggle = (bilId, idx) => {
    const bil = biler.find(b => b.id === bilId);
    if (!bil) return;
    const list = getAktivSjekkliste(bil);
    const ny = list.map((s, i) => i === idx ? { ...s, f: !s.f } : s);
    const next = withSjekklisteUpdate(bil, ny);
    updateBil(bilId, { sjekklister: next.sjekklister, sjekkliste: next.sjekkliste }, 'Oppdatert ✓');
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
      <div className="oppgaver-grid">
        {aktive.map(bil => {
          const list = getAktivSjekkliste(bil);
          const prog = calcSjekklisteFremdrift(list);
          const { f, t, pst } = prog;
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
                  <div className="prog-lbl">{f}/{t} oblig. fullført</div>
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
                    {!s.obligatorisk && <span className="chip chip-gray" style={{ fontSize: 9, marginLeft: 6 }}>Frivillig</span>}
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
    ['hjuldrift', 'Aksler med drift'],
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
    ['forstegangsregistrert', 'Førstegangsregistrert'],
    ['forstegangsregNorge', '1. reg. Norge'],
    ['bruktimport', 'Bruktimport'],
    ['registreringsstatus', 'Registreringsstatus'],
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
        const value = key === 'farge' ? formatSvvFargeNavn(raw) : (fmt ? fmt(raw) : String(raw));
        if (!value) return null;
        return { label: label, value: value };
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

function BilAutosysTab({ bil, lagreAutosys, visTost }) {
  const [laster, setLaster] = useState(false);
  const [feil, setFeil] = useState('');
  const autoHentRef = useRef(false);
  const vehicle = getVehicleFromSvvData(bil.svvData);
  const sections = vehicle ? buildSvvSectionsFromVehicle(vehicle) : [];

  const hentOgLagre = useCallback(async function () {
    setLaster(true);
    setFeil('');
    try {
      await lagreAutosys();
      if (visTost) visTost('Autosys-data hentet ✓');
    } catch (err) {
      setFeil(err.message || 'Oppslag feilet.');
    } finally {
      setLaster(false);
    }
  }, [lagreAutosys, visTost]);

  useEffect(function () {
    autoHentRef.current = false;
  }, [bil.id]);

  useEffect(function () {
    if (autoHentRef.current || vehicle || laster) return;
    if (!isValidBilReg(bil.reg)) return;
    if (Object.keys(getBilAutosysOverstyrt(bil)).length) return;
    autoHentRef.current = true;
    hentOgLagre();
  }, [bil.id, bil.reg, vehicle, laster, hentOgLagre, bil.svvData]);

  const displayVehicle = vehicle || getVehicleFromSvvData(bil.svvData?.vehicle);
  const fargeNavn = displayVehicle ? formatSvvFargeNavn(displayVehicle.farge) : '';

  const knappTekst = laster ? 'Henter…' : (displayVehicle ? 'Oppdater oppslag' : 'Hent fra Autosys');
  const oppdaterKnapp = (
    <button type="button" className="btn btn-g btn-sm" onClick={hentOgLagre} disabled={laster}>
      {knappTekst}
    </button>
  );

  return (
    <div className="bil-modal__autosys">
      <div className="bil-modal__autosys-content">
        <div className="bil-modal__autosys-hd">
          <div>
            <div className="modal-sec" style={{ marginBottom: 4 }}>Autosys · Statens vegvesen</div>
            <div style={{ fontSize: 11, color: 'var(--t4)' }}>
              Teknisk kjøretøydata lagret på {bil.reg || '—'}
            </div>
          </div>
          {!displayVehicle ? oppdaterKnapp : null}
        </div>

        {laster ? (
          <div className="fv" style={{ fontSize: 12, color: 'var(--t3)', padding: '24px 0' }}>Henter data fra Autosys…</div>
        ) : null}

        {!laster && feil ? (
          <div style={{ color: 'var(--red)', fontSize: 12, background: 'var(--redl)', padding: '10px 14px', borderRadius: 7, marginBottom: 12 }}>
            {feil}
          </div>
        ) : null}

        {!laster && !displayVehicle && !feil ? (
          <div style={{ fontSize: 12, color: 'var(--t4)', padding: '20px 0' }}>
            Ingen Autosys-data er lagret for denne bilen ennå. Klikk «Hent fra Autosys» for å hente og lagre data.
          </div>
        ) : null}

        {!laster && displayVehicle ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <NoPlate regNr={displayVehicle.regNr || bil.reg} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>
                  {displayVehicle.merke} {displayVehicle.modell}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                  {[displayVehicle.arsmodell, displayVehicle.kjoretoyGruppe || displayVehicle.kjoretoyType].filter(Boolean).join(' · ') || 'Kjøretøy funnet'}
                </div>
              </div>
              <div className="bil-modal__autosys-meta">
                <div className="bil-modal__autosys-chips">
                  {(() => {
                    const regChip = registreringsstatusChip(displayVehicle.registreringsstatus);
                    if (!regChip) return null;
                    return <span className={`chip ${regChip.className}`}>{regChip.label}</span>;
                  })()}
                  {fargeNavn ? (
                    <span className="chip chip-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: svvFarge(fargeNavn), border: '1px solid var(--b2)' }} />
                      {fargeNavn}
                    </span>
                  ) : null}
                </div>
                {oppdaterKnapp}
              </div>
            </div>

            {sections.map(function (section) {
              return (
                <div key={section.title} style={{ marginBottom: 20 }}>
                  <div className="modal-sec">{section.title}</div>
                  <div className="svv-grid">
                    {section.fields.map(function (field) {
                      return (
                        <div className="svv-field" key={section.title + field.label}>
                          <div className="fl">{field.label}</div>
                          <div className="fv">{field.value}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}

function KjoretoyAutosysPanel({ regnr, active }) {
  const [laster, setLaster] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [sections, setSections] = useState([]);
  const [feil, setFeil] = useState('');

  const slaOpp = useCallback(async function () {
    const reg = String(regnr || '').trim().toUpperCase().replace(/\s/g, '');
    if (!reg || reg.length < 5) {
      setFeil('Mangler gyldig registreringsnummer på forespørselen.');
      setResultat(null);
      setSections([]);
      return;
    }
    setLaster(true);
    setFeil('');
    setResultat(null);
    setSections([]);
    try {
      const data = await lookupKjoretoy(reg);
      setResultat(data.vehicle);
      const apiSections = Array.isArray(data.sections) ? data.sections : [];
      setSections(apiSections.length ? apiSections : buildSvvSectionsFromVehicle(data.vehicle));
    } catch (err) {
      setFeil(err.message || 'Oppslag feilet.');
    } finally {
      setLaster(false);
    }
  }, [regnr]);

  useEffect(function () {
    if (active) slaOpp();
  }, [active, slaOpp]);

  if (!active) return null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="modal-sec" style={{ marginBottom: 4 }}>Autosys · Statens vegvesen</div>
          <div style={{ fontSize: 11, color: 'var(--t4)' }}>
            Full teknisk kjøretøydata fra kjøretøyregisteret
          </div>
        </div>
        <button type="button" className="btn btn-g btn-sm" onClick={slaOpp} disabled={laster}>
          {laster ? 'Henter…' : 'Oppdater oppslag'}
        </button>
      </div>

      {laster ? (
        <div className="fv" style={{ fontSize: 12, color: 'var(--t3)', padding: '24px 0' }}>Henter data fra Autosys…</div>
      ) : null}

      {!laster && feil ? (
        <div style={{ color: 'var(--red)', fontSize: 12, background: 'var(--redl)', padding: '10px 14px', borderRadius: 7 }}>
          {feil}
        </div>
      ) : null}

      {!laster && resultat ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <NoPlate regNr={resultat.regNr || regnr} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>
                {resultat.merke} {resultat.modell}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                {[resultat.arsmodell, resultat.kjoretoyGruppe || resultat.kjoretoyType].filter(Boolean).join(' · ') || 'Kjøretøy funnet'}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {resultat.registreringsstatus ? (
                <span className={`chip ${resultat.registreringsstatus === 'Registrert' ? 'chip-green' : 'chip-orange'}`}>
                  {resultat.registreringsstatus}
                </span>
              ) : null}
              {resultat.farge ? (
                <span className="chip chip-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: svvFarge(resultat.farge), border: '1px solid var(--b2)' }} />
                  {formatSvvFargeNavn(resultat.farge)}
                </span>
              ) : null}
            </div>
          </div>

          {sections.map(function (section) {
            return (
              <div key={section.title} style={{ marginBottom: 20 }}>
                <div className="modal-sec">{section.title}</div>
                <div className="svv-grid">
                  {section.fields.map(function (field) {
                    return (
                      <div className="svv-field" key={section.title + field.label}>
                        <div className="fl">{field.label}</div>
                        <div className="fv">{field.value}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </>
  );
}

function VegvesenView({ biler, setBiler, visTost, refreshStats, lists, setTab, currentUser }) {
  const kanLeggeTilBil = canAddBil(currentUser);
  const [reg, setReg] = useState('');
  const [laster, setLaster] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [sections, setSections] = useState([]);
  const [rawData, setRawData] = useState(null);
  const [feil, setFeil] = useState('');

  const applyLookupResult = function (data) {
    setResultat(data.vehicle);
    const apiSections = Array.isArray(data.sections) ? data.sections : [];
    setSections(apiSections.length ? apiSections : buildSvvSectionsFromVehicle(data.vehicle));
    setRawData(data.raw || null);
    if (data.vehicle?.regNr) setReg(data.vehicle.regNr);
  };

  const runLookup = async function (loader) {
    setLaster(true);
    setFeil('');
    setResultat(null);
    setSections([]);
    setRawData(null);
    try {
      const data = await loader();
      applyLookupResult(data);
    } catch (err) {
      setFeil(err.message || 'Oppslag feilet.');
    } finally {
      setLaster(false);
    }
  };

  const slaOpp = function () {
    const regnr = reg.trim().toUpperCase().replace(/\s/g, '');
    if (!regnr || regnr.length < 5) {
      setFeil('Skriv inn et gyldig registreringsnummer.');
      return;
    }
    runLookup(function () { return lookupKjoretoy(regnr); });
  };

  const slaOppChassis = function (understellsnummer) {
    runLookup(function () { return lookupKjoretoyByUnderstell(understellsnummer); });
  };

  const leggTilBil = async () => {
    if (!resultat) return;
    const v = resultat;
    const fullMerke = String(v.merke || '').trim();
    const fullModell = buildFullBilModellFromVehicle(v);
    const merkeOptions = buildMerkeOptions(lists.merker, biler, fullMerke);
    const startStatus = lists.bilStatuser[0] || 'Innkjøpt';
    const nyBil = {
      reg: v.regNr || reg.toUpperCase(),
      merke: fullMerke ? resolveMerkeFromLists(fullMerke, merkeOptions) : 'Ukjent',
      modell: fullModell || 'Ukjent',
      aar: Number(v.arsmodell) || 0,
      km: '',
      innkjop: 0,
      salg: 0,
      farge: v.farge || 'Ukjent',
      status: startStatus,
      ansvarlig: lists.ansatte[0] || '',
      frist: '',
      notater: '',
      euKontroll: normalizeEuKontrollDato(v.nesteEuKontroll) || '',
      chassisnr: v.understell || '',
      tilstandsrapport: { ...DEFAULT_BIL_TILSTANDSRAPPORT },
      ...initBilSjekklister(startStatus, lists.bilSjekklister),
      logg: [{
        tekst: 'Importert fra Statens vegvesen',
        dato: new Date().toLocaleString('nb-NO', { timeZone: NORSK_TIDSSONE }),
        av: 'System'
      }],
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
    } catch (err) {
      visTost(err.message || 'Kunne ikke legge til bil ✗');
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
          <div className="lookup-row">
            <div className="lookup-row__field">
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
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><span className="card-ht">Oppslag via chassisnummer</span></div>
        <div style={{ padding: 16 }}>
          <ChassisScanPanel
            onLookup={slaOppChassis}
            loading={laster}
            disabled={false}
          />
        </div>
      </div>

      {feil && (
        <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16, background: 'var(--redl)', padding: '8px 12px', borderRadius: 7 }}>
          {feil}
        </div>
      )}

      {resultat && (
        <div className="card">
          <div className="card-h">
            <span className="card-ht">Kjøretøydata · {sections.reduce(function (n, s) { return n + s.fields.length; }, 0)} felt</span>
            {kanLeggeTilBil && (
              <button type="button" className="btn btn-p btn-sm" onClick={leggTilBil}>+ Legg til i lager</button>
            )}
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
                  {formatSvvFargeNavn(resultat.farge)}
                  </span>
                )}
              </div>
            </div>

            {sections.map(section => (
              <div key={section.title} style={{ marginBottom: 24 }}>
                <div className="modal-sec">{section.title}</div>
                <div className="svv-fields-grid">
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

function TilbudEpostMalerSection({ maler, onChange, onSave, visTost }) {
  const [saving, setSaving] = useState(false);
  const [localMaler, setLocalMaler] = useState(function () {
    return normalizeTilbudEpostMaler(maler);
  });
  const malerSnapshotRef = useRef('');

  useEffect(function () {
    const next = normalizeTilbudEpostMaler(maler);
    const snapshot = JSON.stringify(next);
    if (snapshot !== malerSnapshotRef.current) {
      malerSnapshotRef.current = snapshot;
      setLocalMaler(next);
    }
  }, [maler]);

  const setMal = (key, value) => {
    setLocalMaler(function (prev) {
      const next = { ...prev, [key]: value };
      onChange(next);
      return next;
    });
  };

  const resetMal = (key) => {
    if (!window.confirm('Tilbakestill denne malen til standardtekst?')) return;
    setLocalMaler(function (prev) {
      const next = { ...prev, [key]: DEFAULT_TILBUD_EPOST_MALER[key] };
      onChange(next);
      return next;
    });
  };

  const lagre = async () => {
    setSaving(true);
    try {
      const payload = normalizeTilbudEpostMaler(localMaler, { trim: true });
      await onSave(payload);
      malerSnapshotRef.current = JSON.stringify(payload);
      setLocalMaler(payload);
      onChange(payload);
      visTost('Tilbudmaler lagret ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre tilbudmaler ✗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="inbox-list-hd">
        <div>
          <span className="card-ht">Tilbudmaler (innbytte og selg bil)</span>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>
            Standardtekst når du sender tilbud eller inviterer til visning/befaring fra innbytte og selg bil.
          </div>
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={lagre} disabled={saving}>
          {saving ? 'Lagrer…' : 'Lagre tilbudmaler'}
        </button>
      </div>
      <div style={{ padding: 16 }} className="settings-stack">
        {TILBUD_EPOST_MAL_DEFS.map(function (def) {
          return (
            <div key={def.key} className="mail-konto-form tilbud-mal-form">
              <div className="tilbud-mal-form__head">
                <div>
                  <div className="tilbud-mal-form__title">{def.title}</div>
                  <div className="tilbud-mal-form__desc">{def.desc}</div>
                </div>
                <button type="button" className="btn btn-g btn-xs" onClick={() => resetMal(def.key)}>
                  Tilbakestill
                </button>
              </div>
              <div className="tilbud-mal-form__placeholders">
                Tilgjengelige felt: {def.placeholders.map(function (p) {
                  return <code key={p}>{p}</code>;
                })}
              </div>
              <textarea
                rows={10}
                value={localMaler[def.key] || ''}
                onChange={e => setMal(def.key, e.target.value)}
                style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'inherit' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  isAdmin: false,
  timelonn: 0
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
      return {
        ...prev,
        role,
        permissions: [...perms],
        isAdmin: role === 'Daglig leder'
      };
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
    role: displayRole(b.role),
    permissions: [...(b.permissions || [])],
    aktiv: b.aktiv,
    isAdmin: !!b.isAdmin,
    timelonn: Number(b.timelonn) || 0
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
        isAdmin: form.isAdmin,
        timelonn: Math.max(0, Math.round(Number(form.timelonn) || 0))
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
                    <td>{displayRole(b.role)}</td>
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
              <div>
                <div className="fl">Timelønn (kr/time)</div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.timelonn}
                  onChange={e => setForm({ ...form, timelonn: e.target.value })}
                  placeholder="0"
                />
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

function VedlikeholdSection({ vedlikeholdModus, onSave, visTost, readOnly }) {
  const [draft, setDraft] = useState(vedlikeholdModus || DEFAULT_INNSTILLINGER.vedlikeholdModus);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const skrivebeskyttet = !!readOnly;

  useEffect(function () {
    setDraft(vedlikeholdModus || DEFAULT_INNSTILLINGER.vedlikeholdModus);
  }, [vedlikeholdModus]);

  const defaultMelding = DEFAULT_INNSTILLINGER.vedlikeholdModus.melding;
  const meldingEndret = String(draft.melding || '').trim() !== String(vedlikeholdModus?.melding || defaultMelding).trim();

  const lagre = async (next, kind) => {
    const payload = {
      aktiv: !!next.aktiv,
      melding: String(next.melding || '').trim() || defaultMelding
    };
    if (kind === 'toggle') setSavingToggle(true);
    else setSavingMessage(true);
    try {
      await onSave(payload);
      setDraft(payload);
      if (kind === 'toggle') {
        visTost(payload.aktiv ? 'Vedlikeholdsmodus aktivert ✓' : 'Nettsiden er live igjen ✓');
      } else {
        visTost('Melding lagret ✓');
      }
    } catch (err) {
      visTost(err.message || 'Kunne ikke lagre vedlikehold ✗');
    } finally {
      if (kind === 'toggle') setSavingToggle(false);
      else setSavingMessage(false);
    }
  };

  const settAktiv = (aktiv) => {
    if (skrivebeskyttet || savingToggle || savingMessage || aktiv === !!draft.aktiv) return;
    lagre({ ...draft, aktiv }, 'toggle');
  };

  return (
    <div className="card section-wrap">
      <div className="card-h">
        <div>
          <span className="card-ht">Nettside vedlikehold</span>
          <div className="settings-desc" style={{ marginBottom: 0, marginTop: 4 }}>
            Steng nettsiden midlertidig mens du jobber med oppdateringer.
          </div>
        </div>
        <span className={`chip ${draft.aktiv ? 'chip-orange' : 'chip-green'}`}>
          {draft.aktiv ? 'Vedlikehold PÅ' : 'Live'}
        </span>
      </div>

      <div className="maint-panel">
        <div className={`maint-hero${draft.aktiv ? ' is-active' : ''}`}>
          <div className="maint-hero__main">
            <div className="maint-hero__icon">{draft.aktiv ? '🚧' : '🌐'}</div>
            <div>
              <div className="maint-hero__title">
                {draft.aktiv ? 'Nettsiden er stengt for besøkende' : 'Nettsiden er tilgjengelig'}
              </div>
              <div className="maint-hero__desc">
                {draft.aktiv
                  ? 'Besøkende ser vedlikeholdsside. Du kan forhåndsvise nettsiden via knappen under.'
                  : 'Besøkende kan bruke nettsiden, sende skjema og se biler som vanlig.'}
              </div>
            </div>
          </div>

          <div className="maint-hero__action">
            {skrivebeskyttet ? (
              <span className={`maint-switch__label${draft.aktiv ? ' is-on' : ''}`}>
                {draft.aktiv ? 'På' : 'Av'}
              </span>
            ) : (
              <>
                <label className="maint-switch" title={draft.aktiv ? 'Deaktiver vedlikehold' : 'Aktiver vedlikehold'}>
                  <input
                    type="checkbox"
                    checked={!!draft.aktiv}
                    disabled={savingToggle || savingMessage}
                    onChange={(e) => settAktiv(e.target.checked)}
                  />
                  <span className="maint-switch__track" aria-hidden="true" />
                </label>
                <span className={`maint-switch__label${draft.aktiv ? ' is-on' : ''}`}>
                  {savingToggle ? 'Lagrer…' : (draft.aktiv ? 'På' : 'Av')}
                </span>
              </>
            )}
          </div>
        </div>

        {draft.aktiv && (
          <div className="maint-preview">
            <button
              type="button"
              className="btn btn-g btn-sm"
              disabled={savingToggle || savingMessage}
              onClick={function () { openNettside('', { preview: true }); }}
            >
              Forhåndsvis nettsiden
            </button>
            <p className="settings-desc" style={{ marginTop: 8, marginBottom: 0 }}>
              Åpner nettsiden slik du ser den som innlogget admin. Andre besøkende ser fortsatt vedlikeholdssiden.
            </p>
          </div>
        )}

        {!skrivebeskyttet && (
        <div className="maint-message">
          <div className="fl">Melding til besøkende</div>
          <p className="settings-desc">
            Vises på vedlikeholdssiden når modus er aktivert.
          </p>
          <textarea
            rows={3}
            value={draft.melding || ''}
            disabled={savingToggle || savingMessage}
            onChange={(e) => setDraft(prev => ({ ...prev, melding: e.target.value }))}
            placeholder={defaultMelding}
          />
          <div className="maint-message__foot">
            <div className="maint-message__hint">
              {draft.aktiv
                ? 'Endringer i meldingen oppdateres på nettsiden innen ca. 15 sekunder.'
                : 'Meldingen lagres og er klar neste gang vedlikehold aktiveres.'}
            </div>
            <button
              type="button"
              className="btn btn-g btn-sm"
              disabled={!meldingEndret || savingToggle || savingMessage}
              onClick={() => lagre(draft, 'message')}
            >
              {savingMessage ? 'Lagrer…' : 'Lagre melding'}
            </button>
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

function StatusListEditor({ title, desc, statuser, farger, onChange, placeholder, defaultColors, normalizeColors }) {
  const [ny, setNy] = useState('');
  const colorDefaults = defaultColors || DEFAULT_HENV_STATUS_FARGER;
  const normalize = normalizeColors || normalizeHenvStatusFarger;

  const settFarge = (status, color) => {
    onChange(statuser, { ...farger, [status]: color });
  };

  const endreNavn = (idx, value) => {
    const gammelt = statuser[idx];
    if (value === gammelt) return;
    const trimmed = value.trim();
    if (trimmed && statuser.some(function (s, i) {
      return i !== idx && s.toLowerCase() === trimmed.toLowerCase();
    })) return;

    const nextStatuser = [...statuser];
    nextStatuser[idx] = value;
    const nextFarger = { ...farger };
    if (gammelt !== value && nextFarger[gammelt] !== undefined) {
      nextFarger[value] = nextFarger[gammelt];
      delete nextFarger[gammelt];
    } else if (value && nextFarger[value] === undefined) {
      nextFarger[value] = colorDefaults[value] || colorDefaults[gammelt] || '#6B7280';
    }
    onChange(nextStatuser, normalize(nextStatuser, nextFarger));
  };

  const leggTil = () => {
    const v = ny.trim();
    if (!v || statuser.some(item => item.toLowerCase() === v.toLowerCase())) return;
    onChange(
      [...statuser, v],
      { ...farger, [v]: colorDefaults[v] || '#6B7280' }
    );
    setNy('');
  };

  const fjern = (idx) => {
    if (statuser.length <= 1) return;
    const nextStatuser = statuser.filter((_, i) => i !== idx);
    const nextFarger = { ...farger };
    delete nextFarger[statuser[idx]];
    onChange(nextStatuser, normalize(nextStatuser, nextFarger));
  };

  const flytt = (idx, dir) => {
    const next = [...statuser];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next, normalize(next, farger));
  };

  return (
    <div className="card settings-card">
      <div className="card-h"><span className="card-ht">{title}</span></div>
      <div style={{ padding: 16 }}>
        {desc && <p className="settings-desc">{desc}</p>}
        <div className="settings-list">
          {statuser.map(function (item, idx) {
            const color = farger[item] || '#6B7280';
            return (
              <div className="settings-item settings-item--status" key={'status-row-' + idx}>
                <label className="status-color-picker" title="Velg farge">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => settFarge(item, e.target.value)}
                  />
                  <span className="status-color-picker__dot" style={{ background: color }} />
                </label>
                <input
                  className="settings-item__input"
                  value={item}
                  onChange={(e) => endreNavn(idx, e.target.value)}
                />
                <Badge s={item} colors={farger} />
                <div className="settings-item__actions">
                  <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, -1)} disabled={idx === 0}>↑</button>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, 1)} disabled={idx === statuser.length - 1}>↓</button>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => fjern(idx)} disabled={statuser.length <= 1}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="settings-add">
          <input
            value={ny}
            onChange={e => setNy(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && leggTil()}
            placeholder={placeholder || 'Legg til status...'}
          />
          <button type="button" className="btn btn-g btn-sm" onClick={leggTil}>+ Legg til</button>
        </div>
      </div>
    </div>
  );
}

function SjekklisteMalEditor({ items, onChange, placeholder, allowEmpty, compact }) {
  const rows = coerceSjekklisteMalRows(items);
  const [ny, setNy] = useState('');
  const [nyObligatorisk, setNyObligatorisk] = useState(true);
  const [nyForhandsvalgt, setNyForhandsvalgt] = useState(false);

  const setItems = (next, finalize) => {
    onChange(finalize ? finalizeSjekklisteMalItems(next) : coerceSjekklisteMalRows(next));
  };

  const endre = (idx, patch, finalize) => {
    const next = rows.map(function (item, i) {
      return i === idx ? { ...item, ...patch } : item;
    });
    setItems(next, finalize);
  };

  const endreTekst = (idx, value) => {
    endre(idx, { t: value }, false);
  };

  const avsluttTekstRedigering = (idx, rawValue) => {
    const t = trimSjekklisteMalTekst(rawValue);
    if (!t) {
      if (allowEmpty || rows.length > 1) {
        setItems(rows.filter(function (_, i) { return i !== idx; }), true);
      }
      return;
    }
    if (rows.some(function (item, i) {
      return i !== idx && trimSjekklisteMalTekst(item.t).toLowerCase() === t.toLowerCase();
    })) {
      endre(idx, { t: rows[idx]?.t || '' }, true);
      return;
    }
    endre(idx, { t: t }, true);
  };

  const leggTil = () => {
    const t = trimSjekklisteMalTekst(ny);
    if (!t || rows.some(function (item) { return trimSjekklisteMalTekst(item.t).toLowerCase() === t.toLowerCase(); })) return;
    setItems([...rows, { t: t, obligatorisk: nyObligatorisk, forhandsvalgt: nyForhandsvalgt }], true);
    setNy('');
  };

  const fjern = (idx) => setItems(rows.filter(function (_, i) { return i !== idx; }), true);

  const flytt = (idx, dir) => {
    const next = [...rows];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next, true);
  };

  return (
    <div className={compact ? '' : 'card settings-card'}>
      {!compact && (
        <div className="card-h"><span className="card-ht">Sjekkliste</span></div>
      )}
      <div style={{ padding: compact ? 0 : 16 }}>
        <div className="settings-list sjekkliste-mal-list">
          {rows.map(function (item, idx) {
            return (
              <div className="settings-item sjekkliste-mal-row" key={'sjekk-mal-' + idx + '-' + rows.length}>
                <input
                  className="settings-item__input sjekkliste-mal-input"
                  value={item.t}
                  onChange={(e) => endreTekst(idx, e.target.value)}
                  onBlur={(e) => avsluttTekstRedigering(idx, e.target.value)}
                  placeholder="F.eks. Vasket innvendig"
                />
                <select
                  className="sjekkliste-mal-type"
                  value={item.obligatorisk ? 'obligatorisk' : 'frivillig'}
                  onChange={(e) => endre(idx, { obligatorisk: e.target.value === 'obligatorisk' })}
                >
                  <option value="obligatorisk">Obligatorisk</option>
                  <option value="frivillig">Frivillig</option>
                </select>
                <label className="sjekkliste-mal-check" title="Krysses av automatisk når bilen kommer til denne statusen">
                  <input
                    type="checkbox"
                    checked={!!item.forhandsvalgt}
                    onChange={(e) => endre(idx, { forhandsvalgt: e.target.checked })}
                  />
                  <span>Valgt ved ankomst</span>
                </label>
                <div className="settings-item__actions">
                  <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, -1)} disabled={idx === 0}>↑</button>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, 1)} disabled={idx === rows.length - 1}>↓</button>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => fjern(idx)} disabled={!allowEmpty && rows.length <= 1}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="settings-add sjekkliste-mal-add">
          <input
            className="sjekkliste-mal-input"
            value={ny}
            onChange={e => setNy(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && leggTil()}
            placeholder={placeholder || 'Legg til punkt...'}
          />
          <select
            className="sjekkliste-mal-type"
            value={nyObligatorisk ? 'obligatorisk' : 'frivillig'}
            onChange={e => setNyObligatorisk(e.target.value === 'obligatorisk')}
          >
            <option value="obligatorisk">Obligatorisk</option>
            <option value="frivillig">Frivillig</option>
          </select>
          <label className="sjekkliste-mal-check">
            <input
              type="checkbox"
              checked={nyForhandsvalgt}
              onChange={e => setNyForhandsvalgt(e.target.checked)}
            />
            <span>Valgt ved ankomst</span>
          </label>
          <button type="button" className="btn btn-g btn-sm" onClick={leggTil}>+ Legg til</button>
        </div>
      </div>
    </div>
  );
}

function BilSjekklisterEditor({ statuser, farger, sjekklister, onChange }) {
  const [openStatus, setOpenStatus] = useState(null);

  const setItems = (status, items) => {
    onChange({ ...sjekklister, [status]: items });
  };

  return (
    <div className="card settings-card">
      <div className="card-h"><span className="card-ht">Sjekklister per pipeline-status</span></div>
      <div style={{ padding: 16 }}>
        <p className="settings-desc">
          Definer egne gjøremål for hver stasjon i bil-pipeline. Marker punkter som obligatoriske eller frivillige —
          fremdrift og oppgave-telling baseres kun på obligatoriske punkter. Kryss av «Valgt ved ankomst» for punkter
          som skal være ferdig når bilen flyttes til statusen.
        </p>
        <div className="sjekkliste-status-list">
          {(statuser || []).map(function (status) {
            const items = normalizeSjekklisteMalItems(sjekklister?.[status] || []);
            const open = openStatus === status;
            const color = (farger && farger[status]) || '#6B7280';
            const obligCount = items.filter(function (item) { return item.obligatorisk; }).length;
            return (
              <div key={status} className="sjekkliste-status-block">
                <button
                  type="button"
                  onClick={() => setOpenStatus(open ? null : status)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--s2)',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <strong style={{ fontSize: 13, color: 'var(--t1)' }}>{status}</strong>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                      {items.length} punkt{items.length === 1 ? '' : 'er'} · {obligCount} oblig.
                    </span>
                  </span>
                  <span style={{ color: 'var(--t3)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                  <div style={{ padding: 14, borderTop: '1px solid var(--b2)' }}>
                    <SjekklisteMalEditor
                      items={sjekklister?.[status] || []}
                      onChange={v => setItems(status, v)}
                      placeholder="F.eks. Vasket innvendig"
                      allowEmpty
                      compact
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SelectListEditor({ title, desc, items, onChange, placeholder, selectLabel }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [ny, setNy] = useState('');

  const safeIdx = items.length ? Math.min(selectedIdx, items.length - 1) : 0;

  const endre = (idx, value) => {
    if (items.some(function (item, i) {
      return i !== idx && item.toLowerCase() === value.toLowerCase();
    })) return;
    const next = [...items];
    next[idx] = value;
    onChange(next);
  };

  const leggTil = () => {
    const v = ny.trim();
    if (!v || items.some(item => item.toLowerCase() === v.toLowerCase())) return;
    onChange([...items, v]);
    setSelectedIdx(items.length);
    setNy('');
  };

  const fjern = () => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== safeIdx));
    setSelectedIdx(Math.max(0, safeIdx - 1));
  };

  const flytt = (dir) => {
    const target = safeIdx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[safeIdx], next[target]] = [next[target], next[safeIdx]];
    onChange(next);
    setSelectedIdx(target);
  };

  return (
    <div className="card settings-card">
      <div className="card-h"><span className="card-ht">{title}</span></div>
      <div className="settings-compact">
        {desc && <p className="settings-desc">{desc}</p>}
        <div className="fl">{selectLabel || 'Velg i listen'}</div>
        <select
          className="settings-select"
          value={String(safeIdx)}
          onChange={e => setSelectedIdx(Number(e.target.value))}
          disabled={!items.length}
        >
          {items.length ? items.map(function (item, idx) {
            return <option key={'merke-' + idx} value={idx}>{item}</option>;
          }) : (
            <option value="0">Ingen registrert</option>
          )}
        </select>
        {items.length > 0 && (
          <div className="settings-select-tools">
            <input
              className="settings-item__input"
              value={items[safeIdx] || ''}
              onChange={e => endre(safeIdx, e.target.value)}
            />
            <div className="settings-item__actions">
              <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(-1)} disabled={safeIdx === 0}>↑</button>
              <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(1)} disabled={safeIdx === items.length - 1}>↓</button>
              <button type="button" className="btn btn-g btn-sm" onClick={fjern} disabled={items.length <= 1}>✕</button>
            </div>
          </div>
        )}
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

function ListEditor({ title, desc, items, onChange, placeholder, allowEmpty, compact }) {
  const [ny, setNy] = useState('');

  const endre = (idx, value) => {
    if (items.some(function (item, i) {
      return i !== idx && item.toLowerCase() === value.toLowerCase();
    })) return;
    const next = [...items];
    next[idx] = value;
    onChange(next);
  };

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
    <div className={compact ? '' : 'card settings-card'}>
      {!compact && (
        <div className="card-h"><span className="card-ht">{title}</span></div>
      )}
      <div style={{ padding: compact ? 0 : 16 }}>
        {desc && <p className="settings-desc">{desc}</p>}
        <div className="settings-list">
          {items.map((item, idx) => (
            <div className="settings-item" key={'list-row-' + idx}>
              <input
                className="settings-item__input"
                value={item}
                onChange={(e) => endre(idx, e.target.value)}
              />
              <div className="settings-item__actions">
                <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, -1)} disabled={idx === 0}>↑</button>
                <button type="button" className="btn btn-g btn-sm" onClick={() => flytt(idx, 1)} disabled={idx === items.length - 1}>↓</button>
                <button type="button" className="btn btn-g btn-sm" onClick={() => fjern(idx)} disabled={!allowEmpty && items.length <= 1}>✕</button>
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

function KontoPassordSection({ currentUser, visTost }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const lagre = async function () {
    if (!currentPassword) {
      visTost('Skriv inn nåværende passord ✗');
      return;
    }
    if (newPassword.length < 6) {
      visTost('Nytt passord må være minst 6 tegn ✗');
      return;
    }
    if (newPassword !== confirmPassword) {
      visTost('Nytt passord stemmer ikke overens ✗');
      return;
    }
    setSaving(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      visTost('Passord oppdatert ✓');
    } catch (err) {
      visTost(err.message || 'Kunne ikke endre passord ✗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card section-wrap konto-passord">
      <div className="card-h">
        <div>
          <span className="card-ht">Min konto</span>
          <div className="settings-desc" style={{ marginBottom: 0, marginTop: 4 }}>
            Endre passordet for {currentUser?.name || currentUser?.username || 'din konto'}.
          </div>
        </div>
      </div>
      <div className="konto-passord__body">
        <div className="konto-passord__meta">
          <div><span className="fl">Brukernavn</span><div className="fv">{currentUser?.username || '—'}</div></div>
          <div><span className="fl">Rolle</span><div className="fv">{displayRole(currentUser?.role)}</div></div>
        </div>
        <div className="konto-passord__grid">
          <div>
            <div className="fl">Nåværende passord</div>
            <input
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              disabled={saving}
              onChange={function (e) { setCurrentPassword(e.target.value); }}
            />
          </div>
          <div>
            <div className="fl">Nytt passord</div>
            <input
              type="password"
              value={newPassword}
              autoComplete="new-password"
              disabled={saving}
              onChange={function (e) { setNewPassword(e.target.value); }}
            />
          </div>
          <div>
            <div className="fl">Bekreft nytt passord</div>
            <input
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              disabled={saving}
              onChange={function (e) { setConfirmPassword(e.target.value); }}
            />
          </div>
        </div>
        <div className="konto-passord__foot">
          <button type="button" className="btn btn-p btn-sm" disabled={saving} onClick={lagre}>
            {saving ? 'Lagrer…' : 'Lagre nytt passord'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InnstillingerView({ settings, biler, currentUser, onSave, onModulOppsettChange, onVedlikeholdChange, onStatusChange, visTost }) {
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState('konto');
  const bilerSnapshotRef = useRef(biler);

  useEffect(function () {
    bilerSnapshotRef.current = biler;
  }, [biler]);

  useEffect(function () {
    const snapshot = bilerSnapshotRef.current;
    const merged = snapshot?.length
      ? mergeOrphanSjekklisteItemsIntoMal(
          settings.bilSjekklister,
          snapshot,
          settings.bilStatuser
        )
      : settings.bilSjekklister;
    setDraft({ ...settings, bilSjekklister: merged });
  }, [settings]);

  const setList = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));
  const showBrukere = canAccess(currentUser, 'brukere');
  const showInnstillinger = canAccess(currentUser, 'innstillinger');
  const showVedlikehold = canViewVedlikehold(currentUser);

  const settingsTabs = useMemo(function () {
    const tabs = [{ id: 'konto', label: 'Konto' }];
    if (showInnstillinger) {
      tabs.push(
        { id: 'lister', label: 'Lister' },
        { id: 'biler', label: 'Biler' },
        { id: 'statuser', label: 'Statuser' },
        { id: 'moduler', label: 'Moduler' },
        { id: 'epost', label: 'E-post' }
      );
    }
    if (showBrukere) tabs.push({ id: 'brukere', label: 'Brukere' });
    return tabs;
  }, [showInnstillinger, showBrukere]);

  useEffect(function () {
    if (!settingsTabs.some(function (tab) { return tab.id === section; })) {
      setSection(settingsTabs[0]?.id || 'konto');
    }
  }, [settingsTabs, section]);

  const sectionSubtitles = {
    konto: showVedlikehold
      ? 'Passord og nettside vedlikehold'
      : 'Endre passord for din bruker',
    lister: 'Ansvarlige, bilmerker og kalendertyper',
    biler: 'Pipeline-statuser og sjekklister per stasjon',
    statuser: 'Statuser og farger for kontaktskjema og innbytte',
    moduler: 'Menyoppsett og moduler i CRM',
    epost: 'Mailkontoer, tilbudmaler og innboksmaler',
    brukere: 'Brukere, roller og tilganger'
  };

  const lagreModulOppsett = async (modulOppsett) => {
    const res = await patchInnstillinger({ modulOppsett });
    if (res.settings) {
      setDraft(function (prev) { return { ...prev, modulOppsett: res.settings.modulOppsett }; });
    }
    return res;
  };

  const lagreVedlikehold = async (vedlikeholdModus) => {
    const res = await patchInnstillinger({ vedlikeholdModus });
    if (res.settings) {
      setDraft(function (prev) {
        return { ...prev, vedlikeholdModus: res.settings.vedlikeholdModus };
      });
      if (onVedlikeholdChange) onVedlikeholdChange(res.settings.vedlikeholdModus);
    }
    return res;
  };

  const lagreLister = function () {
    onSave({
      ...draft,
      bilSjekklister: Object.fromEntries(
        Object.entries(draft.bilSjekklister || {}).map(function ([status, rows]) {
          return [status, finalizeSjekklisteMalItems(rows)];
        })
      )
    });
  };

  const showLagreLister = showInnstillinger && ['lister', 'biler', 'statuser'].includes(section);

  return (
    <>
      <div className="ph">
        <div>
          <div className="ph-title">Innstillinger</div>
          <div className="ph-sub">{sectionSubtitles[section] || 'Systemoppsett'}</div>
        </div>
        {showLagreLister && (
          <button type="button" className="btn btn-p" onClick={lagreLister}>Lagre endringer</button>
        )}
      </div>

      <div className="settings-subnav">
        {settingsTabs.map(function (tab) {
          return (
            <button
              key={tab.id}
              type="button"
              className={'settings-subnav__btn' + (section === tab.id ? ' on' : '')}
              onClick={function () { setSection(tab.id); }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {section === 'konto' && (
        <div className="settings-stack">
          <KontoPassordSection currentUser={currentUser} visTost={visTost} />
          {showVedlikehold && (
            <VedlikeholdSection
              vedlikeholdModus={draft.vedlikeholdModus}
              readOnly={!canToggleVedlikehold(currentUser)}
              onSave={lagreVedlikehold}
              visTost={visTost}
            />
          )}
        </div>
      )}

      {section === 'lister' && showInnstillinger && (
        <div className="settings-grid">
          <ListEditor
            title="Ansvarlige"
            desc="Vises i nedtrekkslister for biler, kontaktskjema, innbytte og kalender."
            items={draft.ansatte}
            onChange={v => setList('ansatte', v)}
            placeholder="Navn på ansatt"
          />
          <SelectListEditor
            title="Bilmerker"
            desc="Brukes ved registrering og filtrering av biler."
            items={draft.merker}
            onChange={v => setList('merker', v)}
            placeholder="F.eks. Porsche"
            selectLabel="Velg merke"
          />
          <ListEditor
            title="Kalendertyper"
            items={draft.kalTyper}
            onChange={v => setList('kalTyper', v)}
            placeholder="F.eks. Møte"
          />
        </div>
      )}

      {section === 'biler' && showInnstillinger && (
        <div className="settings-panel">
          <div className="settings-grid">
            <StatusListEditor
              title="Bilstatuser og farger"
              desc="Pipeline-stasjoner for biler på lager. Rekkefølge styrer kanban og listevisning."
              statuser={draft.bilStatuser}
              farger={draft.bilStatusFarger || DEFAULT_BIL_STATUS_FARGER}
              onChange={(statuser, farger) => setDraft(prev => ({
                ...prev,
                bilStatuser: statuser,
                bilStatusFarger: farger,
                bilSjekklister: normalizeBilSjekklister(statuser, prev.bilSjekklister, prev.sjekklisteMal)
              }))}
              placeholder="F.eks. Klargjøring"
              defaultColors={DEFAULT_BIL_STATUS_FARGER}
              normalizeColors={normalizeBilStatusFarger}
            />
          </div>
          <BilSjekklisterEditor
            statuser={draft.bilStatuser || []}
            farger={draft.bilStatusFarger || DEFAULT_BIL_STATUS_FARGER}
            sjekklister={draft.bilSjekklister || DEFAULT_BIL_SJEKKLISTER}
            onChange={v => setDraft(prev => ({ ...prev, bilSjekklister: v }))}
          />
        </div>
      )}

      {section === 'statuser' && showInnstillinger && (
        <div className="settings-grid">
          <StatusListEditor
            title="Kontaktskjemastatuser og farger"
            desc="Legg til statuser og velg farge for hver. Brukes i kontaktskjema-listen og filtre."
            statuser={draft.henvStatuser}
            farger={draft.henvStatusFarger || DEFAULT_HENV_STATUS_FARGER}
            onChange={(statuser, farger) => setDraft(prev => ({
              ...prev,
              henvStatuser: statuser,
              henvStatusFarger: farger
            }))}
            placeholder="F.eks. Oppfølging"
          />
          <StatusListEditor
            title="Innbytte-statuser og farger"
            desc="Legg til statuser og velg farge for hver. Brukes i innbytteoversikten og filtre."
            statuser={draft.innbytteStatuser}
            farger={draft.innbytteStatusFarger || DEFAULT_INNBYTTE_STATUS_FARGER}
            onChange={(statuser, farger) => setDraft(prev => ({
              ...prev,
              innbytteStatuser: statuser,
              innbytteStatusFarger: farger
            }))}
            placeholder="F.eks. Vurderes"
            defaultColors={DEFAULT_INNBYTTE_STATUS_FARGER}
            normalizeColors={normalizeInnbytteStatusFarger}
          />
        </div>
      )}

      {section === 'moduler' && showInnstillinger && (
        <ModulOppsettSection
          modulOppsett={draft.modulOppsett}
          onChange={onModulOppsettChange}
          onSave={lagreModulOppsett}
          visTost={visTost}
        />
      )}

      {section === 'epost' && showInnstillinger && (
        <div className="settings-stack">
          <MailKontoerSection onStatusChange={onStatusChange} visTost={visTost} />
          <TilbudEpostMalerSection
            maler={draft.tilbudEpostMaler}
            onChange={(v) => setDraft(function (prev) { return { ...prev, tilbudEpostMaler: v }; })}
            onSave={(tilbudEpostMaler) => onSave({ tilbudEpostMaler })}
            visTost={visTost}
          />
          <EpostMalerSection visTost={visTost} />
        </div>
      )}

      {section === 'brukere' && showBrukere && (
        <BrukereSection currentUser={currentUser} visTost={visTost} />
      )}
    </>
  );
}
