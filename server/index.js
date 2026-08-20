'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

const {
  prepare,
  execAsync,
  transaction,
  isPostgres,
  dbReady,
  syncPostgresSequences,
  mapHenv,
  mergeHenvKommentarer,
  createInternKommentar,
  normalizeHenvKommentarer,
  mapInnbytte,
  mapSelgBil,
  mapBil,
  mapKal,
  mapInnkjopskalkyle,
  calcInnkjopsprisRow,
  mapEpost,
  getInnstillinger,
  saveInnstillinger,
  getLister,
  getVedlikeholdModus,
  getMailKontoer,
  getMailKontoById,
  createMailKonto,
  updateMailKonto,
  deleteMailKonto,
  countUlestEpost,
  countNyeInnkommendeEpost,
  listNyeInnkommendeEpost,
  listUlestEpost,
  listUlestEpostPreview,
  getEpostUtkastList,
  getEpostUtkastById,
  countEpostUtkast,
  saveEpostUtkast,
  deleteEpostUtkast,
  getEpostMaler,
  getEpostMalById,
  createEpostMal,
  updateEpostMal,
  deleteEpostMal,
  getUserById,
  getUserByUsername,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getPermissionDefs,
  getRoleTemplates,
  PASS_MASK,
  findKundeIdByEpost,
  linkInboundEpostToKunde,
  mapKunde,
  getKunder,
  getKundeById,
  getKundeAktivitet,
  createKunde,
  updateKunde,
  deleteKunde,
  getAllBilKundeIdsMap,
  setBilKunder,
  nextBilSortOrder,
  reorderBiler,
  syncAllBilerSjekklisterFromMal,
  ensureSjekklisterForStatus,
  parseBilSjekklisterObject,
  getAktivSjekklisteFromRow,
  harApneObligatoriskeOppgaver,
  sjekklisteFraMalServer,
  parseJson,
  normalizeBilTilstandsrapport,
  DEFAULT_BIL_TILSTANDSRAPPORT,
  normalizeBilArsprovekjennemerke,
  DEFAULT_BIL_ARSPROVEKJENNEMERKE
} = require('./db');
const { canDeleteBil, canAddBil, resolveRoleKey, permissionDefsWithModulLabels, summarizeBilTilstandsrapportDashboard } = require('./db-shared');
const {
  nowOsloDate,
  nowOsloTime,
  parsePauser,
  calcTimeregStats,
  mapTimeregistreringRow,
  weekStartIso,
  addDaysIso,
  canViewAllTimereg,
  canApproveTimereg,
  maskTimeregStatusForViewer
} = require('./timeregistrering-shared');
const { readChassisWithOpenAI, getOpenAiApiKey } = require('./chassis-vision');

const {
  lookupVehicleFull,
  lookupVehicleFullByUnderstell,
  nesteEuKontrollIso,
  resolveVehicleFromStoredSvvData,
  toIsoDateFromNorwegian
} = require('./vegvesen');
const { enrichIngestVehicleBody, ingestVehicleDbFields } = require('./ingest-vehicle');
const { isConfigured: isOmregConfigured, lookupOmregistreringsavgift } = require('./skatteetaten-omreg');
const { lookupFinnAnnonse, resolveFinnMarkedsSok } = require('./finn');
const { getMailStatus, syncInbox, sendMail, testMailKonto, startBackgroundMailSync } = require('./mail');
const { accountImapReady } = require('./mail-utils');
const {
  getMailMapperForKonto,
  getMailMappeById,
  mapEpostVedlegg,
  getEpostVedlegg,
  getEpostVedleggById,
  updateMappeCounts,
  ensureStandardVirtualFolders,
  updateAllMappeCountsForKonto
} = require('./mail-folders');
const {
  createImapFolder,
  moveMessageOnServer,
  setMessageSeenOnServer,
  deleteMessageOnServer,
  refreshFoldersFromImap
} = require('./mail-sync');
const { createPreviewToken, PREVIEW_TTL_MS } = require('./preview-access');
const { getSiteOrigin } = require('./site-origin');
const { runMailSyncCron } = require('./cron-mail-sync');
const { getDashboardCache, setDashboardCache } = require('./dashboard-cache');
const {
  UPLOADS_DIR,
  isRemoteStorageEnabled,
  ensureBucket,
  makeFilename,
  toUploadPath,
  saveBase64DataUrl,
  persistMulterFile,
  deleteUpload,
  openUpload
} = require('./storage');

async function mapEpostRowsWithVedlegg(rows) {
  if (!rows.length) return [];
  const ids = rows.map(function (row) { return Number(row.id); });
  const placeholders = ids.map(function () { return '?'; }).join(',');
  const vedleggRows = await prepare(`
    SELECT * FROM epost_vedlegg WHERE epost_id IN (${placeholders}) ORDER BY id ASC
  `).all(...ids);
  const byEpostId = {};
  vedleggRows.forEach(function (row) {
    const mapped = mapEpostVedlegg(row);
    if (!mapped) return;
    if (!byEpostId[mapped.epostId]) byEpostId[mapped.epostId] = [];
    byEpostId[mapped.epostId].push(mapped);
  });
  return rows.map(function (row) {
    return mapEpost(row, byEpostId[row.id] || []);
  });
}

function mapEpostPreviewRows(rows) {
  return (rows || []).map(function (row) {
    const mapped = mapEpost(row, []);
    mapped.innhold = '';
    mapped.innholdHtml = '';
    return mapped;
  });
}

function epostSnippetFromPreview(innhold, innholdHtml) {
  const plain = String(innhold || '').trim();
  if (plain) {
    return plain.replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  return String(innholdHtml || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function mapEpostListRow(row) {
  const mapped = mapEpost({
    ...row,
    innhold: '',
    innhold_html: ''
  }, []);
  mapped.snippet = epostSnippetFromPreview(row.innhold_preview, row.innhold_html_preview);
  mapped.innhold = '';
  mapped.innholdHtml = '';
  return mapped;
}

function mapEpostListRows(rows) {
  return (rows || []).map(mapEpostListRow);
}

const INNBOKS_LIST_SELECT = `
  e.id, e.konto_id, e.mappe_id, e.message_id, e.thread_id, e.in_reply_to,
  e.retning, e.fra_navn, e.fra_epost, e.til_epost, e.emne,
  e.lest, e.flagged, e.slettet, e.henvendelse_id, e.status, e.ansvarlig, e.kunde_id,
  e.mottatt_dato, e.created_at,
  SUBSTR(COALESCE(e.innhold, ''), 1, 400) AS innhold_preview,
  SUBSTR(COALESCE(e.innhold_html, ''), 1, 800) AS innhold_html_preview
`;

async function waitForDbReady(maxMs) {
  const timeoutMs = Number(maxMs || 8000);
  await Promise.race([
    dbReady,
    new Promise(function (resolve) { setTimeout(resolve, timeoutMs); })
  ]);
}

async function getEpostRowById(id) {
  return prepare(`
    SELECT e.*, k.navn AS konto_navn, k.epost AS konto_epost,
      m.navn AS mappe_navn, m.mappe_type AS mappe_type, m.imap_path AS mappe_imap_path
    FROM eposter e
    LEFT JOIN mail_kontoer k ON k.id = e.konto_id
    LEFT JOIN mail_mapper m ON m.id = e.mappe_id
    WHERE e.id = ?
  `).get(Number(id));
}

async function resolveMappeForEpostRow(row) {
  if (!row) return null;
  if (row.mappe_id) {
    const mappe = await getMailMappeById(row.mappe_id);
    if (mappe) return mappe;
  }
  if (!row.konto_id) return null;
  const mapper = await getMailMapperForKonto(row.konto_id);
  if (row.retning === 'inn') {
    return mapper.find(function (m) { return m.mappeType === 'inbox'; }) || null;
  }
  if (row.retning === 'ut') {
    return mapper.find(function (m) { return m.mappeType === 'sent'; }) || null;
  }
  return null;
}

async function refreshMappeCountsForEpostRow(row) {
  const mappe = await resolveMappeForEpostRow(row);
  if (mappe?.id) {
    await updateMappeCounts(mappe.id);
    return;
  }
  if (row?.konto_id) {
    await updateAllMappeCountsForKonto(row.konto_id);
  }
}

process.on('unhandledRejection', function (reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error('[admin] Ubehandlet promise-feil:', message);
});

let httpServer = null;

function shutdown(signal) {
  console.log('[admin] Mottok ' + signal + ' – avslutter …');
  if (httpServer) {
    httpServer.close(function () {
      process.exit(0);
    });
    setTimeout(function () { process.exit(0); }, 5000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });

const app = express();
const PORT = process.env.PORT || 8090;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const INGEST_SECRET = process.env.INGEST_SECRET || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PUBLIC_SITE_ORIGIN = getSiteOrigin();
const isProd = process.env.NODE_ENV === 'production';
const isVercel = !!process.env.VERCEL;
const clientDist = path.join(__dirname, '..', 'client', 'dist');

function buildCorsOrigins() {
  const origins = new Set([
    PUBLIC_SITE_ORIGIN,
    process.env.ADMIN_PUBLIC_URL,
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
  ].filter(Boolean));

  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  }

  const extra = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(function (item) { return item.trim(); })
    .filter(Boolean);
  extra.forEach(function (item) { origins.add(item); });

  return [...origins];
}

app.use(cors({
  origin: isProd
    ? buildCorsOrigins()
    : true,
  credentials: true
}));

app.use(function (req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    req.body = {};
    return next();
  }
  return express.json({ limit: '25mb' })(req, res, next);
});

app.get('/api/health', function (_req, res) {
  res.json({
    ok: true,
    service: 'x-bilsenter-admin',
    useSupabase: process.env.USE_SUPABASE === 'true',
    databaseConfigured: !!(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)
  });
});

const upload = multer({
  storage: (isRemoteStorageEnabled() || isVercel)
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: function (_req, _file, cb) {
          cb(null, UPLOADS_DIR);
        },
        filename: function (_req, file, cb) {
          cb(null, makeFilename(file.originalname));
        }
      }),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 }
});

async function cleanupRemovedUploadFiles(oldFiles, newFiles) {
  if (!Array.isArray(oldFiles) || !Array.isArray(newFiles)) return;
  const keepPaths = new Set(newFiles.map(function (file) { return file?.path; }).filter(Boolean));
  for (const file of oldFiles) {
    const filePath = String(file?.path || '');
    if (!filePath || keepPaths.has(filePath)) continue;
    try {
      await deleteUpload(filePath);
    } catch (_err) {
      /* Ignorer fil-feil */
    }
  }
}

function mapUploadedFiles(files, user) {
  return (files || []).map(function (file) {
    const filename = file.filename || path.basename(file.path || '');
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.originalname || filename || 'fil',
      path: file.path || toUploadPath(filename),
      size: file.size || 0,
      type: file.mimetype || file.type || '',
      uploadedAt: new Date().toISOString(),
      uploadedBy: user?.name || user?.username || 'Ukjent'
    };
  });
}

async function persistMulterFiles(files) {
  const saved = [];
  for (const file of files || []) {
    const persisted = await persistMulterFile(file);
    if (persisted) saved.push(persisted);
  }
  return saved;
}

async function touch(table, id) {
  await prepare(`UPDATE ${table} SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Ikke innlogget.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Ugyldig eller utløpt sesjon.' });
  }
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

function requirePermission(permission) {
  return function (req, res, next) {
    if (hasPermission(req.user, permission)) return next();
    return res.status(403).json({ ok: false, error: 'Ingen tilgang.' });
  };
}

function formatUserResponse(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email || '',
    role: user.role,
    permissions: user.permissions || [],
    isAdmin: !!user.isAdmin,
    aktiv: user.aktiv !== false,
    timelonn: Number(user.timelonn) || 0
  };
}

function mapTimeregLive(row, viewer) {
  const item = maskTimeregStatusForViewer(mapTimeregistreringRow(row), viewer);
  if (!item) return null;
  if (item.status === 'aktiv' || item.status === 'pause') {
    item.stats = calcTimeregStats(item, nowOsloTime());
  }
  return item;
}

function resolveTimeregUserId(req, queryUserId) {
  const selfId = Number(req.user.sub);
  const requested = Number(queryUserId);
  if (requested && canViewAllTimereg(req.user)) return requested;
  return selfId;
}

async function getTimeregRow(id) {
  return prepare('SELECT * FROM timeregistrering WHERE id = ?').get(Number(id));
}

async function assertTimeregAccess(req, row) {
  if (!row) return false;
  if (Number(row.user_id) === Number(req.user.sub)) return true;
  return canViewAllTimereg(req.user);
}

async function getAnsvarligNavn(req) {
  const fromToken = String(req.user?.name || '').trim();
  if (fromToken) return fromToken;
  const user = await getUserById(req.user?.sub);
  return String(user?.name || user?.username || '').trim();
}

async function resolveModulAnsvarlig(req, body) {
  if (body && body.ansvarlig !== undefined) return body.ansvarlig;
  const auto = await getAnsvarligNavn(req);
  return auto || null;
}

async function resolveBilAnsvarlig(req, body) {
  return resolveModulAnsvarlig(req, body);
}

async function resolveInnbytteStatus(key) {
  const statuser = (await getInnstillinger()).innbytteStatuser || [];
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return String(key || '').trim();
  const match = statuser.find(function (s) {
    return String(s || '').trim().toLowerCase() === normalized;
  });
  return match || String(key || '').trim();
}

async function resolveSelgBilStatus(key) {
  return resolveInnbytteStatus(key);
}

async function saveIngestBilder(bilderMeta) {
  const savedFiles = [];
  const items = Array.isArray(bilderMeta) ? bilderMeta : [];

  for (let i = 0; i < items.length; i += 1) {
    const file = items[i];
    if (!file || !file.data) continue;
    const saved = await saveBase64DataUrl(file.data, {
      name: file.name,
      index: i
    });
    if (saved) savedFiles.push(saved);
  }

  return savedFiles;
}

async function insertInnbytteRow(b, savedFiles) {
  const enriched = await enrichIngestVehicleBody(b);
  const utstyr = Array.isArray(enriched.utstyr) ? enriched.utstyr : [];
  const vehicle = ingestVehicleDbFields(enriched);
  return prepare(`
    INSERT INTO innbytte (
      navn, epost, tlf, regnr, merke, modell, arsmodell, drivstoff, farge, kjoretoy_type,
      hjuldrift, effekt_hk, effekt_kw, siste_eu_kontroll, neste_eu_kontroll,
      forstegangsregistrert, antall_motorer, rekkevidde, bruktimport, motorer, kilometerstand,
      servicehistorikk, siste_service, utstyr, sommerdekk, vinterdekk, forventning,
      kommentar, finn_kode, bilder, kunde_id
    ) VALUES (
      @navn, @epost, @tlf, @regnr, @merke, @modell, @arsmodell, @drivstoff, @farge, @kjoretoy_type,
      @hjuldrift, @effekt_hk, @effekt_kw, @siste_eu_kontroll, @neste_eu_kontroll,
      @forstegangsregistrert, @antall_motorer, @rekkevidde, @bruktimport, @motorer, @kilometerstand,
      @servicehistorikk, @siste_service, @utstyr, @sommerdekk, @vinterdekk, @forventning,
      @kommentar, @finn_kode, @bilder, @kunde_id
    )
  `).run({
    navn: enriched.navn,
    epost: enriched.epost,
    tlf: enriched.mobil || enriched.tlf || '',
    regnr: String(enriched.regnr).toUpperCase(),
    merke: enriched.merke || '',
    modell: enriched.modell || '',
    arsmodell: enriched.arsmodell || '',
    drivstoff: enriched.drivstoff || '',
    kjoretoy_type: enriched.kjoretoyType || '',
    kilometerstand: enriched.kilometerstand || '',
    servicehistorikk: enriched.servicehistorikk || '',
    siste_service: enriched.sisteService || '',
    utstyr: JSON.stringify(utstyr),
    sommerdekk: enriched.sommerdekk || '',
    vinterdekk: enriched.vinterdekk || '',
    forventning: enriched.forventning || '',
    kommentar: enriched.kommentar || '',
    finn_kode: enriched.finnKode || '',
    bilder: JSON.stringify(savedFiles),
    kunde_id: null,
    ...vehicle
  });
}

async function insertSelgBilRow(b, savedFiles) {
  const enriched = await enrichIngestVehicleBody(b);
  const utstyr = Array.isArray(enriched.utstyr) ? enriched.utstyr : [];
  const vehicle = ingestVehicleDbFields(enriched);
  return prepare(`
    INSERT INTO selg_bil (
      navn, epost, tlf, regnr, merke, modell, arsmodell, drivstoff, farge, kjoretoy_type,
      hjuldrift, effekt_hk, effekt_kw, siste_eu_kontroll, neste_eu_kontroll,
      forstegangsregistrert, antall_motorer, rekkevidde, bruktimport, motorer, kilometerstand,
      servicehistorikk, siste_service, utstyr, sommerdekk, vinterdekk, forventning,
      kommentar, bilder, kunde_id
    ) VALUES (
      @navn, @epost, @tlf, @regnr, @merke, @modell, @arsmodell, @drivstoff, @farge, @kjoretoy_type,
      @hjuldrift, @effekt_hk, @effekt_kw, @siste_eu_kontroll, @neste_eu_kontroll,
      @forstegangsregistrert, @antall_motorer, @rekkevidde, @bruktimport, @motorer, @kilometerstand,
      @servicehistorikk, @siste_service, @utstyr, @sommerdekk, @vinterdekk, @forventning,
      @kommentar, @bilder, @kunde_id
    )
  `).run({
    navn: enriched.navn,
    epost: enriched.epost,
    tlf: enriched.mobil || enriched.tlf || '',
    regnr: String(enriched.regnr).toUpperCase(),
    merke: enriched.merke || '',
    modell: enriched.modell || '',
    arsmodell: enriched.arsmodell || '',
    drivstoff: enriched.drivstoff || '',
    kjoretoy_type: enriched.kjoretoyType || '',
    kilometerstand: enriched.kilometerstand || '',
    servicehistorikk: enriched.servicehistorikk || '',
    siste_service: enriched.sisteService || '',
    utstyr: JSON.stringify(utstyr),
    sommerdekk: enriched.sommerdekk || '',
    vinterdekk: enriched.vinterdekk || '',
    forventning: enriched.forventning || '',
    kommentar: enriched.kommentar || '',
    bilder: JSON.stringify(savedFiles),
    kunde_id: null,
    ...vehicle
  });
}

function signToken(user) {
  return jwt.sign({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions: user.permissions || [],
    isAdmin: !!user.isAdmin
  }, JWT_SECRET, { expiresIn: '7d' });
}

function requireIngest(req, res, next) {
  const key = req.headers['x-ingest-key'] || req.headers['x-api-key'] || '';
  if (!INGEST_SECRET || key !== INGEST_SECRET) {
    return res.status(403).json({ ok: false, error: 'Ugyldig ingest-nøkkel.' });
  }
  next();
}

// ─── Auth ───
app.post('/api/auth/login', async function (req, res) {
  const { username, password } = req.body || {};
  const user = await getUserByUsername(username, true);
  if (!user || !user.aktiv) {
    return res.status(401).json({ ok: false, error: 'Feil brukernavn eller passord.' });
  }

  try {
    const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Feil brukernavn eller passord.' });
    }
  } catch {
    return res.status(401).json({ ok: false, error: 'Feil brukernavn eller passord.' });
  }

  const safeUser = await getUserById(user.id);
  const token = signToken(safeUser);
  res.json({ ok: true, token, user: formatUserResponse(safeUser) });
});

app.get('/api/auth/me', requireAuth, async function (req, res) {
  const user = await getUserById(req.user.sub);
  if (!user || !user.aktiv) {
    return res.status(401).json({ ok: false, error: 'Ugyldig sesjon.' });
  }
  res.json({ ok: true, user: formatUserResponse(user) });
});

app.patch('/api/me/password', requireAuth, async function (req, res) {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'Nytt passord må være minst 6 tegn.' });
  }

  const user = await getUserById(req.user.sub, true);
  if (!user || !user.aktiv) {
    return res.status(401).json({ ok: false, error: 'Ugyldig sesjon.' });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash || '');
  if (!ok) {
    return res.status(401).json({ ok: false, error: 'Nåværende passord er feil.' });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await updateUser(Number(user.id), {}, hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke endre passord.' });
  }
});

// ─── Brukere ───
app.get('/api/brukere/meta', requireAuth, requirePermission('brukere'), async function (_req, res) {
  const settings = await getInnstillinger();
  res.json({
    ok: true,
    permissions: permissionDefsWithModulLabels(settings.modulOppsett),
    roleTemplates: getRoleTemplates()
  });
});

app.get('/api/brukere', requireAuth, requirePermission('brukere'), async function (_req, res) {
  res.json({ ok: true, items: await getUsers() });
});

app.post('/api/brukere', requireAuth, requirePermission('brukere'), async function (req, res) {
  try {
    const password = String(req.body?.password || '');
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Passord må være minst 6 tegn.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const item = await createUser(req.body || {}, hash);
    res.status(201).json({ ok: true, item: formatUserResponse(item) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke opprette bruker.' });
  }
});

app.patch('/api/brukere/:id', requireAuth, requirePermission('brukere'), async function (req, res) {
  try {
    let hash = null;
    if (req.body?.password) {
      const password = String(req.body.password);
      if (password.length < 6) {
        return res.status(400).json({ ok: false, error: 'Passord må være minst 6 tegn.' });
      }
      hash = await bcrypt.hash(password, 10);
    }
    const item = await updateUser(Number(req.params.id), req.body || {}, hash);
    if (!item) return res.status(404).json({ ok: false, error: 'Bruker ikke funnet.' });
    res.json({ ok: true, item: formatUserResponse(item) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke oppdatere bruker.' });
  }
});

app.delete('/api/brukere/:id', requireAuth, requirePermission('brukere'), async function (req, res) {
  try {
    const ok = await deleteUser(Number(req.params.id), req.user.sub);
    if (!ok) return res.status(404).json({ ok: false, error: 'Bruker ikke funnet.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke slette bruker.' });
  }
});

// ─── Dashboard ───
app.get('/api/drift/nettside', requireAuth, async function (_req, res) {
  const siteUrl = getSiteOrigin();
  const vedlikehold = await getVedlikeholdModus();
  const started = Date.now();
  let online = false;
  let responseMs = null;
  let httpStatus = null;
  let health = null;
  let error = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 8000);
    const response = await fetch(siteUrl + '/api/health', { signal: controller.signal });
    clearTimeout(timeout);
    responseMs = Date.now() - started;
    httpStatus = response.status;
    online = response.ok;
    if (response.ok) {
      health = await response.json();
    }
  } catch (err) {
    error = err.name === 'AbortError' ? 'Tidsavbrudd (8s)' : (err.message || 'Kunne ikke nå nettsiden');
    responseMs = Date.now() - started;
  }

  const vedlikeholdAktiv = vedlikehold.aktiv || !!(health && health.vedlikehold && health.vedlikehold.aktiv);
  let besokendeStatus = 'live';
  if (!online) besokendeStatus = 'nede';
  else if (vedlikeholdAktiv) besokendeStatus = 'vedlikehold';

  res.json({
    ok: true,
    status: {
      url: siteUrl,
      online,
      httpStatus,
      responseMs,
      error,
      vedlikeholdAktiv,
      vedlikeholdMelding: vedlikehold.melding,
      besokendeStatus,
      adminOk: health ? health.admin === 'ok' : null,
      finn: health ? health.finn : null,
      finnOrgId: health ? health.finnOrgId : null,
      checkedAt: new Date().toISOString()
    }
  });
});

app.get('/api/drift/preview-url', requireAuth, function (req, res) {
  if (!INGEST_SECRET) {
    return res.status(503).json({ ok: false, error: 'INGEST_SECRET er ikke konfigurert.' });
  }

  try {
    const siteUrl = getSiteOrigin();
    const token = createPreviewToken(req.user.sub);
    res.json({
      ok: true,
      url: `${siteUrl}/api/preview/enter?token=${encodeURIComponent(token)}`,
      expiresInHours: Math.round(PREVIEW_TTL_MS / (60 * 60 * 1000))
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke opprette forhåndsvisningslenke.' });
  }
});

app.post('/api/drift/finn-refresh', requireAuth, requirePermission('innstillinger'), async function (_req, res) {
  const siteUrl = getSiteOrigin();

  if (!INGEST_SECRET) {
    return res.status(503).json({
      ok: false,
      error: 'INGEST_SECRET er ikke konfigurert på admin-serveren.'
    });
  }

  try {
    const response = await fetch(siteUrl + '/api/biler/refresh', {
      method: 'POST',
      headers: {
        'X-Ingest-Key': INGEST_SECRET,
        Accept: 'application/json'
      }
    });

    const data = await response.json().catch(function () { return null; });

    if (!response.ok || !data || !data.ok) {
      return res.status(response.ok ? 502 : response.status).json({
        ok: false,
        error: (data && data.error) || 'Kunne ikke oppdatere FINN-lageret på nettsiden.'
      });
    }

    res.json({
      ok: true,
      total: data.total || 0,
      count: Array.isArray(data.cars) ? data.cars.length : 0,
      updatedAt: data.updatedAt || new Date().toISOString()
    });
  } catch (err) {
    console.error('POST /api/drift/finn-refresh feilet:', err.message);
    res.status(502).json({
      ok: false,
      error: 'Kunne ikke nå nettsideserveren for FINN-oppdatering.'
    });
  }
});

app.get('/api/dashboard', requireAuth, async function (_req, res) {
  const cached = getDashboardCache();
  if (cached?.includeEpostPreview) {
    return res.json(cached);
  }

  try {
    const payload = await buildDashboardPayload();
    setDashboardCache(payload);
    res.json(payload);
  } catch (err) {
    console.error('GET /api/dashboard feilet:', err.message);
    res.status(503).json({
      ok: false,
      error: 'Dashboard utilgjengelig midlertidig. Prøv igjen om litt.'
    });
  }
});

async function buildDashboardSummaryStats(options) {
  const includeEpostPreview = options?.includeEpostPreview !== false;
  await waitForDbReady(includeEpostPreview ? 4000 : 1500);

  const idag = new Date().toISOString().slice(0, 10);
  const [
    nyeHenvRow,
    nyeInnbytteRow,
    nyeSelgBilRow,
    paaLagerRow,
    reservertRow,
    iDagKalRow,
    ulestEpost,
    nyeInnkommendeEpost,
    ulestEpostRows,
    totaltKunderRow,
    tilstandsrapportRows
  ] = await Promise.all([
    prepare("SELECT COUNT(*) AS c FROM henvendelser WHERE status = 'Ny'").get(),
    prepare("SELECT COUNT(*) AS c FROM innbytte WHERE status = 'Ny'").get(),
    prepare("SELECT COUNT(*) AS c FROM selg_bil WHERE status = 'Ny'").get(),
    prepare("SELECT COUNT(*) AS c FROM biler WHERE archived = 0 AND status NOT IN ('Solgt')").get(),
    prepare("SELECT COUNT(*) AS c FROM biler WHERE archived = 0 AND status = 'Reservert'").get(),
    prepare('SELECT COUNT(*) AS c FROM kalender WHERE dato = ?').get(idag),
    countUlestEpost(),
    countNyeInnkommendeEpost(),
    includeEpostPreview ? listUlestEpostPreview(25) : Promise.resolve([]),
    prepare('SELECT COUNT(*) AS c FROM kunder').get(),
    prepare(`
      SELECT tilstandsrapport, status, archived FROM biler
      WHERE archived = 0 AND status NOT IN ('Solgt')
    `).all()
  ]);

  const ulestEpostListe = includeEpostPreview ? mapEpostPreviewRows(ulestEpostRows || []) : [];
  const trStats = summarizeBilTilstandsrapportDashboard(tilstandsrapportRows, function (raw) {
    return normalizeBilTilstandsrapport(parseJson(raw, null));
  });

  return {
    ok: true,
    includeEpostPreview,
    stats: {
      nyeHenv: Number(nyeHenvRow.c) || 0,
      nyeInnbytte: Number(nyeInnbytteRow.c) || 0,
      nyeSelgBil: Number(nyeSelgBilRow.c) || 0,
      paaLager: Number(paaLagerRow.c) || 0,
      reservert: Number(reservertRow.c) || 0,
      iDagKal: Number(iDagKalRow.c) || 0,
      ulestEpost: Number(ulestEpost) || 0,
      nyeInnkommendeEpost: Number(nyeInnkommendeEpost) || 0,
      ulestEpostListe,
      totaltKunder: Number(totaltKunderRow.c) || 0,
      manglerTilstandsrapport: trStats.manglerTilstandsrapport,
      nodvendigPaBil: trStats.nodvendigPaBil
    }
  };
}

async function buildDashboardPayload() {
  return buildDashboardSummaryStats({ includeEpostPreview: true });
}

app.get('/api/bootstrap', requireAuth, async function (req, res) {
  try {
    const cachedDash = getDashboardCache();
    const statsPromise = cachedDash?.includeEpostPreview
      ? Promise.resolve(cachedDash)
      : buildDashboardSummaryStats({ includeEpostPreview: true }).then(function (payload) {
        setDashboardCache(payload);
        return payload;
      });

    const [user, lists, mailStatus, statsPayload, henvNyRows, selgNyRows] = await Promise.all([
      getUserById(req.user.sub),
      getLister(),
      getMailStatus().catch(function () { return null; }),
      statsPromise,
      prepare("SELECT * FROM henvendelser WHERE status = 'Ny' ORDER BY created_at DESC LIMIT 40").all(),
      prepare("SELECT * FROM selg_bil WHERE status = 'Ny' ORDER BY created_at DESC LIMIT 40").all()
    ]);
    if (!user || !user.aktiv) {
      return res.status(401).json({ ok: false, error: 'Ugyldig sesjon.' });
    }

    res.json({
      ok: true,
      user: formatUserResponse(user),
      lists,
      stats: statsPayload?.stats || {},
      mailStatus: mailStatus || null,
      dashboardFeed: {
        henv: (henvNyRows || []).map(mapHenv),
        selgBil: (selgNyRows || []).map(mapSelgBil)
      }
    });
  } catch (err) {
    console.error('GET /api/bootstrap feilet:', err.message);
    res.status(503).json({
      ok: false,
      error: 'Kunne ikke starte driftssystemet. Prøv igjen om litt.'
    });
  }
});

// ─── Offentlig (nettside) ───
app.get('/api/public/status', async function (_req, res) {
  const started = Date.now();
  let database = 'ok';
  let databaseError = null;

  try {
    await prepare('SELECT 1 AS ok').get();
  } catch (err) {
    database = 'feil';
    databaseError = err.message || 'Databasefeil';
  }

  const siteUrl = getSiteOrigin();
  const vedlikehold = await getVedlikeholdModus();
  let nettside = {
    online: false,
    responseMs: null,
    status: 'nede',
    error: null
  };

  try {
    const pingStart = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 5000);
    const response = await fetch(siteUrl + '/api/health', { signal: controller.signal });
    clearTimeout(timeout);
    nettside.online = response.ok;
    nettside.responseMs = Date.now() - pingStart;
    if (response.ok) {
      const health = await response.json();
      const vedlikeholdAktiv = vedlikehold.aktiv || !!(health && health.vedlikehold && health.vedlikehold.aktiv);
      nettside.status = vedlikeholdAktiv ? 'vedlikehold' : 'live';
    }
  } catch (err) {
    nettside.error = err.name === 'AbortError' ? 'Tidsavbrudd' : (err.message || 'Utilgjengelig');
    nettside.status = 'nede';
  }

  const backendOk = database === 'ok';
  res.json({
    ok: true,
    status: {
      overall: backendOk ? 'ok' : 'feil',
      api: 'ok',
      database,
      databaseError,
      ingest: INGEST_SECRET ? 'ok' : 'av',
      nettside,
      checkedAt: new Date().toISOString(),
      responseMs: Date.now() - started
    }
  });
});

app.get('/api/public/vedlikehold', async function (_req, res) {
  const vedlikehold = await getVedlikeholdModus();
  res.json({
    ok: true,
    aktiv: vedlikehold.aktiv,
    melding: vedlikehold.melding
  });
});

app.get('/api/public/lager', async function (_req, res) {
  try {
    const [paaLagerRow, tilSalgsRow] = await Promise.all([
      prepare(`
        SELECT COUNT(*) AS c FROM biler
        WHERE archived = 0
          AND status NOT IN ('Solgt')
          AND UPPER(reg) NOT LIKE 'XB%'
      `).get(),
      prepare(`
        SELECT COUNT(*) AS c FROM biler
        WHERE archived = 0
          AND status IN ('Annonsert', 'Reservert')
          AND UPPER(reg) NOT LIKE 'XB%'
      `).get()
    ]);

    res.json({
      ok: true,
      antall: paaLagerRow.c,
      tilSalgs: tilSalgsRow.c,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('GET /api/public/lager feilet:', err.message);
    res.status(500).json({ ok: false, error: 'Kunne ikke hente lagertall.' });
  }
});

// ─── Ingest (fra nettside) ───
app.post('/api/ingest/henvendelse', requireIngest, async function (req, res) {
  const b = req.body || {};
  if (!b.navn || !b.epost || !b.emne) {
    return res.status(400).json({ ok: false, error: 'Navn, e-post og emne er påkrevd.' });
  }

  const info = await prepare(`
    INSERT INTO henvendelser (navn, epost, tlf, emne, melding, kilde, bil_ref, kunde_id)
    VALUES (@navn, @epost, @tlf, @emne, @melding, @kilde, @bil_ref, @kunde_id)
  `).run({
    navn: b.navn,
    epost: b.epost,
    tlf: b.tlf || '',
    emne: b.emne,
    melding: b.melding || '',
    kilde: b.kilde || 'Nettside',
    bil_ref: b.bilRef || '',
    kunde_id: await findKundeIdByEpost(b.epost),
  });

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

app.post('/api/ingest/innbytte', requireIngest, upload.array('bilder', 12), async function (req, res) {
  const b = req.body || {};
  if (!b.regnr || !b.navn || !b.epost || !b.mobil) {
    return res.status(400).json({ ok: false, error: 'Registreringsnummer, navn, e-post og mobil er påkrevd.' });
  }

  let utstyr = b.utstyr;
  if (typeof utstyr === 'string') {
    try { utstyr = JSON.parse(utstyr); } catch { utstyr = utstyr ? [utstyr] : []; }
  }
  if (!Array.isArray(utstyr)) utstyr = [];
  b.utstyr = utstyr;

  let bilderMeta = b.bilder;
  if (typeof bilderMeta === 'string') {
    try { bilderMeta = JSON.parse(bilderMeta); } catch { bilderMeta = []; }
  }

  const persisted = await persistMulterFiles(req.files);
  const savedFiles = persisted.map(function (file) {
    return { name: file.originalname, path: file.path, size: file.size, type: file.mimetype };
  });

  if (Array.isArray(bilderMeta) && bilderMeta.length && !savedFiles.length) {
    const base64Files = await saveIngestBilder(bilderMeta);
    savedFiles.push(...base64Files);
  }

  const info = await insertInnbytteRow(b, savedFiles);

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// JSON innbytte (same as website uses today)
app.post('/api/ingest/innbytte/json', requireIngest, async function (req, res) {
  req.body = req.body || {};
  const savedFiles = await saveIngestBilder(Array.isArray(req.body.bilder) ? req.body.bilder : []);
  req.body.bilder = savedFiles;
  req.body.mobil = req.body.mobil || req.body.tlf;

  const b = req.body;
  if (!b.regnr || !b.navn || !b.epost || !b.mobil) {
    return res.status(400).json({ ok: false, error: 'Registreringsnummer, navn, e-post og mobil er påkrevd.' });
  }

  const info = await insertInnbytteRow(b, savedFiles);

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

app.post('/api/ingest/selg-bil/json', requireIngest, async function (req, res) {
  req.body = req.body || {};
  const savedFiles = await saveIngestBilder(req.body.bilder);
  req.body.mobil = req.body.mobil || req.body.tlf;

  const b = req.body;
  if (!b.regnr || !b.navn || !b.epost || !b.mobil) {
    return res.status(400).json({ ok: false, error: 'Registreringsnummer, navn, e-post og mobil er påkrevd.' });
  }

  try {
    const info = await insertSelgBilRow(b, savedFiles);
    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('[selg-bil/ingest]', err.message);
    res.status(500).json({ ok: false, error: 'Kunne ikke lagre oppkjøpsforespørsel.' });
  }
});

// ─── Henvendelser ───
app.get('/api/henvendelser', requireAuth, async function (_req, res) {
  const rows = await prepare('SELECT * FROM henvendelser ORDER BY created_at DESC').all();
  res.json({ ok: true, items: rows.map(mapHenv) });
});

app.patch('/api/henvendelser/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM henvendelser WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  let kommentarerJson = null;

  if (b.kommentarer != null) {
    try {
      kommentarerJson = JSON.stringify(mergeHenvKommentarer(row.kommentarer, b.kommentarer, req.user));
    } catch (err) {
      return res.status(403).json({ ok: false, error: err.message || 'Ugyldig kommentar-endring.' });
    }
  }

  if (b.status != null) {
    const allowed = (await getInnstillinger()).henvStatuser;
    if (!allowed.includes(b.status)) {
      return res.status(400).json({ ok: false, error: 'Ugyldig status.' });
    }
  }

  if (b.kundeId !== undefined) {
    const kundeAnsvarlig = await resolveModulAnsvarlig(req, b);
    await prepare(`
      UPDATE henvendelser SET
        kunde_id = ?,
        ansvarlig = COALESCE(?, ansvarlig),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(b.kundeId || null, kundeAnsvarlig, id);
  }

  const ansvarlig = await resolveModulAnsvarlig(req, b);

  await prepare(`
    UPDATE henvendelser SET
      status = COALESCE(@status, status),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      svar = COALESCE(@svar, svar),
      kommentarer = COALESCE(@kommentarer, kommentarer),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    status: b.status ?? null,
    ansvarlig,
    svar: b.svar ?? null,
    kommentarer: kommentarerJson
  });

  res.json({ ok: true, item: mapHenv(await prepare('SELECT * FROM henvendelser WHERE id = ?').get(id)) });
});

app.delete('/api/henvendelser/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Ugyldig id.' });

  const row = await prepare('SELECT id FROM henvendelser WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Kontaktskjemaet finnes ikke.' });

  try {
    await prepare('UPDATE eposter SET henvendelse_id = NULL WHERE henvendelse_id = ?').run(id);
    await prepare('DELETE FROM henvendelser WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[henvendelser/delete]', err.message);
    res.status(500).json({ ok: false, error: 'Kunne ikke slette kontaktskjemaet.' });
  }
});

app.post('/api/henvendelser/:id/send-svar', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM henvendelser WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const text = String((req.body || {}).svar || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Svar kan ikke være tomt.' });
  if (!row.epost) return res.status(400).json({ ok: false, error: 'Kontaktskjemaet har ingen e-postadresse.' });

  try {
    const subject = String(row.emne || '').startsWith('Re:')
      ? row.emne
      : `Re: ${row.emne || 'Kontaktskjema'}`;

    await sendMail({
      to: row.epost,
      toName: row.navn,
      subject,
      text,
      henvendelseId: id,
      kontoId: (req.body || {}).kontoId || null
    });

    const ansvarlig = await getAnsvarligNavn(req);

    await prepare(`
      UPDATE henvendelser SET
        svar = @svar,
        status = 'Besvart',
        ansvarlig = @ansvarlig,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ id, svar: text, ansvarlig: ansvarlig || '' });

    res.json({ ok: true, item: mapHenv(await prepare('SELECT * FROM henvendelser WHERE id = ?').get(id)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke sende e-post.' });
  }
});

// ─── Innboks ───
app.get('/api/mail/status', requireAuth, async function (_req, res) {
  res.json({ ok: true, status: await getMailStatus() });
});

app.get('/api/innboks/utkast', requireAuth, async function (_req, res) {
  res.json({
    ok: true,
    items: await getEpostUtkastList(),
    count: await countEpostUtkast(),
    status: await getMailStatus()
  });
});

app.get('/api/innboks/utkast/:id', requireAuth, async function (req, res) {
  const item = await getEpostUtkastById(Number(req.params.id));
  if (!item) return res.status(404).json({ ok: false, error: 'Utkast ikke funnet.' });
  res.json({ ok: true, item });
});

app.put('/api/innboks/utkast', requireAuth, async function (req, res) {
  try {
    const item = await saveEpostUtkast(req.body || {});
    res.json({ ok: true, item, count: await countEpostUtkast(), status: await getMailStatus() });
  } catch (err) {
    console.error('[innboks/utkast PUT]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke lagre utkast.' });
  }
});

app.delete('/api/innboks/utkast/:id', requireAuth, async function (req, res) {
  await deleteEpostUtkast(Number(req.params.id));
  res.json({ ok: true, count: await countEpostUtkast(), status: await getMailStatus() });
});

app.get('/api/innboks/mapper', requireAuth, async function (req, res) {
  const kontoId = Number(req.query.kontoId);
  if (!kontoId) return res.status(400).json({ ok: false, error: 'kontoId er påkrevd.' });
  try {
    let items = await getMailMapperForKonto(kontoId);
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (forceRefresh || !items.length) {
      items = await refreshFoldersFromImap(kontoId);
    } else {
      await ensureStandardVirtualFolders(kontoId);
      items = await getMailMapperForKonto(kontoId);
    }
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke hente mapper.' });
  }
});

app.post('/api/innboks/mapper', requireAuth, async function (req, res) {
  const kontoId = Number(req.body?.kontoId);
  const navn = String(req.body?.navn || '').trim();
  const parentPath = String(req.body?.parentPath || '').trim();
  if (!kontoId || !navn) {
    return res.status(400).json({ ok: false, error: 'kontoId og navn er påkrevd.' });
  }
  const konto = await getMailKontoById(kontoId, true);
  if (!konto) return res.status(404).json({ ok: false, error: 'Mailkonto ikke funnet.' });
  try {
    const item = await createImapFolder(konto, navn, parentPath || null);
    res.status(201).json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke opprette mappe.' });
  }
});

app.get('/api/innboks', requireAuth, async function (req, res) {
  let mappeId = req.query.mappeId ? Number(req.query.mappeId) : null;
  const kontoId = req.query.kontoId ? Number(req.query.kontoId) : null;
  let mappeType = null;

  if (mappeId) {
    const mappe = await getMailMappeById(mappeId);
    mappeType = mappe?.mappeType || null;
  } else if (kontoId) {
    const mapper = await getMailMapperForKonto(kontoId);
    const inbox = mapper.find(function (m) { return m.mappeType === 'inbox'; });
    if (inbox) {
      mappeId = inbox.id;
      mappeType = 'inbox';
    }
  }

  let sql = `
    SELECT ${INNBOKS_LIST_SELECT},
      k.navn AS konto_navn, k.epost AS konto_epost,
      m.navn AS mappe_navn, m.mappe_type AS mappe_type,
      (SELECT COUNT(*) FROM epost_vedlegg v WHERE v.epost_id = e.id) AS vedlegg_count
    FROM eposter e
    INNER JOIN mail_kontoer k ON k.id = e.konto_id
    LEFT JOIN mail_mapper m ON m.id = e.mappe_id
    WHERE e.slettet = 0
  `;
  const params = [];
  if (kontoId) {
    sql += ' AND e.konto_id = ?';
    params.push(kontoId);
  }
  if (mappeId) {
    if (mappeType === 'inbox') {
      sql += " AND e.retning = 'inn'";
    } else if (mappeType === 'sent') {
      sql += " AND e.retning = 'ut'";
    } else {
      sql += ' AND e.mappe_id = ?';
      params.push(mappeId);
    }
  }
  sql += ' ORDER BY e.mottatt_dato DESC, e.id DESC LIMIT 500';
  const rows = await prepare(sql).all(...params);
  const includeStatus = req.query.status !== '0';
  const payload = { ok: true, items: mapEpostListRows(rows) };
  if (includeStatus) payload.status = await getMailStatus();
  res.json(payload);
});

app.get('/api/innboks/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Ugyldig id.' });
  const row = await getEpostRowById(id);
  if (!row || row.slettet) {
    return res.status(404).json({ ok: false, error: 'E-post ikke funnet.' });
  }
  const items = await mapEpostRowsWithVedlegg([row]);
  res.json({ ok: true, item: items[0] });
});

app.get('/api/innboks/:id/vedlegg/:vedleggId', requireAuth, async function (req, res) {
  const epostId = Number(req.params.id);
  const vedleggId = Number(req.params.vedleggId);
  const vedlegg = await getEpostVedleggById(vedleggId);
  if (!vedlegg || vedlegg.epostId !== epostId) {
    return res.status(404).json({ ok: false, error: 'Vedlegg ikke funnet.' });
  }
  const file = await openUpload(vedlegg.path);
  if (!file?.buffer) return res.status(404).json({ ok: false, error: 'Filen finnes ikke.' });
  res.setHeader('Content-Type', vedlegg.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(vedlegg.filnavn)}"`);
  res.send(file.buffer);
});

app.post('/api/innboks/:id/flytt', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const targetMappeId = Number(req.body?.mappeId);
  if (!targetMappeId) return res.status(400).json({ ok: false, error: 'mappeId er påkrevd.' });

  const row = await prepare('SELECT * FROM eposter WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const konto = await getMailKontoById(row.konto_id, true);
  const sourceMappe = row.mappe_id ? await getMailMappeById(row.mappe_id) : null;
  const targetMappe = await getMailMappeById(targetMappeId);
  if (!konto || !targetMappe) return res.status(400).json({ ok: false, error: 'Ugyldig mappe eller konto.' });

  try {
    if (sourceMappe) {
      await moveMessageOnServer(konto, sourceMappe, row, targetMappe);
    } else {
      await prepare('UPDATE eposter SET mappe_id = ? WHERE id = ?').run(targetMappeId, id);
    }
    if (row.mappe_id) await updateMappeCounts(row.mappe_id);
    await updateMappeCounts(targetMappeId);
    const fresh = await getEpostRowById(id);
    const items = await mapEpostRowsWithVedlegg([fresh]);
    res.json({ ok: true, item: items[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke flytte e-post.' });
  }
});

app.delete('/api/innboks/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM eposter WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });
  const konto = await getMailKontoById(row.konto_id, true);
  const mappe = row.mappe_id ? await getMailMappeById(row.mappe_id) : null;
  try {
    await deleteMessageOnServer(konto, mappe, row);
    if (row.mappe_id) await updateMappeCounts(row.mappe_id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke slette e-post.' });
  }
});

app.patch('/api/innboks/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM eposter WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  if (b.lest != null) {
    const seen = !!b.lest;
    const konto = await getMailKontoById(row.konto_id, true);
    const mappe = await resolveMappeForEpostRow(row);
    const canImap = !!(konto && mappe && row.imap_uid && accountImapReady(konto));

    if (canImap) {
      try {
        await setMessageSeenOnServer(konto, mappe, row, seen);
      } catch (err) {
        console.warn('[innboks/patch lest]', err.message);
        return res.status(502).json({
          ok: false,
          error: 'Kunne ikke synkronisere lest-status med e-postserveren. Prøv igjen.'
        });
      }
    }

    await prepare('UPDATE eposter SET lest = @lest WHERE id = @id').run({
      id,
      lest: seen ? 1 : 0
    });

    try {
      await refreshMappeCountsForEpostRow(row);
    } catch (err) {
      console.warn('[innboks/patch mappe counts]', err.message);
    }
  }

  if (b.flagged != null) {
    await prepare('UPDATE eposter SET flagged = @flagged WHERE id = @id').run({
      id,
      flagged: b.flagged ? 1 : 0
    });
  }

  if (b.henvendelseId != null) {
    await prepare('UPDATE eposter SET henvendelse_id = @henvendelse_id WHERE id = @id').run({
      id,
      henvendelse_id: b.henvendelseId || null
    });
  }

  if (b.status != null) {
    const status = String(b.status || '').trim();
    if (status) {
      const allowed = (await getInnstillinger()).henvStatuser;
      if (!allowed.includes(status)) {
        return res.status(400).json({ ok: false, error: 'Ugyldig status.' });
      }
    }
    try {
      await prepare('UPDATE eposter SET status = @status WHERE id = @id').run({ id, status });
    } catch (err) {
      console.error('[innboks/patch status]', err.message);
      return res.status(500).json({ ok: false, error: 'Kunne ikke lagre status.' });
    }
  }

  if (b.ansvarlig != null) {
    try {
      await prepare('UPDATE eposter SET ansvarlig = @ansvarlig WHERE id = @id').run({
        id,
        ansvarlig: String(b.ansvarlig || '').trim()
      });
    } catch (err) {
      console.error('[innboks/patch ansvarlig]', err.message);
      return res.status(500).json({ ok: false, error: 'Kunne ikke lagre ansvarlig.' });
    }
  }

  if (b.kundeId !== undefined) {
    await prepare('UPDATE eposter SET kunde_id = ? WHERE id = ?').run(b.kundeId || null, id);
  }

  const endretUtenAnsvarlig = b.ansvarlig === undefined && (
    b.lest != null
    || b.flagged != null
    || b.henvendelseId != null
    || b.status != null
    || b.kundeId !== undefined
  );
  if (endretUtenAnsvarlig) {
    const autoAnsvarlig = await getAnsvarligNavn(req);
    if (autoAnsvarlig) {
      await prepare('UPDATE eposter SET ansvarlig = ? WHERE id = ?').run(autoAnsvarlig, id);
    }
  }

  const fresh = await getEpostRowById(id);
  const items = await mapEpostRowsWithVedlegg([fresh]);
  res.json({ ok: true, item: items[0] });
});

app.post('/api/innboks/sync', requireAuth, async function (req, res) {
  try {
    const kontoId = req.body?.kontoId || req.query?.kontoId || null;
    const result = await syncInbox(kontoId ? Number(kontoId) : null);
    res.json({ ok: true, ...result, status: await getMailStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Synkronisering feilet.' });
  }
});

async function handleSendEpost(req, res) {
  const b = req.body || {};
  const to = String(b.to || '').trim();
  const subject = String(b.subject || b.emne || '').trim();
  const text = String(b.text || b.innhold || '').trim();
  const html = String(b.html || '').trim();

  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ ok: false, error: 'Mottaker, emne og melding er påkrevd.' });
  }

  try {
    let original = null;
    let inReplyTo = b.inReplyTo || null;
    let references = b.references || null;
    if (b.replyToId) {
      original = await prepare('SELECT * FROM eposter WHERE id = ?').get(Number(b.replyToId));
      if (original) {
        inReplyTo = original.message_id;
        references = [original.message_id, original.in_reply_to].filter(Boolean);
        if (!b.kontoId && original.konto_id) b.kontoId = original.konto_id;
      }
    }

    const persisted = await persistMulterFiles(req.files);
    const attachments = [];
    for (const file of persisted) {
      const opened = await openUpload(file.path);
      attachments.push({
        filename: file.originalname,
        content: opened?.buffer,
        contentType: file.mimetype
      });
    }

    const sent = await sendMail({
      to,
      toName: b.toName || '',
      cc: b.cc || b.kopi || '',
      bcc: b.bcc || b.blindkopi || '',
      subject,
      text,
      html,
      replyQuoteHtml: b.replyQuoteHtml || '',
      inReplyTo,
      references,
      henvendelseId: b.henvendelseId || null,
      kontoId: b.kontoId || null,
      attachments
    });

    const ansvarlig = await getAnsvarligNavn(req);
    let replyToItem = null;
    let henvendelseItem = null;
    if (ansvarlig) {
      if (original) {
        await prepare('UPDATE eposter SET ansvarlig = ? WHERE id = ?').run(ansvarlig, original.id);
        replyToItem = (await mapEpostRowsWithVedlegg([await getEpostRowById(original.id)]))[0];
      }
      const henvId = b.henvendelseId
        ? Number(b.henvendelseId)
        : (original?.henvendelse_id || null);
      if (henvId) {
        await prepare(`
          UPDATE henvendelser SET ansvarlig = ?, updated_at = datetime('now') WHERE id = ?
        `).run(ansvarlig, henvId);
        henvendelseItem = mapHenv(await prepare('SELECT * FROM henvendelser WHERE id = ?').get(henvId));
      }
    }

    const item = sent.rowId
      ? (await mapEpostRowsWithVedlegg([await getEpostRowById(sent.rowId)]))[0]
      : null;
    if (b.draftId) await deleteEpostUtkast(Number(b.draftId));
    res.status(201).json({ ok: true, item, replyToItem, henvendelseItem });
  } catch (err) {
    console.error('[innboks/send]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke sende e-post.' });
  }
}

app.post('/api/innboks/send', requireAuth, function (req, res, next) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return upload.array('vedlegg', 10)(req, res, function (err) {
      if (err) {
        return res.status(400).json({ ok: false, error: err.message || 'Opplasting av vedlegg feilet.' });
      }
      handleSendEpost(req, res);
    });
  }
  next();
}, async function (req, res) {
  await handleSendEpost(req, res);
});

app.post('/api/innboks/:id/oppret-henvendelse', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM eposter WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });
  if (row.henvendelse_id) {
    return res.status(400).json({ ok: false, error: 'E-posten er allerede koblet til en henvendelse.' });
  }

  const info = await prepare(`
    INSERT INTO henvendelser (navn, epost, tlf, emne, melding, kilde, bil_ref, status, ansvarlig, kunde_id)
    VALUES (@navn, @epost, @tlf, @emne, @melding, 'E-post', @bil_ref, @status, @ansvarlig, @kunde_id)
  `).run({
    navn: row.fra_navn || row.fra_epost,
    epost: row.fra_epost,
    tlf: '',
    emne: row.emne,
    melding: row.innhold || row.innhold_html || '',
    bil_ref: (req.body || {}).bilRef || '',
    status: row.status || 'Ny',
    ansvarlig: row.ansvarlig || '',
    kunde_id: await findKundeIdByEpost(row.fra_epost),
  });

  await prepare('UPDATE eposter SET henvendelse_id = @henvendelse_id WHERE id = @id').run({
    id,
    henvendelse_id: info.lastInsertRowid
  });

  res.status(201).json({
    ok: true,
    henvendelse: mapHenv(await prepare('SELECT * FROM henvendelser WHERE id = ?').get(info.lastInsertRowid)),
    epost: (await mapEpostRowsWithVedlegg([await getEpostRowById(id)]))[0]
  });
});

// ─── Mailkontoer ───
app.post('/api/mail/upload-bilde', requireAuth, upload.single('bilde'), async function (req, res) {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Ingen bilde valgt.' });
  try {
    const saved = await persistMulterFile(req.file);
    if (!saved) return res.status(500).json({ ok: false, error: 'Kunne ikke lagre bilde.' });
    const url = saved.path;
    const base = process.env.ADMIN_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ ok: true, url, absoluteUrl: base + url, name: saved.originalname });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke lagre bilde.' });
  }
});

app.get('/api/mail/kontoer', requireAuth, async function (_req, res) {
  res.json({ ok: true, items: await getMailKontoer(false), status: await getMailStatus() });
});

app.post('/api/mail/kontoer', requireAuth, async function (req, res) {
  try {
    const b = req.body || {};
    if (!b.navn || !b.epost) {
      return res.status(400).json({ ok: false, error: 'Navn og e-post er påkrevd.' });
    }
    const item = await createMailKonto(b);
    res.status(201).json({ ok: true, item, status: await getMailStatus() });
  } catch (err) {
    console.error('[mail/kontoer POST]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke opprette mailkonto.' });
  }
});

app.patch('/api/mail/kontoer/:id', requireAuth, async function (req, res) {
  try {
    const id = Number(req.params.id);
    const existing = await getMailKontoById(id, true);
    if (!existing) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

    const b = { ...(req.body || {}) };
    if (b.imapPass === PASS_MASK) delete b.imapPass;
    if (b.smtpPass === PASS_MASK) delete b.smtpPass;

    const item = await updateMailKonto(id, b);
    res.json({ ok: true, item, status: await getMailStatus() });
  } catch (err) {
    console.error('[mail/kontoer PATCH]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke oppdatere mailkonto.' });
  }
});

app.delete('/api/mail/kontoer/:id', requireAuth, async function (req, res) {
  const ok = await deleteMailKonto(Number(req.params.id));
  if (!ok) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });
  res.json({ ok: true, status: await getMailStatus() });
});

app.post('/api/mail/kontoer/:id/test', requireAuth, async function (req, res) {
  try {
    const result = await testMailKonto(Number(req.params.id));
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Tilkobling feilet.' });
  }
});

app.get('/api/mail/maler', requireAuth, async function (_req, res) {
  res.json({ ok: true, items: await getEpostMaler() });
});

app.post('/api/mail/maler', requireAuth, async function (req, res) {
  try {
    const item = await createEpostMal(req.body || {});
    res.status(201).json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke opprette mal.' });
  }
});

app.patch('/api/mail/maler/:id', requireAuth, async function (req, res) {
  try {
    const item = await updateEpostMal(Number(req.params.id), req.body || {});
    if (!item) return res.status(404).json({ ok: false, error: 'Mal ikke funnet.' });
    res.json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke oppdatere mal.' });
  }
});

app.delete('/api/mail/maler/:id', requireAuth, async function (req, res) {
  await deleteEpostMal(Number(req.params.id));
  res.json({ ok: true });
});

// ─── Innbytte ───
app.get('/api/finn/annonse', requireAuth, async function (req, res) {
  const ref = req.query?.ref || req.query?.id || '';
  if (!String(ref).trim()) {
    return res.status(400).json({ ok: false, error: 'Mangler FINN-referanse.' });
  }
  try {
    const meta = await lookupFinnAnnonse(ref);
    if (!meta.id) {
      return res.status(400).json({ ok: false, error: 'Ugyldig FINN-kode eller lenke.' });
    }
    res.json({ ok: true, item: meta });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke hente FINN-annonse.' });
  }
});

app.get('/api/finn/markedssok', requireAuth, async function (req, res) {
  const merke = String(req.query?.merke || '').trim();
  const modell = String(req.query?.modell || '').trim();
  if (!merke && !modell) {
    return res.status(400).json({ ok: false, error: 'Mangler merke eller modell.' });
  }
  try {
    const item = await resolveFinnMarkedsSok({
      merke,
      modell,
      aar: req.query?.aar,
      km: req.query?.km,
      kmSlack: req.query?.kmSlack
    });
    if (!item?.url) {
      return res.status(404).json({
        ok: false,
        error: 'Fant ikke merke/modell på FINN. Sjekk stavemåte eller prøv et mer presist modellnavn.'
      });
    }
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke bygge FINN-markedssøk.' });
  }
});

app.get('/api/innbytte', requireAuth, async function (_req, res) {
  const rows = await prepare('SELECT * FROM innbytte ORDER BY created_at DESC').all();
  res.json({ ok: true, items: rows.map(mapInnbytte) });
});

app.patch('/api/innbytte/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM innbytte WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  if (b.kundeId !== undefined) {
    const kundeAnsvarlig = await resolveModulAnsvarlig(req, b);
    await prepare(`
      UPDATE innbytte SET
        kunde_id = ?,
        ansvarlig = COALESCE(?, ansvarlig),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(b.kundeId || null, kundeAnsvarlig, id);
  }

  let kommentarerJson = null;
  if (b.kommentarer != null) {
    try {
      kommentarerJson = JSON.stringify(mergeHenvKommentarer(row.kommentarer, b.kommentarer, req.user));
    } catch (err) {
      return res.status(403).json({ ok: false, error: err.message || 'Ugyldig kommentar-endring.' });
    }
  }

  const ansvarlig = await resolveModulAnsvarlig(req, b);

  await prepare(`
    UPDATE innbytte SET
      status = COALESCE(@status, status),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      tilbud = COALESCE(@tilbud, tilbud),
      kommentarer = COALESCE(@kommentarer, kommentarer),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    status: b.status ?? null,
    ansvarlig,
    tilbud: b.tilbud != null ? String(b.tilbud) : null,
    kommentarer: kommentarerJson
  });

  res.json({ ok: true, item: mapInnbytte(await prepare('SELECT * FROM innbytte WHERE id = ?').get(id)) });
});

app.delete('/api/innbytte/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Ugyldig id.' });

  const row = await prepare('SELECT id, bilder FROM innbytte WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Innbytteforespørselen finnes ikke.' });

  try {
    const bilder = parseJson(row.bilder, []);
    if (Array.isArray(bilder)) {
      for (const file of bilder) {
        const filePath = String(file?.path || '');
        if (!filePath.startsWith('/uploads/')) continue;
        try {
          await deleteUpload(filePath);
        } catch (_err) {
          /* Ignorer fil-feil – raden slettes uansett */
        }
      }
    }
    await prepare('DELETE FROM innbytte WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[innbytte/delete]', err.message);
    res.status(500).json({ ok: false, error: 'Kunne ikke slette innbytteforespørselen.' });
  }
});

app.post('/api/innbytte/:id/send-tilbud', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM innbytte WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  const type = b.type === 'visning' ? 'visning' : 'tilbud';
  const tilbud = b.tilbud != null ? String(b.tilbud).trim() : String(row.tilbud || '').trim();
  const melding = String(b.melding || '').trim();
  if (type === 'tilbud' && !tilbud) {
    return res.status(400).json({ ok: false, error: 'Tilbudspris er påkrevd.' });
  }
  if (!row.epost) return res.status(400).json({ ok: false, error: 'Innbytte mangler e-postadresse.' });
  if (!melding) return res.status(400).json({ ok: false, error: 'Melding kan ikke være tom.' });

  const bilLabel = [row.merke, row.modell, row.arsmodell].filter(Boolean).join(' ');
  const subject = type === 'visning'
    ? `Innbytte${row.regnr ? ' – ' + row.regnr : ''}${bilLabel ? ' (' + bilLabel + ')' : ''} – invitasjon til visning`
    : `Innbyttetilbud${row.regnr ? ' – ' + row.regnr : ''}${bilLabel ? ' (' + bilLabel + ')' : ''}`;

  try {
    await sendMail({
      to: row.epost,
      toName: row.navn,
      subject: subject,
      text: melding,
      kontoId: b.kontoId || null
    });

    const kommentarer = normalizeHenvKommentarer(parseJson(row.kommentarer, []));
    if (type === 'visning') {
      kommentarer.push(createInternKommentar('Invitasjon til visning sendt på e-post', req.user));
    } else {
      const prisTekst = Number(tilbud).toLocaleString('nb-NO');
      kommentarer.push(createInternKommentar(`Tilbud sendt på e-post (kr ${prisTekst})`, req.user));
    }

    const newStatus = type === 'visning'
      ? await resolveInnbytteStatus('Under vurdering')
      : await resolveInnbytteStatus('Tilbud sendt');
    const ansvarlig = await getAnsvarligNavn(req);
    const updateParams = {
      id: id,
      status: newStatus,
      ansvarlig: ansvarlig || '',
      kommentarer: JSON.stringify(kommentarer)
    };

    if (type === 'tilbud') {
      await prepare(`
        UPDATE innbytte SET
          tilbud = @tilbud,
          status = @status,
          ansvarlig = @ansvarlig,
          kommentarer = @kommentarer,
          updated_at = datetime('now')
        WHERE id = @id
      `).run({ ...updateParams, tilbud: tilbud });
    } else {
      await prepare(`
        UPDATE innbytte SET
          status = @status,
          ansvarlig = @ansvarlig,
          kommentarer = @kommentarer,
          updated_at = datetime('now')
        WHERE id = @id
      `).run(updateParams);
    }

    res.json({ ok: true, item: mapInnbytte(await prepare('SELECT * FROM innbytte WHERE id = ?').get(id)) });
  } catch (err) {
    console.error('[innbytte/send-tilbud]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke sende e-post.' });
  }
});

app.get('/api/selg-bil', requireAuth, async function (_req, res) {
  const rows = await prepare('SELECT * FROM selg_bil ORDER BY created_at DESC').all();
  res.json({ ok: true, items: rows.map(mapSelgBil) });
});

app.patch('/api/selg-bil/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM selg_bil WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  if (b.kundeId !== undefined) {
    const kundeAnsvarlig = await resolveModulAnsvarlig(req, b);
    await prepare(`
      UPDATE selg_bil SET
        kunde_id = ?,
        ansvarlig = COALESCE(?, ansvarlig),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(b.kundeId || null, kundeAnsvarlig, id);
  }

  let kommentarerJson = null;
  if (b.kommentarer != null) {
    try {
      kommentarerJson = JSON.stringify(mergeHenvKommentarer(row.kommentarer, b.kommentarer, req.user));
    } catch (err) {
      return res.status(403).json({ ok: false, error: err.message || 'Ugyldig kommentar-endring.' });
    }
  }

  const ansvarlig = await resolveModulAnsvarlig(req, b);

  await prepare(`
    UPDATE selg_bil SET
      status = COALESCE(@status, status),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      tilbud = COALESCE(@tilbud, tilbud),
      kommentarer = COALESCE(@kommentarer, kommentarer),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    status: b.status ?? null,
    ansvarlig,
    tilbud: b.tilbud != null ? String(b.tilbud) : null,
    kommentarer: kommentarerJson
  });

  res.json({ ok: true, item: mapSelgBil(await prepare('SELECT * FROM selg_bil WHERE id = ?').get(id)) });
});

app.delete('/api/selg-bil/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Ugyldig id.' });

  const row = await prepare('SELECT id, bilder FROM selg_bil WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Oppkjøpsforespørselen finnes ikke.' });

  try {
    const bilder = parseJson(row.bilder, []);
    if (Array.isArray(bilder)) {
      for (const file of bilder) {
        const filePath = String(file?.path || '');
        if (!filePath.startsWith('/uploads/')) continue;
        try {
          await deleteUpload(filePath);
        } catch (_err) {
          /* Ignorer fil-feil – raden slettes uansett */
        }
      }
    }
    await prepare('DELETE FROM selg_bil WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[selg-bil/delete]', err.message);
    res.status(500).json({ ok: false, error: 'Kunne ikke slette oppkjøpsforespørselen.' });
  }
});

app.post('/api/selg-bil/:id/send-tilbud', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM selg_bil WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  const type = b.type === 'visning' ? 'visning' : 'tilbud';
  const tilbud = b.tilbud != null ? String(b.tilbud).trim() : String(row.tilbud || '').trim();
  const melding = String(b.melding || '').trim();
  if (type === 'tilbud' && !tilbud) {
    return res.status(400).json({ ok: false, error: 'Tilbudspris er påkrevd.' });
  }
  if (!row.epost) return res.status(400).json({ ok: false, error: 'Forespørselen mangler e-postadresse.' });
  if (!melding) return res.status(400).json({ ok: false, error: 'Melding kan ikke være tom.' });

  const bilLabel = [row.merke, row.modell, row.arsmodell].filter(Boolean).join(' ');
  const subject = type === 'visning'
    ? `Bilvurdering${row.regnr ? ' – ' + row.regnr : ''}${bilLabel ? ' (' + bilLabel + ')' : ''}`
    : `Oppkjøpstilbud${row.regnr ? ' – ' + row.regnr : ''}${bilLabel ? ' (' + bilLabel + ')' : ''}`;

  try {
    await sendMail({
      to: row.epost,
      toName: row.navn,
      subject: subject,
      text: melding,
      kontoId: b.kontoId || null
    });

    const kommentarer = normalizeHenvKommentarer(parseJson(row.kommentarer, []));
    if (type === 'visning') {
      kommentarer.push(createInternKommentar('Invitasjon til befaring sendt på e-post', req.user));
    } else {
      const prisTekst = Number(tilbud).toLocaleString('nb-NO');
      kommentarer.push(createInternKommentar(`Oppkjøpstilbud sendt på e-post (kr ${prisTekst})`, req.user));
    }

    const newStatus = type === 'visning'
      ? await resolveSelgBilStatus('Under vurdering')
      : await resolveSelgBilStatus('Tilbud sendt');
    const ansvarlig = await getAnsvarligNavn(req);
    const updateParams = {
      id: id,
      status: newStatus,
      ansvarlig: ansvarlig || '',
      kommentarer: JSON.stringify(kommentarer)
    };

    if (type === 'tilbud') {
      await prepare(`
        UPDATE selg_bil SET
          tilbud = @tilbud,
          status = @status,
          ansvarlig = @ansvarlig,
          kommentarer = @kommentarer,
          updated_at = datetime('now')
        WHERE id = @id
      `).run({ ...updateParams, tilbud: tilbud });
    } else {
      await prepare(`
        UPDATE selg_bil SET
          status = @status,
          ansvarlig = @ansvarlig,
          kommentarer = @kommentarer,
          updated_at = datetime('now')
        WHERE id = @id
      `).run(updateParams);
    }

    res.json({ ok: true, item: mapSelgBil(await prepare('SELECT * FROM selg_bil WHERE id = ?').get(id)) });
  } catch (err) {
    console.error('[selg-bil/send-tilbud]', err);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke sende e-post.' });
  }
});

// ─── Biler ───
async function mapBilForApi(row, kundeIds) {
  const settings = await getInnstillinger();
  const mal = settings.bilSjekklister || {};
  return mapBil(row, kundeIds || [], mal);
}

async function mapBilerForApi(rows, kundeMap) {
  const settings = await getInnstillinger();
  const mal = settings.bilSjekklister || {};
  return rows.map(function (row) {
    return mapBil(row, (kundeMap && kundeMap[row.id]) || [], mal);
  });
}

const BIL_LIST_COLUMNS = [
  'id', 'reg', 'merke', 'modell', 'aar', 'km', 'innkjop', 'salg', 'farge', 'status', 'sort_order', 'pipeline_nummer',
  'ansvarlig', 'frist', 'notater', 'eu_kontroll', 'forsikring', 'finn_kode', 'chassisnr',
  'drivstoff', 'girkasse', 'utstyr', 'intern_info', 'sjekkliste', 'sjekklister', 'okonomi', 'kunde_id',
  'archived', 'archived_at', 'tilstandsrapport'
].join(', ');

async function mapBilersLiteForApi(rows, kundeMap) {
  const settings = await getInnstillinger();
  const mal = settings.bilSjekklister || {};
  return rows.map(function (row) {
    const item = mapBil(row, (kundeMap && kundeMap[row.id]) || [], mal);
    return {
      ...item,
      lite: true,
      svvData: null,
      logg: [],
      kommentarer: [],
      dokumenter: [],
      okonomi: item.okonomi && typeof item.okonomi === 'object' ? item.okonomi : {}
    };
  });
}

app.get('/api/biler', requireAuth, async function (req, res) {
  const lite = req.query.lite === '1' || req.query.lite === 'true';
  const [rows, kundeMap] = await Promise.all([
    prepare(
      lite
        ? `SELECT ${BIL_LIST_COLUMNS} FROM biler ORDER BY sort_order ASC, id ASC`
        : 'SELECT * FROM biler ORDER BY sort_order ASC, id ASC'
    ).all(),
    getAllBilKundeIdsMap()
  ]);
  res.json({
    ok: true,
    items: lite
      ? await mapBilersLiteForApi(rows, kundeMap)
      : await mapBilersForApi(rows, kundeMap)
  });
});

app.post('/api/biler/reorder', requireAuth, async function (req, res) {
  const updates = req.body?.updates;
  if (!Array.isArray(updates) || !updates.length) {
    return res.status(400).json({ ok: false, error: 'Mangler oppdateringer.' });
  }
  try {
    const ansvarlig = await getAnsvarligNavn(req);
    const items = await reorderBiler(updates, ansvarlig || '');
    res.json({ ok: true, items: items });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke lagre rekkefølge.' });
  }
});

app.post('/api/biler', requireAuth, async function (req, res) {
  if (!canAddBil(req.user)) {
    return res.status(403).json({ ok: false, error: 'Kun daglig leder, innkjøpssjef og selgere kan legge til biler i lager.' });
  }

  const b = req.body || {};
  if (!b.reg || !b.modell) {
    return res.status(400).json({ ok: false, error: 'Reg.nr og modell er påkrevd.' });
  }

  const reg = String(b.reg).toUpperCase();
  const status = b.status || 'Innkjøpt';

  try {
    const existing = await prepare('SELECT id, archived FROM biler WHERE UPPER(reg) = ?').get(reg);
    if (existing) {
      const msg = existing.archived
        ? `Bil med reg.nr ${reg} finnes i arkivet. Gjenopprett den derfra i stedet.`
        : `Bil med reg.nr ${reg} finnes allerede i lageret.`;
      return res.status(409).json({ ok: false, error: msg });
    }

    const sortOrder = await nextBilSortOrder(status);
    const settings = await getInnstillinger();
    let sjekklister = b.sjekklister;
    if (!sjekklister || typeof sjekklister !== 'object') {
      sjekklister = ensureSjekklisterForStatus({}, status, settings.bilSjekklister);
    }
    const aktivSjekkliste = getAktivSjekklisteFromRow({ status: status }, sjekklister);
    const creator = await getAnsvarligNavn(req);

    const insertParams = {
      reg: reg,
      merke: b.merke || 'Annet',
      modell: b.modell,
      aar: Number(b.aar) || 0,
      km: Number(b.km) || 0,
      innkjop: Number(b.innkjop) || 0,
      salg: Number(b.salg) || 0,
      farge: b.farge || '',
      status: status,
      sortOrder: sortOrder,
      ansvarlig: b.ansvarlig || creator || '',
      frist: b.frist || '',
      notater: b.notater || '',
      eu_kontroll: b.euKontroll || '',
      forsikring: b.forsikring || '',
      tilstandsrapport: JSON.stringify(normalizeBilTilstandsrapport(b.tilstandsrapport || DEFAULT_BIL_TILSTANDSRAPPORT)),
      arsprovekjennemerke: JSON.stringify(normalizeBilArsprovekjennemerke(b.arsprovekjennemerke || DEFAULT_BIL_ARSPROVEKJENNEMERKE)),
      sjekkliste: JSON.stringify(b.sjekkliste || aktivSjekkliste),
      sjekklister: JSON.stringify(sjekklister),
      logg: JSON.stringify(b.logg || []),
      svv_data: b.svvData ? JSON.stringify(b.svvData) : null
    };

    let info;
    try {
      info = await prepare(`
        INSERT INTO biler (reg, merke, modell, aar, km, innkjop, salg, farge, status, sort_order, ansvarlig, frist, notater, eu_kontroll, forsikring, tilstandsrapport, arsprovekjennemerke, sjekkliste, sjekklister, logg, svv_data)
        VALUES (@reg, @merke, @modell, @aar, @km, @innkjop, @salg, @farge, @status, @sortOrder, @ansvarlig, @frist, @notater, @eu_kontroll, @forsikring, @tilstandsrapport, @arsprovekjennemerke, @sjekkliste, @sjekklister, @logg, @svv_data)
      `).run(insertParams);
    } catch (err) {
      if (err.code === '23505' && String(err.constraint || '').includes('biler_pkey')) {
        await syncPostgresSequences();
        info = await prepare(`
          INSERT INTO biler (reg, merke, modell, aar, km, innkjop, salg, farge, status, sort_order, ansvarlig, frist, notater, eu_kontroll, forsikring, tilstandsrapport, arsprovekjennemerke, sjekkliste, sjekklister, logg, svv_data)
          VALUES (@reg, @merke, @modell, @aar, @km, @innkjop, @salg, @farge, @status, @sortOrder, @ansvarlig, @frist, @notater, @eu_kontroll, @forsikring, @tilstandsrapport, @arsprovekjennemerke, @sjekkliste, @sjekklister, @logg, @svv_data)
        `).run(insertParams);
      } else {
        throw err;
      }
    }

    const row = await prepare('SELECT * FROM biler WHERE id = ?').get(info.lastInsertRowid);
    if (!row) {
      return res.status(500).json({ ok: false, error: 'Bilen ble opprettet, men kunne ikke hentes.' });
    }
    res.status(201).json({ ok: true, item: await mapBilForApi(row) });
  } catch (err) {
    console.error('POST /api/biler feilet:', err.message);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke legge til bil.' });
  }
});

app.patch('/api/biler/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM biler WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  try {
    if (b.kundeIds !== undefined) {
      await setBilKunder(id, b.kundeIds);
    } else if (b.kundeId !== undefined) {
      await setBilKunder(id, b.kundeId ? [b.kundeId] : []);
    }
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'Ugyldig kunde-kobling.' });
  }

  let sjekklister = b.sjekklister;
  let sjekkliste = b.sjekkliste;
  const newStatus = b.status != null ? b.status : row.status;
  if (newStatus !== row.status && sjekklister == null) {
    const settings = await getInnstillinger();
    const current = parseBilSjekklisterObject(row);
    sjekklister = ensureSjekklisterForStatus(current, newStatus, settings.bilSjekklister);
  }
  if (sjekklister != null) {
    sjekkliste = getAktivSjekklisteFromRow({ ...row, status: newStatus }, sjekklister);
  } else if (sjekkliste != null && newStatus === row.status) {
    const current = parseBilSjekklisterObject(row);
    current[newStatus] = sjekkliste;
    sjekklister = current;
  }

  if (b.dokumenter != null) {
    await cleanupRemovedUploadFiles(parseJson(row.dokumenter, []), b.dokumenter);
  }

  let kommentarerJson = null;
  if (b.kommentarer != null) {
    try {
      kommentarerJson = JSON.stringify(mergeHenvKommentarer(row.kommentarer, b.kommentarer, req.user));
    } catch (err) {
      return res.status(403).json({ ok: false, error: err.message || 'Ugyldig kommentar-endring.' });
    }
  }

  const ansvarlig = await resolveBilAnsvarlig(req, b);
  let hasPipelineNummer = Object.prototype.hasOwnProperty.call(b, 'pipelineNummer');
  let pipelineNummer = hasPipelineNummer
    ? (b.pipelineNummer == null || b.pipelineNummer === '' ? null : Number(b.pipelineNummer))
    : null;
  if (b.status != null && b.status !== row.status && !hasPipelineNummer) {
    hasPipelineNummer = true;
    pipelineNummer = null;
  }

  await prepare(`
    UPDATE biler SET
      reg = COALESCE(@reg, reg),
      merke = COALESCE(@merke, merke),
      modell = COALESCE(@modell, modell),
      aar = COALESCE(@aar, aar),
      km = COALESCE(@km, km),
      innkjop = COALESCE(@innkjop, innkjop),
      salg = COALESCE(@salg, salg),
      farge = COALESCE(@farge, farge),
      status = COALESCE(@status, status),
      sort_order = COALESCE(@sortOrder, sort_order),
      pipeline_nummer = CASE WHEN @hasPipelineNummer = 1 THEN @pipelineNummer ELSE pipeline_nummer END,
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      frist = COALESCE(@frist, frist),
      notater = COALESCE(@notater, notater),
      eu_kontroll = COALESCE(@eu_kontroll, eu_kontroll),
      forsikring = COALESCE(@forsikring, forsikring),
      finn_kode = COALESCE(@finn_kode, finn_kode),
      chassisnr = COALESCE(@chassisnr, chassisnr),
      drivstoff = COALESCE(@drivstoff, drivstoff),
      girkasse = COALESCE(@girkasse, girkasse),
      utstyr = COALESCE(@utstyr, utstyr),
      intern_info = COALESCE(@intern_info, intern_info),
      sjekkliste = COALESCE(@sjekkliste, sjekkliste),
      sjekklister = COALESCE(@sjekklister, sjekklister),
      logg = COALESCE(@logg, logg),
      kommentarer = COALESCE(@kommentarer, kommentarer),
      dokumenter = COALESCE(@dokumenter, dokumenter),
      okonomi = COALESCE(@okonomi, okonomi),
      tilstandsrapport = COALESCE(@tilstandsrapport, tilstandsrapport),
      arsprovekjennemerke = COALESCE(@arsprovekjennemerke, arsprovekjennemerke),
      svv_data = COALESCE(@svv_data, svv_data),
      archived = COALESCE(@archived, archived),
      archived_at = CASE WHEN @archived IS NOT NULL THEN @archivedAt ELSE archived_at END,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    reg: b.reg != null ? String(b.reg).toUpperCase() : null,
    merke: b.merke ?? null,
    modell: b.modell ?? null,
    aar: b.aar != null ? Number(b.aar) : null,
    km: b.km != null ? Number(b.km) : null,
    innkjop: b.innkjop != null ? Number(b.innkjop) : null,
    salg: b.salg != null ? Number(b.salg) : null,
    farge: b.farge ?? null,
    status: b.status ?? null,
    sortOrder: b.sortOrder != null ? Number(b.sortOrder) : null,
    hasPipelineNummer: hasPipelineNummer ? 1 : 0,
    pipelineNummer: pipelineNummer,
    ansvarlig: ansvarlig,
    frist: b.frist ?? null,
    notater: b.notater ?? null,
    eu_kontroll: b.euKontroll ?? null,
    forsikring: b.forsikring ?? null,
    finn_kode: b.finnKode ?? null,
    chassisnr: b.chassisnr ?? null,
    drivstoff: b.drivstoff ?? null,
    girkasse: b.girkasse ?? null,
    utstyr: b.utstyr ?? null,
    intern_info: b.internInfo ?? null,
    sjekkliste: sjekkliste != null ? JSON.stringify(sjekkliste) : null,
    sjekklister: sjekklister != null ? JSON.stringify(sjekklister) : null,
    logg: b.logg != null ? JSON.stringify(b.logg) : null,
    kommentarer: kommentarerJson,
    dokumenter: b.dokumenter != null ? JSON.stringify(b.dokumenter) : null,
    okonomi: b.okonomi != null ? JSON.stringify(b.okonomi) : null,
    tilstandsrapport: b.tilstandsrapport != null
      ? JSON.stringify(normalizeBilTilstandsrapport(b.tilstandsrapport))
      : null,
    arsprovekjennemerke: b.arsprovekjennemerke != null
      ? JSON.stringify(normalizeBilArsprovekjennemerke(b.arsprovekjennemerke))
      : null,
    svv_data: b.svvData != null ? JSON.stringify(b.svvData) : null,
    archived: b.archived != null ? (b.archived ? 1 : 0) : null,
    archivedAt: b.archived === true ? new Date().toISOString() : (b.archived === false ? null : null)
  });

  res.json({ ok: true, item: await mapBilForApi(await prepare('SELECT * FROM biler WHERE id = ?').get(id)) });
});

app.get('/api/biler/slettelog', requireAuth, async function (req, res) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Kun daglig leder/admin har tilgang til sletteloggen.' });
  }
  try {
    const rows = await prepare(`
      SELECT id, bil_id, reg, merke, modell, status, slettet_av_id, slettet_av_navn, slettet_av_rolle, slettet_at
      FROM bil_slettinger
      ORDER BY slettet_at DESC
      LIMIT 200
    `).all();
    res.json({
      ok: true,
      items: rows.map(function (row) {
        return {
          id: row.id,
          bilId: row.bil_id,
          reg: row.reg,
          merke: row.merke,
          modell: row.modell,
          status: row.status,
          slettetAvId: row.slettet_av_id,
          slettetAvNavn: row.slettet_av_navn,
          slettetAvRolle: row.slettet_av_rolle,
          slettetAt: row.slettet_at
        };
      })
    });
  } catch (err) {
    console.error('GET /api/biler/slettelog feilet:', err.message);
    res.status(500).json({ ok: false, error: 'Kunne ikke hente slettelog.' });
  }
});

app.get('/api/biler/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Ugyldig bil-ID.' });
  }
  const row = await prepare('SELECT * FROM biler WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });
  const kundeMap = await getAllBilKundeIdsMap();
  res.json({ ok: true, item: await mapBilForApi(row, kundeMap[id] || []) });
});

app.delete('/api/biler/:id', requireAuth, async function (req, res) {
  if (!canDeleteBil(req.user)) {
    return res.status(403).json({ ok: false, error: 'Kun daglig leder og innkjøpssjef kan slette biler.' });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Ugyldig id.' });

  const row = await prepare('SELECT * FROM biler WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Bilen finnes ikke.' });

  try {
    const ansvarlig = await getAnsvarligNavn(req);
    const slettetAvRolle = resolveRoleKey(req.user?.role || '');

    await prepare(`
      INSERT INTO bil_slettinger (bil_id, reg, merke, modell, status, slettet_av_id, slettet_av_navn, slettet_av_rolle, slettet_at)
      VALUES (@bilId, @reg, @merke, @modell, @status, @slettetAvId, @slettetAvNavn, @slettetAvRolle, datetime('now'))
    `).run({
      bilId: id,
      reg: row.reg || '',
      merke: row.merke || '',
      modell: row.modell || '',
      status: row.status || '',
      slettetAvId: req.user?.sub || null,
      slettetAvNavn: ansvarlig || req.user?.username || 'Ukjent',
      slettetAvRolle: slettetAvRolle
    });

    await cleanupRemovedUploadFiles(parseJson(row.dokumenter, []), []);
    try {
      await prepare('DELETE FROM bil_kunder WHERE bil_id = ?').run(id);
    } catch (_err) {
      /* bil_kunder finnes kun i Postgres/Supabase-oppsett */
    }
    await prepare('DELETE FROM biler WHERE id = ?').run(id);

    res.json({ ok: true, id: id, reg: row.reg });
  } catch (err) {
    console.error('DELETE /api/biler/:id feilet:', err.message);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke slette bil.' });
  }
});

app.post('/api/biler/:id/dokumenter', requireAuth, function (req, res, next) {
  upload.array('filer', 12)(req, res, function (err) {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || 'Opplasting feilet.' });
    }
    next();
  });
}, async function (req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'Ugyldig id.' });

  const row = await prepare('SELECT * FROM biler WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Bilen finnes ikke.' });

  try {
    const persisted = await persistMulterFiles(req.files);
    const incoming = mapUploadedFiles(persisted, req.user);
    if (!incoming.length) {
      return res.status(400).json({ ok: false, error: 'Ingen filer mottatt.' });
    }
    const dokumenter = [...parseJson(row.dokumenter, []), ...incoming];
    const ansvarlig = await getAnsvarligNavn(req);
    await prepare(`
      UPDATE biler SET
        dokumenter = @dokumenter,
        ansvarlig = CASE WHEN @ansvarlig != '' THEN @ansvarlig ELSE ansvarlig END,
        updated_at = datetime('now')
      WHERE id = @id
    `).run({
      id: id,
      dokumenter: JSON.stringify(dokumenter),
      ansvarlig: ansvarlig || ''
    });
    const [updatedRow, kundeMap] = await Promise.all([
      prepare('SELECT * FROM biler WHERE id = ?').get(id),
      getAllBilKundeIdsMap()
    ]);
    res.json({ ok: true, item: await mapBilForApi(updatedRow, kundeMap[id] || []) });
  } catch (err) {
    console.error('POST /api/biler/:id/dokumenter feilet:', err.message);
    res.status(500).json({ ok: false, error: err.message || 'Kunne ikke laste opp filer.' });
  }
});

function bilNeedsEuKontrollSync(row, iso, force) {
  if (!iso) return false;
  if (force) return toIsoDateFromNorwegian(row.eu_kontroll) !== iso;
  if (!row.eu_kontroll) return true;
  return !toIsoDateFromNorwegian(row.eu_kontroll);
}

app.post('/api/biler/sync-eu-kontroll', requireAuth, async function (req, res) {
  const force = !!req.body?.force;
  const onlyMissing = req.body?.onlyMissing !== false && !force;
  const apiKey = process.env.VEGVESEN_API_KEY || '';

  const rows = await prepare(`
    SELECT id, reg, eu_kontroll, svv_data
    FROM biler
    WHERE reg IS NOT NULL AND TRIM(reg) != ''
    ORDER BY id ASC
  `).all();

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const row of rows) {
    const reg = String(row.reg || '').trim().toUpperCase().replace(/\s/g, '');
    if (reg.length < 5) {
      skipped++;
      continue;
    }

    try {
      let iso = nesteEuKontrollIso(resolveVehicleFromStoredSvvData(parseJson(row.svv_data, null)));

      if (!iso) {
        const result = await lookupVehicleFull(reg, apiKey);
        iso = nesteEuKontrollIso(result.parsed);
        await new Promise(function (resolve) { setTimeout(resolve, 120); });
      }

      if (!iso) {
        skipped++;
        continue;
      }

      if (onlyMissing && row.eu_kontroll) {
        const currentIso = toIsoDateFromNorwegian(row.eu_kontroll);
        if (currentIso && /^\d{4}-\d{2}-\d{2}$/.test(currentIso)) {
          skipped++;
          continue;
        }
      }

      if (!bilNeedsEuKontrollSync(row, iso, force)) {
        skipped++;
        continue;
      }

      await prepare(`
        UPDATE biler SET
          eu_kontroll = @eu_kontroll,
          updated_at = datetime('now')
        WHERE id = @id
      `).run({
        id: row.id,
        eu_kontroll: iso
      });
      updated++;
    } catch (err) {
      failed++;
      if (errors.length < 8) {
        errors.push({ reg: row.reg, error: err.message || 'Oppslag feilet.' });
      }
    }
  }

  const [freshRows, kundeMap] = await Promise.all([
    prepare('SELECT * FROM biler ORDER BY sort_order ASC, id ASC').all(),
    getAllBilKundeIdsMap()
  ]);

  res.json({
    ok: true,
    updated: updated,
    skipped: skipped,
    failed: failed,
    errors: errors,
    items: await mapBilerForApi(freshRows, kundeMap)
  });
});

// ─── Kalender ───
app.get('/api/kalender', requireAuth, async function (_req, res) {
  const rows = await prepare('SELECT * FROM kalender ORDER BY dato ASC, tid ASC').all();
  res.json({ ok: true, items: rows.map(mapKal) });
});

app.post('/api/kalender', requireAuth, async function (req, res) {
  const b = req.body || {};
  if (!b.tittel || !b.dato) {
    return res.status(400).json({ ok: false, error: 'Tittel og dato er påkrevd.' });
  }

  const info = await prepare(`
    INSERT INTO kalender (tittel, type, dato, tid, tid_slutt, ansvarlig, bil_ref, notat, kunde_id)
    VALUES (@tittel, @type, @dato, @tid, @tid_slutt, @ansvarlig, @bil_ref, @notat, @kunde_id)
  `).run({
    tittel: b.tittel,
    type: b.type || 'Annet',
    dato: b.dato,
    tid: b.tid || '10:00',
    tid_slutt: b.tidSlutt || '',
    ansvarlig: b.ansvarlig || '',
    bil_ref: b.bilRef || '',
    notat: b.notat || '',
    kunde_id: b.kundeId || null
  });

  res.status(201).json({ ok: true, item: mapKal(await prepare('SELECT * FROM kalender WHERE id = ?').get(info.lastInsertRowid)) });
});

app.patch('/api/kalender/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM kalender WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });

  const b = req.body || {};
  if (b.tittel != null && !String(b.tittel).trim()) {
    return res.status(400).json({ ok: false, error: 'Tittel kan ikke være tom.' });
  }

  if (b.kundeId !== undefined) {
    await prepare('UPDATE kalender SET kunde_id = ? WHERE id = ?').run(b.kundeId || null, id);
  }

  const ansvarlig = await resolveModulAnsvarlig(req, b);

  await prepare(`
    UPDATE kalender SET
      tittel = COALESCE(@tittel, tittel),
      type = COALESCE(@type, type),
      dato = COALESCE(@dato, dato),
      tid = COALESCE(@tid, tid),
      tid_slutt = COALESCE(@tid_slutt, tid_slutt),
      ansvarlig = COALESCE(@ansvarlig, ansvarlig),
      bil_ref = COALESCE(@bil_ref, bil_ref),
      notat = COALESCE(@notat, notat)
    WHERE id = @id
  `).run({
    id,
    tittel: b.tittel ?? null,
    type: b.type ?? null,
    dato: b.dato ?? null,
    tid: b.tid ?? null,
    tid_slutt: b.tidSlutt ?? null,
    ansvarlig,
    bil_ref: b.bilRef ?? null,
    notat: b.notat ?? null
  });

  res.json({ ok: true, item: mapKal(await prepare('SELECT * FROM kalender WHERE id = ?').get(id)) });
});

app.delete('/api/kalender/:id', requireAuth, async function (req, res) {
  const id = Number(req.params.id);
  const row = await prepare('SELECT * FROM kalender WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Ikke funnet.' });
  await prepare('DELETE FROM kalender WHERE id = ?').run(id);
  res.json({ ok: true, id });
});

// ─── Innkjøpskalkyle ───
function normalizeKalkyleBody(b) {
  const body = b && typeof b === 'object' ? b : {};
  let autosysData = body.autosysData;
  if (autosysData != null && typeof autosysData !== 'object') {
    try {
      autosysData = JSON.parse(String(autosysData));
    } catch {
      autosysData = null;
    }
  }
  const row = {
    auksjon: String(body.auksjon || '').trim(),
    auksjonsslutt: body.auksjonsslutt || null,
    partinummer: String(body.partinummer || '').trim(),
    regnr: String(body.regnr || '').trim().toUpperCase(),
    kmstand: Math.max(0, Number(body.kmstand) || 0),
    modell: String(body.modell || '').trim(),
    utstyrsnivaa: String(body.utstyrsniva || body.utstyrsnivaa || '').trim(),
    utsalgspris: Math.max(0, Number(body.utsalgspris) || 0),
    pakost: Math.max(0, Number(body.pakost) || 0),
    auk_gebyr: Math.max(0, Number(body.aukGebyr) || 0),
    garantikost: Math.max(0, Number(body.garantikost) || 0),
    omreg_avgift: Math.max(0, Number(body.omregAvgift) || 0),
    avanse: Math.max(0, Number(body.avanse) || 0),
    kommentarer: String(body.kommentarer || '').trim(),
    autosys_data: autosysData ? JSON.stringify(autosysData) : null
  };
  row.innkjopspris = calcInnkjopsprisRow(row);
  return row;
}

app.get('/api/innkjopskalkyle', requireAuth, requirePermission('innkjopskalkyle'), async function (req, res) {
  const auksjon = String(req.query.auksjon || '').trim();
  let sql = `
    SELECT k.*, uc.name AS created_by_name, uu.name AS updated_by_name
    FROM innkjopskalkyle k
    LEFT JOIN users uc ON uc.id = k.created_by
    LEFT JOIN users uu ON uu.id = k.updated_by
  `;
  const params = {};
  if (auksjon) {
    sql += ' WHERE k.auksjon = @auksjon';
    params.auksjon = auksjon;
  }
  sql += ' ORDER BY COALESCE(k.auksjonsslutt, k.created_at) DESC, k.id DESC';
  const rows = await prepare(sql).all(params);
  res.json({ ok: true, items: rows.map(mapInnkjopskalkyle) });
});

app.post('/api/innkjopskalkyle', requireAuth, requirePermission('innkjopskalkyle'), async function (req, res) {
  const row = normalizeKalkyleBody(req.body);
  if (!row.auksjon) {
    return res.status(400).json({ ok: false, error: 'Auksjonsplattform er påkrevd.' });
  }

  const info = await prepare(`
    INSERT INTO innkjopskalkyle (
      auksjon, auksjonsslutt, partinummer, regnr, kmstand, modell, utstyrsnivaa,
      utsalgspris, pakost, auk_gebyr, garantikost, omreg_avgift, avanse, innkjopspris,
      kommentarer, autosys_data, created_by
    ) VALUES (
      @auksjon, @auksjonsslutt, @partinummer, @regnr, @kmstand, @modell, @utstyrsnivaa,
      @utsalgspris, @pakost, @auk_gebyr, @garantikost, @omreg_avgift, @avanse, @innkjopspris,
      @kommentarer, @autosys_data, @created_by
    )
  `).run({
    ...row,
    created_by: req.user?.sub || null
  });

  const fresh = await prepare(`
    SELECT k.*, uc.name AS created_by_name, uu.name AS updated_by_name
    FROM innkjopskalkyle k
    LEFT JOIN users uc ON uc.id = k.created_by
    LEFT JOIN users uu ON uu.id = k.updated_by
    WHERE k.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json({ ok: true, item: mapInnkjopskalkyle(fresh) });
});

app.patch('/api/innkjopskalkyle/:id', requireAuth, requirePermission('innkjopskalkyle'), async function (req, res) {
  const id = Number(req.params.id);
  const existing = await prepare('SELECT * FROM innkjopskalkyle WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Kalkyle ikke funnet.' });

  const patch = normalizeKalkyleBody({ ...mapInnkjopskalkyle(existing), ...(req.body || {}) });
  if (!patch.auksjon) {
    return res.status(400).json({ ok: false, error: 'Auksjonsplattform er påkrevd.' });
  }

  await prepare(`
    UPDATE innkjopskalkyle SET
      auksjon = @auksjon,
      auksjonsslutt = @auksjonsslutt,
      partinummer = @partinummer,
      regnr = @regnr,
      kmstand = @kmstand,
      modell = @modell,
      utstyrsnivaa = @utstyrsnivaa,
      utsalgspris = @utsalgspris,
      pakost = @pakost,
      auk_gebyr = @auk_gebyr,
      garantikost = @garantikost,
      omreg_avgift = @omreg_avgift,
      avanse = @avanse,
      innkjopspris = @innkjopspris,
      kommentarer = @kommentarer,
      autosys_data = @autosys_data,
      updated_by = @updated_by,
      updated_at = ${isPostgres ? 'NOW()' : "datetime('now')"}
    WHERE id = @id
  `).run({ ...patch, id, updated_by: req.user?.sub || null });

  const fresh = await prepare(`
    SELECT k.*, uc.name AS created_by_name, uu.name AS updated_by_name
    FROM innkjopskalkyle k
    LEFT JOIN users uc ON uc.id = k.created_by
    LEFT JOIN users uu ON uu.id = k.updated_by
    WHERE k.id = ?
  `).get(id);

  res.json({ ok: true, item: mapInnkjopskalkyle(fresh) });
});

app.delete('/api/innkjopskalkyle/:id', requireAuth, requirePermission('innkjopskalkyle'), async function (req, res) {
  const id = Number(req.params.id);
  const existing = await prepare('SELECT id FROM innkjopskalkyle WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Kalkyle ikke funnet.' });
  await prepare('DELETE FROM innkjopskalkyle WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ─── Timeregistrering ───
app.get('/api/timeregistrering', requireAuth, requirePermission('timeregistrering'), async function (req, res) {
  const userId = resolveTimeregUserId(req, req.query.userId);
  const fra = String(req.query.fra || weekStartIso(nowOsloDate())).slice(0, 10);
  const til = String(req.query.til || addDaysIso(fra, 6)).slice(0, 10);
  const rows = await prepare(`
    SELECT * FROM timeregistrering
    WHERE user_id = ? AND dato >= ? AND dato <= ?
    ORDER BY dato DESC, start_tid DESC, id DESC
  `).all(userId, fra, til);
  res.json({ ok: true, items: rows.map(function (row) { return mapTimeregLive(row, req.user); }).filter(Boolean), fra, til, userId });
});

app.get('/api/timeregistrering/aktiv', requireAuth, requirePermission('timeregistrering'), async function (req, res) {
  const userId = resolveTimeregUserId(req, req.query.userId);
  const row = await prepare(`
    SELECT * FROM timeregistrering
    WHERE user_id = ? AND status IN ('aktiv', 'pause')
    ORDER BY id DESC
    LIMIT 1
  `).get(userId);
  res.json({ ok: true, item: row ? mapTimeregLive(row, req.user) : null });
});

app.get('/api/timeregistrering/oppsummering', requireAuth, requirePermission('timeregistrering'), async function (req, res) {
  const userId = resolveTimeregUserId(req, req.query.userId);
  const fra = String(req.query.fra || weekStartIso(nowOsloDate())).slice(0, 10);
  const til = String(req.query.til || addDaysIso(fra, 6)).slice(0, 10);
  const rows = await prepare(`
    SELECT * FROM timeregistrering
    WHERE user_id = ? AND dato >= ? AND dato <= ?
    ORDER BY dato ASC, start_tid ASC
  `).all(userId, fra, til);

  let nettoMin = 0;
  let pauseMin = 0;
  let lonnKr = 0;
  let dager = 0;
  const perDag = {};

  rows.forEach(function (row) {
    const item = mapTimeregLive(row, req.user);
    if (!item || item.status === 'aktiv' || item.status === 'pause') return;
    nettoMin += item.stats.nettoMin;
    pauseMin += item.stats.pauseMin;
    lonnKr += item.stats.lonnKr;
    dager += 1;
    perDag[item.dato] = (perDag[item.dato] || 0) + item.stats.nettoMin;
  });

  res.json({
    ok: true,
    fra,
    til,
    userId,
    oppsummering: {
      dager,
      nettoMin,
      pauseMin,
      timer: Math.round((nettoMin / 60) * 100) / 100,
      lonnKr
    },
    perDag
  });
});

app.post('/api/timeregistrering/stemple-in', requireAuth, requirePermission('timeregistrering'), async function (_req, res) {
  return res.status(410).json({ ok: false, error: 'Stempling er deaktivert. Bruk manuell registrering.' });
});

app.post('/api/timeregistrering/stemple-ut', requireAuth, requirePermission('timeregistrering'), async function (_req, res) {
  return res.status(410).json({ ok: false, error: 'Stempling er deaktivert. Bruk manuell registrering.' });
});

app.post('/api/timeregistrering/pause/start', requireAuth, requirePermission('timeregistrering'), async function (_req, res) {
  return res.status(410).json({ ok: false, error: 'Stempling er deaktivert. Registrer pauser manuelt.' });
});

app.post('/api/timeregistrering/pause/slutt', requireAuth, requirePermission('timeregistrering'), async function (_req, res) {
  return res.status(410).json({ ok: false, error: 'Stempling er deaktivert. Registrer pauser manuelt.' });
});

app.post('/api/timeregistrering', requireAuth, requirePermission('timeregistrering'), async function (req, res) {
  const body = req.body || {};
  const userId = body.userId && canViewAllTimereg(req.user) ? Number(body.userId) : Number(req.user.sub);
  const user = await getUserById(userId);
  if (!user) return res.status(400).json({ ok: false, error: 'Bruker ikke funnet.' });

  const dato = String(body.dato || '').slice(0, 10);
  const startTid = String(body.startTid || body.start_tid || '').slice(0, 5);
  const sluttTid = String(body.sluttTid || body.slutt_tid || '').slice(0, 5);
  if (!dato || !startTid || !sluttTid) {
    return res.status(400).json({ ok: false, error: 'Dato, start og slutt er påkrevd.' });
  }

  const pauser = parsePauser(body.pauser);
  const timelonn = body.timelonn != null
    ? Math.max(0, Math.round(Number(body.timelonn) || 0))
    : Math.max(0, Math.round(Number(user.timelonn) || 0));

  const info = await prepare(`
    INSERT INTO timeregistrering (user_id, bruker_navn, dato, status, start_tid, slutt_tid, pauser, notat, timelonn)
    VALUES (@user_id, @bruker_navn, @dato, 'fullfort', @start_tid, @slutt_tid, @pauser, @notat, @timelonn)
  `).run({
    user_id: userId,
    bruker_navn: user.name || user.username,
    dato,
    start_tid: startTid,
    slutt_tid: sluttTid,
    pauser: JSON.stringify(pauser),
    notat: String(body.notat || ''),
    timelonn
  });

  const row = await getTimeregRow(info.lastInsertRowid);
  res.status(201).json({ ok: true, item: mapTimeregLive(row, req.user) });
});

app.patch('/api/timeregistrering/:id', requireAuth, requirePermission('timeregistrering'), async function (req, res) {
  const id = Number(req.params.id);
  const row = await getTimeregRow(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Registrering ikke funnet.' });
  if (!(await assertTimeregAccess(req, row))) {
    return res.status(403).json({ ok: false, error: 'Ingen tilgang.' });
  }

  const body = req.body || {};
  const isAdmin = canViewAllTimereg(req.user);
  const kanGodkjenne = canApproveTimereg(req.user);
  const isOwner = Number(row.user_id) === Number(req.user.sub);
  const isActive = row.status === 'aktiv' || row.status === 'pause';

  if (isActive && !isAdmin && !isOwner) {
    return res.status(403).json({ ok: false, error: 'Ingen tilgang.' });
  }

  const dato = body.dato != null ? String(body.dato).slice(0, 10) : row.dato;
  const startTid = body.startTid != null ? String(body.startTid).slice(0, 5) : (body.start_tid != null ? String(body.start_tid).slice(0, 5) : row.start_tid);
  let sluttTid = body.sluttTid != null ? String(body.sluttTid).slice(0, 5) : (body.slutt_tid != null ? String(body.slutt_tid).slice(0, 5) : row.slutt_tid);
  let pauser = body.pauser != null ? parsePauser(body.pauser) : parsePauser(row.pauser);
  const notat = body.notat != null ? String(body.notat) : row.notat;
  let status = row.status;
  if (body.status != null) {
    const nextStatus = String(body.status);
    if (nextStatus === 'godkjent' || row.status === 'godkjent') {
      if (!kanGodkjenne) {
        return res.status(403).json({ ok: false, error: 'Kun admin kan godkjenne timer.' });
      }
      if (row.status !== 'fullfort' && row.status !== 'godkjent') {
        return res.status(400).json({ ok: false, error: 'Kun fullførte registreringer kan godkjennes.' });
      }
      status = nextStatus === 'godkjent' ? 'godkjent' : 'fullfort';
    } else if (isAdmin) {
      status = nextStatus;
    }
  }
  if (isActive && sluttTid) {
    status = 'fullfort';
    pauser = pauser.map(function (p) {
      if (p.start && !p.slutt) return { ...p, slutt: sluttTid };
      return p;
    });
  } else if (isActive && body.pauser != null) {
    const hasOpenPause = pauser.some(function (p) { return p.start && !p.slutt; });
    status = hasOpenPause ? 'pause' : 'aktiv';
  }
  const timelonn = body.timelonn != null
    ? Math.max(0, Math.round(Number(body.timelonn) || 0))
    : Number(row.timelonn) || 0;

  await prepare(`
    UPDATE timeregistrering SET
      dato = @dato,
      start_tid = @start_tid,
      slutt_tid = @slutt_tid,
      pauser = @pauser,
      notat = @notat,
      status = @status,
      timelonn = @timelonn,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    dato,
    start_tid: startTid,
    slutt_tid: sluttTid,
    pauser: JSON.stringify(pauser),
    notat,
    status,
    timelonn
  });

  const fresh = await getTimeregRow(id);
  res.json({ ok: true, item: mapTimeregLive(fresh, req.user) });
});

app.delete('/api/timeregistrering/:id', requireAuth, requirePermission('timeregistrering'), async function (req, res) {
  const id = Number(req.params.id);
  const row = await getTimeregRow(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Registrering ikke funnet.' });
  if (!(await assertTimeregAccess(req, row))) {
    return res.status(403).json({ ok: false, error: 'Ingen tilgang.' });
  }
  if ((row.status === 'aktiv' || row.status === 'pause') && Number(row.user_id) !== Number(req.user.sub)) {
    return res.status(400).json({ ok: false, error: 'Kan ikke slette aktiv registrering for annen bruker.' });
  }
  await prepare('DELETE FROM timeregistrering WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ─── Kunder ───
app.get('/api/kunder', requireAuth, async function (req, res) {
  const search = req.query.q || req.query.search || '';
  res.json({ ok: true, items: await getKunder(search) });
});

app.get('/api/kunder/:id', requireAuth, async function (req, res) {
  const item = await getKundeById(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Kunde ikke funnet.' });
  res.json({ ok: true, item });
});

app.get('/api/kunder/:id/aktivitet', requireAuth, async function (req, res) {
  const item = await getKundeById(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: 'Kunde ikke funnet.' });
  res.json({ ok: true, aktivitet: await getKundeAktivitet(req.params.id) });
});

app.post('/api/kunder', requireAuth, async function (req, res) {
  try {
    const item = await createKunde(req.body || {});
    res.status(201).json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke opprette kunde.' });
  }
});

app.patch('/api/kunder/:id', requireAuth, async function (req, res) {
  try {
    const item = await updateKunde(req.params.id, req.body || {});
    if (!item) return res.status(404).json({ ok: false, error: 'Kunde ikke funnet.' });
    res.json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke oppdatere kunde.' });
  }
});

app.delete('/api/kunder/:id', requireAuth, async function (req, res) {
  try {
    const ok = await deleteKunde(req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: 'Kunde ikke funnet.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Kunne ikke slette kunde.' });
  }
});

// ─── Innstillinger ───
app.get('/api/lister', requireAuth, async function (_req, res) {
  res.json({ ok: true, lists: await getLister() });
});

app.get('/api/vedlikehold', requireAuth, async function (_req, res) {
  res.json({ ok: true, vedlikeholdModus: await getVedlikeholdModus() });
});

app.get('/api/innstillinger', requireAuth, requirePermission('innstillinger'), async function (_req, res) {
  res.json({ ok: true, settings: await getInnstillinger() });
});

app.patch('/api/innstillinger', requireAuth, requirePermission('innstillinger'), async function (req, res) {
  const body = req.body || {};
  const settings = await saveInnstillinger(body);
  let biler = null;
  if (body.bilSjekklister && typeof body.bilSjekklister === 'object') {
    biler = await syncAllBilerSjekklisterFromMal(settings.bilSjekklister);
  }
  res.json({ ok: true, settings, biler });
});

app.get('/api/kjoretoy', requireAuth, async function (req, res) {
  const regnr = req.query.regnr || req.query.reg;
  const understellsnummer = req.query.understellsnummer || req.query.chassis || req.query.vin;
  const apiKey = process.env.VEGVESEN_API_KEY || '';

  try {
    let result;
    if (understellsnummer) {
      result = await lookupVehicleFullByUnderstell(understellsnummer, apiKey);
    } else if (regnr) {
      result = await lookupVehicleFull(regnr, apiKey);
    } else {
      return res.status(400).json({ ok: false, error: 'Registreringsnummer eller understellsnummer mangler.' });
    }
    res.json({ ok: true, vehicle: result.parsed, raw: result.raw, sections: result.sections });
  } catch (err) {
    const statusMap = {
      MISSING_API_KEY: 400,
      INVALID_REGNR: 400,
      INVALID_UNDERSTELL: 400,
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      UPSTREAM_ERROR: 502
    };
    res.status(statusMap[err.code] || 502).json({
      ok: false,
      error: err.message,
      code: err.code || 'UPSTREAM_ERROR'
    });
  }
});

app.post('/api/kjoretoy/scan-chassis', requireAuth, upload.single('image'), async function (req, res) {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'Bilde mangler.' });
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return res.status(501).json({
      ok: false,
      error: 'AI-visjon er ikke konfigurert på serveren.',
      code: 'NO_VISION'
    });
  }

  try {
    const buffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!buffer) {
      return res.status(400).json({ ok: false, error: 'Kunne ikke lese bildefil.' });
    }
    const result = await readChassisWithOpenAI(buffer, req.file.mimetype || 'image/jpeg', apiKey);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err.message || 'Vision-OCR feilet.',
      code: err.code || 'VISION_ERROR'
    });
  }
});

app.get('/api/omregistreringsavgift', requireAuth, async function (req, res) {
  const regnr = req.query.regnr || req.query.reg;
  if (!regnr) return res.status(400).json({ ok: false, error: 'Registreringsnummer mangler.' });

  if (!isOmregConfigured()) {
    return res.status(400).json({
      ok: false,
      error: 'Skatteetaten omregistreringsavgift er ikke konfigurert.',
      code: 'MISSING_CONFIG'
    });
  }

  try {
    const result = await lookupOmregistreringsavgift(regnr, {
      omregistreringsdato: req.query.dato || req.query.omregistreringsdato
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    const statusMap = {
      MISSING_CONFIG: 400,
      INVALID_REGNR: 400,
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      UPSTREAM_ERROR: 502
    };
    res.status(statusMap[err.code] || 502).json({
      ok: false,
      error: err.message,
      code: err.code || 'UPSTREAM_ERROR'
    });
  }
});

app.get('/api/cron/mail-sync', runMailSyncCron);
app.post('/api/cron/mail-sync', runMailSyncCron);

app.get('/uploads/:filename', async function (req, res) {
  const uploadPath = toUploadPath(req.params.filename);
  try {
    const file = await openUpload(uploadPath);
    if (!file) return res.status(404).end();
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    file.stream.pipe(res);
  } catch (err) {
    console.error('[uploads]', uploadPath, err.message);
    res.status(500).end();
  }
});

if (!isVercel && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', function (req, res, next) {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use('/api', function (req, res) {
  res.status(404).json({
    ok: false,
    error: `Endepunkt ikke funnet: ${req.method} ${req.originalUrl}. Restart admin-serveren hvis du nettopp har oppdatert.`
  });
});

app.use(function (err, req, res, next) {
  if (!err) return next();
  console.error('[api]', req.method, req.path, err.message || err);
  if (res.headersSent) return next(err);
  const status = isTransientDbError(err) ? 503 : 500;
  res.status(status).json({
    ok: false,
    error: status === 503
      ? 'Database utilgjengelig midlertidig. Prøv igjen om litt.'
      : (err.message || 'Intern serverfeil')
  });
});

dbReady.catch(function (err) {
  console.warn('Database-init avsluttet med feil:', err.message);
});

module.exports = app;

function startLocalServer() {
  httpServer = app.listen(PORT, function () {
    console.log('X Bilsenter Admin API: http://localhost:' + PORT);
    if (isPostgres) {
      console.log('Database: Supabase PostgreSQL');
    } else {
      console.log('Database: SQLite (server/data/xbilsenter.db)');
    }
    if (isRemoteStorageEnabled()) {
      ensureBucket()
        .then(function () {
          console.log('Storage: Supabase bucket "' + (process.env.SUPABASE_STORAGE_BUCKET || 'uploads') + '"');
        })
        .catch(function (err) {
          console.warn('Storage-init feilet:', err.message);
        });
    } else {
      console.log('Storage: Lokal mappe (server/data/uploads)');
    }
    if (fs.existsSync(clientDist)) {
      console.log('Admin panel: http://localhost:' + PORT);
    } else {
      console.log('Admin panel: kjør "npm run dev" i client/ (http://localhost:5173)');
    }
    if (!INGEST_SECRET) {
      console.warn('Advarsel: INGEST_SECRET er ikke satt – ingest-endepunkter er deaktivert.');
    }
    startBackgroundMailSync();
  });

  dbReady.then(async function () {
    console.log('[db] Database-init fullført.');
    try {
      const settings = await getInnstillinger();
      await syncAllBilerSjekklisterFromMal(settings.bilSjekklister || {});
      console.log('[db] Sjekklister synkronisert mot innstillinger.');
    } catch (err) {
      console.warn('[db] Sjekkliste-sync ved oppstart feilet:', err.message);
    }
  }).catch(function () {
    /* allerede logget */
  });
}

if (require.main === module) {
  startLocalServer();
}
